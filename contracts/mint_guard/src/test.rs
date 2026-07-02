#![cfg(test)]
use super::*;
use crate::fixtures;
use soroban_sdk::{Bytes, BytesN, Env, U256, Vec};

fn load_vk(e: &Env) -> VerificationKey {
    let mut ic: Vec<BytesN<64>> = Vec::new(e);
    for p in fixtures::VK_IC.iter() {
        ic.push_back(BytesN::from_array(e, p));
    }
    VerificationKey {
        alpha: BytesN::from_array(e, &fixtures::VK_ALPHA),
        beta: BytesN::from_array(e, &fixtures::VK_BETA),
        gamma: BytesN::from_array(e, &fixtures::VK_GAMMA),
        delta: BytesN::from_array(e, &fixtures::VK_DELTA),
        ic,
    }
}

fn load_proof(e: &Env) -> Proof {
    Proof {
        a: BytesN::from_array(e, &fixtures::PROOF_A),
        b: BytesN::from_array(e, &fixtures::PROOF_B),
        c: BytesN::from_array(e, &fixtures::PROOF_C),
    }
}

fn load_pub(e: &Env) -> Vec<U256> {
    let mut v: Vec<U256> = Vec::new(e);
    for s in fixtures::PUBLIC_SIGNALS.iter() {
        v.push_back(U256::from_be_bytes(e, &Bytes::from_array(e, s)));
    }
    v
}

// ---- BISECT 1 (Trap 1): negation. A + (-A) must be the point at infinity. ----
#[test]
fn bisect_negation_is_identity() {
    let e = Env::default();
    let id = e.register(MintGuard, ());
    let client = MintGuardClient::new(&e, &id);
    let a = BytesN::from_array(&e, &fixtures::PROOF_A);
    assert!(
        client.debug_neg_is_identity(&a),
        "g1_negate wrong: A + (-A) != infinity (check q base field vs r scalar)"
    );
}

// ---- BISECT 2 (Trap 3): vk_x computes; encoding sane (non-infinity). ----
#[test]
fn bisect_vk_x_computes() {
    let e = Env::default();
    let id = e.register(MintGuard, ());
    let client = MintGuardClient::new(&e, &id);
    client.init(&load_vk(&e));
    let vk_x = client.debug_vk_x(&load_pub(&e));
    let zero = BytesN::from_array(&e, &[0u8; 64]);
    assert!(vk_x != zero, "vk_x is infinity — IC/scalar encoding likely wrong");
}

// ---- THE TARGET: full Groth16 pairing_check on the REAL proof. ----
#[test]
fn verify_real_proof_true() {
    let e = Env::default();
    let id = e.register(MintGuard, ());
    let client = MintGuardClient::new(&e, &id);
    client.init(&load_vk(&e));
    let ok = client.verify_proof(&load_proof(&e), &load_pub(&e));
    assert!(ok, "pairing_check returned false on a valid proof");
}

// ---- NEGATIVE: tampered public signal must fail. ----
#[test]
fn verify_tampered_public_fails() {
    let e = Env::default();
    let id = e.register(MintGuard, ());
    let client = MintGuardClient::new(&e, &id);
    client.init(&load_vk(&e));
    let mut p = load_pub(&e);
    let tampered = p.get(4).unwrap().add(&U256::from_u32(&e, 1));
    p.set(4, tampered);
    let ok = client.verify_proof(&load_proof(&e), &p);
    assert!(!ok, "pairing_check accepted a tampered public signal");
}
