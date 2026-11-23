// JSON-RPC proxy to Helius mainnet with a method allowlist. The key stays on the server.
import { rpcUrl, RING, REGISTRY } from './_lib.js';

const ALLOW = new Set([
  'getAccountInfo', 'getMultipleAccounts', 'getBalance', 'getLatestBlockhash', 'getSlot', 'getBlockHeight',
  'getEpochInfo', 'getMinimumBalanceForRentExemption', 'getTokenAccountBalance', 'getTokenAccountsByOwner',
  'getSignatureStatuses', 'simulateTransaction', 'sendTransaction', 'getTransaction', 'getProgramAccounts',
  'getFeeForMessage', 'getBlockTime', 'getGenesisHash', 'getVersion', 'getTokenSupply',
]);

function ok(call) {
  if (!call || typeof call !== 'object' || !ALLOW.has(call.method)) return false;
  if (call.method === 'getProgramAccounts') {
    const p = Array.isArray(call.params) ? call.params[0] : null;
    return p === RING || p === REGISTRY;
  }
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.statusCode = 405; return res.end('POST only'); }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const calls = Array.isArray(body) ? body : [body];
  if (!calls.length || calls.length > 20 || !calls.every(ok)) {
    res.statusCode = 400;
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ jsonrpc: '2.0', id: body && body.id || null, error: { code: -32601, message: 'method not allowed' } }));
  }
  try {
    const r = await fetch(rpcUrl(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const text = await r.text();
    res.statusCode = r.status;
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 'no-store');
    res.end(text);
  } catch (e) {
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'rpc unreachable' } }));
  }
}
