// The coins a wallet holds right now: balances from the chain, names from Helius, prices from Jupiter.
import { rpc, rpcUrl, isAddress, send, SOL, TOKEN, TOKEN22 } from './_lib.js';

async function prices(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    try {
      const r = await fetch('https://lite-api.jup.ag/price/v3?ids=' + ids.slice(i, i + 50).join(','), { signal: AbortSignal.timeout(6000) });
      if (!r.ok) continue;
      const j = await r.json();
      for (const [k, v] of Object.entries(j || {})) if (v && typeof v.usdPrice === 'number') out[k] = v.usdPrice;
    } catch {}
  }
  return out;
}
async function meta(ids) {
  const out = {};
  if (!ids.length) return out;
  try {
    const r = await fetch(rpcUrl(), {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAssetBatch', params: { ids } }),
    });
    const j = await r.json();
    for (const a of j.result || []) {
      if (!a || !a.id) continue;
      const m = (a.content && a.content.metadata) || {};
      const img = (a.content && a.content.links && a.content.links.image) || '';
      out[a.id] = { symbol: (a.token_info && a.token_info.symbol) || m.symbol || '', name: m.name || '', image: typeof img === 'string' && img.startsWith('https://') ? img : '' };
    }
  } catch {}
  return out;
}

export default async function handler(req, res) {
  const wallet = String((req.query && req.query.wallet) || '');
  if (!isAddress(wallet)) return send(res, 400, { error: 'wallet' });
  try {
    const [lamports, a, b] = await Promise.all([
      rpc('getBalance', [wallet]),
      rpc('getTokenAccountsByOwner', [wallet, { programId: TOKEN }, { encoding: 'jsonParsed' }]),
      rpc('getTokenAccountsByOwner', [wallet, { programId: TOKEN22 }, { encoding: 'jsonParsed' }]),
    ]);
    const rows = [];
    for (const [list, program] of [[a.value, TOKEN], [b.value, TOKEN22]]) {
      for (const it of list || []) {
        const info = it.account && it.account.data && it.account.data.parsed && it.account.data.parsed.info;
        if (!info || !info.tokenAmount) continue;
        const raw = info.tokenAmount.amount;
        if (!raw || raw === '0' || info.tokenAmount.decimals === 0 || info.state === 'frozen') continue;
        rows.push({ mint: info.mint, program, account: it.pubkey, amount: raw, decimals: info.tokenAmount.decimals, ui: Number(info.tokenAmount.uiAmountString) });
      }
    }
    rows.sort((x, y) => y.ui - x.ui);
    const top = rows.slice(0, 120);
    const ids = [...new Set(top.map((r) => r.mint))];
    const [px, md] = await Promise.all([prices([SOL, ...ids]), meta(ids)]);
    for (const r of top) {
      const m = md[r.mint] || {};
      r.symbol = m.symbol || r.mint.slice(0, 4);
      r.name = m.name || '';
      r.image = m.image || '';
      r.usd = px[r.mint] != null ? px[r.mint] * r.ui : null;
    }
    top.sort((x, y) => (y.usd || 0) - (x.usd || 0));
    send(res, 200, { wallet, sol: lamports.value, solUsd: px[SOL] || null, bags: top.slice(0, 60) });
  } catch (e) {
    send(res, 502, { error: 'could not read the wallet' });
  }
}
