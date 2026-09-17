// Task 0 — the local Token-2022 test mint.
//
// WHY THIS EXISTS: cloned mainnet SPYx has Backed as mint authority, so no test wallet can
// ever hold SPYx. Every later task that moves tokens is unrunnable without a local mint we
// control. It is also the ONLY way to test pause, permanent-delegate seizure and hook
// behaviour at all, none of which we can trigger on a mint we do not own.
//
// THE FEE MINT IS A FALSIFICATION TEST, NOT A FEATURE. `transfer_in_measured` reads the vault
// balance before and after its own transfer and takes the delta, instead of trusting the
// amount it asked for. If the delta and a naive `held += amount` agree under every test we can
// write, that helper is unpaid-for complexity and the correct outcome is to DELETE it.
// A fee-bearing mint is the case most likely to justify it; if this does not, nothing will.
//
// ⛔ THE FEE IS SET AT INITIALIZATION, NOT ARMED MID-TEST. `setTransferFee` writes
// `newerTransferFee` with a FUTURE epoch, and getEpochFee returns `olderTransferFee` until
// that epoch arrives (spl-token extensions/transferFee/state.js:43). solana-test-validator
// defaults to 432,000 slots/epoch ≈ 2 days, so a mid-test arm would transfer, observe NO fee,
// and "prove" the helper unnecessary for the wrong reason. Testing the TRANSITION needs
// `solana-test-validator --slots-per-epoch 32`; this product never performs that transition.
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID, ExtensionType, getMint, getMintLen, getTransferFeeConfig,
  getPermanentDelegate, getTransferHook, getPausableConfig, getScaledUiAmountConfig,
  createAssociatedTokenAccountIdempotent, getAccount, mintTo, transferChecked,
} from "@solana/spl-token";
import { assert } from "chai";
import { createTestMint, TestMintOpts } from "./mint2022";

const RPC = process.env.RPC ?? "http://127.0.0.1:8899";

describe("local Token-2022 test mint", () => {
  const connection = new Connection(RPC, "confirmed");
  const payer = Keypair.generate();
  const hookProgram = Keypair.generate().publicKey; // a key, not a deployed program — the SLOT is what we assert

  before(async function () {
    this.timeout(60_000);
    const sig = await connection.requestAirdrop(payer.publicKey, 10_000_000_000);
    const bh = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
  });

  it("mirrors mainnet SPYx: every issuer-control extension present, zero fee", async function () {
    this.timeout(60_000);
    const mint = await createTestMint(connection, payer, {
      decimals: 8, permanentDelegate: payer.publicKey, pausableAuthority: payer.publicKey,
      transferHookProgram: hookProgram, transferFeeBasisPoints: 0,
    });
    const info = await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);

    assert.isNotNull(getPermanentDelegate(info), "permanentDelegate absent — cannot test seizure");
    assert.isNotNull(getPausableConfig(info), "pausableConfig absent — cannot test a freeze");
    assert.isNotNull(getScaledUiAmountConfig(info), "scaledUiAmount absent — newMultiplier untestable");
    const hook = getTransferHook(info);
    assert.isNotNull(hook, "transferHook SLOT absent — mainnet SPYx carries one and it cannot be added later");
    assert.equal(hook!.programId.toBase58(), hookProgram.toBase58());
    assert.equal(getTransferFeeConfig(info)!.newerTransferFee.transferFeeBasisPoints, 0, "control mint must be 0 bps like SPYx");
    assert.equal(info.decimals, 8);
  });

  it("FALSIFIES the naive count: on a fee-bearing mint, delta !== amount requested", async function () {
    this.timeout(60_000);
    const BPS = 100; // 1%
    const mint = await createTestMint(connection, payer, {
      decimals: 8, permanentDelegate: payer.publicKey, pausableAuthority: payer.publicKey,
      transferHookProgram: null, transferFeeBasisPoints: BPS,
    });
    const src = await createAssociatedTokenAccountIdempotent(connection, payer, mint, payer.publicKey, {}, TOKEN_2022_PROGRAM_ID);
    const dstOwner = Keypair.generate().publicKey;
    const dst = await createAssociatedTokenAccountIdempotent(connection, payer, mint, dstOwner, {}, TOKEN_2022_PROGRAM_ID);

    const AMOUNT = 1_000_000_000n; // 10.00000000
    await mintTo(connection, payer, mint, src, payer, AMOUNT, [], {}, TOKEN_2022_PROGRAM_ID);

    const before = (await getAccount(connection, dst, "confirmed", TOKEN_2022_PROGRAM_ID)).amount;
    await transferChecked(connection, payer, src, mint, dst, payer, AMOUNT, 8, [], {}, TOKEN_2022_PROGRAM_ID);
    const after = (await getAccount(connection, dst, "confirmed", TOKEN_2022_PROGRAM_ID)).amount;

    const measured = after - before;          // what transfer_in_measured would compute
    const naive = AMOUNT;                     // what `held += amount` would record
    const expectedFee = (AMOUNT * BigInt(BPS)) / 10_000n;

    assert.notEqual(measured, naive, "measured delta equals the naive count — transfer_in_measured is unpaid-for complexity, DELETE IT");
    assert.equal(measured, naive - expectedFee, `expected ${naive - expectedFee}, measured ${measured}`);
  });

  it("CONTROL: on the zero-fee mint the two agree, so the test above can actually fail", async function () {
    this.timeout(60_000);
    const mint = await createTestMint(connection, payer, {
      decimals: 8, permanentDelegate: null, pausableAuthority: null,
      transferHookProgram: null, transferFeeBasisPoints: 0,
    });
    const src = await createAssociatedTokenAccountIdempotent(connection, payer, mint, payer.publicKey, {}, TOKEN_2022_PROGRAM_ID);
    const dst = await createAssociatedTokenAccountIdempotent(connection, payer, mint, Keypair.generate().publicKey, {}, TOKEN_2022_PROGRAM_ID);
    const AMOUNT = 1_000_000_000n;
    await mintTo(connection, payer, mint, src, payer, AMOUNT, [], {}, TOKEN_2022_PROGRAM_ID);
    const before = (await getAccount(connection, dst, "confirmed", TOKEN_2022_PROGRAM_ID)).amount;
    await transferChecked(connection, payer, src, mint, dst, payer, AMOUNT, 8, [], {}, TOKEN_2022_PROGRAM_ID);
    const after = (await getAccount(connection, dst, "confirmed", TOKEN_2022_PROGRAM_ID)).amount;
    assert.equal(after - before, AMOUNT, "zero-fee mint must deliver exactly the amount sent");
  });
});
