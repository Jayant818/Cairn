import { useEffect, useState } from "react";
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
import { GuideCard } from "./components/Guide";
import { SandboxRibbon } from "./components/SandboxRibbon";
import { Tour } from "./components/Tour";
import { tourDone } from "./lib/tourStore";
import { WalletChip } from "./components/WalletChip";
import { YieldCurve } from "./components/YieldCurve";
import { useCairn, type ActionName } from "./hooks/useCairn";
import { assetsForReceipts, collateralForLiquidation, receiptSharesForDeposit } from "./lib/cairnMath";
import { recordedControls } from "./lib/issuerControls";
import { DEMO_VIDEO_URL, REPO_URL, feedbackUrl } from "./lib/links";
import { GUIDE_LABELS, guideOf } from "./lib/guide";
import { GENESIS, PAPER_CONFIG, PAPER_SEEDED, fmt, healthyAt, parseAmount } from "./lib/paperMarket";
import { recordedSource } from "./lib/source";

type Tab = "Lend" | "Borrow" | "Liquidate";

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
  problem,
  alwaysShowProblem = false,
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
  problem: string | null;
  alwaysShowProblem?: boolean;
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
        {(() => {
          const show = problem && (alwaysShowProblem || value.trim());
          return <small className={show ? "op-problem" : ""}>{show ? problem : hint}</small>;
        })()}
        <MotionButton variant={variant} onClick={onSubmit} disabled={disabled || Boolean(problem)}>{button}</MotionButton>
      </div>
    </div>
  );
}

export default function App() {
  const cairn = useCairn();
  const { view, mode } = cairn;
  const [tab, setTab] = useState<Tab>("Lend");
  const [amounts, setAmounts] = useState<Record<Exclude<ActionName, "accrue"> | "liquidate", string>>({
    deposit: "10",
    redeem: "",
    collateral: "2000",
    borrow: "4",
    repay: "",
    withdraw: "",
    liquidate: "",
  });
  const set = (name: keyof typeof amounts) => (value: string) => setAmounts((current) => ({ ...current, [name]: value }));
  const act = (name: Exclude<keyof typeof amounts, "liquidate">) => () => cairn.run(name, amounts[name]);
  const locked = cairn.busy || !cairn.ready || (mode === "live" && !cairn.connected);

  const guide = guideOf(cairn.events, view);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [touring, setTouring] = useState(false);
  // First visit opens the tour. Runs after mount, so server render and first paint stay tour-free.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    if (mode === "paper" && !tourDone()) setTouring(true);
  }, [mode]);
  const openAdvanced = (next: Tab) => {
    setTab(next);
    setAdvancedOpen(true);
    requestAnimationFrame(() => document.getElementById("market")?.scrollIntoView({ behavior: "smooth" }));
  };
  const day = Number((cairn.now - GENESIS) / 86_400n);
  const progress = guide.completed === 4
    ? "Guided path done"
    : `Step ${guide.completed + 1} of 4 — ${GUIDE_LABELS[guide.completed]}`;

  // Each action says why it cannot run BEFORE the click. The program would reject the same inputs.
  const tryParse = (value: string, decimals: number) => {
    try { return parseAmount(value, decimals); } catch { return null; }
  };
  const need = (value: string, decimals: number, check: (raw: bigint) => string | null) => {
    const raw = tryParse(value, decimals);
    return raw === null ? "Enter an amount above zero." : check(raw);
  };
  const problems = {
    deposit: need(amounts.deposit, 8, (raw) => raw > view.wallet.spyx ? `You have ${fmt(view.wallet.spyx, 8)} SPYx. Use Max.` : null),
    redeem: need(amounts.redeem, 8, (raw) => {
      if (raw > view.wallet.cspyx) return `You hold ${fmt(view.wallet.cspyx, 8)} cSPYx. Use Max.`;
      try {
        if (assetsForReceipts(raw, view.receiptSupply, view.assets) > view.cash) return "The pool has too little idle SPYx. A borrower must repay first.";
      } catch { return "You hold no cSPYx yet. Lend SPYx first."; }
      return null;
    }),
    collateral: need(amounts.collateral, 6, (raw) => raw > view.wallet.usdc ? `You have ${fmt(view.wallet.usdc, 6, 2)} USDC. Use Max.` : null),
    borrow: need(amounts.borrow, 8, (raw) => {
      if (view.positionCollateral === 0n) return "Post USDC collateral first.";
      return raw > view.maxBorrow ? `Your limit is ${fmt(view.maxBorrow, 8)} SPYx. Post more USDC or borrow less.` : null;
    }),
    repay: need(amounts.repay, 8, (raw) => {
      if (view.positionDebt === 0n) return "You have no debt to repay.";
      if (raw > view.positionDebt) return `You owe ${fmt(view.positionDebt, 8)} SPYx. Use Max.`;
      return raw > view.wallet.spyx ? `You have ${fmt(view.wallet.spyx, 8)} SPYx. Use Max.` : null;
    }),
    withdraw: need(amounts.withdraw, 6, (raw) => {
      if (raw > view.positionCollateral) return `You posted ${fmt(view.positionCollateral, 6, 2)} USDC.`;
      if (view.positionDebt > 0n && !healthyAt(view.positionCollateral - raw, view.positionDebt, cairn.config.loanToValueBps, cairn.prices)) {
        return "That would break the 50% loan limit. Repay first or withdraw less.";
      }
      return null;
    }),
  };

  const liq = cairn.liquidation;
  const liqMax = liq.sample.maxRepay < view.wallet.spyx ? liq.sample.maxRepay : view.wallet.spyx;
  const liquidateProblem = !liq.sample.liquidatable
    ? `The sample borrower is healthy (health ${cairn.sampleView.healthFactor?.toFixed(3) ?? "—"}). Move the SPYx price up first.`
    : need(amounts.liquidate, 8, (raw) => {
      if (raw > liq.sample.maxRepay) return `The close factor caps one repay at ${fmt(liq.sample.maxRepay, 8)} SPYx. Use Max.`;
      return raw > view.wallet.spyx ? `You have ${fmt(view.wallet.spyx, 8)} SPYx. Use Max.` : null;
    });
  const liquidatePreview = preview(() => {
    const seize = collateralForLiquidation(
      parseAmount(amounts.liquidate, 8), 8, 6, cairn.prices.equityDebt, cairn.prices.collateral, cairn.config.liquidationBonusBps,
    );
    return `≈ ${fmt(seize, 6, 2)} USDC (includes the ${pct(cairn.config.liquidationBonusBps)} bonus)`;
  });

  const feedbackHref = feedbackUrl({
    mode,
    day: `day ${day} (${dateOf(cairn.now)})`,
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
        day={day}
        progress={progress}
        feedbackHref={feedbackHref}
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
          <WalletChip wallet={view.wallet} label={mode === "live" ? "Your wallet" : "Paper wallet"} />
          {mode === "live" && <WalletMultiButton />}
          <button type="button" className="nav-tour" onClick={() => setTouring(true)}>Tour</button>
        </div>
      </nav>

      <section className="shell hero" id="top">
        <Reveal>
          <div className="hero-copy" data-tour="intro">
            <div className="eyebrow">Solana securities lending</div>
            <h1>The LST layer for tokenized equities</h1>
            <p>
              Lend your tokenized stock. Earn the interest market makers pay to borrow it.
              Your receipt, cSPYx, is worth more SPYx every day.
            </p>
            <div className="hero-actions">
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
          <GuideCard
            guide={guide}
            view={view}
            live={mode === "live"}
            onLend={() => cairn.run("deposit", toInput(guide.lendAmount, 8))}
            onSkip={() => cairn.advance(30)}
            onWithdraw={() => cairn.run("redeem", toInput(view.wallet.cspyx, 8))}
            onBorrowerSide={() => openAdvanced("Borrow")}
            onReset={cairn.reset}
          />
          {!advancedOpen && cairn.error && <p className="sandbox-error guide-error" role="alert">{cairn.error}</p>}
        </Reveal>
      </section>

      <section className="shell stats" data-tour="stats" aria-label="SPYx market indicators">
        <dl className="kpi-bar">
          <div><dt>Total managed equity</dt><dd>{fmt(view.assets, 8, 2)} SPYx</dd><p>All the SPYx lenders put in, plus interest owed to them.</p></div>
          <div><dt>Pool utilization</dt><dd><AnimatedNumber value={view.utilizationPct} precision={2} />%</dd><p>How much of the pool is lent out now. More demand, more yield.</p></div>
          <div><dt>Lender APY</dt><dd><AnimatedNumber value={view.lenderApyPct} precision={2} />%</dd><p>What a lender earns per year at today's demand.</p></div>
          <div><dt>Exchange rate</dt><dd>1 cSPYx = {view.exchangeRate.toFixed(6)} SPYx</dd><p>What your receipt is worth. It only goes up.</p></div>
        </dl>
        {mode === "paper" && (
          <p className="stats-note">
            {PAPER_SEEDED
              ? "Simulated market: 1 sample lender (1,000 SPYx) + 1 sample borrower (600 SPYx), 30 days of history. Your actions change it."
              : "Simulated market: empty. With no borrower, lenders earn 0%."}
          </p>
        )}
      </section>

      <details
        className="market-band advanced"
        id="market"
        open={advancedOpen}
        onToggle={(event) => setAdvancedOpen((event.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className="shell advanced-summary">
          <span>Try the borrower side and custom amounts</span>
          <small>Post USDC, borrow SPYx, repay, and lend any amount.</small>
        </summary>
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
              {advancedOpen && cairn.error && <p className="sandbox-error" role="alert">{cairn.error}</p>}
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
            {mode === "paper" && cairn.equityPrice !== null && (
              <div className="oracle-row" aria-label="Paper oracle">
                <div>
                  <span>SPYx price (paper oracle)</span>
                  <strong>${fmt(cairn.equityPrice, 8, 2)}</strong>
                </div>
                <div className="oracle-buttons">
                  <button type="button" onClick={() => cairn.movePrice(-10)}>−10%</button>
                  <button type="button" onClick={() => cairn.movePrice(10)}>+10%</button>
                  <button type="button" onClick={() => cairn.movePrice(25)}>+25%</button>
                  <button type="button" onClick={cairn.resetPrice}>Reset</button>
                </div>
                <small>Debt is in SPYx, collateral in USDC. When SPYx rises, borrowers get closer to liquidation.</small>
              </div>
            )}
            <MotionTabs value={tab} options={["Lend", "Borrow", "Liquidate"] as const} onChange={setTab} />
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
                    problem={problems.deposit}
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
                    problem={problems.redeem}
                    variant="secondary"
                  />
                </div>
              ) : tab === "Borrow" ? (
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
                    problem={problems.collateral}
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
                    problem={problems.borrow}
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
                    problem={problems.repay}
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
                    problem={problems.withdraw}
                    variant="secondary"
                  />
                  {view.positionDebt > 0n && (
                    <div className={`risk-panel${liq.own.liquidatable ? " risk-panel-danger" : ""}`}>
                      {liq.own.liquidatable ? (
                        <>
                          <strong>Your position can be liquidated (health {health?.toFixed(3)}).</strong>
                          <p>Anyone may repay up to {fmt(liq.own.maxRepay, 8)} SPYx of your debt and take that value in your USDC, plus a {pct(cairn.config.liquidationBonusBps)} bonus.</p>
                          <MotionButton variant="secondary" onClick={cairn.liquidateOwn} disabled={mode !== "paper"}>Let a liquidator act</MotionButton>
                        </>
                      ) : (
                        <p>Health {health?.toFixed(3)}. Below 1.000, anyone can liquidate you. Try the SPYx price +25% above to see it happen.</p>
                      )}
                    </div>
                  )}
                </div>
              ) : tab === "Liquidate" ? (
                <div className="action-panel">
                  {mode !== "paper" ? (
                    <p className="microcopy">Liquidation runs in paper mode. Open the page with ?mode=paper.</p>
                  ) : (
                    <>
                      <div className="risk-panel">
                        <strong>Sample borrower</strong>
                        <p>
                          Debt {fmt(cairn.sampleView.positionDebt, 8, 2)} SPYx · collateral {fmt(cairn.sampleView.positionCollateral, 6, 0)} USDC ·
                          health {cairn.sampleView.healthFactor?.toFixed(3) ?? "—"}
                        </p>
                      </div>
                      <OpRow
                        id="liquidate-amount"
                        label="Repay their SPYx debt"
                        unit="SPYx"
                        value={amounts.liquidate}
                        onChange={set("liquidate")}
                        max={liq.sample.liquidatable ? toInput(liqMax, 8) : null}
                        hint={`You get ${liquidatePreview}`}
                        button="Liquidate"
                        onSubmit={() => { const raw = tryParse(amounts.liquidate, 8); if (raw !== null) cairn.liquidateSample(raw); }}
                        disabled={locked}
                        problem={liquidateProblem}
                        alwaysShowProblem
                      />
                      <p className="microcopy">A liquidator repays part of an unhealthy loan and takes the borrower's USDC at a discount. That keeps lenders whole.</p>
                    </>
                  )}
                </div>
              ) : null}
            </SwapPanel>
            <p className="microcopy action-note">
              {mode === "paper"
                ? "Paper mode: every action runs in your browser with the program's math and checks. No wallet, no funds."
                : "Live mode: actions are signed by your wallet and submitted to Cairn."}
            </p>
          </div>
        </div>
      </details>

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
      <Tour open={touring} onClose={() => setTouring(false)} />
    </main>
  );
}
