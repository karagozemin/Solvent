#!/usr/bin/env bash
# Solvent circuit build: circom (bn128) -> r1cs -> Groth16 setup -> vkey.json
# -> Soroban BN254 verification-key bytes.
#
# HONESTY: the trusted setup here is a SINGLE-CONTRIBUTOR DEV CEREMONY. Production
# requires a real multi-party Powers-of-Tau + phase-2 ceremony. See README.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
export PATH="$HOME/.local/bin:$PATH"

BUILD="$ROOT/build"
mkdir -p "$BUILD"
SNARKJS="node $ROOT/node_modules/snarkjs/cli.js"
CIRCUIT=reserve

# Circom needs to resolve `include "circomlib/..."` and `@zk-email/...` from
# node_modules. -l adds library search roots.
LIBS=(-l node_modules -l node_modules/@zk-email/circuits)

echo "==> [1/7] Emit locked Poseidon constants"
node scripts/gen_poseidon_constants.js

echo "==> [2/7] Compile circuit (bn128 default field)"
circom "$CIRCUIT.circom" --r1cs --wasm --sym -o "$BUILD" "${LIBS[@]}"

echo "==> [3/7] r1cs info"
$SNARKJS r1cs info "$BUILD/$CIRCUIT.r1cs"

# Determine required power of tau from constraint count.
NCON=$($SNARKJS r1cs info "$BUILD/$CIRCUIT.r1cs" | awk -F: '/# of Constraints/{gsub(/ /,"",$2);print $2}')
POW=10
while [ $((1 << POW)) -lt "$NCON" ]; do POW=$((POW+1)); done
echo "    constraints=$NCON -> need 2^$POW powers of tau"

PTAU="$BUILD/pot_${POW}_final.ptau"
if [ ! -f "$PTAU" ]; then
  echo "==> [4/7] Powers of Tau (bn128, 2^$POW) — DEV ceremony"
  $SNARKJS powersoftau new bn128 "$POW" "$BUILD/pot_0000.ptau" -v
  $SNARKJS powersoftau contribute "$BUILD/pot_0000.ptau" "$BUILD/pot_0001.ptau" \
      --name="solvent-dev" -v -e="$(head -c 64 /dev/urandom | base64)"
  $SNARKJS powersoftau prepare phase2 "$BUILD/pot_0001.ptau" "$PTAU" -v
else
  echo "==> [4/7] Reusing existing $PTAU"
fi

echo "==> [5/7] Groth16 setup (phase 2)"
$SNARKJS groth16 setup "$BUILD/$CIRCUIT.r1cs" "$PTAU" "$BUILD/${CIRCUIT}_0000.zkey"
$SNARKJS zkey contribute "$BUILD/${CIRCUIT}_0000.zkey" "$BUILD/${CIRCUIT}.zkey" \
    --name="solvent-dev-phase2" -v -e="$(head -c 64 /dev/urandom | base64)"

echo "==> [6/7] Export verification key"
$SNARKJS zkey export verificationkey "$BUILD/${CIRCUIT}.zkey" "$BUILD/verification_key.json"

echo "==> [7/7] Export Soroban BN254 vkey bytes"
node scripts/vkey_to_soroban.js

echo ""
echo "DONE. Artifacts in build/:"
echo "  $CIRCUIT.r1cs, ${CIRCUIT}_js/${CIRCUIT}.wasm, ${CIRCUIT}.zkey"
echo "  verification_key.json, vkey_soroban.json"
