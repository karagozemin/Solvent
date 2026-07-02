<h1 align="center">mint_guard — Soroban Groth16 Verifier</h1>

<p align="center">
  The on-chain half of <a href="../../README.md"><b>Solvent</b></a>. Verifies a
  Groth16 proof with Stellar's <b>native BN254 pairing</b>, enforces four
  soundness bindings, and records a balance-hiding attestation.
</p>

<p align="center">
  <a href="../../README.md">← Project README</a> ·
  <a href="../../ARCHITECTURE.md">Architecture diagrams →</a> ·
  <a href="../../DEPLOYMENT.md">Live deployment →</a>
</p>

---

## At a glance

| | |
|---|---|
| **Language** | Rust (Soroban SDK) |
| **Verifier** | Groth16 over BN254, `env.crypto().bn254().pairing_check` |
| **Poseidon** | host-side sponge, byte-for-byte matched to circomlib `Poseidon(2)` |
| **WASM** | ~10 KB |
| **Tests** | `cargo test -p mint_guard` → **8/8** |
| **Live** | `CDPPM3EWAVVEE23LQVANCCRI4ERRBGJT4OUDTR46NRVDZFKAKDGYTDL5` (testnet) |

---

## The verification equation

`verify_proof` rearranges Groth16 so the pairing product equals one:

```
e(-A, B) · e(alpha, beta) · e(vk_x, gamma) · e(C, delta) == 1
        where   vk_x = IC[0] + Σ pub[i] · IC[i+1]
```

Two classic silent-failure traps are handled explicitly:

- **G1 negation over the base field.** `-A` negates Y mod **q** (`Fq`), *not* mod
  the scalar field `r`. Solvent pins `q` and negates via `U256`. A `debug_vk_x`
  helper lets tests bisect this in isolation.
- **Point / scalar encoding.** `vk_x` uses `Bn254Fr` scalars and big-endian G1/G2
  layouts with the EIP-197 `[c1, c0]` swap done in the vkey exporter.

> Full pairing diagram → [ARCHITECTURE §6](../../ARCHITECTURE.md#6--on-chain-verification--the-groth16-pairing)

---

## `prove_reserve` — checks-effects

All four checks pass **before** any state is written. Any failure reverts with a
typed error; the ledger is left untouched.

| # | Check | Fails with |
|---|-------|------------|
| 1 | `pairing_check(proof)` valid | `InvalidProof` (#4) |
| 2 | `pubkey_hash` == pinned gmail DKIM key | `WrongPubkey` (#5) |
| 3 | `sender_hash` ∈ issuer registry | `IssuerNotRegistered` (#6) |
| 4 | `nullifier` unused | `NullifierUsed` (#7) |
| → | **EFFECTS:** store nullifier + attestation, emit `Reserve{…}` | — |

**Full error surface:** `NotInitialized` (#1), `AlreadyInitialized` (#2),
`BadPublicInputLen` (#3), `InvalidProof` (#4), `WrongPubkey` (#5),
`IssuerNotRegistered` (#6), `NullifierUsed` (#7).

> State-machine + storage diagrams → [ARCHITECTURE §7–§8](../../ARCHITECTURE.md#7--prove_reserve--the-checks-effects-state-machine)

---

## Interface

| fn | who | effect |
|----|-----|--------|
| `init(admin, vkey, pubkey_hash)` | deployer | one-time config (instance storage) |
| `register_issuer(sender_hash, name)` | admin | onboard an issuer (persistent) |
| `set_vkey(vkey)` / `set_pubkey_hash(h)` | admin | rotate verification key / DKIM key |
| `prove_reserve(proof, pub_signals)` | anyone | verify + attest (the core call) |
| `get_attestation(sender_hash)` | anyone | read `{ threshold, timestamp, nullifier }` |

---

## Storage

| Key | Lifetime | Value |
|-----|----------|-------|
| `Admin`, `Vkey`, `PubkeyHash` | instance | singleton config |
| `Issuer(sender_hash)` | persistent | `IssuerInfo` |
| `Nullifier(nullifier)` | persistent | `bool` (anti-replay set) |
| `Attestation(sender_hash)` | persistent | `{ threshold, timestamp, nullifier }` |

---

## Test & build

```bash
cargo test -p mint_guard        # 8/8: pairing, tamper-reject, registry, replay, wrong-key
soroban contract build          # -> target/wasm32-unknown-unknown/release/mint_guard.wasm
```

Tests run the **real** BN254 pairing natively and consume an auto-generated
fixture built from a real proof (`circuits/scripts/gen_contract_fixtures.js`) —
no hand-copied hex.

**Test coverage:** happy-path verify · tampered-public reject · unregistered
issuer reject · wrong-pubkey reject · replay reject · `vk_x` bisection ·
negation-is-identity · real-proof-true.

---

## Deploy

See [`scripts/deploy_init.sh`](scripts/deploy_init.sh) (deploy + init + register)
and [`scripts/prove.sh`](scripts/prove.sh) (format BN254 args + submit
`prove_reserve`). Live contract and full tx chain in
[DEPLOYMENT.md](../../DEPLOYMENT.md).
