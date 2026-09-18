// THE ADAPTER BOUNDARY. Everything the UI knows about where data comes from lives here.
//
// ⛔ WHY IT EXISTS, stated so nobody deletes it as ceremony: this build replays a recorded
// run against a mainnet fork, because the real SPYx and USDY mints exist on mainnet and on
// that fork and NOWHERE ELSE — a live devnet demo would have to model both mints, which is
// exactly the substitution that let the local harness agree with broken code for four commits.
// The recording is the first implementation of this interface, not a special case the UI knows
// about. A live-RPC implementation replaces `recordedSource` and touches no component.
//
// ⚠️ THE TEST FOR THIS BOUNDARY: no component may import `fork-run.json`. If one does, the
// adapter has already failed and the live path will mean rewriting the UI rather than swapping
// a module.
import raw from "../data/fork-run.json";

export type Sleeve = {
  symbol: string;
  mint: string;
  decimals: number;
  tokenProgram: string;
  role: "stock" | "cash";
};

export type Step = {
  seq: number;
  kind: "initialize" | "bootstrap" | "deposit" | "redeem";
  label: string;
  signature: string;
  slot: number;
  blockTime: number | null;
  /** raw base units exactly as the program stores them */
  held: [string, string];
  shareSupply: string;
  userSleeves: [string, string];
  userShares: string;
  sleeveMask?: number;
  sharesBurned?: string;
};

export type Meta = {
  recordedAt: string;
  cluster: string;
  programId: string;
  feeBps: number;
  sleeves: Sleeve[];
  shareMint: string;
  caveats: string[];
};

export type VaultSource = {
  /** true when the data is a replay. The page MUST render its provenance from this, not from
   *  a hardcoded string — a live implementation flips it and the banner follows. */
  readonly recorded: boolean;
  meta(): Meta;
  steps(): Step[];
};

export const recordedSource: VaultSource = {
  recorded: true,
  meta: () => raw.meta as Meta,
  steps: () => raw.steps as Step[],
};

// ── derived values ───────────────────────────────────────────────────────────
// ⛔ EVERY RATIO IS COMPUTED IN BIGINT AND ONLY CONVERTED FOR DISPLAY. The per-share numbers
// are the product's entire claim, and float arithmetic on base units at these magnitudes
// loses exactly the pennies the charts exist to show.

/** held per share, scaled so a display can read it without ever touching a float mid-chain. */
export function perShare(heldRaw: string, supplyRaw: string, decimals: number): number | null {
  const held = BigInt(heldRaw);
  const supply = BigInt(supplyRaw);
  if (supply === 0n) return null;          // pre-bootstrap: undefined, not zero
  // scale first, divide once: (held * 10^12 / supply) keeps 12 digits of the ratio, then a
  // single conversion at the end. Dividing first would throw away the whole signal.
  const SCALE = 1_000_000_000_000n;
  const scaled = (held * SCALE) / supply;
  return Number(scaled) / Number(SCALE) / 10 ** decimals;
}

/** the monotonicity claim, checked in exact integers — never on the displayed floats. */
export function neverFell(a: Step, b: Step, leg: 0 | 1): boolean {
  const ha = BigInt(a.held[leg]), sa = BigInt(a.shareSupply);
  const hb = BigInt(b.held[leg]), sb = BigInt(b.shareSupply);
  if (sa === 0n || sb === 0n) return true;
  return hb * sa >= ha * sb;               // b is the later step
}

/** base units -> a human amount, for amounts that are NOT the per-share claim. */
export function fromBase(raw: string, decimals: number): number {
  return Number(BigInt(raw)) / 10 ** decimals;
}

/** Steps that carry a share supply, i.e. everything the charts can plot. */
export function plottable(steps: Step[]): Step[] {
  return steps.filter((s) => BigInt(s.shareSupply) > 0n);
}
