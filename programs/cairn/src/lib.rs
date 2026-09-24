use anchor_lang::{prelude::*, solana_program::program_option::COption};
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{
        burn, mint_to, transfer_checked, Burn, Mint, MintTo, TokenAccount, TokenInterface,
        TransferChecked,
    },
};
use pyth_solana_receiver_sdk::price_update::{PriceUpdateV2, TwapUpdate};

pub mod errors;
pub mod math;
pub mod oracle;
pub mod policy;
pub mod state;

use errors::CairnError;
use math::{
    accrue_index, assets_for_receipts, borrow_rate_bps, collateral_for_liquidation,
    debt_for_shares, managed_assets, position_is_healthy, receipt_shares_for_deposit,
    shares_for_borrow, shares_for_repayment, utilization_bps, write_off,
};
use oracle::validate_prices;
use policy::{equity_price_multiplier, validate_market_mints};
use state::{Market, MarketConfig, Position, BPS_DENOM, INDEX_SCALE};

declare_id!("EY5qnrQjqEsAQ65Nrd8Zd3DcqAmemzmgCYfiGfC15vCL");

#[program]
pub mod cairn {
    use super::*;

    pub fn initialize_market(ctx: Context<InitializeMarket>, config: MarketConfig) -> Result<()> {
        validate_config(&config)?;
        validate_market_mints(&ctx.accounts.equity_mint, &ctx.accounts.receipt_mint)?;
        require_keys_eq!(
            *ctx.accounts.collateral_mint.to_account_info().owner,
            anchor_spl::token::ID,
            CairnError::CollateralMustUseClassicToken
        );
        require!(
            ctx.accounts.receipt_mint.mint_authority == COption::Some(ctx.accounts.market.key()),
            CairnError::InvalidReceiptAuthority
        );
        require!(
            ctx.accounts.receipt_mint.supply == 0,
            CairnError::InvalidConfig
        );

        let market = &mut ctx.accounts.market;
        market.authority = ctx.accounts.authority.key();
        market.equity_mint = ctx.accounts.equity_mint.key();
        market.receipt_mint = ctx.accounts.receipt_mint.key();
        market.collateral_mint = ctx.accounts.collateral_mint.key();
        market.equity_token_program = ctx.accounts.equity_token_program.key();
        market.collateral_token_program = ctx.accounts.collateral_token_program.key();
        market.config = config;
        market.cash = 0;
        market.total_debt_shares = 0;
        market.borrow_index = INDEX_SCALE;
        market.reserves = 0;
        market.total_collateral = 0;
        market.last_accrual_timestamp = Clock::get()?.unix_timestamp;
        market.deposits_paused = false;
        market.borrows_paused = false;
        market.bump = ctx.bumps.market;
        emit!(MarketInitialized {
            market: market.key(),
            equity_mint: market.equity_mint,
            receipt_mint: market.receipt_mint,
            collateral_mint: market.collateral_mint,
        });
        Ok(())
    }

    pub fn initialize_position(ctx: Context<InitializePosition>) -> Result<()> {
        let position = &mut ctx.accounts.position;
        position.owner = ctx.accounts.owner.key();
        position.market = ctx.accounts.market.key();
        position.collateral = 0;
        position.debt_shares = 0;
        position.bump = ctx.bumps.position;
        Ok(())
    }

    pub fn deposit<'info>(
        ctx: Context<'_, '_, 'info, 'info, Deposit<'info>>,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, CairnError::ZeroAmount);
        require!(
            !ctx.accounts.market.deposits_paused,
            CairnError::DepositsPaused
        );
        // Issuer authorities can mutate some Token-2022 controls after listing.
        // Recheck before accepting new inventory, while redemptions remain open.
        validate_market_mints(&ctx.accounts.equity_mint, &ctx.accounts.receipt_mint)?;
        accrue_market(&mut ctx.accounts.market, Clock::get()?.unix_timestamp)?;

        let debt = total_debt(&ctx.accounts.market)?;
        let assets_before =
            managed_assets(ctx.accounts.market.cash, debt, ctx.accounts.market.reserves)?;
        let received = transfer_in_measured(
            &ctx.accounts.equity_token_program,
            &ctx.accounts.equity_mint,
            &ctx.accounts.depositor_equity,
            &mut ctx.accounts.equity_vault,
            &ctx.accounts.depositor,
            amount,
            ctx.remaining_accounts,
        )?;
        let next_cash = ctx
            .accounts
            .market
            .cash
            .checked_add(received)
            .ok_or(CairnError::MathOverflow)?;
        require!(
            next_cash <= ctx.accounts.market.config.deposit_cap,
            CairnError::DepositCapExceeded
        );
        let shares =
            receipt_shares_for_deposit(received, ctx.accounts.receipt_mint.supply, assets_before)?;
        ctx.accounts.market.cash = next_cash;

        let equity_mint = ctx.accounts.market.equity_mint;
        let signer_seeds: &[&[u8]] = &[
            Market::SEED,
            equity_mint.as_ref(),
            &[ctx.accounts.market.bump],
        ];
        mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.receipt_token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.receipt_mint.to_account_info(),
                    to: ctx.accounts.depositor_receipt.to_account_info(),
                    authority: ctx.accounts.market.to_account_info(),
                },
                &[signer_seeds],
            ),
            shares,
        )?;
        emit!(Deposited {
            owner: ctx.accounts.depositor.key(),
            assets: received,
            receipts: shares,
        });
        Ok(())
    }

    pub fn redeem<'info>(
        ctx: Context<'_, '_, 'info, 'info, Redeem<'info>>,
        receipt_amount: u64,
    ) -> Result<()> {
        accrue_market(&mut ctx.accounts.market, Clock::get()?.unix_timestamp)?;
        let assets = managed_assets(
            ctx.accounts.market.cash,
            total_debt(&ctx.accounts.market)?,
            ctx.accounts.market.reserves,
        )?;
        let amount = assets_for_receipts(receipt_amount, ctx.accounts.receipt_mint.supply, assets)?;
        require!(
            amount <= ctx.accounts.market.cash,
            CairnError::InsufficientLiquidity
        );

        burn(
            CpiContext::new(
                ctx.accounts.receipt_token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.receipt_mint.to_account_info(),
                    from: ctx.accounts.redeemer_receipt.to_account_info(),
                    authority: ctx.accounts.redeemer.to_account_info(),
                },
            ),
            receipt_amount,
        )?;
        let equity_mint = ctx.accounts.market.equity_mint;
        let signer_seeds: &[&[u8]] = &[
            Market::SEED,
            equity_mint.as_ref(),
            &[ctx.accounts.market.bump],
        ];
        transfer_out(
            &ctx.accounts.equity_token_program,
            &ctx.accounts.equity_mint,
            &ctx.accounts.equity_vault,
            &ctx.accounts.redeemer_equity,
            &ctx.accounts.market,
            signer_seeds,
            amount,
            ctx.remaining_accounts,
        )?;
        ctx.accounts.market.cash = ctx
            .accounts
            .market
            .cash
            .checked_sub(amount)
            .ok_or(CairnError::MathOverflow)?;
        emit!(Redeemed {
            owner: ctx.accounts.redeemer.key(),
            receipts: receipt_amount,
            assets: amount,
        });
        Ok(())
    }

    pub fn deposit_collateral<'info>(
        ctx: Context<'_, '_, 'info, 'info, DepositCollateral<'info>>,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, CairnError::ZeroAmount);
        let received = transfer_in_measured(
            &ctx.accounts.collateral_token_program,
            &ctx.accounts.collateral_mint,
            &ctx.accounts.owner_collateral,
            &mut ctx.accounts.collateral_vault,
            &ctx.accounts.owner,
            amount,
            ctx.remaining_accounts,
        )?;
        ctx.accounts.position.collateral = ctx
            .accounts
            .position
            .collateral
            .checked_add(received)
            .ok_or(CairnError::MathOverflow)?;
        ctx.accounts.market.total_collateral = ctx
            .accounts
            .market
            .total_collateral
            .checked_add(received)
            .ok_or(CairnError::MathOverflow)?;
        emit!(CollateralDeposited {
            owner: ctx.accounts.owner.key(),
            amount: received,
        });
        Ok(())
    }

    pub fn withdraw_collateral<'info>(
        ctx: Context<'_, '_, 'info, 'info, WithdrawCollateral<'info>>,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, CairnError::ZeroAmount);
        require!(
            amount <= ctx.accounts.position.collateral,
            CairnError::InvalidCollateralAmount
        );
        accrue_market(&mut ctx.accounts.market, Clock::get()?.unix_timestamp)?;
        let remaining = ctx
            .accounts
            .position
            .collateral
            .checked_sub(amount)
            .ok_or(CairnError::MathOverflow)?;
        let debt = debt_for_shares(
            ctx.accounts.position.debt_shares,
            ctx.accounts.market.borrow_index,
        )?;
        if debt > 0 {
            let prices = validate_prices(
                &Clock::get()?,
                &ctx.accounts.market.config,
                &ctx.accounts.equity_spot,
                &ctx.accounts.equity_twap,
                &ctx.accounts.collateral_spot,
                &ctx.accounts.collateral_twap,
                equity_price_multiplier(&ctx.accounts.equity_mint, Clock::get()?.unix_timestamp)?,
            )?;
            require!(
                position_is_healthy(
                    remaining,
                    debt,
                    ctx.accounts.collateral_mint.decimals,
                    ctx.accounts.equity_mint.decimals,
                    prices.collateral_price,
                    prices.equity_debt_price,
                    ctx.accounts.market.config.loan_to_value_bps,
                )?,
                CairnError::UnhealthyPosition
            );
        }
        let equity_mint = ctx.accounts.market.equity_mint;
        let signer_seeds: &[&[u8]] = &[
            Market::SEED,
            equity_mint.as_ref(),
            &[ctx.accounts.market.bump],
        ];
        transfer_out(
            &ctx.accounts.collateral_token_program,
            &ctx.accounts.collateral_mint,
            &ctx.accounts.collateral_vault,
            &ctx.accounts.owner_collateral,
            &ctx.accounts.market,
            signer_seeds,
            amount,
            ctx.remaining_accounts,
        )?;
        ctx.accounts.position.collateral = remaining;
        ctx.accounts.market.total_collateral = ctx
            .accounts
            .market
            .total_collateral
            .checked_sub(amount)
            .ok_or(CairnError::MathOverflow)?;
        emit!(CollateralWithdrawn {
            owner: ctx.accounts.owner.key(),
            amount,
        });
        Ok(())
    }

    pub fn borrow<'info>(
        ctx: Context<'_, '_, 'info, 'info, Borrow<'info>>,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, CairnError::ZeroAmount);
        require!(
            !ctx.accounts.market.borrows_paused,
            CairnError::BorrowsPaused
        );
        accrue_market(&mut ctx.accounts.market, Clock::get()?.unix_timestamp)?;
        require!(
            amount <= ctx.accounts.market.cash,
            CairnError::InsufficientLiquidity
        );

        let debt_before = total_debt(&ctx.accounts.market)?;
        let debt_after = debt_before
            .checked_add(amount)
            .ok_or(CairnError::MathOverflow)?;
        require!(
            debt_after <= ctx.accounts.market.config.borrow_cap,
            CairnError::BorrowCapExceeded
        );
        let added_shares = shares_for_borrow(amount, ctx.accounts.market.borrow_index)?;
        let position_shares = ctx
            .accounts
            .position
            .debt_shares
            .checked_add(added_shares)
            .ok_or(CairnError::MathOverflow)?;
        let position_debt = debt_for_shares(position_shares, ctx.accounts.market.borrow_index)?;
        let prices = validate_prices(
            &Clock::get()?,
            &ctx.accounts.market.config,
            &ctx.accounts.equity_spot,
            &ctx.accounts.equity_twap,
            &ctx.accounts.collateral_spot,
            &ctx.accounts.collateral_twap,
            equity_price_multiplier(&ctx.accounts.equity_mint, Clock::get()?.unix_timestamp)?,
        )?;
        require!(
            position_is_healthy(
                ctx.accounts.position.collateral,
                position_debt,
                ctx.accounts.collateral_mint.decimals,
                ctx.accounts.equity_mint.decimals,
                prices.collateral_price,
                prices.equity_debt_price,
                ctx.accounts.market.config.loan_to_value_bps,
            )?,
            CairnError::UnhealthyPosition
        );

        let equity_mint = ctx.accounts.market.equity_mint;
        let signer_seeds: &[&[u8]] = &[
            Market::SEED,
            equity_mint.as_ref(),
            &[ctx.accounts.market.bump],
        ];
        transfer_out(
            &ctx.accounts.equity_token_program,
            &ctx.accounts.equity_mint,
            &ctx.accounts.equity_vault,
            &ctx.accounts.borrower_equity,
            &ctx.accounts.market,
            signer_seeds,
            amount,
            ctx.remaining_accounts,
        )?;
        ctx.accounts.position.debt_shares = position_shares;
        ctx.accounts.market.total_debt_shares = ctx
            .accounts
            .market
            .total_debt_shares
            .checked_add(added_shares)
            .ok_or(CairnError::MathOverflow)?;
        ctx.accounts.market.cash = ctx
            .accounts
            .market
            .cash
            .checked_sub(amount)
            .ok_or(CairnError::MathOverflow)?;
        emit!(Borrowed {
            owner: ctx.accounts.borrower.key(),
            amount,
            debt_shares: added_shares,
        });
        Ok(())
    }

    pub fn repay<'info>(
        ctx: Context<'_, '_, 'info, 'info, Repay<'info>>,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, CairnError::ZeroAmount);
        accrue_market(&mut ctx.accounts.market, Clock::get()?.unix_timestamp)?;
        let debt = debt_for_shares(
            ctx.accounts.position.debt_shares,
            ctx.accounts.market.borrow_index,
        )?;
        require!(amount <= debt, CairnError::RepayTooLarge);
        let received = transfer_in_measured(
            &ctx.accounts.equity_token_program,
            &ctx.accounts.equity_mint,
            &ctx.accounts.payer_equity,
            &mut ctx.accounts.equity_vault,
            &ctx.accounts.payer,
            amount,
            ctx.remaining_accounts,
        )?;
        let removed_shares = shares_for_repayment(
            received,
            ctx.accounts.position.debt_shares,
            ctx.accounts.market.borrow_index,
        )?;
        require!(removed_shares > 0, CairnError::RepayTooSmall);
        ctx.accounts.position.debt_shares = ctx
            .accounts
            .position
            .debt_shares
            .checked_sub(removed_shares)
            .ok_or(CairnError::MathOverflow)?;
        ctx.accounts.market.total_debt_shares = ctx
            .accounts
            .market
            .total_debt_shares
            .checked_sub(removed_shares)
            .ok_or(CairnError::MathOverflow)?;
        ctx.accounts.market.cash = ctx
            .accounts
            .market
            .cash
            .checked_add(received)
            .ok_or(CairnError::MathOverflow)?;
        emit!(Repaid {
            owner: ctx.accounts.position.owner,
            payer: ctx.accounts.payer.key(),
            amount: received,
            debt_shares: removed_shares,
        });
        Ok(())
    }

    pub fn accrue_interest(ctx: Context<AccrueInterest>) -> Result<()> {
        accrue_market(&mut ctx.accounts.market, Clock::get()?.unix_timestamp)?;
        emit!(InterestAccrued {
            market: ctx.accounts.market.key(),
            borrow_index: ctx.accounts.market.borrow_index,
            reserves: ctx.accounts.market.reserves,
        });
        Ok(())
    }

    /// Permissionless. A position whose collateral is gone but whose debt remains would
    /// otherwise stay in total debt forever: managed_assets keeps counting it, the cSPYx rate
    /// stays overstated, and the last redeemers find the vault empty. Writing it off moves the
    /// loss into the exchange rate now, with reserves as first loss.
    pub fn write_off_bad_debt(ctx: Context<WriteOffBadDebt>) -> Result<()> {
        accrue_market(&mut ctx.accounts.market, Clock::get()?.unix_timestamp)?;
        let shares = ctx.accounts.position.debt_shares;
        let debt = debt_for_shares(shares, ctx.accounts.market.borrow_index)?;
        let (total_debt_shares, reserves) = write_off(
            ctx.accounts.market.total_debt_shares,
            shares,
            ctx.accounts.position.collateral,
            debt,
            ctx.accounts.market.reserves,
        )?;
        ctx.accounts.market.total_debt_shares = total_debt_shares;
        ctx.accounts.market.reserves = reserves;
        ctx.accounts.position.debt_shares = 0;
        emit!(BadDebtWrittenOff {
            owner: ctx.accounts.position.owner,
            debt,
            debt_shares: shares,
        });
        Ok(())
    }

    pub fn liquidate<'info>(
        ctx: Context<'_, '_, 'info, 'info, Liquidate<'info>>,
        requested_repay: u64,
    ) -> Result<()> {
        require!(requested_repay > 0, CairnError::ZeroAmount);
        accrue_market(&mut ctx.accounts.market, Clock::get()?.unix_timestamp)?;
        let debt = debt_for_shares(
            ctx.accounts.position.debt_shares,
            ctx.accounts.market.borrow_index,
        )?;
        let prices = validate_prices(
            &Clock::get()?,
            &ctx.accounts.market.config,
            &ctx.accounts.equity_spot,
            &ctx.accounts.equity_twap,
            &ctx.accounts.collateral_spot,
            &ctx.accounts.collateral_twap,
            equity_price_multiplier(&ctx.accounts.equity_mint, Clock::get()?.unix_timestamp)?,
        )?;
        require!(
            !position_is_healthy(
                ctx.accounts.position.collateral,
                debt,
                ctx.accounts.collateral_mint.decimals,
                ctx.accounts.equity_mint.decimals,
                prices.collateral_price,
                prices.equity_debt_price,
                ctx.accounts.market.config.liquidation_threshold_bps,
            )?,
            CairnError::PositionHealthy
        );
        let max_repay = u64::try_from(math::mul_div_ceil(
            debt as u128,
            ctx.accounts.market.config.close_factor_bps as u128,
            BPS_DENOM,
        )?)
        .map_err(|_| error!(CairnError::MathOverflow))?;
        require!(requested_repay <= max_repay, CairnError::RepayTooLarge);

        let received = transfer_in_measured(
            &ctx.accounts.equity_token_program,
            &ctx.accounts.equity_mint,
            &ctx.accounts.liquidator_equity,
            &mut ctx.accounts.equity_vault,
            &ctx.accounts.liquidator,
            requested_repay,
            ctx.remaining_accounts,
        )?;
        let removed_shares = shares_for_repayment(
            received,
            ctx.accounts.position.debt_shares,
            ctx.accounts.market.borrow_index,
        )?;
        require!(removed_shares > 0, CairnError::RepayTooSmall);
        let seize = collateral_for_liquidation(
            received,
            ctx.accounts.equity_mint.decimals,
            ctx.accounts.collateral_mint.decimals,
            prices.equity_debt_price,
            prices.collateral_price,
            ctx.accounts.market.config.liquidation_bonus_bps,
        )?
        .min(ctx.accounts.position.collateral);
        require!(seize > 0, CairnError::LiquidationTooSmall);

        let equity_mint = ctx.accounts.market.equity_mint;
        let signer_seeds: &[&[u8]] = &[
            Market::SEED,
            equity_mint.as_ref(),
            &[ctx.accounts.market.bump],
        ];
        transfer_out(
            &ctx.accounts.collateral_token_program,
            &ctx.accounts.collateral_mint,
            &ctx.accounts.collateral_vault,
            &ctx.accounts.liquidator_collateral,
            &ctx.accounts.market,
            signer_seeds,
            seize,
            &[],
        )?;
        ctx.accounts.position.debt_shares = ctx
            .accounts
            .position
            .debt_shares
            .checked_sub(removed_shares)
            .ok_or(CairnError::MathOverflow)?;
        ctx.accounts.position.collateral = ctx
            .accounts
            .position
            .collateral
            .checked_sub(seize)
            .ok_or(CairnError::MathOverflow)?;
        ctx.accounts.market.total_debt_shares = ctx
            .accounts
            .market
            .total_debt_shares
            .checked_sub(removed_shares)
            .ok_or(CairnError::MathOverflow)?;
        ctx.accounts.market.cash = ctx
            .accounts
            .market
            .cash
            .checked_add(received)
            .ok_or(CairnError::MathOverflow)?;
        ctx.accounts.market.total_collateral = ctx
            .accounts
            .market
            .total_collateral
            .checked_sub(seize)
            .ok_or(CairnError::MathOverflow)?;
        emit!(Liquidated {
            owner: ctx.accounts.position.owner,
            liquidator: ctx.accounts.liquidator.key(),
            repaid: received,
            collateral_seized: seize,
        });
        Ok(())
    }

    pub fn set_market_config(ctx: Context<AdminMarket>, config: MarketConfig) -> Result<()> {
        validate_config(&config)?;
        accrue_market(&mut ctx.accounts.market, Clock::get()?.unix_timestamp)?;
        ctx.accounts.market.config = config;
        Ok(())
    }

    pub fn set_paused(
        ctx: Context<AdminMarket>,
        deposits_paused: bool,
        borrows_paused: bool,
    ) -> Result<()> {
        ctx.accounts.market.deposits_paused = deposits_paused;
        ctx.accounts.market.borrows_paused = borrows_paused;
        emit!(PauseChanged {
            deposits_paused,
            borrows_paused,
        });
        Ok(())
    }

    pub fn reconcile_cash(ctx: Context<ReconcileCash>) -> Result<()> {
        let actual = ctx.accounts.equity_vault.amount;
        require!(actual < ctx.accounts.market.cash, CairnError::InvalidConfig);
        let loss = ctx
            .accounts
            .market
            .cash
            .checked_sub(actual)
            .ok_or(CairnError::MathOverflow)?;
        ctx.accounts.market.cash = actual;
        emit!(CashReconciled { actual, loss });
        Ok(())
    }
}

fn validate_config(config: &MarketConfig) -> Result<()> {
    require!(
        config.max_price_age_seconds > 0
            && config.twap_window_seconds > 0
            && config.max_confidence_bps > 0
            && config.max_confidence_bps < 5_000
            && config.max_spot_twap_deviation_bps > 0
            && config.max_spot_twap_deviation_bps < 5_000
            && config.max_twap_down_slots_ratio <= 1_000_000
            && config.loan_to_value_bps > 0
            && config.loan_to_value_bps < config.liquidation_threshold_bps
            && config.liquidation_threshold_bps < BPS_DENOM as u16
            && config.liquidation_bonus_bps < 5_000
            && config.close_factor_bps > 0
            && config.close_factor_bps <= BPS_DENOM as u16
            && config.reserve_factor_bps < BPS_DENOM as u16
            && config.kink_bps > 0
            && config.kink_bps < BPS_DENOM as u16
            && config.deposit_cap > 0
            && config.borrow_cap > 0,
        CairnError::InvalidConfig
    );
    Ok(())
}

fn total_debt(market: &Market) -> Result<u64> {
    Ok(debt_for_shares(
        market.total_debt_shares,
        market.borrow_index,
    )?)
}

fn accrue_market(market: &mut Account<Market>, now: i64) -> Result<()> {
    require!(
        now >= market.last_accrual_timestamp,
        CairnError::MathOverflow
    );
    let elapsed = u64::try_from(now - market.last_accrual_timestamp)
        .map_err(|_| error!(CairnError::MathOverflow))?;
    let debt = total_debt(market)?;
    let utilization = utilization_bps(market.cash, debt)?;
    let rate = borrow_rate_bps(&market.config, utilization)?;
    let (index, reserve_increment) = accrue_index(
        market.borrow_index,
        debt,
        elapsed,
        rate,
        market.config.reserve_factor_bps,
    )?;
    market.borrow_index = index;
    market.reserves = market
        .reserves
        .checked_add(reserve_increment)
        .ok_or(CairnError::MathOverflow)?;
    market.last_accrual_timestamp = now;
    Ok(())
}

fn transfer_in_measured<'info>(
    token_program: &Interface<'info, TokenInterface>,
    mint: &InterfaceAccount<'info, Mint>,
    from: &InterfaceAccount<'info, TokenAccount>,
    to: &mut InterfaceAccount<'info, TokenAccount>,
    authority: &Signer<'info>,
    amount: u64,
    remaining_accounts: &[AccountInfo<'info>],
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
        )
        .with_remaining_accounts(remaining_accounts.to_vec()),
        amount,
        mint.decimals,
    )?;
    to.reload()?;
    to.amount
        .checked_sub(before)
        .ok_or(CairnError::MathOverflow.into())
}

#[allow(clippy::too_many_arguments)]
fn transfer_out<'info>(
    token_program: &Interface<'info, TokenInterface>,
    mint: &InterfaceAccount<'info, Mint>,
    from: &InterfaceAccount<'info, TokenAccount>,
    to: &InterfaceAccount<'info, TokenAccount>,
    market: &Account<'info, Market>,
    signer_seeds: &[&[u8]],
    amount: u64,
    remaining_accounts: &[AccountInfo<'info>],
) -> Result<()> {
    transfer_checked(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            TransferChecked {
                from: from.to_account_info(),
                mint: mint.to_account_info(),
                to: to.to_account_info(),
                authority: market.to_account_info(),
            },
            &[signer_seeds],
        )
        .with_remaining_accounts(remaining_accounts.to_vec()),
        amount,
        mint.decimals,
    )
}

#[event]
pub struct MarketInitialized {
    pub market: Pubkey,
    pub equity_mint: Pubkey,
    pub receipt_mint: Pubkey,
    pub collateral_mint: Pubkey,
}

#[event]
pub struct Deposited {
    pub owner: Pubkey,
    pub assets: u64,
    pub receipts: u64,
}

#[event]
pub struct Redeemed {
    pub owner: Pubkey,
    pub receipts: u64,
    pub assets: u64,
}

#[event]
pub struct CollateralDeposited {
    pub owner: Pubkey,
    pub amount: u64,
}

#[event]
pub struct CollateralWithdrawn {
    pub owner: Pubkey,
    pub amount: u64,
}

#[event]
pub struct Borrowed {
    pub owner: Pubkey,
    pub amount: u64,
    pub debt_shares: u128,
}

#[event]
pub struct Repaid {
    pub owner: Pubkey,
    pub payer: Pubkey,
    pub amount: u64,
    pub debt_shares: u128,
}

#[event]
pub struct InterestAccrued {
    pub market: Pubkey,
    pub borrow_index: u128,
    pub reserves: u64,
}

#[event]
pub struct BadDebtWrittenOff {
    pub owner: Pubkey,
    pub debt: u64,
    pub debt_shares: u128,
}

#[event]
pub struct Liquidated {
    pub owner: Pubkey,
    pub liquidator: Pubkey,
    pub repaid: u64,
    pub collateral_seized: u64,
}

#[event]
pub struct PauseChanged {
    pub deposits_paused: bool,
    pub borrows_paused: bool,
}

#[event]
pub struct CashReconciled {
    pub actual: u64,
    pub loss: u64,
}

#[derive(Accounts)]
pub struct InitializeMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + Market::INIT_SPACE,
        seeds = [Market::SEED, equity_mint.key().as_ref()],
        bump
    )]
    pub market: Account<'info, Market>,
    pub equity_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub receipt_mint: Box<InterfaceAccount<'info, Mint>>,
    pub collateral_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init,
        payer = authority,
        associated_token::mint = equity_mint,
        associated_token::authority = market,
        associated_token::token_program = equity_token_program
    )]
    pub equity_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        payer = authority,
        associated_token::mint = collateral_mint,
        associated_token::authority = market,
        associated_token::token_program = collateral_token_program
    )]
    pub collateral_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        constraint = equity_token_program.key() == *equity_mint.to_account_info().owner
            @ CairnError::InvalidTokenProgram
    )]
    pub equity_token_program: Interface<'info, TokenInterface>,
    #[account(
        constraint = receipt_token_program.key() == *receipt_mint.to_account_info().owner
            @ CairnError::InvalidTokenProgram
    )]
    pub receipt_token_program: Interface<'info, TokenInterface>,
    #[account(
        constraint = collateral_token_program.key() == *collateral_mint.to_account_info().owner
            @ CairnError::InvalidTokenProgram
    )]
    pub collateral_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializePosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub market: Account<'info, Market>,
    #[account(
        init,
        payer = owner,
        space = 8 + Position::INIT_SPACE,
        seeds = [Position::SEED, market.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    pub depositor: Signer<'info>,
    #[account(
        mut,
        seeds = [Market::SEED, equity_mint.key().as_ref()],
        bump = market.bump,
        has_one = equity_mint,
        has_one = receipt_mint
    )]
    pub market: Account<'info, Market>,
    #[account(mut)]
    pub equity_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub receipt_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = equity_mint,
        associated_token::authority = market,
        associated_token::token_program = equity_token_program
    )]
    pub equity_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = equity_mint, token::authority = depositor)]
    pub depositor_equity: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = receipt_mint, token::authority = depositor)]
    pub depositor_receipt: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = market.equity_token_program)]
    pub equity_token_program: Interface<'info, TokenInterface>,
    #[account(
        constraint = receipt_token_program.key() == *receipt_mint.to_account_info().owner
            @ CairnError::InvalidTokenProgram
    )]
    pub receipt_token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct Redeem<'info> {
    pub redeemer: Signer<'info>,
    #[account(
        mut,
        seeds = [Market::SEED, equity_mint.key().as_ref()],
        bump = market.bump,
        has_one = equity_mint,
        has_one = receipt_mint
    )]
    pub market: Account<'info, Market>,
    #[account(mut)]
    pub equity_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub receipt_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = equity_mint,
        associated_token::authority = market,
        associated_token::token_program = equity_token_program
    )]
    pub equity_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = equity_mint, token::authority = redeemer)]
    pub redeemer_equity: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = receipt_mint, token::authority = redeemer)]
    pub redeemer_receipt: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = market.equity_token_program)]
    pub equity_token_program: Interface<'info, TokenInterface>,
    #[account(
        constraint = receipt_token_program.key() == *receipt_mint.to_account_info().owner
            @ CairnError::InvalidTokenProgram
    )]
    pub receipt_token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct DepositCollateral<'info> {
    pub owner: Signer<'info>,
    #[account(mut, has_one = collateral_mint)]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        seeds = [Position::SEED, market.key().as_ref(), owner.key().as_ref()],
        bump = position.bump,
        has_one = market,
        has_one = owner
    )]
    pub position: Account<'info, Position>,
    pub collateral_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = market,
        associated_token::token_program = collateral_token_program
    )]
    pub collateral_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = collateral_mint, token::authority = owner)]
    pub owner_collateral: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = market.collateral_token_program)]
    pub collateral_token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct WithdrawCollateral<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [Market::SEED, equity_mint.key().as_ref()],
        bump = market.bump,
        has_one = equity_mint,
        has_one = collateral_mint
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        seeds = [Position::SEED, market.key().as_ref(), owner.key().as_ref()],
        bump = position.bump,
        has_one = market,
        has_one = owner
    )]
    pub position: Account<'info, Position>,
    pub equity_mint: Box<InterfaceAccount<'info, Mint>>,
    pub collateral_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = market,
        associated_token::token_program = collateral_token_program
    )]
    pub collateral_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = collateral_mint, token::authority = owner)]
    pub owner_collateral: Box<InterfaceAccount<'info, TokenAccount>>,
    pub equity_spot: Box<Account<'info, PriceUpdateV2>>,
    pub equity_twap: Box<Account<'info, TwapUpdate>>,
    pub collateral_spot: Box<Account<'info, PriceUpdateV2>>,
    pub collateral_twap: Box<Account<'info, TwapUpdate>>,
    #[account(address = market.collateral_token_program)]
    pub collateral_token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct Borrow<'info> {
    pub borrower: Signer<'info>,
    #[account(
        mut,
        seeds = [Market::SEED, equity_mint.key().as_ref()],
        bump = market.bump,
        has_one = equity_mint,
        has_one = collateral_mint
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        seeds = [Position::SEED, market.key().as_ref(), borrower.key().as_ref()],
        bump = position.bump,
        has_one = market,
        constraint = position.owner == borrower.key()
    )]
    pub position: Account<'info, Position>,
    pub equity_mint: Box<InterfaceAccount<'info, Mint>>,
    pub collateral_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = equity_mint,
        associated_token::authority = market,
        associated_token::token_program = equity_token_program
    )]
    pub equity_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = equity_mint, token::authority = borrower)]
    pub borrower_equity: Box<InterfaceAccount<'info, TokenAccount>>,
    pub equity_spot: Box<Account<'info, PriceUpdateV2>>,
    pub equity_twap: Box<Account<'info, TwapUpdate>>,
    pub collateral_spot: Box<Account<'info, PriceUpdateV2>>,
    pub collateral_twap: Box<Account<'info, TwapUpdate>>,
    #[account(address = market.equity_token_program)]
    pub equity_token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct Repay<'info> {
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [Market::SEED, equity_mint.key().as_ref()],
        bump = market.bump,
        has_one = equity_mint
    )]
    pub market: Account<'info, Market>,
    #[account(mut, has_one = market)]
    pub position: Account<'info, Position>,
    pub equity_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = equity_mint,
        associated_token::authority = market,
        associated_token::token_program = equity_token_program
    )]
    pub equity_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = equity_mint, token::authority = payer)]
    pub payer_equity: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = market.equity_token_program)]
    pub equity_token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct AccrueInterest<'info> {
    #[account(
        mut,
        seeds = [Market::SEED, equity_mint.key().as_ref()],
        bump = market.bump,
        has_one = equity_mint
    )]
    pub market: Account<'info, Market>,
    pub equity_mint: Box<InterfaceAccount<'info, Mint>>,
}

#[derive(Accounts)]
pub struct Liquidate<'info> {
    pub liquidator: Signer<'info>,
    #[account(
        mut,
        seeds = [Market::SEED, equity_mint.key().as_ref()],
        bump = market.bump,
        has_one = equity_mint,
        has_one = collateral_mint
    )]
    pub market: Account<'info, Market>,
    #[account(mut, has_one = market)]
    pub position: Account<'info, Position>,
    pub equity_mint: Box<InterfaceAccount<'info, Mint>>,
    pub collateral_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = equity_mint,
        associated_token::authority = market,
        associated_token::token_program = equity_token_program
    )]
    pub equity_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = market,
        associated_token::token_program = collateral_token_program
    )]
    pub collateral_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = equity_mint, token::authority = liquidator)]
    pub liquidator_equity: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = collateral_mint, token::authority = liquidator)]
    pub liquidator_collateral: Box<InterfaceAccount<'info, TokenAccount>>,
    pub equity_spot: Box<Account<'info, PriceUpdateV2>>,
    pub equity_twap: Box<Account<'info, TwapUpdate>>,
    pub collateral_spot: Box<Account<'info, PriceUpdateV2>>,
    pub collateral_twap: Box<Account<'info, TwapUpdate>>,
    #[account(address = market.equity_token_program)]
    pub equity_token_program: Interface<'info, TokenInterface>,
    #[account(address = market.collateral_token_program)]
    pub collateral_token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct WriteOffBadDebt<'info> {
    #[account(
        mut,
        seeds = [Market::SEED, equity_mint.key().as_ref()],
        bump = market.bump,
        has_one = equity_mint
    )]
    pub market: Account<'info, Market>,
    #[account(mut, has_one = market)]
    pub position: Account<'info, Position>,
    pub equity_mint: Box<InterfaceAccount<'info, Mint>>,
}

#[derive(Accounts)]
pub struct AdminMarket<'info> {
    pub authority: Signer<'info>,
    #[account(mut, has_one = authority)]
    pub market: Account<'info, Market>,
}

#[derive(Accounts)]
pub struct ReconcileCash<'info> {
    pub authority: Signer<'info>,
    #[account(mut, has_one = authority, has_one = equity_mint)]
    pub market: Account<'info, Market>,
    pub equity_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        associated_token::mint = equity_mint,
        associated_token::authority = market,
        associated_token::token_program = equity_token_program
    )]
    pub equity_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = market.equity_token_program)]
    pub equity_token_program: Interface<'info, TokenInterface>,
}
