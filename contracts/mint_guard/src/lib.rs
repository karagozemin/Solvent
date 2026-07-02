#![no_std]
//! Solvent — mint_guard contract.
//!
//! Groth16 verifier over BN254 using Stellar's native `bn254` host functions
//! (soroban-sdk 26.1.0). The single Task-2/3 target is: given a real proof +
//! public journal produced by circuits/reserve.circom, `verify_proof` returns
//! `true` via `env.crypto().bn254().pairing_check(...)`.
//!
//! Verification equation (Groth16), rearranged so the pairing product == 1:
//!     e(-A, B) * e(alpha, beta) * e(vk_x, gamma) * e(C, delta) == 1
//! where vk_x = IC[0] + sum_i pub[i] * IC[i+1].
//!
//! ENCODING (docs.rs soroban_sdk::crypto::bn254):
//!   G1 = BytesN<64>  = be(X) || be(Y)                       (big-endian)
//!   G2 = BytesN<128> = be(X_c1)||be(X_c0)||be(Y_c1)||be(Y_c0) (EIP-197 order)
//!   The vkey_to_soroban.js exporter already swaps snarkjs [c0,c1] -> [c1,c0].
//!   alpha is NOT negated in the vkey; the single negation lives here on A.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype,
    crypto::bn254::{Bn254Fr, Bn254G1Affine, Bn254G2Affine},
    Bytes, BytesN, Env, U256, Vec,
};

// BN254 base field modulus q (Fq) — used for G1 point negation (x, y) -> (x, q-y).
// THIS IS q (base field), NOT r (scalar field). Mixing them is the classic
// silent bug that yields a "valid-looking" proof that fails pairing_check.
//   q = 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47
const Q_BASE_FIELD: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x97, 0x81, 0x6a, 0x91, 0x68, 0x71, 0xca, 0x8d, 0x3c, 0x20, 0x8c, 0x16, 0xd8, 0x7c, 0xfd, 0x47,
];

#[contracttype]
#[derive(Clone)]
pub struct VerificationKey {
    pub alpha: BytesN<64>,      // G1
    pub beta: BytesN<128>,      // G2
    pub gamma: BytesN<128>,     // G2
    pub delta: BytesN<128>,     // G2
    pub ic: Vec<BytesN<64>>,    // nPublic+1 G1 points (=7 for this circuit)
}

#[contracttype]
#[derive(Clone)]
pub struct Proof {
    pub a: BytesN<64>,          // G1
    pub b: BytesN<128>,         // G2
    pub c: BytesN<64>,          // G1
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Vkey,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Error {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    BadPublicInputLen = 3,
}

#[contract]
pub struct MintGuard;

#[contractimpl]
impl MintGuard {
    /// Store the verification key (once). Kept in storage rather than hardcoded
    /// so Task-B circuit changes only require `set_vkey`, not a redeploy.
    pub fn init(env: Env, vk: VerificationKey) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Vkey) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Vkey, &vk);
        Ok(())
    }

    /// Allow updating the vkey (Task-B rotation). No auth in this skeleton —
    /// TODO(prod): gate behind an admin address.
    pub fn set_vkey(env: Env, vk: VerificationKey) {
        env.storage().instance().set(&DataKey::Vkey, &vk);
    }

    /// THE SINGLE TARGET: verify a Groth16 proof against the stored vkey and the
    /// public journal. `pub_signals` MUST be in snarkjs public.json order:
    ///   [domain_hash, nullifier, threshold_out, timestamp_out, threshold, timestamp]
    pub fn verify_proof(env: Env, proof: Proof, pub_signals: Vec<U256>) -> Result<bool, Error> {
        let vk: VerificationKey = env
            .storage()
            .instance()
            .get(&DataKey::Vkey)
            .ok_or(Error::NotInitialized)?;

        // IC must have exactly nPublic+1 points.
        if vk.ic.len() != pub_signals.len() + 1 {
            return Err(Error::BadPublicInputLen);
        }

        let bn = env.crypto().bn254();

        // vk_x = IC[0] + sum_i pub[i] * IC[i+1]
        let vk_x = compute_vk_x(&env, &vk, &pub_signals);

        // -A (negate G1 y-coordinate mod q)
        let neg_a = g1_negate(&env, &proof.a);

        // Build pairing vectors: e(-A,B)*e(alpha,beta)*e(vk_x,gamma)*e(C,delta)==1
        let mut vp1: Vec<Bn254G1Affine> = Vec::new(&env);
        let mut vp2: Vec<Bn254G2Affine> = Vec::new(&env);

        vp1.push_back(Bn254G1Affine::from_bytes(neg_a));
        vp2.push_back(Bn254G2Affine::from_bytes(proof.b.clone()));

        vp1.push_back(Bn254G1Affine::from_bytes(vk.alpha.clone()));
        vp2.push_back(Bn254G2Affine::from_bytes(vk.beta.clone()));

        vp1.push_back(vk_x);
        vp2.push_back(Bn254G2Affine::from_bytes(vk.gamma.clone()));

        vp1.push_back(Bn254G1Affine::from_bytes(proof.c.clone()));
        vp2.push_back(Bn254G2Affine::from_bytes(vk.delta.clone()));

        Ok(bn.pairing_check(vp1, vp2))
    }

    // ---- BISECT HELPERS (exposed for tests; not part of the prod surface) ----

    /// Isolated check for Trap 3 (encoding). Returns vk_x bytes so a test can
    /// compare against snarkjs's internal vk_x. If this matches, scalar/point
    /// encoding is correct and any pairing failure is elsewhere.
    pub fn debug_vk_x(env: Env, pub_signals: Vec<U256>) -> Result<BytesN<64>, Error> {
        let vk: VerificationKey = env
            .storage()
            .instance()
            .get(&DataKey::Vkey)
            .ok_or(Error::NotInitialized)?;
        let vk_x = compute_vk_x(&env, &vk, &pub_signals);
        Ok(vk_x.to_bytes())
    }

    /// Isolated check for Trap 1 (negation). Computes A + (-A) and returns
    /// whether it equals the point at infinity (64 zero bytes). If false, the
    /// negation (q vs r, or byte layout) is wrong.
    pub fn debug_neg_is_identity(env: Env, a: BytesN<64>) -> bool {
        let neg_a = g1_negate(&env, &a);
        let bn = env.crypto().bn254();
        let sum = bn.g1_add(
            &Bn254G1Affine::from_bytes(a),
            &Bn254G1Affine::from_bytes(neg_a),
        );
        // Point at infinity = 64 zero bytes.
        let zero = BytesN::from_array(&env, &[0u8; 64]);
        sum.to_bytes() == zero
    }
}

/// vk_x = IC[0] + sum_i pub_signals[i] * IC[i+1], all in G1.
fn compute_vk_x(env: &Env, vk: &VerificationKey, pub_signals: &Vec<U256>) -> Bn254G1Affine {
    let bn = env.crypto().bn254();
    let mut acc = Bn254G1Affine::from_bytes(vk.ic.get(0).unwrap());
    for i in 0..pub_signals.len() {
        let scalar = Bn254Fr::from(pub_signals.get(i).unwrap());
        let ic_point = Bn254G1Affine::from_bytes(vk.ic.get(i + 1).unwrap());
        let term = bn.g1_mul(&ic_point, &scalar);
        acc = bn.g1_add(&acc, &term);
    }
    acc
}

/// Negate a G1 point: (x, y) -> (x, q - y). Operates on the 64-byte big-endian
/// encoding: first 32 bytes = X (untouched), last 32 bytes = Y (replaced with
/// q - Y). Uses U256 arithmetic mod the BASE field q.
fn g1_negate(env: &Env, p: &BytesN<64>) -> BytesN<64> {
    let arr = p.to_array();

    // Split into X (0..32) and Y (32..64).
    let mut x_bytes = [0u8; 32];
    let mut y_bytes = [0u8; 32];
    x_bytes.copy_from_slice(&arr[0..32]);
    y_bytes.copy_from_slice(&arr[32..64]);

    // If the point is infinity (all zero), negation is itself.
    if arr == [0u8; 64] {
        return BytesN::from_array(env, &arr);
    }

    let q = U256::from_be_bytes(env, &Bytes::from_array(env, &Q_BASE_FIELD));
    let y = U256::from_be_bytes(env, &Bytes::from_array(env, &y_bytes));
    let neg_y = q.sub(&y); // q - y  (y < q guaranteed for a valid point)

    // Serialize neg_y back to 32 big-endian bytes.
    let neg_y_bytes = neg_y.to_be_bytes(); // Bytes, length up to 32
    let mut out = [0u8; 64];
    out[0..32].copy_from_slice(&x_bytes);
    // Right-align neg_y into the last 32 bytes (leading zeros if shorter).
    let nyb_len = neg_y_bytes.len() as usize;
    let start = 64 - nyb_len;
    let mut i = 0usize;
    while i < nyb_len {
        out[start + i] = neg_y_bytes.get(i as u32).unwrap();
        i += 1;
    }
    BytesN::from_array(env, &out)
}

#[cfg(test)]
mod fixtures;
#[cfg(test)]
mod test;