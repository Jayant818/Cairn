import type { VaultSource } from "../lib/source";

/** ⛔ ON THE PAGE, NOT IN A README. This is a condition of the build, not a nicety:
 *  the data is a replay, and a viewer must learn that here rather than by asking.
 *  It reads `source.recorded`, so a live implementation removes the banner by flipping
 *  a flag — nobody has to remember to delete a hardcoded string. */
export function Provenance({ source }: { source: VaultSource }) {
  const m = source.meta();
  if (!source.recorded) return null;
  const when = new Date(m.recordedAt);
  return (
    <div
      className="card flat"
      style={{
        borderColor: "var(--peach-glow)",
        background: "color-mix(in srgb, var(--peach-glow) 12%, var(--surface-card))",
        padding: "14px 18px", margin: "0 0 24px",
      }}
    >
      <div style={{ color: "var(--signal-orange)", fontWeight: 600, fontSize: 14 }}>
        Recorded run — not live state
      </div>
      <div className="caption" style={{ marginTop: 6, color: "var(--text-body)" }}>
        Every figure below was recorded on{" "}
        <span className="mono">{when.toISOString().replace("T", " ").slice(0, 19)} UTC</span>{" "}
        from a {m.cluster}. Nothing here updates. Each transaction signature is listed in the
        feed so you can check the arithmetic rather than take it on trust.
      </div>
      <ul className="caption" style={{ margin: "10px 0 0", paddingLeft: 18, color: "var(--text-muted)" }}>
        {m.caveats.map((c) => <li key={c}>{c}</li>)}
      </ul>
    </div>
  );
}
