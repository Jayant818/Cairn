import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { MarketConfig } from "../lib/cairnMath";
import { ratesAt } from "../lib/paperMarket";
import { AnimatedNumber } from "./MotionUI";

const LEFT = 24;
const RIGHT = 364;
const BOTTOM = 184;
const TOP = 28;

export function YieldCurve({ config, utilization }: { config: MarketConfig; utilization: number }) {
  const reduce = useReducedMotion();
  const [whatIf, setWhatIf] = useState<number | null>(null);
  const shown = whatIf ?? Math.round(utilization);
  const kinkPct = Number(config.kinkBps) / 100;
  const kinkApy = ratesAt(config, kinkPct).lender;
  const maxApy = Math.max(ratesAt(config, 100).lender, kinkApy * 1.5, 0.01);
  // Piecewise y scale: the gentle range under the kink gets the lower 60% of the chart.
  const yOf = (apy: number) => {
    const split = BOTTOM - (BOTTOM - TOP) * 0.6;
    if (kinkApy <= 0) return BOTTOM - ((BOTTOM - TOP) * apy) / maxApy;
    return apy <= kinkApy
      ? BOTTOM - ((BOTTOM - split) * apy) / kinkApy
      : split - ((split - TOP) * (apy - kinkApy)) / (maxApy - kinkApy);
  };
  const xOf = (pct: number) => LEFT + ((RIGHT - LEFT) * pct) / 100;
  const path = Array.from({ length: 101 }, (_, pct) => `${pct ? "L" : "M"}${xOf(pct).toFixed(1)} ${yOf(ratesAt(config, pct).lender).toFixed(1)}`).join(" ");
  const rates = ratesAt(config, shown);

  return (
    <section className="curve-card" aria-labelledby="curve-title">
      <div className="curve-head">
        <div>
          <div className="eyebrow">Rate engine</div>
          <h2 id="curve-title">Demand sets the yield.</h2>
        </div>
        <div className="curve-number">
          <AnimatedNumber value={rates.lender} precision={2} />%
          <span>Lender APY · borrow {rates.borrow.toFixed(2)}%</span>
        </div>
      </div>
      <svg className="curve" viewBox="0 0 390 220" role="img" aria-label="Utilization against lender APY">
        <path className="curve-grid" d="M24 184H364M24 140H364M24 96H364M24 52H364" />
        <motion.path
          className="curve-line"
          d={path}
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.15, ease: [0.16, 1, 0.3, 1] }}
        />
        <path className="curve-kink" d={`M${xOf(kinkPct)} ${BOTTOM}V${yOf(kinkApy)}`} />
        <motion.circle
          className="curve-point"
          r="6"
          initial={false}
          animate={{ cx: xOf(shown), cy: yOf(rates.lender) }}
          transition={{ type: "spring", stiffness: 260, damping: 28 }}
        />
        <text x="24" y="210">0% utilization</text>
        <text x={xOf(kinkPct) - 38} y="210">{kinkPct}% kink</text>
        <text x="339" y="210">100%</text>
      </svg>
      <label className="range-label" htmlFor="utilization">
        <span>{whatIf === null ? "Current utilization" : "What-if utilization"}</span>
        <strong>{shown}%</strong>
      </label>
      <input
        id="utilization"
        className="range"
        type="range"
        min="0"
        max="100"
        value={shown}
        onChange={(event) => setWhatIf(Number(event.target.value))}
      />
      <p className="microcopy">
        Computed with borrow_rate_bps and this market's config. Drag to see what-if rates. The market does not move.
      </p>
    </section>
  );
}
