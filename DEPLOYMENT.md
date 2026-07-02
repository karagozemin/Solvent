# Solvent — Live Deployment (Stellar Testnet)

Solvent is **live on Stellar testnet**. Every claim below is verifiable on a
public block explorer — this is not a local test run, it is the chain itself.

## Contract

| | |
|---|---|
| **Contract ID** | `CDPPM3EWAVVEE23LQVANCCRI4ERRBGJT4OUDTR46NRVDZFKAKDGYTDL5` |
| Network | Stellar Testnet |
| SDK | soroban-sdk 26.1.0 |
| Verifier | Groth16 over BN254, native `env.crypto().bn254().pairing_check` |
| WASM size | ~10 KB |

Explorer: https://stellar.expert/explorer/testnet/contract/CDPPM3EWAVVEE23LQVANCCRI4ERRBGJT4OUDTR46NRVDZFKAKDGYTDL5

## Verifiable transaction chain

| Step | What it proves | Tx hash |
|---|---|---|
| **deploy** | contract is on-chain | `fa4924c15d01bdd9431d92cd526e13934870fccb163aa5585b009a48abe0fcac` |
| **init** | admin + vkey + gmail pubkey hash stored | `0ac17b23e0fb53310389400f4d59c3e1fd04aa2bc806c2991e1c2e69de1b3dee` |
| **register_issuer** | "Acme Bank (demo)" onboarded | `5d6f7e45cacfc891337b95c00a7b1ce5e1c1c7a50c22f4df12d3ec5eaab6ed95` |
| **prove_reserve** | **BN254 `pairing_check = true` on-chain** | `32117d2f667119578b4f4e92214662aadb194d03dcd341f61935ad6be18b9c1b` |

Each hash opens at `https://stellar.expert/explorer/testnet/tx/<hash>`.

### The key transaction

`prove_reserve` (`32117d2f…`) is the whole project in one call:
- a real Gmail DKIM-signed email produced a Groth16 proof,
- the contract verified it with Stellar's native BN254 pairing,
- it **fit under the 100M instruction budget** — the entire point of the
  Protocol 26 BN254 host functions: on-chain proof-of-reserves is practical,
- it emitted `reserve(sender_hash) = { threshold: 1_000_000, timestamp }`,
- the **balance was never revealed** — only that it clears $1,000,000.

## Live security properties

- **Replay rejected on-chain.** Submitting the same proof again fails with
  `Error(Contract, #7)` = `NullifierUsed`. The nullifier
  (`Poseidon²(signature)`) is stored on first use; the second attempt reverts
  before any state change (checks-effects order).
- **Attestation persisted & readable.** `get_attestation(sender_hash)` returns
  `{ threshold: 1000000, timestamp: 1782948043, nullifier }` from testnet
  storage.
- **Wrong signer rejected.** A proof whose `pubkey_hash` ≠ the pinned gmail DKIM
  key hash fails with `WrongPubkey` (covered by unit tests).

## Soundness in one paragraph

The proof binds three anchors to the DKIM signature: `pubkey_hash` (which
provider key signed), `sender_hash` (the full From address, extracted by regex
over the **signed** header), and `nullifier` (anti-replay). The admin only
attests **who** may register (KYC-like onboarding); it **cannot forge a
reserve** — an attestation is written only when a valid ZK proof passes.
**Onboarding is centralized; correctness is enforced by the math.**

## Reproduce it yourself

```bash
# 1) build circuit, trusted setup, prove (see circuits/)
cd circuits && npm install && npm run build
node scripts/gen_input.js fixtures/gmail_balance_real.eml 1000000
node node_modules/snarkjs/cli.js wtns calculate build/reserve_js/reserve.wasm build/input.json build/witness.wtns
node node_modules/snarkjs/cli.js groth16 prove build/reserve.zkey build/witness.wtns build/proof.json build/public.json

# 2) build + deploy contract
cd ../contracts/mint_guard && stellar contract build
stellar contract deploy --wasm target/wasm32v1-none/release/mint_guard.wasm --source <you> --network testnet

# 3) init + register + prove (scripts format all the BN254 args)
bash scripts/deploy_init.sh <CONTRACT_ID> <you> testnet
bash scripts/prove.sh <CONTRACT_ID> send <you> testnet
```
