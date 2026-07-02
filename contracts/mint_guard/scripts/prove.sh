#!/bin/bash
# Invoke prove_reserve on testnet with the real proof + public journal.
# Converts snarkjs proof.json -> contract Proof (G1/G2 with EIP-197 G2 swap),
# and public.json -> Array<u256> (decimal strings).
#
# By default DOES NOT SEND (simulation only) so we can read the CPU budget
# before spending. Pass 'send' as 2nd arg to actually submit.
set -euo pipefail

CID="${1:?usage: prove.sh <CONTRACT_ID> [send] [SOURCE] [NETWORK]}"
DO="${2:-sim}"
SOURCE="${3:-alice}"
NETWORK="${4:-testnet}"

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
BUILD="$ROOT/circuits/build"

# proof.json -> {a,b,c} hex. G1 = be(x)||be(y); G2 = be(x_c1)||be(x_c0)||be(y_c1)||be(y_c0).
PROOF_JSON=$(node -e '
  const p = require(process.argv[1]);
  const to32 = d => BigInt(d).toString(16).padStart(64, "0");
  const g1 = a => to32(a[0]) + to32(a[1]);
  const g2 = b => to32(b[0][1]) + to32(b[0][0]) + to32(b[1][1]) + to32(b[1][0]);
  process.stdout.write(JSON.stringify({ a: g1(p.pi_a), b: g2(p.pi_b), c: g1(p.pi_c) }));
' "$BUILD/proof.json")

PUB_JSON=$(node -e '
  const p = require(process.argv[1]);
  process.stdout.write(JSON.stringify(p.map(String)));
' "$BUILD/public.json")

SEND_FLAG=""
if [ "$DO" = "send" ]; then SEND_FLAG="--send=yes"; else SEND_FLAG="--send=no"; fi

echo "=== prove_reserve ($DO) ==="
stellar contract invoke --id "$CID" --source "$SOURCE" --network "$NETWORK" $SEND_FLAG -- \
  prove_reserve --proof "$PROOF_JSON" --pub_signals "$PUB_JSON"
