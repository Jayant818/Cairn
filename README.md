# Cairn

**Stake the stocks you already hold.** Put tokenized S&P 500 into a pot, get **pSPY** back,
and the amount of stock standing behind your pSPY goes up every time anybody else trades.

[**Live page**](https://stockpump-one.vercel.app) ·
[**Program on Solana Explorer**](https://explorer.solana.com/address/5RaETrSZ72bt6ym5im8ioHLoHKRP39PKzELcFJY9JgXY?cluster=devnet) ·
[nine recorded transactions](#the-numbers-including-the-one-that-flatters-us)

---

## Why this exists

Tokenized equity on Solana is real now — Backed lists twenty xStocks, and SPYx and USDY are
live mainnet mints today. But holding a tokenized stock does nothing that holding the stock
does not. There is no on-chain reason to prefer the tokenized version.

Cairn gives it one. **Every deposit and every redemption leaves 1% in the pot, and there is
no treasury address to sweep it out to**, so it lands on the shares already there. The
number of shares behind your receipt token only goes up. It cannot go down, because no code
path lowers it.

⇒ Structurally this is a **liquid staking token whose underlying is stock**. You hold mSOL
and the SOL behind it rises; you hold pSPY and the SPYx behind it rises. The difference is
where the yield comes from: an LST pays from validator rewards, which accrue with **time**.
**Cairn pays from other people's trades, which accrue with flow.** A quiet week pays nothing,
and the README says so because the page does.

## What it offers

| | |
|---|---|
| **One pot per stock** | Each pot pairs one tokenized stock with dollars and mints its own receipt token — SPYx → **pSPY**, a Tesla pot would mint **pTSLA**. Pots ratchet independently. |
| **In-kind, always** | Deposit and redeem move the real assets. No oracle, no price, no swap in the money path. |
| **A count, not a price** | The claim is *how many* SPYx sit behind one pSPY. A count is checkable on chain by anyone; a price is a thing you have to trust somebody about. |
| **A deposit cap** | Per-pot, per-sleeve, authority-settable, and it **never blocks redeem**. Bounds what a bug can cost while the program is young. |

## The numbers, including the one that flatters us

From the nine recorded transactions in `app/src/data/fork-run.json`, against the real mints:

| | |
|---|---|
| **+4.7245%** | total rise in SPYx-per-share across the whole run |
| **+4.1172%** | …of which **one person** redeemed only their cash leg and abandoned their stock. **That is not the product.** |
| **+0.5833%** | the fee ratchet on its own — the number the mechanism actually produced |
| **−1.99%** | what a round trip costs you, 1% in and 1% out |

⇒ **At the volume in that recording, roughly twenty other people have to trade before a
depositor is back to even.** This is a claim on other people's flow, not on time passing.
Every protocol prints the first number. The reason to trust the rest of this repository is
that we printed the third one next to it.

## What is real here, and what is not

Being precise about this is the point of the project, so it goes first.

| | |
|---|---|
| **Real** | The program. The two mints are the actual mainnet SPYx and USDY accounts, with their real extensions, decimals and owning programs — SPYx is Token-2022 (676 B, 8 dp), USDY is classic SPL (82 B, 6 dp). One instruction CPIs to **two different token programs**. |
| **Replayed** | The frontend shows a *recorded* run, not live state. It says so on the page, with every transaction signature listed. |
| **Not tested at all** | Issuance. Backed holds SPYx's mint authority and Ondo holds USDY's, so no test wallet can ever be issued either token — the fork writes balances into the accounts at genesis instead. A transfer hook that consulted issuer state would still be modelled rather than exercised. |

The frontend replays rather than reading a live chain **because devnet has no
SPYx and no USDY.** A live demo would have to model both mints, and modelling
them is exactly what let a green test suite agree with broken code for four
commits (see *The defect worth reading about* below). Keeping the assets real
was worth more than keeping the data live.

## Run it

```sh
# 1. the fork: clones the real mainnet mints and seeds the test wallet
./fork/setup.sh                     # leaves a validator on 127.0.0.1:8899

# 2. build and deploy (see build.sh for why it is not `anchor build`)
./build.sh
solana airdrop 50 --url http://127.0.0.1:8899 --keypair ~/.config/solana/id.json
anchor deploy --provider.cluster http://127.0.0.1:8899

# 3. the tests
ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET=~/.config/solana/id.json \
  npx ts-mocha -p ./tsconfig.json -t 1000000 tests/stockpump.spec.ts   # 16 local
ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET=~/.config/solana/id.json \
  npx ts-mocha -p ./tsconfig.json -t 1000000 tests/fork.spec.ts        # 4 on the real mints

# 4. the frontend
cd app && npm install && npm run check && npm run dev
```

⛔ **The vault PDA is a singleton per stock** — seeded on `[b"vault", SPYx]`. The
fork suite and `scripts/record-fork.ts` each consume it, so **each needs its own
fresh `./fork/setup.sh`.** Both fail loudly and say so rather than failing deep
inside Anchor.

### Traps that will cost you an hour otherwise

- `/usr/bin/yarn` on Debian/Ubuntu is **cmdtest**, not JS yarn. Use `--package-manager npm`.
- The machine's global solana config may point at a **relative** keypair from
  another project. Always pass `--url` and `--keypair` explicitly.
- `anchor build` drives `cargo-build-sbf` with the default platform-tools and
  there is no override — `anchor build -- --tools-version vX` forwards the flag
  to the IDL's `cargo test`, which rejects it, **while leaving a stale `.so` on
  disk whose hash still looks plausible.** Use `./build.sh`.

## How it works

Five instructions (`initialize`, `bootstrap`, `deposit`, `redeem`, `reconcile`)
and one `Vault` account holding two sleeves.

- **Deposit is in-kind, both legs.** You receive the *binding sleeve's* share
  count — the smaller of the two ratios — so a lopsided deposit cannot mint more
  shares than the assets justify.
- **The fee stays in the vault.** It is not routed anywhere. That is the whole
  ratchet.
- **1,000 dead shares are burned at bootstrap** into the vault's own account, so
  the supply can never return to zero and the first depositor cannot be
  sandwiched by a donation.
- **`reconcile` is downward-only.** An upward mark would reopen the donation
  vector it exists to close.
- **Redeem takes a sleeve mask.** You may take both legs or either one alone —
  useful if the issuer has frozen one of them.

⚠️ **Taking one leg still burns your shares in full.** It is not a discount and
not a partial exit: the assets you leave behind stay in the vault and raise
everyone else's count. The recorded run contains a real example — a `0b10`
redeem where SPYx `held` is unchanged while 52 shares burn, so SPYx-per-share
jumps 70,408.29 → 73,307.12. The UI shows that number rather than footnoting it.

## What the issuers can still do to your assets

Not fine print. Measured at the mints on 2026-09-18:

- SPYx's **permanent delegate** and its **transfer-hook authority are the same
  key**; freeze and pause are a second shared key. Six issuer powers sit under
  four keys, so one compromised key reaches further than the extension list
  suggests.
- SPYx carries `ScaledUiAmountConfig`, and the live multiplier is
  `newMultiplier`, not `multiplier` — reading the wrong field understates SPYx
  by 0.1799%. **The vault accounts in raw base units and reads neither.**

## Status, stated plainly

| | |
|---|---|
| **Program** | Deployed and byte-verified on **devnet** at `5RaETrSZ72bt6ym5im8ioHLoHKRP39PKzELcFJY9JgXY`. **Never deployed to mainnet. Has never held real money.** |
| **Audit** | **None.** Mutation testing is not an audit — see *The defect worth reading about* below for a measured case where a clean mutation score coexisted with a broken program for four commits. |
| **The demo** | A **recorded** run replayed from a fixture. Every signature is listed. The page says so at the top rather than in a footnote. |
| **Untested class** | **Issuance, freeze, pause.** Backed holds SPYx's mint authority, so no test wallet can be issued the token — the fork writes balances at genesis. Those paths are modelled, never executed, and that is the failure class most likely to matter on mainnet. |

## Testing

| suite | result |
|---|---|
| local (`stockpump.spec.ts`) | 17 passing |
| Token-2022 shape (`mint2022.spec.ts`) | 3 passing |
| mainnet fork (`fork.spec.ts`) | 4 passing, on the real mints — **on a fresh `./fork/setup.sh`**, see the singleton note above |
| `cargo mutants` on `lib.rs` | 18 mutants, 18 caught, 0 missed — re-run 2026-09-20 02:39–02:55, now that `lib.rs` carries `enforce_caps` and `set_deposit_cap`. The two new mutants are exactly those two functions, both caught. ⚠️ **and the score does not mean what it looks like — see below** |
| `cargo mutants` on `math.rs` | 32 mutants, 30 caught, 2 unviable, 0 missed |
| frontend (`cd app && npm run check`) | adapter, ratio maths and page-honesty assertions |

⛔ **18/18 ON `lib.rs` CERTIFIES THE INSTRUMENT, NOT THE POPULATION.** The cap's
whole decision is `require!(next_held[i] <= deposit_cap, …)`, and cargo-mutants
does not mutate inside macro expansions — so it never generated `<= → <` and the
perfect score was measured over a set that excludes the one comparison the cap
is. Verified by hand on 2026-09-20: flip that operator, rebuild, redeploy, and
the suite goes **16 passing / 1 failing** with only *"a deposit landing EXACTLY
on the cap is accepted"* failing. The other three cap tests all still pass — the
boundary had no coverage at all before that test existed, and the mutation score
said the opposite. (Restored `.so` is byte-identical, md5 `8e3c0647…`.)

⚠️ `cargo mutants` on `math.rs` needs `-- --lib`, or every mutant drags the
TypeScript bridge through build + deploy + suite and 2 minutes becomes 5 hours.

### The defect worth reading about

`docs/mutation-testing.md` leads with what mutation testing *cannot* see, and
this repo has the measured example. SPYx is Token-2022 and USDY is classic SPL,
but the local harness built **both** mints under Token-2022 — it mirrored SPYx
faithfully and got USDY's *program* wrong, the one property that mattered. Every
test passed. Four commits and a clean mutation score later, the vault still
could not have held the real asset pair.

The tests were wrong in the same way the code was wrong, so they agreed, and
**no mutant can disagree with an agreement.** Only the real mints found it.

## Layout

```
programs/stockpump/src/     the program: lib.rs, math.rs   (crate still named stockpump;
                            the product was renamed to Cairn, the crate has not been —
                            renaming it changes the program id, so it waits for mainnet)
programs/stockpump/tests/   integration.rs — bridges cargo-mutants to the TS suite
tests/                      stockpump.spec.ts (local), fork.spec.ts (real mints)
fork/                       setup.sh — clones the mainnet mints, seeds holdings
scripts/record-fork.ts      records one real run into the frontend's fixture
app/                        the frontend; src/lib/source.ts is the only data boundary
docs/                       mutation-testing.md, nasty-token-checklist.md
CLAUDE.md                   rules for anyone (or anything) committing here
```
