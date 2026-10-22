import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  getAccount
} from '@solana/spl-token';
import { CONFIG, getUsdcMint } from './config.js';

export const connection = new Connection(CONFIG.SOLANA_RPC_URL, 'confirmed');

/**
 * Validates whether a given string is a valid Solana public key.
 */
export function isValidSolanaAddress(address) {
  try {
    const pk = new PublicKey(address);
    return PublicKey.isOnCurve(pk.toBuffer());
  } catch {
    return false;
  }
}

/**
 * Retrieves SOL and USDC balances for a wallet.
 */
export async function getWalletBalances(address) {
  const pk = new PublicKey(address);
  const solBalanceLamports = await connection.getBalance(pk);
  const sol = solBalanceLamports / LAMPORTS_PER_SOL;

  let usdc = 0;
  try {
    const usdcMint = new PublicKey(getUsdcMint());
    const ata = await getAssociatedTokenAddress(usdcMint, pk);
    const tokenAccount = await getAccount(connection, ata);
    usdc = Number(tokenAccount.amount) / 1_000_000;
  } catch {
    usdc = 0;
  }

  return { sol, usdc, address };
}

/**
 * Parses raw text input into structured recipients.
 * Accepts formats:
 * - "address, amount"
 * - "address amount"
 * - Tab-separated or CSV lines
 */
export function parseRecipients(rawText) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const valid = [];
  const errors = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Split by comma, whitespace, or tab
    const parts = line.split(/[,\s\t]+/).filter(Boolean);
    if (parts.length < 2) {
      errors.push(`Line ${i + 1}: Missing amount or address ("${line}")`);
      continue;
    }

    const [addr, amtStr] = parts;
    if (!isValidSolanaAddress(addr)) {
      errors.push(`Line ${i + 1}: Invalid Solana address ("${addr}")`);
      continue;
    }

    const amount = parseFloat(amtStr);
    if (isNaN(amount) || amount <= 0) {
      errors.push(`Line ${i + 1}: Invalid positive amount ("${amtStr}")`);
      continue;
    }

    valid.push({ address: addr, amount });
  }

  return { valid, errors };
}

/**
 * Builds a batch SOL transfer transaction.
 * Batches instructions within the 1232-byte MTU limit (typically up to 18-20 transfers).
 */
export async function buildBatchSolTransaction(payerPubkey, recipients) {
  const tx = new Transaction();
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = new PublicKey(payerPubkey);

  let totalLamports = 0;
  for (const r of recipients) {
    const lamports = Math.round(r.amount * LAMPORTS_PER_SOL);
    totalLamports += lamports;
    tx.add(
      SystemProgram.transfer({
        fromPubkey: tx.feePayer,
        toPubkey: new PublicKey(r.address),
        lamports
      })
    );
  }

  return {
    transaction: tx,
    totalSol: totalLamports / LAMPORTS_PER_SOL,
    recipientCount: recipients.length
  };
}

/**
 * Generates a standard Solana Blink Action link.
 */
export function generateBlinkActionUrl(actionEndpoint, params = {}) {
  const url = new URL(actionEndpoint);
  for (const [key, val] of Object.entries(params)) {
    url.searchParams.set(key, String(val));
  }
  return `solana-action:${url.toString()}`;
}
