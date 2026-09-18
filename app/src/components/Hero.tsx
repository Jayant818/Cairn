import { perShare, plottable, type Meta, type Step } from "../lib/source";

/** THE SIGNATURE ELEMENT, and it is ours rather than a borrowed ring: a staircase whose
 *  step heights are the REAL recorded per-share series. The product is a ratchet — a
 *  quantity that only steps up — so the ornament is the claim drawn large. It cannot be
 *  copied without our numbers, which is the point of having one at all. */
function Staircase({ steps }: { steps: Step[] }) {
  const ys = steps.map((s) => perShare(s.held[0], s.shareSupply, 8) ?? 0);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const span = hi - lo || 1;
  const W = 440, H = 300, n = ys.length;
  const x = (i: number) => (i / n) * W;
  const y = (v: number) => H - 24 - ((v - lo) / span) * (H - 60);
  // one horizontal tread per step, one riser between — drawn as a path so the monotone
  // shape is literal rather than implied by a smoothed line
  let d = `M0,${H} L0,${y(ys[0]).toFixed(1)}`;
  ys.forEach((v, i) => { d += ` L${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`;
    if (i < n - 1) d += ` L${x(i + 1).toFixed(1)},${y(ys[i + 1]).toFixed(1)}`; });
  d += ` L${W},${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" aria-hidden="true"
         style={{ position: "absolute", inset: 0, opacity: 0.32, pointerEvents: "none" }}>
      <defs>
        <linearGradient id="stair" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="var(--seafoam)" stopOpacity="0" />
          <stop offset="100%" stopColor="var(--seafoam)" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <path d={d} fill="url(#stair)" stroke="var(--seafoam)" strokeWidth="1.5" strokeOpacity="0.5" />
    </svg>
  );
}

/** ⛔ THE FOLD'S JOB IS "WHAT IS THIS", NOT "IS THIS TRUE". The page it replaces opened
 *  with proof and never said what the thing was — evidence answers the second question and
 *  never the first, which is why "ugly" and "the functionality is not clear" were one
 *  complaint. Headline, mechanism, audience, action. Evidence moves below. */
export function HeroFold({ meta, steps, explorerUrl }: {
  meta: Meta; steps: Step[]; explorerUrl: string;
}) {
  const series = plottable(steps);
  const latest = series[series.length - 1];
  return (
    <header className="hero">
      <div>
        <div className="eyebrow">Tokenized equity · Solana</div>
        <h1 className="display display-xl" style={{ marginTop: 14 }}>
          Put in stock and cash.<br />Take out more than you put in.
        </h1>
        <p className="lede" style={{ marginTop: 22 }}>
          StockPump holds tokenized S&amp;P 500 and tokenized dollars together. Every deposit
          pays its fee to the pool instead of to us, so the amount of stock and cash standing
          behind each share only goes up. Never down.
        </p>
        <p className="lede" style={{ marginTop: 14, color: "var(--text-3)" }}>
          You deposit both assets and receive shares. The fee stays in. The next deposit
          raises your share. No trading, no yield, no counterparty.
        </p>
        <p className="caption" style={{ marginTop: 14 }}>
          For people who already hold tokenized equity and want it to compound without selling it.
        </p>

        <div style={{ display: "flex", gap: 12, marginTop: 30, flexWrap: "wrap" }}>
          {/* ⛔ The primary action is the artifact that ACTUALLY EXISTS. An earlier draft said
              "View the vault on devnet" — there is no vault account on devnet, only the
              program and its IDL, so that copy would have claimed a state that does not
              exist. Quieter than a fake connect-wallet button and worse for being quieter. */}
          <a className="btn btn-primary" href={explorerUrl} target="_blank" rel="noreferrer">
            View the program on Solana Explorer →
          </a>
          <button className="btn btn-ghost" disabled>Deposit</button>
          <button className="btn btn-ghost" disabled>Redeem</button>
        </div>
        <p className="caption" style={{ marginTop: 10 }}>
          Deposit and Redeem are disabled here — signing needs a live cluster, and this page
          has none. The figures below are a recorded run.
        </p>
      </div>

      <div style={{ position: "relative", minHeight: 300 }}>
        <Staircase steps={series} />
        <div className="card" style={{ position: "relative", padding: 28 }}>
          <div className="caption">Behind one share, at the end of the recording</div>
          <div style={{ display: "grid", gap: 20, marginTop: 18 }}>
            {meta.sleeves.map((s, i) => {
              const v = perShare(latest.held[i], latest.shareSupply, s.decimals);
              return (
                <div key={s.mint}>
                  <div className="mono" style={{ fontSize: 34, color: "var(--seafoam)", lineHeight: 1.05 }}>
                    {v === null ? "—" : v.toFixed(s.decimals)}
                  </div>
                  <div style={{ fontSize: 14, color: "var(--text-2)" }}>{s.symbol} per share</div>
                </div>
              );
            })}
          </div>
          <div className="caption" style={{ marginTop: 18, borderTop: "1px solid var(--hairline)", paddingTop: 12 }}>
            Both numbers are monotone by construction. No instruction in the program can lower them.
          </div>
        </div>
      </div>
    </header>
  );
}
