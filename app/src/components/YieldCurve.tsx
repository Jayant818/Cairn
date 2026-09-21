import { motion, useReducedMotion } from "motion/react";
import { AnimatedNumber } from "./MotionUI";

// Shared with the market summary so both views use one rate model.
// oxlint-disable-next-line react/only-export-components
export function lenderApy(utilization: number) {
  const borrowRate =
    utilization <= 80
      ? 1 + (9 * utilization) / 80
      : 10 + (90 * (utilization - 80)) / 20;
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
  const y = utilization <= 80 ? 184 - utilization * 1.1 : 96 - (utilization - 80) * 3.4;

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
          d="M24 184H92V166H160V148H228V125H296V96H330V62H364V28"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.15, ease: [0.16, 1, 0.3, 1] }}
        />
        <motion.circle
          className="curve-point"
          r="6"
          animate={{ cx: x, cy: y }}
          transition={{ type: "spring", stiffness: 260, damping: 28 }}
        />
        <text x="24" y="210">0% utilization</text>
        <text x="301" y="210">100%</text>
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
