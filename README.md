# Cairn

## The LST layer for tokenized equities

Cairn turns tokenized stocks into liquid, yield-bearing positions.

Deposit a tokenized equity such as AAPL. Receive **cAAPL**. Market makers borrow
the deposited AAPL against USDC collateral. Their borrow interest increases the
AAPL claim behind each cAAPL.

> Deposit AAPL. Receive cAAPL. Earn stock-borrow yield while cAAPL stays liquid.

> [!IMPORTANT]
> Cairn is implemented and builds locally. It is not deployed. See
> [Current state](#current-state).

## What Cairn does

| Participant  | Action                                    | Result                                    |
| ------------ | ----------------------------------------- | ----------------------------------------- |
| Stock holder | Deposits tokenized AAPL                   | Receives policy-matched cAAPL              |
| Market maker | Deposits USDC collateral and borrows AAPL | Gets inventory for trading and settlement |
| cAAPL holder | Holds or uses cAAPL in DeFi               | Earns the AAPL borrow rate                |
| Liquidator   | Repays unsafe debt                        | Receives discounted collateral            |

cAAPL is a **liquid lending receipt**. “LST for stocks” is the simple product
model. It is not validator staking. The yield comes from securities lending.

## Product features

- **One market per equity:** each market isolates its stock, debt, collateral,
  oracle, and risk settings.
- **Liquid receipt tokens:** deposit AAPL to receive cAAPL under the issuer's
  required transfer policy.
- **Stock-borrow yield:** borrower interest increases the AAPL claim behind
  cAAPL.
- **USDC collateral:** borrowers lock USDC before they receive stock inventory.
- **Utilization-based rates:** borrow cost and lender APY rise with demand.
- **Collateral health:** oracle prices determine borrow limits and liquidation.
- **Token-2022 underwriting:** Cairn checks issuer controls before it opens a
  market.
- **Compliance-aware receipts:** cAAPL applies compatible transfer and
  eligibility rules.
- **Liquidity-aware exits:** redemptions succeed only when enough equity is in
  the vault. A withdrawal queue is planned for high utilization.
- **Mainnet-fork tests:** local tests use cloned institutional mint state.
- **Visible risk:** the interface reports utilization, available liquidity,
  issuer powers, exchange rate, and losses.

## How it works

```text
Tokenized AAPL holder
        |
        | deposit AAPL
        v
  Cairn AAPL vault  ---- mint ---->  cAAPL holder
        |
        | lend AAPL
        v
 Market maker  ---- USDC collateral ---->  Cairn market
        |
        | repay AAPL plus interest
        v
More AAPL value backs each cAAPL
```

1. Cairn checks the equity mint and its Token-2022 controls.
2. The user deposits AAPL into the AAPL vault PDA.
3. Cairn mints cAAPL at the current exchange rate.
4. A borrower posts USDC and borrows available AAPL.
5. Interest accrues in AAPL units and raises the cAAPL exchange rate.
6. The holder burns cAAPL to redeem available AAPL.

If borrowers use most of the vault, immediate redemption can become limited.
The current contract rejects a redemption that exceeds available liquidity. A
withdrawal queue or recall process is required before production.

## Example holder flow

This example uses illustrative numbers. It does not promise a return.

1. Jerry connects an eligible wallet and opens the AAPL market.
2. Cairn shows the issuer controls, utilization, lender APY, available AAPL,
   and redemption status.
3. Jerry deposits 10 AAPL when the exchange rate is 1 AAPL per cAAPL.
4. The vault measures the received amount and mints 10 cAAPL to Jerry.
5. A market maker posts USDC collateral and borrows part of the available AAPL.
6. The market maker's AAPL debt accrues interest. The cAAPL exchange rate rises.
7. Jerry can hold, transfer, or use cAAPL in an approved integration.
8. The exchange rate later reaches 1.02 AAPL per cAAPL.
9. Jerry burns 10 cAAPL and receives 10.2 AAPL when that liquidity is available.
10. If liquidity is not available, Jerry waits until borrowers repay. A queue
    is planned but not implemented.

## The receipt token

Each supported equity has one isolated market and one receipt token.

| Deposit | Receipt | Meaning                                        |
| ------- | ------- | ---------------------------------------------- |
| AAPL    | cAAPL   | Claim on the managed AAPL assets in its market |
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
utilization = borrowed AAPL / total managed AAPL
```

The rate rises as utilization rises. The UI presents this as a staircase:

- Low utilization gives borrowers cheap inventory.
- High utilization increases lender APY.
- The final range rises sharply to protect withdrawal liquidity.

The protocol can retain a stated reserve factor. The remaining interest belongs
to cAAPL holders. Yield is zero when there is no borrowing.

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

A freely transferable cAAPL could bypass restrictions on the underlying AAPL.
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
- USDY: classic SPL Token, 82-byte mint account, 6 decimals
- Separate token programs inside one transaction
- Recorded mint-authority and issuer-control evidence

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
- A full Anchor lifecycle test against cloned institutional assets is still
  required.

## Build and test

Requirements: Solana CLI, Anchor, Rust, Node.js, and npm.

```sh
# Build the program. Do not use bare `anchor build` in this repository.
./build.sh

# Run protocol tests and lint.
cargo test -p cairn --lib
cargo clippy -p cairn --all-targets -- -D warnings

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
app/src/lib/issuerControls.ts       issuer-control decoder
app/src/components/MotionUI.tsx     beUI-inspired accessible motion primitives
app/src/components/YieldCurve.tsx   interactive utilization and lender-rate model
docs/nasty-token-checklist.md       measured issuer and extension risks
docs/mutation-testing.md            test-quality findings
CLAUDE.md                           mandatory repository rules
```

## Definition of the first complete lending demo

The first valid cAAPL demo must perform one complete lifecycle:

1. Approve an AAPL mint through the underwriting gateway.
2. Deposit AAPL and mint cAAPL.
3. Post USDC collateral and borrow AAPL.
4. Accrue interest through the utilization model.
5. Repay principal and interest in AAPL.
6. Burn cAAPL and withdraw more AAPL than the original claim.
7. Show every transaction and each exchange-rate change.

Until this lifecycle passes against a cloned institutional Token-2022 mint,
Cairn is pre-production software, not a working securities-lending market.

## Security and legal scope

Cairn is experimental software. Tokenized equities include issuer, market,
oracle, liquidation, smart-contract, and regulatory risks. A receipt token does
not remove the restrictions or legal terms of its underlying equity token.

Do not use the protocol with real assets before an independent audit, defined
issuer agreements, production oracle controls, and a reviewed compliance model.
