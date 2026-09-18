# stockpump — rules for any agent working this repo

Read this before your first commit. Every rule here exists because it was
already broken once, and the breakage is named so the rule is arguable rather
than obeyed on faith.

## Commits

⛔ **NO CO-AUTHOR TRAILER. NO "Generated with" LINE.** Jayant's explicit
instruction, 2026-09-17. The harness re-appends it **silently**, so this is a
**per-commit** check, never a per-session one — passing once says nothing about
the next commit.

Check it with git's own trailer parser plus an **anchored** grep:

```sh
# both must print nothing / 0
git log -1 --format='%(trailers:key=Co-Authored-By,valueonly)'
git log -1 --format='%B' | grep -ciE '^[[:space:]]*(co-authored-by:|.*generated with \[)'
```

⛔ **DO NOT use the unanchored `grep -ci "co-authored-by\|generated with"`.**
It was the version written here first, and **the very commit that introduced
this file failed it — on its own prose.** The message explains the rule, the
sentence explaining it contains both strings, and the check cannot tell a
trailer from a description of a trailer. The real trailer count was zero.

⭐ The general form, and it has cost this project several hours in other
disguises: **a control that any nearby sentence can satisfy is not a control,
and the forger is usually your own log entry.** Anchor to the line start, or
ask the tool that actually parses the structure.

📎 **Broken 2026-09-18 in `2460627`** — the only commit of the first eight
carrying a trailer. The session saw zero trailers in `git log`, read that as a
loose convention, and took the harness default over it. **The rule existed, in a
daily log and a handoff — i.e. everywhere except the place a committing session
reads.** That is why it now lives here.

## Toolchain

- Build with **`./build.sh`**, never bare `anchor build`. Anchor drives
  `cargo-build-sbf` with the default platform-tools and there is no override —
  `anchor build -- --tools-version vX` forwards the flag to the IDL's
  `cargo test`, which rejects it, **while leaving a stale `.so` on disk whose
  hash can still look right.**
- `/usr/bin/yarn` is **cmdtest**, not JS yarn. Use `--package-manager npm`.

## The local validator is SHARED STATE

⛔ **`cargo mutants` deploys every mutant to `127.0.0.1:8899`, and the
killed-mutant path is a PANIC**, so cleanup written at the end of a test body
never runs. `RestoreCleanDeploy` (a `Drop`, in `programs/stockpump/tests/integration.rs`)
restores the clean build afterwards and verifies **by bytes**, `dump` + `cmp`,
not by the deploy's exit code.

⛔ **The Drop guard does NOT make the validator safe to share.** It restores
after *its own* run ends; it cannot help a suite reading 8899 *while* another
process has a mutant deployed. On 2026-09-18 two sessions did exactly that and
**each diagnosed the other's deploy as a defect in its own program.**

⇒ **One owner of this tree at a time, or a validator per session on its own
port.** And the rule that generalises past this repo: **when a local build
disagrees with a deployed one, ask who else deploys here before asking anything
about the code.**

## The devnet deploy has NO UPGRADE HEADROOM

⛔ **A future build even one byte larger than the current one cannot be upgraded
in place.** Run `solana program extend <PROGRAM_ID> <ADDITIONAL_BYTES>` first.

Why, because the cause is not obvious and the failure will not name it: a normal
`anchor deploy` writes a fresh buffer and sizes programdata at `45 + 2 * so`,
which reserves room to grow. On 2026-09-19 the deploy finished from a buffer
left behind by an earlier attempt that had failed with `Max retries exceeded`.
Deploying **from** an existing buffer sizes programdata to **the buffer**, so it
is `37 + so` with nothing spare.

Measured on devnet at the time: programdata held exactly 1.67736012 SOL for
330,053 bytes, not 3.3538414 SOL for 660,077 bytes. The buffer's lamports became
the program.

⭐ This is a property of **how** it was deployed, not of the program. A rebuild
that happens to be smaller will upgrade fine, which makes the wall intermittent
and therefore worse.

⚠️ Rent is **not** the same on every cluster. The same 660,077 bytes price at
3.3538414 SOL on devnet and 4.5950268 SOL on a local test validator, ~37% apart.
Measure rent on the cluster you are spending on, or state which cluster the
number came from.

## Running `solana` from this directory

⛔ The machine's global config carries `Keypair Path: ./summit-devnet-keypair.json`
— **relative, and from a different project** — plus a devnet RPC. Any bare
`solana` command run from here has **no signer and the wrong cluster**, and it
fails as `No such file or directory` / `No default signer found`, which reads as
a missing wallet and is actually stale global config.

⇒ Always pass `--url` and `--keypair` explicitly.

## Tests

- The suite is **sequential with shared state**. `ts-mocha -g <pattern>` skips
  the `initialize`/`bootstrap`/`deposit` blocks that create the vault and ATAs,
  so a filtered run **fails in the vocabulary of a real defect while testing
  nothing**.
- Assert that tokens **moved**, from the transaction receipt
  (`pre`/`postTokenBalances`). Two reads across a transaction race, and the
  after-read can return the pre-transaction view — indistinguishable from "the
  operation did nothing". The vault's `held` does not save you either: it is
  decremented on a **separate line** from the CPI, so deleting the transfer
  satisfies it. That combination is how `transfer_out -> Ok(())` survived a full
  mutation run.
- `cargo mutants` on `math.rs` needs `-- --lib`, or every mutant drags the TS
  bridge through build + deploy + suite and **2 minutes becomes 5 hours**.

## Frontend

⛔ **Gitignore the env file BEFORE the first frontend commit, not after.**

Colour rules from `shared/data/stockpump-DESIGN.md` — these are product
semantics, not theme preferences:

- `#44b48b` seafoam means **"only rises"** and nothing else may wear it.
- `#1e4199` cobalt is the stock leg. **Never green-up/red-down.**
- `#ec652b` signal orange is reserved for **issuer control and risk**.

Redeem is user-facing honesty: taking one leg still burns the shares **in full**.
Show the forfeited amount in `--signal-orange`.
