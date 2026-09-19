import { recordedSource, type VaultSource } from "./lib/source";
import { Staircase } from "./components/Staircase";
import { Feed } from "./components/Feed";

// ⛔ THE ONLY PLACE A SOURCE IS CHOSEN. No component imports the fixture.
const source: VaultSource = recordedSource;

// The artifact that exists on a public cluster: the program. ⛔ NOT a vault — no vault
// account exists there, and devnet has no real SPYx or USDY.
const EXPLORER =
  "https://explorer.solana.com/address/5RaETrSZ72bt6ym5im8ioHLoHKRP39PKzELcFJY9JgXY?cluster=devnet";

export default function App() {
  const meta = source.meta();
  const steps = source.steps();

  return (
    <>
      {/* 1. STRIP — the recorded-run label lives here, once. */}
      {source.recorded && (
        <div className="strip">
          <div className="container">
            Recorded run, fork of mainnet.
          </div>
        </div>
      )}

      {/* 2. NAV */}
      <div className="container">
        <nav className="nav">
          <span style={{ fontFamily: "var(--font-display)", fontVariationSettings: "'wdth' 120,'wght' 700",
                         textTransform: "uppercase", letterSpacing: "1.5px", color: "var(--text)" }}>
            StockPump
          </span>
          <a className="small" href={EXPLORER} target="_blank" rel="noreferrer">
            Program on Solana Explorer →
          </a>
        </nav>
      </div>

      {/* 3. HERO 50/50 — copy left, the staircase right at true scale. */}
      <div className="container">
        <div className="hero">
          <div className="fold-glow" />
          <div style={{ position: "relative" }}>
            <h1>
              A pot of tokenized S&amp;P 500 and dollars where everyone who comes in or goes
              out leaves 1% behind — so the stock behind your share only ever goes up.
            </h1>
            <p className="lead" style={{ marginTop: 22 }}>
              You already hold tokenized stock. Deposit it, take a share, and own more stock
              every time anyone else trades.
            </p>
            <a className="cta" style={{ marginTop: 26 }} href={EXPLORER}
               target="_blank" rel="noreferrer">
              View the program on Solana Explorer
            </a>
          </div>
          <Staircase meta={meta} steps={steps} />
        </div>
      </div>

      {/* 4 + 5. WHAT THIS IS, then three cards. This is where the deleted prose went. */}
      <div className="container">
        <section className="band">
          <h2>One pot, two assets, a fee nobody collects.</h2>
          <div className="cards" style={{ marginTop: 32 }}>
            <div className="card">
              <h3>The fee stays in</h3>
              <p className="small" style={{ marginTop: 10 }}>
                {meta.feeBps} bps in and out, to the pot.
              </p>
            </div>
            <div className="card">
              <h3>The count only rises</h3>
              <p className="small" style={{ marginTop: 10 }}>
                Nothing can lower what backs a share.
              </p>
            </div>
            <div className="card">
              <h3>Redeem pays in kind</h3>
              <p className="small" style={{ marginTop: 10 }}>
                One leg? Shares still burn in full.
              </p>
            </div>
          </div>
          {/* ⛔ The StockLegChart is gone: it plotted total SPYx held, which falls on
              withdrawals and needed three sentences of defence. IF A CHART REQUIRES A
              DEFENCE, THE CHART LOST. Its disclosure survives as this one cobalt line. */}
          <p style={{ marginTop: 28, color: "var(--cobalt)" }}>
            Your share of the stock only grows. Its dollar value still falls when the S&amp;P
            falls, equally for everyone.
          </p>
        </section>

        {/* 6. THE FEED */}
        <Feed meta={meta} steps={steps} />

        {/* 7. ISSUER RISK — orange, once, one sentence. */}
        <section className="band band-tight">
          <p style={{ color: "var(--orange)" }}>
            {meta.sleeves[0].symbol}&apos;s issuer can freeze or seize it — one key does
            both.
          </p>
        </section>

        {/* 8. FOOTER */}
        <footer className="band band-tight small mono" style={{ color: "var(--text-3)" }}>
          <div>program {meta.programId}</div>
          <div>share mint {meta.shareMint}</div>
          <div>
            {meta.sleeves.map((s) => `${s.symbol} ${s.mint}`).join(" · ")}
          </div>
        </footer>
      </div>
    </>
  );
}
