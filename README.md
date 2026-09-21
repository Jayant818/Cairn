# Cairn

## The LST layer for tokenized equities

Cairn turns tokenized stocks into liquid, yield-bearing positions.

Deposit SPYx. Receive **cSPYx**. Market makers borrow the deposited SPYx against
USDC collateral. Their borrow interest increases the SPYx claim behind each
cSPYx.

> Deposit SPYx. Receive cSPYx. Earn stock-borrow yield while cSPYx stays liquid.

> [!IMPORTANT]
> Cairn is implemented and builds locally. It is not deployed. See
> [Current state](#current-state).

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
- The new interface is an interactive model. It does not connect a wallet or
  submit transactions.
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

# In a second terminal, run the isolated fork and lifecycle test.
CAIRN_LEDGER=/tmp/cairn-lifecycle-ledger ./fork/setup.sh
anchor deploy --provider.cluster localnet
ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 \
  npx ts-mocha -p ./tsconfig.json -t 1000000 tests/cairn.spec.ts

# Check the frontend.
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
app/src/components/MotionUI.tsx     beUI-inspired accessible motion primitives
app/src/components/YieldCurve.tsx   interactive utilization and lender-rate model
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

## Security and legal scope

Cairn is experimental software. Tokenized equities include issuer, market,
oracle, liquidation, smart-contract, and regulatory risks. A receipt token does
not remove the restrictions or legal terms of its underlying equity token.

Do not use the protocol with real assets before an independent audit, defined
issuer agreements, production oracle controls, and a reviewed compliance model.
