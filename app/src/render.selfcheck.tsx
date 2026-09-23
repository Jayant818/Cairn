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
must("Cairn Protocol Sandbox", "guided sandbox ribbon");
must("Connect wallet to enable transactions", "disconnected sandbox fallback");
must("cSPYx", "receipt asset");
must("Total managed equity", "prime-brokerage KPI bar");
must("APPROVED BY ON-CHAIN POLICY (PASS)", "underwriting decision");
if (!appSource.includes("Minimum {MIN_COLLATERALIZATION}%"))
  throw new Error("MISSING: borrow liquidation threshold");
must("deposited 10.0 SPYx", "lifecycle activity feed");
must("Pyth verified", "oracle verification status");
must("Deviation guard", "TWAP policy");
must("Inactive only", "active transfer hook rejection");
must("No borrower loops.", "constant-time accounting claim");
must("Connected actions are signed by your wallet", "live transaction disclosure");
must("Local build verified. Not deployed.", "deployment status");

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
