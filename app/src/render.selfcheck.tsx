import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import App from "./App";
import { recordedSource, perShare, plottable } from "./lib/source";

const html = renderToStaticMarkup(<App />);
const plain = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const must = (n: string, why: string) => {
  if (!html.includes(n)) throw new Error(`MISSING: ${why} (looked for ${JSON.stringify(n)})`);
};

// ── the headline must not be the falsifiable one ────────────────────────────
// ⛔ "Take out more than you put in" was FALSIFIABLE WITH OUR OWN FIXTURE. Recomputed here
// so the check owns the number rather than trusting a memo: total +4.7245%, of which ONE
// one-leg redemption contributes +4.1172%. The honest fee ratchet is +0.5833% against a
// 1.99% round trip — a normal depositor is 3.41x underwater. A judge does that in minutes.
{
  const S = plottable(recordedSource.steps());
  const r = (s: (typeof S)[number]) => Number(BigInt(s.held[0])) / Number(BigInt(s.shareSupply));
  const total = (r(S[S.length - 1]) / r(S[0]) - 1) * 100;
  let mask = 1, other = 1;
  for (let i = 1; i < S.length; i++) {
    const m = r(S[i]) / r(S[i - 1]);
    if (S[i].sleeveMask === 0b10) mask *= m; else other *= m;
  }
  if (Math.abs(total - 4.7245) > 0.01) throw new Error(`fixture moved: total ${total}`);
  if ((mask - 1) * 100 < (other - 1) * 100)
    throw new Error("the one-leg redeem no longer dominates — recheck the honesty copy");
  if (/take out more than you put in/i.test(plain))
    throw new Error("the falsifiable headline is back on the page");
  // and the page must SAY the split rather than let the chart imply the whole gain is fees
  must("+4.1172", "the one-leg redeem's share of the gain, stated on the graphic");
  must("+0.5833%", "the honest fee ratchet, stated on the graphic");
}

must("everyone who comes in or goes out leaves 1% behind", "the ruled H1");
must("every time anyone else trades", "the ruled sub");
// ⛔ "trades" not "waits": the moment it implies TIME it is an interest-rate claim we cannot
// keep. Do not let a later edit soften it.
if (/every time anyone else (waits|earns)|per year|\bAPY\b|\byield\b/i.test(plain))
  throw new Error("the sub implies time or yield — that is an interest-rate claim");

must("View the program on Solana Explorer", "the primary action");
// ⛔ no "vault" language for anything on a public cluster
const fold = plain.slice(0, plain.indexOf("One pot"));
if (/vault/i.test(fold)) throw new Error("the fold claims a vault on a public cluster");

// ⛔ the chart that required a defence is gone
if (/The stock leg, in total/.test(plain)) throw new Error("StockLegChart is back");
must("Its dollar value still falls", "the loss-absorption disclosure that replaced it");

// every signature still reachable
for (const s of recordedSource.steps())
  if (!html.includes(s.signature)) throw new Error(`signature ${s.signature.slice(0, 8)} missing`);

// ── colour semantics, structurally ──────────────────────────────────────────
// seafoam is on the monotone series; the loss-absorption line is cobalt; orange appears for
// issuer risk and the honesty annotation and nowhere else.
must("var(--seafoam)", "the monotone series in seafoam");
must("var(--cobalt)", "the loss-absorption line in the market colour");

// ── the hero must be VISIBLE AT REST ────────────────────────────────────────
// ⛔ THIS SHIPPED BROKEN ONCE. The staircase's resting state was stroke-dashoffset 0.98,
// i.e. 98% HIDDEN, and only rAF revealed it — so SSR, reduced-motion users, screenshots,
// crawlers and OG cards all saw an empty black half-fold. The geometry was perfect and
// every existing check passed, because they all asked whether the element EXISTS.
// ⭐ A check that reads the DOM cannot see a paint — but it CAN see this, because the
// resting offset is in the markup. This closes the specific hole, not the general one.
{
  const m = html.match(/stroke-dashoffset:\s*([0-9.]+)/);
  if (!m) throw new Error("control failed: no stroke-dashoffset in the markup at all");
  if (Number(m[1]) !== 0)
    throw new Error(`the hero is ${(Number(m[1]) * 100).toFixed(1)}% hidden at rest — ` +
                    `animation must be an enhancement, never the only path to visible`);
}

// ── the product is CAIRN ────────────────────────────────────────────────────
// ⛔ The old name must not survive anywhere a reader can see it. The PROGRAM keeps its
// identity — crate, program id, on-chain accounts, file paths under programs/ — because it
// is deployed at 5RaETrSZ… and a rename that reaches it is a redeploy. This checks the
// RENDERED MARKUP only, which is exactly the boundary between the two.
{
  if (/stockpump/i.test(html))
    throw new Error("the old product name is still in the rendered page");
  if (!/Cairn/.test(html))
    throw new Error("control failed: the wordmark is not in the page at all");
}

// ── the headline figure must be the REAL final value ────────────────────────
// ⛔ IT READ 0.00000000 AND THE CAUSE WAS NOT THE RESTING STATE — `perShare` already divides
// by 10**decimals and the render divided AGAIN, so the figure was wrong at EVERY frame,
// animated or not. It rendered, it was the right shape, it was in the DOM, and every
// existing assertion passed. ⭐ A VALUE CAN BE PRESENT AND WRONG; "it renders" is not a test.
{
  const S = plottable(recordedSource.steps());
  const last = S[S.length - 1];
  const dp = recordedSource.meta().sleeves[0].decimals;
  const want = perShare(last.held[0], last.shareSupply, dp)!.toFixed(dp);
  if (!html.includes(`>${want}<`))
    throw new Error(`the hero figure is not the final per-share value (${want})`);
  if (/>0\.0{8}</.test(html))
    throw new Error("the hero figure renders as zero");
}

// ── tread labels must not repeat into mush ──────────────────────────────────
// ⛔ Six identical "someone deposited" labels overlapped along the axis. First and last only.
{
  const n = (html.match(/someone deposited/g) ?? []).length;
  if (n > 1) throw new Error(`${n} identical tread labels — they overlap into mush`);
}

// ── orange is spent ONCE, and only on issuer risk ───────────────────────────
// ⛔ It was spent FOUR times: the feed, two places in the staircase, and the risk box.
// Colouring the last-riser annotation orange says "danger" about the product's best moment
// and drains the one signal that has to mean something.
{
  const n = (html.match(/var\(--orange\)/g) ?? []).length;
  if (n !== 1) throw new Error(`orange used ${n}x — the ruling is ONCE, on issuer risk only`);
}

// ── an undefined CSS var fails SILENTLY, so cross-reference every one used ──
{
  const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");
  const defined = new Set([...css.matchAll(/^\s+(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]));
  const used = new Set([...html.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]));
  const missing = [...used].filter((v) => !defined.has(v));
  if (missing.length) throw new Error(`CSS vars used but never defined: ${missing.join(", ")}`);
  if (!defined.has("--seafoam")) throw new Error("control failed: index.css was not read");
}

// ── the prose budget ────────────────────────────────────────────────────────
// Under 80 words on the whole page, excluding the two ruled hero lines (47 words, fixed by
// the ruling) and excluding mono identifiers, which are data rather than prose.
// ⛔ THE BUDGET IS ABOUT PROSE, SO THE COUNTER MUST MEASURE PROSE. An earlier version
// counted every word in the markup and read 135 against a cap of 80 — but that swept in the
// nav, the CTA, field labels, headings and the footer's identifiers, none of which are
// sentences. Cutting copy to satisfy a counter that measures the wrong thing would have been
// the worst kind of compliance.
// RULE, stated so it can be argued with: a sentence ends in a full stop. Headings, labels
// and identifiers do not. The feed is nine transaction ROWS — labels and amounts are data.
// The two hero lines are fixed by the ruling and excluded.
const HERO_LINES = [
  "A pot of tokenized",           // the ruled H1, first clause
  "— so the stock behind your",   // ...and its tail: the h1 is SPLIT ACROSS TWO ELEMENTS for
                                  // treatment, so the counter sees two blocks where the
                                  // ruling has one sentence. Anchored on the exact ruled
                                  // clause so the exclusion cannot quietly swallow new prose.
  "You already hold tokenized",   // the ruled sub
];
const noMono = html.replace(/<(span|div|a)[^>]*class="[^"]*mono[^"]*"[^>]*>.*?<\/\1>/g, " ");
const feedStart = noMono.indexOf("Every transaction");
const outsideFeed =
  noMono.slice(0, feedStart) + noMono.slice(noMono.indexOf("</section>", feedStart));
const blocks = outsideFeed
  .replace(/<[^>]+>/g, "\n")
  .split("\n")
  .map((s) => s.replace(/&amp;/g, "&").replace(/&#x27;/g, "'").trim())
  .filter((s) => s.includes(".") && /[a-z]{3}/i.test(s))
  .filter((s) => !HERO_LINES.some((h) => s.startsWith(h)));
const prose = blocks.reduce(
  (n, s) => n + s.split(/\s+/).filter((w) => /[a-z]/i.test(w) && w.length > 1).length, 0);
if (prose > 80) {
  for (const b of blocks) console.error("  " + b.slice(0, 90));
  throw new Error(`prose budget blown: ${prose} words (cap 80)`);
}
// control: the counter must be able to SEE the sentences it is scoring
if (blocks.length < 4) throw new Error("control failed: the prose scan found almost nothing");

console.log(`render selfcheck PASS — ${html.length} B · prose ${prose}/80 words · all ${recordedSource.steps().length} signatures`);
void perShare;
