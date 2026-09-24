# Cairn

## The LST layer for tokenized equities

Cairn turns tokenized stocks into liquid, yield-bearing positions.

Deposit SPYx. Receive **cSPYx**. Market makers borrow the deposited SPYx against
USDC collateral. Their borrow interest increases the SPYx claim behind each
cSPYx.

> Deposit SPYx. Receive cSPYx. Earn stock-borrow yield while cSPYx stays liquid.

**Try it:** [stockpump-one.vercel.app](https://stockpump-one.vercel.app) — paper trading, no wallet needed.
**Demo video:** coming soon. <!-- TODO(Jayant): add the demo video link here and in app/src/lib/links.ts -->

> [!IMPORTANT]
> Cairn is implemented and verified on a local mainnet-mint fork. The program is
> not on devnet or mainnet yet. See [Current state](#current-state).

## Try it (paper trading)

Open [stockpump-one.vercel.app](https://stockpump-one.vercel.app). The page
opens in **paper mode**. You need no wallet, no RPC, and no funds.

- Paper mode runs the SPYx market in your browser. It uses a bigint port of
  `programs/cairn/src/math.rs` (`app/src/lib/cairnMath.ts`). Each action follows
  its instruction in `lib.rs`: accrue first, then the same checks, then the same
  state updates.
- `app/src/lib/paper.selfcheck.ts` replays the Rust unit-test vectors and
  rounding cases against the port. It fails if a floor or ceil drifts.
- You start with 25 SPYx and 10,000 USDC in a paper wallet. The market opens with
  fixture history: 1,000 SPYx deposited, 600 SPYx borrowed, and 30 days of
  accrued interest. Prices are the fork fixture prices (SPYx 200.00, USDC 1.00).
- A first-visit tour explains the page. The **Tour** button in the navbar restarts it.
- The guided card has one button per step: **Lend 5 SPYx**, **Skip 30 days**,
  **Withdraw and see my profit**, then **Try the borrower side**. The navbar
  wallet shows each change as it happens.
- **Skip 1 day** and **Skip 30 days** move the paper clock and run the
  `accrue_interest` crank. **Reset** starts a fresh market.
- Custom amounts and the borrower side (post USDC, borrow, repay, withdraw)
  are under **Try the borrower side and custom amounts**. Each action says why
  it cannot run before you click.
- The program's errors appear as the program reports them. Examples: a borrow
  above the loan-to-value limit fails with `UnhealthyPosition`, and a redemption
  above idle cash fails with `InsufficientLiquidity`.
- **Found a problem?** opens a prefilled GitHub issue with the page state.

Every screen shows the **PAPER — simulated, no real funds** badge. When the page
runs on `localhost` and a Cairn market answers on the configured RPC, it
switches to live mode, and your wallet signs the transactions. Use `?mode=paper`
or `?mode=live` to choose a mode.

## What Cairn does

| Participant  | Action                                    | Result                                    |
| ------------ | ----------------------------------------- | ----------------------------------------- |
| Stock holder | Deposits SPYx                             | Receives policy-matched cSPYx              |
| Market maker | Deposits USDC collateral and borrows SPYx | Gets inventory for trading and settlement |
| cSPYx holder | Holds or uses cSPYx in DeFi               | Earns the SPYx borrow rate                 |
| Liquidator   | Repays unsafe debt                        | Receives discounted collateral            |

cSPYx is a **liquid lending receipt**. “LST for stocks” is the simple product
model. It is not validator staking. The yield comes from securities lending.

## Product features

- **One market per equity:** each market isolates its stock, debt, collateral,
  oracle, and risk settings.
- **Liquid receipt tokens:** deposit SPYx to receive cSPYx under the issuer's
  required transfer policy.
- **Stock-borrow yield:** borrower interest increases the SPYx claim behind
  cSPYx.
- **USDC collateral:** borrowers lock USDC before they receive stock inventory.
- **Utilization-based rates:** borrow cost and lender APY rise with demand.
- **Collateral health:** oracle prices determine borrow limits and liquidation.
- **Token-2022 underwriting:** Cairn checks issuer controls before it opens a
  market.
- **Compliance-aware receipts:** cSPYx applies compatible transfer and
  eligibility rules.
- **Liquidity-aware exits:** redemptions succeed only when enough equity is in
  the vault. A withdrawal queue is planned for high utilization.
- **Mainnet-fork tests:** local tests use cloned institutional mint state.
- **Visible risk:** the interface reports utilization, available liquidity,
  issuer powers, exchange rate, and losses.

## How it works

```text
SPYx holder
        |
        | deposit SPYx
        v
  Cairn SPYx vault  ---- mint ---->  cSPYx holder
        |
        | lend SPYx
        v
 Market maker  ---- USDC collateral ---->  Cairn market
        |
        | repay SPYx plus interest
        v
More SPYx value backs each cSPYx
```

1. Cairn checks the equity mint and its Token-2022 controls.
2. The user deposits SPYx into the SPYx vault PDA.
3. Cairn mints cSPYx at the current exchange rate.
4. A borrower posts USDC and borrows available SPYx.
5. Interest accrues in SPYx units and raises the cSPYx exchange rate.
6. The holder burns cSPYx to redeem available SPYx.

If borrowers use most of the vault, immediate redemption can become limited.
The current contract rejects a redemption that exceeds available liquidity. A
withdrawal queue or recall process is required before production.

## Example holder flow

This example uses illustrative numbers. It does not promise a return.

1. Jerry connects an eligible wallet and opens the SPYx market.
2. Cairn shows the issuer controls, utilization, lender APY, available SPYx,
   and redemption status.
3. Jerry deposits 10 SPYx when the exchange rate is 1 SPYx per cSPYx.
4. The vault measures the received amount and mints 10 cSPYx to Jerry.
5. A market maker posts USDC collateral and borrows part of the available SPYx.
6. The market maker's SPYx debt accrues interest. The cSPYx exchange rate rises.
7. Jerry can hold, transfer, or use cSPYx in an approved integration.
8. The exchange rate later reaches 1.02 SPYx per cSPYx.
9. Jerry burns 10 cSPYx and receives 10.2 SPYx when that liquidity is available.
10. If liquidity is not available, Jerry waits until borrowers repay. A queue
    is planned but not implemented.

## The receipt token

Each supported equity has one isolated market and one receipt token.

| Deposit | Receipt | Meaning                                        |
| ------- | ------- | ---------------------------------------------- |
| SPYx    | cSPYx   | Claim on the managed SPYx assets in its market |
| SPY     | cSPY    | Claim on the managed SPY assets in its market  |
| TSLA    | cTSLA   | Claim on the managed TSLA assets in its market |

The exchange rate is based on net assets, not a displayed stock price:

```text
assets = available equity + borrower debt + accrued interest - losses - reserves
exchange rate = assets / receipt-token supply
```

Deposits mint shares at this rate. Redemptions burn shares at this rate. Direct
token donations must not change internal accounting.

## Yield model

Borrowers pay a variable rate based on utilization:

```text
utilization = borrowed SPYx / total managed SPYx
```

The rate rises as utilization rises. The UI presents a kink curve with a steep
penalty slope above 80% utilization:

- Low utilization gives borrowers cheap inventory.
- High utilization increases lender APY.
- The final range rises sharply to protect withdrawal liquidity.

The protocol can retain a stated reserve factor. The remaining interest belongs
to cSPYx holders. Yield is zero when there is no borrowing.

## Why Token-2022 needs a separate protocol

Tokenized equities can use controls that normal SPL assets do not use. These
controls can block transfers, seize vault assets, change displayed amounts, or
execute issuer code during a transfer.

Cairn uses a fail-closed underwriting gateway before it opens a market. The
gateway records and evaluates:

- Mint and freeze authorities
- Permanent delegate
- Transfer hook and hook authority
- Pausable configuration
- Transfer fees
- Default account state
- Mint close authority
- Non-transferable configuration
- Scaled UI amount configuration
- Token-program owner and decimals

The gateway returns one of three decisions:

- **Accepted:** the asset matches an approved issuer policy.
- **Restricted:** the asset needs extra accounts or transfer rules.
- **Rejected:** Cairn cannot operate or exit safely.

Extension presence alone cannot prove safety. Transfer-hook programs and issuer
authorities need explicit allowlists. Policy changes must stop new deposits
without blocking safe exits.

### Compliance cannot stop at the vault

A freely transferable cSPYx could bypass restrictions on the underlying SPYx.
The receipt token must enforce compatible eligibility and transfer rules. Cairn
must not create a permissionless wrapper around a restricted security.

## Cairn V2 architecture

Each market contains:

- One Token-2022 equity mint
- One Token-2022 receipt mint
- One equity vault PDA
- One USDC collateral vault PDA
- Interest, reserve, and utilization state
- Oracle and risk configuration
- Borrow positions isolated by market

The V2 instruction set is:

| Instruction         | Purpose                                                     |
| ------------------- | ----------------------------------------------------------- |
| `initialize_market` | Validate a mint and create its isolated market              |
| `deposit`           | Move measured equity into the vault and mint receipt tokens |
| `redeem`            | Burn receipt tokens and return available equity             |
| `borrow`            | Lock USDC collateral and transfer equity to a borrower      |
| `repay`             | Return equity principal and interest                        |
| `accrue_interest`   | Permissionlessly update the borrow index to the current clock |
| `liquidate`         | Close an unsafe position and pay the liquidator             |
| `deposit_collateral` | Lock USDC in a borrow position                              |
| `withdraw_collateral` | Withdraw USDC while the position remains healthy           |
| `reconcile_cash`    | Record issuer seizure or another verified asset loss         |
| `set_market_config` | Update bounded market controls through the market authority  |
| `set_paused`        | Stop new deposits or borrows without blocking exits          |

Interest accrues inside every state-changing lending instruction. The global
borrow index updates in constant time without iterating over borrowers.

### Core invariants

Agents and contributors must preserve these rules:

1. Cairn mints receipt tokens only after it measures the equity received.
2. Debt cannot increase unless the same transaction transfers equity out.
3. Repayment credit cannot exceed the measured equity received.
4. A redemption burns the exact claim that it pays.
5. Direct transfers into a vault do not increase managed assets.
6. Stale or invalid oracle data blocks borrowing and liquidation.
7. A deposit cap never blocks repayment or redemption.
8. Issuer seizure and bad debt reduce the exchange rate. The UI reports losses.
9. The receipt token applies the required issuer eligibility rules.
10. Every market isolates its assets, debt, oracle, and risk configuration.

## Mainnet-fork testing

Institutional equity mints do not exist on devnet. Cairn uses a local validator
that clones real mainnet mint accounts. This tests their true owners, decimals,
and Token-2022 extension data without using real funds.

The current fork includes:

- SPYx: Token-2022, 676-byte mint account, 8 decimals
- USDC: classic SPL Token collateral cloned from its mainnet mint
- Funded test ATAs for 100 SPYx and 1,000,000 USDC
- Recorded 676-byte layout, 8 decimals, authorities, and Token-2022 extensions
- Fresh deterministic Pyth spot and TWAP consumer fixtures

The fork does not test real issuance. It seeds balances at genesis because only
the issuers control the live mint authorities. An active transfer-hook program
also needs its own local execution test.

## Built-in institutional sandbox

The interface includes a guided Cairn Protocol Sandbox for zero-friction local
evaluation:

1. **Local fixture faucet:** transfers 10 SPYx and 10,000 USDC from the funded
   fork account to the connected wallet. It does not impersonate the real
   issuer or mint live SPYx.
2. **Wallet-signed staking:** deposits 5 SPYx through the Anchor `deposit`
   instruction and creates the Token-2022 cSPYx ATA explicitly.
3. **Two-sided borrowing:** initializes the connected wallet's position, posts
   classic SPL USDC, and borrows SPYx through `deposit_collateral` and `borrow`.
4. **Interest and exit:** calls the permissionless `accrue_interest` crank,
   repays borrower debt, then burns cSPYx through `redeem`.

In live mode every number on the page comes from the market, position, and
token accounts on the fork. The page uses the same `viewOf()` derivation as
paper mode. Solana's clock is authoritative on-chain, so live mode has no time
controls. The recorded fork lifecycle in `app/src/data/fork-run.json` is always
shown as on-chain evidence.

## Current state

| Capability     | Current implementation                                  |
| -------------- | ------------------------------------------------------- |
| User deposit   | One isolated tokenized-equity market                    |
| Receipt        | Token-2022 cEquity receipt                              |
| Yield source   | Equity debt accrued through a global borrow index       |
| Borrowing      | USDC-collateralized equity loans                        |
| Liquidation    | Pyth spot and TWAP health checks                        |
| Mint screening | On-chain fail-closed extension policy                   |
| Testing        | Math, property, lint, IDL, and SBF build checks         |

Current facts:

- Cairn program ID is `EY5qnrQjqEsAQ65Nrd8Zd3DcqAmemzmgCYfiGfC15vCL`.
- Cairn builds locally but has not been deployed or independently audited.
- The interface supports Phantom and Solflare and submits wallet-signed Cairn
  transactions when connected to a configured local fork.
- The public program ID has not been updated or deployed after the addition of
  `accrue_interest`; the verified execution target remains the local fork.
- Active Token-2022 transfer hooks are rejected until hook-account resolution
  and local execution tests are implemented.
- Collateral is restricted to classic SPL Token USDC so liquidation cannot be
  blocked by Token-2022 hooks or mutable transfer extensions.
- The deposit path revalidates mutable mint policy before accepting inventory.
- `tests/cairn.spec.ts` passes the complete deposit, borrow, accrual, repay, and
  yield-positive redemption lifecycle against the cloned SPYx mint.

## Build and test

Requirements: Solana CLI, Anchor, Rust, Node.js, and npm.

```sh
# Build the program. Do not use bare `anchor build` in this repository.
./build.sh

# Run protocol tests and lint.
cargo test -p cairn --lib
cargo clippy -p cairn --all-targets -- -D warnings

# Terminal 1: run the isolated fork.
CAIRN_LEDGER=/tmp/cairn-lifecycle-ledger ./fork/setup.sh

# Terminal 2: fund the deployer, deploy the program, and start the local faucet.
# The fork does not fund your wallet. Airdrop first, or the deploy fails with
# "insufficient funds".
solana airdrop 100 --url http://127.0.0.1:8899 --keypair ~/.config/solana/id.json
anchor deploy --provider.cluster localnet
npm run faucet

# Verify the full lifecycle.
ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 \
  npx ts-mocha -p ./tsconfig.json -t 1000000 tests/cairn.spec.ts

# The spec also creates the SPYx market. Run it before you use live mode:
# live mode needs the market account.
#
# Do the fork steps in one sitting. The oracle fixtures are stamped when
# setup.sh runs, and the market accepts prices up to 3,600 seconds old. After
# one hour, borrow fails with InvalidOraclePrice, and so does a collateral
# withdrawal while debt is open. Restart setup.sh.

# Terminal 3: check and run the frontend (live mode on localhost).
cd app
npm ci
npm run check
npm run build
npm run dev
```

Important repository rules:

- Use `./build.sh`. A bare `anchor build` can leave a stale program artifact.
- `/usr/bin/yarn` is `cmdtest` on the development machine. Use npm.
- Always give `solana` an explicit RPC URL and keypair.

## Repository map

```text
programs/cairn/src/lib.rs           V2 lending instructions and account constraints
programs/cairn/src/state.rs         isolated market, position, and risk state
programs/cairn/src/math.rs          receipt, debt-share, rate, and liquidation math
programs/cairn/src/oracle.rs        Pyth spot and TWAP validation
programs/cairn/src/policy.rs        Token-2022 mint policy gate
fork/setup.sh                       local mainnet-fork setup
fork/generate-cairn-fixtures.mjs    funded token and oracle genesis fixtures
tests/cairn.spec.ts                 complete SPYx lending lifecycle
app/src/lib/issuerControls.ts       issuer-control decoder
app/src/lib/anchorClient.ts         typed Anchor provider and PDA helpers
app/src/lib/transactions.ts         Token-2022-aware transaction dispatch
app/src/lib/cairnMath.ts            bigint port of math.rs, shared by paper and live views
app/src/lib/paperMarket.ts          in-browser paper market that follows lib.rs
app/src/lib/paper.selfcheck.ts      Rust-vector and rounding parity checks for the port
app/src/lib/liveMarket.ts           reads market, position, and balances from a fork
app/src/hooks/useCairn.ts           paper/live mode selection and actions
app/src/components/SandboxRibbon.tsx mode badge, guided lifecycle, and time controls
app/src/components/MotionUI.tsx     beUI-inspired accessible motion primitives
app/src/components/YieldCurve.tsx   rate curve from borrow_rate_bps and the market config
docs/nasty-token-checklist.md       measured issuer and extension risks
docs/mutation-testing.md            test-quality findings
CLAUDE.md                           mandatory repository rules
```

## Complete local lending demo

The verified local cSPYx demo performs one complete lifecycle:

1. Approve the cloned SPYx mint through the underwriting gateway.
2. Deposit SPYx and mint cSPYx.
3. Post USDC collateral and borrow SPYx.
4. Accrue interest through the utilization model.
5. Repay principal and interest in SPYx.
6. Burn cSPYx and withdraw more SPYx than the original deposit.
7. Show every transaction and each exchange-rate change.

This lifecycle now passes against the cloned 676-byte SPYx Token-2022 mint.
Cairn remains pre-production until deployment, audit, and live oracle and issuer
integrations are complete.

## Next steps after the hackathon

Cairn runs its complete SPYx lending lifecycle on a local mainnet-mint fork.
These steps move it from a verified local build to a protocol that real
holders can use.

### 1. Public deployment

- Deploy the V2 program to devnet and publish the explorer link.
- Create a devnet test market with a Token-2022 mint that copies the SPYx
  extension set, because the real SPYx mint does not exist on devnet.
- Connect the market to Pyth price updates on devnet instead of genesis
  fixtures.
- Let the interface read market, position, and exchange-rate state from the
  chain, so every number on the page comes from an account.

### 2. Liquidity and exits

- Add a withdrawal queue. Today a redemption that exceeds available SPYx
  fails. A queue lets holders wait for repayment in order.
- Add a recall process so that the market can ask borrowers to return stock
  when utilization stays high.
- Run a keeper for `accrue_interest` and for liquidations, and publish its
  source.

### 3. Issuer integration

- Support active Token-2022 transfer hooks. This needs hook-account
  resolution and local execution tests for each supported issuer.
- Agree on terms with equity issuers for permanent-delegate and freeze
  behavior, so cSPYx mirrors issuer controls by contract as well as by code.
- Define the eligibility model for cSPYx holders with the issuer's compliance
  rules.

### 4. More markets

- Open isolated markets for more tokenized equities, for example SPY and TSLA.
  Each market keeps its own oracle, risk settings, and receipt token.
- Publish the per-market risk parameters and the reason for each value.

### 5. DeFi integrations

- Make cSPYx usable as collateral in other Solana lending markets.
- Add cSPYx liquidity pools, so holders can exit without waiting for
  redemption.

### 6. Security before mainnet

- Get an independent audit of the program and the mint policy gate.
- Extend mutation testing from the math module to every instruction.
- Set the program upgrade authority to a multisig and document the upgrade
  process.
- Launch on mainnet with deposit caps, and raise the caps only after the
  audit and a period of stable operation.

## Security and legal scope

Cairn is experimental software. Tokenized equities include issuer, market,
oracle, liquidation, smart-contract, and regulatory risks. A receipt token does
not remove the restrictions or legal terms of its underlying equity token.

Do not use the protocol with real assets before an independent audit, defined
issuer agreements, production oracle controls, and a reviewed compliance model.
