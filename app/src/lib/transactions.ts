import { AnchorProvider, type Program } from "@coral-xyz/anchor";
import BN from "bn.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import type { Cairn } from "../idl";
import {
  SPYX_MINT,
  getCollateralVaultAddress,
  getEquityVaultAddress,
  getMarketPda,
  getPositionPda,
} from "./anchorClient";

type OracleAccounts = {
  equitySpot: PublicKey;
  equityTwap: PublicKey;
  collateralSpot: PublicKey;
  collateralTwap: PublicKey;
};

async function oracleAccounts(): Promise<OracleAccounts> {
  const env = import.meta.env ?? {};
  const configured = [
    env.VITE_EQUITY_SPOT,
    env.VITE_EQUITY_TWAP,
    env.VITE_COLLATERAL_SPOT,
    env.VITE_COLLATERAL_TWAP,
  ];
  if (configured.every(Boolean)) {
    return {
      equitySpot: new PublicKey(configured[0]!),
      equityTwap: new PublicKey(configured[1]!),
      collateralSpot: new PublicKey(configured[2]!),
      collateralTwap: new PublicKey(configured[3]!),
    };
  }
  const faucet = env.VITE_FAUCET_URL || "http://127.0.0.1:8787/faucet";
  const response = await fetch(faucet.replace(/\/faucet$/, "/config"));
  if (!response.ok) throw new Error("Oracle fixtures unavailable; start npm run faucet");
  const body = await response.json() as { oracleAddresses: Record<string, string> };
  return {
    equitySpot: new PublicKey(body.oracleAddresses["equity-spot"]),
    equityTwap: new PublicKey(body.oracleAddresses["equity-twap"]),
    collateralSpot: new PublicKey(body.oracleAddresses["collateral-spot"]),
    collateralTwap: new PublicKey(body.oracleAddresses["collateral-twap"]),
  };
}

export function rawAmount(value: string | number, decimals: number) {
  const normalized = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) throw new Error("Amount must be a positive number");
  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > decimals) throw new Error(`Amount supports at most ${decimals} decimals`);
  const raw = BigInt(whole) * 10n ** BigInt(decimals)
    + BigInt(fraction.padEnd(decimals, "0") || "0");
  if (raw <= 0n) throw new Error("Amount must be greater than zero");
  return new BN(raw.toString());
}

async function marketState(program: Program<Cairn>) {
  const market = getMarketPda(SPYX_MINT);
  const state = await program.account.market.fetch(market);
  return { market, state };
}

export async function executeDeposit(
  program: Program<Cairn>,
  wallet: PublicKey,
  amount: string | number,
) {
  const { market, state } = await marketState(program);
  const receiptMint = state.receiptMint;
  const depositorEquity = getAssociatedTokenAddressSync(
    state.equityMint, wallet, false, TOKEN_2022_PROGRAM_ID,
  );
  const depositorReceipt = getAssociatedTokenAddressSync(
    receiptMint, wallet, false, TOKEN_2022_PROGRAM_ID,
  );
  return program.methods.deposit(rawAmount(amount, 8)).accountsStrict({
    depositor: wallet,
    market,
    equityMint: state.equityMint,
    receiptMint,
    equityVault: getEquityVaultAddress(market, state.equityMint),
    depositorEquity,
    depositorReceipt,
    equityTokenProgram: TOKEN_2022_PROGRAM_ID,
    receiptTokenProgram: TOKEN_2022_PROGRAM_ID,
  }).preInstructions([
    createAssociatedTokenAccountIdempotentInstruction(
      wallet, depositorReceipt, wallet, receiptMint, TOKEN_2022_PROGRAM_ID,
    ),
  ]).rpc();
}

async function ensurePosition(program: Program<Cairn>, market: PublicKey, wallet: PublicKey) {
  const provider = program.provider as AnchorProvider;
  const position = getPositionPda(market, wallet);
  if (!(await provider.connection.getAccountInfo(position))) {
    await program.methods.initializePosition().accountsStrict({
      owner: wallet,
      market,
      position,
      systemProgram: SystemProgram.programId,
    }).rpc();
  }
  return position;
}

export async function executeDepositCollateral(
  program: Program<Cairn>,
  wallet: PublicKey,
  collateralAmount: string | number,
) {
  const { market, state } = await marketState(program);
  const position = await ensurePosition(program, market, wallet);
  return program.methods.depositCollateral(rawAmount(collateralAmount, 6)).accountsStrict({
    owner: wallet,
    market,
    position,
    collateralMint: state.collateralMint,
    collateralVault: getCollateralVaultAddress(market, state.collateralMint),
    ownerCollateral: getAssociatedTokenAddressSync(state.collateralMint, wallet, false, TOKEN_PROGRAM_ID),
    collateralTokenProgram: TOKEN_PROGRAM_ID,
  }).rpc();
}

export async function executeWithdrawCollateral(
  program: Program<Cairn>,
  wallet: PublicKey,
  collateralAmount: string | number,
) {
  const { market, state } = await marketState(program);
  const oracles = await oracleAccounts();
  return program.methods.withdrawCollateral(rawAmount(collateralAmount, 6)).accountsStrict({
    owner: wallet,
    market,
    position: getPositionPda(market, wallet),
    equityMint: state.equityMint,
    collateralMint: state.collateralMint,
    collateralVault: getCollateralVaultAddress(market, state.collateralMint),
    ownerCollateral: getAssociatedTokenAddressSync(state.collateralMint, wallet, false, TOKEN_PROGRAM_ID),
    ...oracles,
    collateralTokenProgram: TOKEN_PROGRAM_ID,
  }).rpc();
}

export async function executeBorrow(
  program: Program<Cairn>,
  wallet: PublicKey,
  equityAmount: string | number,
) {
  const { market, state } = await marketState(program);
  const position = await ensurePosition(program, market, wallet);
  const borrowerEquity = getAssociatedTokenAddressSync(
    state.equityMint, wallet, false, TOKEN_2022_PROGRAM_ID,
  );
  const oracles = await oracleAccounts();
  return program.methods.borrow(rawAmount(equityAmount, 8)).accountsStrict({
    borrower: wallet,
    market,
    position,
    equityMint: state.equityMint,
    collateralMint: state.collateralMint,
    equityVault: getEquityVaultAddress(market, state.equityMint),
    borrowerEquity,
    ...oracles,
    equityTokenProgram: TOKEN_2022_PROGRAM_ID,
  }).preInstructions([
    createAssociatedTokenAccountIdempotentInstruction(
      wallet, borrowerEquity, wallet, state.equityMint, TOKEN_2022_PROGRAM_ID,
    ),
  ]).rpc();
}

export async function executeRepay(
  program: Program<Cairn>,
  wallet: PublicKey,
  equityAmount: string | number,
) {
  const { market, state } = await marketState(program);
  return program.methods.repay(rawAmount(equityAmount, 8)).accountsStrict({
    payer: wallet,
    market,
    position: getPositionPda(market, wallet),
    equityMint: state.equityMint,
    equityVault: getEquityVaultAddress(market, state.equityMint),
    payerEquity: getAssociatedTokenAddressSync(state.equityMint, wallet, false, TOKEN_2022_PROGRAM_ID),
    equityTokenProgram: TOKEN_2022_PROGRAM_ID,
  }).rpc();
}

export async function executeAccrueInterest(program: Program<Cairn>) {
  const { market, state } = await marketState(program);
  return program.methods.accrueInterest().accountsStrict({
    market,
    equityMint: state.equityMint,
  }).rpc();
}

export async function executeRedeem(
  program: Program<Cairn>,
  wallet: PublicKey,
  receiptAmount: string | number,
) {
  const { market, state } = await marketState(program);
  const redeemerEquity = getAssociatedTokenAddressSync(
    state.equityMint, wallet, false, TOKEN_2022_PROGRAM_ID,
  );
  const redeemerReceipt = getAssociatedTokenAddressSync(
    state.receiptMint, wallet, false, TOKEN_2022_PROGRAM_ID,
  );
  return program.methods.redeem(rawAmount(receiptAmount, 8)).accountsStrict({
    redeemer: wallet,
    market,
    equityMint: state.equityMint,
    receiptMint: state.receiptMint,
    equityVault: getEquityVaultAddress(market, state.equityMint),
    redeemerEquity,
    redeemerReceipt,
    equityTokenProgram: TOKEN_2022_PROGRAM_ID,
    receiptTokenProgram: TOKEN_2022_PROGRAM_ID,
  }).rpc();
}

export async function executeRedeemAll(program: Program<Cairn>, wallet: PublicKey) {
  const { market, state } = await marketState(program);
  const redeemerReceipt = getAssociatedTokenAddressSync(
    state.receiptMint, wallet, false, TOKEN_2022_PROGRAM_ID,
  );
  const receipt = await getAccount(
    (program.provider as AnchorProvider).connection,
    redeemerReceipt,
    undefined,
    TOKEN_2022_PROGRAM_ID,
  );
  if (receipt.amount === 0n) throw new Error("No cSPYx available to redeem");
  const redeemerEquity = getAssociatedTokenAddressSync(
    state.equityMint, wallet, false, TOKEN_2022_PROGRAM_ID,
  );
  return program.methods.redeem(new BN(receipt.amount.toString())).accountsStrict({
    redeemer: wallet,
    market,
    equityMint: state.equityMint,
    receiptMint: state.receiptMint,
    equityVault: getEquityVaultAddress(market, state.equityMint),
    redeemerEquity,
    redeemerReceipt,
    equityTokenProgram: TOKEN_2022_PROGRAM_ID,
    receiptTokenProgram: TOKEN_2022_PROGRAM_ID,
  }).rpc();
}

export async function executeRepayAll(program: Program<Cairn>, wallet: PublicKey) {
  const { market, state } = await marketState(program);
  const position = getPositionPda(market, wallet);
  const borrower = await program.account.position.fetch(position);
  const currentMarket = await program.account.market.fetch(market);
  const shares = BigInt(borrower.debtShares.toString());
  if (shares === 0n) return null;
  const index = BigInt(currentMarket.borrowIndex.toString());
  const debt = (shares * index + 1_000_000_000_000_000_000n - 1n)
    / 1_000_000_000_000_000_000n;
  const payerEquity = getAssociatedTokenAddressSync(
    state.equityMint, wallet, false, TOKEN_2022_PROGRAM_ID,
  );
  return program.methods.repay(new BN(debt.toString())).accountsStrict({
    payer: wallet,
    market,
    position,
    equityMint: state.equityMint,
    equityVault: getEquityVaultAddress(market, state.equityMint),
    payerEquity,
    equityTokenProgram: TOKEN_2022_PROGRAM_ID,
  }).rpc();
}

export function explorerTransactionUrl(signature: string, endpoint: string) {
  if (endpoint.includes("devnet")) {
    return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
  }
  return `https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${encodeURIComponent(endpoint)}`;
}
