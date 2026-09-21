// Run: npx tsx src/lib/issuerControls.selfcheck.ts
// ⛔ THIS IS THE CHECK THAT DID NOT EXIST when "one key does both" went live. It asserts two
// separate things, and both are needed: that the RECORDING still says what the correction was
// based on, and that the GENERATOR turns that recording into the right English.
import {
  recordedControls, topology, issuerDisclosure, type MintControls, type Topology,
} from "./issuerControls";

const eq = (a: unknown, b: unknown, m: string) => { if (a !== b) throw new Error(`${m}: got ${a}`); };
const of = (sym: string) => {
  const m = recordedControls.find((x) => x.symbol === sym);
  if (!m) throw new Error(`control failed: no recorded controls for ${sym}`);
  return m;
};

// ── 1. THE CHAIN FACTS THE CORRECTION RESTS ON, pinned as literals ─────────
// ⛔ Pinned deliberately. If a re-record moves either key, this fails and a HUMAN re-reads
// the sentence — which is exactly what nobody did the first time. A soft check here ("seize
// is non-null") would have passed against the false page too.
const SPY = of("SPYx");
eq(SPY.accountSize, 676, "SPYx account layout changed");
eq(SPY.decimals, 8, "SPYx decimals changed");
eq(SPY.tokenProgram, "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", "SPYx token program changed");
eq(SPY.activeTransferHook, false, "SPYx transfer hook became active");
eq(SPY.seize, "5aMNNLQJwAEeoemTEMkv5NVjqKwvvefRYCQ5Z67HFvEq", "SPYx permanent delegate moved");
eq(SPY.freeze, "JDq14BWvqCRFNu1krb12bcRpbGtJZ1FLEakMw6FdxJNs", "SPYx freeze authority moved");
eq(SPY.pause, SPY.freeze, "freeze and pause are no longer the same key — the copy says they are");
if (SPY.seize === SPY.freeze)
  throw new Error("seize and freeze are now ONE key — 'one key does both' would be true again");

// ── 2. THE GROUPING, which is the entire correction ────────────────────────
const tSpy = topology(SPY);
eq(tSpy.kind, "held", "SPYx topology");
eq((tSpy as Extract<Topology, { kind: "held" }>).groups.length, 2, "SPYx must be TWO keys");
eq(issuerDisclosure(tSpy),
   "SPYx's issuer can seize it with one key, and freeze or pause it with a second.",
   "the SPYx sentence drifted from the recording");

// ⛔ CONTROL — the generator must be ABLE to produce the old, false sentence when the chain
// says so. A grouper that always answers "two keys" is not measuring anything.
const collapsed = topology({ ...SPY, seize: SPY.freeze } as MintControls);
eq((collapsed as Extract<Topology, { kind: "held" }>).groups.length, 1, "control failed: the grouper never collapses");
eq(issuerDisclosure(collapsed), "SPYx's issuer can seize, freeze or pause it.",
   "control failed: one key must read differently from two");

// ── 3. NO BRANCH IS A SOFTENED COPY, and none leaks reassurance ────────────
const branches: Topology[] = [
  tSpy,
  { kind: "powerless", symbol: "SPYx" },
  { kind: "unknown", symbol: "SPYx", reason: "boom" },
];
eq(new Set(branches.map(issuerDisclosure)).size, 3, "two branches produce the same sentence");
for (const b of branches.filter((x) => x.kind !== "powerless"))
  if (/Nobody can/.test(issuerDisclosure(b)))
    throw new Error(`the reassuring clause leaked into the ${b.kind} branch`);
// an unreadable record must never be silently powerless
eq(topology(undefined as unknown as MintControls).kind, "unknown", "a missing record read as");

console.log("issuerControls selfcheck PASS — SPYx layout and 2 keys/3 powers, 3 distinct branches");
