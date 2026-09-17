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
}
