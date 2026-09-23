import type { MarketView } from "./paperMarket";

export const REPO_URL = "https://github.com/Jayant818/Cairn";
// TODO(Jayant): paste the demo video URL here. The page shows "coming soon" while it is empty.
export const DEMO_VIDEO_URL = "";

type FeedbackContext = {
  mode: string;
  day: string;
  view: MarketView;
  error: string | null;
  recent: string[];
};

// No backend: the report is a prefilled GitHub issue that the visitor reviews and submits.
export function feedbackUrl({ mode, day, view, error, recent }: FeedbackContext) {
  const body = [
    "### What did you try?",
    "",
    "### What happened?",
    "",
    "### What did you expect?",
    "",
    "---",
    "Context (filled in by the page):",
    `- mode: ${mode}`,
    `- paper clock: ${day}`,
    `- exchange rate: ${view.exchangeRate.toFixed(8)} SPYx per cSPYx`,
    `- utilization: ${view.utilizationPct.toFixed(2)}%`,
    `- last error: ${error ?? "none"}`,
    `- recent actions: ${recent.length ? recent.join(" | ") : "none"}`,
    `- browser: ${typeof navigator === "undefined" ? "unknown" : navigator.userAgent}`,
  ].join("\n");
  const params = new URLSearchParams({ title: "Paper trading: ", body, labels: "paper-feedback" });
  return `${REPO_URL}/issues/new?${params.toString()}`;
}
