use anchor_lang::prelude::*;

pub const BPS_DENOM: u128 = 10_000;
pub const INDEX_SCALE: u128 = 1_000_000_000_000_000_000;
pub const PRICE_SCALE: u128 = 1_000_000_000_000;
pub const SECONDS_PER_YEAR: u128 = 31_536_000;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace)]
pub struct MarketConfig {
    pub equity_feed_id: [u8; 32],
    pub collateral_feed_id: [u8; 32],
    pub max_price_age_seconds: u64,
    pub twap_window_seconds: u64,
    pub max_confidence_bps: u16,
    pub max_spot_twap_deviation_bps: u16,
    pub max_twap_down_slots_ratio: u32,
    pub loan_to_value_bps: u16,
    pub liquidation_threshold_bps: u16,
    pub liquidation_bonus_bps: u16,
    pub close_factor_bps: u16,
    pub reserve_factor_bps: u16,
    pub base_rate_bps: u16,
    pub slope1_bps: u16,
    pub slope2_bps: u16,
    pub kink_bps: u16,
    pub deposit_cap: u64,
    pub borrow_cap: u64,
}

#[account]
#[derive(InitSpace, Debug)]
pub struct Market {
    pub authority: Pubkey,
    pub equity_mint: Pubkey,
    pub receipt_mint: Pubkey,
    pub collateral_mint: Pubkey,
    pub equity_token_program: Pubkey,
    pub collateral_token_program: Pubkey,
    pub config: MarketConfig,
    pub cash: u64,
    pub total_debt_shares: u128,
    pub borrow_index: u128,
    pub reserves: u64,
    pub total_collateral: u64,
    pub last_accrual_timestamp: i64,
    pub deposits_paused: bool,
    pub borrows_paused: bool,
    pub bump: u8,
}

impl Market {
    pub const SEED: &'static [u8] = b"market";
}

#[account]
#[derive(InitSpace, Debug)]
pub struct Position {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub collateral: u64,
    pub debt_shares: u128,
    pub bump: u8,
}

impl Position {
    pub const SEED: &'static [u8] = b"position";
}
