import { recordedSource, type VaultSource } from "./lib/source";
import { Staircase } from "./components/Staircase";
import { Feed } from "./components/Feed";
import { GlyphFee, GlyphRatchet, GlyphInKind } from "./components/Glyphs";

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
          <div className="container">Recorded run, fork of mainnet.</div>
        </div>
      )}

      {/* 2. NAV */}
      <div className="nav-bar">
        <div className="container nav">
          <span className="wordmark">Cairn</span>
          <a className="small" href={EXPLORER} target="_blank" rel="noreferrer">
            Program on Solana Explorer →
          </a>
        </div>
      </div>

      {/* 3. HERO 50/50 — copy left, the staircase right at true scale.
          ⛔ Bands are FULL-BLEED and alternate ground/surface, the way the reference does.
          Before this the whole page was one 1090px column of hairline rules on one flat
          black, which is why it read as a document and not a site. */}
      <section className="sec sec-hero">
        <div className="fold-glow" />
        <div className="container hero">
          <div className="hero-copy">
            <h1>
              A pot of tokenized S&amp;P 500 and dollars where everyone who comes in or goes
              out leaves 1% behind
              <span className="h1-tail">
                {" "}— so the stock behind your share only ever goes up.
              </span>
            </h1>
            <p className="lead">
              You already hold tokenized stock. Deposit it, take a share, and own more stock
              every time anyone else trades.
            </p>
            <a className="cta" href={EXPLORER} target="_blank" rel="noreferrer">
              View the program on Solana Explorer
            </a>
          </div>
          <Staircase meta={meta} steps={steps} />
        </div>
      </section>

      {/* 4 + 5. WHAT THIS IS, then three cards — each one now DRAWS its mechanic. */}
      <section className="sec sec-alt">
        <div className="container">
          <div className="label">How it works</div>
          <h2 className="sec-title">One pot, two assets, a fee nobody collects.</h2>
          <div className="cards">
            <div className="card">
              <span className="glyph"><GlyphFee /></span>
              <h3>The fee stays in</h3>
              <p className="small">{meta.feeBps} bps in and out, to the pot.</p>
            </div>
            <div className="card">
              <span className="glyph glyph-claim"><GlyphRatchet /></span>
              <h3>The count only rises</h3>
              <p className="small">Nothing can lower what backs a share.</p>
            </div>
            <div className="card">
              <span className="glyph"><GlyphInKind /></span>
              <h3>Redeem pays in kind</h3>
              <p className="small">One leg? Shares still burn in full.</p>
            </div>
          </div>
          {/* ⛔ The StockLegChart is gone: it plotted total SPYx held, which falls on
              withdrawals and needed three sentences of defence. IF A CHART REQUIRES A
              DEFENCE, THE CHART LOST. Its disclosure survives as this one cobalt line. */}
          <p className="disclosure">
            Your share of the stock only grows. Its dollar value still falls with the S&amp;P.
          </p>
        </div>
      </section>

      {/* 6. THE FEED */}
      <section className="sec">
        <div className="container">
          <Feed meta={meta} steps={steps} />
        </div>
      </section>

      {/* 7. ISSUER RISK — orange, once.
          ⛔ THE PREVIOUS WORDING WAS FALSE AND WAS LIVE ON THE PUBLIC PAGE. It said "one key
          does both". Measured at the mint: seize is the permanent delegate 5aMNNLQJ…, freeze
          is a SEPARATE freezeAuthority JDq14BWv…, and that second key also holds
          pausableConfig. Two keys, three powers. ⭐ The correction is strictly WORSE for the
          issuer than the false version — three powers where the page claimed two, plus a
          global pause we had never mentioned — so it cannot be read as a softening. */}
      <section className="sec sec-risk">
        <div className="container risk">
          Backed can seize {meta.sleeves[0].symbol} with a permanent delegate, and freeze or
          pause it with a second key.
        </div>
      </section>

      {/* 8. FOOTER — three columns, addresses in mono. No prose: every line here is a
          label plus a thing a reader can paste into an explorer. */}
      <footer className="sec sec-foot">
        <div className="container foot">
          <div>
            <span className="wordmark">Cairn</span>
            <div className="caption foot-note">Recorded run, fork of mainnet</div>
          </div>
          <div>
            <div className="label">Program</div>
            <div className="mono caption">{meta.programId}</div>
            <div className="label foot-gap">Share mint</div>
            <div className="mono caption">{meta.shareMint}</div>
          </div>
          <div>
            <div className="label">Assets</div>
            {meta.sleeves.map((s) => (
              <div className="mono caption" key={s.mint}>
                {s.symbol} {s.mint}
              </div>
            ))}
          </div>
        </div>
      </footer>
    </>
  );
}
