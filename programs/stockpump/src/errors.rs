use anchor_lang::prelude::*;

#[error_code]
pub enum StockPumpError {
    #[msg("arithmetic overflow")]
    MathOverflow,
    #[msg("a sleeve holds zero — the vault cannot price a share against it")]
    EmptySleeve,
    #[msg("deposit rounds to zero shares")]
    DepositTooSmall,
    #[msg("share amount is zero or exceeds supply")]
    BadShareAmount,
    #[msg("sleeve count mismatch between held and input")]
    SleeveMismatch,
    // The product claim IS the fee. With fee_bps = 0 both ratio gains are exactly 1.0,
    // so held-per-share stops rising while every line of code still runs and every test
    // that only checks "does not fall" still passes. Refuse it at the source.
    #[msg("fee_bps must be greater than zero — monotonicity comes from the fee and nothing else")]
    ZeroFee,
    #[msg("fee_bps must be less than 10000")]
    FeeTooLarge,
    #[msg("vault is already bootstrapped")]
    AlreadyBootstrapped,
    #[msg("vault is not bootstrapped")]
    NotBootstrapped,
    #[msg("sleeve_mask must select at least one sleeve and no undefined bit")]
    EmptyMask,
    #[msg("sleeve mint carries MintCloseAuthority — it could be closed and reinitialised at the same address with different rules")]
    MintIsClosable,
    #[msg("reconcile is downward-only — an upward mark reopens the donation vector")]
    ReconcileNotDownward,
    // ⛔ REJECT THE WHOLE DEPOSIT, never partial-fill. A partial fill hands someone less
    // than they asked for and mints a share count they did not compute — a surprise in the
    // one direction users never model. It is also structurally awkward here: the transfer
    // has ALREADY happened by the time `held` is known, so "partial" would mean a refund
    // CPI and a new failure path. Rejecting reverts the whole transaction, which is free.
    #[msg("deposit would push a sleeve past its cap — reduce the amount or wait")]
    DepositCapExceeded,
    #[msg("deposit cap must be greater than zero — use u64::MAX for uncapped")]
    ZeroDepositCap,
}
