import { AnchorProvider, Program } from "@coral-xyz/anchor";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { IDL, type Cairn } from "../idl";

const env = import.meta.env ?? {};
const address = env.VITE_PROGRAM_ID || IDL.address;
export const CAIRN_PROGRAM_ID = new PublicKey(address);
export const SPYX_MINT = new PublicKey(
  env.VITE_EQUITY_MINT || "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
);

export function getCairnProgram(connection: Connection, wallet: AnchorWallet) {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  return new Program<Cairn>({ ...IDL, address: CAIRN_PROGRAM_ID.toBase58() }, provider);
}

export function getMarketPda(equityMint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("market"), equityMint.toBytes()],
    CAIRN_PROGRAM_ID,
  )[0];
}

export function getPositionPda(market: PublicKey, owner: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("position"), market.toBytes(), owner.toBytes()],
    CAIRN_PROGRAM_ID,
  )[0];
}

export function getEquityVaultAddress(market: PublicKey, equityMint: PublicKey) {
  return getAssociatedTokenAddressSync(equityMint, market, true, TOKEN_2022_PROGRAM_ID);
}

export function getCollateralVaultAddress(market: PublicKey, collateralMint: PublicKey) {
  return getAssociatedTokenAddressSync(collateralMint, market, true, TOKEN_PROGRAM_ID);
}
