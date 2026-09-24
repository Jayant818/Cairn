// The guided lender path: Lend -> hold cSPYx -> skip 30 days -> withdraw.
// Pure functions of paper state, so the path is derived, never stored, and cannot drift.
import { assetsForReceipts } from "./cairnMath";
import { SPYX, type MarketView, type PaperEvent } from "./paperMarket";

export type GuideStep = "lend" | "skip" | "withdraw" | "done";

export const GUIDE_LABELS = ["Lend SPYx", "Hold cSPYx", "Skip 30d", "Withdraw"] as const;
export const GUIDE_LEND_AMOUNT = 5n * SPYX;

export type Guide = {
  step: GuideStep;
  // Number of GUIDE_LABELS finished, 0..4.
  completed: number;
  lendAmount: bigint;
  blocked: string | null;
  deposited: bigint;
  redeemed: bigint;
  profit: bigint;
  days: number;
};

export function guideOf(events: PaperEvent[], view: MarketView): Guide {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  const firstDeposit = ordered.find((event) => event.kind === "deposit");
  const skip = firstDeposit && ordered.find((event) => event.kind === "time" && event.seq > firstDeposit.seq);
  const deposited = ordered.filter((e) => e.kind === "deposit").reduce((sum, e) => sum + (e.spyx ?? 0n), 0n);
  const redeems = ordered.filter((e) => e.kind === "redeem");
  const redeemed = redeems.reduce((sum, e) => sum + (e.spyx ?? 0n), 0n);
  const lastRedeem = redeems.at(-1);
  const days = firstDeposit && lastRedeem ? Number(lastRedeem.at - firstDeposit.at) / 86_400 : 0;

  const step: GuideStep = !firstDeposit ? "lend"
    : !skip ? "skip"
    : view.wallet.cspyx > 0n ? "withdraw"
    : "done";
  const completed = { lend: 0, skip: 2, withdraw: 3, done: 4 }[step];

  const lendAmount = view.wallet.spyx < GUIDE_LEND_AMOUNT ? view.wallet.spyx : GUIDE_LEND_AMOUNT;
  let blocked: string | null = null;
  if (step === "lend" && lendAmount === 0n) blocked = "Your paper wallet has no SPYx left. Press Reset to start over.";
  if (step === "withdraw" && view.receiptSupply > 0n) {
    const out = assetsForReceipts(view.wallet.cspyx, view.receiptSupply, view.assets);
    if (out > view.cash) blocked = "The pool has too little idle SPYx right now. A borrower must repay first.";
  }
  return { step, completed, lendAmount, blocked, deposited, redeemed, profit: redeemed - deposited, days };
}
