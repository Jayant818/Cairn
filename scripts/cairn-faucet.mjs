import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

const rpc = process.env.CAIRN_RPC_URL || "http://127.0.0.1:8899";
const port = Number(process.env.CAIRN_FAUCET_PORT || 8787);
const walletPath = process.env.ANCHOR_WALLET || resolve(homedir(), ".config/solana/id.json");
const manifest = JSON.parse(readFileSync("fork/generated/manifest.json", "utf8"));
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(walletPath, "utf8"))));
if (manifest.owner !== payer.publicKey.toBase58()) {
  throw new Error("Fork fixtures belong to a different wallet; rerun fork/setup.sh");
}
const connection = new Connection(rpc, "confirmed");
const spyx = new PublicKey("XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W");
const usdc = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const completed = new Map();

const respond = (response, status, body, origin = "*") => {
  response.writeHead(status, {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "content-type",
    "Content-Type": "application/json",
  });
  response.end(JSON.stringify(body));
};

createServer(async (request, response) => {
  const origin = request.headers.origin?.startsWith("http://127.0.0.1:")
    || request.headers.origin?.startsWith("http://localhost:")
    ? request.headers.origin
    : "http://127.0.0.1:5173";
  if (request.method === "OPTIONS") return respond(response, 204, {}, origin);
  if (request.method === "GET" && request.url === "/config") {
    return respond(response, 200, { oracleAddresses: manifest.oracleAddresses }, origin);
  }
  if (request.method !== "POST" || request.url !== "/faucet") {
    return respond(response, 404, { error: "Not found" }, origin);
  }
  try {
    let body = "";
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 2_000) throw new Error("Request too large");
    }
    const owner = new PublicKey(JSON.parse(body).wallet);
    const cached = completed.get(owner.toBase58());
    if (cached) return respond(response, 200, cached, origin);

    const solSignature = await connection.requestAirdrop(owner, 2_000_000_000);
    const latest = await connection.getLatestBlockhash("confirmed");
    await connection.confirmTransaction({ signature: solSignature, ...latest }, "confirmed");

    const spyxAta = getAssociatedTokenAddressSync(spyx, owner, false, TOKEN_2022_PROGRAM_ID);
    const usdcAta = getAssociatedTokenAddressSync(usdc, owner, false, TOKEN_PROGRAM_ID);
    const transaction = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey, spyxAta, owner, spyx, TOKEN_2022_PROGRAM_ID,
      ),
      createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey, usdcAta, owner, usdc, TOKEN_PROGRAM_ID,
      ),
      createTransferCheckedInstruction(
        new PublicKey(manifest.spyxAta), spyx, spyxAta, payer.publicKey,
        1_000_000_000n, 8, [], TOKEN_2022_PROGRAM_ID,
      ),
      createTransferCheckedInstruction(
        new PublicKey(manifest.usdcAta), usdc, usdcAta, payer.publicKey,
        10_000_000_000n, 6, [], TOKEN_PROGRAM_ID,
      ),
    );
    const tokenSignature = await sendAndConfirmTransaction(connection, transaction, [payer], {
      commitment: "confirmed",
    });
    const result = { solSignature, tokenSignature };
    completed.set(owner.toBase58(), result);
    respond(response, 200, result, origin);
  } catch (error) {
    respond(response, 400, { error: error instanceof Error ? error.message : String(error) }, origin);
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Cairn local faucet listening on http://127.0.0.1:${port}`);
});
