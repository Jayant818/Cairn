// Paper trading: the Cairn market run in the browser.
// Each action follows its instruction in programs/cairn/src/lib.rs in the same
// order: accrue first, then the same checks, then the same state updates.
// Token balances stand in for the SPL accounts. Prices are the fork fixture prices.
import {
  BPS_DENOM,
  CairnError,
  INDEX_SCALE,
  U64_MAX,
  accrueIndex,
  assetsForReceipts,
  borrowRateBps,
  collateralForLiquidation,
  debtForShares,
  managedAssets,
  mulDivCeil,
  multiplierFixed,
  normalizedPrice,
  scaleEquityPrice,
  writeOff,
  positionIsHealthy,
  receiptSharesForDeposit,
  sharesForBorrow,
  sharesForRepayment,
  tokenValue,
  utilizationBps,
  type MarketConfig,
} from "./cairnMath";

export const EQUITY_DECIMALS = 8;
export const COLLATERAL_DECIMALS = 6;
export const SPYX = 10n ** 8n;
export const USDC = 10n ** 6n;
const DAY = 86_400n;

// Same risk and rate settings as the Rust unit tests in math.rs.
export const PAPER_CONFIG: MarketConfig = {
  maxPriceAgeSeconds: 3_600n,
  maxConfidenceBps: 100n,
  maxSpotTwapDeviationBps: 500n,
  loanToValueBps: 5_000n,
  liquidationThresholdBps: 7_000n,
  liquidationBonusBps: 500n,
  closeFactorBps: 5_000n,
  reserveFactorBps: 1_000n,
  baseRateBps: 100n,
  slope1Bps: 900n,
  slope2Bps: 9_000n,
  kinkBps: 8_000n,
  depositCap: U64_MAX,
  borrowCap: U64_MAX,
};

// fork/generate-cairn-fixtures.mjs: SPYx 200.00 +/- 0.10, USDC 1.0000 +/- 0.0001, exponent -8.
export const FIXTURE_PRICES = {
  equity: { price: 20_000_000_000n, conf: 10_000_000n, expo: -8 },
  collateral: { price: 100_000_000n, conf: 10_000n, expo: -8 },
};

// validate_prices: debt is priced at the upper bound, collateral at the lower bound.
export type Prices = { equityDebt: bigint; collateral: bigint; equityMid: bigint };

// SPYx mainnet ScaledUiAmount newMultiplier (live since 2026-06-18). The program prices raw
// debt at oracle price x this multiplier, and so does paper mode.
export const SPYX_MULTIPLIER = multiplierFixed(1.005714560286254);

// The paper oracle: SPYx can move, USDC stays at the fixture. Confidence keeps the
// fixture's 0.05% ratio, so the confidence and deviation checks would still pass.
export function pricesFor(equityPrice = FIXTURE_PRICES.equity.price): Prices {
  const { equity, collateral } = FIXTURE_PRICES;
  const conf = (equityPrice * equity.conf) / equity.price;
  return {
    equityDebt: scaleEquityPrice(normalizedPrice(equityPrice, conf, equity.expo, true), SPYX_MULTIPLIER),
    collateral: normalizedPrice(collateral.price, collateral.conf, collateral.expo, false),
    equityMid: normalizedPrice(equityPrice, 0n, equity.expo, false),
  };
}

export const PRICES = pricesFor();

export type MarketState = {
  cash: bigint;
  totalDebtShares: bigint;
  borrowIndex: bigint;
  reserves: bigint;
  totalCollateral: bigint;
  receiptSupply: bigint;
  lastAccrual: bigint;
};

export type Wallet = { spyx: bigint; usdc: bigint; cspyx: bigint };
export type Position = { collateral: bigint; debtShares: bigint };

export type PaperEventKind =
  | "deposit" | "redeem" | "collateral" | "withdraw" | "borrow" | "repay" | "accrue" | "time"
  | "price" | "liquidate";

export type PaperEvent = {
  seq: number;
  kind: PaperEventKind;
  message: string;
  at: bigint;
  exchangeRate: number;
  // SPYx moved by the event, when it moves SPYx: in for deposit/repay, out for redeem/borrow.
  spyx?: bigint;
};

export type PaperState = {
  market: MarketState;
  wallet: Wallet;
  position: Position;
  now: bigint;
  events: PaperEvent[];
  // The sample market maker's position, so it can be liquidated like any other.
  sample: Position;
  // SPYx price at exponent -8. Only the paper oracle moves it.
  equityPrice: bigint;
};

// 2026-09-26 00:00 UTC. The clock only moves when the user advances it.
export const GENESIS = 1_790_380_800n;

// Variant A (default): the market opens with sample history, so a lender sees yield.
// Variant B: set to false for an empty market with no borrower and therefore 0% yield.
export const PAPER_SEEDED = true;

function emptyMarket(): PaperState {
  return {
    market: {
      cash: 0n, totalDebtShares: 0n, borrowIndex: INDEX_SCALE, reserves: 0n,
      totalCollateral: 0n, receiptSupply: 0n, lastAccrual: GENESIS,
    },
    wallet: { spyx: 25n * SPYX, usdc: 10_000n * USDC, cspyx: 0n },
    position: { collateral: 0n, debtShares: 0n },
    now: GENESIS,
    events: [],
    sample: { collateral: 0n, debtShares: 0n },
    equityPrice: FIXTURE_PRICES.equity.price,
  };
}

export function genesisState(seeded = PAPER_SEEDED): PaperState {
  if (!seeded) return emptyMarket();
  // Fixture history: a genesis lender deposits 1,000 SPYx, a fixture market maker
  // posts 250,000 USDC and borrows 600 SPYx, then 30 days pass.
  let state: PaperState = {
    market: {
      cash: 0n,
      totalDebtShares: 0n,
      borrowIndex: INDEX_SCALE,
      reserves: 0n,
      totalCollateral: 0n,
      receiptSupply: 0n,
      lastAccrual: GENESIS - 30n * DAY,
    },
    wallet: { spyx: 1_000n * SPYX, usdc: 250_000n * USDC, cspyx: 0n },
    position: { collateral: 0n, debtShares: 0n },
    now: GENESIS - 30n * DAY,
    events: [],
    sample: { collateral: 0n, debtShares: 0n },
    equityPrice: FIXTURE_PRICES.equity.price,
  };
  state = deposit(state, 1_000n * SPYX);
  state = depositCollateral(state, 250_000n * USDC);
  state = borrow(state, 600n * SPYX);
  // The fixture accounts are not the user's. Keep only the market they built.
  state = { ...state, now: GENESIS };
  state = accrueInterest(state);
  return {
    ...state,
    wallet: { spyx: 25n * SPYX, usdc: 10_000n * USDC, cspyx: 0n },
    position: { collateral: 0n, debtShares: 0n },
    sample: state.position,
    events: [],
  };
}

export function totalDebt(market: MarketState) {
  return debtForShares(market.totalDebtShares, market.borrowIndex);
}

function accrued(market: MarketState, now: bigint, config = PAPER_CONFIG): MarketState {
  if (now < market.lastAccrual) throw new CairnError("MathOverflow");
  const debt = totalDebt(market);
  const rate = borrowRateBps(config, utilizationBps(market.cash, debt));
  const [index, reserveIncrement] = accrueIndex(
    market.borrowIndex, debt, now - market.lastAccrual, rate, config.reserveFactorBps,
  );
  return { ...market, borrowIndex: index, reserves: market.reserves + reserveIncrement, lastAccrual: now };
}

function spend(balance: bigint, amount: bigint, symbol: string) {
  if (amount > balance) throw new Error(`insufficient ${symbol} in the paper wallet`);
  return balance - amount;
}

function log(state: PaperState, kind: PaperEventKind, message: string, spyx?: bigint): PaperState {
  const events = [
    { seq: (state.events[0]?.seq ?? -1) + 1, kind, message, at: state.now, exchangeRate: exchangeRate(state.market), spyx },
    ...state.events,
  ].slice(0, 50);
  return { ...state, events };
}

export function deposit(state: PaperState, amount: bigint): PaperState {
  if (amount <= 0n) throw new CairnError("ZeroAmount");
  const market = accrued(state.market, state.now);
  const assetsBefore = managedAssets(market.cash, totalDebt(market), market.reserves);
  const spyx = spend(state.wallet.spyx, amount, "SPYx");
  const nextCash = market.cash + amount;
  if (nextCash > PAPER_CONFIG.depositCap) throw new CairnError("DepositCapExceeded");
  const shares = receiptSharesForDeposit(amount, market.receiptSupply, assetsBefore);
  const next = {
    ...state,
    market: { ...market, cash: nextCash, receiptSupply: market.receiptSupply + shares },
    wallet: { ...state.wallet, spyx, cspyx: state.wallet.cspyx + shares },
  };
  return log(next, "deposit", `Deposited ${fmt(amount, 8)} SPYx and minted ${fmt(shares, 8)} cSPYx.`, amount);
}

export function redeem(state: PaperState, receipts: bigint): PaperState {
  const market = accrued(state.market, state.now);
  const assets = managedAssets(market.cash, totalDebt(market), market.reserves);
  const amount = assetsForReceipts(receipts, market.receiptSupply, assets);
  if (amount > market.cash) throw new CairnError("InsufficientLiquidity");
  const cspyx = spend(state.wallet.cspyx, receipts, "cSPYx");
  const next = {
    ...state,
    market: { ...market, cash: market.cash - amount, receiptSupply: market.receiptSupply - receipts },
    wallet: { ...state.wallet, cspyx, spyx: state.wallet.spyx + amount },
  };
  return log(next, "redeem", `Burned ${fmt(receipts, 8)} cSPYx and received ${fmt(amount, 8)} SPYx.`, amount);
}

export function depositCollateral(state: PaperState, amount: bigint): PaperState {
  if (amount <= 0n) throw new CairnError("ZeroAmount");
  const usdc = spend(state.wallet.usdc, amount, "USDC");
  const next = {
    ...state,
    market: { ...state.market, totalCollateral: state.market.totalCollateral + amount },
    position: { ...state.position, collateral: state.position.collateral + amount },
    wallet: { ...state.wallet, usdc },
  };
  return log(next, "collateral", `Posted ${fmt(amount, 6)} USDC as collateral.`);
}

export function withdrawCollateral(state: PaperState, amount: bigint): PaperState {
  if (amount <= 0n) throw new CairnError("ZeroAmount");
  if (amount > state.position.collateral) throw new CairnError("InvalidCollateralAmount");
  const market = accrued(state.market, state.now);
  const remaining = state.position.collateral - amount;
  const debt = debtForShares(state.position.debtShares, market.borrowIndex);
  if (debt > 0n && !healthyAt(remaining, debt, PAPER_CONFIG.loanToValueBps, pricesFor(state.equityPrice))) {
    throw new CairnError("UnhealthyPosition");
  }
  const next = {
    ...state,
    market: { ...market, totalCollateral: market.totalCollateral - amount },
    position: { ...state.position, collateral: remaining },
    wallet: { ...state.wallet, usdc: state.wallet.usdc + amount },
  };
  return log(next, "withdraw", `Withdrew ${fmt(amount, 6)} USDC of collateral.`);
}

export function borrow(state: PaperState, amount: bigint): PaperState {
  if (amount <= 0n) throw new CairnError("ZeroAmount");
  const market = accrued(state.market, state.now);
  if (amount > market.cash) throw new CairnError("InsufficientLiquidity");
  if (totalDebt(market) + amount > PAPER_CONFIG.borrowCap) throw new CairnError("BorrowCapExceeded");
  const added = sharesForBorrow(amount, market.borrowIndex);
  const positionShares = state.position.debtShares + added;
  const positionDebt = debtForShares(positionShares, market.borrowIndex);
  if (!healthyAt(state.position.collateral, positionDebt, PAPER_CONFIG.loanToValueBps, pricesFor(state.equityPrice))) {
    throw new CairnError("UnhealthyPosition");
  }
  const next = {
    ...state,
    market: { ...market, cash: market.cash - amount, totalDebtShares: market.totalDebtShares + added },
    position: { ...state.position, debtShares: positionShares },
    wallet: { ...state.wallet, spyx: state.wallet.spyx + amount },
  };
  return log(next, "borrow", `Borrowed ${fmt(amount, 8)} SPYx against USDC collateral.`);
}

export function repay(state: PaperState, amount: bigint): PaperState {
  if (amount <= 0n) throw new CairnError("ZeroAmount");
  const market = accrued(state.market, state.now);
  const debt = debtForShares(state.position.debtShares, market.borrowIndex);
  if (amount > debt) throw new CairnError("RepayTooLarge");
  const spyx = spend(state.wallet.spyx, amount, "SPYx");
  const removed = sharesForRepayment(amount, state.position.debtShares, market.borrowIndex);
  if (removed === 0n) throw new CairnError("RepayTooSmall");
  const next = {
    ...state,
    market: { ...market, cash: market.cash + amount, totalDebtShares: market.totalDebtShares - removed },
    position: { ...state.position, debtShares: state.position.debtShares - removed },
    wallet: { ...state.wallet, spyx },
  };
  return log(next, "repay", `Repaid ${fmt(amount, 8)} SPYx of debt.`);
}

export function accrueInterest(state: PaperState): PaperState {
  const next = { ...state, market: accrued(state.market, state.now) };
  return log(next, "accrue", `Interest accrued. The borrow index is now ${fmt(next.market.borrowIndex, 18, 8)}.`);
}

// Moves the paper clock, then runs the permissionless accrue_interest crank.
export function advanceTime(state: PaperState, seconds: bigint): PaperState {
  const moved = log({ ...state, now: state.now + seconds }, "time", `${seconds / DAY} day(s) passed.`);
  return accrueInterest(moved);
}

// Both curves come from borrow_rate_bps with the market's own config.
export function ratesAt(config: MarketConfig, utilizationPct: number) {
  const bps = BigInt(Math.round(utilizationPct * 100));
  const borrow = Number(borrowRateBps(config, bps)) / 100;
  const lender = (borrow * utilizationPct * (10_000 - Number(config.reserveFactorBps))) / 1e6;
  return { borrow, lender };
}

export function healthyAt(collateral: bigint, debt: bigint, thresholdBps: bigint, prices = PRICES) {
  return positionIsHealthy(
    collateral, debt, COLLATERAL_DECIMALS, EQUITY_DECIMALS, prices.collateral, prices.equityDebt, thresholdBps,
  );
}

// Paper oracle move, in percent of the current SPYx price.
export function movePrice(state: PaperState, percent: bigint): PaperState {
  const next = (state.equityPrice * (100n + percent)) / 100n;
  if (next <= 0n) throw new CairnError("InvalidOraclePrice");
  return log({ ...state, equityPrice: next }, "price", `SPYx price moved ${percent > 0n ? "+" : ""}${percent}% to $${fmt(next, 8, 2)}.`);
}

export function resetPrice(state: PaperState): PaperState {
  return log({ ...state, equityPrice: FIXTURE_PRICES.equity.price }, "price", `SPYx price reset to $${fmt(FIXTURE_PRICES.equity.price, 8, 2)}.`);
}

// liquidate in lib.rs: accrue, require UNHEALTHY at the liquidation threshold, cap the repay
// at the close factor, remove debt shares, seize collateral with the bonus (capped at what exists).
function liquidateCore(state: PaperState, target: Position, amount: bigint) {
  if (amount <= 0n) throw new CairnError("ZeroAmount");
  const market = accrued(state.market, state.now);
  const prices = pricesFor(state.equityPrice);
  const debt = debtForShares(target.debtShares, market.borrowIndex);
  if (healthyAt(target.collateral, debt, PAPER_CONFIG.liquidationThresholdBps, prices)) throw new CairnError("PositionHealthy");
  const maxRepay = mulDivCeil(debt, PAPER_CONFIG.closeFactorBps, BPS_DENOM);
  if (amount > maxRepay) throw new CairnError("RepayTooLarge");
  const removed = sharesForRepayment(amount, target.debtShares, market.borrowIndex);
  if (removed === 0n) throw new CairnError("RepayTooSmall");
  const bonusSeize = collateralForLiquidation(
    amount, EQUITY_DECIMALS, COLLATERAL_DECIMALS, prices.equityDebt, prices.collateral, PAPER_CONFIG.liquidationBonusBps,
  );
  const seize = bonusSeize < target.collateral ? bonusSeize : target.collateral;
  if (seize === 0n) throw new CairnError("LiquidationTooSmall");
  return {
    market: {
      ...market,
      cash: market.cash + amount,
      totalDebtShares: market.totalDebtShares - removed,
      totalCollateral: market.totalCollateral - seize,
    },
    target: { collateral: target.collateral - seize, debtShares: target.debtShares - removed },
    seize,
  };
}

export function liquidationLimits(state: PaperState, target: Position) {
  const market = accrued(state.market, state.now);
  const prices = pricesFor(state.equityPrice);
  const debt = debtForShares(target.debtShares, market.borrowIndex);
  const liquidatable = debt > 0n && !healthyAt(target.collateral, debt, PAPER_CONFIG.liquidationThresholdBps, prices);
  return { debt, liquidatable, maxRepay: mulDivCeil(debt, PAPER_CONFIG.closeFactorBps, BPS_DENOM) };
}

// write_off_bad_debt in lib.rs: permissionless, only for a position with no collateral and
// debt left. Debt shares leave the market; reserves take the first loss, lenders the rest.
function writeOffCore(state: PaperState, target: Position) {
  const market = accrued(state.market, state.now);
  const debt = debtForShares(target.debtShares, market.borrowIndex);
  const [totalDebtShares, reserves] = writeOff(market.totalDebtShares, target.debtShares, target.collateral, debt, market.reserves);
  return { market: { ...market, totalDebtShares, reserves }, target: { ...target, debtShares: 0n }, debt };
}

export function writeOffSample(state: PaperState): PaperState {
  const { market, target, debt } = writeOffCore(state, state.sample);
  return log({ ...state, market, sample: target }, "liquidate", `Wrote off ${fmt(debt, 8)} SPYx of the sample borrower's bad debt. The cSPYx rate absorbed the loss.`);
}

// The user acts as the liquidator of the sample market maker: pays SPYx, takes USDC plus the bonus.
export function liquidateSample(state: PaperState, amount: bigint): PaperState {
  // The program checks health and the close factor before the SPYx transfer, so the same order here.
  const { market, target, seize } = liquidateCore(state, state.sample, amount);
  const spyx = spend(state.wallet.spyx, amount, "SPYx");
  const next = { ...state, market, sample: target, wallet: { ...state.wallet, spyx, usdc: state.wallet.usdc + seize } };
  return log(next, "liquidate", `You repaid ${fmt(amount, 8)} SPYx of the sample borrower's debt and took ${fmt(seize, 6, 2)} USDC of its collateral.`, amount);
}

// A sample liquidator repays the maximum the close factor allows on YOUR position.
export function liquidateOwn(state: PaperState): PaperState {
  const { maxRepay } = liquidationLimits(state, state.position);
  const { market, target, seize } = liquidateCore(state, state.position, maxRepay);
  const next = { ...state, market, position: target };
  return log(next, "liquidate", `A liquidator repaid ${fmt(maxRepay, 8)} SPYx of your debt and took ${fmt(seize, 6, 2)} USDC of your collateral.`);
}

export function exchangeRate(market: MarketState) {
  if (market.receiptSupply === 0n) return 1;
  const assets = managedAssets(market.cash, totalDebt(market), market.reserves);
  return Number((assets * 10n ** 12n) / market.receiptSupply) / 1e12;
}

// Everything the page shows, derived from market state only.
export type MarketView = ReturnType<typeof viewOf>;

export function viewOf(market: MarketState, position: Position, wallet: Wallet, config = PAPER_CONFIG, prices = PRICES) {
  const debt = totalDebt(market);
  const assets = managedAssets(market.cash, debt, market.reserves);
  const utilization = utilizationBps(market.cash, debt);
  const borrowRate = borrowRateBps(config, utilization);
  const positionDebt = debtForShares(position.debtShares, market.borrowIndex);
  const collateralValue = tokenValue(position.collateral, COLLATERAL_DECIMALS, prices.collateral);
  const debtValue = tokenValue(positionDebt, EQUITY_DECIMALS, prices.equityDebt);
  // Largest extra borrow that still passes position_is_healthy at the LTV.
  const limitValue = (collateralValue * config.loanToValueBps) / 10_000n;
  const headroomValue = limitValue > debtValue ? limitValue - debtValue : 0n;
  // Two base units of margin absorb the ceil in debt_for_shares and the floor in token_value.
  const rawMax = (headroomValue * 10n ** BigInt(EQUITY_DECIMALS)) / prices.equityDebt;
  const maxBorrowByHealth = rawMax > 2n ? rawMax - 2n : 0n;
  const maxBorrow = maxBorrowByHealth < market.cash ? maxBorrowByHealth : market.cash;
  return {
    cash: market.cash,
    debt,
    assets,
    reserves: market.reserves,
    receiptSupply: market.receiptSupply,
    exchangeRate: exchangeRate(market),
    utilizationPct: Number(utilization) / 100,
    borrowApyPct: Number(borrowRate) / 100,
    // Lenders earn the borrow rate on the lent share, minus the reserve cut.
    lenderApyPct: (Number(borrowRate) * Number(utilization) * (10_000 - Number(config.reserveFactorBps))) / 1e10,
    availablePct: assets === 0n ? 100 : Number((market.cash * 10_000n) / assets) / 100,
    positionDebt,
    positionCollateral: position.collateral,
    // Collateral value at the liquidation threshold over debt value. Below 1.00 the position can be liquidated.
    healthFactor: debtValue === 0n ? null : Number((collateralValue * config.liquidationThresholdBps * 1000n) / (debtValue * 10_000n)) / 1000,
    maxBorrow,
    wallet,
    receiptValue: market.receiptSupply === 0n || wallet.cspyx === 0n
      ? 0n
      : assetsForReceipts(wallet.cspyx, market.receiptSupply, assets),
  };
}

export function fmt(value: bigint, decimals: number, shown = Math.min(decimals, 4)) {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = (abs / base).toLocaleString("en-US");
  const fraction = (abs % base).toString().padStart(decimals, "0").slice(0, shown);
  return `${negative ? "-" : ""}${whole}${shown ? `.${fraction}` : ""}`;
}

// "12.5" -> 1250000000n at 8 decimals. Throws on bad input, like rawAmount.
export function parseAmount(value: string, decimals: number) {
  const normalized = value.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(normalized)) throw new Error("Amount must be a positive number");
  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > decimals) throw new Error(`Amount supports at most ${decimals} decimals`);
  const raw = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
  if (raw <= 0n) throw new CairnError("ZeroAmount");
  return raw;
}

const STORAGE_KEY = "cairn-paper-v1";

export function saveState(state: PaperState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state, (_, v) => typeof v === "bigint" ? `${v}n` : v));
  } catch {
    // Private windows and blocked storage: the session still works, it just does not persist.
  }
}

export function loadState(): PaperState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw, (_, v) => typeof v === "string" && /^-?\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v);
  } catch {
    return null;
  }
}

export function clearState() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* see saveState */ }
}
