// Solvent — reference Poseidon(t=2) over BN254.
//
// This mirrors, step-for-step, the HADES permutation that the Stellar host
// function `env.crypto().poseidon_permutation(..., "BN254", t=2, d=5,
// rounds_f=8, rounds_p=56, mds, round_constants)` computes, AND the circomlib
// reference algorithm (circomlibjs/src/poseidon_reference.js).
//
// One shape only (see circuits/README.md):
//   PoseidonHash(x) = squeeze( permute( state=[0, x] ) )[0]
//
// Both the circuit (circomlib Poseidon(1)) and the contract MUST agree with this.

import { getCurveFromName } from "ffjavascript";
import rc from "./gen_poseidon_constants.js"; // { t, d, roundsF, roundsP, C_rounds, M }

let _F = null;
async function F() {
  if (_F) return _F;
  const bn128 = await getCurveFromName("bn128", true);
  _F = bn128.Fr;
  return _F;
}

const pow5 = (F, a) => F.mul(a, F.square(F.square(a)));

// Full Poseidon(t=2) permutation on a 2-element state, reference (unoptimized)
// form: per round -> ARK (add round constants) -> S-box -> MDS mix.
export async function permute2(stateIn /* [bigint, bigint] */) {
  const Fr = await F();
  const { roundsF, roundsP, C_rounds, M } = rc;
  const t = 2;
  let state = stateIn.map((x) => Fr.e(x));
  const Cr = C_rounds.map((row) => row.map((x) => Fr.e(x)));
  const Mm = M.map((row) => row.map((x) => Fr.e(x)));

  for (let r = 0; r < roundsF + roundsP; r++) {
    // ARK
    state = state.map((a, i) => Fr.add(a, Cr[r][i]));
    // S-box: full rounds -> all lanes; partial rounds -> lane 0 only
    if (r < roundsF / 2 || r >= roundsF / 2 + roundsP) {
      state = state.map((a) => pow5(Fr, a));
    } else {
      state[0] = pow5(Fr, state[0]);
    }
    // MDS mix
    state = state.map((_, i) =>
      state.reduce((acc, a, j) => Fr.add(acc, Fr.mul(Mm[i][j], a)), Fr.zero)
    );
  }
  return state;
}

// The single-input sponge: absorb one field element, squeeze one.
export async function poseidonHash1(x /* bigint */) {
  const Fr = await F();
  const out = await permute2([Fr.zero, Fr.e(x)]);
  return Fr.toObject(out[0]); // bigint
}

export async function toField(x) {
  const Fr = await F();
  return Fr.toObject(Fr.e(x));
}

export async function fieldModulus() {
  const Fr = await F();
  return Fr.p;
}
