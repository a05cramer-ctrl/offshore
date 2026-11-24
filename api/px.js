// Pass-through to the Privacy Rings indexer, prover and prover policy.
// The indexer and prover go through Helius's own Privacy Rings API (one base for both); the bare
// CloudFront hosts block server-to-server requests. The Helius key is added here so it never
// reaches the browser. Prover requests are encrypted in the browser to the prover's enclave;
// this function only forwards bytes.
//
// The toolkit (@heliuslabs/zolana 0.8.0-alpha) speaks the indexer's older wire format. Helius's
// public API (docs of Nov 2026) nests items one level deeper and renames the page cursor, so the
// three paged methods are translated here:
//   request  params.cursor            -> params.paginationToken (the cursor wraps the token)
//   response result.data[].events     -> result.transactions
//            result.data[].outputs    -> result.matches          (getEncryptedUtxosByTags)
//            result.paginationToken   -> result.nextCursor       (base64 of the token)
export const config = { runtime: 'edge' };

const SPR = process.env.SPR_BASE || 'https://mainnet.helius-rpc.com/v1/spr';
const HOSTS = {
  indexer: SPR,
  prover: SPR,
  policy: 'https://d3gbdb0egjwcw9.cloudfront.net',
};
const DROP = ['host', 'cookie', 'origin', 'referer', 'connection', 'content-length', 'accept-encoding'];
const PAGED = new Set(['getShieldedTransactionsByTags', 'getShieldedTransactionsByNullifiers', 'getEncryptedUtxosByTags']);

const b64e = (s) => { let x = ''; for (const c of new TextEncoder().encode(s)) x += String.fromCharCode(c); return btoa(x); };
const b64d = (s) => { try { const x = atob(s); return new TextDecoder().decode(Uint8Array.from(x, (c) => c.charCodeAt(0))); } catch { return null; } };

function toPublic(body) {
  let call;
  try { call = JSON.parse(body); } catch { return { body, method: null }; }
  const method = call && typeof call.method === 'string' ? call.method : null;
  if (!PAGED.has(method) || !call.params || typeof call.params !== 'object') return { body, method };
  const params = { ...call.params };
  if (params.cursor != null) {
    const token = b64d(String(params.cursor));
    delete params.cursor;
    if (token) params.paginationToken = token;
  }
  return { body: JSON.stringify({ ...call, params }), method };
}

function toToolkit(method, json) {
  const res = json && json.result;
  if (!res || !Array.isArray(res.data)) return json;
  const out = { context: res.context };
  if (res.outputTreeId !== undefined && res.outputTreeId !== null) out.outputTreeId = res.outputTreeId;
  if (method === 'getEncryptedUtxosByTags') out.matches = res.data.flatMap((d) => d.outputs || []);
  else out.transactions = res.data.flatMap((d) => d.events || []);
  if (res.paginationToken) out.nextCursor = b64e(res.paginationToken);
  return { ...json, result: out };
}

export default async function handler(req) {
  const u = new URL(req.url);
  const target = u.searchParams.get('t') || '';
  const base = HOSTS[target];
  const p = u.searchParams.get('p') || '/';
  if (!base || !p.startsWith('/') || p.includes('..') || p.length > 600) return new Response('bad request', { status: 400 });
  if (!['GET', 'POST', 'HEAD'].includes(req.method)) return new Response('method', { status: 405 });
  const headers = new Headers();
  req.headers.forEach((v, k) => {
    const key = k.toLowerCase();
    if (DROP.includes(key) || key.startsWith('x-vercel') || key.startsWith('x-forwarded') || key.startsWith('x-real') || key.startsWith('cf-') || key.startsWith('sec-')) return;
    headers.set(k, v);
  });
  const init = { method: req.method, headers, redirect: 'manual' };
  let method = null;
  if (req.method === 'POST') {
    if (target === 'indexer') {
      const t = toPublic(await req.text());
      init.body = t.body;
      method = t.method;
    } else {
      init.body = await req.arrayBuffer();
    }
  }
  let url = base + p;
  const key = process.env.HELIUS_API_KEY;
  if (key && target !== 'policy') url += (url.includes('?') ? '&' : '?') + 'api-key=' + encodeURIComponent(key);
  let r;
  try { r = await fetch(url, init); } catch { return new Response('upstream unreachable', { status: 502 }); }
  if (target === 'indexer' && PAGED.has(method) && r.ok) {
    let json;
    try { json = await r.json(); } catch { return new Response('bad upstream answer', { status: 502 }); }
    return new Response(JSON.stringify(toToolkit(method, json)), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }
  const out = new Headers();
  r.headers.forEach((v, k) => {
    const name = k.toLowerCase();
    if (['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'set-cookie'].includes(name)) return;
    out.set(k, v);
  });
  out.set('cache-control', 'no-store');
  return new Response(r.body, { status: r.status, headers: out });
}
