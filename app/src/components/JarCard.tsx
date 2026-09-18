import { perShare, fromBase, type Meta, type Step } from "../lib/source";

/** The hero. Two monotone counts in large mono seafoam, units spelled out.
 *  ⛔ Seafoam is load-bearing here: these two series are the ONLY things on the page that
 *  cannot fall, which is the one property that earns the colour. */
export function JarCard({ meta, latest, first }: { meta: Meta; latest: Step; first: Step }) {
  return (
    <section className="card" style={{ padding: 28, marginBottom: 24 }}>
      <h2 style={{ fontSize: 20 }}>What one share is worth, right now in the recording</h2>
      <p className="caption" style={{ marginTop: 6, maxWidth: 620 }}>
        Not a price. The exact quantity of each asset the vault holds behind a single share.
        Both numbers are monotone by construction — no instruction in the program can lower them.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 48, marginTop: 24 }}>
        {meta.sleeves.map((s, i) => {
          const now = perShare(latest.held[i], latest.shareSupply, s.decimals);
          const then = perShare(first.held[i], first.shareSupply, s.decimals);
          const growth = now !== null && then !== null && then > 0 ? (now / then - 1) * 100 : null;
          return (
            <div key={s.mint} style={{ minWidth: 220 }}>
              <div
                className="mono"
                style={{ fontSize: 40, fontWeight: 500, color: "var(--seafoam)", lineHeight: 1.1 }}
              >
                {now === null ? "—" : now.toFixed(s.decimals)}
              </div>
              <div style={{ marginTop: 6, color: "var(--text-2)", fontSize: 14 }}>
                {s.symbol} per share
              </div>
              <div className="caption mono" style={{ marginTop: 4 }}>
                {growth === null ? "" : `+${growth.toFixed(4)}% since the vault opened`}
              </div>
            </div>
          );
        })}
        <div style={{ minWidth: 200 }}>
          <div className="mono" style={{ fontSize: 40, fontWeight: 500, color: "var(--text)", lineHeight: 1.1 }}>
            {fromBase(latest.shareSupply, 0).toLocaleString()}
          </div>
          <div style={{ marginTop: 6, color: "var(--text-2)", fontSize: 14 }}>shares outstanding</div>
          <div className="caption" style={{ marginTop: 4 }}>
            1,000 of them are dead shares, burned at bootstrap and unredeemable
          </div>
        </div>
      </div>
    </section>
  );
}
