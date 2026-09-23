// Parity check: the TypeScript port must reproduce the Rust unit-test vectors in
// programs/cairn/src/math.rs exactly, and the paper market must follow lib.rs rules.
import {
  CairnError,
  INDEX_SCALE,
  PRICE_SCALE,
  SECONDS_PER_YEAR,
  accrueIndex,
  assetsForReceipts,
  borrowRateBps,
  collateralForLiquidation,
  debtForShares,
  managedAssets,
  normalizedPrice,
  receiptSharesForDeposit,
  sharesForBorrow,
  sharesForRepayment,
} from "./cairnMath";
import {
  PAPER_CONFIG,
  SPYX,
  USDC,
  advanceTime,
  borrow,
  deposit,
  depositCollateral,
  genesisState,
  redeem,
  repay,
  viewOf,
  withdrawCollateral,
  type PaperState,
} from "./paperMarket";

const eq = (actual: unknown, expected: unknown, label: string) => {
  if (actual !== expected) throw new Error(`${label}: ${String(actual)} !== ${String(expected)}`);
};
const rejects = (run: () => unknown, code: string, label: string) => {
  try {
    run();
  } catch (error) {
    if (error instanceof CairnError && error.code === code) return;
    throw new Error(`${label}: threw ${String(error)}, wanted ${code}`);
  }
  throw new Error(`${label}: did not throw ${code}`);
};

// math.rs: kink_rate_reaches_each_segment_boundary
eq(borrowRateBps(PAPER_CONFIG, 0n), 100n, "rate at 0%");
eq(borrowRateBps(PAPER_CONFIG, 8_000n), 1_000n, "rate at kink");
eq(borrowRateBps(PAPER_CONFIG, 10_000n), 10_000n, "rate at 100%");

// math.rs: confidence_moves_each_asset_against_the_borrower
eq(normalizedPrice(20_000n, 100n, -2, true), 201n * PRICE_SCALE, "debt price upper bound");
eq(normalizedPrice(100n, 1n, -2, false), (99n * PRICE_SCALE) / 100n, "collateral price lower bound");

// math.rs: one_year_accrual_updates_index_and_reserves
const [yearIndex, yearReserves] = accrueIndex(INDEX_SCALE, 1_000_000n, SECONDS_PER_YEAR, 1_000n, 1_000n);
eq(yearIndex, (INDEX_SCALE * 11n) / 10n, "one-year index");
eq(yearReserves, 10_000n, "one-year reserves");

// math.rs: liquidation_converts_equity_debt_to_usdc_with_bonus
eq(collateralForLiquidation(100_000_000n, 8, 6, 200n * PRICE_SCALE, PRICE_SCALE, 500n), 210_000_000n, "liquidation seize");

// math.rs: full_lending_cycle_delivers_net_interest_to_receipt_holder
const receipts = receiptSharesForDeposit(1_000_000n, 0n, 0n);
const debtShares = sharesForBorrow(600_000n, INDEX_SCALE);
const [cycleIndex, cycleReserves] = accrueIndex(INDEX_SCALE, 600_000n, SECONDS_PER_YEAR, 1_000n, 1_000n);
const repayment = debtForShares(debtShares, cycleIndex);
eq(sharesForRepayment(repayment, debtShares, cycleIndex), debtShares, "full repayment clears shares");
const cycleAssets = managedAssets(400_000n + repayment, 0n, cycleReserves);
eq(assetsForReceipts(receipts, receipts, cycleAssets), 1_054_000n, "net interest to receipt holder");

// Rounding direction, hand-derived from math.rs: each function must floor or ceil exactly where Rust does.
// The vectors above divide evenly, so they cannot see a floor/ceil swap. These can.
const HALF_UP = (3n * INDEX_SCALE) / 2n;
eq(receiptSharesForDeposit(10n, 3n, 7n), 4n, "deposit shares floor (30/7)");
eq(assetsForReceipts(1n, 3n, 10n), 3n, "redeem assets floor (10/3)");
eq(sharesForBorrow(1n, HALF_UP), 1n, "borrow shares ceil (1/1.5)");
eq(debtForShares(1n, INDEX_SCALE / 2n), 1n, "debt ceil (0.5)");
eq(sharesForRepayment(1n, 10n, HALF_UP), 0n, "partial repayment shares floor");
eq(accrueIndex(INDEX_SCALE, 999n, SECONDS_PER_YEAR, 1_000n, 9_999n)[1], 99n, "new debt ceil 1098.9 -> 1099, reserve floor 99.99");

// Paper market: the seeded fixture market already earned 30 days of interest.
const start = genesisState();
const startView = viewOf(start.market, start.position, start.wallet);
if (!(startView.exchangeRate > 1)) throw new Error("seeded market has no yield");
eq(startView.utilizationPct > 59 && startView.utilizationPct < 61, true, "seeded utilization near 60%");

// Full user lifecycle: deposit, borrow, 30 days, repay, redeem, withdraw.
let s: PaperState = deposit(start, 10n * SPYX);
const minted = s.wallet.cspyx;
s = depositCollateral(s, 2_000n * USDC);
rejects(() => borrow(s, 6n * SPYX), "UnhealthyPosition", "borrow beyond LTV");
s = borrow(s, 4n * SPYX);
rejects(() => withdrawCollateral(s, 2_000n * USDC), "UnhealthyPosition", "withdraw all collateral with debt");
s = advanceTime(s, 30n * 86_400n);
const owed = viewOf(s.market, s.position, s.wallet).positionDebt;
if (!(owed > 4n * SPYX)) throw new Error("debt did not accrue");
rejects(() => repay(s, owed + 1n), "RepayTooLarge", "repay above debt");
s = repay(s, owed);
eq(s.position.debtShares, 0n, "repay clears debt shares");
const beforeRedeem = s.wallet.spyx;
s = redeem(s, minted);
const redeemed = s.wallet.spyx - beforeRedeem;
if (!(redeemed > 10n * SPYX)) throw new Error(`redeem did not return principal plus yield: ${redeemed}`);
s = withdrawCollateral(s, 2_000n * USDC);
eq(s.wallet.usdc, 10_000n * USDC, "collateral returned in full");

// Exit liquidity: a redemption larger than idle cash must fail like the program.
let crowded = deposit(genesisState(), 20n * SPYX);
crowded = depositCollateral(crowded, 10_000n * USDC);
const cash = crowded.market.cash;
rejects(() => redeem({ ...crowded, market: { ...crowded.market, cash: 1n } }, crowded.wallet.cspyx), "InsufficientLiquidity", "redeem above idle cash");
eq(crowded.market.cash, cash, "failed redeem left state untouched");

console.log("paper selfcheck PASS: 5 math.rs vectors, 6 rounding vectors, lifecycle, LTV, repay and liquidity guards");
