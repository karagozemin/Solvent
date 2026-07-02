#!/bin/bash
# Initialize the deployed mint_guard contract on testnet:
#   init(admin, vk, pubkey_hash) -> register_issuer(sender_hash, name)
# Reads vkey + public journal from circuits/build and formats CLI args
# (strips 0x prefixes; BytesN args are raw hex).
set -euo pipefail

CID="${1:?usage: deploy_init.sh <CONTRACT_ID> [SOURCE] [NETWORK]}"
SOURCE="${2:-alice}"
NETWORK="${3:-testnet}"

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
BUILD="$ROOT/circuits/build"
VKEY="$BUILD/vkey_soroban.json"
PUB="$BUILD/public.json"

strip0x() { sed 's/^0x//'; }

# --- Build the --vk JSON (hex strings without 0x) ---
VK_JSON=$(node -e '
  const v = require(process.argv[1]);
  const s = h => h.replace(/^0x/, "");
  const out = {
    alpha: s(v.alpha), beta: s(v.beta), gamma: s(v.gamma), delta: s(v.delta),
    ic: v.ic.map(s),
  };
  process.stdout.write(JSON.stringify(out));
' "$VKEY")

# --- pubkey_hash = public.json[0], sender_hash = public.json[1] as 32-byte hex ---
read PUBKEY_HEX SENDER_HEX < <(node -e '
  const p = require(process.argv[1]);
  const to32 = d => BigInt(d).toString(16).padStart(64, "0");
  process.stdout.write(to32(p[0]) + " " + to32(p[1]));
' "$PUB")

echo "=== init ==="
echo "  admin       = $SOURCE"
echo "  pubkey_hash = $PUBKEY_HEX"
stellar contract invoke --id "$CID" --source "$SOURCE" --network "$NETWORK" -- \
  init --admin "$SOURCE" --pubkey_hash "$PUBKEY_HEX" --vk "$VK_JSON"

echo "=== register_issuer (sender_hash) ==="
echo "  sender_hash = $SENDER_HEX"
stellar contract invoke --id "$CID" --source "$SOURCE" --network "$NETWORK" -- \
  register_issuer --sender_hash "$SENDER_HEX" --name "Acme Bank (demo)"

echo "=== is_registered? ==="
stellar contract invoke --id "$CID" --source "$SOURCE" --network "$NETWORK" -- \
  is_registered --sender_hash "$SENDER_HEX"
