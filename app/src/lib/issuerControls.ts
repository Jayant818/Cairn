/** The issuer-risk sentence, DERIVED from the recorded mint accounts.
 *
 * ⛔ WHY: the previous line — "SPYx's issuer can freeze or seize it — one key does both" —
 * was false and was live on the public page. Two keys, three powers. It was wrong because a
 * human typed a claim about a mint and nothing in the build could disagree with him.
 * ⭐ AND IT ROTTED IN THE FLATTERING DIRECTION, which is why nobody caught it: "one key"
 * understates the issuer's reach, so the page read as MORE reassuring than the chain.
 * A wrong claim that makes you look good produces no complaint from anyone.
 *
 * ⚠️ NO ISSUER IS NAMED HERE. The chain proves that key 5aMNNLQJ… can seize SPYx; it cannot
 * prove that key belongs to Backed. The copy says "SPYx's issuer" because that is the part
 * the recording can defend.
 */
import raw from "../data/mint-controls.json";

export type Power = "seize" | "freeze" | "pause";
const POWERS: Power[] = ["seize", "freeze", "pause"];

export type MintControls = {
  symbol: string;
  mint: string;
  role: string;
  tokenProgram: string;
  accountSize: number;
  decimals: number;
  activeTransferHook: boolean;
  mintAuthority: string | null;
  seize: string | null;
  freeze: string | null;
  pause: string | null;
  scaledUiAmount: string | null;
  extensions: string[];
};

/** One key and everything it can do. The grouping is the whole point: "two keys, three
 *  powers" is a different disclosure from "one key, three powers", and the old line
 *  collapsed them. */
export type KeyGroup = { key: string; powers: Power[] };

export type Topology =
  | { kind: "powerless"; symbol: string }
  | { kind: "held"; symbol: string; groups: KeyGroup[] }
  | { kind: "unknown"; symbol: string; reason: string };

export const recordedControls = raw.mints as MintControls[];

/** Group the powers over one mint by the key that holds them.
 *  ⚠️ Order is fixed by POWERS, not by object key order, so the rendered sentence cannot
 *  change because a recorder wrote its JSON fields in a different order one day. */
export function topology(m: MintControls): Topology {
  if (!m || typeof m.symbol !== "string")
    return { kind: "unknown", symbol: "this token", reason: "no record for this mint" };
  const groups: KeyGroup[] = [];
  for (const p of POWERS) {
    const key = m[p];
    if (!key) continue;                       // the chain says this power does not exist
    const g = groups.find((x) => x.key === key);
    if (g) g.powers.push(p);
    else groups.push({ key, powers: [p] });
  }
  return groups.length ? { kind: "held", symbol: m.symbol, groups }
                       : { kind: "powerless", symbol: m.symbol };
}

const list = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`;

// "with one key" is noise when there is only one key. It is load-bearing the moment there
// are two, because the count is the correction.
const NTH = ["one key", "a second", "a third", "a fourth"];

/** The sentence. ⛔ Every branch says something DIFFERENT and true. None is a softened copy
 *  of another, and `unknown` must never read like the reassuring one — the failure this
 *  whole module replaces was a disclosure that understated the chain. */
export function issuerDisclosure(t: Topology): string {
  switch (t.kind) {
    case "powerless":
      return `Nobody can freeze or seize ${t.symbol}.`;
    case "unknown":
      return `We could not read ${t.symbol}'s mint controls. Assume its issuer can freeze it.`;
    case "held": {
      const clauses = t.groups.map((g, i) =>
        t.groups.length === 1
          ? `${list(g.powers)} it`
          : `${list(g.powers)} it with ${NTH[i] ?? `key ${i + 1}`}`,
      );
      return `${t.symbol}'s issuer can ` +
        (clauses.length === 1 ? clauses[0] : `${clauses.slice(0, -1).join(", ")}, and ${clauses[clauses.length - 1]}`) +
        ".";
    }
  }
}
