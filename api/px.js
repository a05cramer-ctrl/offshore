// Pass-through to the Privacy Rings indexer, prover and prover policy hosts.
// They send no CORS headers, so the browser reaches them through this function.
// Prover requests are encrypted in the browser to the prover's enclave; this function only forwards bytes.
export const config = { runtime: 'edge' };

const HOSTS = {
  indexer: 'https://dgcj4pjarvo65.cloudfront.net',
  prover: 'https://d3ky2kt0ntqxt1.cloudfront.net',
  policy: 'https://d3gbdb0egjwcw9.cloudfront.net',
};
const DROP = ['host', 'cookie', 'origin', 'referer', 'connection', 'content-length', 'accept-encoding'];

export default async function handler(req) {
  const u = new URL(req.url);
  const base = HOSTS[u.searchParams.get('t') || ''];
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
  if (req.method === 'POST') init.body = await req.arrayBuffer();
  // The indexer and prover answer only with a Helius API key; it is added here so it never reaches the browser.
  let url = base + p;
  const key = process.env.HELIUS_API_KEY;
  if (key && u.searchParams.get('t') !== 'policy') url += (url.includes('?') ? '&' : '?') + 'api-key=' + encodeURIComponent(key);
  let r;
  try { r = await fetch(url, init); } catch { return new Response('upstream unreachable', { status: 502 }); }
  const out = new Headers();
  r.headers.forEach((v, k) => {
    const key = k.toLowerCase();
    if (['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'set-cookie'].includes(key)) return;
    out.set(k, v);
  });
  out.set('cache-control', 'no-store');
  return new Response(r.body, { status: r.status, headers: out });
}
