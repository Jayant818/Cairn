// Record ONE real run against the mainnet fork into a static fixture the frontend replays.
//
// WHY A RECORDING AND NOT A LIVE READ. The frontend's whole claim is verifiable share counts
// on REAL tokenized equity. The real SPYx and USDY mints exist on mainnet and on this fork —
// and nowhere else. A live devnet demo would have to MODEL both mints, which is precisely the
// substitution that let the local harness agree with broken code for four commits (Task 7).
// So: keep the assets real, replay the run, and say so on the page.
//
// ⛔ WHAT THIS IS NOT. Not live state. The page must never imply it is. The fixture carries
// `recordedAt` and every signature so a reader can check the claim rather than trust it.
// ⚠️ And the honesty has a second layer the page must also carry: the MINTS are real, the
// BALANCES were written into the fork's accounts at genesis (fork/setup.sh explains the
// two-phase trick), so nothing here exercises issuance.
//
// Run:  ./fork/setup.sh            # terminal 1, leaves a validator on 8899
//       ./build.sh && anchor deploy --provider.cluster http://127.0.0.1:8899
//       npx ts-node scripts/record-fork.ts   (or the npm script)
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotent,
  getAccount, getMint,
} from "@solana/spl-token";
import { writeFileSync, mkdirSync } from "node:fs";

const SPYX = new PublicKey("XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W");
const USDY = new PublicKey("A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6");
/// u64::MAX per sleeve: the pre-cap tests are about other properties, so they run uncapped.
const UNCAPPED = [new BN("18446744073709551615"), new BN("18446744073709551615")];
const FEE_BPS = 100;
const OUT = "app/src/data/fork-run.json";

type Step = {
  seq: number;
  kind: "initialize" | "bootstrap" | "deposit" | "redeem";
  label: string;
  signature: string;
  slot: number;
  blockTime: number | null;
  /** raw base units, as the program stores them — never pre-divided for display */
  held: [string, string];
  shareSupply: string;
  /** what the user's wallet held after this step, same two mints */
  userSleeves: [string, string];
  userShares: string;
  /** only on redeem: which sleeves were taken */
  sleeveMask?: number;
  /** only on redeem: shares burned, so the page can say "burned in full" honestly */
  sharesBurned?: string;
};

async function main() {
  const env = anchor.AnchorProvider.env();
  const provider = new anchor.AnchorProvider(
    new anchor.web3.Connection(env.connection.rpcEndpoint, "confirmed"),
    env.wallet,
    { commitment: "confirmed", preflightCommitment: "confirmed" },
  );
  anchor.setProvider(provider);
  const program = anchor.workspace.stockpump as Program<any>;
  const connection = provider.connection;
  const authority = (provider.wallet as anchor.Wallet).payer;

  // ⛔ CONTROL, AND IT RUNS FIRST: if these are not the real mainnet accounts the whole
  // artifact is stockpump.spec.ts with extra steps. Same four assertions as fork.spec.ts —
  // owning program AND byte length, because a cloned-but-wrong account passes one of them.
  const m0 = await connection.getAccountInfo(SPYX);
  const m1 = await connection.getAccountInfo(USDY);
  if (!m0 || !m1) throw new Error("SPYx/USDY not cloned — run ./fork/setup.sh");
  if (m0.owner.toBase58() !== TOKEN_2022_PROGRAM_ID.toBase58()) throw new Error("SPYx is not Token-2022 here");
  if (m1.owner.toBase58() !== TOKEN_PROGRAM_ID.toBase58()) throw new Error("USDY is not classic SPL here");
  if (m0.data.length !== 676) throw new Error(`SPYx is not the mainnet account (${m0.data.length} B)`);
  if (m1.data.length !== 82) throw new Error(`USDY is not the mainnet account (${m1.data.length} B)`);

  // ⛔ THE VAULT PDA IS A SINGLETON PER STOCK — seeded on [b"vault", SPYx] — so a fork that
  // has already been recorded against, or that `fork.spec.ts` has run on, cannot be recorded
  // again. Without this the failure is `already in use` from deep inside Anchor, which reads
  // as a program bug and is actually a dirty ledger. Same singleton property that showed up
  // as a DESIGN defect on 2026-09-17; here it bites the tooling instead.
  // ⚠️ AND IT CUTS BOTH WAYS: after a recording, `tests/fork.spec.ts` fails on this same
  // vault. Recording and the fork suite each need their own fresh `./fork/setup.sh`.
  {
    const [probe] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), SPYX.toBuffer()], program.programId);
    if (await connection.getAccountInfo(probe))
      throw new Error(
        `the fork already holds a vault at ${probe.toBase58()} — the PDA is a singleton per ` +
        `stock, so re-run ./fork/setup.sh for a clean ledger before recording`);
  }

  const shareMint = Keypair.generate();
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), SPYX.toBuffer()], program.programId);

  const uAta0 = await createAssociatedTokenAccountIdempotent(connection, authority, SPYX, authority.publicKey, {}, TOKEN_2022_PROGRAM_ID);
  const uAta1 = await createAssociatedTokenAccountIdempotent(connection, authority, USDY, authority.publicKey, {}, TOKEN_PROGRAM_ID);

  const steps: Step[] = [];
  const held = async (): Promise<[bigint, bigint]> => {
    const v: any = await program.account.vault.fetch(vault);
    return [BigInt(v.sleeves[0].held.toString()), BigInt(v.sleeves[1].held.toString())];
  };
  const supply = async () =>
    (await getMint(connection, shareMint.publicKey, "confirmed", TOKEN_2022_PROGRAM_ID)).supply;

  let vAta0!: PublicKey, vAta1!: PublicKey, deadShareAta!: PublicKey, userShareAta!: PublicKey;

  const record = async (
    kind: Step["kind"], label: string, signature: string,
    extra: Partial<Step> = {},
  ) => {
    // ⛔ Read state AFTER the signature is confirmed, and read the VAULT, not a balance diff.
    // A before/after read of a token account races the transaction and can return the
    // pre-transaction view — indistinguishable from "the operation did nothing".
    const tx = await connection.getTransaction(signature, {
      commitment: "confirmed", maxSupportedTransactionVersion: 0,
    });
    const h = await held();
    const s = await supply();
    steps.push({
      seq: steps.length,
      kind, label, signature,
      slot: tx?.slot ?? 0,
      blockTime: tx?.blockTime ?? null,
      held: [h[0].toString(), h[1].toString()],
      shareSupply: s.toString(),
      userSleeves: [
        (await getAccount(connection, uAta0, "confirmed", TOKEN_2022_PROGRAM_ID)).amount.toString(),
        (await getAccount(connection, uAta1, "confirmed", TOKEN_PROGRAM_ID)).amount.toString(),
      ],
      userShares: userShareAta
        ? (await getAccount(connection, userShareAta, "confirmed", TOKEN_2022_PROGRAM_ID)).amount.toString()
        : "0",
      ...extra,
    });
    console.log(`  ${kind.padEnd(10)} ${label.padEnd(34)} ${signature.slice(0, 12)}…`);
  };

  console.log("recording against the fork on", env.connection.rpcEndpoint);

  const sigInit = await program.methods.initialize(FEE_BPS, UNCAPPED).accounts({
    authority: authority.publicKey, vault, shareMint: shareMint.publicKey,
    sleeve0Mint: SPYX, sleeve1Mint: USDY,
    tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId,
  }).signers([shareMint]).rpc({ commitment: "confirmed" });

  vAta0 = await createAssociatedTokenAccountIdempotent(connection, authority, SPYX, vault, {}, TOKEN_2022_PROGRAM_ID, undefined, true);
  vAta1 = await createAssociatedTokenAccountIdempotent(connection, authority, USDY, vault, {}, TOKEN_PROGRAM_ID, undefined, true);
  deadShareAta = await createAssociatedTokenAccountIdempotent(connection, authority, shareMint.publicKey, vault, {}, TOKEN_2022_PROGRAM_ID, undefined, true);
  userShareAta = await createAssociatedTokenAccountIdempotent(connection, authority, shareMint.publicKey, authority.publicKey, {}, TOKEN_2022_PROGRAM_ID);
  await record("initialize", `vault opened, fee ${FEE_BPS} bps`, sigInit);

  const sigBoot = await program.methods
    .bootstrap([new BN("70000000"), new BN("30000000")])
    .accounts({
      depositor: authority.publicKey, vault, authority: authority.publicKey,
      shareMint: shareMint.publicKey, sleeve0Mint: SPYX, sleeve1Mint: USDY,
      vaultAta0: vAta0, vaultAta1: vAta1, userAta0: uAta0, userAta1: uAta1,
      deadShareAta,
      tokenProgram0: TOKEN_2022_PROGRAM_ID, tokenProgram1: TOKEN_PROGRAM_ID,
      shareTokenProgram: TOKEN_2022_PROGRAM_ID,
    }).rpc({ commitment: "confirmed" });
  await record("bootstrap", "0.7 SPYx + 30 USDY seeded", sigBoot);

  // Deposits of DIFFERENT sizes on purpose: equal deposits make the per-share series look
  // synthetic, and the charts exist to show a ratchet, not a straight line.
  const deposits: Array<[string, string, string]> = [
    ["7000000",  "3000000",  "0.07 SPYx + 3 USDY"],
    ["2500000",  "1100000",  "0.025 SPYx + 1.1 USDY"],
    ["14000000", "6000000",  "0.14 SPYx + 6 USDY"],
    ["900000",   "400000",   "0.009 SPYx + 0.4 USDY"],
    ["5500000",  "2400000",  "0.055 SPYx + 2.4 USDY"],
  ];
  for (const [a0, a1, label] of deposits) {
    const sig = await program.methods.deposit([new BN(a0), new BN(a1)]).accounts({
      depositor: authority.publicKey, vault, shareMint: shareMint.publicKey,
      sleeve0Mint: SPYX, sleeve1Mint: USDY,
      vaultAta0: vAta0, vaultAta1: vAta1, userAta0: uAta0, userAta1: uAta1,
      depositorShareAta: userShareAta,
      tokenProgram0: TOKEN_2022_PROGRAM_ID, tokenProgram1: TOKEN_PROGRAM_ID,
      shareTokenProgram: TOKEN_2022_PROGRAM_ID,
    }).rpc({ commitment: "confirmed" });
    await record("deposit", label, sig);
  }

  // Two redeems, and the SECOND one is the point. A 0b10 redeem takes only the cash leg and
  // still burns the shares IN FULL — the fact the UI has to state in --signal-orange rather
  // than bury. Recording it means the page can show it instead of describing it.
  const mkRedeem = async (shares: bigint, mask: number, label: string) => {
    const sig = await program.methods.redeem(new BN(shares.toString()), mask).accounts({
      redeemer: authority.publicKey, vault, shareMint: shareMint.publicKey,
      sleeve0Mint: SPYX, sleeve1Mint: USDY,
      vaultAta0: vAta0, vaultAta1: vAta1, userAta0: uAta0, userAta1: uAta1,
      redeemerShareAta: userShareAta,
      tokenProgram0: TOKEN_2022_PROGRAM_ID, tokenProgram1: TOKEN_PROGRAM_ID,
      shareTokenProgram: TOKEN_2022_PROGRAM_ID,
    }).rpc({ commitment: "confirmed" });
    await record("redeem", label, sig, { sleeveMask: mask, sharesBurned: shares.toString() });
  };

  const holding = (await getAccount(connection, userShareAta, "confirmed", TOKEN_2022_PROGRAM_ID)).amount;
  await mkRedeem(holding / 4n, 0b11, "both legs");
  await mkRedeem(holding / 8n, 0b10, "cash leg only — shares still burn in full");

  const meta = {
    recordedAt: new Date().toISOString(),
    cluster: "mainnet fork (solana-test-validator --clone)",
    programId: program.programId.toBase58(),
    feeBps: FEE_BPS,
    sleeves: [
      { symbol: "SPYx", mint: SPYX.toBase58(), decimals: 8, tokenProgram: TOKEN_2022_PROGRAM_ID.toBase58(), role: "stock" },
      { symbol: "USDY", mint: USDY.toBase58(), decimals: 6, tokenProgram: TOKEN_PROGRAM_ID.toBase58(), role: "cash" },
    ],
    shareMint: shareMint.publicKey.toBase58(),
    // Carried into the fixture so the page cannot be built without the caveat in hand.
    caveats: [
      "Recorded from a mainnet fork. Not live state.",
      "The MINTS are the real mainnet accounts, with their real extensions, decimals and owning programs.",
      "The BALANCES were written into the fork's token accounts at genesis — Backed holds SPYx's mint authority and Ondo holds USDY's, so nothing here exercises issuance.",
    ],
  };

  mkdirSync("app/src/data", { recursive: true });
  writeFileSync(OUT, JSON.stringify({ meta, steps }, null, 2) + "\n");
  console.log(`\nwrote ${OUT}: ${steps.length} steps, recorded ${meta.recordedAt}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
