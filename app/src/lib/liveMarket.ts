// Reads the same MarketState / Position / Wallet shapes that paper mode uses,
// from a running Cairn deployment. The page then derives every number with the
// same viewOf(), so live and paper figures come from one code path.
import { Program, type Provider } from "@coral-xyz/anchor";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, getMint } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
import type { MarketConfig } from "./cairnMath";
import { CAIRN_PROGRAM_ID, SPYX_MINT, getMarketPda, getPositionPda } from "./anchorClient";
import { IDL, type Cairn } from "../idl";
import type { MarketState, Position, Wallet } from "./paperMarket";

const big = (value: { toString(): string } | number) => BigInt(value.toString());

function readOnlyProgram(connection: Connection) {
  return new Program<Cairn>({ ...IDL, address: CAIRN_PROGRAM_ID.toBase58() }, { connection } as Provider);
}

export async function probeLive(connection: Connection, timeoutMs = 1_500) {
  const timeout = new Promise<false>((resolve) => setTimeout(() => resolve(false), timeoutMs));
  const probe = connection.getAccountInfo(getMarketPda(SPYX_MINT)).then((info) => info !== null).catch(() => false);
  return Promise.race([probe, timeout]);
}

async function balance(connection: Connection, address: PublicKey) {
  try {
    return BigInt((await connection.getTokenAccountBalance(address)).value.amount);
  } catch {
    return 0n;
  }
}

export async function fetchLive(connection: Connection, owner: PublicKey | null) {
  const program = readOnlyProgram(connection);
  const marketAddress = getMarketPda(SPYX_MINT);
  const account = await program.account.market.fetch(marketAddress);
  const receipt = await getMint(connection, account.receiptMint, "confirmed", TOKEN_2022_PROGRAM_ID);
  const c = account.config;
  const config: MarketConfig = {
    maxPriceAgeSeconds: big(c.maxPriceAgeSeconds),
    maxConfidenceBps: big(c.maxConfidenceBps),
    maxSpotTwapDeviationBps: big(c.maxSpotTwapDeviationBps),
    loanToValueBps: big(c.loanToValueBps),
    liquidationThresholdBps: big(c.liquidationThresholdBps),
    liquidationBonusBps: big(c.liquidationBonusBps),
    closeFactorBps: big(c.closeFactorBps),
    reserveFactorBps: big(c.reserveFactorBps),
    baseRateBps: big(c.baseRateBps),
    slope1Bps: big(c.slope1Bps),
    slope2Bps: big(c.slope2Bps),
    kinkBps: big(c.kinkBps),
    depositCap: big(c.depositCap),
    borrowCap: big(c.borrowCap),
  };
  const market: MarketState = {
    cash: big(account.cash),
    totalDebtShares: big(account.totalDebtShares),
    borrowIndex: big(account.borrowIndex),
    reserves: big(account.reserves),
    totalCollateral: big(account.totalCollateral),
    receiptSupply: receipt.supply,
    lastAccrual: big(account.lastAccrualTimestamp),
  };
  let position: Position = { collateral: 0n, debtShares: 0n };
  let wallet: Wallet = { spyx: 0n, usdc: 0n, cspyx: 0n };
  if (owner) {
    const found = await program.account.position.fetchNullable(getPositionPda(marketAddress, owner));
    if (found) position = { collateral: big(found.collateral), debtShares: big(found.debtShares) };
    const [spyx, usdc, cspyx] = await Promise.all([
      balance(connection, getAssociatedTokenAddressSync(account.equityMint, owner, false, TOKEN_2022_PROGRAM_ID)),
      balance(connection, getAssociatedTokenAddressSync(account.collateralMint, owner, false, TOKEN_PROGRAM_ID)),
      balance(connection, getAssociatedTokenAddressSync(account.receiptMint, owner, false, TOKEN_2022_PROGRAM_ID)),
    ]);
    wallet = { spyx, usdc, cspyx };
  }
  return { market, position, wallet, config };
}
