// Name, decimals, token program and price for a few mints (used for the coins a visitor keeps offshore).
import { rpc, rpcUrl, isAddress, send, SOL, TOKEN22, TOKEN } from './_lib.js';
export default async function handler(req, res) {
  const ids = String((req.query && req.query.mints) || '').split(',').filter(isAddress).slice(0, 40);
  if (!ids.length) return send(res, 200, { coins: {}, solUsd: null });
  const coins = {};
  try {
    const infos = await rpc('getMultipleAccounts', [ids, { encoding: 'base64', dataSlice: { offset: 44, length: 1 } }]);
    ids.forEach((id, i) => {
      const a = infos.value[i];
      if (id === SOL) { coins[id] = { symbol: 'SOL', name: 'Solana', image: '', decimals: 9, program: '' }; return; }
      if (!a || (a.owner !== TOKEN && a.owner !== TOKEN22)) return;
      coins[id] = { symbol: id.slice(0, 4), name: '', image: '', decimals: Buffer.from(a.data[0], 'base64')[0], program: a.owner };
    });
    const [md, px] = await Promise.all([
      fetch(rpcUrl(), { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(8000), body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAssetBatch', params: { ids: ids.filter((x) => x !== SOL) } }) }).then((r) => r.json()).catch(() => ({})),
      fetch('https://lite-api.jup.ag/price/v3?ids=' + [SOL, ...ids].join(','), { signal: AbortSignal.timeout(6000) }).then((r) => r.json()).catch(() => ({})),
    ]);
    for (const a of (md && md.result) || []) {
      if (!a || !coins[a.id]) continue;
      const m = (a.content && a.content.metadata) || {};
      const img = (a.content && a.content.links && a.content.links.image) || '';
      coins[a.id].symbol = (a.token_info && a.token_info.symbol) || m.symbol || coins[a.id].symbol;
      coins[a.id].name = m.name || '';
      coins[a.id].image = typeof img === 'string' && img.startsWith('https://') ? img : '';
    }
    for (const id of Object.keys(coins)) coins[id].usdPrice = px && px[id] && typeof px[id].usdPrice === 'number' ? px[id].usdPrice : null;
    send(res, 200, { coins, solUsd: px && px[SOL] ? px[SOL].usdPrice : null });
  } catch (e) {
    send(res, 502, { error: 'could not read the coins' });
  }
}
