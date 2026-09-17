// Tasks 2-5 integration tests.
//
// ⭐ EVERY VAULT-PROTECTING ASSERTION IS MIRRORED BY A USER-PROTECTING ONE. Mutation testing
// on math.rs proved why: 10 of 32 mutants survived a suite that only checked "held-per-share
// never falls", because `shares_for_deposit -> Ok(1)` satisfies that magnificently while
// robbing the depositor. A test suite that only protects the vault passes on a design that
// steals from users.
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID, createAssociatedTokenAccountIdempotent, getAccount, getMint, mintTo,
} from "@solana/spl-token";
import { assert } from "chai";
import { createTestMint } from "./mint2022";

const T22 = TOKEN_2022_PROGRAM_ID;
const FEE_BPS = 100; // 1%

describe("stockpump vault", () => {
  // ⛔ NOT AnchorProvider.env(). Its defaults are commitment "processed" AND preflight
  // "processed", so the blockhash is fetched against one bank and the transaction is
  // simulated against another — which surfaces as an intermittent "Blockhash not found"
  // that looks like validator flakiness and is actually a commitment mismatch. Pin both
  // ends to "confirmed" so every read in this file sees the write that preceded it.
  const _env = anchor.AnchorProvider.env();
  const provider = new anchor.AnchorProvider(
    new anchor.web3.Connection(_env.connection.rpcEndpoint, "confirmed"),
    _env.wallet,
    { commitment: "confirmed", preflightCommitment: "confirmed" },
  );
  anchor.setProvider(provider);
  const program = anchor.workspace.stockpump as Program<any>;
  const connection = provider.connection;
  const authority = (provider.wallet as anchor.Wallet).payer;

  let sleeve0: PublicKey, sleeve1: PublicKey, shareMint: Keypair, vault: PublicKey;
  let vAta0: PublicKey, vAta1: PublicKey, uAta0: PublicKey, uAta1: PublicKey;
  let deadShareAta: PublicKey, userShareAta: PublicKey;

  const ratios = async () => {
    const v: any = await program.account.vault.fetch(vault);
    const supply = (await getMint(connection, shareMint.publicKey, "confirmed", T22)).supply;
    return {
      supply,
      held: [BigInt(v.sleeves[0].held.toString()), BigInt(v.sleeves[1].held.toString())],
    };
  };
  // a/b >= c/d without floats
  const notLower = (ha: bigint, sa: bigint, hb: bigint, sb: bigint) => ha * sb >= hb * sa;

  before(async function () {
    this.timeout(120_000);
    sleeve0 = await createTestMint(connection, authority, {
      decimals: 8, permanentDelegate: authority.publicKey, pausableAuthority: authority.publicKey,
      transferHookProgram: null, transferFeeBasisPoints: 0,   // SPYx: 0 bps
    });
    sleeve1 = await createTestMint(connection, authority, {
      decimals: 6, permanentDelegate: null, pausableAuthority: null,
      transferHookProgram: null, transferFeeBasisPoints: 0,   // USDY: plain
    });
    shareMint = Keypair.generate();
    // PDA is seeded on the STOCK sleeve mint, not on b"vault" alone. A singleton vault would
    // mean one vault per program forever — contradicting "one vault per stock" and making the
    // v2 multi-stock bucket unrepresentable. It also made this suite un-rerunnable, which is
    // the only reason the defect surfaced at all.
    [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), sleeve0.toBuffer()], program.programId);

    uAta0 = await createAssociatedTokenAccountIdempotent(connection, authority, sleeve0, authority.publicKey, {}, T22);
    uAta1 = await createAssociatedTokenAccountIdempotent(connection, authority, sleeve1, authority.publicKey, {}, T22);
    await mintTo(connection, authority, sleeve0, uAta0, authority, 1_000_000_000_000n, [], {}, T22);
    await mintTo(connection, authority, sleeve1, uAta1, authority, 1_000_000_000_000n, [], {}, T22);
  });

  it("initialize REFUSES fee_bps = 0 — the claim is the fee and nothing else", async function () {
    this.timeout(60_000);
    const bad = Keypair.generate();
    try {
      await program.methods.initialize(0).accounts({
        authority: authority.publicKey, vault, shareMint: bad.publicKey,
        sleeve0Mint: sleeve0, sleeve1Mint: sleeve1,
        tokenProgram: T22, systemProgram: SystemProgram.programId,
      }).signers([bad]).rpc({ commitment: "confirmed" });
      assert.fail("initialize accepted fee_bps = 0 — held-per-share would stop rising while every line still ran");
    } catch (e: any) {
      assert.match(String(e), /ZeroFee/, `expected ZeroFee, got: ${e}`);
    }
    // USER-PROTECTING: the failed init must leave NO vault behind. A half-created vault on a
    // rejected parameter would be claimable by the next caller at a fee of their choosing.
    assert.isNull(await connection.getAccountInfo(vault), "rejected initialize left a vault account");
  });

  it("initialize gives the SHARE MINT AUTHORITY to the vault PDA, not the deployer", async function () {
    this.timeout(60_000);
    await program.methods.initialize(FEE_BPS).accounts({
      authority: authority.publicKey, vault, shareMint: shareMint.publicKey,
      sleeve0Mint: sleeve0, sleeve1Mint: sleeve1,
      tokenProgram: T22, systemProgram: SystemProgram.programId,
    }).signers([shareMint]).rpc({ commitment: "confirmed" });

    const m = await getMint(connection, shareMint.publicKey, "confirmed", T22);
    // USER-PROTECTING: a deployer-held share mint is an unlimited mint against every deposit.
    assert.equal(m.mintAuthority?.toBase58(), vault.toBase58(), "deployer can mint shares");
    assert.notEqual(m.mintAuthority?.toBase58(), authority.publicKey.toBase58());

    vAta0 = await createAssociatedTokenAccountIdempotent(connection, authority, sleeve0, vault, {}, T22, undefined, true);
    vAta1 = await createAssociatedTokenAccountIdempotent(connection, authority, sleeve1, vault, {}, T22, undefined, true);
    deadShareAta = await createAssociatedTokenAccountIdempotent(connection, authority, shareMint.publicKey, vault, {}, T22, undefined, true);
    userShareAta = await createAssociatedTokenAccountIdempotent(connection, authority, shareMint.publicKey, authority.publicKey, {}, T22);
  });

it("initialize REJECTS a sleeve mint that can be closed and reinitialised", async function () {
    this.timeout(60_000);
    // A MintCloseAuthority mint can be closed and recreated AT THE SAME ADDRESS with different
    // extensions or decimals. The vault stores a sleeve as an ADDRESS, so a reinit rewrites the
    // rules underneath it while every account constraint still passes.
    const closable = await createTestMint(connection, authority, {
      decimals: 8, permanentDelegate: null, pausableAuthority: null,
      transferHookProgram: null, transferFeeBasisPoints: 0,
      closeAuthority: authority.publicKey,
    });
    const sm = Keypair.generate();
    const [v2] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), closable.toBuffer()], program.programId);
    try {
      await program.methods.initialize(FEE_BPS).accounts({
        authority: authority.publicKey, vault: v2, shareMint: sm.publicKey,
        sleeve0Mint: closable, sleeve1Mint: sleeve1,
        tokenProgram: T22, systemProgram: SystemProgram.programId,
      }).signers([sm]).rpc({ commitment: "confirmed" });
      assert.fail("initialize accepted a closable sleeve mint");
    } catch (e: any) {
      assert.match(String(e), /MintIsClosable/, `expected MintIsClosable, got: ${e}`);
    }
    // CONTROL: the same call with a NON-closable mint must succeed, or the test above would
    // pass for any reason at all.
    const ok = await createTestMint(connection, authority, {
      decimals: 8, permanentDelegate: null, pausableAuthority: null,
      transferHookProgram: null, transferFeeBasisPoints: 0,
    });
    const sm2 = Keypair.generate();
    const [v3] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), ok.toBuffer()], program.programId);
    await program.methods.initialize(FEE_BPS).accounts({
      authority: authority.publicKey, vault: v3, shareMint: sm2.publicKey,
      sleeve0Mint: ok, sleeve1Mint: sleeve1,
      tokenProgram: T22, systemProgram: SystemProgram.programId,
    }).signers([sm2]).rpc({ commitment: "confirmed" });
  });

  it("bootstrap REQUIRES the authority to sign — not merely to be named", async function () {
    this.timeout(60_000);
    // Before this was a Signer, `authority` was an UncheckedAccount bound only by has_one, so
    // anyone could bootstrap by quoting the (public) authority pubkey. Bootstrap is one-shot and
    // fixes the ratio every later deposit is priced against: a front-runner seeding held = [1,1]
    // poisons the pricing basis permanently.
    const stranger = Keypair.generate();
    const sig = await connection.requestAirdrop(stranger.publicKey, 2_000_000_000);
    await connection.confirmTransaction({ signature: sig, ...(await connection.getLatestBlockhash()) }, "confirmed");
    // ⛔ THE STRANGER MUST OWN AND FUND THEIR OWN ATAs. The first version of this test reused
    // the authority's token accounts, so it failed on ConstraintTokenOwner (2015) — the ATA
    // ownership check fired BEFORE the signature check, and the test would have "passed" while
    // proving nothing about the authority gate. A test that stops at the first constraint does
    // not test the constraint it names.
    const sAta0 = await createAssociatedTokenAccountIdempotent(connection, stranger, sleeve0, stranger.publicKey, {}, T22);
    const sAta1 = await createAssociatedTokenAccountIdempotent(connection, stranger, sleeve1, stranger.publicKey, {}, T22);
    await mintTo(connection, authority, sleeve0, sAta0, authority, 10_000_000n, [], {}, T22);
    await mintTo(connection, authority, sleeve1, sAta1, authority, 10_000_000n, [], {}, T22);
    // ⛔⛔ AND THE STRANGER MUST BE THE FEE PAYER. Anchor's .rpc() pays fees from the provider
    // wallet — which IS the authority here — so the authority signs every transaction anyway and
    // the gate can never be observed to fire. The first isolated version of this test PASSED the
    // stranger's bootstrap for exactly that reason. In production the caller pays their own fees
    // and the authority is not a signer at all; the test has to reproduce that or it tests nothing.
    const ix = await program.methods.bootstrap([new BN(1_000), new BN(1_000)]).accounts({
      depositor: stranger.publicKey, vault, authority: authority.publicKey,
      shareMint: shareMint.publicKey, sleeve0Mint: sleeve0, sleeve1Mint: sleeve1,
      vaultAta0: vAta0, vaultAta1: vAta1, userAta0: sAta0, userAta1: sAta1,
      deadShareAta, tokenProgram: T22,
    }).instruction();
    const tx = new anchor.web3.Transaction().add(ix);
    tx.feePayer = stranger.publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
    try {
      await anchor.web3.sendAndConfirmTransaction(connection, tx, [stranger], { commitment: "confirmed" });
      assert.fail("a stranger bootstrapped the vault by quoting the authority pubkey");
    } catch (e: any) {
      const msg = String(e);
      assert.match(msg, /Signature verification failed|missing required signature|unknown signer|Missing signature/i,
        `expected a MISSING-SIGNATURE failure — anything else means a different constraint fired first and the authority gate is untested. Got: ${msg}`);
    }
  });

  it("bootstrap burns dead shares and records MEASURED held, not the amount asked for", async function () {
    this.timeout(60_000);
    const A0 = 70_000_000n, A1 = 30_000_000n;
    await program.methods.bootstrap([new BN(A0.toString()), new BN(A1.toString())]).accounts({
      depositor: authority.publicKey, vault, authority: authority.publicKey,
      shareMint: shareMint.publicKey, sleeve0Mint: sleeve0, sleeve1Mint: sleeve1,
      vaultAta0: vAta0, vaultAta1: vAta1, userAta0: uAta0, userAta1: uAta1,
      deadShareAta, tokenProgram: T22,
    }).rpc({ commitment: "confirmed" });

    const r = await ratios();
    assert.equal(r.held[0], A0, "sleeve 0 held wrong");
    assert.equal(r.held[1], A1, "sleeve 1 held wrong");
    assert.equal(r.supply, 1_000n, "dead shares not minted");
    // USER-PROTECTING: the dead shares sit in a vault-owned account, so supply can never
    // return to zero and the first real depositor cannot be front-run into a zero mint.
    const dead = await getAccount(connection, deadShareAta, "confirmed", T22);
    assert.equal(dead.amount, 1_000n);
  });

  it("bootstrap cannot run twice", async function () {
    this.timeout(60_000);
    try {
      await program.methods.bootstrap([new BN(1_000), new BN(1_000)]).accounts({
        depositor: authority.publicKey, vault, authority: authority.publicKey,
        shareMint: shareMint.publicKey, sleeve0Mint: sleeve0, sleeve1Mint: sleeve1,
        vaultAta0: vAta0, vaultAta1: vAta1, userAta0: uAta0, userAta1: uAta1,
        deadShareAta, tokenProgram: T22,
      }).rpc({ commitment: "confirmed" });
      assert.fail("second bootstrap succeeded");
    } catch (e: any) { assert.match(String(e), /AlreadyBootstrapped/); }
  });

  it("deposit: ratios rise (vault) AND the depositor gets the binding-sleeve count (user)", async function () {
    this.timeout(60_000);
    const before = await ratios();
    const sharesBefore = (await getAccount(connection, userShareAta, "confirmed", T22)).amount;
    const A0 = 7_000_000n, A1 = 3_000_000n;

    await program.methods.deposit([new BN(A0.toString()), new BN(A1.toString())]).accounts({
      depositor: authority.publicKey, vault, shareMint: shareMint.publicKey,
      sleeve0Mint: sleeve0, sleeve1Mint: sleeve1,
      vaultAta0: vAta0, vaultAta1: vAta1, userAta0: uAta0, userAta1: uAta1,
      depositorShareAta: userShareAta, tokenProgram: T22,
    }).rpc({ commitment: "confirmed" });

    const after = await ratios();
    // VAULT-PROTECTING
    assert.isTrue(notLower(after.held[0], after.supply, before.held[0], before.supply), "sleeve 0 fell");
    assert.isTrue(notLower(after.held[1], after.supply, before.held[1], before.supply), "sleeve 1 fell");
    // USER-PROTECTING: exact share count, not merely "some". This is the assertion whose
    // absence let `shares_for_deposit -> Ok(1)` survive mutation testing.
    const keep = BigInt(10_000 - FEE_BPS);
    const n0 = A0 - (A0 * BigInt(FEE_BPS) + 9_999n) / 10_000n;
    const n1 = A1 - (A1 * BigInt(FEE_BPS) + 9_999n) / 10_000n;
    const e0 = before.supply * n0 / before.held[0];
    const e1 = before.supply * n1 / before.held[1];
    const expected = e0 < e1 ? e0 : e1;
    const got = (await getAccount(connection, userShareAta, "confirmed", T22)).amount - sharesBefore;
    assert.equal(got, expected, `depositor got ${got}, fair is ${expected}`);
    assert.isTrue(got > 1n, "a one-share mint would pass every ratio test and rob the depositor");
    void keep;
  });

  it("redeem with sleeve_mask = 0b01 pays ONLY sleeve 0 and still burns the shares", async function () {
    this.timeout(60_000);
    // redeem a slice of what the REDEEMER actually holds. The 1,000 dead shares sit in the
    // vault's own account, not the user's — counting them as redeemable is the mistake the
    // dead-share design exists to make impossible, and the first draft of this test made it.
    const heldShares = (await getAccount(connection, userShareAta, "confirmed", T22)).amount;
    assert.isTrue(heldShares > 0n, "depositor holds no shares to redeem");
    const shares = heldShares / 2n;
    const b0 = (await getAccount(connection, uAta0, "confirmed", T22)).amount;
    const b1 = (await getAccount(connection, uAta1, "confirmed", T22)).amount;
    const bs = (await getAccount(connection, userShareAta, "confirmed", T22)).amount;

    await program.methods.redeem(new BN(shares.toString()), 0b01).accounts({
      redeemer: authority.publicKey, vault, shareMint: shareMint.publicKey,
      sleeve0Mint: sleeve0, sleeve1Mint: sleeve1,
      vaultAta0: vAta0, vaultAta1: vAta1, userAta0: uAta0, userAta1: uAta1,
      redeemerShareAta: userShareAta, tokenProgram: T22,
    }).rpc({ commitment: "confirmed" });

    const a0 = (await getAccount(connection, uAta0, "confirmed", T22)).amount;
    const a1 = (await getAccount(connection, uAta1, "confirmed", T22)).amount;
    const as_ = (await getAccount(connection, userShareAta, "confirmed", T22)).amount;
    assert.isTrue(a0 > b0, "sleeve 0 not paid");
    assert.equal(a1, b1, "sleeve 1 paid despite being masked out");
    // USER-PROTECTING, stated as a warning rather than hidden: taking one leg still burns
    // the full share count. That is the user's choice, not a discount, and the UI must say so.
    assert.equal(bs - as_, shares, "shares not burned in full");
  });

  it("redeem rejects an empty mask and an undefined bit", async function () {
    this.timeout(60_000);
    for (const mask of [0b00, 0b100]) {
      try {
        await program.methods.redeem(new BN(100), mask).accounts({
          redeemer: authority.publicKey, vault, shareMint: shareMint.publicKey,
          sleeve0Mint: sleeve0, sleeve1Mint: sleeve1,
          vaultAta0: vAta0, vaultAta1: vAta1, userAta0: uAta0, userAta1: uAta1,
          redeemerShareAta: userShareAta, tokenProgram: T22,
        }).rpc({ commitment: "confirmed" });
        assert.fail(`mask ${mask} accepted`);
      } catch (e: any) { assert.match(String(e), /EmptyMask/); }
    }
  });

  it("reconcile is DOWNWARD ONLY — an upward mark reopens the donation vector", async function () {
    this.timeout(60_000);
    // donate straight to the vault ATA: internal held must NOT follow it up
    await mintTo(connection, authority, sleeve0, vAta0, authority, 5_000_000n, [], {}, T22);
    try {
      await program.methods.reconcile(0).accounts({
        authority: authority.publicKey, vault, vaultAta: vAta0,
      }).rpc({ commitment: "confirmed" });
      assert.fail("upward reconcile accepted — donations can now move NAV");
    } catch (e: any) { assert.match(String(e), /ReconcileNotDownward/); }
  });

  it("reconcile is authority-gated", async function () {
    this.timeout(60_000);
    const stranger = Keypair.generate();
    const sig = await connection.requestAirdrop(stranger.publicKey, 1_000_000_000);
    await connection.confirmTransaction({ signature: sig, ...(await connection.getLatestBlockhash()) }, "confirmed");
    try {
      await program.methods.reconcile(0).accounts({
        authority: stranger.publicKey, vault, vaultAta: vAta0,
      }).signers([stranger]).rpc({ commitment: "confirmed" });
      assert.fail("stranger reconciled the vault");
    } catch (e: any) { assert.match(String(e), /ConstraintHasOne|has_one|Unauthorized|2001/); }
  });
});
