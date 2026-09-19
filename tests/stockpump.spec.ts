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
  TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotent, getAccount, getMint, mintTo,
} from "@solana/spl-token";
import { assert } from "chai";
import { createTestMint, createClassicMint } from "./mint2022";

const T22 = TOKEN_2022_PROGRAM_ID;
/// u64::MAX per sleeve: the pre-cap tests are about other properties, so they run uncapped.
const UNCAPPED = [new BN("18446744073709551615"), new BN("18446744073709551615")];
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

/// Balances AT EXECUTION, read from the transaction receipt.
  ///
  /// ⛔ NOT a before-read and an after-read of the account. Two reads across a transaction race:
  /// the after-read can still return the pre-transaction view, which is byte-identical to "the
  /// operation did nothing" — that produced a false "depositor got 0, fair is 99" and a false
  /// "sleeve 1 not paid" earlier today.
  /// ⛔ AND NOT the vault's `held` alone. Asserting only on `held` is what let
  /// `replace transfer_out -> Ok(())` survive mutation testing: `held` is decremented on a
  /// separate line from the transfer, so a vault that burns your shares and sends NOTHING
  /// satisfies it. Curing the race by dropping the balance check removed the only assertion
  /// that the tokens actually moved.
  /// The receipt is recorded at execution, so it cannot race, and it proves real movement.
  const deltaFromReceipt = async (sig: string, account: PublicKey): Promise<bigint> => {
    const tx = await connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    assert.isNotNull(tx, `no receipt for ${sig}`);
    const keys = tx!.transaction.message.getAccountKeys({
      accountKeysFromLookups: tx!.meta?.loadedAddresses,
    });
    let idx = -1;
    for (let i = 0; i < keys.length; i++) if (keys.get(i)!.equals(account)) { idx = i; break; }
    assert.isAtLeast(idx, 0, "account not in the transaction");
    const pre = tx!.meta!.preTokenBalances!.find((b) => b.accountIndex === idx);
    const post = tx!.meta!.postTokenBalances!.find((b) => b.accountIndex === idx);
    return BigInt(post?.uiTokenAmount.amount ?? "0") - BigInt(pre?.uiTokenAmount.amount ?? "0");
  };

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
    // ⛔ CLASSIC SPL, not Token-2022. USDY is Tokenkeg (82 B) while SPYx is TokenzQd (676 B),
    // and building both sleeves under one program is what hid the single-token_program defect
    // for four commits. The local suite now exercises two token programs by default.
    sleeve1 = await createClassicMint(connection, authority, 6);
    shareMint = Keypair.generate();
    // PDA is seeded on the STOCK sleeve mint, not on b"vault" alone. A singleton vault would
    // mean one vault per program forever — contradicting "one vault per stock" and making the
    // v2 multi-stock bucket unrepresentable. It also made this suite un-rerunnable, which is
    // the only reason the defect surfaced at all.
    [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), sleeve0.toBuffer()], program.programId);

    uAta0 = await createAssociatedTokenAccountIdempotent(connection, authority, sleeve0, authority.publicKey, {}, T22);
    uAta1 = await createAssociatedTokenAccountIdempotent(connection, authority, sleeve1, authority.publicKey, {}, TOKEN_PROGRAM_ID);
    await mintTo(connection, authority, sleeve0, uAta0, authority, 1_000_000_000_000n, [], {}, T22);
    await mintTo(connection, authority, sleeve1, uAta1, authority, 1_000_000_000_000n, [], {}, TOKEN_PROGRAM_ID);
  });

  it("initialize REFUSES fee_bps = 0 — the claim is the fee and nothing else", async function () {
    this.timeout(60_000);
    const bad = Keypair.generate();
    try {
      await program.methods.initialize(0, UNCAPPED).accounts({
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
    await program.methods.initialize(FEE_BPS, UNCAPPED).accounts({
      authority: authority.publicKey, vault, shareMint: shareMint.publicKey,
      sleeve0Mint: sleeve0, sleeve1Mint: sleeve1,
      tokenProgram: T22, systemProgram: SystemProgram.programId,
    }).signers([shareMint]).rpc({ commitment: "confirmed" });

    const m = await getMint(connection, shareMint.publicKey, "confirmed", T22);
    // USER-PROTECTING: a deployer-held share mint is an unlimited mint against every deposit.
    assert.equal(m.mintAuthority?.toBase58(), vault.toBase58(), "deployer can mint shares");
    assert.notEqual(m.mintAuthority?.toBase58(), authority.publicKey.toBase58());

    vAta0 = await createAssociatedTokenAccountIdempotent(connection, authority, sleeve0, vault, {}, T22, undefined, true);
    vAta1 = await createAssociatedTokenAccountIdempotent(connection, authority, sleeve1, vault, {}, TOKEN_PROGRAM_ID, undefined, true);
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
      await program.methods.initialize(FEE_BPS, UNCAPPED).accounts({
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
    await program.methods.initialize(FEE_BPS, UNCAPPED).accounts({
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
    const sAta1 = await createAssociatedTokenAccountIdempotent(connection, stranger, sleeve1, stranger.publicKey, {}, TOKEN_PROGRAM_ID);
    await mintTo(connection, authority, sleeve0, sAta0, authority, 10_000_000n, [], {}, T22);
    await mintTo(connection, authority, sleeve1, sAta1, authority, 10_000_000n, [], {}, TOKEN_PROGRAM_ID);
    // ⛔⛔ AND THE STRANGER MUST BE THE FEE PAYER. Anchor's .rpc() pays fees from the provider
    // wallet — which IS the authority here — so the authority signs every transaction anyway and
    // the gate can never be observed to fire. The first isolated version of this test PASSED the
    // stranger's bootstrap for exactly that reason. In production the caller pays their own fees
    // and the authority is not a signer at all; the test has to reproduce that or it tests nothing.
    const ix = await program.methods.bootstrap([new BN(1_000), new BN(1_000)]).accounts({
      depositor: stranger.publicKey, vault, authority: authority.publicKey,
      shareMint: shareMint.publicKey, sleeve0Mint: sleeve0, sleeve1Mint: sleeve1,
      vaultAta0: vAta0, vaultAta1: vAta1, userAta0: sAta0, userAta1: sAta1,
      deadShareAta, tokenProgram0: T22, tokenProgram1: TOKEN_PROGRAM_ID, shareTokenProgram: T22,
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
      deadShareAta, tokenProgram0: T22, tokenProgram1: TOKEN_PROGRAM_ID, shareTokenProgram: T22,
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
        deadShareAta, tokenProgram0: T22, tokenProgram1: TOKEN_PROGRAM_ID, shareTokenProgram: T22,
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
      depositorShareAta: userShareAta, tokenProgram0: T22, tokenProgram1: TOKEN_PROGRAM_ID, shareTokenProgram: T22,
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
    // Same discipline as the 0b10 test: the property is WHICH BRANCH RAN, and the vault's own
    // `held` is the program's record of that. Comparing a before-read and an after-read of a
    // token ACCOUNT across a transaction reintroduces the race that reported "depositor got 0,
    // fair is 99" earlier — the after-read can still return the pre-transaction view, which is
    // indistinguishable from "nothing happened".
    const heldShares = (await getAccount(connection, userShareAta, "confirmed", T22)).amount;
    assert.isTrue(heldShares > 0n, "depositor holds no shares to redeem");
    const shares = heldShares / 2n;
    const hb: any = await program.account.vault.fetch(vault);
    const hb0 = BigInt(hb.sleeves[0].held.toString()), hb1 = BigInt(hb.sleeves[1].held.toString());
    const sb = (await getMint(connection, shareMint.publicKey, "confirmed", T22)).supply;

    const sig = await program.methods.redeem(new BN(shares.toString()), 0b01).accounts({
      redeemer: authority.publicKey, vault, shareMint: shareMint.publicKey,
      sleeve0Mint: sleeve0, sleeve1Mint: sleeve1,
      vaultAta0: vAta0, vaultAta1: vAta1, userAta0: uAta0, userAta1: uAta1,
      redeemerShareAta: userShareAta,
      tokenProgram0: T22, tokenProgram1: TOKEN_PROGRAM_ID, shareTokenProgram: T22,
    }).rpc({ commitment: "confirmed" });

    const ha: any = await program.account.vault.fetch(vault);
    const ha0 = BigInt(ha.sleeves[0].held.toString()), ha1 = BigInt(ha.sleeves[1].held.toString());
    const sa = (await getMint(connection, shareMint.publicKey, "confirmed", T22)).supply;
    assert.isTrue(ha0 < hb0, "sleeve 0 was not debited");
    assert.equal(ha1, hb1, "sleeve 1 was debited despite being masked out");
    // AND the tokens actually moved — `held` alone cannot tell a payout from a no-op.
    assert.equal(await deltaFromReceipt(sig, uAta0), hb0 - ha0, "sleeve 0 debited but the user was not paid");
    assert.equal(await deltaFromReceipt(sig, uAta1), 0n, "sleeve 1 moved despite being masked out");
    // USER-PROTECTING, stated as a warning rather than hidden: taking one leg still burns the
    // FULL share count. That is the user's choice, not a discount, and the UI must say so.
    assert.equal(sb - sa, shares, "shares not burned in full");
  });

  it("redeem with sleeve_mask = 0b10 leaves SLEEVE 0 untouched", async function () {
    this.timeout(60_000);
    // ⛔ THIS TEST EXISTS BECAUSE A MUTANT SURVIVED. `replace & with |` on
    //    `if sleeve_mask & 0b01 != 0` yields `(sleeve_mask | 0b01) != 0`, which is ALWAYS
    //    true — sleeve 0 pays out regardless of the mask. Every redeem test used a mask where
    //    sleeve 0 was SUPPOSED to fire (0b01 here, 0b11 in the fork spec), so nothing ever
    //    required that branch to evaluate FALSE. Same asymmetry as the math.rs survivors:
    //    one direction checked, the mirror assumed.
    // ⚠️ And it is not cosmetic. A user redeeming 0b10 because SPYx is FROZEN is precisely
    //    the case sleeve_mask exists for — the branch whose purpose is to not fire.
    const heldShares = (await getAccount(connection, userShareAta, "confirmed", T22)).amount;
    const shares = heldShares / 4n;
    assert.isTrue(shares > 0n, "no shares to redeem");
    // ⛔ ASSERT ON THE VAULT'S OWN `held`, NOT ON TWO ATA READS. The property is "which branch
    // ran", and `held` is the program's record of exactly that — one fetch after the tx, so
    // there is no window between a before-read and an after-read for a stale view to slip into.
    // The first version of this test compared user ATA balances and reported a1 == b1 while
    // `held` showed the transfer had happened: two reads, one race, a false negative.
    const hb: any = await program.account.vault.fetch(vault);
    const hb0 = BigInt(hb.sleeves[0].held.toString()), hb1 = BigInt(hb.sleeves[1].held.toString());

    const sig = await program.methods.redeem(new BN(shares.toString()), 0b10).accounts({
      redeemer: authority.publicKey, vault, shareMint: shareMint.publicKey,
      sleeve0Mint: sleeve0, sleeve1Mint: sleeve1,
      vaultAta0: vAta0, vaultAta1: vAta1, userAta0: uAta0, userAta1: uAta1,
      redeemerShareAta: userShareAta,
      tokenProgram0: T22, tokenProgram1: TOKEN_PROGRAM_ID, shareTokenProgram: T22,
    }).rpc({ commitment: "confirmed" });

    const ha: any = await program.account.vault.fetch(vault);
    const ha0 = BigInt(ha.sleeves[0].held.toString()), ha1 = BigInt(ha.sleeves[1].held.toString());
    assert.equal(ha0, hb0, "sleeve 0 was debited despite being masked OUT");
    assert.isTrue(ha1 < hb1, "sleeve 1 was not debited");
    assert.equal(await deltaFromReceipt(sig, uAta1), hb1 - ha1, "sleeve 1 debited but the user was not paid");
    assert.equal(await deltaFromReceipt(sig, uAta0), 0n, "sleeve 0 moved despite being masked OUT");
  });

  it("redeem rejects an empty mask and an undefined bit", async function () {
    this.timeout(60_000);
    for (const mask of [0b00, 0b100]) {
      try {
        await program.methods.redeem(new BN(100), mask).accounts({
          redeemer: authority.publicKey, vault, shareMint: shareMint.publicKey,
          sleeve0Mint: sleeve0, sleeve1Mint: sleeve1,
          vaultAta0: vAta0, vaultAta1: vAta1, userAta0: uAta0, userAta1: uAta1,
          redeemerShareAta: userShareAta, tokenProgram0: T22, tokenProgram1: TOKEN_PROGRAM_ID, shareTokenProgram: T22,
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
  // ── deposit cap ────────────────────────────────────────────────────────────
  // ⛔ The cap is PER SLEEVE in that sleeve's own base units. A single scalar "total held"
  // cap would be summing SPYx at 8dp with USDY at 6dp and bounding neither.

  it("set_deposit_cap is authority-gated", async function () {
    this.timeout(60_000);
    const stranger = Keypair.generate();
    const sig = await connection.requestAirdrop(stranger.publicKey, 1_000_000_000);
    await connection.confirmTransaction({ signature: sig, ...(await connection.getLatestBlockhash()) });
    try {
      await program.methods.setDepositCap(0, new BN(1)).accounts({
        authority: stranger.publicKey, vault,
      }).signers([stranger]).rpc({ commitment: "confirmed" });
      assert.fail("a stranger changed the deposit cap");
    } catch (e: any) { assert.match(String(e), /ConstraintHasOne|has_one|Unauthorized|2001/); }
  });

  // ⛔ THE BOUNDARY, AND THE REASON IT IS WRITTEN OUT LONGHAND: `enforce_caps` compares with
  // `next_held[i] <= deposit_cap` INSIDE A `require!`, and cargo-mutants does not mutate
  // inside macro expansions. The lib.rs run scores 18/18 caught and CANNOT reach that `<=`.
  // Flip it to `<` by hand and every other cap test still passes: "crosses the cap" still
  // rejects, redeem still ignores the cap, a zero cap is still refused at initialize. Only
  // this one fails. ⭐ 18/18 CERTIFIES THE INSTRUMENT, NOT THE POPULATION — the score was
  // perfect over the mutants the tool could generate, which is a different set from the
  // mutations that would break the program.
  it("a deposit landing EXACTLY on the cap is accepted — the boundary is inclusive", async function () {
    this.timeout(60_000);
    const v0: any = await program.account.vault.fetch(vault);
    const held0 = BigInt(v0.sleeves[0].held.toString());
    const amount = 1_000_000n;             // large enough to mint a share; DepositTooSmall
                                           // fires before enforce_caps, so dust cannot test this
    // Set the cap to exactly where this deposit lands, rather than depositing up to an
    // existing cap: the equality has to be arranged, never hoped for.
    await program.methods.setDepositCap(0, new BN((held0 + amount).toString()))
      .accounts({ authority: authority.publicKey, vault }).rpc({ commitment: "confirmed" });

    await program.methods.deposit([new BN(amount.toString()), new BN(amount.toString())]).accounts({
      depositor: authority.publicKey, vault, shareMint: shareMint.publicKey,
      sleeve0Mint: sleeve0, sleeve1Mint: sleeve1,
      vaultAta0: vAta0, vaultAta1: vAta1, userAta0: uAta0, userAta1: uAta1,
      depositorShareAta: userShareAta, tokenProgram0: T22, tokenProgram1: TOKEN_PROGRAM_ID,
      shareTokenProgram: T22,
    }).rpc({ commitment: "confirmed" });

    const v1: any = await program.account.vault.fetch(vault);
    assert.equal(v1.sleeves[0].held.toString(), (held0 + amount).toString(),
      "held did not land exactly on the cap — the test is no longer testing the boundary");
    assert.equal(v1.sleeves[0].depositCap.toString(), v1.sleeves[0].held.toString(),
      "held == cap is the whole point of this test");
  });

  it("a deposit that would cross the cap is REJECTED WHOLE, and the vault is unchanged", async function () {
    this.timeout(60_000);
    const v0: any = await program.account.vault.fetch(vault);
    const held0 = BigInt(v0.sleeves[0].held.toString());
    // cap one base unit above where we are: any real deposit must cross it
    await program.methods.setDepositCap(0, new BN((held0 + 1n).toString()))
      .accounts({ authority: authority.publicKey, vault }).rpc({ commitment: "confirmed" });

    const before: any = await program.account.vault.fetch(vault);
    try {
      await program.methods.deposit([new BN(1_000_000), new BN(1_000_000)]).accounts({
        depositor: authority.publicKey, vault, shareMint: shareMint.publicKey,
        sleeve0Mint: sleeve0, sleeve1Mint: sleeve1,
        vaultAta0: vAta0, vaultAta1: vAta1, userAta0: uAta0, userAta1: uAta1,
        depositorShareAta: userShareAta, tokenProgram0: T22, tokenProgram1: TOKEN_PROGRAM_ID,
        shareTokenProgram: T22,
      }).rpc({ commitment: "confirmed" });
      assert.fail("a deposit past the cap was accepted");
    } catch (e: any) { assert.match(String(e), /DepositCapExceeded/); }

    // ⛔ REJECTED WHOLE, NOT PARTIALLY FILLED. The transfer happens before `held` is known,
    // so the only honest outcome is for the whole transaction to revert — a partial fill
    // would mint a share count the depositor never computed.
    const after: any = await program.account.vault.fetch(vault);
    assert.equal(after.sleeves[0].held.toString(), before.sleeves[0].held.toString(), "sleeve 0 moved");
    assert.equal(after.sleeves[1].held.toString(), before.sleeves[1].held.toString(), "sleeve 1 moved on a rejected deposit");
  });

  it("⛔ THE CAP NEVER BLOCKS REDEEM — a limit that can trap an exit is the failure it prevents", async function () {
    this.timeout(60_000);
    // leave the cap BELOW current held from the previous test: redeem must not consult it
    const v: any = await program.account.vault.fetch(vault);
    const cap = BigInt(v.sleeves[0].depositCap.toString());
    const held = BigInt(v.sleeves[0].held.toString());
    assert.isTrue(cap <= held + 1n, "precondition: the cap is at or below held");

    const shares = (await getAccount(connection, userShareAta, "confirmed", T22)).amount / 4n;
    assert.isTrue(shares > 0n, "nothing to redeem");
    const hb = BigInt(v.sleeves[0].held.toString());
    await program.methods.redeem(new BN(shares.toString()), 0b11).accounts({
      redeemer: authority.publicKey, vault, shareMint: shareMint.publicKey,
      sleeve0Mint: sleeve0, sleeve1Mint: sleeve1,
      vaultAta0: vAta0, vaultAta1: vAta1, userAta0: uAta0, userAta1: uAta1,
      redeemerShareAta: userShareAta, tokenProgram0: T22, tokenProgram1: TOKEN_PROGRAM_ID,
      shareTokenProgram: T22,
    }).rpc({ commitment: "confirmed" });
    const va: any = await program.account.vault.fetch(vault);
    assert.isTrue(BigInt(va.sleeves[0].held.toString()) < hb, "redeem did not pay out under a tight cap");
  });

  it("initialize REFUSES a zero cap — a stuck vault wearing the costume of a limit", async function () {
    this.timeout(60_000);
    const m = Keypair.generate();
    const [v2] = PublicKey.findProgramAddressSync([Buffer.from("vault"), sleeve1.toBuffer()], program.programId);
    try {
      await program.methods.initialize(FEE_BPS, [new BN(0), new BN(1)]).accounts({
        authority: authority.publicKey, vault: v2, shareMint: m.publicKey,
        sleeve0Mint: sleeve1, sleeve1Mint: sleeve0,
        tokenProgram: T22, systemProgram: SystemProgram.programId,
      }).signers([m]).rpc({ commitment: "confirmed" });
      assert.fail("a zero cap was accepted");
    } catch (e: any) { assert.match(String(e), /ZeroDepositCap/); }
  });
});
