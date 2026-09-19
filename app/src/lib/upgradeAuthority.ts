/** First piece of the live seam, and it exists to stop a sentence rotting.
 *
 * ⛔ WHY: the pot screen says "the key that sets the cap is also the key that upgrades the
 * program". That is TRUE OF A DEPLOYMENT, not of the program — `vault.authority` is whoever
 * signed `initialize`, and the program holds no reference to ProgramData and cannot enforce
 * any relationship. So the claim goes silently false the first time a pot is initialised by
 * a different signer. ⭐ AND IT ROTS IN THE FLATTERING DIRECTION: it would only ever become
 * too modest, so nothing would prompt a correction. Derive it instead of asserting it.
 *
 * ⛔ ZERO DEPENDENCIES ON PURPOSE. `jsonParsed` makes the RPC decode the loader account for
 * us, so this is two fetches and no base58 in the client. Adding web3.js belongs to the
 * transaction-building work, with its own reason — not smuggled in by a read.
 */
export type AuthorityRelation =
  | { kind: "same"; authority: string }
  | { kind: "separate"; capAuthority: string; upgradeAuthority: string }
  | { kind: "immutable"; capAuthority: string }
  | { kind: "unknown"; reason: string };

async function rpc(url: string, method: string, params: unknown[]): Promise<any> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(`${method}: ${j.error.message ?? "rpc error"}`);
  return j.result;
}

/** Reads the program's upgrade authority and compares it to the pot's cap authority.
 *  ⚠️ Returns `unknown` rather than guessing when the chain cannot answer — a disclosure
 *  that silently defaults to the reassuring branch is the failure this replaces. */
export async function authorityRelation(
  rpcUrl: string, programId: string, capAuthority: string,
): Promise<AuthorityRelation> {
  try {
    const prog = await rpc(rpcUrl, "getAccountInfo", [programId, { encoding: "jsonParsed" }]);
    const pdAddr = prog?.value?.data?.parsed?.info?.programData;
    // A program with no ProgramData is not upgradeable at all — which is a STRONGER
    // statement than "separate keys" and must not be flattened into it.
    if (!pdAddr) return { kind: "immutable", capAuthority };

    const pd = await rpc(rpcUrl, "getAccountInfo", [
      pdAddr, { encoding: "jsonParsed", dataSlice: { offset: 0, length: 0 } },
    ]);
    const upgradeAuthority = pd?.value?.data?.parsed?.info?.authority;
    // authority === null means the upgrade authority was revoked: immutable, again stronger.
    if (!upgradeAuthority) return { kind: "immutable", capAuthority };

    return upgradeAuthority === capAuthority
      ? { kind: "same", authority: capAuthority }
      : { kind: "separate", capAuthority, upgradeAuthority };
  } catch (e) {
    return { kind: "unknown", reason: e instanceof Error ? e.message : String(e) };
  }
}

/** The sentence, derived. ⛔ Each branch says something DIFFERENT and true; none of them is
 *  a softened version of another, because the whole point is that the reassuring line must
 *  be earned by the chain rather than assumed by the author. */
export function capDisclosure(rel: AuthorityRelation): string {
  switch (rel.kind) {
    case "same":
      return "We can change that cap. The key that sets it is also the key that upgrades " +
             "the program, so the cap bounds accident, not compromise.";
    case "separate":
      return "We can change that cap. The key that sets it is separate from the key that " +
             "upgrades the program.";
    case "immutable":
      return "We can change that cap. The program itself can no longer be upgraded.";
    case "unknown":
      return "We can change that cap. We could not read the program's upgrade authority " +
             "just now, so treat the cap as bounding accident, not compromise.";
  }
}
