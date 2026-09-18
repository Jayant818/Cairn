import { perShare, fromBase, type Meta, type Step } from "../lib/source";

type Pt = { x: number; y: number; step: Step };

/** Inline SVG rather than a charting dependency: nine points, two straight lines, and a
 *  y-axis whose only job is to not lie. A library would be more code and more opinions. */
function Line({
  pts, stroke, height, format, caption,
}: {
  pts: Pt[]; stroke: string; height: number;
  format: (v: number) => string; caption: string;
}) {
  const W = 960, PAD_L = 96, PAD_R = 16, PAD_T = 16, PAD_B = 28;
  const ys = pts.map((p) => p.y);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  // ⛔ THE AXIS IS THE WHOLE ARGUMENT. At demo size the steps are fractions of a penny; an
  // axis anchored at zero draws a flat line and makes a TRUE claim look like nothing
  // happened. So the domain is the data's own range, padded — and the caption says the
  // axis is zoomed, because a zoomed axis that does not admit it is its own kind of lie.
  const span = hi - lo || Math.abs(hi) || 1;
  lo -= span * 0.12; hi += span * 0.12;
  const x = (i: number) => PAD_L + (i / Math.max(pts.length - 1, 1)) * (W - PAD_L - PAD_R);
  const y = (v: number) => PAD_T + (1 - (v - lo) / (hi - lo)) * (height - PAD_T - PAD_B);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(" ");
  const ticks = [lo, (lo + hi) / 2, hi];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} role="img" aria-label={caption}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} stroke="var(--hairline)" strokeWidth="1" />
            <text x={PAD_L - 10} y={y(t) + 4} textAnchor="end"
                  fontSize="11" fill="var(--text-muted)" fontFamily="var(--font-mono)">
              {format(t)}
            </text>
          </g>
        ))}
        <path d={d} fill="none" stroke={stroke} strokeWidth="2.5"
              strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <circle key={p.step.seq} cx={x(i)} cy={y(p.y)} r="3.5" fill={stroke}>
            <title>{`${p.step.kind} · ${p.step.label} · ${format(p.y)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="caption" style={{ marginTop: 2 }}>{caption}</div>
    </div>
  );
}

/** Top chart: the two counts that only rise, in seafoam. Stacked, never overlaid on one
 *  axis — they are different assets with different decimals and a shared axis would imply
 *  a comparison that does not exist. */
export function RatchetCharts({ meta, steps }: { meta: Meta; steps: Step[] }) {
  return (
    <section className="card" style={{ padding: 24, marginBottom: 24 }}>
      <h2 style={{ fontSize: 20 }}>Both counts only rise</h2>
      <p className="caption" style={{ marginTop: 6, maxWidth: 640 }}>
        One point per transaction in the recording. Deposits raise the count behind each share;
        redemptions burn shares against the assets they take, so the ratio never falls.
      </p>
      <div style={{ display: "grid", gap: 20, marginTop: 16 }}>
        {meta.sleeves.map((s, i) => {
          const pts: Pt[] = steps
            .map((step) => ({ step, y: perShare(step.held[i], step.shareSupply, s.decimals) }))
            .filter((p): p is Pt & { y: number } => p.y !== null)
            .map((p, idx) => ({ x: idx, y: p.y, step: p.step }));
          return (
            <Line
              key={s.mint}
              pts={pts}
              stroke="var(--seafoam-600)"
              height={150}
              format={(v) => v.toFixed(s.decimals)}
              caption={`${s.symbol} per share — y-axis zoomed to the data's own range, because at this size the steps are fractions of a cent`}
            />
          );
        })}
      </div>
    </section>
  );
}

/** Bottom chart: the stock leg, in cobalt. ⛔ It can FALL — a redemption takes SPYx out of
 *  the vault — which is exactly why it must never wear seafoam, and why it is one steady
 *  blue line rather than green-up/red-down. A fall here is a withdrawal, not a failure. */
export function StockLegChart({ meta, steps }: { meta: Meta; steps: Step[] }) {
  const s = meta.sleeves.find((x) => x.role === "stock")!;
  const i = meta.sleeves.indexOf(s);
  const pts: Pt[] = steps.map((step, idx) => ({
    x: idx, y: fromBase(step.held[i], s.decimals), step,
  }));
  return (
    <section className="card" style={{ padding: 24, marginBottom: 24 }}>
      <h2 style={{ fontSize: 20 }}>The stock leg, in total</h2>
      <p className="caption" style={{ marginTop: 6, maxWidth: 640 }}>
        How much {s.symbol} the vault holds altogether. This one moves in both directions —
        a redemption takes {s.symbol} out — so it is drawn as one steady line in a market
        colour. A fall here is a withdrawal, not a loss.
      </p>
      <div style={{ marginTop: 16 }}>
        <Line
          pts={pts}
          stroke="var(--cobalt-edge)"
          height={150}
          format={(v) => v.toFixed(4)}
          caption={`total ${s.symbol} held by the vault`}
        />
      </div>
    </section>
  );
}
