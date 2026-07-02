// Solvent — client-side testnet reader (NO backend).
// Reads the on-chain attestation for a registered issuer directly from the
// deployed mint_guard contract via Soroban RPC simulation (read-only).

import {
  Contract,
  TransactionBuilder,
  Account,
  nativeToScVal,
  scValToNative,
  BASE_FEE,
  Networks,
} from "@stellar/stellar-sdk";
import { Server } from "@stellar/stellar-sdk/rpc";
import { Buffer } from "buffer";

export const CONTRACT_ID =
  "CDPPM3EWAVVEE23LQVANCCRI4ERRBGJT4OUDTR46NRVDZFKAKDGYTDL5";
export const RPC_URL = "https://soroban-testnet.stellar.org";
export const NETWORK_PASSPHRASE = Networks.TESTNET;
export const EXPLORER = "https://stellar.expert/explorer/testnet";

// The demo issuer's sender_hash (Poseidon of the From address). We show the
// human label "Acme Bank (demo)"; the underlying email address is never shown.
export const DEMO_ISSUER = {
  label: "Acme Bank (demo)",
  senderHashHex:
    "276c30876cbcb6ecf80951c8073f16c1af30ab8fe055824eed46b0a72be91aa5",
};

// The prove_reserve transaction that verified the proof on-chain.
export const PROVE_TX =
  "32117d2f667119578b4f4e92214662aadb194d03dcd341f61935ad6be18b9c1b";

export interface Attestation {
  threshold: bigint;
  timestamp: bigint;
  nullifier: string; // hex
}

function hexToBytes(hex: string): Buffer {
  return Buffer.from(hex, "hex");
}

// Read-only contract call via RPC simulation. No signing, no fees, no wallet.
export async function getAttestation(
  senderHashHex: string,
): Promise<Attestation | null> {
  const server = new Server(RPC_URL);
  const contract = new Contract(CONTRACT_ID);

  // Any valid account works as the simulation source (never submitted, no
  // fees). We use a well-known testnet address purely for its valid format.
  const dummy = new Account(
    "GAUVJS22CRSAJMBMXQO42JRGNITJVGA2IHR5OUV6UKHYQYQ5YIZEBTIB",
    "0",
  );

  const senderScVal = nativeToScVal(hexToBytes(senderHashHex), {
    type: "bytes",
  });

  const tx = new TransactionBuilder(dummy, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call("get_attestation", senderScVal))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);

  if ("error" in sim && sim.error) {
    throw new Error(`simulation failed: ${sim.error}`);
  }
  const retval = (sim as any).result?.retval;
  if (!retval) return null;

  const native = scValToNative(retval);
  if (native == null) return null; // Option::None -> no attestation yet

  return {
    threshold: BigInt(native.threshold.toString()),
    timestamp: BigInt(native.timestamp.toString()),
    nullifier: Buffer.from(native.nullifier).toString("hex"),
  };
}

export function formatUsd(n: bigint): string {
  return "$" + n.toLocaleString("en-US");
}

export function formatDate(unixSeconds: bigint): string {
  return new Date(Number(unixSeconds) * 1000).toISOString().slice(0, 10);
}
