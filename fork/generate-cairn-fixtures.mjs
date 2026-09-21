import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

const [ownerText, outputDirectory] = process.argv.slice(2);
if (!ownerText || !outputDirectory) {
  throw new Error("usage: node generate-cairn-fixtures.mjs <wallet> <output-directory>");
}

const owner = new PublicKey(ownerText);
const SPYX = new PublicKey("XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W");
const USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const PYTH_RECEIVER = new PublicKey("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ");
const EQUITY_FEED = Buffer.alloc(32, 0x11);
const COLLATERAL_FEED = Buffer.alloc(32, 0x22);

mkdirSync(outputDirectory, { recursive: true });

function fixture(pubkey, ownerProgram, data, lamports = 10_000_000) {
  return {
    pubkey: pubkey.toBase58(),
    account: {
      lamports,
      data: [data.toString("base64"), "base64"],
      owner: ownerProgram.toBase58(),
      executable: false,
      rentEpoch: 0,
    },
  };
}

function writeFixture(name, value) {
  writeFileSync(`${outputDirectory}/${name}.json`, `${JSON.stringify(value)}\n`);
}

function tokenAccount(mint, tokenOwner, amount, token2022) {
  const data = Buffer.alloc(token2022 ? 179 : 165);
  mint.toBuffer().copy(data, 0);
  tokenOwner.toBuffer().copy(data, 32);
  data.writeBigUInt64LE(amount, 64);
  data.writeUInt8(1, 108);
  if (token2022) {
    data.writeUInt8(2, 165); // AccountType::Account
    data.writeUInt16LE(7, 166); // ImmutableOwner
    data.writeUInt16LE(0, 168);
    data.writeUInt16LE(27, 170); // PausableAccount
    data.writeUInt16LE(0, 172);
    data.writeUInt16LE(15, 174); // TransferHookAccount
    data.writeUInt16LE(1, 176);
    data.writeUInt8(0, 178);
  }
  return data;
}

function discriminator(name) {
  return createHash("sha256").update(`account:${name}`).digest().subarray(0, 8);
}

function writeI64(buffer, value, offset) {
  buffer.writeBigInt64LE(BigInt(value), offset);
  return offset + 8;
}

function writeU64(buffer, value, offset) {
  buffer.writeBigUInt64LE(BigInt(value), offset);
  return offset + 8;
}

function priceUpdate(feedId, price, confidence, exponent, now) {
  const data = Buffer.alloc(134);
  discriminator("PriceUpdateV2").copy(data, 0);
  owner.toBuffer().copy(data, 8);
  let offset = 40;
  data.writeUInt8(1, offset++); // VerificationLevel::Full
  feedId.copy(data, offset); offset += 32;
  offset = writeI64(data, price, offset);
  offset = writeU64(data, confidence, offset);
  data.writeInt32LE(exponent, offset); offset += 4;
  offset = writeI64(data, now, offset);
  offset = writeI64(data, now - 1, offset);
  offset = writeI64(data, price, offset);
  offset = writeU64(data, confidence, offset);
  writeU64(data, 1, offset);
  return data;
}

function twapUpdate(feedId, price, confidence, exponent, now, windowSeconds) {
  const data = Buffer.alloc(112);
  discriminator("TwapUpdate").copy(data, 0);
  owner.toBuffer().copy(data, 8);
  let offset = 40;
  feedId.copy(data, offset); offset += 32;
  offset = writeI64(data, now - windowSeconds, offset);
  offset = writeI64(data, now, offset);
  offset = writeI64(data, price, offset);
  offset = writeU64(data, confidence, offset);
  data.writeInt32LE(exponent, offset); offset += 4;
  data.writeUInt32LE(0, offset);
  return data;
}

const spyxAta = getAssociatedTokenAddressSync(
  SPYX, owner, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
);
const usdcAta = getAssociatedTokenAddressSync(
  USDC, owner, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
);
writeFixture("spyx-ata", fixture(
  spyxAta,
  TOKEN_2022_PROGRAM_ID,
  tokenAccount(SPYX, owner, 10_000_000_000n, true),
));
writeFixture("usdc-ata", fixture(
  usdcAta,
  TOKEN_PROGRAM_ID,
  tokenAccount(USDC, owner, 1_000_000_000_000n, false),
));

const now = Math.floor(Date.now() / 1000);
const windowSeconds = 60;
const oracleFixtures = [
  ["equity-spot", 31, priceUpdate(EQUITY_FEED, 20_000_000_000n, 10_000_000n, -8, now)],
  ["equity-twap", 32, twapUpdate(EQUITY_FEED, 20_000_000_000n, 10_000_000n, -8, now, windowSeconds)],
  ["collateral-spot", 33, priceUpdate(COLLATERAL_FEED, 100_000_000n, 10_000n, -8, now)],
  ["collateral-twap", 34, twapUpdate(COLLATERAL_FEED, 100_000_000n, 10_000n, -8, now, windowSeconds)],
];
const oracleAddresses = {};
for (const [name, seedByte, data] of oracleFixtures) {
  const pubkey = new PublicKey(Buffer.alloc(32, seedByte));
  oracleAddresses[name] = pubkey.toBase58();
  writeFixture(name, fixture(pubkey, PYTH_RECEIVER, data));
}

writeFileSync(`${outputDirectory}/manifest.json`, `${JSON.stringify({
  owner: owner.toBase58(),
  spyxAta: spyxAta.toBase58(),
  usdcAta: usdcAta.toBase58(),
  equityFeed: [...EQUITY_FEED],
  collateralFeed: [...COLLATERAL_FEED],
  windowSeconds,
  oracleAddresses,
}, null, 2)}\n`);
