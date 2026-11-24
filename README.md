# OFFSHORE

**Live**

- Site: https://offshoreprivacy.fun
- X: https://x.com/OFFSHOREpriv
- CA: `FeQ1TC4weyDVTUzfSSACQpoDLybTFsrg5NtcFAwbpump`

Take your bags offshore. Move any Solana coin you hold into Privacy Rings in one click; your wallet shows 0, and only your key can read what you keep offshore. Bring it back any time.

- `index.html`, `js/`: the site. The app bundle in `js/` is built with esbuild.
- `api/`: Vercel functions. RPC proxy (`rpc`), pass-through to the Privacy Rings indexer and prover (`px`), wallet coins (`bags`), coin info (`meta`), live numbers (`stats`), `config`, and the buy-and-burn (`burn`).
- `.github/workflows/burn.yml`: calls `/api/burn` every hour (set the repo variable `SITE_URL`).

Environment variables: `HELIUS_API_KEY`, `FEE_SECRET` (64 hex chars, the fee wallet's seed), `OFFSHORE_MINT` (after launch).

Built on Solana Privacy Rings with `@heliuslabs/zolana`. Not affiliated with Helius.
