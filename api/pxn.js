// Node-runtime pass-through to the Privacy Rings indexer and prover (same rules as px.js).
const HOSTS = {
  indexer: 'https://dgcj4pjarvo65.cloudfront.net',
  prover: 'https://d3ky2kt0ntqxt1.cloudfront.net',
};
export default async function handler(req, res) {
  const base = HOSTS[String(req.query.t || '')];
  const p = String(req.query.p || '/');
  if (!base || !p.startsWith('/') || p.includes('..') || p.length > 600) { res.statusCode = 400; return res.end('bad request'); }
  const key = process.env.HELIUS_API_KEY;
  let url = base + p;
  if (key && req.query.k !== '0') url += (url.includes('?') ? '&' : '?') + 'api-key=' + encodeURIComponent(key);
  const init = { method: req.method === 'POST' ? 'POST' : 'GET', headers: { 'content-type': req.headers['content-type'] || 'application/json', 'user-agent': req.headers['user-agent'] || 'offshore' } };
  if (init.method === 'POST') init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  try {
    const r = await fetch(url, init);
    const buf = Buffer.from(await r.arrayBuffer());
    res.statusCode = r.status;
    res.setHeader('content-type', r.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('cache-control', 'no-store');
    res.end(buf);
  } catch (e) { res.statusCode = 502; res.end('upstream unreachable'); }
}
