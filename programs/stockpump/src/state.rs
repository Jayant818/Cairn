use anchor_lang::prelude::*;

/// Fixed at two sleeves for v1. A `remaining_accounts` layout was rejected because nothing
/// would bind `remaining_accounts[i]` to `vault.sleeves[i].mint` — pass the SPYx vault ATA in
/// the sleeve-1 slot and the payout computed on USDY's `held` is paid in SPYx. Typed structs
/// with explicit mint constraints make that unrepresentable rather than merely checked.
pub const N_SLEEVES: usize = 2;

/// Burned to the vault itself at bootstrap so `supply` can never return to zero and the
/// first real depositor cannot be front-run by a donation that makes their mint round to 0.
pub const DEAD_SHARES: u64 = 1_000;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace, Debug)]
pub struct Sleeve {
    pub mint: Pubkey,
    /// ⛔ THE CAP IS PER SLEEVE, IN THAT SLEEVE'S OWN BASE UNITS, and it has to be: the pot
    /// holds SPYx at 8dp and USDY at 6dp, so a single scalar "total held" cap would be
    /// summing two different units and bounding neither. Two numbers, each naming how much
    /// of one real asset can be at risk, is the quantity a human can actually choose.
    /// `u64::MAX` means uncapped.
    pub deposit_cap: u64,
    /// INTERNAL ACCOUNTING, never `vault_ata.amount`. Reading the ATA would let anyone move
    /// NAV by donating tokens to it — free, permissionless, and it front-runs the first real
    /// depositor. This field and `transfer_in_measured` are ONE decision, not two: sourcing
    /// `held` from the ATA would delete the detector and the symptom in the same edit.
    pub held: u64,
}

#[account]
#[derive(InitSpace, Debug)]
pub struct Vault {
    pub authority: Pubkey,
    pub share_mint: Pubkey,
    pub fee_bps: u16,
    pub sleeves: [Sleeve; N_SLEEVES],
    pub bootstrapped: bool,
    pub bump: u8,
}

impl Vault {
    pub const SEED: &'static [u8] = b"vault";
    pub fn held(&self) -> [u64; N_SLEEVES] {
        [self.sleeves[0].held, self.sleeves[1].held]
    }
}
