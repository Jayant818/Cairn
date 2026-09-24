import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import App from "./App";
import { WalletProviders } from "./components/WalletProviders";

const html = renderToStaticMarkup(<WalletProviders><App /></WalletProviders>);
const plain = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");
const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const motionSource = readFileSync(new URL("./components/MotionUI.tsx", import.meta.url), "utf8");

const must = (value: string, reason: string) => {
  if (!html.includes(value)) throw new Error(`MISSING: ${reason} (${value})`);
};

must("The LST layer for tokenized equities", "product tagline");
must("PAPER — simulated, no real funds", "paper badge in the sticky ribbon");
must("Try it (paper trading)", "primary call to action");
must("Found a problem?", "feedback path");
must("https://github.com/Jayant818/Cairn/issues/new?", "feedback opens a prefilled GitHub issue");
must("cSPYx", "receipt asset");
must("Total managed equity", "prime-brokerage KPI bar");
must("APPROVED BY ON-CHAIN POLICY (PASS)", "underwriting decision");
must("Deposit &amp; mint cSPYx", "lend action");
must("Borrow SPYx", "borrow action");
must("deposited 10.0 SPYx", "recorded fork activity feed");
must("Pyth verified", "oracle verification status");
must("Deviation guard", "TWAP policy");
must("Inactive only", "active transfer hook rejection");
must("No borrower loops.", "constant-time accounting claim");
must("Paper mode: every action runs in your browser", "paper disclosure");
must("Not on devnet or mainnet yet", "deployment status");
// 2026-09-24 UX pass (Jayant TG 1685/1687): the founder could not find the next action.
must("Paper wallet", "wallet chip in the navbar");
must("Step 1 of 4", "guided path progress");
must("Lend 5 SPYx", "one primary button for the first step");
must("For you:", "plain-English line under the action");
must("Skip 30 days", "time folded into skip buttons");
must("Simulated market: 1 sample lender", "the sample data is labelled");
must("What your receipt is worth. It only goes up.", "plain-English line under each stat");
must("Try the borrower side and custom amounts", "advanced actions collapsed");
must("SPYx price (paper oracle)", "paper oracle control for liquidation");
must("Liquidate", "liquidation tab");
if (/Clock \d{4}-\d{2}-\d{2}/.test(plain)) throw new Error("the Clock <date> label is back");

// Moved 2026-09-24: the page used to print scripted figures (1,420.50 SPYx, 68.2%, 1.0215, 31.8%).
// Every number now comes from viewOf(), so none of those literals may come back.
for (const scripted of ["1,420.50", "68.2", "1.0215", "31.8%", "9.7895", "1.0192"]) {
  if (appSource.includes(scripted)) throw new Error(`scripted figure is back in App.tsx: ${scripted}`);
}

if (/stockpump/i.test(plain)) throw new Error("retired product name is visible");
if (!motionSource.includes('from "motion/react"')) throw new Error("motion components lost Motion");
if (!motionSource.includes("useReducedMotion")) throw new Error("motion lacks reduced-motion handling");
if (!css.includes("prefers-reduced-motion")) throw new Error("CSS lacks reduced-motion fallback");

const definedVars = new Set([...css.matchAll(/^\s+(--[a-z0-9-]+)\s*:/gm)].map((match) => match[1]));
const usedVars = new Set([...css.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((match) => match[1]));
const missingVars = [...usedVars].filter((name) => !definedVars.has(name));
if (missingVars.length) throw new Error(`undefined CSS variables: ${missingVars.join(", ")}`);

const definedClasses = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((match) => match[1]));
const usedClasses = new Set(
  [...html.matchAll(/class="([^"]+)"/g)].flatMap((match) => match[1].split(/\s+/)).filter(Boolean),
);
const missingClasses = [...usedClasses].filter(
  (name) => name !== "false" && !name.startsWith("wallet-adapter-") && !definedClasses.has(name),
);
if (missingClasses.length) throw new Error(`undefined CSS classes: ${missingClasses.join(", ")}`);

const seafoamRules = [...css.matchAll(/([^{}]+)\{[^{}]*var\(--seafoam\)[^{}]*\}/g)].map(
  (match) => match[1].trim(),
);
if (!seafoamRules.length || seafoamRules.some((selector) => !/(kpi-bar|curve|activity-yield)/.test(selector))) {
  throw new Error(`seafoam used outside yield semantics: ${seafoamRules.join(", ")}`);
}

console.log(`render selfcheck PASS: ${usedClasses.size} classes, ${definedVars.size} variables`);
