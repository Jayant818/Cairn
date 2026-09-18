// One runnable check for the only non-trivial logic in the adapter: the bigint ratio maths
// and the monotonicity predicate. Run: npx tsx src/lib/source.selfcheck.ts
//
// ⛔ These assertions exist because the naive versions are PLAUSIBLE and WRONG:
// dividing before scaling returns 0 for every realistic ratio, and a float monotonicity
// check reports "never fell" on a series that fell by less than float precision.
import { perShare, neverFell, plottable, recordedSource, type Step } from "./source";

const eq = (a: unknown, b: unknown, msg: string) => {
  if (a !== b) throw new Error(`${msg}: got ${a}, want ${b}`);
};

// pre-bootstrap supply is UNDEFINED, not zero — a zero would draw a point at the origin and
// make the first deposit look like an infinite jump.
eq(perShare("0", "0", 8), null, "supply 0 must be null");

// 70_000_000 base units over 1000 shares at 8dp = 0.7 SPYx per 1000 shares = 70000 per share
// in base units => 0.0007 SPYx per share.
eq(perShare("70000000", "1000", 8), 0.0007, "bootstrap ratio");

// ⛔ THE CASE THAT ACTUALLY CATCHES DIVIDE-BEFORE-SCALE, and the first version of this file
// did NOT have it. Every other assertion here divides evenly, so `(held / supply) * SCALE`
// returned the identical answer and the whole selfcheck passed against a broken implementation.
// I only found that by loosening the code until the check was supposed to fail, and it did not.
// ⇒ a ratio test whose inputs divide evenly cannot detect a truncating divide.
eq(perShare("1001", "1000", 0), 1.001, "must not truncate before scaling");

// the step that matters: a 0b10 redeem burns shares without touching sleeve 0, so sleeve 0's
// ratio RISES. If this ever comes back equal, the forfeit has stopped being visible.
const a = { held: ["92586898", "39759539"], shareSupply: "1315" } as unknown as Step;
const b = { held: ["92586898", "38203022"], shareSupply: "1263" } as unknown as Step;
eq(neverFell(a, b, 0), true, "sleeve 0 must not fall across the mask redeem");
if (!(perShare(b.held[0], b.shareSupply, 8)! > perShare(a.held[0], a.shareSupply, 8)!))
  throw new Error("the mask-redeem forfeit is no longer visible in sleeve 0");

// and the predicate must be able to FAIL, or it proves nothing about the real series
const fell = { held: ["50", "0"], shareSupply: "10" } as unknown as Step;
const before = { held: ["100", "0"], shareSupply: "10" } as unknown as Step;
eq(neverFell(before, fell, 0), false, "a falling series must fail the check");

// the real fixture, end to end
const steps = plottable(recordedSource.steps());
if (steps.length < 2) throw new Error("fixture has nothing to plot");
for (let i = 1; i < steps.length; i++)
  for (const leg of [0, 1] as const)
    if (!neverFell(steps[i - 1], steps[i], leg))
      throw new Error(`leg ${leg} fell between step ${steps[i - 1].seq} and ${steps[i].seq}`);

console.log(`selfcheck PASS — ${steps.length} plottable steps, both legs monotone`);
