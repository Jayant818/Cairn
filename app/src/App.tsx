import { recordedSource, plottable, type VaultSource } from "./lib/source";
import { Provenance } from "./components/Provenance";
import { JarCard } from "./components/JarCard";
import { RatchetCharts, StockLegChart } from "./components/Series";
import { Feed } from "./components/Feed";
import { Disclosure } from "./components/Disclosure";

// ⛔ THE ONLY PLACE A SOURCE IS CHOSEN. Every component below takes its data as props, so
// swapping this line for a live-RPC implementation is the whole of the (b) migration.
// No component imports the fixture. That is the test for whether this boundary is real.
const source: VaultSource = recordedSource;

export default function App() {
  const meta = source.meta();
  const steps = source.steps();
  const series = plottable(steps);
  const first = series[0];
  const latest = series[series.length - 1];

  return (
    <div className="wrap">
      <header style={{ padding: "40px 0 24px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 40, fontWeight: 600 }}>StockPump</h1>
          <span style={{ color: "var(--text-muted)", fontSize: 18 }}>
            a vault whose share only gets heavier
          </span>
        </div>
        <p style={{ maxWidth: 680, marginTop: 12, color: "var(--text-body)" }}>
          Deposit tokenized S&amp;P 500 and tokenized dollars together. Every deposit pays a fee
          to the vault rather than to anyone, so the quantity of each asset standing behind a
          single share goes up and never comes back down. There is no price in the program and
          no oracle in the money path — the claim is a count, and a count is checkable.
        </p>
        <div className="mono caption" style={{ marginTop: 10 }}>
          program {meta.programId} · fee {meta.feeBps} bps
        </div>
      </header>

      <Provenance source={source} />
      <JarCard meta={meta} latest={latest} first={first} />
      <RatchetCharts meta={meta} steps={series} />
      <StockLegChart meta={meta} steps={series} />
      <Disclosure meta={meta} />
      <Feed meta={meta} steps={steps} />

      <section className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 20 }}>Redeeming</h2>
        <p style={{ color: "var(--text-body)", maxWidth: 680, marginTop: 8 }}>
          You can redeem both legs, or either one alone. Taking one leg is allowed — you might
          want out of the stock and not the cash, or the issuer might have frozen one of them.
        </p>
        <p style={{ color: "var(--signal-orange)", maxWidth: 680, marginTop: 12, fontWeight: 500 }}>
          Taking one leg still burns your shares in full. It is not a discount and it is not a
          partial exit: the assets you leave behind stay in the vault and raise everyone else's
          count. The recording above contains a real example of that, on the last row.
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
          <button
            disabled
            style={{
              background: "var(--cta-fill)", color: "var(--cta-text)", border: "none",
              borderRadius: "var(--radius-lg)", padding: "12px 22px", fontSize: 15,
              fontFamily: "var(--font-sans)", fontWeight: 500, opacity: 0.55, cursor: "not-allowed",
            }}
          >
            Deposit
          </button>
          <button
            disabled
            style={{
              background: "transparent", color: "var(--cta-fill)",
              border: "1px solid var(--cta-fill)", borderRadius: "var(--radius-lg)",
              padding: "12px 22px", fontSize: 15, fontFamily: "var(--font-sans)",
              fontWeight: 500, opacity: 0.55, cursor: "not-allowed",
            }}
          >
            Redeem
          </button>
          <span className="caption" style={{ alignSelf: "center" }}>
            Disabled in the recording — signing needs a live cluster, and this page has none.
          </span>
        </div>
      </section>

      <footer className="caption" style={{ marginTop: 32, borderTop: "1px solid var(--hairline)", paddingTop: 16 }}>
        Share mint <span className="mono">{meta.shareMint}</span>
      </footer>
    </div>
  );
}
