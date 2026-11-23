// Buy and burn: every SOL fee the site has collected buys $OFFSHORE on the open market, then burns it.
// Runs hourly. Does nothing until OFFSHORE_MINT is set. Anyone may call it; it can only buy and burn.
import { Connection, Keypair, VersionedTransaction, PublicKey, Transaction, ComputeBudgetProgram } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, createBurnCheckedInstruction, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { rpcUrl, feeSeed, mint, send, SOL } from './_lib.js';

const RESERVE = 10_000_000;   // 0.01 SOL stays for transaction fees
const MIN_BUY = 20_000_000;   // wait until at least 0.02 SOL of fees has built up
const JUP = 'https://lite-api.jup.ag/swap/v1';

async function confirm(conn, sig) {
  for (let i = 0; i < 40; i++) {
    const st = (await conn.getSignatureStatuses([sig])).value[0];
    if (st && st.err) throw new Error('transaction failed');
    if (st && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized')) return;
    await new Promise((r) => setTimeout(r, 1200));
  }
  throw new Error('not confirmed in time');
}

export default async function handler(req, res) {
  const m = mint();
  const seed = feeSeed();
  if (!m) return send(res, 200, { ok: true, skipped: 'OFFSHORE_MINT not set yet' });
  if (!seed) return send(res, 200, { ok: true, skipped: 'FEE_SECRET not set' });
  const out = { ok: true };
  try {
    const conn = new Connection(rpcUrl(), 'confirmed');
    const kp = Keypair.fromSeed(seed);
    const mintPk = new PublicKey(m);
    const info = await conn.getAccountInfo(mintPk);
    if (!info) return send(res, 200, { ok: true, skipped: 'mint not found' });
    const program = info.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    const decimals = info.data[44];
    const ata = getAssociatedTokenAddressSync(mintPk, kp.publicKey, false, program);

    // 1. buy with the fees collected so far
    const bal = await conn.getBalance(kp.publicKey);
    const spend = bal - RESERVE;
    if (spend >= MIN_BUY) {
      const q = await (await fetch(`${JUP}/quote?inputMint=${SOL}&outputMint=${m}&amount=${spend}&slippageBps=300`)).json();
      if (!q || q.error || !q.outAmount) throw new Error('no route for the buy');
      const sw = await (await fetch(`${JUP}/swap`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quoteResponse: q, userPublicKey: kp.publicKey.toBase58(), wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, prioritizationFeeLamports: 200000 }),
      })).json();
      if (!sw || !sw.swapTransaction) throw new Error('swap build failed');
      const tx = VersionedTransaction.deserialize(Buffer.from(sw.swapTransaction, 'base64'));
      tx.sign([kp]);
      const sig = await conn.sendRawTransaction(tx.serialize(), { maxRetries: 5 });
      await confirm(conn, sig);
      out.bought = { sol: spend / 1e9, sig };
    } else {
      out.waiting = { sol: Math.max(0, spend) / 1e9, needs: MIN_BUY / 1e9 };
    }

    // 2. burn everything the fee wallet holds
    let have = 0n;
    try { have = BigInt((await conn.getTokenAccountBalance(ata)).value.amount); } catch {}
    if (have > 0n) {
      const tx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 20000 }),
        createBurnCheckedInstruction(ata, mintPk, kp.publicKey, have, decimals, [], program),
      );
      tx.feePayer = kp.publicKey;
      tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
      tx.sign(kp);
      const sig = await conn.sendRawTransaction(tx.serialize(), { maxRetries: 5 });
      await confirm(conn, sig);
      out.burned = { amount: Number(have) / 10 ** decimals, sig };
    }
    send(res, 200, out);
  } catch (e) {
    send(res, 200, { ok: false, error: String(e && e.message || e).slice(0, 160), ...out });
  }
}
