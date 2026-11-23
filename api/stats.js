// Live numbers, all read from the chain.
import { rpc, send, feeAddress, mint, TREE, TAG } from './_lib.js';
export default async function handler(req, res) {
  const out = { poolSol: null, moves: null, burned: null, feeWallet: feeAddress(), mint: mint(), tag: TAG };
  const jobs = [rpc('getBalance', [TREE]).then((r) => { out.poolSol = r.value / 1e9; }).catch(() => {})];
  jobs.push(rpc('getSignaturesForAddress', [TAG, { limit: 1000 }]).then((r) => { out.moves = (r || []).filter((s) => !s.err).length; out.movesCapped = (r || []).length >= 1000; }).catch(() => {}));
  if (out.mint) {
    jobs.push(rpc('getTokenSupply', [out.mint]).then((r) => { out.burned = Math.max(0, 1e9 - Number(r.value.uiAmountString)); }).catch(() => {}));
  }
  await Promise.all(jobs);
  send(res, 200, out, 'public, s-maxage=30, stale-while-revalidate=120');
}
