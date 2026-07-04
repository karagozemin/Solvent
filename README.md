<p align="center">
  <img src="solvent.png" alt="Solvent" width="200">
</p>

<h1 align="center">Solvent</h1>

<p align="center">
  <b>Zero-knowledge proof-of-reserves on Stellar.</b><br>
  Prove your bank balance clears a threshold, <i>from a real DKIM-signed email</i>,<br>
  and let a Soroban contract verify it on-chain. The exact amount is never revealed.
</p>


<p align="center">
  <a href="#-live-on-stellar-testnet"><img alt="testnet" src="https://img.shields.io/badge/Stellar-testnet%20LIVE-1f6b45?style=flat-square"></a>
  <img alt="proof system" src="https://img.shields.io/badge/proof-Groth16%20%2F%20BN254-b5361f?style=flat-square">
  <img alt="verifier" src="https://img.shields.io/badge/verifier-native%20pairing__check-9a7b2c?style=flat-square">
  <img alt="tests" src="https://img.shields.io/badge/contract%20tests-8%2F8-1f6b45?style=flat-square">
  <a href="https://github.com/karagozemin/Solvent/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/karagozemin/Solvent/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/karagozemin/Solvent/releases/tag/v0.1.0"><img alt="reproducible build" src="https://img.shields.io/badge/build-reproducible%20%2B%20SLSA-1f6b45?style=flat-square"></a>
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

> **The ZK is load-bearing, not decorative.** Remove the zero-knowledge layer and
> the product is *physically impossible* — there is no non-ZK way to prove
> `balance ≥ threshold` from a bank's signed email **without revealing the balance
> itself**. The proof *is* the attestation; the privacy *is* the product.

---


## What is Solvent?

**Solvent is a zero-knowledge proof-of-reserves protocol on Stellar.** It lets
anyone prove that a bank balance clears a threshold — *"my reserves are ≥ \$X"* —
straight from a **real, DKIM-signed balance email**, and have a **Soroban smart
contract verify that proof on-chain**. The exact amount is never revealed; only
the fact that it clears the floor.

The trick is that every balance email your bank sends is already **cryptographically
signed** (DKIM, RSA-2048). Solvent verifies that signature *inside a zero-knowledge
circuit*, proves `balance ≥ threshold` without exposing the balance, and lets
Stellar's **native BN254 pairing** check the proof — producing a public, tamper-proof
attestation that a reserve floor was met.

In one line: **turn the bank's own email signature into a private, on-chain
proof-of-reserves — no oracle, no custody, no disclosure of the amount.**

- 🔒 **Private** — the balance stays on your machine; only the threshold is public.
- ⛓️ **On-chain & live** — verified by a Soroban contract on Stellar testnet.
- 🧾 **Trustless** — backed by the bank's real DKIM signature, not anyone's word.

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

## Solvent vs. the field

Solvent is not another mixer, not another on-chain audit. It proves an **external,
real-world fact** — a bank balance — while revealing nothing but the floor. Here is
where it sits against everything adjacent:

| Approach | What it actually proves | The gap Solvent closes |
|---|---|---|
| **Privacy pools / mixers** | *hides* amounts of **on-chain** funds | Solvent proves an **off-chain, real-world** fact (bank balance), not on-chain movement |
| **On-chain PoR (Merkle-sum trees)** | you *hold* some tokens **on-chain** | Solvent proves the **off-chain fiat reserves** that are supposed to back them |
| **zkKYC / identity proofs** | *who you are* from a signed credential | Solvent proves *how solvent you are* from a signed **balance** — same DKIM trick, financial fact |
| **Audit PDFs / attestation letters** | a **human** vouches for a number | Solvent trusts the **bank's cryptographic DKIM signature** — no human in the loop |
| **Oracles / bank API integrations** | a third party *reports* your balance | Solvent needs **no integration** — it consumes an email the bank already sends, and reveals **nothing** |

**The one-line difference:** everyone else either hides on-chain money, trusts a
human, or leaks the amount. Solvent proves an **off-chain fiat reserve floor**,
from a signature the bank **already produces**, revealing **only the floor**.

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
        OFF-CHAIN  (prover — private, balance visible here and ONLY here)
  ┌──────────────┐     ┌──────────────────┐     ┌──────────────────────┐     ┌──────────────────┐
  │  📧 .eml     │     │  gen_input.js    │     │  circom witness      │     │  Groth16 prove   │
  │  (DKIM-      │ ──▶ │  parse header/   │ ──▶ │  reserve.circom      │ ──▶ │  snarkjs →       │
  │   signed)    │     │  body, RSA key,  │     │  (7 gates, below)    │     │  proof.json +    │
  │              │     │  balance, thresh │     │                      │     │  public.json     │
  └──────────────┘     └──────────────────┘     └──────────────────────┘     └────────┬─────────┘
                                                                                       │  proof + journal
   circom gates:  ① DKIM verify  ② read balance  ③ balance ≥ threshold                 │  (no balance)
                  ④ threshold echo  ⑤ sender_hash  ⑥ pubkey_hash  ⑦ nullifier          ▼
  ───────────────────────────────────────────────────────────────────────  trust boundary  ──────────
                                                                                       │
        ON-CHAIN  (public — balance NEVER arrives here)                                ▼
  ┌────────────────────────────────────────────────────────────────────────────────────────────┐
  │  mint_guard.prove_reserve                                                                    │
  │    1. pairing_check(proof) ✅   2. pubkey_hash == pinned gmail key                            │
  │    3. sender_hash ∈ registry    4. nullifier unused    ──▶  store attestation + emit event   │
  └────────────────────────────────────────────────────────────────────────────────────────────┘
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

## Adversarial testing

Solvent is not validated by a green checkmark — it is validated by **what it
refuses**. Every attack a malicious prover can mount is enumerated, executed as a
test, and provably rejected. The suite runs the **real BN254 pairing** natively
(not a mock), and the replay rejection is additionally proven **on-chain**.

| # | Attack | Adversary's goal | Solvent's response | Where |
|---|--------|------------------|--------------------|-------|
| 1 | **Forged / garbage proof** | pass a fabricated Groth16 proof | `pairing_check` → `false`, rejected | `verify_real_proof_true` / `bisect_*` |
| 2 | **Tampered public signal** | flip `threshold` in the journal, keep the proof | `pairing_check` → `false` (journal is bound into the proof) | `verify_tampered_public_fails` |
| 3 | **Forged DKIM key** | sign the email with an attacker key | `WrongPubkey` — `pubkey_hash` ≠ pinned gmail key | `prove_reserve_wrong_pubkey_fails` |
| 4 | **Sender spoofing** | prove from an unregistered/forged issuer | `IssuerNotRegistered` — `sender_hash` ∉ registry | `prove_reserve_unregistered_fails` |
| 5 | **Replay** | re-submit a valid old proof to double-attest | `NullifierUsed` (`#7`) — nullifier stored on first use | `prove_reserve_replay_fails` |
| 6 | **G1 negation trap** | exploit base-field `q` vs scalar-field `r` confusion | `A + (-A) = ∞` asserted; negation done over `q` | `bisect_negation_is_identity` |
| 7 | **Encoding trap** | malformed `vk_x` / IC point encoding | `vk_x ≠ ∞`; EIP-197 / `Bn254Fr` encoding checked | `bisect_vk_x_computes` |
| 8 | **Happy path (control)** | a genuine reserve above threshold | attestation stored, `reserve` event emitted | `prove_reserve_happy_path` |

**Replay rejection is not just a unit test — it is live on-chain.** Re-submitting
the winning `prove_reserve` proof to the testnet contract reverts with
`Error(Contract, #7) = NullifierUsed`, *before* any state change (checks-effects
order). The nullifier that blocks it was written by the original attestation tx:

| On-chain proof | Tx hash |
|---|---|
| **Successful attestation** (`pairing_check = true`) | `32117d2f667119578b4f4e92214662aadb194d03dcd341f61935ad6be18b9c1b` |

> A green "8/8" tells you the code runs. This table tells you **exactly which
> attacks the code defeats** — and one of them is defeated on a public block
> explorer, not just in CI.

**Run it yourself:** `cargo test -p mint_guard` → 8/8, real pairing, zero mocks.

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

## What's next — the road to mainnet

Solvent's core is live and adversarially tested on testnet. **Mainnet is
intentionally held until external review** — proof-of-reserves is a security
product, and shipping it unaudited would betray the entire premise. The path is
deliberate:

| Milestone | Status | Notes |
|---|---|---|
| **Testnet: live + adversarially tested** | ✅ done | contract live, 8/8 attack suite, on-chain replay rejection |
| **Reproducible build + verified release** | 🔜 next | tagged `v0.1.0` release, Stellar-Expert `soroban-build-workflow` → on-chain **verified** WASM hash + SLSA provenance |
| **External security audit** | 🎯 planned | the **[SCF Soroban Audit Bank](https://stellar.org/grants-and-funding/soroban-audit-bank)** is the intended path — audit-grade review before any real value flows |
| **Multi-party trusted-setup ceremony** | 🗺️ roadmap | replace the single-contributor dev ceremony with a real Powers-of-Tau + phase-2 MPC |
| **Client-side WASM proving** | 🗺️ roadmap | move RSA-2048-in-circuit proving into the browser so the email *never* leaves the user's machine |
| **Mainnet** | ⛔ gated | held until audit clears — solvency proofs must not ship unreviewed |

**Why this matters for the ecosystem:** Solvent is built to sit in the Stellar
**mainnet → audit → grant** orbit, not to stop at a demo. A verified, reproducible
release plus an SCF-audited contract is what turns a hackathon proof-of-concept
into something an exchange or fund can actually rely on.

> **Reproducibility today:** the contract WASM is ~10 KB and built from source with
> `stellar contract build`; a tagged release with Stellar-Expert's
> `soroban-build-workflow` yields a **reproducible build + verified badge** so
> anyone can confirm the deployed bytecode matches this repo — no trust required.

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
