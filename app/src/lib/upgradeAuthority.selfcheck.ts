// Run: npx tsx src/lib/upgradeAuthority.selfcheck.ts
// ⛔ The pure branch logic is asserted offline; the live read is checked against devnet,
// where the answer is independently known (`solana program show` → 49ALNsp…).
import { capDisclosure, authorityRelation, type AuthorityRelation } from "./upgradeAuthority";

const eq = (a: unknown, b: unknown, m: string) => { if (a !== b) throw new Error(`${m}: ${a}`); };

// every branch says something different — no branch is a softened copy of another
const seen = new Set<string>();
for (const rel of [
  { kind: "same", authority: "A" },
  { kind: "separate", capAuthority: "A", upgradeAuthority: "B" },
  { kind: "immutable", capAuthority: "A" },
  { kind: "unknown", reason: "boom" },
] as AuthorityRelation[]) seen.add(capDisclosure(rel));
eq(seen.size, 4, "two branches produce the same sentence");

// ⛔ the reassuring clause must appear ONLY where the chain earned it, plus the explicitly
// hedged unknown branch. If it ever leaks into `separate`, the disclosure is lying.
eq(/bounds accident/.test(capDisclosure({ kind: "same", authority: "A" })), true, "same branch");
eq(/bounds accident/.test(
  capDisclosure({ kind: "separate", capAuthority: "A", upgradeAuthority: "B" })), false,
  "the reassuring clause leaked into the separate branch");

// live, against a known answer
const D = "https://api.devnet.solana.com";
const PROG = "5RaETrSZ72bt6ym5im8ioHLoHKRP39PKzELcFJY9JgXY";
const KNOWN = "49ALNspWUXwNXyAepH3DQjdkEdfRtSxS4nJCo8BhaL3s";
const same = await authorityRelation(D, PROG, KNOWN);
eq(same.kind, "same", `devnet with the known authority should be 'same', got ${same.kind}`);
// control: a different cap authority must report `separate`, not `same`
const diff = await authorityRelation(D, PROG, "11111111111111111111111111111111");
eq(diff.kind, "separate", `control failed: a foreign authority read as ${diff.kind}`);
// control: an unreachable endpoint must be `unknown`, never a reassuring default
const dead = await authorityRelation("http://127.0.0.1:1/", PROG, KNOWN);
eq(dead.kind, "unknown", `an unreachable RPC read as ${dead.kind}`);

console.log("upgradeAuthority selfcheck PASS — 4 distinct sentences, live=same, controls separate/unknown");
