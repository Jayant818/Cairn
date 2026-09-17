use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    burn, mint_to, transfer_checked, Burn, Mint, MintTo, TokenAccount, TokenInterface,
    TransferChecked,
};

pub mod errors;
pub mod math;
pub mod state;

use errors::StockPumpError;
use math::{apply_fee, payout_for_redeem, shares_for_deposit};
use state::{Sleeve, Vault, DEAD_SHARES, N_SLEEVES};

declare_id!("5RaETrSZ72bt6ym5im8ioHLoHKRP39PKzELcFJY9JgXY");

#[program]
pub mod stockpump {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, fee_bps: u16) -> Result<()> {
        // The product claim IS the fee. At fee_bps = 0 both ratio gains are exactly 1.0, so
        // held-per-share stops rising while every line of code still runs and every test that
        // checks "does not fall" still passes. This is the only require! the design needs, and
        // it guards a PARAMETER rather than a state transition — it cannot walk into a wall.
        require!(fee_bps > 0, StockPumpError::ZeroFee);
        require!((fee_bps as u128) < math::BPS_DENOM, StockPumpError::FeeTooLarge);
        reject_closable_mint(&ctx.accounts.sleeve0_mint)?;
        reject_closable_mint(&ctx.accounts.sleeve1_mint)?;

        let v = &mut ctx.accounts.vault;
        v.authority = ctx.accounts.authority.key();
        v.share_mint = ctx.accounts.share_mint.key();
        v.fee_bps = fee_bps;
        v.sleeves = [
            Sleeve { mint: ctx.accounts.sleeve0_mint.key(), held: 0 },
            Sleeve { mint: ctx.accounts.sleeve1_mint.key(), held: 0 },
        ];
        v.bootstrapped = false;
        v.bump = ctx.bumps.vault;
        Ok(())
    }

    /// Dead first deposit. Mints DEAD_SHARES to a vault-owned account nobody can redeem,
    /// so supply is never zero when a real depositor arrives.
    pub fn bootstrap(ctx: Context<Bootstrap>, amounts: [u64; N_SLEEVES]) -> Result<()> {
        require!(!ctx.accounts.vault.bootstrapped, StockPumpError::AlreadyBootstrapped);

        let r0 = transfer_in_measured(
            &ctx.accounts.token_program_0, &ctx.accounts.sleeve0_mint,
            &ctx.accounts.user_ata0, &mut ctx.accounts.vault_ata0,
            &ctx.accounts.depositor, amounts[0])?;
        let r1 = transfer_in_measured(
            &ctx.accounts.token_program_1, &ctx.accounts.sleeve1_mint,
            &ctx.accounts.user_ata1, &mut ctx.accounts.vault_ata1,
            &ctx.accounts.depositor, amounts[1])?;
        require!(r0 > 0 && r1 > 0, StockPumpError::EmptySleeve);

        let v = &mut ctx.accounts.vault;
        v.sleeves[0].held = r0;
        v.sleeves[1].held = r1;
        v.bootstrapped = true;

        let bump = v.bump;
        let sleeve0 = ctx.accounts.sleeve0_mint.key();
        let seeds: &[&[u8]] = &[Vault::SEED, sleeve0.as_ref(), &[bump]];
        mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.share_token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.share_mint.to_account_info(),
                    to: ctx.accounts.dead_share_ata.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                &[seeds],
            ),
            DEAD_SHARES,
        )?;
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amounts: [u64; N_SLEEVES]) -> Result<()> {
        require!(ctx.accounts.vault.bootstrapped, StockPumpError::NotBootstrapped);
        let fee_bps = ctx.accounts.vault.fee_bps;
        let held = ctx.accounts.vault.held();
        let supply = ctx.accounts.share_mint.supply;

        // Move the tokens in FIRST, measuring what actually arrived.
        let r0 = transfer_in_measured(
            &ctx.accounts.token_program_0, &ctx.accounts.sleeve0_mint,
            &ctx.accounts.user_ata0, &mut ctx.accounts.vault_ata0,
            &ctx.accounts.depositor, amounts[0])?;
        let r1 = transfer_in_measured(
            &ctx.accounts.token_program_1, &ctx.accounts.sleeve1_mint,
            &ctx.accounts.user_ata1, &mut ctx.accounts.vault_ata1,
            &ctx.accounts.depositor, amounts[1])?;
        // Inline, not borrowed from a guard in another function. Bootstrap and this path
        // both need it, and relying on shares_for_deposit's m==0 check to catch a zero here
        // is a dependency on a file that could change for unrelated reasons.
        require!(r0 > 0, StockPumpError::EmptySleeve);
        require!(r1 > 0, StockPumpError::EmptySleeve);

        // The WHOLE deposit enters the vault; only the fee portion is never minted against.
        let (n0, _f0) = apply_fee(r0, fee_bps)?;
        let (n1, _f1) = apply_fee(r1, fee_bps)?;
        let shares = shares_for_deposit(supply, &held, &[n0, n1])?;

        let v = &mut ctx.accounts.vault;
        v.sleeves[0].held = v.sleeves[0].held.checked_add(r0).ok_or(StockPumpError::MathOverflow)?;
        v.sleeves[1].held = v.sleeves[1].held.checked_add(r1).ok_or(StockPumpError::MathOverflow)?;

        let bump = v.bump;
        let sleeve0 = ctx.accounts.sleeve0_mint.key();
        let seeds: &[&[u8]] = &[Vault::SEED, sleeve0.as_ref(), &[bump]];
        mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.share_token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.share_mint.to_account_info(),
                    to: ctx.accounts.depositor_share_ata.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                &[seeds],
            ),
            shares,
        )?;
        emit!(Deposited { shares, received: [r0, r1] });
        Ok(())
    }

    /// `sleeve_mask` bit i = take sleeve i. A frozen or seized sleeve would otherwise revert
    /// the whole instruction and strand the UNFROZEN leg the user is entitled to — the
    /// "USDY survives if Backed pulls the plug" claim is false without this.
    /// ⚠️ Shares burn in full regardless: taking one leg is the user's choice, not a discount.
    pub fn redeem(ctx: Context<Redeem>, shares: u64, sleeve_mask: u8) -> Result<()> {
        require!(sleeve_mask & 0b11 != 0, StockPumpError::EmptyMask);
        require!(sleeve_mask & !0b11 == 0, StockPumpError::EmptyMask);
        let v_fee = ctx.accounts.vault.fee_bps;
        let held = ctx.accounts.vault.held();
        let supply = ctx.accounts.share_mint.supply;
        let out = payout_for_redeem(supply, &held, shares, v_fee)?;

        burn(
            CpiContext::new(
                ctx.accounts.share_token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.share_mint.to_account_info(),
                    from: ctx.accounts.redeemer_share_ata.to_account_info(),
                    authority: ctx.accounts.redeemer.to_account_info(),
                },
            ),
            shares,
        )?;

        let bump = ctx.accounts.vault.bump;
        let sleeve0 = ctx.accounts.sleeve0_mint.key();
        let seeds: &[&[u8]] = &[Vault::SEED, sleeve0.as_ref(), &[bump]];
        if sleeve_mask & 0b01 != 0 {
            transfer_out(&ctx.accounts.token_program_0, &ctx.accounts.sleeve0_mint,
                &ctx.accounts.vault_ata0, &ctx.accounts.user_ata0,
                &ctx.accounts.vault, seeds, out[0])?;
            let v = &mut ctx.accounts.vault;
            v.sleeves[0].held = v.sleeves[0].held.checked_sub(out[0]).ok_or(StockPumpError::MathOverflow)?;
        }
        if sleeve_mask & 0b10 != 0 {
            transfer_out(&ctx.accounts.token_program_1, &ctx.accounts.sleeve1_mint,
                &ctx.accounts.vault_ata1, &ctx.accounts.user_ata1,
                &ctx.accounts.vault, seeds, out[1])?;
            let v = &mut ctx.accounts.vault;
            v.sleeves[1].held = v.sleeves[1].held.checked_sub(out[1]).ok_or(StockPumpError::MathOverflow)?;
        }
        emit!(Redeemed { shares, paid: out.clone(), mask: sleeve_mask });
        Ok(())
    }

    /// DOWNWARD ONLY. If Backed's permanent delegate seizes from the vault ATA, internal
    /// `held` is stale-high and every redeem reverts. This lets the authority mark the loss
    /// down to reality. It can NEVER mark up — an upward reconcile would reopen the donation
    /// vector that internal accounting exists to close.
    pub fn reconcile(ctx: Context<Reconcile>, idx: u8) -> Result<()> {
        let i = idx as usize;
        require!(i < N_SLEEVES, StockPumpError::SleeveMismatch);
        let actual = ctx.accounts.vault_ata.amount;
        let v = &mut ctx.accounts.vault;
        require!(ctx.accounts.vault_ata.mint == v.sleeves[i].mint, StockPumpError::SleeveMismatch);
        require!(actual < v.sleeves[i].held, StockPumpError::ReconcileNotDownward);
        v.sleeves[i].held = actual;
        emit!(Reconciled { idx, new_held: actual });
        Ok(())
    }
}

/// A mint carrying MintCloseAuthority can be closed and RECREATED AT THE SAME ADDRESS with
/// different extensions or decimals. The vault stores a sleeve as an address, so a reinit
/// silently rewrites the rules while every account constraint still passes — token accounts
/// opened under the old mint keep working under the new one.
/// ⚠️ This is necessary and NOT sufficient: it proves the mint cannot be closed FROM NOW ON.
/// It cannot prove the mint was never already closed and reinitialised before we saw it.
/// That question needs history, which a program cannot read.
fn reject_closable_mint(mint: &InterfaceAccount<Mint>) -> Result<()> {
    use anchor_spl::token_interface::spl_token_2022::extension::{
        BaseStateWithExtensions, StateWithExtensions, mint_close_authority::MintCloseAuthority,
    };
    let info = mint.to_account_info();
    let data = info.try_borrow_data()?;
    // A classic 82-byte SPL mint has no extension area at all, so it cannot be closed.
    if data.len() <= 82 {
        return Ok(());
    }
    let state = StateWithExtensions::<anchor_spl::token_interface::spl_token_2022::state::Mint>::unpack(&data)
        .map_err(|_| error!(StockPumpError::SleeveMismatch))?;
    if state.get_extension::<MintCloseAuthority>().is_ok() {
        return Err(error!(StockPumpError::MintIsClosable));
    }
    Ok(())
}

/// Reads the vault ATA before and after its OWN transfer and returns the delta.
/// ⛔ `reload()` is load-bearing: `ctx.accounts.*` is a snapshot deserialized at instruction
/// entry, and a CPI mutates the ACCOUNT, not the struct. Without it before == after, the
/// delta is 0, and every deposit reverts with DepositTooSmall.
fn transfer_in_measured<'info>(
    token_program: &Interface<'info, TokenInterface>,
    mint: &InterfaceAccount<'info, Mint>,
    from: &InterfaceAccount<'info, TokenAccount>,
    to: &mut InterfaceAccount<'info, TokenAccount>,
    authority: &Signer<'info>,
    amount: u64,
) -> Result<u64> {
    let before = to.amount;
    transfer_checked(
        CpiContext::new(
            token_program.to_account_info(),
            TransferChecked {
                from: from.to_account_info(),
                mint: mint.to_account_info(),
                to: to.to_account_info(),
                authority: authority.to_account_info(),
            },
        ),
        amount,
        mint.decimals,
    )?;
    to.reload()?;
    to.amount.checked_sub(before).ok_or(StockPumpError::MathOverflow.into())
}

fn transfer_out<'info>(
    token_program: &Interface<'info, TokenInterface>,
    mint: &InterfaceAccount<'info, Mint>,
    from: &InterfaceAccount<'info, TokenAccount>,
    to: &InterfaceAccount<'info, TokenAccount>,
    vault: &Account<'info, Vault>,
    seeds: &[&[u8]],
    amount: u64,
) -> Result<()> {
    transfer_checked(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            TransferChecked {
                from: from.to_account_info(),
                mint: mint.to_account_info(),
                to: to.to_account_info(),
                authority: vault.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        mint.decimals,
    )
}

#[event]
pub struct Deposited { pub shares: u64, pub received: [u64; N_SLEEVES] }
#[event]
pub struct Redeemed { pub shares: u64, pub paid: Vec<u64>, pub mask: u8 }
#[event]
pub struct Reconciled { pub idx: u8, pub new_held: u64 }

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = 8 + Vault::INIT_SPACE,
              seeds = [Vault::SEED, sleeve0_mint.key().as_ref()], bump)]
    pub vault: Account<'info, Vault>,
    /// The program creates the share mint and holds its authority. A deployer-owned share
    /// mint is an unlimited mint against everyone else's deposits.
    #[account(init, payer = authority, mint::decimals = 6, mint::authority = vault,
              mint::freeze_authority = vault, mint::token_program = token_program)]
    pub share_mint: Box<InterfaceAccount<'info, Mint>>,
    pub sleeve0_mint: Box<InterfaceAccount<'info, Mint>>,
    pub sleeve1_mint: Box<InterfaceAccount<'info, Mint>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Bootstrap<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,
    #[account(mut, seeds = [Vault::SEED, sleeve0_mint.key().as_ref()], bump = vault.bump,
              has_one = share_mint, has_one = authority)]
    pub vault: Account<'info, Vault>,
    /// MUST SIGN. Bootstrap fixes the initial held for both sleeves, and that ratio is the
    /// reference every later deposit is priced against. It is one-shot, so an ungated bootstrap
    /// lets a front-runner seed held = [1, 1] and poison the pricing basis permanently.
    /// This was an UncheckedAccount bound only by has_one, which made the vault's own authority
    /// a value anyone could quote rather than a party that had to consent.
    pub authority: Signer<'info>,
    #[account(mut)] pub share_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(constraint = sleeve0_mint.key() == vault.sleeves[0].mint @ StockPumpError::SleeveMismatch)]
    pub sleeve0_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(constraint = sleeve1_mint.key() == vault.sleeves[1].mint @ StockPumpError::SleeveMismatch)]
    pub sleeve1_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = sleeve0_mint, token::authority = vault)]
    pub vault_ata0: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = sleeve1_mint, token::authority = vault)]
    pub vault_ata1: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = sleeve0_mint, token::authority = depositor)]
    pub user_ata0: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = sleeve1_mint, token::authority = depositor)]
    pub user_ata1: Box<InterfaceAccount<'info, TokenAccount>>,
    /// Dead shares land here, owned by the vault PDA, redeemable by nobody.
    #[account(mut, token::mint = share_mint, token::authority = vault)]
    pub dead_share_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    /// Sleeve 0's token program. Constrained to the mint's OWNER, so a caller cannot
    /// route a Token-2022 mint's CPI through classic SPL or vice versa.
    #[account(constraint = token_program_0.key() == *sleeve0_mint.to_account_info().owner @ StockPumpError::SleeveMismatch)]
    pub token_program_0: Interface<'info, TokenInterface>,
    #[account(constraint = share_token_program.key() == *share_mint.to_account_info().owner @ StockPumpError::SleeveMismatch)]
    pub share_token_program: Interface<'info, TokenInterface>,
    #[account(constraint = token_program_1.key() == *sleeve1_mint.to_account_info().owner @ StockPumpError::SleeveMismatch)]
    pub token_program_1: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,
    #[account(mut, seeds = [Vault::SEED, sleeve0_mint.key().as_ref()], bump = vault.bump, has_one = share_mint)]
    pub vault: Account<'info, Vault>,
    #[account(mut)] pub share_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(constraint = sleeve0_mint.key() == vault.sleeves[0].mint @ StockPumpError::SleeveMismatch)]
    pub sleeve0_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(constraint = sleeve1_mint.key() == vault.sleeves[1].mint @ StockPumpError::SleeveMismatch)]
    pub sleeve1_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = sleeve0_mint, token::authority = vault)]
    pub vault_ata0: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = sleeve1_mint, token::authority = vault)]
    pub vault_ata1: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = sleeve0_mint, token::authority = depositor)]
    pub user_ata0: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = sleeve1_mint, token::authority = depositor)]
    pub user_ata1: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = share_mint, token::authority = depositor)]
    pub depositor_share_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    /// Sleeve 0's token program. Constrained to the mint's OWNER, so a caller cannot
    /// route a Token-2022 mint's CPI through classic SPL or vice versa.
    #[account(constraint = token_program_0.key() == *sleeve0_mint.to_account_info().owner @ StockPumpError::SleeveMismatch)]
    pub token_program_0: Interface<'info, TokenInterface>,
    #[account(constraint = share_token_program.key() == *share_mint.to_account_info().owner @ StockPumpError::SleeveMismatch)]
    pub share_token_program: Interface<'info, TokenInterface>,
    #[account(constraint = token_program_1.key() == *sleeve1_mint.to_account_info().owner @ StockPumpError::SleeveMismatch)]
    pub token_program_1: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct Redeem<'info> {
    #[account(mut)]
    pub redeemer: Signer<'info>,
    #[account(mut, seeds = [Vault::SEED, sleeve0_mint.key().as_ref()], bump = vault.bump, has_one = share_mint)]
    pub vault: Account<'info, Vault>,
    #[account(mut)] pub share_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(constraint = sleeve0_mint.key() == vault.sleeves[0].mint @ StockPumpError::SleeveMismatch)]
    pub sleeve0_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(constraint = sleeve1_mint.key() == vault.sleeves[1].mint @ StockPumpError::SleeveMismatch)]
    pub sleeve1_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = sleeve0_mint, token::authority = vault)]
    pub vault_ata0: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = sleeve1_mint, token::authority = vault)]
    pub vault_ata1: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = sleeve0_mint, token::authority = redeemer)]
    pub user_ata0: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = sleeve1_mint, token::authority = redeemer)]
    pub user_ata1: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = share_mint, token::authority = redeemer)]
    pub redeemer_share_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    /// Sleeve 0's token program. Constrained to the mint's OWNER, so a caller cannot
    /// route a Token-2022 mint's CPI through classic SPL or vice versa.
    #[account(constraint = token_program_0.key() == *sleeve0_mint.to_account_info().owner @ StockPumpError::SleeveMismatch)]
    pub token_program_0: Interface<'info, TokenInterface>,
    #[account(constraint = share_token_program.key() == *share_mint.to_account_info().owner @ StockPumpError::SleeveMismatch)]
    pub share_token_program: Interface<'info, TokenInterface>,
    #[account(constraint = token_program_1.key() == *sleeve1_mint.to_account_info().owner @ StockPumpError::SleeveMismatch)]
    pub token_program_1: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct Reconcile<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [Vault::SEED, vault.sleeves[0].mint.as_ref()], bump = vault.bump,
              has_one = authority)]
    pub vault: Account<'info, Vault>,
    #[account(token::authority = vault)]
    pub vault_ata: InterfaceAccount<'info, TokenAccount>,
}
