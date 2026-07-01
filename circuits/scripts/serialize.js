// LOCKED byte -> field serialization (see circuits/README.md).
// 31-byte LE limbs, right-pad with 0x00 to fixed length, fold with BASE=2^248,
// then PoseidonHash1 of the folded field element.

import { poseidonHash1, fieldModulus } from "./poseidon_ref.js";

export const LIMB_BYTES = 31;
export const BASE = 1n << 248n; // 2^248 (fits any 31-byte limb without overlap)
export const MSGID_BYTES = 128;
export const DOMAIN_BYTES = 62;

// bytes (Uint8Array/Buffer) -> single field element (bigint), injective fold.
export async function bytesToField(bytes, fixedLen) {
  if (bytes.length > fixedLen) {
    throw new Error(
      `input length ${bytes.length} exceeds fixed length ${fixedLen} (prover must reject, never truncate)`
    );
  }
  const p = await fieldModulus();
  // right-pad with 0x00 to fixedLen
  const buf = new Uint8Array(fixedLen);
  buf.set(bytes, 0);
  // chunk into 31-byte LE limbs
  const nLimbs = Math.ceil(fixedLen / LIMB_BYTES);
  let acc = 0n;
  let basePow = 1n;
  for (let i = 0; i < nLimbs; i++) {
    const start = i * LIMB_BYTES;
    const limbBytes = buf.slice(start, start + LIMB_BYTES); // may be short on last
    // little-endian interpret
    let limb = 0n;
    for (let b = limbBytes.length - 1; b >= 0; b--) {
      limb = (limb << 8n) | BigInt(limbBytes[b]);
    }
    acc = (acc + ((limb * basePow) % p)) % p;
    basePow = (basePow * BASE) % p;
  }
  return acc % p;
}

export async function hashMessageId(bytes) {
  const f = await bytesToField(bytes, MSGID_BYTES);
  return poseidonHash1(f);
}

export async function hashDomain(bytes) {
  const f = await bytesToField(bytes, DOMAIN_BYTES);
  return poseidonHash1(f);
}
