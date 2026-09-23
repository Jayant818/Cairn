import { useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  AnimatedBadge,
  AnimatedNumber,
  MotionButton,
  MotionTabs,
  Reveal,
  SwapPanel,
} from "./components/MotionUI";
import { Feed, type FeedRow } from "./components/Feed";
import { SandboxRibbon, type GuideStep } from "./components/SandboxRibbon";
import { YieldCurve } from "./components/YieldCurve";
import { useCairn, type ActionName } from "./hooks/useCairn";
import { assetsForReceipts, receiptSharesForDeposit } from "./lib/cairnMath";
import { recordedControls } from "./lib/issuerControls";
import { DEMO_VIDEO_URL, REPO_URL, feedbackUrl } from "./lib/links";
import { PAPER_CONFIG, fmt, parseAmount } from "./lib/paperMarket";
import { recordedSource } from "./lib/source";

type Tab = "Lend" | "Borrow";

const spyxControls = recordedControls.find((mint) => mint.symbol === "SPYx")!;
const replay = recordedSource;
const short = (value: string) => `${value.slice(0, 4)}...${value.slice(-4)}`;
const dateOf = (seconds: bigint) => new Date(Number(seconds) * 1000).toISOString().slice(0, 10);
const pct = (bps: bigint) => `${Number(bps) / 100}%`;

// Full-precision input text for a Max button: no grouping, no trailing zeros.
function toInput(value: bigint, decimals: number) {
  const base = 10n ** BigInt(decimals);
  const fraction = (value % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${value / base}${fraction ? `.${fraction}` : ""}`;
}

// A preview must never throw into render. Bad or empty input shows a dash.
function preview(run: () => string) {
  try {
    return run();
  } catch {
    return "—";
  }
}

function OpRow({
  id,
  label,
  unit,
  value,
  onChange,
  max,
  hint,
  button,
  onSubmit,
  disabled,
  variant = "primary",
}: {
  id: string;
  label: string;
  unit: string;
  value: string;
  onChange: (value: string) => void;
  max?: string | null;
  hint: string;
  button: string;
  onSubmit: () => void;
  disabled: boolean;
  variant?: "primary" | "secondary";
}) {
  return (
    <div className="op-row">
      <label htmlFor={id}>{label}</label>
      <div className="amount-field op-field">
        <input id={id} inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} />
        {max != null && <button type="button" className="max-button" onClick={() => onChange(max)}>Max</button>}
        <span>{unit}</span>
      </div>
      <div className="op-foot">
        <small>{hint}</small>
        <MotionButton variant={variant} onClick={onSubmit} disabled={disabled}>{button}</MotionButton>
      </div>
    </div>
  );
}

export default function App() {
  const cairn = useCairn();
  const { view, mode } = cairn;
  const [tab, setTab] = useState<Tab>("Lend");
  const [amounts, setAmounts] = useState<Record<Exclude<ActionName, "accrue">, string>>({
    deposit: "10",
    redeem: "",
    collateral: "2000",
    borrow: "4",
    repay: "",
    withdraw: "",
  });
  const set = (name: keyof typeof amounts) => (value: string) => setAmounts((current) => ({ ...current, [name]: value }));
  const act = (name: keyof typeof amounts) => () => cairn.run(name, amounts[name]);
  const locked = cairn.busy || !cairn.ready || (mode === "live" && !cairn.connected);

  const kinds = new Set(cairn.events.map((event) => event.kind));
  const steps: GuideStep[] = [
    { label: "Deposit SPYx", done: kinds.has("deposit"), target: "Lend" },
    { label: "Post USDC", done: kinds.has("collateral"), target: "Borrow" },
    { label: "Borrow SPYx", done: kinds.has("borrow"), target: "Borrow" },
    { label: mode === "paper" ? "Let 30 days pass" : "Accrue interest", done: kinds.has("time"), target: "time" },
    { label: "Repay", done: kinds.has("repay"), target: "Borrow" },
    { label: "Redeem cSPYx", done: kinds.has("redeem"), target: "Lend" },
  ];
  const onStep = (target: GuideStep["target"]) => {
    if (target === "time") {
      if (mode === "paper") cairn.advance(30);
      else cairn.run("accrue");
      return;
    }
    setTab(target);
    document.getElementById("market")?.scrollIntoView({ behavior: "smooth" });
  };

  const clock = dateOf(cairn.now);
  const feedbackHref = feedbackUrl({
    mode,
    day: clock,
    view,
    error: cairn.error,
    recent: cairn.events.slice(0, 5).map((event) => event.message),
  });

  const depositPreview = preview(() => {
    const shares = receiptSharesForDeposit(parseAmount(amounts.deposit, 8), view.receiptSupply, view.assets);
    return `${fmt(shares, 8)} cSPYx`;
  });
  const redeemPreview = preview(() => {
    const out = assetsForReceipts(parseAmount(amounts.redeem, 8), view.receiptSupply, view.assets);
    return `${fmt(out, 8)} SPYx${out > view.cash ? " · exceeds available liquidity" : ""}`;
  });
  const heroReceive = preview(() => fmt(receiptSharesForDeposit(10n * 10n ** 8n, view.receiptSupply, view.assets), 8));
  const repayMax = view.positionDebt < view.wallet.spyx ? view.positionDebt : view.wallet.spyx;
  const health = view.healthFactor;

  const paperRows: FeedRow[] = cairn.events.map((event) => ({
    key: `paper-${event.seq}`,
    seq: event.seq,
    kind: event.kind,
    meta: [dateOf(event.at), `rate ${event.exchangeRate.toFixed(6)}`],
    message: event.message,
  }));
  const recordedRows: FeedRow[] = replay.events().map((event) => ({
    key: event.signature,
    seq: event.seq,
    kind: event.kind,
    meta: [`slot ${event.slot}`, short(event.actor)],
    message: event.message,
    code: event.signature,
  }));

  return (
    <main>
      <SandboxRibbon
        mode={mode}
        clock={clock}
        steps={steps}
        feedbackHref={feedbackHref}
        onStep={onStep}
        onAdvance={cairn.advance}
        onReset={cairn.reset}
        onAccrue={() => cairn.run("accrue")}
        busy={cairn.busy}
      />
      <nav className="shell nav" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="Cairn home">
          <span className="brand-mark">C</span>
          <span>Cairn</span>
        </a>
        <div className="nav-tools">
          <div className="nav-links">
            <a href="#market">Market</a>
            <a href="#architecture">How it works</a>
            <a href="#risk">Risk gate</a>
            <a href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>
          </div>
          {mode === "live"
            ? <WalletMultiButton />
            : <span className="paper-wallet">Paper wallet</span>}
        </div>
      </nav>

      <section className="shell hero" id="top">
        <Reveal>
          <div className="hero-copy">
            <div className="eyebrow">Solana securities lending</div>
            <h1>The LST layer for tokenized equities</h1>
            <p>
              Deposit tokenized SPYx. Receive cSPYx. Market makers borrow the stock against USDC
              and pay interest back to cSPYx holders.
            </p>
            <div className="hero-actions">
              <a className="cta-primary" href="#market">Try it (paper trading) <span aria-hidden="true">↓</span></a>
              <a className="text-action" href={REPO_URL} target="_blank" rel="noreferrer">Source on GitHub <span>↗</span></a>
              {DEMO_VIDEO_URL
                ? <a className="text-action" href={DEMO_VIDEO_URL} target="_blank" rel="noreferrer">Demo video <span>↗</span></a>
                : <span className="hero-proof">Demo video soon</span>}
            </div>
            <p className="hero-note">
              No wallet needed. Paper mode runs the Cairn market in your browser with the program's own math.
            </p>
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
                <strong>{heroReceive} cSPYx</strong>
              </div>
            </div>
            <div className="receipt-rate">
              <span>Exchange rate</span>
              <strong>1 cSPYx = {view.exchangeRate.toFixed(6)} SPYx</strong>
            </div>
            <div className="receipt-foot">Yield accrues through the exchange rate, not rebases.</div>
          </div>
        </Reveal>
      </section>

      <dl className="shell kpi-bar" aria-label="SPYx market indicators">
        <div><dt>Total managed equity</dt><dd>{fmt(view.assets, 8, 2)} SPYx</dd></div>
        <div><dt>Pool utilization</dt><dd><AnimatedNumber value={view.utilizationPct} precision={2} />%</dd></div>
        <div><dt>Lender APY</dt><dd><AnimatedNumber value={view.lenderApyPct} precision={2} />%</dd></div>
        <div><dt>Exchange rate</dt><dd>1 cSPYx = {view.exchangeRate.toFixed(6)} SPYx</dd></div>
      </dl>

      <section className="market-band" id="market">
        <div className="shell market-layout">
          <div className="market-copy">
            <div className="eyebrow">{mode === "paper" ? "Paper market" : "Live market"}</div>
            <h2>SPYx in. cSPYx out.</h2>
            <p>
              One isolated market holds one equity. Borrow demand sets its rate. Other
              markets cannot spread debt or issuer risk into SPYx.
            </p>

            <div className="market-rails" aria-label="SPYx market structure">
              <div><span>Equity</span><strong>SPYx, Token-2022</strong></div>
              <div><span>Receipt</span><strong>cSPYx</strong></div>
              <div><span>Borrow collateral</span><strong>USDC</strong></div>
              <div><span>Available to withdraw now</span><strong>{fmt(view.cash, 8, 2)} SPYx ({view.availablePct.toFixed(1)}%)</strong></div>
              <div><span>Borrow APY</span><strong>{view.borrowApyPct.toFixed(2)}%</strong></div>
              <div><span>Max loan-to-value / liquidation</span><strong>{pct(cairn.config.loanToValueBps)} / {pct(cairn.config.liquidationThresholdBps)}</strong></div>
            </div>

            <section className="sandbox-ledger" aria-label="Your position">
              <div><span>Wallet</span><strong>{fmt(view.wallet.spyx, 8)} SPYx · {fmt(view.wallet.usdc, 6, 2)} USDC</strong></div>
              <div><span>cSPYx held</span><strong>{fmt(view.wallet.cspyx, 8)} ≈ {fmt(view.receiptValue, 8)} SPYx</strong></div>
              <div><span>Collateral / debt</span><strong>{fmt(view.positionCollateral, 6, 2)} USDC / {fmt(view.positionDebt, 8)} SPYx</strong></div>
              <div><span>Health factor</span><strong className={health !== null && health < 1 ? "health-danger" : ""}>{health === null ? "no debt" : health.toFixed(3)}</strong></div>
              {mode === "live" && !cairn.ready && <p>Reading the Cairn market from your validator…</p>}
              {mode === "live" && (
                <p>
                  <button type="button" className="text-button" disabled={cairn.busy || !cairn.connected} onClick={() => void cairn.seed()}>
                    Get fork test assets
                  </button>
                </p>
              )}
              {cairn.error && <p className="sandbox-error" role="alert">{cairn.error}</p>}
              {cairn.transactionUrl && <a href={cairn.transactionUrl} target="_blank" rel="noreferrer">Inspect latest transaction ↗</a>}
            </section>
          </div>

          <div className="action-card">
            <label className="stock-label" htmlFor="stock-market">Stock inventory</label>
            <select className="stock-select" id="stock-market" value="SPYx" disabled>
              <option>SPYx</option>
            </select>
            <div className="underwriting-panel">
              <div className="underwriting-head">
                <span>Audit &amp; Compliance</span>
                <strong>APPROVED BY ON-CHAIN POLICY (PASS)</strong>
              </div>
              <div><span>Permanent Delegate</span><strong title={spyxControls.seize ?? ""}>Policy-matched issuer key</strong></div>
              <div><span>Transfer Hook</span><strong>Inactive, accepted</strong></div>
              <div><span>Freeze Authority</span><strong title={spyxControls.freeze ?? ""}>Issuer-controlled, mirrored</strong></div>
              <div><span>Mint Close Authority</span><strong>Disabled</strong></div>
            </div>
            <MotionTabs value={tab} options={["Lend", "Borrow"] as const} onChange={setTab} />
            <SwapPanel panelKey={tab}>
              {tab === "Lend" ? (
                <div className="action-panel">
                  <OpRow
                    id="deposit-amount"
                    label="Deposit SPYx"
                    unit="SPYx"
                    value={amounts.deposit}
                    onChange={set("deposit")}
                    max={toInput(view.wallet.spyx, 8)}
                    hint={`You receive ${depositPreview}`}
                    button="Deposit & mint cSPYx"
                    onSubmit={act("deposit")}
                    disabled={locked}
                  />
                  <OpRow
                    id="redeem-amount"
                    label="Redeem cSPYx"
                    unit="cSPYx"
                    value={amounts.redeem}
                    onChange={set("redeem")}
                    max={toInput(view.wallet.cspyx, 8)}
                    hint={`You receive ${redeemPreview}`}
                    button="Burn cSPYx for SPYx"
                    onSubmit={act("redeem")}
                    disabled={locked}
                    variant="secondary"
                  />
                </div>
              ) : (
                <div className="action-panel">
                  <OpRow
                    id="collateral-amount"
                    label="Post USDC collateral"
                    unit="USDC"
                    value={amounts.collateral}
                    onChange={set("collateral")}
                    max={toInput(view.wallet.usdc, 6)}
                    hint={`Posted ${fmt(view.positionCollateral, 6, 2)} USDC`}
                    button="Post collateral"
                    onSubmit={act("collateral")}
                    disabled={locked}
                  />
                  <OpRow
                    id="borrow-amount"
                    label="Borrow SPYx"
                    unit="SPYx"
                    value={amounts.borrow}
                    onChange={set("borrow")}
                    max={toInput(view.maxBorrow, 8)}
                    hint={`Limit ${fmt(view.maxBorrow, 8)} SPYx at ${pct(cairn.config.loanToValueBps)} LTV`}
                    button="Borrow SPYx"
                    onSubmit={act("borrow")}
                    disabled={locked}
                  />
                  <OpRow
                    id="repay-amount"
                    label="Repay SPYx"
                    unit="SPYx"
                    value={amounts.repay}
                    onChange={set("repay")}
                    max={toInput(repayMax, 8)}
                    hint={`Debt ${fmt(view.positionDebt, 8)} SPYx, interest included`}
                    button="Repay"
                    onSubmit={act("repay")}
                    disabled={locked}
                    variant="secondary"
                  />
                  <OpRow
                    id="withdraw-amount"
                    label="Withdraw USDC collateral"
                    unit="USDC"
                    value={amounts.withdraw}
                    onChange={set("withdraw")}
                    max={view.positionDebt === 0n ? toInput(view.positionCollateral, 6) : null}
                    hint="Must stay within the LTV while debt is open"
                    button="Withdraw"
                    onSubmit={act("withdraw")}
                    disabled={locked}
                    variant="secondary"
                  />
                </div>
              )}
            </SwapPanel>
            <p className="microcopy action-note">
              {mode === "paper"
                ? "Paper mode: every action runs in your browser with the program's math and checks. No wallet, no funds."
                : "Live mode: actions are signed by your wallet and submitted to Cairn."}
            </p>
          </div>
        </div>
      </section>

      <section className="shell curve-section">
        <YieldCurve config={cairn.config} utilization={view.utilizationPct} />
      </section>

      <section className="shell activity-section" id="activity">
        {mode === "paper" && (
          <Feed
            eyebrow="Paper session"
            title="Your paper trades."
            sourceLabel="Simulated"
            sourceValue="SPYx / USDC"
            rows={paperRows}
            empty="No trades yet. Start with Deposit SPYx in the ribbon above."
            caveat={`The market opens with fixture history: 1,000 SPYx deposited, 600 SPYx borrowed, 30 days accrued. Rates: base ${pct(PAPER_CONFIG.baseRateBps)}, kink ${pct(PAPER_CONFIG.kinkBps)}. Prices: fork fixtures.`}
          />
        )}
        <Feed
          eyebrow="Fork activity"
          title="The full lending loop, on-chain."
          sourceLabel="Recorded replay"
          sourceValue={replay.meta().market}
          rows={recordedRows}
          caveat={replay.meta().caveats.join(" ")}
        />
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
            <strong>Verified on a local mainnet-mint fork. Not on devnet or mainnet yet.</strong>
          </div>
        </div>
      </footer>
    </main>
  );
}
