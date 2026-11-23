import { feeAddress, mint, send, RING, REGISTRY, TREE, FEE_BPS, TAG } from './_lib.js';
export default async function handler(req, res) {
  send(res, 200, { feeWallet: feeAddress(), mint: mint(), feeBps: FEE_BPS, ring: RING, registry: REGISTRY, tree: TREE, tag: TAG }, 'public, s-maxage=60');
}
