import { motion, useReducedMotion } from "motion/react";
import { AnimatedNumber } from "./MotionUI";

// Shared with the market summary so both views use one rate model.
// oxlint-disable-next-line react/only-export-components
export function lenderApy(utilization: number) {
  const borrowRate =
    utilization <= 80
      ? 2 + (12 * utilization) / 80
      : 14 + (86 * (utilization - 80)) / 20;
  return (borrowRate * utilization * 0.9) / 100;
}

export function YieldCurve({
  utilization,
  onChange,
}: {
  utilization: number;
  onChange: (value: number) => void;
}) {
  const reduce = useReducedMotion();
  const x = 24 + utilization * 3.4;
  const y = utilization <= 80
    ? 184 - (88 * utilization) / 80
    : 96 - (68 * (utilization - 80)) / 20;

  return (
    <section className="curve-card" aria-labelledby="curve-title">
      <div className="curve-head">
        <div>
          <div className="eyebrow">Rate engine</div>
          <h2 id="curve-title">Demand sets the yield.</h2>
        </div>
        <div className="curve-number">
          <AnimatedNumber value={lenderApy(utilization)} precision={2} />%
          <span>Lender APY model</span>
        </div>
      </div>
      <svg className="curve" viewBox="0 0 390 220" role="img" aria-label="Utilization against lender APY">
        <path className="curve-grid" d="M24 184H364M24 140H364M24 96H364M24 52H364" />
        <motion.path
          className="curve-line"
          d="M24 184 L296 96 C320 88 346 54 364 28"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.15, ease: [0.16, 1, 0.3, 1] }}
        />
        <path className="curve-kink" d="M296 184V96" />
        <motion.circle
          className="curve-point"
          r="6"
          animate={{ cx: x, cy: y }}
          transition={{ type: "spring", stiffness: 260, damping: 28 }}
        />
        <text x="24" y="210">0% utilization</text>
        <text x="258" y="210">80% kink</text>
        <text x="339" y="210">100%</text>
      </svg>
      <label className="range-label" htmlFor="utilization">
        <span>Pool utilization</span>
        <strong>{utilization}%</strong>
      </label>
      <input
        id="utilization"
        className="range"
        type="range"
        min="0"
        max="100"
        value={utilization}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <p className="microcopy">Illustrative model. The last range rises sharply to protect exit liquidity.</p>
    </section>
  );
}
