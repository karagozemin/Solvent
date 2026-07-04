First tagged release of Solvent — zero-knowledge proof-of-reserves on Stellar.

**Live on Stellar testnet.** A real Gmail DKIM-signed balance email → Groth16/BN254 proof → on-chain `pairing_check = true`, under the 100M instruction budget. The exact balance is never revealed.

### What's in this release
- **mint_guard** Soroban contract: native BN254 Groth16 verifier + issuer registry + anti-replay nullifier.
- **8/8 adversarial test suite** (real pairing, zero mocks): forged proof, tampered public signal, forged DKIM key, sender spoofing, replay, G1-negation trap, encoding trap, happy path.
- **On-chain replay rejection** proven live (`NullifierUsed`, checks-before-effects).

### Reproducible build
This release is built by Stellar-Expert's reproducible `soroban-build-workflow`, attaching the deterministic contract WASM + SLSA build provenance so anyone can confirm the deployed bytecode matches this source — no trust required.

### Roadmap to mainnet
Mainnet is intentionally held until external review via the SCF Soroban Audit Bank. Multi-party trusted-setup ceremony and client-side WASM proving are on the roadmap.
