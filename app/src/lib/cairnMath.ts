// A line-for-line bigint port of programs/cairn/src/math.rs.
// Paper mode and the live view both compute every number with these functions,
// so the page cannot show a figure the program would not produce.
// src/lib/paper.selfcheck.ts replays the Rust unit-test vectors against this file.

export const BPS_DENOM = 10_000n;
export const INDEX_SCALE = 1_000_000_000_000_000_000n;
export const PRICE_SCALE = 1_000_000_000_000n;
export const SECONDS_PER_YEAR = 31_536_000n;
export const U64_MAX = (1n << 64n) - 1n;

export const ERRORS = {
  MathOverflow: "arithmetic overflow",
  ZeroAmount: "amount must be greater than zero",
  DepositCapExceeded: "deposit cap exceeded",
  BorrowCapExceeded: "borrow cap exceeded",
  InsufficientLiquidity: "insufficient available equity",
  DepositTooSmall: "amount rounds to zero receipt tokens",
  InvalidReceiptAmount: "receipt amount is invalid",
  InvalidCollateralAmount: "collateral amount is invalid",
  UnhealthyPosition: "position would be unhealthy",
  RepayTooLarge: "repayment exceeds the current debt",
  RepayTooSmall: "repayment rounds to zero debt shares",
  InvalidOraclePrice: "oracle price is invalid",
  UnsupportedOracleExponent: "oracle exponent is outside the supported range",
} as const;

export type CairnErrorCode = keyof typeof ERRORS;

export class CairnError extends Error {
  readonly code: CairnErrorCode;
  constructor(code: CairnErrorCode) {
    super(`${ERRORS[code]} (${code})`);
    this.code = code;
  }
}

export type MarketConfig = {
  maxPriceAgeSeconds: bigint;
  maxConfidenceBps: bigint;
  maxSpotTwapDeviationBps: bigint;
  loanToValueBps: bigint;
  liquidationThresholdBps: bigint;
  liquidationBonusBps: bigint;
  closeFactorBps: bigint;
  reserveFactorBps: bigint;
  baseRateBps: bigint;
  slope1Bps: bigint;
  slope2Bps: bigint;
  kinkBps: bigint;
  depositCap: bigint;
  borrowCap: bigint;
};

const u64 = (value: bigint) => {
  if (value < 0n || value > U64_MAX) throw new CairnError("MathOverflow");
  return value;
};

const ceilDiv = (n: bigint, d: bigint) => (n + d - 1n) / d;

export function mulDivFloor(a: bigint, b: bigint, denominator: bigint) {
  if (denominator === 0n) throw new CairnError("MathOverflow");
  return (a * b) / denominator;
}

export function mulDivCeil(a: bigint, b: bigint, denominator: bigint) {
  if (denominator === 0n) throw new CairnError("MathOverflow");
  return ceilDiv(a * b, denominator);
}

export function debtForShares(shares: bigint, index: bigint) {
  return u64(mulDivCeil(shares, index, INDEX_SCALE));
}

export function sharesForBorrow(amount: bigint, index: bigint) {
  return mulDivCeil(amount, INDEX_SCALE, index);
}

export function sharesForRepayment(amount: bigint, positionShares: bigint, index: bigint) {
  const debt = debtForShares(positionShares, index);
  if (amount >= debt) return positionShares;
  return mulDivFloor(amount, INDEX_SCALE, index);
}

export function managedAssets(cash: bigint, debt: bigint, reserves: bigint) {
  const gross = u64(cash + debt);
  if (gross < reserves) throw new CairnError("MathOverflow");
  return gross - reserves;
}

export function receiptSharesForDeposit(received: bigint, supply: bigint, assetsBefore: bigint) {
  if (received === 0n) throw new CairnError("ZeroAmount");
  if (supply === 0n) {
    if (assetsBefore !== 0n) throw new CairnError("MathOverflow");
    return received;
  }
  const shares = mulDivFloor(received, supply, assetsBefore);
  if (shares === 0n) throw new CairnError("DepositTooSmall");
  return u64(shares);
}

export function assetsForReceipts(shares: bigint, supply: bigint, assets: bigint) {
  if (shares === 0n || shares > supply) throw new CairnError("InvalidReceiptAmount");
  return u64(mulDivFloor(shares, assets, supply));
}

export function utilizationBps(cash: bigint, debt: bigint) {
  const total = u64(cash + debt);
  if (total === 0n) return 0n;
  return mulDivFloor(debt, BPS_DENOM, total);
}

export function borrowRateBps(config: MarketConfig, utilization: bigint) {
  const kink = config.kinkBps;
  if (utilization <= kink) {
    return config.baseRateBps + mulDivFloor(config.slope1Bps, utilization, kink);
  }
  return config.baseRateBps + config.slope1Bps
    + mulDivFloor(config.slope2Bps, utilization - kink, BPS_DENOM - kink);
}

export function accrueIndex(
  oldIndex: bigint,
  oldDebt: bigint,
  elapsedSeconds: bigint,
  annualRateBps: bigint,
  reserveFactorBps: bigint,
): [bigint, bigint] {
  if (elapsedSeconds === 0n || oldDebt === 0n) return [oldIndex, 0n];
  const factor = mulDivFloor(annualRateBps * elapsedSeconds, INDEX_SCALE, BPS_DENOM * SECONDS_PER_YEAR);
  const newIndex = mulDivFloor(oldIndex, INDEX_SCALE + factor, INDEX_SCALE);
  const newDebt = u64(mulDivCeil(oldDebt, newIndex, oldIndex));
  const interest = newDebt - oldDebt;
  const reserveIncrement = u64(mulDivFloor(interest, reserveFactorBps, BPS_DENOM));
  return [newIndex, reserveIncrement];
}

export function normalizedPrice(price: bigint, confidence: bigint, exponent: number, upperBound: boolean) {
  if (price <= 0n || confidence >= price) throw new CairnError("InvalidOraclePrice");
  const adverse = upperBound ? price + confidence : price - confidence;
  const shift = 12 + exponent;
  if (shift < -18 || shift > 18) throw new CairnError("UnsupportedOracleExponent");
  return shift >= 0 ? adverse * 10n ** BigInt(shift) : adverse / 10n ** BigInt(-shift);
}

export function tokenValue(amount: bigint, tokenDecimals: number, price: bigint) {
  return mulDivFloor(amount, price, 10n ** BigInt(tokenDecimals));
}

export function positionIsHealthy(
  collateralAmount: bigint,
  debtAmount: bigint,
  collateralDecimals: number,
  equityDecimals: number,
  collateralPrice: bigint,
  equityPrice: bigint,
  thresholdBps: bigint,
) {
  if (debtAmount === 0n) return true;
  const collateralValue = tokenValue(collateralAmount, collateralDecimals, collateralPrice);
  const debtValue = tokenValue(debtAmount, equityDecimals, equityPrice);
  return collateralValue * thresholdBps >= debtValue * BPS_DENOM;
}

export function collateralForLiquidation(
  repaidEquity: bigint,
  equityDecimals: number,
  collateralDecimals: number,
  equityPrice: bigint,
  collateralPrice: bigint,
  bonusBps: bigint,
) {
  const repayValue = tokenValue(repaidEquity, equityDecimals, equityPrice);
  const withBonus = mulDivFloor(repayValue, BPS_DENOM + bonusBps, BPS_DENOM);
  return u64(mulDivFloor(withBonus, 10n ** BigInt(collateralDecimals), collateralPrice));
}
