import { recordedSource, plottable, type VaultSource } from "./lib/source";
import { HeroFold } from "./components/Hero";
import { Provenance } from "./components/Provenance";
import { RatchetCharts, StockLegChart } from "./components/Series";
import { Feed } from "./components/Feed";
import { Disclosure } from "./components/Disclosure";

// ⛔ THE ONLY PLACE A SOURCE IS CHOSEN. No component imports the fixture; swapping this
// line for a live-RPC implementation is the whole of the migration. The restyle did not
// dissolve that boundary and must not.
const source: VaultSource = recordedSource;

// The artifact that actually exists on a public cluster: the program and its IDL.
// ⛔ NOT a vault — there is no vault account on devnet, and devnet has no real SPYx or
// USDY, so one could only ever hold model mints. Do not write "vault" about anything on a
// public cluster until a vault account exists there.
const EXPLORER =
  "https://explorer.solana.com/address/5RaETrSZ72bt6ym5im8ioHLoHKRP39PKzELcFJY9JgXY?cluster=devnet";

export default function App() {
  const meta = source.meta();
  const steps = source.steps();
  const series = plottable(steps);

  return (
    <div className="wrap">
      <HeroFold meta={meta} steps={steps} explorerUrl={EXPLORER} />

      <Provenance source={source} />

      {/* Feature STACK, in the order his complaint demands: what it is, how it works, what
          it costs you, what can go wrong — THEN the evidence. The old page ran the evidence
          first and never answered the earlier questions. */}
      <section className="band">
        <div className="eyebrow">How the ratchet works</div>
        <h2 className="display display-md" style={{ marginTop: 12 }}>The fee stays in the pool</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
                      gap: 28, marginTop: 24 }}>
          <div>
            <div style={{ color: "var(--text)", fontWeight: 500 }}>Deposit both legs</div>
            <p className="caption" style={{ marginTop: 6 }}>
              You put in {meta.sleeves.map((s) => s.symbol).join(" and ")} together and receive
              shares. You are credited the smaller of the two ratios, so a lopsided deposit
              cannot mint more shares than the assets justify.
            </p>
          </div>
          <div>
            <div style={{ color: "var(--text)", fontWeight: 500 }}>
              The fee is not routed anywhere
            </div>
            <p className="caption" style={{ marginTop: 6 }}>
              {meta.feeBps} basis points stay in the pool. That is the entire mechanism: the
              count behind every existing share goes up, including yours.
            </p>
          </div>
          <div>
            <div style={{ color: "var(--text)", fontWeight: 500 }}>Nothing can lower it</div>
            <p className="caption" style={{ marginTop: 6 }}>
              Redemption burns shares against the assets it takes, so the ratio holds. There
              is no price in the program and no oracle in the money path.
            </p>
          </div>
        </div>
      </section>

      {/* PROMOTED above the charts: this is what it costs a user, and it was buried. */}
      <section className="band">
        <div className="eyebrow" style={{ color: "var(--orange)" }}>Before you redeem</div>
        <h2 className="display display-md" style={{ marginTop: 12 }}>
          Taking one leg burns your shares in full
        </h2>
        <p className="lede" style={{ marginTop: 16 }}>
          You can redeem both legs, or either one alone — you might want out of the stock and
          not the cash, or the issuer might have frozen one of them.
        </p>
        <p className="lede" style={{ marginTop: 12, color: "var(--orange)" }}>
          It is not a discount and not a partial exit. The assets you leave behind stay in the
          pool and raise everyone else&apos;s count. The recording below contains a real
          example on its last row.
        </p>
      </section>

      <Disclosure meta={meta} />

      <section className="band">
        <div className="eyebrow">Evidence</div>
        <h2 className="display display-md" style={{ marginTop: 12 }}>
          Every number here came off a chain
        </h2>
        <p className="lede" style={{ marginTop: 14 }}>
          One recorded run against a fork of mainnet, carrying the real SPYx and USDY mints.
          Nine transactions, each listed with its signature.
        </p>
      </section>

      <RatchetCharts meta={meta} steps={series} />
      <StockLegChart meta={meta} steps={series} />
      <Feed meta={meta} steps={steps} />

      <footer className="caption" style={{ marginTop: 40, borderTop: "1px solid var(--hairline)", paddingTop: 20 }}>
        <div>program <span className="mono">{meta.programId}</span> · fee {meta.feeBps} bps</div>
        <div style={{ marginTop: 4 }}>share mint <span className="mono">{meta.shareMint}</span></div>
      </footer>
    </div>
  );
}
