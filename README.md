# Cairn

A Solana vault holding tokenized S&P 500 (**SPYx**) and tokenized dollars
(**USDY**) together, where the quantity of each asset standing behind one share
only ever goes up.

Every deposit pays a fee to the vault itself rather than to a treasury, so the
count behind each existing share ratchets. **There is no price in the program
and no oracle in the money path.** The claim is a count, and a count is
checkable — which is the only reason to believe it.

---

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
  npx ts-mocha -p ./tsconfig.json -t 1000000 tests/stockpump.spec.ts   # 12 local
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

## Testing

| suite | result |
|---|---|
| local (`stockpump.spec.ts`) | 12 passing |
| mainnet fork (`fork.spec.ts`) | 4 passing, on the real mints — **on a fresh `./fork/setup.sh`**, see the singleton note above |
| `cargo mutants` on `lib.rs` | 16 mutants, 16 caught |
| `cargo mutants` on `math.rs` | 32 mutants, 30 caught, 2 unviable, 0 missed |
| frontend (`cd app && npm run check`) | adapter, ratio maths and page-honesty assertions |

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
programs/stockpump/src/     the program: lib.rs, math.rs
programs/stockpump/tests/   integration.rs — bridges cargo-mutants to the TS suite
tests/                      stockpump.spec.ts (local), fork.spec.ts (real mints)
fork/                       setup.sh — clones the mainnet mints, seeds holdings
scripts/record-fork.ts      records one real run into the frontend's fixture
app/                        the frontend; src/lib/source.ts is the only data boundary
docs/                       mutation-testing.md, nasty-token-checklist.md
CLAUDE.md                   rules for anyone (or anything) committing here
```
