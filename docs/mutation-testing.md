# Mutation testing — what the score is, and what it cannot see

Line coverage says a line ran. Mutation testing says a line was **checked**: it changes the code
and asks whether any test notices. A suite that executes a line and asserts nothing about it
scores 100% coverage and kills no mutants.

Both runs below are reproducible from a clean tree. Numbers measured 2026-09-18.

| scope | mutants | caught | missed | unviable | wall clock |
|---|---|---|---|---|---|
| `src/math.rs` (pure arithmetic) | 32 | 30 | **0** | 2 | 2m |
| `src/lib.rs` (instruction handlers) | 16 | 16 | **0** | 0 | 13m |

```bash
# math.rs — pure Rust, no validator. `-- --lib` is required, or every mutant also drags the
# TypeScript bridge through a build + deploy + suite and 2 minutes becomes 5 hours.
cargo mutants --manifest-path programs/stockpump/Cargo.toml \
              --file programs/stockpump/src/math.rs --output mutants.out.math -- --lib

# lib.rs — needs a validator on 127.0.0.1:8899 and the program keypair by ABSOLUTE path.
STOCKPUMP_PROGRAM_KEYPAIR=$PWD/target/deploy/stockpump-keypair.json \
cargo mutants --manifest-path programs/stockpump/Cargo.toml \
              --file programs/stockpump/src/lib.rs --timeout 600 --output mutants.out.lib
```

## Why lib.rs is reachable at all

Nothing on the Rust side touches `lib.rs` — every instruction is exercised from TypeScript
against a validator. Without `programs/stockpump/tests/integration.rs`, all 16 mutants would
"survive", and that survival would mean *no Rust test reaches this code*, not *your assertions
are weak*. **A mutation score that measures the absence of a harness rather than the strength of
a suite is worse than no score, because it reads like one.**

## What the runs actually found

Both scopes started with survivors, and both survivor sets had the same shape.

- **`math.rs`: 10 of 32 survived on the first run.** Every one was a direction that was checked
  once and assumed in its mirror — a rounding rule asserted to protect the vault with no
  assertion that it did not overcharge the user.
- **`lib.rs`: `& → |` on `if sleeve_mask & 0b01 != 0`** makes the condition always true, so sleeve
  0 pays out regardless of the mask. Every redeem test used a mask where sleeve 0 was *supposed*
  to fire, so nothing required that branch to be false.
- **`lib.rs`: `replace transfer_out -> Ok(())`** — a vault that burns your shares and sends
  nothing. It survived a **green** suite, and it survived because of a fix I had made an hour
  earlier: both redeem tests originally compared a before-read and an after-read of the user's
  token account, that read can race, and curing the race by asserting on the vault's own `held`
  was right about *which branch ran* and wrong about everything else. `held` is decremented on a
  separate line from the CPI, so deleting the transfer still satisfies it. **The race fix removed
  the only assertion that tokens actually moved.** Neither read works; the **receipt** does —
  `preTokenBalances`/`postTokenBalances` are recorded at execution, cannot race, and are the
  movement itself rather than a proxy for it.

## ⛔ The limit, stated plainly

**Mutation testing perturbs the CODE. It cannot perturb the MODEL the tests are built on.**

This repo has a measured example. All three instructions carried a single `token_program` for
both sleeves, so the vault could not hold SPYx (Token-2022) and USDY (classic SPL) at the same
time — the actual asset pair. That defect survived four commits, a green suite **and a clean
mutation score**, because the local harness built both mints under Token-2022: it mirrored SPYx
faithfully and got USDY's *program* wrong. The tests were wrong in the same way the code was
wrong, so they agreed, and no mutant can disagree with an agreement.

What catches that class is a test whose inputs the author did not choose: `tests/fork.spec.ts`
runs the same round trip against the **real** mainnet mints cloned from chain. Mutation score and
mainnet fork are answering different questions, and neither substitutes for the other.

## Operational note

`cargo mutants` deploys each mutant to the shared validator, and the killed-mutant path ends in a
**panic**, so cleanup written at the end of a test body never runs. `integration.rs` restores the
clean build from a `Drop` and verifies it by bytes. That guard covers *this* process; it does not
protect a suite reading 8899 while a **different** session has a mutant deployed. One owner of
the validator at a time.
