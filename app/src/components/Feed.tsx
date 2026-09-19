import { perShare, type Meta, type Step } from "../lib/source";

const shortSig = (s: string) => `${s.slice(0, 6)}…${s.slice(-6)}`;

/** One row per transaction, newest first, mono throughout. The hash is the proof, so it is
 *  a link and not decoration. ⛔ The link goes to Solscan with `?cluster=custom` spelled out:
 *  these signatures are from a local fork, so a bare mainnet link would 404 and read as a
 *  fabricated hash. Better to be explicitly un-resolvable than quietly wrong. */
export function Feed({ meta, steps }: { meta: Meta; steps: Step[] }) {
  const rows = [...steps].reverse();
  return (
    <section className="card" style={{ padding: 24, marginBottom: 24 }}>
      <div className="eyebrow">Receipts</div>
      <h2 className="display display-md" style={{ marginTop: 12 }}>Every transaction in the recording</h2>
      <div style={{ marginTop: 16, borderTop: "1px solid var(--hairline)" }}>
        {rows.map((s) => {
          const mask = s.sleeveMask;
          const partial = mask !== undefined && mask !== 0b11;
          return (
            <div
              key={s.signature}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,1fr) auto",
                gap: 12, padding: "12px 0",
                borderBottom: "1px solid var(--hairline)", alignItems: "baseline",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <span
                  className="mono"
                  style={{
                    fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em",
                    color: s.kind === "redeem" ? "var(--cobalt)" : "var(--text-3)",
                  }}
                >
                  {s.kind}
                </span>
                <span style={{ marginLeft: 10, color: "var(--text-2)", fontSize: 14 }}>
                  {s.label}
                </span>
                {s.kind === "bootstrap" && (
                  <span className="caption" style={{ marginLeft: 8 }}>
                    — founder row, stated as one
                  </span>
                )}
                {partial && (
                  <div
                    className="caption"
                    style={{ color: "var(--text-3)", marginTop: 4, fontWeight: 500 }}
                  >
                    Cash leg only — shares burned in full.
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                <div className="mono caption">
                  {meta.sleeves.map((sl, i) => {
                    const v = perShare(s.held[i], s.shareSupply, sl.decimals);
                    return (
                      <span key={sl.mint} style={{ marginLeft: 12, color: "var(--seafoam)" }}>
                        {v === null ? "—" : v.toFixed(sl.decimals)} {sl.symbol}/sh
                      </span>
                    );
                  })}
                </div>
                <a
                  className="mono caption"
                  href={`https://solscan.io/tx/${s.signature}?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899`}
                  target="_blank"
                  rel="noreferrer"
                  title="Signature from the recorded fork — resolvable only against that validator"
                >
                  {shortSig(s.signature)}
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
