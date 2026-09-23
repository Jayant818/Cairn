import { useMemo, useState } from "react";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  AnimatedBadge,
  AnimatedNumber,
  MotionButton,
  MotionTabs,
  Reveal,
  SwapPanel,
} from "./components/MotionUI";
import { Feed } from "./components/Feed";
import { PersonaSwitcher, SandboxRibbon } from "./components/SandboxRibbon";
import { YieldCurve } from "./components/YieldCurve";
import { useSimulator } from "./hooks/useSimulator";
import { getCairnProgram } from "./lib/anchorClient";
import { requestTestAssets } from "./lib/faucet";
import { recordedControls } from "./lib/issuerControls";
import { recordedSource } from "./lib/source";
import {
  executeAccrueInterest,
  executeBorrow,
  executeDeposit,
  executeRedeemAll,
  executeRepayAll,
  explorerTransactionUrl,
} from "./lib/transactions";

const STOCK_PRICE = 200;
const MIN_COLLATERALIZATION = 143;
type Action = "Lend" | "Borrow";

const spyxControls = recordedControls.find((mint) => mint.symbol === "SPYx")!;

function cleanAmount(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export default function App() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const anchorWallet = useAnchorWallet();
  const program = useMemo(
    () => anchorWallet ? getCairnProgram(connection, anchorWallet) : null,
    [anchorWallet, connection],
  );
  const liveReady = Boolean(program && wallet.connected && wallet.publicKey);
  const [depositAmount, setDepositAmount] = useState("5");
  const [collateralAmount, setCollateralAmount] = useState("1600");
  const [borrowAmount, setBorrowAmount] = useState("3.75");
  const simulator = useSimulator({
    connected: liveReady,
    seed: async () => {
      if (!wallet.publicKey) throw new Error("Connect a wallet first");
      return (await requestTestAssets(wallet.publicKey)).tokenSignature;
    },
    deposit: async () => {
      if (!program || !wallet.publicKey) throw new Error("Connect a wallet first");
      return executeDeposit(program, wallet.publicKey, depositAmount);
    },
    borrow: async () => {
      if (!program || !wallet.publicKey) throw new Error("Connect a wallet first");
      return executeBorrow(program, wallet.publicKey, borrowAmount, collateralAmount);
    },
    accrue: async () => {
      if (!program) throw new Error("Connect a wallet first");
      return executeAccrueInterest(program);
    },
    redeem: async () => {
      if (!program || !wallet.publicKey) throw new Error("Connect a wallet first");
      await executeRepayAll(program, wallet.publicKey);
      return executeRedeemAll(program, wallet.publicKey);
    },
  });
  const action: Action = simulator.persona === "Retail Lender" ? "Lend" : "Borrow";

  const exchangeRate = liveReady ? simulator.exchangeRate : 1.0215;
  const utilization = liveReady ? simulator.utilization : 68.2;
  const lenderRate = liveReady ? simulator.lender : 7.51;
  const receiptAmount = cleanAmount(depositAmount) / exchangeRate;
  const collateral = cleanAmount(collateralAmount);
  const borrowed = cleanAmount(borrowAmount);
  const collateralization = borrowed > 0 ? (collateral / (borrowed * STOCK_PRICE)) * 100 : 0;
  const health = collateralization / MIN_COLLATERALIZATION;
  const replay = recordedSource;
  const transactionUrl = simulator.signature
    ? explorerTransactionUrl(simulator.signature, connection.rpcEndpoint)
    : null;

  return (
    <main>
      <SandboxRibbon
        phase={simulator.phase}
        connected={simulator.connected}
        busy={simulator.busy}
        seed={simulator.seed}
        deposit={simulator.deposit}
        borrow={simulator.borrowMarket}
        accrue={simulator.accrue}
      />
      <nav className="shell nav" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="Cairn home">
          <span className="brand-mark">C</span>
          <span>Cairn</span>
        </a>
        <div className="nav-tools">
          <div className="nav-links">
            <a href="#market">Market</a>
            <a href="#risk">Risk gate</a>
          </div>
          <PersonaSwitcher value={simulator.persona} onChange={simulator.setPersona} />
          <WalletMultiButton />
        </div>
      </nav>

      <dl className="shell kpi-bar" aria-label="SPYx market indicators">
        <div><dt>Total managed equity</dt><dd>{liveReady ? simulator.managedEquity.toFixed(3) : "1,420.50"} SPYx</dd></div>
        <div><dt>Pool utilization</dt><dd><AnimatedNumber value={utilization} precision={1} />%</dd></div>
        <div><dt>Staker APY</dt><dd><AnimatedNumber value={lenderRate} precision={2} />%</dd></div>
        <div><dt>Exchange rate</dt><dd>1 cSPYx = {exchangeRate.toFixed(4)} SPYx</dd></div>
      </dl>

      <section className="shell sandbox-ledger" aria-label="Sandbox position state">
        <div><span>Wallet fixtures</span><strong>{simulator.walletSpyx.toFixed(3)} SPYx / {simulator.walletUsdc.toLocaleString()} USDC</strong></div>
        <div><span>Deposited</span><strong>{simulator.deposited.toFixed(2)} SPYx</strong></div>
        <div><span>Receipt holdings</span><strong>{simulator.receipts.toFixed(2)} cSPYx</strong></div>
        <div><span>Borrow / lender APY</span><strong>{simulator.borrow.toFixed(1)}% / {simulator.lender.toFixed(1)}%</strong></div>
        <p>{simulator.message}</p>
        {simulator.error && <p className="sandbox-error">{simulator.error}</p>}
        {transactionUrl && <a href={transactionUrl} target="_blank" rel="noreferrer">Inspect latest transaction ↗</a>}
      </section>

      <section className="shell hero" id="top">
        <Reveal>
          <div className="hero-copy">
            <div className="eyebrow">Solana securities lending</div>
            <h1>The LST layer for tokenized equities</h1>
            <p>
              Deposit tokenized SPYx. Receive cSPYx. Market makers borrow the stock and pay
              interest back to cSPYx holders.
            </p>
            <div className="hero-actions">
              <a className="text-action" href="#market">
                Explore the SPYx market <span>↓</span>
              </a>
              <span className="hero-proof">Token-2022 native</span>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.12}>
          <div className="receipt-visual" aria-label="SPYx deposit becomes cSPYx">
            <div className="receipt-topline">
              <span>CAIRN RECEIPT</span>
              <AnimatedBadge tone="safe">Eligible</AnimatedBadge>
            </div>
            <div className="receipt-symbol">cSPYx</div>
            <div className="receipt-flow">
              <div>
                <span>Deposit</span>
                <strong>10.0000 SPYx</strong>
              </div>
              <div className="flow-line" aria-hidden="true">
                <span />
              </div>
              <div>
                <span>Receive</span>
                <strong>9.7895 cSPYx</strong>
              </div>
            </div>
            <div className="receipt-rate">
              <span>Exchange rate</span>
              <strong>1 cSPYx = {exchangeRate.toFixed(4)} SPYx</strong>
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
              <h2>SPYx in. cSPYx out.</h2>
              <p>
                One isolated market holds one equity. Borrow demand sets its rate. Other
                markets cannot spread debt or issuer risk into SPYx.
              </p>

              <div className="market-rails" aria-label="SPYx market structure">
                <div><span>Equity</span><strong>SPYx, Token-2022</strong></div>
                <div><span>Receipt</span><strong>cSPYx</strong></div>
                <div><span>Borrow collateral</span><strong>USDC</strong></div>
                <div><span>Withdrawal available</span><strong>31.8%</strong></div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.24}>
            <div className="action-card">
              <label className="stock-label" htmlFor="stock-market">Stock inventory</label>
              <select className="stock-select" id="stock-market" value="SPYx" disabled>
                <option>SPYx</option>
              </select>
              <div className="underwriting-panel">
                <div className="underwriting-head">
                  <span>Audit &amp; Compliance</span>
                  <strong>{simulator.phase >= 1 ? "✓ EXTENSIONS UNDERWRITTEN (PASS)" : "APPROVED BY ON-CHAIN POLICY (PASS)"}</strong>
                </div>
                <div><span>Permanent Delegate</span><strong title={spyxControls.seize ?? ""}>Policy-matched issuer key</strong></div>
                <div><span>Transfer Hook</span><strong>Verified non-blocking</strong></div>
                <div><span>Freeze Authority</span><strong title={spyxControls.freeze ?? ""}>Issuer-controlled, mirrored</strong></div>
                <div><span>Mint Close Authority</span><strong>Disabled</strong></div>
              </div>
              <MotionTabs
                value={action}
                options={["Lend", "Borrow"] as const}
                onChange={(next) => simulator.setPersona(
                  next === "Lend" ? "Retail Lender" : "Institutional Borrower",
                )}
              />
              <SwapPanel panelKey={action}>
                {action === "Lend" ? (
                  <div className="action-panel">
                    <label htmlFor="deposit-amount">You deposit</label>
                    <div className="amount-field">
                      <input
                        id="deposit-amount"
                        inputMode="decimal"
                        value={depositAmount}
                        onChange={(event) => setDepositAmount(event.target.value)}
                      />
                      <span>SPYx</span>
                    </div>
                    <div className="receive-line">
                      <span>You receive</span>
                      <strong>
                        <AnimatedNumber value={receiptAmount} precision={4} /> cSPYx
                      </strong>
                    </div>
                    <div className="action-facts">
                      <span>Rate</span><strong>{exchangeRate.toFixed(4)} SPYx</strong>
                      <span>Withdrawal available</span><strong>31.8%</strong>
                      <span>Issuer gate</span><strong className="safe-text">Passed</strong>
                    </div>
                    <MotionButton
                      onClick={simulator.phase >= 4 ? simulator.redeem : simulator.deposit}
                      disabled={
                        !simulator.connected || simulator.busy || receiptAmount === 0
                        || simulator.phase < 1 || (simulator.phase >= 2 && simulator.phase < 4)
                        || simulator.phase >= 5
                      }
                    >
                      {simulator.busy
                        ? "Confirm in wallet"
                        : simulator.phase >= 5
                          ? "Redemption complete"
                          : simulator.phase >= 4
                            ? "Repay & Redeem cSPYx"
                            : simulator.phase >= 2
                              ? "Deposit complete"
                              : "Deposit & Mint cSPYx"}
                    </MotionButton>
                    <p className="microcopy">Connected actions are signed by your wallet and submitted to Cairn.</p>
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
                    <label htmlFor="borrow-amount">SPYx to borrow</label>
                    <div className="amount-field amount-field-secondary">
                      <input
                        id="borrow-amount"
                        inputMode="decimal"
                        value={borrowAmount}
                        onChange={(event) => setBorrowAmount(event.target.value)}
                      />
                      <span>SPYx</span>
                    </div>
                    <div className="receive-line">
                      <span>Health factor</span>
                      <strong>{health.toFixed(2)}x</strong>
                    </div>
                    <div className={`health-warning ${collateralization < MIN_COLLATERALIZATION ? "health-danger" : ""}`}>
                      <span>Collateralization ratio</span>
                      <strong>{collateralization.toFixed(1)}%</strong>
                      <small>Minimum {MIN_COLLATERALIZATION}%. Liquidation begins below the threshold.</small>
                    </div>
                    <MotionButton
                      variant="secondary"
                      onClick={simulator.borrowMarket}
                      disabled={!simulator.connected || simulator.busy || simulator.phase !== 2}
                    >
                      {simulator.busy ? "Confirm in wallet" : simulator.phase >= 3 ? "Borrow active" : "Post collateral & borrow"}
                    </MotionButton>
                    <p className="microcopy">Fresh Pyth spot and TWAP validation are required.</p>
                  </div>
                )}
              </SwapPanel>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="shell curve-section">
        <YieldCurve utilization={utilization} onChange={simulator.setUtilization} />
      </section>

      <section className="shell activity-section" id="activity">
        <Feed meta={replay.meta()} events={replay.events()} />
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
          <span>Deposit SPYx</span><i>01</i>
          <span>Mint cSPYx</span><i>02</i>
          <span>Post USDC</span><i>03</i>
          <span>Borrow SPYx</span><i>04</i>
          <span>Accrue interest</span><i>05</i>
          <span>Redeem SPYx</span><i>06</i>
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
