// Task 1 acceptance-gate helper (JS side).
//
// 1. Verifies our reference Poseidon(t=2) sponge equals circomlibjs's own
//    buildPoseidon() for single-input hashing (sanity: our HADES loop matches
//    the library that the circuit's circomlib Poseidon template also implements).
// 2. Emits build/poseidon_crosscheck_vectors.json — the SAME (input -> output)
//    vectors the mint_guard contract unit test consumes. The contract's
//    hand-wrapped host-permutation sponge MUST reproduce these byte-for-byte.
//
// If (1) fails, our reference model is wrong. The contract test is the other
// half of the gate (Task 3).

import { writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { buildPoseidon } from "circomlibjs";
import { poseidonHash1 } from "./poseidon_ref.js";
import { bytesToField, hashMessageId, hashDomain, MSGID_BYTES, DOMAIN_BYTES } from "./serialize.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const buildDir = join(__dirname, "..", "build");

const toHex32 = (x) => "0x" + x.toString(16).padStart(64, "0");
const enc = new TextEncoder();

function pass(b) {
  return b ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
}

async function main() {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  // ---- Check 1: reference sponge == circomlibjs buildPoseidon (single input) ----
  const singleInputs = [0n, 1n, 2n, 42n, 12345678901234567890n];
  let allMatch = true;
  const check1 = [];
  for (const x of singleInputs) {
    const libOut = F.toObject(poseidon([x])); // circomlib Poseidon([x])
    const refOut = await poseidonHash1(x); // our reference sponge
    const ok = libOut === refOut;
    allMatch = allMatch && ok;
    check1.push({ input: x.toString(), lib: toHex32(libOut), ref: toHex32(refOut), ok });
    console.log(`  Poseidon1(${x})  lib==ref ${pass(ok)}`);
  }

  // ---- Build the shared vectors for the contract ----
  // Domain and message-id sample byte strings.
  const domainBytes = enc.encode("bank.example.com");
  const msgIdBytes = enc.encode("<abc123.20260701.deadbeef@bank.example.com>");

  const domainField = await bytesToField(domainBytes, DOMAIN_BYTES);
  const msgIdField = await bytesToField(msgIdBytes, MSGID_BYTES);
  const domainHash = await hashDomain(domainBytes);
  const nullifier = await hashMessageId(msgIdBytes);

  // Attestation chain sample: root0 = 0; digest = Poseidon1(threshold) as a stand-in
  // single-field fold; root1 = Poseidon1( bytesToField(prev_root||digest) ).
  const prevRoot = 0n;
  const threshold = 1000000n;
  const digest = await poseidonHash1(threshold);
  // fold (prev_root, digest) -> one field via 31-byte LE serialization of their
  // concatenated 32-byte BE encodings, then Poseidon1 (single locked shape).
  const concat = new Uint8Array(64);
  const be = (v) => {
    const b = new Uint8Array(32);
    let t = v;
    for (let i = 31; i >= 0; i--) { b[i] = Number(t & 0xffn); t >>= 8n; }
    return b;
  };
  concat.set(be(prevRoot), 0);
  concat.set(be(digest), 32);
  const foldedRootIn = await bytesToField(concat, 64);
  const root1 = await poseidonHash1(foldedRootIn);

  const vectors = {
    note: "Shared Task-1 cross-check vectors. mint_guard unit test MUST reproduce every 'out' byte-for-byte using the host poseidon_permutation + locked constants.",
    poseidon_params: { field: "BN254", t: 2, d: 5, rounds_f: 8, rounds_p: 56 },
    single_input_hash: check1.map(({ input, ref }) => ({ input, out: ref })),
    serialization: [
      { name: "domain", bytes_utf8: "bank.example.com", fixed_len: DOMAIN_BYTES, folded_field: toHex32(domainField), poseidon_out: toHex32(domainHash) },
      { name: "message_id", bytes_utf8: "<abc123.20260701.deadbeef@bank.example.com>", fixed_len: MSGID_BYTES, folded_field: toHex32(msgIdField), poseidon_out: toHex32(nullifier) },
    ],
    attestation_chain: {
      prev_root: toHex32(prevRoot),
      threshold: threshold.toString(),
      digest: toHex32(digest),
      folded_root_in: toHex32(foldedRootIn),
      new_root: toHex32(root1),
    },
  };

  mkdirSync(buildDir, { recursive: true });
  writeFileSync(join(buildDir, "poseidon_crosscheck_vectors.json"), JSON.stringify(vectors, null, 2));

  console.log("");
  console.log(`  domain_hash = ${toHex32(domainHash)}`);
  console.log(`  nullifier   = ${toHex32(nullifier)}`);
  console.log(`  attest root = ${toHex32(root1)}`);
  console.log("");
  console.log("[crosscheck] wrote build/poseidon_crosscheck_vectors.json");
  console.log(`[crosscheck] reference-vs-circomlibjs single-input parity: ${pass(allMatch)}`);
  if (!allMatch) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
