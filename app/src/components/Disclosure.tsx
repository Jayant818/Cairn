import type { Meta } from "../lib/source";

/** ⛔ PERSISTENT, NEVER A DISMISSIBLE MODAL, and the one warm high-signal colour on the page.
 *  Column spends orange on a featured card; we spend it on honesty, which is the actual
 *  differentiator. This is live status, not fine print: the issuer really can do these things,
 *  and a vault that hid that would be the crypto-casino reading the design doc rules out. */
export function Disclosure({ meta }: { meta: Meta }) {
  const stock = meta.sleeves.find((s) => s.role === "stock")!;
  return (
    <section
      className="card flat"
      style={{
        padding: "16px 20px", marginBottom: 24,
        borderColor: "var(--orange)",
        background: "color-mix(in srgb, var(--orange-wash) 14%, var(--surface))",
      }}
    >
      <div style={{ color: "var(--orange)", fontWeight: 600, fontSize: 14 }}>
        What the issuers can still do to your assets
      </div>
      <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "var(--text-2)", fontSize: 14 }}>
        <li>
          {stock.symbol} carries a <strong>permanent delegate</strong> and a{" "}
          <strong>transfer hook</strong>, and both sit under the <em>same</em> key. One
          compromised key reaches further than the extension list suggests.
        </li>
        <li>
          Freeze and pause are a second shared key. The issuer can freeze {stock.symbol} in this
          vault without our involvement.
        </li>
        <li>
          {stock.symbol} uses a scaled UI amount whose multiplier the issuer sets. This page
          shows <strong>raw base units</strong> throughout and never applies it — the vault
          accounts in raw units and reads neither.
        </li>
      </ul>
      <div className="caption mono" style={{ marginTop: 10 }}>
        {meta.sleeves.map((s) => (
          <div key={s.mint}>
            {s.symbol} {s.mint} · {s.decimals} dp · {s.tokenProgram.slice(0, 8)}…
          </div>
        ))}
      </div>
    </section>
  );
}
