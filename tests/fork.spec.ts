// Task 7 — round trip against the REAL SPYx and USDY mints, cloned from mainnet.
//
// This is the only test in the suite where the mints are not a model. stockpump.spec.ts builds
// both sleeves as local Token-2022 mints; that harness mirrored SPYx faithfully — extensions,
// decimals, fee behaviour — and got USDY's token PROGRAM wrong, which is the single property
// that matters when one instruction must CPI to two different token programs. That defect
// survived four commits and a green suite.
//
// ⚠️ WHAT THIS PROVES AND WHAT IT DOES NOT.
//   proves      real extension data, real decimals (8 vs 6), real owning programs
//               (TokenzQd vs Tokenkeg) in one vault, exercised end to end.
//   DOES NOT    test issuance. Backed holds SPYx's mint authority and Ondo holds USDY's, so
//               the balances here were written into the account at genesis, not minted. A
//               transfer hook that consulted issuer state would still be modelled.
//
// Requires the fork: ./fork/setup.sh (see that file for the two-phase holding trick).
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotent,
  getAccount, getMint,
} from "@solana/spl-token";
import { assert } from "chai";

const SPYX = new PublicKey("XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W");
const USDY = new PublicKey("A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6");
/// u64::MAX per sleeve: the pre-cap tests are about other properties, so they run uncapped.
const UNCAPPED = [new BN("18446744073709551615"), new BN("18446744073709551615")];
const FEE_BPS = 100;

describe("mainnet fork: real SPYx (Token-2022) + real USDY (classic SPL)", () => {
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

  let vault: PublicKey, shareMint: Keypair;
  let vAta0: PublicKey, vAta1: PublicKey, uAta0: PublicKey, uAta1: PublicKey;
  let deadShareAta: PublicKey, userShareAta: PublicKey;

  const held = async () => {
    const v: any = await program.account.vault.fetch(vault);
    return [BigInt(v.sleeves[0].held.toString()), BigInt(v.sleeves[1].held.toString())];
  };
  const supply = async () =>
    (await getMint(connection, shareMint.publicKey, "confirmed", TOKEN_2022_PROGRAM_ID)).supply;
  const notLower = (ha: bigint, sa: bigint, hb: bigint, sb: bigint) => ha * sb >= hb * sa;

  before(async function () {
    this.timeout(180_000);
    // The mints must be the REAL ones or this test is just stockpump.spec.ts with extra steps.
    const m0 = await connection.getAccountInfo(SPYX);
    const m1 = await connection.getAccountInfo(USDY);
    assert.isNotNull(m0, "SPYx not cloned — run ./fork/setup.sh");
    assert.isNotNull(m1, "USDY not cloned — run ./fork/setup.sh");
    assert.equal(m0!.owner.toBase58(), TOKEN_2022_PROGRAM_ID.toBase58(), "SPYx is not Token-2022 here");
    assert.equal(m1!.owner.toBase58(), TOKEN_PROGRAM_ID.toBase58(), "USDY is not classic SPL here");
    assert.equal(m0!.data.length, 676, "SPYx is not the mainnet account");
    assert.equal(m1!.data.length, 82, "USDY is not the mainnet account");

    shareMint = Keypair.generate();
    [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), SPYX.toBuffer()], program.programId);
    uAta0 = await createAssociatedTokenAccountIdempotent(connection, authority, SPYX, authority.publicKey, {}, TOKEN_2022_PROGRAM_ID);
    uAta1 = await createAssociatedTokenAccountIdempotent(connection, authority, USDY, authority.publicKey, {}, TOKEN_PROGRAM_ID);
    const b0 = (await getAccount(connection, uAta0, "confirmed", TOKEN_2022_PROGRAM_ID)).amount;
    const b1 = (await getAccount(connection, uAta1, "confirmed", TOKEN_PROGRAM_ID)).amount;
    assert.isTrue(b0 > 0n && b1 > 0n, `fork holdings missing: SPYx ${b0}, USDY ${b1} — re-run phase 1`);
  });

  it("initialize accepts the real mainnet mints", async function () {
    this.timeout(120_000);
    await program.methods.initialize(FEE_BPS, UNCAPPED).accounts({
      authority: authority.publicKey, vault, shareMint: shareMint.publicKey,
      sleeve0Mint: SPYX, sleeve1Mint: USDY,
      tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SystemProgram.programId,
    }).signers([shareMint]).rpc({ commitment: "confirmed" });

    const v: any = await program.account.vault.fetch(vault);
    assert.equal(v.sleeves[0].mint.toBase58(), SPYX.toBase58());
    assert.equal(v.sleeves[1].mint.toBase58(), USDY.toBase58());
    // neither mainnet mint carries MintCloseAuthority today — measured 2026-09-18 — so the
    // reject_closable_mint guard must NOT fire here. If it does, the guard is over-broad.
    vAta0 = await createAssociatedTokenAccountIdempotent(connection, authority, SPYX, vault, {}, TOKEN_2022_PROGRAM_ID, undefined, true);
    vAta1 = await createAssociatedTokenAccountIdempotent(connection, authority, USDY, vault, {}, TOKEN_PROGRAM_ID, undefined, true);
    deadShareAta = await createAssociatedTokenAccountIdempotent(connection, authority, shareMint.publicKey, vault, {}, TOKEN_2022_PROGRAM_ID, undefined, true);
    userShareAta = await createAssociatedTokenAccountIdempotent(connection, authority, shareMint.publicKey, authority.publicKey, {}, TOKEN_2022_PROGRAM_ID);
  });

  it("bootstrap moves BOTH token programs in one instruction", async function () {
    this.timeout(120_000);
    const A0 = 70_000_000n, A1 = 30_000_000n;   // 0.7 SPYx (8dp), 30 USDY (6dp)
    await program.methods.bootstrap([new BN(A0.toString()), new BN(A1.toString())]).accounts({
      depositor: authority.publicKey, vault, authority: authority.publicKey,
      shareMint: shareMint.publicKey, sleeve0Mint: SPYX, sleeve1Mint: USDY,
      vaultAta0: vAta0, vaultAta1: vAta1, userAta0: uAta0, userAta1: uAta1,
      deadShareAta,
      tokenProgram0: TOKEN_2022_PROGRAM_ID,     // SPYx
      tokenProgram1: TOKEN_PROGRAM_ID,          // USDY — a DIFFERENT program, same instruction
      shareTokenProgram: TOKEN_2022_PROGRAM_ID,
    }).rpc({ commitment: "confirmed" });

    const h = await held();
    // SPYx charges 0 bps, so measured == sent. If Backed ever arms transferFeeConfig this
    // assertion is the one that will break first, and it should.
    assert.equal(h[0], A0, "SPYx held != sent — a transfer fee appeared on the real mint");
    assert.equal(h[1], A1, "USDY held != sent");
    assert.equal(await supply(), 1_000n, "dead shares not minted");
  });

  it("deposit and redeem round-trip across two token programs", async function () {
    this.timeout(120_000);
    const hb = await held(), sb = await supply();
    const A0 = 7_000_000n, A1 = 3_000_000n;
    await program.methods.deposit([new BN(A0.toString()), new BN(A1.toString())]).accounts({
      depositor: authority.publicKey, vault, shareMint: shareMint.publicKey,
      sleeve0Mint: SPYX, sleeve1Mint: USDY,
      vaultAta0: vAta0, vaultAta1: vAta1, userAta0: uAta0, userAta1: uAta1,
      depositorShareAta: userShareAta,
      tokenProgram0: TOKEN_2022_PROGRAM_ID, tokenProgram1: TOKEN_PROGRAM_ID,
      shareTokenProgram: TOKEN_2022_PROGRAM_ID,
    }).rpc({ commitment: "confirmed" });

    const ha = await held(), sa = await supply();
    assert.isTrue(notLower(ha[0], sa, hb[0], sb), "SPYx per share fell");
    assert.isTrue(notLower(ha[1], sa, hb[1], sb), "USDY per share fell");
    // USER-PROTECTING: exact binding-sleeve count, on the real mints.
    const n0 = A0 - (A0 * BigInt(FEE_BPS) + 9_999n) / 10_000n;
    const n1 = A1 - (A1 * BigInt(FEE_BPS) + 9_999n) / 10_000n;
    const expected = (sb * n0 / hb[0]) < (sb * n1 / hb[1]) ? sb * n0 / hb[0] : sb * n1 / hb[1];
    assert.equal(sa - sb, expected, "depositor did not receive the binding-sleeve share count");

    const shares = (await getAccount(connection, userShareAta, "confirmed", TOKEN_2022_PROGRAM_ID)).amount / 2n;
    const u0b = (await getAccount(connection, uAta0, "confirmed", TOKEN_2022_PROGRAM_ID)).amount;
    const u1b = (await getAccount(connection, uAta1, "confirmed", TOKEN_PROGRAM_ID)).amount;
    await program.methods.redeem(new BN(shares.toString()), 0b11).accounts({
      redeemer: authority.publicKey, vault, shareMint: shareMint.publicKey,
      sleeve0Mint: SPYX, sleeve1Mint: USDY,
      vaultAta0: vAta0, vaultAta1: vAta1, userAta0: uAta0, userAta1: uAta1,
      redeemerShareAta: userShareAta,
      tokenProgram0: TOKEN_2022_PROGRAM_ID, tokenProgram1: TOKEN_PROGRAM_ID,
      shareTokenProgram: TOKEN_2022_PROGRAM_ID,
    }).rpc({ commitment: "confirmed" });
    assert.isTrue((await getAccount(connection, uAta0, "confirmed", TOKEN_2022_PROGRAM_ID)).amount > u0b, "SPYx not paid out");
    assert.isTrue((await getAccount(connection, uAta1, "confirmed", TOKEN_PROGRAM_ID)).amount > u1b, "USDY not paid out");
  });

  it("CONTROL: a mismatched token program is rejected, so the constraint is real", async function () {
    this.timeout(120_000);
    try {
      await program.methods.deposit([new BN(1_000_000), new BN(1_000_000)]).accounts({
        depositor: authority.publicKey, vault, shareMint: shareMint.publicKey,
        sleeve0Mint: SPYX, sleeve1Mint: USDY,
        vaultAta0: vAta0, vaultAta1: vAta1, userAta0: uAta0, userAta1: uAta1,
        depositorShareAta: userShareAta,
        // deliberately swapped: classic SPL named for the Token-2022 sleeve
        tokenProgram0: TOKEN_PROGRAM_ID, tokenProgram1: TOKEN_PROGRAM_ID,
        shareTokenProgram: TOKEN_2022_PROGRAM_ID,
      }).rpc({ commitment: "confirmed" });
      assert.fail("a Token-2022 sleeve accepted the classic SPL program");
    } catch (e: any) {
      assert.match(String(e), /SleeveMismatch|ConstraintRaw|2003/,
        `expected the token-program constraint to fire, got: ${e}`);
    }
  });
});
