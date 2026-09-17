# Nasty-token checklist — SPYx and USDY

Trail of Bits' token-integration checklist, **run by hand** against the two sleeve assets.

⚠️ **Why by hand.** `token-integration-analyzer` is the skill that carries this checklist, and it
is **entirely Ethereum**: 36 mentions of ERC20/ERC721/Solidity, **zero** of Solana, Anchor or
spl-token. Pointing it at an Anchor program produces confident noise. Its *question list*, on the
other hand, maps almost exactly onto Token-2022's extension surface — fee-on-transfer, pausable,
blocklist, rebasing, clawback are the same hazards under different names. So: checklist yes,
tooling no.

All values **measured at the mint on 2026-09-18**, decoded with `@solana/spl-token`'s own getters
rather than hand-rolled offsets. That distinction mattered — my manual parse printed
`paused = 36`, which is not a boolean, and had mislabelled `ScaledUiAmountConfig` as an unknown
extension twice.

```
SPYx  XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W  676 B  Token-2022 (TokenzQd)  8 decimals
      supply 95,231.77427656
USDY  A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6   82 B  classic SPL (Tokenkeg) 6 decimals
      supply 157,215,235.723
```

---

## Live issuer powers

| power | SPYx | USDY |
|---|---|---|
| mint more | `7pt9tkctJPK7PPNQJ77GKg8ZffSF6QxoMiCFYHxrtaCj` | `8n2uiRUd1A9NN78PKESkJe6k6zMqtKCZh3MrK1j9qkB1` |
| freeze an account | `JDq14BWvqCRFNu1krb12bcRpbGtJZ1FLEakMw6FdxJNs` | `51QVCuHfL1FeNjd8BDeffCKhCcAYoULnVB3yjNhShiuK` |
| **seize from any account** | `5aMNNLQJwAEeoemTEMkv5NVjqKwvvefRYCQ5Z67HFvEq` | — none — |
| **pause all transfers** | `JDq14BWvqCRFNu1krb12bcRpbGtJZ1FLEakMw6FdxJNs` (`paused = false`) | — none — |
| **arm a transfer hook** | `5aMNNLQJwAEeoemTEMkv5NVjqKwvvefRYCQ5Z67HFvEq` (slot empty) | impossible |
| restate the UI amount | `S7vYFFWH6BjJyEsdrPQpqpYTqLTrPRK6KW3VwsJuRaS` | — none — |

⭐ **The permanent delegate and the transfer-hook authority are the SAME KEY** (`5aMNNLQJ…`).
Whoever can seize from any SPYx account can also arm the hook. Freeze and pause are a second
shared key (`JDq14BWv…`). So SPYx's six powers sit under **four** keys, not six — the blast radius
of one compromised key is larger than the extension list suggests.

---

## Checklist

### 1. Fee on transfer
**SPYx: no `TransferFeeConfig` today. USDY: structurally impossible (classic SPL).**
Handled anyway — `transfer_in_measured` reads the vault balance before and after its own
transfer and takes the delta, so an armed fee is accounted rather than assumed. That helper was
justified by a falsification test, not by argument: on a 100 bps mint the measured delta and a
naive `held += amount` disagree by exactly the fee, and on a 0 bps mint they agree exactly.
⚠️ The fork test asserts `held == sent` on the real SPYx. **If Backed ever arms the fee, that
assertion is the first thing that breaks, which is where it should break.**

### 2. Rebasing / balance changes under the holder
**Neither rebases.** USDY cannot: a classic SPL mint has no mechanism to change a holder's balance
without an explicit transfer or `mintTo`. SPYx has no rebase extension.
⛔ **But `ScaledUiAmountConfig` is the closest analogue and it is LIVE on SPYx**, and it is a trap
in the opposite direction from rebasing: the *raw* balance is stable while the *displayed* amount
moves under it.
```
multiplier    1.003909240011759   ← STALE
newMultiplier 1.005714560286254   ← LIVE (effective 1781755200 = 2026-06-18, already past)
```
**Reading `multiplier` instead of `newMultiplier` understates SPYx by 0.1799%.** The field names
suggest the opposite of the truth. The vault never reads either — it accounts in raw units — so
this is a **frontend** hazard only, and the frontend must read `newMultiplier`.

### 3. Pausable / blocklist
**SPYx: `PausableConfig`, currently `paused = false`. USDY: freeze authority only.**
One signature from `JDq14BWv…` freezes every SPYx transfer, which freezes deposits *and*
redemptions. USDY's freeze authority is per-account rather than global.
✅ Mitigated in-program: `redeem(shares, sleeve_mask)` lets a holder take the unfrozen leg rather
than having the whole instruction revert. Without it the spec's claim that "the USDY leg survives
if Backed pulls the plug" would be false as built.
⚠️ **Not fully mitigated.** A pause blocks new deposits outright, and there is no code fix for
that — it is a disclosure item.

### 4. Permanent delegate / clawback
**SPYx: yes, `5aMNNLQJ…`. USDY: none.**
This is the largest unfixable risk in the vault. Backed can move or burn SPYx from **any**
account, including the vault's, with no signature from the vault.
⛔ **Internal accounting does not protect against this.** `Sleeve.held` guards the *donation*
direction — nobody can move NAV by sending tokens in. It does nothing about the delegate
direction, where `held` goes stale-high and every redeem reverts.
✅ `reconcile(idx)` exists for exactly that: authority-gated, **downward only**, so the loss can be
marked to reality without reopening the donation vector.
⚠️ **This belongs on the vault page and in the pitch. Do not let a judge find it first.**

### 5. Mint close and reinitialisation
**Neither carries `MintCloseAuthority` today.** A closable mint can be closed and recreated at the
same address with different extensions or decimals, and the vault stores a sleeve as an *address*.
✅ `initialize` now rejects such a mint (`MintIsClosable`).
⚠️ **Necessary, not sufficient** — and this is written into the code, not just here: the check
proves the mint cannot be closed *from now on*. It cannot prove the mint was never already closed
and reinitialised before we saw it. That needs history, which a program cannot read.

### 6. Non-standard decimals
**SPYx 8, USDY 6, in one vault.** Every share calculation is in raw units and never crosses
decimals; the two sleeves are compared only against their own `held`. Exercised end to end on the
real mints in `tests/fork.spec.ts`.

### 7. Two token programs
**SPYx is `TokenzQd`, USDY is `Tokenkeg`.** Not on the Ethereum checklist — there is one ERC20
interface — and it was the defect that survived four commits and a green suite, because the local
harness built both sleeves under Token-2022.
✅ Each sleeve now carries its own program, constrained to that sleeve's mint **owner**.

### 8. Reentrancy via transfer hooks
**SPYx carries an empty `TransferHook` slot; USDY cannot have one.**
An armed hook executes arbitrary issuer code inside our CPI and adds 3–5 accounts per transfer.
⚠️ **Untested.** The local mint points its hook slot at a keypair, which proves the slot exists,
not that a hook executes. Testing execution needs a hook program deployed locally — a separate
task, and it is honest to say the coverage is absent rather than implied.

### 9. Missing return values / approval race
**Not applicable on Solana.** ERC20's silent-failure and approve-race hazards do not exist here:
a failed CPI aborts the transaction.

### 10. Upgradeable token contract
**Not applicable in the ERC20 sense** — `Tokenkeg` and `TokenzQd` are not issuer-upgradeable. The
*mint configuration* is mutable by the authorities in the table above, which is the Solana
equivalent and is covered by rows 1–5.

---

## What is not covered, stated plainly

- **Hook execution** (row 8) — slot presence only.
- **Issuance** — Backed and Ondo hold the mint authorities, so the fork fabricates balances
  rather than minting them. Nothing here exercises issuance.
- **History** — row 5's limit: no on-chain check can prove a mint was never previously
  reinitialised.
