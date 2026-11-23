// Shared helpers. Keys only ever come from env vars.
import crypto from 'node:crypto';

export const RING = 'ring1GaLCuJnkUMVkX2JeZLTTX17wKsV4fZmPVzXANW';
export const REGISTRY = 'regy3WAeRXMYuMYxr5iK3Bf9Arr3PcxGxyzAddbiqDQ';
export const TREE = '777pvSGe5LaBd9nCczvE2FXEauiwtfGJ5XRpjKyniGor';
export const SOL = 'So11111111111111111111111111111111111111112';
export const TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN22 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const FEE_BPS = 50;
// Every trip offshore lists this address (read-only, no key exists for it) so trips can be counted on-chain.
export const TAG = 'BPcbHZiMc8iuT5kKxFN3ygMTofMQwvR4y4nMBdSc4FPq';

export function rpcUrl() {
  const k = process.env.HELIUS_API_KEY;
  if (!k) throw new Error('HELIUS_API_KEY missing');
  return 'https://mainnet.helius-rpc.com/?api-key=' + k;
}

export async function rpc(method, params) {
  const r = await fetch(rpcUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(method + ': ' + (j.error.message || JSON.stringify(j.error)));
  return j.result;
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function b58(bytes) {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let s = '';
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b === 0) s = '1' + s; else break; }
  return s;
}
export function isAddress(s) {
  return typeof s === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
}

// 32-byte seed for the fee wallet, from FEE_SECRET (64 hex chars).
export function feeSeed() {
  const h = (process.env.FEE_SECRET || '').trim();
  if (!/^[0-9a-fA-F]{64}$/.test(h)) return null;
  return Buffer.from(h, 'hex');
}
export function feeAddress() {
  const seed = feeSeed();
  if (!seed) return '';
  const pkcs8 = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]);
  const key = crypto.createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
  const spki = crypto.createPublicKey(key).export({ format: 'der', type: 'spki' });
  return b58(spki.subarray(spki.length - 32));
}
export function mint() {
  const m = (process.env.OFFSHORE_MINT || '').trim();
  return isAddress(m) ? m : '';
}
export function send(res, code, body, cache) {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', cache || 'no-store');
  res.end(JSON.stringify(body));
}
