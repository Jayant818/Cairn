import { GUIDE_LABELS, type Guide } from "../lib/guide";
import { fmt, type MarketView } from "../lib/paperMarket";
import { MotionButton } from "./MotionUI";

type GuideProps = {
  guide: Guide;
  view: MarketView;
  live: boolean;
  onLend: () => void;
  onSkip: () => void;
  onWithdraw: () => void;
  onBorrowerSide: () => void;
  onReset: () => void;
};

export function GuideCard({ guide, view, live, onLend, onSkip, onWithdraw, onBorrowerSide, onReset }: GuideProps) {
  const rate = view.exchangeRate.toFixed(6);
  const apy = guide.days > 0 && guide.deposited > 0n
    ? (Number(guide.profit) / Number(guide.deposited)) * (365 / guide.days) * 100
    : 0;

  let title: string;
  let body: string;
  let forYou: string;
  let action: { label: string; run: () => void } | null;
  switch (guide.step) {
    case "lend":
      title = `Lend ${fmt(guide.lendAmount, 8, 0)} SPYx`;
      body = "You deposit tokenized S&P 500 stock. Cairn gives you cSPYx, a receipt you can hold or trade.";
      forYou = "For you: your stock starts earning the interest that market makers pay to borrow it.";
      action = { label: `Lend ${fmt(guide.lendAmount, 8, 0)} SPYx`, run: onLend };
      break;
    case "skip":
      title = `You hold ${fmt(view.wallet.cspyx, 8)} cSPYx`;
      body = `cSPYx is your receipt. Each one is worth ${rate} SPYx today, and that number only goes up as borrowers pay interest.`;
      forYou = "For you: skip ahead to see a month of interest land on your receipt.";
      action = { label: "Skip 30 days", run: onSkip };
      break;
    case "withdraw":
      title = `Your cSPYx is now worth ${fmt(view.receiptValue, 8)} SPYx`;
      body = `You put in ${fmt(guide.deposited, 8)} SPYx. Withdraw to burn the receipt and get your stock back with interest.`;
      forYou = "For you: this is the moment the yield becomes real SPYx in your wallet.";
      action = { label: "Withdraw and see my profit", run: onWithdraw };
      break;
    default:
      title = `You earned +${fmt(guide.profit, 8)} SPYx`;
      body = `On ${fmt(guide.deposited, 8, 0)} SPYx over ${Math.round(guide.days)} simulated days${apy > 0 ? `, about ${apy.toFixed(2)}% a year` : ""}. Market makers paid it to borrow the stock.`;
      forYou = "Next: see the other side. A market maker posts USDC and borrows SPYx.";
      action = { label: "Try the borrower side", run: onBorrowerSide };
  }

  return (
    <section className="guide-card" aria-labelledby="guide-title" data-tour="guide">
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
            <MotionButton onClick={action.run} disabled={Boolean(guide.blocked)}>{action.label}</MotionButton>
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
