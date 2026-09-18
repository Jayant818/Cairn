import { readFileSync } from "node:fs";
import React from "react";
// Render the real component tree to a string and assert the page actually says the things
// the build is conditioned on. No browser: a headless render catches "the component threw"
// and "the honesty line is missing", which are the two failures that matter here.
//
// ⛔ Every assertion below is a CONDITION OF THE BUILD, not a nice-to-have:
//    the recorded-run banner is ON THE PAGE · nothing implies live state ·
//    the mask-redeem forfeit is stated · seafoam is only ever on the two monotone series.
// Run: npx tsx src/render.selfcheck.tsx
import { renderToStaticMarkup } from "react-dom/server";
import App from "./App";
import { recordedSource, perShare } from "./lib/source";

const html = renderToStaticMarkup(<App />);
const must = (needle: string, why: string) => {
  if (!html.includes(needle)) throw new Error(`MISSING: ${why} (looked for ${JSON.stringify(needle)})`);
};
const mustNot = (re: RegExp, why: string) => {
  const m = html.match(re);
  if (m) throw new Error(`FORBIDDEN: ${why} — found ${JSON.stringify(m[0])}`);
};

must("Recorded run — not live state", "the provenance banner");

// THE FOLD MUST ANSWER "WHAT IS THIS" BEFORE ANY EVIDENCE. The page this replaced opened
// with proof and never said what the thing was, which is why "ugly" and "the functionality
// is not clear" turned out to be one complaint.
must("Put in stock and cash", "the headline");
must("pays its fee to the pool", "the mechanism line");
must("already hold tokenized equity", "who it is for");
must("View the program on Solana Explorer", "the primary action");
// ⛔ NOT a vault. There is no vault account on a public cluster, and devnet has no real
// SPYx or USDY, so one could only hold model mints. The recorded run may say vault; the
// live-cluster copy may not.
const fold = html.slice(0, html.indexOf("Recorded run"));
if (/vault/i.test(fold))
  throw new Error("the fold claims a vault on a public cluster — no vault account exists there");
must("per share", "the jar card's spelled-out units");
must("Both counts only rise", "the ratchet charts");
must("The stock leg, in total", "the cobalt stock-leg chart");
must("What the issuers can still do", "the disclosure block");
must("Every transaction in the recording", "the feed");
must("still burned", "the mask-redeem forfeit, stated on the row it happened");
must("burns your shares in full", "the redeem honesty paragraph");

// ⛔ NOTHING MAY IMPLY LIVE STATE. A demo that says "current" or ticks is the framing
// Secretary ruled out, and it is the difference between replaying and pretending.
// ⚠️ THE FIRST VERSION OF THIS CHECK BANNED THE WORD "live" AND FIRED IMMEDIATELY — on
// "not live state" and on "signing needs a live cluster, and this page has none", i.e. on
// the three places the page DENIES liveness. Banning a word cannot tell a claim from its
// negation. So: every occurrence must sit next to a denial, which is a check the page can
// actually fail by asserting liveness anywhere.
const plain = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
// ⛔⛔ AND THE SECOND VERSION WAS ALSO WRONG, caught by falsifying it: a +/-50 CHARACTER
// window let a denial in the NEIGHBOURING sentence vouch for a claim in this one. Adding
// "Live balances." to the footer passed, because the preceding section ends "...and this
// page has none." That is the rule from my own cron prompt — a control that any nearby
// SENTENCE can satisfy is not a control — so the window is now the SENTENCE itself.
for (const sentence of plain.split(/(?<=[.!?])\s+/)) {
  if (!/\blive\b/i.test(sentence)) continue;
  if (!/not live|has none|needs a live/i.test(sentence))
    throw new Error(`FORBIDDEN: a liveness claim, not a denial — "${sentence.trim()}"`);
}
mustNot(/\bcurrent price\b|\bas of now\b|\bupdating\b|\breal[- ]time\b/i, "a live-state implication");

// every signature in the fixture must be reachable from the page
for (const s of recordedSource.steps())
  if (!html.includes(s.signature)) throw new Error(`signature ${s.signature.slice(0, 8)} not on the page`);

// ⛔ SEAFOAM IS RESERVED FOR THE SERIES THAT CANNOT FALL. The rule is structural, so the
// check is structural: the stock-leg section — the one thing on this page that legitimately
// falls — must be cobalt and must contain NO seafoam at all.
// ⚠️ My first version COUNTED seafoam uses and pinned the total. It failed at 38-vs-24, and
// the honest reading is that the expected number was a guess, not a derivation. Tuning that
// constant until it passed would have produced a control that asserts nothing except my
// arithmetic. A count is the wrong instrument for a rule about WHICH ELEMENT wears a colour.
const section = (heading: string) => {
  const at = html.indexOf(heading);
  if (at < 0) throw new Error(`section not found: ${heading}`);
  const start = html.lastIndexOf("<section", at);
  const end = html.indexOf("</section>", at);
  return html.slice(start, end);
};

const stockLeg = section("The stock leg, in total");
if (!stockLeg.includes("--cobalt"))
  throw new Error("the stock leg is not drawn in the market colour");
if (stockLeg.includes("--seafoam"))
  throw new Error("the stock leg wears seafoam — it can FALL, and seafoam means 'only rises'");

const ratchet = section("Both counts only rise");
if (!ratchet.includes("--seafoam"))
  throw new Error("the monotone series are not in seafoam");
if (ratchet.includes("--cobalt"))
  throw new Error("a monotone series is drawn in the market colour");

const latest = recordedSource.steps().at(-1)!;
const v = perShare(latest.held[0], latest.shareSupply, 8)!;
must(v.toFixed(8), "the latest SPYx-per-share figure, rendered from the adapter");

// ⛔ AN UNDEFINED CSS VAR FAILS SILENTLY. The declaration is dropped and the element just
// inherits, so a missed rename renders wrong without throwing anything. This caught ten
// stale names after the dark rewrite, and no other check here could have.
{
  const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");
  const defined = new Set([...css.matchAll(/^\s+(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]));
  const used = new Set([...html.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]));
  const missing = [...used].filter((v) => !defined.has(v));
  if (missing.length) throw new Error(`CSS vars used but never defined: ${missing.join(", ")}`);
  if (!defined.has("--seafoam")) throw new Error("control failed: index.css was not read");
}

console.log(`render selfcheck PASS — ${html.length} bytes, colour rules structural, all ${recordedSource.steps().length} signatures present`);
