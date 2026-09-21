// Records WHO CAN DO WHAT to each sleeve mint, straight from the chain.
//
// Run: node scripts/record-mint-controls.mjs [rpc-url]
//
// ⛔ WHY THIS FILE EXISTS: the risk line on the landing page said "SPYx's issuer can freeze
// or seize it — one key does both". That was FALSE and it was LIVE. The chain says seize is
// the permanent delegate 5aMNNLQJ…, freeze is a DIFFERENT key JDq14BWv…, and that second key
// also holds pausableConfig — two keys, three powers. Nothing in the build could have caught
// it, because the sentence was prose typed by hand and no test can diff prose against a mint.
// ⭐ THE FIX IS NOT A BETTER SENTENCE, IT IS REMOVING THE AUTHOR FROM THE LOOP: record the
// authorities, derive the sentence, and let the selfcheck fail when the two disagree.
//
// Zero dependencies — `jsonParsed` makes the RPC decode the Token-2022 extensions, exactly
// as app/src/lib/upgradeAuthority.ts does, so nothing here needs web3.js or spl-token.
import { writeFileSync } from "node:fs";

const RPC = process.argv[2] ?? "http://127.0.0.1:8899";
const OUT = new URL("../app/src/data/mint-controls.json", import.meta.url);

const MINTS = [
  { symbol: "SPYx", mint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W", role: "stock" },
];

async function rpc(method, params) {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(`${method}: ${j.error.message ?? "rpc error"}`);
  return j.result;
}

const mints = [];
for (const s of MINTS) {
  const v = (await rpc("getAccountInfo", [s.mint, { encoding: "jsonParsed" }]))?.value;
  if (!v) throw new Error(`${s.symbol}: mint ${s.mint} not found on ${RPC}`);
  if (v.data?.parsed?.type !== "mint") throw new Error(`${s.symbol}: not a mint account`);
  const info = v.data.parsed.info;
  const ext = (name) =>
    (info.extensions ?? []).find((e) => e.extension === name)?.state ?? null;
  const transferHookProgram = ext("transferHook")?.programId ?? null;

  // ⛔ null means the chain says THE POWER DOES NOT EXIST, which is a stronger statement
  // than "we did not look". Anything we could not decode must throw above, never land here
  // as a null that reads like a revoked authority.
  mints.push({
    symbol: s.symbol,
    role: s.role,
    mint: s.mint,
    tokenProgram: v.owner,
    accountSize: v.space,
    decimals: info.decimals,
    activeTransferHook: Boolean(
      transferHookProgram && transferHookProgram !== "11111111111111111111111111111111",
    ),
    mintAuthority: info.mintAuthority ?? null,
    freeze: info.freezeAuthority ?? null,
    seize: ext("permanentDelegate")?.delegate ?? null,
    pause: ext("pausableConfig")?.authority ?? null,
    // not a power over balances, but it rescales every displayed amount, so it is recorded
    // rather than dropped. The program reads RAW amounts and is unaffected.
    scaledUiAmount: ext("scaledUiAmountConfig")?.authority ?? null,
    extensions: (info.extensions ?? []).map((e) => e.extension),
  });
}

const doc = {
  recordedAt: new Date().toISOString(),
  rpc: RPC,
  note:
    "Authorities read from the real mainnet mint accounts. Issuers are NOT named: the chain " +
    "cannot prove which company holds a key, so the copy says 'SPYx's issuer', never 'Backed'.",
  mints,
};
writeFileSync(OUT, JSON.stringify(doc, null, 2) + "\n");
console.log(`wrote ${OUT.pathname}`);
for (const m of mints)
  console.log(`  ${m.symbol}  seize=${m.seize ?? "-"}  freeze=${m.freeze ?? "-"}  pause=${m.pause ?? "-"}`);
