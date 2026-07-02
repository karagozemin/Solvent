#![cfg(test)]
use super::*;
use crate::fixtures;
use soroban_sdk::{testutils::Address as _, Address, Bytes, BytesN, Env, String, U256, Vec};

// Derive the 32-byte key for a journal signal exactly as the contract does.
fn hash32_of(e: &Env, idx: usize) -> Hash32 {
    BytesN::from_array(e, &fixtures::PUBLIC_SIGNALS[idx])
}

fn pubkey_hash(e: &Env) -> Hash32 { hash32_of(e, 0) }
fn sender_hash(e: &Env) -> Hash32 { hash32_of(e, 1) }

// Full setup: register admin + vkey + expected gmail pubkey hash, mock auth.
fn setup(e: &Env) -> (Address, MintGuardClient<'_>) {
    let admin = Address::generate(e);
    let id = e.register(MintGuard, ());
    let client = MintGuardClient::new(e, &id);
    e.mock_all_auths();
    client.init(&admin, &load_vk(e), &pubkey_hash(e));
    (admin, client)
}

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
    let (_admin, client) = setup(&e);
    let vk_x = client.debug_vk_x(&load_pub(&e));
    let zero = BytesN::from_array(&e, &[0u8; 64]);
    assert!(vk_x != zero, "vk_x is infinity — IC/scalar encoding likely wrong");
}

// ---- THE TARGET: full Groth16 pairing_check on the REAL proof. ----
#[test]
fn verify_real_proof_true() {
    let e = Env::default();
    let (_admin, client) = setup(&e);
    let ok = client.verify_proof(&load_proof(&e), &load_pub(&e));
    assert!(ok, "pairing_check returned false on a valid proof");
}

// ---- NEGATIVE: tampered public signal must fail. ----
#[test]
fn verify_tampered_public_fails() {
    let e = Env::default();
    let (_admin, client) = setup(&e);
    let mut p = load_pub(&e);
    let tampered = p.get(J_THRESHOLD).unwrap().add(&U256::from_u32(&e, 1));
    p.set(J_THRESHOLD, tampered);
    let ok = client.verify_proof(&load_proof(&e), &p);
    assert!(!ok, "pairing_check accepted a tampered public signal");
}

// ---- REGISTRY: full happy path — register issuer, prove, attestation stored. ----
#[test]
fn prove_reserve_happy_path() {
    let e = Env::default();
    let (_admin, client) = setup(&e);
    client.register_issuer(&sender_hash(&e), &String::from_str(&e, "Acme Bank (demo)"));
    assert!(client.is_registered(&sender_hash(&e)));

    client.prove_reserve(&load_proof(&e), &load_pub(&e));

    let att = client.get_attestation(&sender_hash(&e)).unwrap();
    assert_eq!(att.threshold, U256::from_u32(&e, 1000000));
    assert_eq!(att.timestamp, 1782948043u64);
}

// ---- REGISTRY: unregistered issuer is rejected. ----
#[test]
fn prove_reserve_unregistered_fails() {
    let e = Env::default();
    let (_admin, client) = setup(&e);
    // No register_issuer call.
    let res = client.try_prove_reserve(&load_proof(&e), &load_pub(&e));
    assert_eq!(res, Err(Ok(Error::IssuerNotRegistered)));
}

// ---- REGISTRY: replay (same nullifier twice) is rejected. ----
#[test]
fn prove_reserve_replay_fails() {
    let e = Env::default();
    let (_admin, client) = setup(&e);
    client.register_issuer(&sender_hash(&e), &String::from_str(&e, "Acme Bank (demo)"));
    client.prove_reserve(&load_proof(&e), &load_pub(&e)); // first: ok
    let res = client.try_prove_reserve(&load_proof(&e), &load_pub(&e)); // second: replay
    assert_eq!(res, Err(Ok(Error::NullifierUsed)));
}

// ---- REGISTRY: wrong pubkey hash (not gmail) is rejected. ----
#[test]
fn prove_reserve_wrong_pubkey_fails() {
    let e = Env::default();
    let admin = Address::generate(&e);
    let id = e.register(MintGuard, ());
    let client = MintGuardClient::new(&e, &id);
    e.mock_all_auths();
    // Init with a BOGUS expected pubkey hash.
    let bogus = BytesN::from_array(&e, &[0xabu8; 32]);
    client.init(&admin, &load_vk(&e), &bogus);
    client.register_issuer(&sender_hash(&e), &String::from_str(&e, "Acme"));
    let res = client.try_prove_reserve(&load_proof(&e), &load_pub(&e));
    assert_eq!(res, Err(Ok(Error::WrongPubkey)));
}
