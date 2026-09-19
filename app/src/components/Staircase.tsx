import { useEffect, useState } from "react";
import { perShare, plottable, type Meta, type Step } from "../lib/source";

/** THE HERO VISUAL, and it is the argument rather than decoration: nine real treads from the
 *  recorded run, one series, SPYx per share.
 *  ⛔ TRUE SCALE, NO ZOOMED AXIS. 4.72% is visible at true scale, and zooming an honest
 *  number makes it look like it needed help.
 *  ⛔ AND THE LAST RISER IS ANNOTATED BECAUSE IT IS NOT THE PRODUCT: 4.1172 of those 4.7245
 *  points come from ONE one-leg redemption, where a redeemer left their whole stock leg
 *  behind. The fee ratchet across five deposits and an honest full exit is 0.5833%. Saying
 *  so on the graphic is the difference between evidence and a sales chart. */
const LABELS: Record<string, string> = {
  bootstrap: "vault opened",
  deposit: "someone deposited",
  "redeem-3": "full exit, both legs",
  "redeem-2": "cash leg only",
};

export function Staircase({ meta, steps }: { meta: Meta; steps: Step[] }) {
  const series = plottable(steps);
  const ys = series.map((s) => perShare(s.held[0], s.shareSupply, meta.sleeves[0].decimals)!);
  const [t, setT] = useState(0);

  // ~2s draw, and the number ticks with it so the reader watches the claim accrue rather
  // than being handed the total.
  useEffect(() => {
    const start = performance.now(), DUR = 2000;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / DUR);
      setT(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const W = 520, H = 460, PAD_B = 46, PAD_T = 56, PAD_R = 8;
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const span = hi - lo;
  const x = (i: number) => (i / (ys.length - 1)) * (W - PAD_R);
  const y = (v: number) => PAD_T + (1 - (v - lo) / span) * (H - PAD_T - PAD_B);

  let d = `M${x(0).toFixed(1)},${y(ys[0]).toFixed(1)}`;
  for (let i = 1; i < ys.length; i++) {
    d += ` L${x(i).toFixed(1)},${y(ys[i - 1]).toFixed(1)}`;   // tread
    d += ` L${x(i).toFixed(1)},${y(ys[i]).toFixed(1)}`;       // riser
  }
  const shown = Math.max(1, Math.round(t * ys.length));
  const now = ys[0] + (ys[ys.length - 1] - ys[0]) * t;
  const dp = meta.sleeves[0].decimals;

  return (
    <div style={{ position: "relative" }}>
      <div className="label" style={{ marginBottom: 6 }}>
        {meta.sleeves[0].symbol} behind one share
      </div>
      <div className="mono" style={{ fontSize: 40, color: "var(--seafoam)", lineHeight: 1.05 }}>
        {(now / 10 ** dp).toFixed(dp)}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
           aria-label={`${meta.sleeves[0].symbol} per share across ${ys.length} recorded transactions`}>
        <path d={d} fill="none" stroke="var(--seafoam)" strokeWidth="2"
              strokeLinejoin="miter" pathLength={1}
              style={{ strokeDasharray: 1, strokeDashoffset: 1 - t }} />
        {series.map((s, i) => {
          if (i === 0 || i >= shown) return null;
          const key = s.kind === "redeem" ? `redeem-${s.sleeveMask}` : s.kind;
          const last = i === ys.length - 1;
          return (
            <g key={s.signature} style={{ opacity: 0.9 }}>
              <circle cx={x(i)} cy={y(ys[i])} r="3" fill="var(--seafoam)" />
              <text x={x(i)} y={y(ys[i]) - 10} textAnchor={last ? "end" : "middle"}
                    fontSize="10" fill={last ? "var(--orange)" : "var(--text-3)"}
                    fontFamily="var(--font-sans)">
                {LABELS[key] ?? s.kind}
              </text>
            </g>
          );
        })}
      </svg>
      {/* ⛔ The honesty label lives ON the graphic, per the ruling — not in a banner a
          reader can scroll past before the chart has made its impression. */}
      <div className="small" style={{ color: "var(--orange)", marginTop: -8 }}>
        Last step: a redeemer took cash only, leaving their stock. That is +4.1172
        of +4.7245 points. The fee ratchet alone is +0.5833%.
      </div>
    </div>
  );
}
