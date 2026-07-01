// Convert snarkjs verification_key.json (bn128, decimal-string coords) into the
// Ethereum-compatible BN254 byte encodings that Stellar's soroban-sdk expects:
//   Bn254G1Affine = 64 bytes  = X(32 BE) || Y(32 BE)
//   Bn254G2Affine = 128 bytes = X_c1(32) || X_c0(32) || Y_c1(32) || Y_c0(32)
//
// NOTE the G2 coordinate order. snarkjs stores G2 as [[x_c0, x_c1],[y_c0,y_c1]]
// (imaginary-part-second). The Ethereum/EIP-197 precompile encoding — which the
// Stellar host functions follow — is (c1, c0) i.e. imaginary-part-FIRST. We swap.
//
// Output: build/vkey_soroban.json — hex byte arrays ready for the mint_guard
// contract constructor. Also emits ic[] (one G1 per public signal + 1).

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const buildDir = join(__dirname, "..", "build");

const vk = JSON.parse(readFileSync(join(buildDir, "verification_key.json"), "utf8"));

const to32BE = (dec) => {
  let x = BigInt(dec);
  const b = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) { b[i] = Number(x & 0xffn); x >>= 8n; }
  return b;
};
const hex = (u8) => "0x" + Buffer.from(u8).toString("hex");
const concat = (...arrs) => { const out = []; for (const a of arrs) out.push(...a); return Uint8Array.from(out); };

// G1: [x, y, 1] -> 64 bytes
const g1 = (p) => hex(concat(to32BE(p[0]), to32BE(p[1])));
// G2: [[x_c0,x_c1],[y_c0,y_c1],[1,0]] -> 128 bytes, swap to (c1,c0)
const g2 = (p) => hex(concat(
  to32BE(p[0][1]), to32BE(p[0][0]),   // X: c1, c0
  to32BE(p[1][1]), to32BE(p[1][0]),   // Y: c1, c0
));

const out = {
  curve: "bn254",
  nPublic: vk.nPublic,
  alpha: g1(vk.vk_alpha_1),
  beta: g2(vk.vk_beta_2),
  gamma: g2(vk.vk_gamma_2),
  delta: g2(vk.vk_delta_2),
  ic: vk.IC.map(g1),
};

if (out.ic.length !== vk.nPublic + 1) {
  throw new Error(`IC length ${out.ic.length} != nPublic+1 ${vk.nPublic + 1}`);
}

writeFileSync(join(buildDir, "vkey_soroban.json"), JSON.stringify(out, null, 2));
console.log("[vkey:soroban] wrote build/vkey_soroban.json");
console.log(`  nPublic=${out.nPublic}  ic points=${out.ic.length}`);
console.log(`  alpha(G1)=${out.alpha.slice(0, 26)}...`);
