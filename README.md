<p align="center">
  <img src="solvent.png" alt="Solvent" width="200">
</p>

<h1 align="center">Solvent</h1>

<p align="center">
  <b>Zero-knowledge proof-of-reserves on Stellar.</b><br>
  Prove your bank balance clears a threshold — <i>from a real DKIM-signed email</i> —<br>
  and let a Soroban contract verify it on-chain. The exact amount is never revealed.
</p>

<p align="center">
  <a href="#-live-on-stellar-testnet"><img alt="testnet" src="https://img.shields.io/badge/Stellar-testnet%20LIVE-1f6b45?style=flat-square"></a>
  <img alt="proof system" src="https://img.shields.io/badge/proof-Groth16%20%2F%20BN254-b5361f?style=flat-square">
  <img alt="verifier" src="https://img.shields.io/badge/verifier-native%20pairing__check-9a7b2c?style=flat-square">
  <img alt="tests" src="https://img.shields.io/badge/contract%20tests-8%2F8-1f6b45?style=flat-square">
</p>

<p align="center">
  <a href="ARCHITECTURE.md"><b>📐 Architecture (diagrams)</b></a> ·
  <a href="DEPLOYMENT.md"><b>⛓️ Live deployment</b></a> ·
  <a href="circuits/README.md"><b>🔬 Circuit internals</b></a>
</p>

---

> ### *"My reserves are ≥ \$1,000,000."*
> Provable. Verified on-chain. **The real balance never leaves your machine.**

---

## The problem

**Proof-of-reserves today is "trust me."** When an exchange, a fund, an OTC desk,
or a borrower claims *"we hold at least \$X"*, the counterparty has two bad options:

- **Believe a screenshot / PDF / a number on a dashboard** — trivially faked,
  reused, or photoshopped. This is exactly how FTX-style holes stay hidden until
  it's too late.
- **Demand a full audit / raw bank access** — slow, expensive, and it leaks the
  *exact* balance, account structure, and counterparties to whoever is checking.

So the market is stuck between **unverifiable claims** and **total disclosure**.
There is no way to prove *"my reserves clear this floor"* that is (a) cryptographically
sound, (b) privacy-preserving, and (c) checkable by anyone in seconds. That gap is
the problem Solvent closes.

---

## The solution

Solvent turns a signal that **already exists in every inbox** — the bank's
**DKIM-signed balance email** — into a trustless proof-of-reserves.

Instead of a human vouching for a number, a **zero-knowledge proof** vouches for
the bank's own cryptographic signature:

1. An **off-chain prover** verifies the provider's **RSA-2048 DKIM signature inside
   a SNARK**, reads the balance from the *signed* email body, and proves
   `balance ≥ threshold` — **without ever putting the balance in the proof.**
2. A **Soroban contract** verifies that Groth16 proof with Stellar's **native BN254
   pairing**, enforces four soundness bindings, and writes a public attestation.

The output is a public, on-chain claim — *"issuer X's reserves cleared \$Y at time
T"* — backed by the **bank's signature**, not by anyone's word, and revealing
**nothing but the floor that was cleared.**

```
  📧  DKIM-signed email  ──▶  ⚙️  ZK prover  ──▶  📜 proof (no balance)  ──▶  🛡️ Soroban  ──▶  ✅ attestation
     (balance visible here only)                                                (balance never arrives)
```

---

## Real-world fit (PMF)

The pain is concrete and the "email you already have" wedge is what makes it
adoptable — no new bank integration, no oracle, no custody of anyone's funds.

| Who | The claim they need to make | Today | With Solvent |
|-----|-----------------------------|-------|--------------|
| **Exchanges / custodians** | "user deposits are fully backed" | screenshots, periodic PDF audits | continuous, on-chain, balance-hiding attestation |
| **OTC desks / market makers** | "we can settle this trade" | trust + slow bank letters | instant `≥ threshold` proof before the trade |
| **Borrowers / DeFi collateral** | "I hold enough off-chain reserve" | full disclosure or nothing | prove the floor, hide the amount |
| **Funds / DAOs treasuries** | "treasury is solvent" | quarterly reports | anyone re-checks the proof in seconds |

**Why now:** Stellar Protocol 25+ ships a **native BN254 `pairing_check`**, so a
Groth16 verifier runs on-chain **under the 100M instruction budget** — cheap enough
to make per-claim proofs practical instead of a research demo. The distribution
wedge (DKIM is already on 100% of bank email) plus a real on-chain verifier is what
turns this from "nice idea" into a deployable product.

> *Onboarding is centralized (an admin decides **who** may register). Correctness is
> not — an attestation is written **only** when a valid ZK proof passes.*

---

## Technical workflow

How a claim goes from an inbox to an on-chain attestation, end to end. The
**trust boundary** is the prover: the raw email + exact balance never leave it —
only a proof and the 7-signal journal cross to the chain.

```
 ┌─────────────────────── OFF-CHAIN (prover, private) ───────────────────────┐   ┌────────── ON-CHAIN (public) ──────────┐
 │                                                                           │   │                                       │
 │  📧 .eml   ──▶  gen_input.js   ──▶  circom witness  ──▶  Groth16 prove    │   │   mint_guard.prove_reserve            │
 │  (DKIM-     parse header/body,    reserve.circom:      snarkjs → proof.json│   │   1. pairing_check(proof)  ✅          │
 │   signed)   RSA key, balance,     ① DKIM verify         + public.json      │──▶│   2. pubkey_hash == pinned gmail key  │
 │             threshold             ②④ balance≥threshold  (proof + journal)  │   │   3. sender_hash ∈ registry           │
 │                                   ⑤ sender_hash                            │   │   4. nullifier unused                 │
 │                                   ⑥ pubkey_hash  ⑦ nullifier               │   │   ──▶ store attestation + emit event  │
 │                                                                           │   │                                       │
 └───────────────────────────────────────────────────────────────────────────┘   └───────────────────────────────────────┘
       balance is VISIBLE here, and only here                                          balance NEVER arrives here
```

**Step by step:**

1. **Get the signal.** A provider (Gmail, a bank) sends a routine balance email.
   It is already **DKIM-signed** with the provider's RSA-2048 key — no new
   integration required.
2. **Build the witness.** `gen_input.js` parses the `.eml` into circuit inputs:
   the signed header + body bytes, the RSA public key, the balance substring
   location, and the target `threshold`.
3. **Prove (off-chain).** `reserve.circom` runs the [seven gates](#how-it-works):
   it verifies the DKIM signature in-circuit, reads the balance from the *signed*
   body, and proves `balance ≥ threshold`. snarkjs emits `proof.json` +
   `public.json` (the 7-signal journal). **The balance is not in either file.**
4. **Submit.** The proof + journal are sent to `mint_guard.prove_reserve` on
   Stellar. This is the only thing that crosses the trust boundary.
5. **Verify (on-chain).** The contract runs the native BN254 `pairing_check` and
   the four soundness bindings (proof valid · right provider · registered issuer ·
   fresh nullifier) in a strict checks-before-effects order.
6. **Attest.** On success it stores `{ threshold, timestamp, nullifier }` for the
   issuer and emits a `reserve` event. Anyone can now re-verify the claim — the
   exact balance was never disclosed.

> **See the whole system as diagrams → [ARCHITECTURE.md](ARCHITECTURE.md)**

---


## Why this isn't a demo toy

Most "proof-of-reserves" projects trust a number someone typed in. Solvent trusts
**only cryptography**. The contract accepts an attestation *only* when all four of
these hold — and every one of them is bound to the bank's real signature:

| # | Binding | What it stops |
|---|---------|---------------|
| 1 | **Valid Groth16 proof** via native `pairing_check` | garbage / fabricated proofs |
| 2 | **`pubkey_hash`** matches the pinned **gmail.com DKIM key** | forged / self-signed keys |
| 3 | **`sender_hash`** is a registered issuer (regex over the *signed* header) | sender spoofing |
| 4 | **`nullifier = Poseidon²(signature)`** is unused | replaying an old email |

**The real RSA-2048 DKIM signature is verified *inside the circuit*** — SHA-256 and
RSA, in constraints. The balance is read from the signed body, so it cannot be
faked; only the fact that it clears the threshold is ever provable.

> *Onboarding is centralized (an admin decides **who** may register). Correctness
> is not — an attestation is written **only** when a valid ZK proof passes. The
> admin cannot forge a reserve.*

---

## 🟢 Live on Stellar testnet

This is not a local test run — it is the chain itself.

| | |
|---|---|
| **Contract ID** | `CDPPM3EWAVVEE23LQVANCCRI4ERRBGJT4OUDTR46NRVDZFKAKDGYTDL5` |
| **Network** | Stellar Testnet (Protocol 25+, native BN254 / CAP-0074) |
| **Verifier** | Groth16 over BN254, `env.crypto().bn254().pairing_check` |
| **WASM size** | ~10 KB |

The whole project in **one transaction** — `prove_reserve` (`32117d2f…`):
a real Gmail DKIM email → Groth16 proof → on-chain `pairing_check = true`,
**under the 100M instruction budget**, emitting
`reserve(sender) = { threshold: 1,000,000, timestamp }` — balance never revealed.

**Every step has a verifiable tx hash → [DEPLOYMENT.md](DEPLOYMENT.md).**

---

## How it works

### The circuit — [`circuits/reserve.circom`](circuits/reserve.circom)
Seven constraint gates, all chained to one root of trust (the verified signature):

- **①** `EmailVerifier` — SHA-256 + RSA-2048 DKIM verification in-circuit.
- **②–④** carve the balance out of the **signed body** and prove
  `balance ≥ threshold` — *the balance itself is never output.*
- **⑤** regex the **From** address out of the **signed header** → `sender_hash`.
- **⑥** `pubkey_hash` = Poseidon of the RSA key that actually signed → *which provider*.
- **⑦** `nullifier` = `Poseidon²(signature)` → anti-replay.

> Gate-by-gate diagram → [ARCHITECTURE §4](ARCHITECTURE.md#4--inside-the-circuit--the-seven-gates)

### The contract — [`contracts/mint_guard`](contracts/mint_guard)
`prove_reserve` runs a strict **checks-effects** state machine: all four checks
pass *before* any state is written. The Groth16 equation is rearranged so the
pairing product equals one:

```
e(-A, B) · e(alpha, beta) · e(vk_x, gamma) · e(C, delta) == 1
```

Two classic silent-failure traps are handled explicitly: G1 negation over the
**base** field `q` (not the scalar field `r`), and correct `Bn254Fr` / EIP-197
point encoding.

> Verification + state-machine diagrams → [ARCHITECTURE §6–§7](ARCHITECTURE.md#6--on-chain-verification--the-groth16-pairing)

---

## The public journal (7 signals)

The **only** data that crosses from prover to chain. snarkjs order — outputs
first, then public inputs. **There is no `balance` field.**

| idx | signal | meaning |
|-----|--------|---------|
| 0 | `pubkey_hash` | Poseidon of the signing RSA key → **which provider** |
| 1 | `sender_hash` | Poseidon of the full From address → **who** |
| 2 | `nullifier` | `Poseidon²(signature)` → **anti-replay** |
| 3 | `threshold_out` | echo of threshold |
| 4 | `timestamp_out` | echo of timestamp |
| 5 | `threshold` | the reserve floor proven |
| 6 | `timestamp` | email `Date` as unix seconds |

> The balance is absent **by construction** — only the floor it clears is revealed.

---

## Build & test

**Circuit + proof** (Node + circom + snarkjs):
```bash
cd circuits
npm install
npm run build                 # compile → trusted setup → vkey
node scripts/gen_input.js fixtures/gmail_balance_real.eml 1000000
node node_modules/snarkjs/cli.js wtns calculate build/reserve_js/reserve.wasm build/input.json build/witness.wtns
node node_modules/snarkjs/cli.js groth16 prove build/reserve.zkey build/witness.wtns build/proof.json build/public.json
node node_modules/snarkjs/cli.js groth16 verify build/verification_key.json build/public.json build/proof.json   # -> OK!
```

**Contract** (Rust / Soroban — native tests run the *real* BN254 pairing):
```bash
cargo test -p mint_guard      # 8/8: pairing, tamper-reject, registry, replay, wrong-key
```

The contract test consumes an auto-generated fixture built from the real proof
(`circuits/scripts/gen_contract_fixtures.js`) — no hand-copied hex.

**Frontend** (React landing + prove console):
```bash
cd solvent-web && npm install && npm run dev
```

---

## Status

| Component | State |
|---|---|
| DKIM + `balance ≥ threshold` circuit (BN254/Groth16) | ✅ |
| Real Gmail proof, `snarkjs verify` | ✅ |
| On-chain `pairing_check = true` (native) | ✅ |
| Soundness bindings (pubkey / sender / nullifier) | ✅ |
| Issuer registry + attestation protocol | ✅ 8/8 tests |
| **WASM build + testnet deploy** | ✅ **LIVE** |
| `pairing_check` under 100M budget | ✅ verified on testnet |
| Replay rejection + attestation, live | ✅ |

---

## Repository layout

```
circuits/            reserve.circom, build pipeline, prover scripts, fixtures
contracts/
  mint_guard/        Soroban Groth16 verifier + issuer registry (Rust)
solvent-web/         React frontend (landing + prove console)
ARCHITECTURE.md      system design, all diagrams
DEPLOYMENT.md        live testnet contract + verifiable tx chain
```

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — **the full picture in diagrams** (trust
  boundaries, circuit gates, pairing, state machine, storage, threat model).
- [`circuits/README.md`](circuits/README.md) — circuit internals, locked
  Poseidon/serialization parameters, build steps.
- [`DEPLOYMENT.md`](DEPLOYMENT.md) — live contract ID + every verifiable tx hash.

---

## Honesty notes

- **Trusted setup is a single-contributor dev ceremony.** Production needs a real
  multi-party Powers-of-Tau + phase-2 ceremony.
- **Gmail as a stand-in issuer:** because `gmail.com` is a shared domain, the
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
