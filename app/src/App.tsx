import { useMemo, useState } from "react";
import {
  AnimatedBadge,
  AnimatedNumber,
  MotionButton,
  MotionTabs,
  Reveal,
  SwapPanel,
} from "./components/MotionUI";
import { lenderApy, YieldCurve } from "./components/YieldCurve";

const LEGACY_EXPLORER =
  "https://explorer.solana.com/address/5RaETrSZ72bt6ym5im8ioHLoHKRP39PKzELcFJY9JgXY?cluster=devnet";

const EXCHANGE_RATE = 1.0184;
type Action = "Lend" | "Borrow";

const markets = [
  { ticker: "AAPL", receipt: "cAAPL", utilization: 64, status: "V2 reference market" },
  { ticker: "SPY", receipt: "cSPY", utilization: 42, status: "Planned" },
  { ticker: "TSLA", receipt: "cTSLA", utilization: 78, status: "Planned" },
] as const;

function cleanAmount(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export default function App() {
  const [action, setAction] = useState<Action>("Lend");
  const [depositAmount, setDepositAmount] = useState("10");
  const [collateralAmount, setCollateralAmount] = useState("5000");
  const [borrowAmount, setBorrowAmount] = useState("10");
  const [utilization, setUtilization] = useState(64);
  const [previewed, setPreviewed] = useState(false);

  const receiptAmount = cleanAmount(depositAmount) / EXCHANGE_RATE;
  const collateral = cleanAmount(collateralAmount);
  const borrowed = cleanAmount(borrowAmount);
  const health = borrowed > 0 ? collateral / (borrowed * 200) : 0;
  const currentApy = useMemo(() => lenderApy(utilization), [utilization]);

  return (
    <main>
      <div className="status-strip">
        <div className="shell status-strip-inner">
          <span>CAIRN V2</span>
          <span className="status-dot" />
          <strong>Interface preview. No live market is connected.</strong>
        </div>
      </div>

      <nav className="shell nav" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="Cairn home">
          <span className="brand-mark">C</span>
          <span>Cairn</span>
        </a>
        <div className="nav-links">
          <a href="#market">Market</a>
          <a href="#risk">Risk gate</a>
          <a href="#architecture">Architecture</a>
        </div>
        <a className="nav-legacy" href={LEGACY_EXPLORER} target="_blank" rel="noreferrer">
          Legacy devnet program ↗
        </a>
      </nav>

      <section className="shell hero" id="top">
        <Reveal>
          <div className="hero-copy">
            <div className="eyebrow">Solana securities lending</div>
            <h1>The LST layer for tokenized equities</h1>
            <p>
              Deposit tokenized AAPL. Receive cAAPL. Market makers borrow the stock and pay
              interest back to cAAPL holders.
            </p>
            <div className="hero-actions">
              <a className="text-action" href="#market">
                Explore the AAPL market <span>↓</span>
              </a>
              <span className="hero-proof">Token-2022 native</span>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.12}>
          <div className="receipt-visual" aria-label="AAPL deposit becomes cAAPL">
            <div className="receipt-topline">
              <span>CAIRN RECEIPT</span>
              <AnimatedBadge tone="safe">Eligible</AnimatedBadge>
            </div>
            <div className="receipt-symbol">cAAPL</div>
            <div className="receipt-flow">
              <div>
                <span>Deposit</span>
                <strong>10.0000 AAPL</strong>
              </div>
              <div className="flow-line" aria-hidden="true">
                <span />
              </div>
              <div>
                <span>Receive</span>
                <strong>9.8193 cAAPL</strong>
              </div>
            </div>
            <div className="receipt-rate">
              <span>Exchange rate</span>
              <strong>1 cAAPL = {EXCHANGE_RATE.toFixed(4)} AAPL</strong>
            </div>
            <div className="receipt-foot">Yield accrues through the exchange rate, not rebases.</div>
          </div>
        </Reveal>
      </section>

      <section className="market-band" id="market">
        <div className="shell market-layout">
          <Reveal delay={0.18}>
            <div className="market-copy">
              <div className="eyebrow">Reference market</div>
              <h2>AAPL in. cAAPL out.</h2>
              <p>
                One isolated market holds one equity. Borrow demand sets its rate. Other
                markets cannot spread debt or issuer risk into AAPL.
              </p>

              <dl className="market-stats">
                <div>
                  <dt>Modeled lender APY</dt>
                  <dd>
                    <AnimatedNumber value={currentApy} precision={2} />%
                  </dd>
                </div>
                <div>
                  <dt>Available liquidity</dt>
                  <dd>36.00%</dd>
                </div>
                <div>
                  <dt>Collateral</dt>
                  <dd>USDC</dd>
                </div>
              </dl>

              <div className="market-list" aria-label="Planned Cairn markets">
                {markets.map((market) => (
                  <div className="market-row" key={market.ticker}>
                    <span className="ticker">{market.ticker}</span>
                    <span>{market.receipt}</span>
                    <span>{market.utilization}% used</span>
                    <small>{market.status}</small>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.24}>
            <div className="action-card">
              <MotionTabs value={action} options={["Lend", "Borrow"] as const} onChange={setAction} />
              <SwapPanel panelKey={action}>
                {action === "Lend" ? (
                  <div className="action-panel">
                    <label htmlFor="deposit-amount">You deposit</label>
                    <div className="amount-field">
                      <input
                        id="deposit-amount"
                        inputMode="decimal"
                        value={depositAmount}
                        onChange={(event) => {
                          setDepositAmount(event.target.value);
                          setPreviewed(false);
                        }}
                      />
                      <span>AAPL</span>
                    </div>
                    <div className="receive-line">
                      <span>You receive</span>
                      <strong>
                        <AnimatedNumber value={receiptAmount} precision={4} /> cAAPL
                      </strong>
                    </div>
                    <div className="action-facts">
                      <span>Rate</span><strong>1.0184 AAPL</strong>
                      <span>Available now</span><strong>36.00%</strong>
                      <span>Issuer gate</span><strong className="safe-text">Passed</strong>
                    </div>
                    <MotionButton onClick={() => setPreviewed(true)} disabled={receiptAmount === 0}>
                      {previewed ? "Deposit preview ready" : "Preview deposit"}
                    </MotionButton>
                    <p className="microcopy">Preview only. No wallet transaction is created.</p>
                  </div>
                ) : (
                  <div className="action-panel">
                    <label htmlFor="collateral-amount">USDC collateral</label>
                    <div className="amount-field">
                      <input
                        id="collateral-amount"
                        inputMode="decimal"
                        value={collateralAmount}
                        onChange={(event) => setCollateralAmount(event.target.value)}
                      />
                      <span>USDC</span>
                    </div>
                    <label htmlFor="borrow-amount">AAPL to borrow</label>
                    <div className="amount-field amount-field-secondary">
                      <input
                        id="borrow-amount"
                        inputMode="decimal"
                        value={borrowAmount}
                        onChange={(event) => setBorrowAmount(event.target.value)}
                      />
                      <span>AAPL</span>
                    </div>
                    <div className="receive-line">
                      <span>Modeled health factor</span>
                      <strong>{health.toFixed(2)}x</strong>
                    </div>
                    <MotionButton variant="secondary">Inspect borrow position</MotionButton>
                    <p className="microcopy">Fresh Pyth spot and TWAP validation are required.</p>
                  </div>
                )}
              </SwapPanel>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="shell curve-section">
        <YieldCurve utilization={utilization} onChange={setUtilization} />
      </section>

      <section className="risk-band" id="risk">
        <div className="shell risk-layout">
          <div className="risk-copy">
            <div className="eyebrow">Token-2022 risk gate</div>
            <h2>Know the issuer before the vault accepts the stock.</h2>
            <p>
              Cairn reads mint controls on-chain. The receipt must preserve the required
              eligibility rules. Unknown active hooks fail closed.
            </p>
          </div>
          <div className="risk-grid">
            <div><span>Permanent delegate</span><AnimatedBadge tone="safe">Mirrored</AnimatedBadge></div>
            <div><span>Transfer hook</span><AnimatedBadge tone="watch">Inactive only</AnimatedBadge></div>
            <div><span>Freeze authority</span><AnimatedBadge tone="safe">Mirrored</AnimatedBadge></div>
            <div><span>Mint close authority</span><AnimatedBadge tone="safe">Rejected</AnimatedBadge></div>
            <div><span>Price source</span><AnimatedBadge tone="neutral">Pyth verified</AnimatedBadge></div>
            <div><span>TWAP policy</span><AnimatedBadge tone="neutral">Deviation guard</AnimatedBadge></div>
          </div>
        </div>
      </section>

      <section className="shell architecture" id="architecture">
        <div>
          <div className="eyebrow">Constant-time accounting</div>
          <h2>One global borrow index. No borrower loops.</h2>
        </div>
        <div className="architecture-flow" aria-label="Cairn transaction flow">
          <span>Deposit AAPL</span><i>01</i>
          <span>Mint cAAPL</span><i>02</i>
          <span>Post USDC</span><i>03</i>
          <span>Borrow AAPL</span><i>04</i>
          <span>Accrue interest</span><i>05</i>
          <span>Redeem AAPL</span><i>06</i>
        </div>
      </section>

      <footer className="footer">
        <div className="shell footer-inner">
          <div>
            <span className="brand footer-brand"><span className="brand-mark">C</span>Cairn</span>
            <p>The LST layer for tokenized equities.</p>
          </div>
          <div>
            <span>V2 program</span>
            <code>EY5qnrQj...C15vCL</code>
          </div>
          <div>
            <span>Status</span>
            <strong>Local build verified. Not deployed.</strong>
          </div>
        </div>
      </footer>
    </main>
  );
}
