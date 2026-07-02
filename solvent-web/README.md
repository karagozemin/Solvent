<h1 align="center">Solvent Web</h1>

<p align="center">
  The frontend for <a href="../README.md"><b>Solvent</b></a> — a hand-crafted
  landing page and prove console for zero-knowledge proof-of-reserves on Stellar.
</p>

<p align="center">
  <a href="../README.md">← Project README</a> ·
  <a href="../ARCHITECTURE.md">Architecture →</a> ·
  <a href="../DEPLOYMENT.md">Live deployment →</a>
</p>

---

## What this is

A React + TypeScript + Vite single-page app that presents Solvent and lets a
visitor follow a reserve proof from a DKIM-signed email to an on-chain
attestation. It is **not** a generic template — the UI is bespoke: a custom
`DarkVeil` animated background, a hero, and a prove console wired to the live
testnet contract.

| | |
|---|---|
| **Stack** | React 18 · TypeScript · Vite |
| **Lint** | Oxlint (`.oxlintrc.json`) |
| **Contract binding** | `src/solvent.ts` — talks to the deployed `mint_guard` |
| **Signature UI** | `DarkVeil` animated background + custom hero |

---

## Run it

```bash
npm install
npm run dev        # start Vite dev server (HMR)
npm run build      # type-check + production build
npm run preview    # serve the production build locally
npm run lint       # Oxlint
```

Then open the printed localhost URL.

---

## Source map

| path | role |
|------|------|
| `src/main.tsx` | app entry |
| `src/App.tsx` | landing + prove console |
| `src/DarkVeil.tsx` / `.css` | custom animated background |
| `src/solvent.ts` | contract client (network, contract ID, calls) |
| `src/assets/`, `public/` | hero art, icons, favicon |
| `index.html` | Vite HTML entry |
| `vite.config.ts` | build config |

---

## How it fits the system

```
 user ──▶ solvent-web (this app) ──▶ mint_guard (Soroban) ──▶ Stellar testnet
                       reads attestations / submits prove_reserve
```

The app is the human-facing surface over the same protocol documented in
[ARCHITECTURE.md](../ARCHITECTURE.md). The contract it targets is the live testnet
deployment in [DEPLOYMENT.md](../DEPLOYMENT.md).

---

## Notes

- Proving itself runs off-chain (RSA-2048 in-circuit is heavy); the frontend
  submits the resulting proof + journal. Client-side WASM proving is roadmap.
- The `DarkVeil` background is intentionally custom — this UI is meant to feel
  built, not generated.
