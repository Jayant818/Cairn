import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { IDL } from "../idl";
import { SPYX_MINT, getEquityVaultAddress, getMarketPda } from "./anchorClient";
import { explorerTransactionUrl, rawAmount } from "./transactions";

const eq = (actual: unknown, expected: unknown, label: string) => {
  if (actual !== expected) throw new Error(`${label}: ${actual} !== ${expected}`);
};

const market = getMarketPda(SPYX_MINT);
eq(market.toBase58(), "pEaDNP5Xfid1Vj6UpFYmaFGsgdyzR7r5xm5h7CdSyRQ", "market PDA drifted");
eq(rawAmount("3.75", 8).toString(), "375000000", "SPYx decimal conversion");
eq(rawAmount("1600", 6).toString(), "1600000000", "USDC decimal conversion");

const token2022Vault = getEquityVaultAddress(market, SPYX_MINT);
const classicVault = getAssociatedTokenAddressSync(SPYX_MINT, market, true, TOKEN_PROGRAM_ID);
eq(
  token2022Vault.toBase58(),
  getAssociatedTokenAddressSync(SPYX_MINT, market, true, TOKEN_2022_PROGRAM_ID).toBase58(),
  "equity vault is not Token-2022",
);
if (token2022Vault.equals(classicVault)) throw new Error("Token-2022 and classic SPL ATAs collapsed");

const instructionNames = new Set(IDL.instructions.map((instruction) => instruction.name));
for (const name of ["deposit", "borrow", "accrue_interest", "redeem"]) {
  if (!instructionNames.has(name)) throw new Error(`IDL missing ${name}`);
}
eq(
  explorerTransactionUrl("sig", "https://api.devnet.solana.com"),
  "https://explorer.solana.com/tx/sig?cluster=devnet",
  "devnet explorer URL",
);

const local = explorerTransactionUrl("sig", "http://127.0.0.1:8899");
if (!local.includes("cluster=custom") || !local.includes(encodeURIComponent("http://127.0.0.1:8899"))) {
  throw new Error("local explorer URL lost custom RPC");
}

const invalid = new PublicKey(IDL.address).toBase58();
eq(invalid, "EY5qnrQjqEsAQ65Nrd8Zd3DcqAmemzmgCYfiGfC15vCL", "IDL program address");
console.log("connector selfcheck PASS: IDL, PDA, Token-2022 ATA, amounts, explorer links");
