import { readFileSync } from "node:fs";
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotent,
  createInitializeDefaultAccountStateInstruction,
  createInitializeMint2Instruction,
  createInitializePausableConfigInstruction,
  createInitializePermanentDelegateInstruction,
  createInitializeTransferHookInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getDefaultAccountState,
  getMint,
  getMintLen,
  getPausableConfig,
  getPermanentDelegate,
  getTransferHook,
  transferChecked,
} from "@solana/spl-token";
import { assert } from "chai";

const SPYX = new PublicKey("XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W");
const USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const INDEX_SCALE = 1_000_000_000_000_000_000n;

type ForkManifest = {
  owner: string;
  spyxAta: string;
  usdcAta: string;
  equityFeed: number[];
  collateralFeed: number[];
  windowSeconds: number;
  oracleAddresses: Record<string, string>;
};

const asBigInt = (value: { toString(): string }) => BigInt(value.toString());
const ceilDiv = (numerator: bigint, denominator: bigint) =>
  (numerator + denominator - 1n) / denominator;

describe("Cairn lending lifecycle on the mainnet mint fork", () => {
  const env = anchor.AnchorProvider.env();
  const provider = new anchor.AnchorProvider(
    new anchor.web3.Connection(env.connection.rpcEndpoint, "confirmed"),
    env.wallet,
    { commitment: "confirmed", preflightCommitment: "confirmed" },
  );
  anchor.setProvider(provider);

  const program = anchor.workspace.cairn as Program<any>;
  const connection = provider.connection;
  const authority = (provider.wallet as anchor.Wallet).payer;
  const borrower = Keypair.generate();
  const receiptMint = Keypair.generate();
  const manifest = JSON.parse(
    readFileSync("fork/generated/manifest.json", "utf8"),
  ) as ForkManifest;

  const [market] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), SPYX.toBuffer()],
    program.programId,
  );
  const [position] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), market.toBuffer(), borrower.publicKey.toBuffer()],
    program.programId,
  );
  const equityVault = getAssociatedTokenAddressSync(SPYX, market, true, TOKEN_2022_PROGRAM_ID);
  const collateralVault = getAssociatedTokenAddressSync(USDC, market, true, TOKEN_PROGRAM_ID);

  const oracle = (name: string) => new PublicKey(manifest.oracleAddresses[name]);

  async function createPolicyMatchedReceiptMint() {
    const equity = await getMint(connection, SPYX, "confirmed", TOKEN_2022_PROGRAM_ID);
    const delegate = getPermanentDelegate(equity);
    const hook = getTransferHook(equity);
    const pausable = getPausableConfig(equity);
    const defaultState = getDefaultAccountState(equity);
    assert.isNotNull(delegate, "forked SPYx lost PermanentDelegate");
    assert.isNotNull(hook, "forked SPYx lost its TransferHook slot");
    assert.isNotNull(pausable, "forked SPYx lost PausableConfig");
    assert.isNotNull(defaultState, "forked SPYx lost DefaultAccountState");
    assert.equal(hook!.programId.toBase58(), PublicKey.default.toBase58(), "SPYx hook became active");

    const extensions = [
      ExtensionType.PermanentDelegate,
      ExtensionType.TransferHook,
      ExtensionType.PausableConfig,
      ExtensionType.DefaultAccountState,
    ];
    const space = getMintLen(extensions);
    const lamports = await connection.getMinimumBalanceForRentExemption(space);
    const transaction = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: authority.publicKey,
        newAccountPubkey: receiptMint.publicKey,
        lamports,
        space,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializePermanentDelegateInstruction(
        receiptMint.publicKey,
        delegate!.delegate,
        TOKEN_2022_PROGRAM_ID,
      ),
      createInitializeTransferHookInstruction(
        receiptMint.publicKey,
        hook!.authority,
        hook!.programId,
        TOKEN_2022_PROGRAM_ID,
      ),
      createInitializePausableConfigInstruction(
        receiptMint.publicKey,
        pausable!.authority,
        TOKEN_2022_PROGRAM_ID,
      ),
      createInitializeDefaultAccountStateInstruction(
        receiptMint.publicKey,
        defaultState!.state,
        TOKEN_2022_PROGRAM_ID,
      ),
      createInitializeMint2Instruction(
        receiptMint.publicKey,
        equity.decimals,
        market,
        equity.freezeAuthority,
        TOKEN_2022_PROGRAM_ID,
      ),
    );
    await sendAndConfirmTransaction(connection, transaction, [authority, receiptMint], {
      commitment: "confirmed",
    });
  }

  it("deposits SPYx, borrows against USDC, accrues interest, repays, and redeems more SPYx", async function () {
    this.timeout(180_000);
    assert.equal(manifest.owner, authority.publicKey.toBase58(), "fork fixtures belong to another wallet");
    assert.equal(
      (await connection.getAccountInfo(SPYX))?.owner.toBase58(),
      TOKEN_2022_PROGRAM_ID.toBase58(),
      "SPYx was not cloned from mainnet",
    );
    assert.equal(
      (await connection.getAccountInfo(USDC))?.owner.toBase58(),
      TOKEN_PROGRAM_ID.toBase58(),
      "USDC was not cloned from mainnet",
    );

    await createPolicyMatchedReceiptMint();
    const depositorEquity = new PublicKey(manifest.spyxAta);
    const funderUsdc = new PublicKey(manifest.usdcAta);
    const depositorReceipt = await createAssociatedTokenAccountIdempotent(
      connection,
      authority,
      receiptMint.publicKey,
      authority.publicKey,
      {},
      TOKEN_2022_PROGRAM_ID,
    );

    const config = {
      equityFeedId: manifest.equityFeed,
      collateralFeedId: manifest.collateralFeed,
      maxPriceAgeSeconds: new BN(3_600),
      twapWindowSeconds: new BN(manifest.windowSeconds),
      maxConfidenceBps: 100,
      maxSpotTwapDeviationBps: 500,
      maxTwapDownSlotsRatio: 50_000,
      loanToValueBps: 5_000,
      liquidationThresholdBps: 7_000,
      liquidationBonusBps: 500,
      closeFactorBps: 5_000,
      reserveFactorBps: 1_000,
      baseRateBps: 50_000,
      slope1Bps: 0,
      slope2Bps: 0,
      kinkBps: 8_000,
      depositCap: new BN("18446744073709551615"),
      borrowCap: new BN("18446744073709551615"),
    };
    await program.methods.initializeMarket(config).accounts({
      authority: authority.publicKey,
      market,
      equityMint: SPYX,
      receiptMint: receiptMint.publicKey,
      collateralMint: USDC,
      equityVault,
      collateralVault,
      equityTokenProgram: TOKEN_2022_PROGRAM_ID,
      receiptTokenProgram: TOKEN_2022_PROGRAM_ID,
      collateralTokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    }).rpc();

    const airdrop = await connection.requestAirdrop(borrower.publicKey, 5_000_000_000);
    await connection.confirmTransaction(
      { signature: airdrop, ...(await connection.getLatestBlockhash("confirmed")) },
      "confirmed",
    );
    const borrowerEquity = await createAssociatedTokenAccountIdempotent(
      connection, authority, SPYX, borrower.publicKey, {}, TOKEN_2022_PROGRAM_ID,
    );
    const borrowerUsdc = await createAssociatedTokenAccountIdempotent(
      connection, authority, USDC, borrower.publicKey, {}, TOKEN_PROGRAM_ID,
    );
    await transferChecked(
      connection, authority, depositorEquity, SPYX, borrowerEquity, authority,
      200_000_000n, 8, [], {}, TOKEN_2022_PROGRAM_ID,
    );
    await transferChecked(
      connection, authority, funderUsdc, USDC, borrowerUsdc, authority,
      5_000_000_000n, 6, [], {}, TOKEN_PROGRAM_ID,
    );

    const deposited = 1_000_000_000n;
    await program.methods.deposit(new BN(deposited.toString())).accounts({
      depositor: authority.publicKey,
      market,
      equityMint: SPYX,
      receiptMint: receiptMint.publicKey,
      equityVault,
      depositorEquity,
      depositorReceipt,
      equityTokenProgram: TOKEN_2022_PROGRAM_ID,
      receiptTokenProgram: TOKEN_2022_PROGRAM_ID,
    }).rpc();
    assert.equal(
      (await getAccount(connection, depositorReceipt, "confirmed", TOKEN_2022_PROGRAM_ID)).amount,
      deposited,
      "initial deposit must mint cSPYx one-for-one",
    );

    await program.methods.initializePosition().accounts({
      owner: borrower.publicKey,
      market,
      position,
      systemProgram: SystemProgram.programId,
    }).signers([borrower]).rpc();
    await program.methods.depositCollateral(new BN(3_000_000_000)).accounts({
      owner: borrower.publicKey,
      market,
      position,
      collateralMint: USDC,
      collateralVault,
      ownerCollateral: borrowerUsdc,
      collateralTokenProgram: TOKEN_PROGRAM_ID,
    }).signers([borrower]).rpc();

    const borrowed = 500_000_000n;
    await program.methods.borrow(new BN(borrowed.toString())).accounts({
      borrower: borrower.publicKey,
      market,
      position,
      equityMint: SPYX,
      collateralMint: USDC,
      equityVault,
      borrowerEquity,
      equitySpot: oracle("equity-spot"),
      equityTwap: oracle("equity-twap"),
      collateralSpot: oracle("collateral-spot"),
      collateralTwap: oracle("collateral-twap"),
      equityTokenProgram: TOKEN_2022_PROGRAM_ID,
    }).signers([borrower]).rpc();
    const indexBefore = asBigInt((await (program.account as any).market.fetch(market)).borrowIndex);

    const start = Date.now();
    while (Date.now() - start < 2_200) await new Promise((resolve) => setTimeout(resolve, 100));
    await program.methods.accrueInterest().accounts({
      market,
      equityMint: SPYX,
    }).rpc();
    const accruedMarket: any = await (program.account as any).market.fetch(market);
    const indexAfter = asBigInt(accruedMarket.borrowIndex);
    assert.isTrue(indexAfter > indexBefore, "borrow index did not advance with clock time");

    for (let attempt = 0; attempt < 4; attempt++) {
      const currentPosition: any = await (program.account as any).position.fetch(position);
      const shares = asBigInt(currentPosition.debtShares);
      if (shares === 0n) break;
      const currentMarket: any = await (program.account as any).market.fetch(market);
      const debt = ceilDiv(shares * asBigInt(currentMarket.borrowIndex), INDEX_SCALE);
      await program.methods.repay(new BN(debt.toString())).accounts({
        payer: borrower.publicKey,
        market,
        position,
        equityMint: SPYX,
        equityVault,
        payerEquity: borrowerEquity,
        equityTokenProgram: TOKEN_2022_PROGRAM_ID,
      }).signers([borrower]).rpc();
    }
    const finalPosition: any = await (program.account as any).position.fetch(position);
    assert.equal(asBigInt(finalPosition.debtShares), 0n, "borrower debt was not fully repaid");

    const equityBeforeRedeem = (
      await getAccount(connection, depositorEquity, "confirmed", TOKEN_2022_PROGRAM_ID)
    ).amount;
    const receipts = (
      await getAccount(connection, depositorReceipt, "confirmed", TOKEN_2022_PROGRAM_ID)
    ).amount;
    await program.methods.redeem(new BN(receipts.toString())).accounts({
      redeemer: authority.publicKey,
      market,
      equityMint: SPYX,
      receiptMint: receiptMint.publicKey,
      equityVault,
      redeemerEquity: depositorEquity,
      redeemerReceipt: depositorReceipt,
      equityTokenProgram: TOKEN_2022_PROGRAM_ID,
      receiptTokenProgram: TOKEN_2022_PROGRAM_ID,
    }).rpc();
    const redeemed = (
      await getAccount(connection, depositorEquity, "confirmed", TOKEN_2022_PROGRAM_ID)
    ).amount - equityBeforeRedeem;
    assert.isTrue(redeemed > deposited, `cSPYx did not capture interest: ${redeemed} <= ${deposited}`);
  });
});
