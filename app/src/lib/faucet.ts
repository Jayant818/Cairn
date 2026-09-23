import type { PublicKey } from "@solana/web3.js";

export type FaucetResult = {
  solSignature: string;
  tokenSignature: string;
};

export async function requestTestAssets(
  wallet: PublicKey,
): Promise<FaucetResult> {
  const endpoint = import.meta.env?.VITE_FAUCET_URL || "http://127.0.0.1:8787/faucet";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet: wallet.toBase58() }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Faucet request failed (${response.status})`);
  }
  return await response.json() as FaucetResult;
}
