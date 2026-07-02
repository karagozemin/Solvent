<p align="center">
  <img src="solvent.png" alt="Solvent" width="200">
</p>

<h1>Solvent</h1>

**Zero-knowledge proof-of-reserves on Stellar.** An issuer proves — from a real,
DKIM-signed bank email — that their reserve is **at least** some threshold,
**without revealing the actual balance**, and a Soroban contract verifies the
Groth16 proof on-chain using Stellar's native BN254 pairing.

> "My reserves are ≥ $1,000,000" — provable, verifiable on-chain, exact amount
> never disclosed.

---

## Why this is not a toy

The bank's **real DKIM RSA-2048 signature is verified *inside* the SNARK**. The
contract never trusts a self-declared number — it trusts only:

1. a valid Groth16 proof (checked via `env.crypto().bn254().pairing_check`),
2. that the signing key hash matches the known **gmail.com DKIM key**,
3. that the sender address is a **registered issuer**,
4. that the email hasn't been used before (**anti-replay nullifier**).

Everything the proof asserts is bound to the signature. See
[Soundness model](#soundness-model).

---

## How it works

```
  ┌─────────────────┐     DKIM-signed .eml      ┌────────────────────┐
  │  Issuer's inbox │ ────────────────────────▶ │  Prover (off-chain)│
  │  (real Gmail)   │                           │  circom + snarkjs  │
  └─────────────────┘                           └─────────┬──────────┘
                                                          │ Groth16 proof
                                                          │ + public journal
                                                          ▼
                                            ┌──────────────────────────┐
                                            │  mint_guard (Soroban)    │
                                            │  BN254 pairing_check      │
                                            │  registry + attestation   │
                                            └──────────────────────────┘
```

The circuit ([`circuits/reserve.circom`](circuits/reserve.circom)):
- verifies the DKIM RSA-2048 signature over the email (SHA-256 + RSA in-circuit),
- extracts the balance from the **signed body** and proves `balance ≥ threshold`
  **without exposing the balance**,
- extracts the **From address** from the **signed header** via in-circuit regex,
- emits a public journal that binds the proof to the real sender & key.

The contract ([`contracts/mint_guard`](contracts/mint_guard)):
- verifies the proof with the native BN254 host functions,
- enforces the four checks above (checks-effects order),
- records a per-issuer attestation `(threshold, timestamp)`.

---

## Public journal (7 signals)

snarkjs order — circuit outputs first, then public inputs:

| idx | signal          | meaning                                                        |
|-----|-----------------|----------------------------------------------------------------|
| 0   | `pubkey_hash`   | Poseidon hash of the RSA key that signed it → **which provider** |
| 1   | `sender_hash`   | Poseidon of the full From address (from signed header) → **who** |
| 2   | `nullifier`     | `Poseidon²(signature)` → anti-replay (per-email uniqueness)     |
| 3   | `threshold_out` | echo of threshold                                              |
| 4   | `timestamp_out` | echo of timestamp                                              |
| 5   | `threshold`     | the reserve floor proven (public input)                        |
| 6   | `timestamp`     | email `Date` as unix seconds (public input)                    |

The **balance itself is never in the journal** — only the threshold it clears.

---

## Soundness model

| Concern | Bound by |
|---|---|
| Forged / self-signed key | `pubkey_hash` compared on-chain to the pinned gmail DKIM key hash |
| Spoofed sender | `sender_hash` extracted by regex over the **DKIM-signed** header (not prover-supplied) |
| Replay of an old email | `nullifier = Poseidon²(signature)`, stored in a used-set |
| Fake balance | balance read from the **signed body**; only `balance ≥ threshold` is provable |

**Onboarding is centralized; correctness is not.** An admin registers *which*
gmail issuers may participate (a KYC-like step), but the admin **cannot forge a
reserve** — an attestation is written only when a valid ZK proof passes.
Correctness lives in the math, not the operator.

---

## Repository layout

```
circuits/          reserve.circom, build pipeline, prover scripts, fixtures
contracts/
  mint_guard/      Soroban Groth16 verifier + issuer registry (Rust)
```

- [`circuits/README.md`](circuits/README.md) — circuit internals, locked
  Poseidon/serialization parameters, build steps.

---

## Build & test

**Circuit + proof (Node + circom + snarkjs):**
```bash
cd circuits
npm install
npm run build                 # compile -> trusted setup -> vkey
node scripts/gen_input.js fixtures/gmail_balance_real.eml 1000000
node node_modules/snarkjs/cli.js wtns calculate build/reserve_js/reserve.wasm build/input.json build/witness.wtns
node node_modules/snarkjs/cli.js groth16 prove build/reserve.zkey build/witness.wtns build/proof.json build/public.json
node node_modules/snarkjs/cli.js groth16 verify build/verification_key.json build/public.json build/proof.json   # -> OK!
```

**Contract (Rust / Soroban, native tests run the real BN254 pairing):**
```bash
cargo test -p mint_guard      # 8/8: pairing, tamper-reject, registry, replay, wrong-key
```

The contract test consumes an auto-generated fixture built from the real proof
(`circuits/scripts/gen_contract_fixtures.js`) — no hand-copied hex.

---

## Status

| Component | State |
|---|---|
| DKIM + balance≥threshold circuit (BN254/Groth16) | ✅ |
| Real Gmail proof, `snarkjs verify` | ✅ |
| On-chain `pairing_check = true` (native) | ✅ |
| Soundness bindings (pubkey / sender / nullifier) | ✅ |
| Issuer registry + attestation protocol | ✅ 8/8 tests |
| **WASM build + testnet deploy** | ✅ **LIVE** |
| On-chain `pairing_check` under 100M budget | ✅ verified on testnet |
| Replay rejection + attestation, live | ✅ |

**Live on Stellar testnet** — contract
`CDPPM3EWAVVEE23LQVANCCRI4ERRBGJT4OUDTR46NRVDZFKAKDGYTDL5`. Verifiable tx chain
(deploy / init / register / prove_reserve) in **[DEPLOYMENT.md](DEPLOYMENT.md)**.

---

## Honesty notes

- **Trusted setup is a single-contributor dev ceremony.** Production needs a real
  multi-party Powers-of-Tau + phase-2 ceremony.
- **Gmail as a stand-in issuer:** because gmail.com is a shared domain, the
  circuit binds the **full From address**, not just the domain. A dedicated-domain
  issuer (e.g. `chase.com`) could bind at the domain level.
- **DKIM key rotation:** the expected gmail pubkey hash lives in storage with an
  admin setter; Google key rotation is a setter call, not a redeploy. Auto
  DNS-sync is roadmap.
- **Proving runs off-chain / backend** — RSA-2048 in-circuit is heavy. Client-side
  WASM proving is roadmap.
- **Multi-issuer registry** is implemented; the demo showcases a single issuer.

---

## License

See repository. Built for the Stellar ecosystem (Soroban, Protocol 25+ BN254).
