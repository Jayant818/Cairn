import { GUIDE_LABELS, type Guide } from "../lib/guide";
import { fmt, type MarketView } from "../lib/paperMarket";

// Simulated dollar value of a raw SPYx amount at the paper oracle price (per raw unit).
const usd = (raw: bigint, pricePerRaw: bigint) => {
  const cents = (raw * pricePerRaw) / 10n ** 8n / 10n ** 10n;
  return `$${(Number(cents) / 100).toFixed(2)}`;
};
import { MotionButton } from "./MotionUI";

type GuideProps = {
  guide: Guide;
  pricePerRaw: bigint;
  view: MarketView;
  live: boolean;
  onLend: () => void;
  onSkip: () => void;
  onWithdraw: () => void;
  onBorrowerSide: () => void;
  onReset: () => void;
};

export function GuideCard({ guide, pricePerRaw, view, live, onLend, onSkip, onWithdraw, onBorrowerSide, onReset }: GuideProps) {
  const rate = view.exchangeRate.toFixed(6);

  let title: string;
  let body: string;
  let forYou: string;
  let action: { label: string; run: () => void } | null;
  switch (guide.step) {
    case "lend":
      title = `Lend ${fmt(guide.lendAmount, 8, 0)} SPYx`;
      body = "You deposit tokenized S&P 500 stock. Cairn gives you cSPYx: your SPYx, still liquid, now lent out.";
      forYou = "For you: you keep a transferable receipt, and market makers pay interest to borrow the stock.";
      action = { label: `Lend ${fmt(guide.lendAmount, 8, 0)} SPYx`, run: onLend };
      break;
    case "skip":
      title = `You hold ${fmt(view.wallet.cspyx, 8)} cSPYx`;
      body = `cSPYx is your SPYx in receipt form. You can transfer it, use it as collateral, or redeem it from idle cash, with no 3-day unwind. Each one is worth ${rate} SPYx today, and that only goes up.`;
      forYou = "For you: skip ahead to see a month of borrower interest land on your receipt.";
      action = { label: "Skip 30 days", run: onSkip };
      break;
    case "withdraw":
      title = `Your cSPYx is now worth ${fmt(view.receiptValue, 8)} SPYx (${usd(view.receiptValue, pricePerRaw)})`;
      body = `You put in ${fmt(guide.deposited, 8)} SPYx. Withdraw to burn the receipt and get your stock back with interest.`;
      forYou = "For you: this is the moment the yield becomes real SPYx in your wallet.";
      action = { label: "Withdraw and see my profit", run: onWithdraw };
      break;
    default:
      title = `Your SPYx is back, plus ${fmt(guide.profit, 8)} SPYx`;
      body = `That is +${usd(guide.profit, pricePerRaw)} in ${Math.round(guide.days)} simulated days on ${fmt(guide.deposited, 8, 0)} SPYx, paid by market makers who borrowed it. For the whole month your position stayed a liquid receipt. How much it earns depends on borrow demand (see the yield formula).`;
      forYou = "Next: see the other side. A market maker posts USDC and borrows SPYx.";
      action = { label: "Try the borrower side", run: onBorrowerSide };
  }

  return (
    <section className="guide-card" aria-labelledby="guide-title">
      <div className="guide-top">
        <span className="eyebrow">Try it (paper trading)</span>
        <span className="guide-count">{guide.completed === 4 ? "Done" : `Step ${Math.min(guide.completed + 1, 4)} of 4`}</span>
      </div>
      <ol className="guide-steps" aria-label="Your progress">
        {GUIDE_LABELS.map((label, index) => (
          <li key={label} className={index < guide.completed ? "guide-done" : index === guide.completed ? "guide-now" : ""}>
            <span>{index < guide.completed ? "✓" : index + 1}</span>{label}
          </li>
        ))}
      </ol>
      <h2 id="guide-title" className={guide.step === "done" ? "guide-profit" : ""}>{title}</h2>
      <p className="guide-body">{body}</p>
      {live ? (
        <p className="guide-for-you">The guided path runs in paper mode. Open the page with ?mode=paper to use it.</p>
      ) : (
        <>
          {action && (
            <div className="guide-action" data-coach="guide-primary">
              <MotionButton onClick={action.run} disabled={Boolean(guide.blocked)}>{action.label}</MotionButton>
            </div>
          )}
          <p className={guide.blocked ? "guide-for-you guide-blocked" : "guide-for-you"}>{guide.blocked ?? forYou}</p>
          {guide.step === "done" && (
            <button type="button" className="text-button" onClick={onReset}>Start over with a fresh market</button>
          )}
        </>
      )}
    </section>
  );
}
