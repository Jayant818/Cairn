use anchor_lang::prelude::*;

#[error_code]
pub enum CairnError {
    #[msg("arithmetic overflow")]
    MathOverflow,
    #[msg("amount must be greater than zero")]
    ZeroAmount,
    #[msg("configuration is invalid")]
    InvalidConfig,
    #[msg("market deposits are paused")]
    DepositsPaused,
    #[msg("market borrowing is paused")]
    BorrowsPaused,
    #[msg("deposit cap exceeded")]
    DepositCapExceeded,
    #[msg("borrow cap exceeded")]
    BorrowCapExceeded,
    #[msg("insufficient available equity")]
    InsufficientLiquidity,
    #[msg("amount rounds to zero receipt tokens")]
    DepositTooSmall,
    #[msg("receipt amount is invalid")]
    InvalidReceiptAmount,
    #[msg("collateral amount is invalid")]
    InvalidCollateralAmount,
    #[msg("position would be unhealthy")]
    UnhealthyPosition,
    #[msg("position is healthy")]
    PositionHealthy,
    #[msg("repayment exceeds the current debt")]
    RepayTooLarge,
    #[msg("repayment rounds to zero debt shares")]
    RepayTooSmall,
    #[msg("oracle confidence interval is too wide")]
    OracleConfidenceTooWide,
    #[msg("spot price differs too much from TWAP")]
    OracleDeviationTooLarge,
    #[msg("oracle price is invalid")]
    InvalidOraclePrice,
    #[msg("TWAP missed-slot ratio is too high")]
    TwapQualityTooLow,
    #[msg("oracle exponent is outside the supported range")]
    UnsupportedOracleExponent,
    #[msg("mint policy does not match the approved market policy")]
    MintPolicyMismatch,
    #[msg("mint can be closed and recreated")]
    MintIsClosable,
    #[msg("receipt mint authority must be the market PDA")]
    InvalidReceiptAuthority,
    #[msg("receipt and equity decimals must match")]
    DecimalMismatch,
    #[msg("receipt mint must use Token-2022")]
    ReceiptMustUseToken2022,
    #[msg("token program does not own the supplied mint")]
    InvalidTokenProgram,
    #[msg("collateral mint must use the classic SPL Token program")]
    CollateralMustUseClassicToken,
    #[msg("position still has debt")]
    PositionHasDebt,
    #[msg("liquidation produced no collateral")]
    LiquidationTooSmall,
}
