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
  MULTIPLIER_SCALE,
  effectiveMultiplier,
  multiplierFixed,
  positionIsHealthy,
  scaleEquityPrice,
  writeOff,
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
  liquidateOwn,
  liquidateSample,
  liquidationLimits,
  movePrice,
  pricesFor,
  writeOffSample,
  type PaperState,
} from "./paperMarket";
import { guideOf } from "./guide";

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

// ScaledUiAmount and write-off: the same vectors as the Rust tests in math.rs.
eq(effectiveMultiplier(1.003909240011759, 1.005714560286254, 1_781_755_200n, 1_781_755_199n), 1.003909240011759, "multiplier before effective time");
eq(effectiveMultiplier(1.003909240011759, 1.005714560286254, 1_781_755_200n, 1_781_755_200n), 1.005714560286254, "multiplier at effective time");
eq(multiplierFixed(1), MULTIPLIER_SCALE, "multiplier 1.0 fixed point");
eq(scaleEquityPrice(200n * PRICE_SCALE, multiplierFixed(1.005714560286254)), 201_142_912_057_400n, "debt valued at the multiplier");
{
  const before = scaleEquityPrice(200n * PRICE_SCALE, multiplierFixed(1));
  const after = scaleEquityPrice(100n * PRICE_SCALE, multiplierFixed(2));
  eq(before, after, "2:1 split leaves the raw debt price unchanged");
  for (const debt of [100_000_000n, 249_000_000n, 250_000_000n, 251_000_000n, 400_000_000n]) {
    eq(positionIsHealthy(1_000_000_000n, debt, 6, 8, PRICE_SCALE, before, 5_000n), positionIsHealthy(1_000_000_000n, debt, 6, 8, PRICE_SCALE, after, 5_000n), `split health ${debt}`);
  }
}
eq(writeOff(1_000n, 300n, 0n, 50n, 20n).join(), "700,0", "write-off: reserves exhausted");
eq(writeOff(1_000n, 300n, 0n, 50n, 80n).join(), "700,30", "write-off: reserves first loss");
rejects(() => writeOff(1_000n, 300n, 1n, 50n, 80n), "PositionNotBadDebt", "write-off with collateral");

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

// Guided path: derived from events, one step at a time, profit is real SPYx out minus in.
{
  let g: PaperState = genesisState();
  const at = (state: PaperState) => guideOf(state.events, viewOf(state.market, state.position, state.wallet));
  eq(at(g).step, "lend", "guide starts at lend");
  eq(at(g).lendAmount, 5n * SPYX, "guide lends 5 SPYx");
  g = deposit(g, at(g).lendAmount);
  eq(at(g).step, "skip", "after lend the guide asks to skip");
  eq(at(g).completed, 2, "lend also completes the hold-cSPYx step");
  g = advanceTime(g, 30n * 86_400n);
  eq(at(g).step, "withdraw", "after skip the guide asks to withdraw");
  g = redeem(g, g.wallet.cspyx);
  const done = at(g);
  eq(done.step, "done", "after withdraw the guide is done");
  if (!(done.profit > 0n)) throw new Error(`guide profit not positive: ${done.profit}`);
  eq(done.days, 30, "guide measures 30 days");
  eq(genesisState(false).market.receiptSupply, 0n, "variant B starts empty");
}

// Liquidation follows lib.rs: healthy positions are refused, the repay is capped by the close
// factor, and the seize is collateral_for_liquidation at the adverse oracle prices, with the bonus.
{
  let q: PaperState = genesisState();
  rejects(() => liquidateSample(q, 1n * SPYX), "PositionHealthy", "healthy sample borrower cannot be liquidated");
  q = movePrice(q, 50n);
  const limits = liquidationLimits(q, q.sample);
  eq(limits.liquidatable, true, "a +50% SPYx move makes the sample borrower liquidatable");
  rejects(() => liquidateSample(q, limits.maxRepay + 1n), "RepayTooLarge", "repay above the close factor");
  const before = q.wallet.usdc;
  const repayAmt = 10n * SPYX;
  const expected = collateralForLiquidation(repayAmt, 8, 6, pricesFor(q.equityPrice).equityDebt, pricesFor(q.equityPrice).collateral, PAPER_CONFIG.liquidationBonusBps);
  q = liquidateSample(q, repayAmt);
  eq(q.wallet.usdc - before, expected, "liquidator receives collateral_for_liquidation");
  eq(q.wallet.spyx, 15n * SPYX, "liquidator paid 10 SPYx");

  // Your own max borrow is healthy at 50% LTV (health 1.4) and falls under 1 after +50%.
  let own: PaperState = depositCollateral(genesisState(), 10_000n * USDC);
  const max = viewOf(own.market, own.position, own.wallet).maxBorrow;
  own = borrow(own, max);
  rejects(() => liquidateOwn(own), "PositionHealthy", "own healthy position cannot be liquidated");
  own = movePrice(own, 50n);
  const debtBefore = liquidationLimits(own, own.position).debt;
  own = liquidateOwn(own);
  if (!(liquidationLimits(own, own.position).debt < debtBefore)) throw new Error("own liquidation did not cut debt");
  if (!(own.position.collateral < 10_000n * USDC)) throw new Error("own liquidation did not seize collateral");
}

// Bad debt end to end: SPYx triples, liquidations take all of the sample borrower's collateral,
// the debt that is left is written off, and the cSPYx rate falls to reflect the loss.
{
  let b: PaperState = movePrice(genesisState(), 200n);
  b = { ...b, wallet: { ...b.wallet, spyx: 10_000n * SPYX } };
  rejects(() => writeOffSample(b), "PositionNotBadDebt", "write-off while collateral remains");
  for (let i = 0; i < 40 && b.sample.collateral > 0n; i++) b = liquidateSample(b, liquidationLimits(b, b.sample).maxRepay);
  eq(b.sample.collateral, 0n, "liquidations took all the collateral");
  if (!(b.sample.debtShares > 0n)) throw new Error("expected bad debt after the collateral ran out");
  const rateBefore = viewOf(b.market, b.position, b.wallet).exchangeRate;
  b = writeOffSample(b);
  eq(b.sample.debtShares, 0n, "write-off clears the position");
  if (!(viewOf(b.market, b.position, b.wallet).exchangeRate < rateBefore)) throw new Error("write-off did not lower the cSPYx rate");
}

console.log("paper selfcheck PASS: 5 math.rs vectors, 6 rounding vectors, lifecycle, LTV, repay and liquidity guards, guided path, liquidation, multiplier, bad debt");
