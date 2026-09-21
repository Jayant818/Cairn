import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import App from "./App";

const html = renderToStaticMarkup(<App />);
const plain = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");
const motionSource = readFileSync(new URL("./components/MotionUI.tsx", import.meta.url), "utf8");

const must = (value: string, reason: string) => {
  if (!html.includes(value)) throw new Error(`MISSING: ${reason} (${value})`);
};

must("The LST layer for tokenized equities", "product tagline");
must("Interface preview. No live market is connected.", "non-live disclosure");
must("cAAPL", "receipt asset");
must("Pyth verified", "oracle verification status");
must("Deviation guard", "TWAP policy");
must("Inactive only", "active transfer hook rejection");
must("No borrower loops.", "constant-time accounting claim");
must("Preview only. No wallet transaction is created.", "transaction preview disclosure");
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
const missingClasses = [...usedClasses].filter((name) => !definedClasses.has(name));
if (missingClasses.length) throw new Error(`undefined CSS classes: ${missingClasses.join(", ")}`);

const seafoamRules = [...css.matchAll(/([^{}]+)\{[^{}]*var\(--seafoam\)[^{}]*\}/g)].map(
  (match) => match[1].trim(),
);
if (!seafoamRules.length || seafoamRules.some((selector) => !/(market-stats|curve)/.test(selector))) {
  throw new Error(`seafoam used outside yield semantics: ${seafoamRules.join(", ")}`);
}

console.log(`render selfcheck PASS: ${usedClasses.size} classes, ${definedVars.size} variables`);
