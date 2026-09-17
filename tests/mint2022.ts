// Local Token-2022 mint factory for tests. See mint2022.spec.ts for why this exists.
//
// Extension init instructions MUST sit between createAccount and initializeMint2 — Token-2022
// rejects them once the mint is initialized, and an extension can never be added to a mint
// afterwards. That is also why mainnet T-OpenAI can never gain a transfer hook and mainnet
// SPYx always can: SPYx carries an empty hook SLOT, T-OpenAI carries none.
import {
  Connection, Keypair, PublicKey, Signer, SystemProgram, Transaction, sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  ExtensionType, TOKEN_2022_PROGRAM_ID, getMintLen,
  createInitializeMint2Instruction,
  createInitializeTransferFeeConfigInstruction,
  createInitializePermanentDelegateInstruction,
  createInitializeTransferHookInstruction,
  createInitializeScaledUiAmountConfigInstruction,
  createInitializePausableConfigInstruction,
  createInitializeMintCloseAuthorityInstruction,
} from "@solana/spl-token";

export interface TestMintOpts {
  decimals: number;
  /** null = omit the extension entirely, mirroring a mint that can never gain it */
  permanentDelegate: PublicKey | null;
  pausableAuthority: PublicKey | null;
  transferHookProgram: PublicKey | null;
  /** Set AT INIT so it is effective immediately. Arming later is epoch-gated — see the spec header. */
  transferFeeBasisPoints: number;
  maximumFee?: bigint;
  scaledUiMultiplier?: number;
  /** MintCloseAuthority. Only used to prove initialize REJECTS such a mint: a closable mint can
   *  be recreated at the same address with different extensions or decimals. */
  closeAuthority?: PublicKey | null;
  mintAuthority?: PublicKey;
  freezeAuthority?: PublicKey | null;
}

export async function createTestMint(
  connection: Connection, payer: Keypair, opts: TestMintOpts,
): Promise<PublicKey> {
  const mintKp = Keypair.generate();
  const mint = mintKp.publicKey;
  const authority = opts.mintAuthority ?? payer.publicKey;

  // Only count the extensions we actually initialize — an over-sized mint account still works
  // but hides a mismatch between what we asked for and what the mint really carries.
  const types: ExtensionType[] = [ExtensionType.ScaledUiAmountConfig, ExtensionType.TransferFeeConfig];
  if (opts.permanentDelegate) types.push(ExtensionType.PermanentDelegate);
  if (opts.transferHookProgram) types.push(ExtensionType.TransferHook);
  if (opts.pausableAuthority) types.push(ExtensionType.PausableConfig);
  if (opts.closeAuthority) types.push(ExtensionType.MintCloseAuthority);

  const space = getMintLen(types);
  const lamports = await connection.getMinimumBalanceForRentExemption(space);

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey, newAccountPubkey: mint,
      space, lamports, programId: TOKEN_2022_PROGRAM_ID,
    }),
    // scaledUiAmount first: mainnet SPYx carries it and the vault must read newMultiplier,
    // never multiplier — a 0.1798% silent error if anyone reads the wrong field.
    createInitializeScaledUiAmountConfigInstruction(
      mint, authority, opts.scaledUiMultiplier ?? 1, TOKEN_2022_PROGRAM_ID),
    createInitializeTransferFeeConfigInstruction(
      mint, authority, authority,
      opts.transferFeeBasisPoints,
      opts.maximumFee ?? BigInt("18446744073709551615"), // uncapped, exactly like mainnet T-OpenAI
      TOKEN_2022_PROGRAM_ID),
  );
  if (opts.permanentDelegate) {
    tx.add(createInitializePermanentDelegateInstruction(mint, opts.permanentDelegate, TOKEN_2022_PROGRAM_ID));
  }
  if (opts.transferHookProgram) {
    tx.add(createInitializeTransferHookInstruction(mint, authority, opts.transferHookProgram, TOKEN_2022_PROGRAM_ID));
  }
  if (opts.pausableAuthority) {
    tx.add(createInitializePausableConfigInstruction(mint, opts.pausableAuthority, TOKEN_2022_PROGRAM_ID));
  }
  if (opts.closeAuthority) {
    tx.add(createInitializeMintCloseAuthorityInstruction(mint, opts.closeAuthority, TOKEN_2022_PROGRAM_ID));
  }
  tx.add(createInitializeMint2Instruction(
    mint, opts.decimals, authority,
    opts.freezeAuthority === undefined ? authority : opts.freezeAuthority,
    TOKEN_2022_PROGRAM_ID));

  await sendAndConfirmTransaction(connection, tx, [payer, mintKp], { commitment: "confirmed" });
  return mint;
}


/// A CLASSIC SPL mint (Tokenkeg), for the sleeve that mirrors USDY.
///
/// ⛔ THIS EXISTS BECAUSE ITS ABSENCE HID A REAL DEFECT. Every local test built both sleeves
/// under Token-2022, so a single `token_program` account served both CPIs and nothing noticed
/// that the real pair is SPYx (TokenzQd) + USDY (Tokenkeg). The harness mirrored SPYx
/// faithfully and got USDY's PROGRAM wrong — the one property that mattered.
export async function createClassicMint(
  connection: Connection, payer: Keypair, decimals: number,
): Promise<PublicKey> {
  const { TOKEN_PROGRAM_ID, MINT_SIZE, createInitializeMint2Instruction: initMint2 } = require("@solana/spl-token");
  const kp = Keypair.generate();
  const lamports = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey, newAccountPubkey: kp.publicKey,
      space: MINT_SIZE, lamports, programId: TOKEN_PROGRAM_ID,
    }),
    initMint2(kp.publicKey, decimals, payer.publicKey, payer.publicKey, TOKEN_PROGRAM_ID),
  );
  await sendAndConfirmTransaction(connection, tx, [payer, kp], { commitment: "confirmed" });
  return kp.publicKey;
}
