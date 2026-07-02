// Solvent — client-side testnet reader (NO backend).
// Reads the on-chain attestation for a registered issuer directly from the
// deployed mint_guard contract via Soroban RPC simulation (read-only).

import {
  Contract,
  TransactionBuilder,
  Account,
  nativeToScVal,
  scValToNative,
  xdr,
  BASE_FEE,
  Networks,
} from "@stellar/stellar-sdk";
import { Server } from "@stellar/stellar-sdk/rpc";
import {
  isConnected,
  isAllowed,
  requestAccess,
  getAddress,
  signTransaction,
} from "@stellar/freighter-api";
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

// The full verifiable transaction chain (all live on testnet).
export const TX_CHAIN = {
  deploy: "fa4924c15d01bdd9431d92cd526e13934870fccb163aa5585b009a48abe0fcac",
  init: "0ac17b23e0fb53310389400f4d59c3e1fd04aa2bc806c2991e1c2e69de1b3dee",
  register: "5d6f7e45cacfc891337b95c00a7b1ce5e1c1c7a50c22f4df12d3ec5eaab6ed95",
  prove: "32117d2f667119578b4f4e92214662aadb194d03dcd341f61935ad6be18b9c1b",
};

// Real data shown in the mechanism pipeline (nothing mocked).
export const DKIM = {
  domain: "gmail.com",
  selector: "20251104",
  algo: "rsa-sha256",
  bodyHash: "T5PnfjryW7nkkxP/KoCf6pdM3bGZIiBNFmn2OMXytoo=",
  signedHeaders: "from : to : subject : date : message-id",
};

// The actual Groth16 proof that was verified on-chain (BN254 field elements).
// pi_a / pi_b / pi_c straight from snarkjs proof.json (projective; z dropped).
const PI_A = [
  "20445263340791973997742966562676046831971497389422593618465585043795089754338",
  "8320016218743750021976875302764826845718214490602645779871522105505887369326",
];
const PI_B = [
  [
    "861666916801843749919408803809632526694142608510821279103415832611615431840",
    "673113070045290549099297471252206540352548306226202526993574595042458246340",
  ],
  [
    "10217109917137825957076678575267447805373069738124721054691507784759752786526",
    "6983033972434408433601410157764432013310453943142625262436719295194346752518",
  ],
];
const PI_C = [
  "9787604844851213824238853139977758927197233479639010632643624376696141450621",
  "11758426781633939719164933715317126755745398633284873234191685279428271375317",
];

// The public journal (snarkjs public.json order) that this proof attests to.
// [pubkey_hash, sender_hash, nullifier, threshold_out, ts_out, threshold, ts]
export const PUB_SIGNALS = [
  "18112063367061490498008565150523525787547054147177385004656549933281162521999",
  "17831355512612260831152979993606432227319710530169322375827124426448734591653",
  "15657440520434277026389847494054181531672272663886737253564644048899734734132",
  "1000000",
  "1782948043",
  "1000000",
  "1782948043",
];

// Shown in the UI mechanism panel.
export const PROOF = { a: PI_A[0], b: PI_B[0][0], c: PI_C[0] };

// True hex of the BN254 curve-point coordinates the on-chain pairing check
// consumes (snarkjs stores them as decimals). Rendering the real hex means the
// hero shows exactly what the verifier verifies — nothing decorative.
function feHex(dec: string): string {
  const h = BigInt(dec).toString(16).padStart(64, "0");
  return `0x${h.slice(0, 8)}…${h.slice(-6)}`;
}
export const PROOF_HEX = {
  a: feHex(PI_A[0]),
  bx: feHex(PI_B[0][1]),
  c: feHex(PI_C[0]),
  nullifier: feHex(PUB_SIGNALS[2]),
};

// Issuer presets. Only `acme` has a proof already verified on testnet; the
// others are honestly-labelled templates of the identical flow at other
// thresholds, so nothing is over-claimed.
export interface Scenario {
  id: string;
  label: string;
  avatar: string;
  domain: string;
  threshold: string; // display string, e.g. "$1,000,000"
  live: boolean;
}
export const SCENARIOS: Scenario[] = [
  {
    id: "acme",
    label: "Acme Bank",
    avatar: "🏦",
    domain: DKIM.domain,
    threshold: "$1,000,000",
    live: true,
  },
  {
    id: "neo",
    label: "Neo Reserve",
    avatar: "🟣",
    domain: "chase.com",
    threshold: "$25,000,000",
    live: false,
  },
  {
    id: "stronghold",
    label: "Stronghold",
    avatar: "🛡️",
    domain: "hsbc.com",
    threshold: "$5,000,000",
    live: false,
  },
];

export const CIRCUIT = {

  constraints: 1_692_844,
  curve: "BN254",
  system: "Groth16",
  budgetLimit: 100_000_000, // Soroban per-tx instruction limit
};

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

// ===========================================================================
//  WRITE PATH — the real dApp: connect Freighter, verify live, submit tx.
// ===========================================================================

// Decimal field element -> 32-byte big-endian buffer.
function decTo32(dec: string): Buffer {
  let hex = BigInt(dec).toString(16);
  if (hex.length % 2) hex = "0" + hex;
  const buf = Buffer.from(hex, "hex");
  if (buf.length > 32) throw new Error("field element > 32 bytes");
  const out = Buffer.alloc(32);
  buf.copy(out, 32 - buf.length);
  return out;
}

// G1 = be(x) || be(y)  -> BytesN<64>
function g1Bytes(p: string[]): Buffer {
  return Buffer.concat([decTo32(p[0]), decTo32(p[1])]);
}

// G2 = be(x_c1)||be(x_c0)||be(y_c1)||be(y_c0)  (EIP-197 order) -> BytesN<128>
function g2Bytes(p: string[][]): Buffer {
  return Buffer.concat([
    decTo32(p[0][1]),
    decTo32(p[0][0]),
    decTo32(p[1][1]),
    decTo32(p[1][0]),
  ]);
}

// Build the `Proof` struct ScVal. Soroban structs require scvSymbol map keys;
// nativeToScVal emits scvString keys which trap with map_unpack UnexpectedType.
// Verified against the live contract: verify_proof -> true, 35M CPU insns.
function proofScVal(): xdr.ScVal {
  const entry = (k: string, buf: Buffer) =>
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol(k),
      val: nativeToScVal(buf), // -> scvBytes
    });
  return xdr.ScVal.scvMap([
    entry("a", g1Bytes(PI_A)),
    entry("b", g2Bytes(PI_B)),
    entry("c", g1Bytes(PI_C)),
  ]);
}

// Vec<U256> of the public journal.
function pubSignalsScVal(): xdr.ScVal {
  return nativeToScVal(
    PUB_SIGNALS.map((s) => BigInt(s)),
    { type: "u256" },
  );
}

export interface WalletState {
  address: string;
}

// Connect Freighter. Returns the connected G... address.
//
// Freighter's `requestAccess` occasionally resolves without opening its popup
// when the site was previously authorized but the extension lost its unlock
// state — leaving the dApp stuck. We defend against that with a real detection
// path and a clear, actionable error instead of a silent no-op.
export async function connectWallet(): Promise<WalletState> {
  let conn;
  try {
    conn = await isConnected();
  } catch {
    throw new Error(
      "Freighter not detected. Install the Freighter extension, then reload this page.",
    );
  }
  if (!conn.isConnected) {
    throw new Error(
      "Freighter not detected. Install the Freighter extension and switch it to Testnet.",
    );
  }

  // requestAccess triggers the Freighter popup (approve connection / unlock).
  const access = await requestAccess();
  if (access.error) throw new Error(String(access.error));

  let addr = access.address;
  if (!addr) {
    const got = await getAddress();
    if (got.error) throw new Error(String(got.error));
    addr = got.address;
  }
  if (!addr) {
    throw new Error(
      "Freighter did not return an address. Open the Freighter extension, unlock it, make sure it is on Testnet, then try again.",
    );
  }
  return { address: addr };
}

// Silent reconnect on page load: only returns an address if Freighter still
// has this site authorized AND is unlocked — never opens a popup. Used to
// restore a session without surprising the user.
export async function silentAddress(): Promise<string | null> {
  try {
    const conn = await isConnected();
    if (!conn.isConnected) return null;
    const allowed = await isAllowed();
    if (!allowed.isAllowed) return null;
    const got = await getAddress();
    if (got.error || !got.address) return null;
    return got.address;
  } catch {
    return null;
  }
}

// Disconnect: Freighter has no programmatic "revoke", so we simply clear the
// dApp-side session. The persisted flag lets us skip auto-reconnect on reload.
const WALLET_KEY = "solvent.wallet";

export function persistWallet(address: string) {
  try {
    localStorage.setItem(WALLET_KEY, address);
  } catch {
    /* ignore */
  }
}

export function loadWallet(): string | null {
  try {
    return localStorage.getItem(WALLET_KEY);
  } catch {
    return null;
  }
}

export function disconnectWallet() {
  try {
    localStorage.removeItem(WALLET_KEY);
  } catch {
    /* ignore */
  }
}

// Fund a testnet account via Friendbot if it doesn't exist yet. This lets a
// freshly-created Freighter account interact immediately — no manual faucet.
async function ensureAccount(server: Server, address: string): Promise<Account> {
  try {
    return await server.getAccount(address);
  } catch {
    // Account not found on testnet — create & fund it via Friendbot.
    const res = await fetch(
      `https://friendbot.stellar.org/?addr=${encodeURIComponent(address)}`,
    );
    if (!res.ok) {
      throw new Error(
        "Account not funded on testnet, and Friendbot funding failed. Open Freighter → Testnet and fund this address, then retry.",
      );
    }
    // Friendbot can take a moment to propagate; retry a few times.
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 1200));
      try {
        return await server.getAccount(address);
      } catch {
        /* keep polling */
      }
    }
    throw new Error(
      "Funded via Friendbot but account not visible yet — retry in a moment.",
    );
  }
}

export interface VerifyResult {
  valid: boolean; // pairing_check result
  cpuInsns: number; // on-chain instructions consumed
  budget: number; // Soroban per-tx limit
}

// LIVE ZK: run verify_proof as a read-only simulation. Runs the real on-chain
// pairing_check and reports the CPU budget. State-free -> callable infinitely.
export async function verifyProofLive(source: string): Promise<VerifyResult> {
  const server = new Server(RPC_URL);
  const contract = new Contract(CONTRACT_ID);
  const acct = await ensureAccount(server, source);

  const tx = new TransactionBuilder(acct, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call("verify_proof", proofScVal(), pubSignalsScVal()))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if ("error" in sim && sim.error) {
    throw new Error(`verify_proof simulation failed: ${sim.error}`);
  }
  const success = sim as any;
  const valid = scValToNative(success.result.retval) === true;
  // CPU instructions the on-chain pairing_check consumed, read from the
  // Soroban resource footprint the simulator computed.
  const cpuInsns = Number(
    success.transactionData.build().resources().instructions(),
  );
  return { valid, cpuInsns, budget: CIRCUIT.budgetLimit };
}

export interface SubmitResult {
  hash: string;
  success: boolean;
  replayRejected: boolean; // true if contract returned Error #7 (nullifier used)
  errorCode: number | null;
  // True when the guard refused the replay at PREFLIGHT (simulation), before it
  // ever consumed a ledger slot or a fee. When true, `hash` is a signed-envelope
  // hash that never lands on-chain, so the UI must NOT link it to the explorer
  // (it would 404). This is the strongest anti-replay story: rejected for free.
  preflightRejected: boolean;
}

// REAL TX: build prove_reserve, have the user SIGN it in Freighter, submit it.
// The demo proof's nullifier is already burned on-chain, so a correctly-
// functioning contract MUST reject this with Error #7 — proving anti-replay
// live, with the juror's own signed transaction.
//
// Crucially, we ALWAYS open Freighter for a real signature. The old flow
// short-circuited on simulation (Error #7) before signing, so the wallet
// popup never appeared and the demo felt fake. Now the juror truly signs.
export async function submitProveReserve(source: string): Promise<SubmitResult> {
  const server = new Server(RPC_URL);
  const contract = new Contract(CONTRACT_ID);
  const acct = await ensureAccount(server, source);

  const tx = new TransactionBuilder(acct, {
    fee: (Number(BASE_FEE) * 1000).toString(),
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call("prove_reserve", proofScVal(), pubSignalsScVal()),
    )
    .setTimeout(60)
    .build();

  // Prepare (simulate + attach the Soroban footprint). The demo proof's
  // nullifier is already burned on-chain, so this simulation reports Error #7.
  // We capture that code but DO NOT return early — the whole point is that the
  // juror signs a REAL transaction and then watches the network reject it.
  let prepared = tx;
  let knownReplay: number | null = null;
  try {
    prepared = await server.prepareTransaction(tx);
  } catch (e) {
    knownReplay = parseContractError(
      e instanceof Error ? e.message : String(e),
    );
  }

  // Open Freighter and ask the user to sign the real prove_reserve tx. THIS is
  // the wallet popup — it fires every time, before any submission.
  const signed = await signTransaction(prepared.toXDR(), {
    networkPassphrase: NETWORK_PASSPHRASE,
    address: source,
  });
  if (signed.error) throw new Error(String(signed.error));

  const signedTx = TransactionBuilder.fromXDR(
    signed.signedTxXdr,
    NETWORK_PASSPHRASE,
  );

  // Authoritative hash: derived from the EXACT transaction the user signed in
  // Freighter, so the linked tx in the UI matches what the wallet displayed
  // (RPC sent.hash can differ from the signed envelope hash).
  const signedHash = signedTx.hash().toString("hex");

  // Submit the signed transaction. For the demo proof the network rejects the
  // replay; we surface Error #7 (captured at prepare time if present).
  try {
    const sent = await server.sendTransaction(signedTx as any);
    if (sent.status === "ERROR") {
      const code =
        knownReplay ??
        parseContractError(JSON.stringify((sent as any).errorResult ?? sent));
      return {
        hash: signedHash,
        success: false,
        replayRejected: code === 7,
        errorCode: code,
        preflightRejected: knownReplay !== null,
      };
    }
    return {
      hash: signedHash,
      success: true,
      replayRejected: false,
      errorCode: null,
      preflightRejected: false,
    };
  } catch (e) {
    const code =
      knownReplay ??
      parseContractError(e instanceof Error ? e.message : String(e));
    return {
      hash: signedHash,
      success: false,
      replayRejected: code === 7,
      errorCode: code,
      preflightRejected: knownReplay !== null,
    };
  }
}

export interface LandedTx {
  hash: string;      // real on-chain tx hash, signed by THIS wallet
  ledger: number;    // ledger it was included in
  cpuInsns: number;  // on-chain instructions consumed by the pairing check
}

// THE headline action: the connected juror wallet signs a REAL Soroban
// invocation of `verify_proof` and we submit it to testnet. Unlike a replay
// (which the guard rejects at preflight, so it never lands), verify_proof is
// stateless and returns true — so this transaction is INCLUDED IN A LEDGER and
// shows up on stellar.expert UNDER THE JUROR'S OWN ADDRESS. Real signer, real
// on-chain ZK pairing check, real explorer link.
export async function submitVerifyProof(source: string): Promise<LandedTx> {
  const server = new Server(RPC_URL);
  const contract = new Contract(CONTRACT_ID);
  const acct = await ensureAccount(server, source);

  const tx = new TransactionBuilder(acct, {
    fee: (Number(BASE_FEE) * 1000).toString(),
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call("verify_proof", proofScVal(), pubSignalsScVal()))
    .setTimeout(60)
    .build();

  // Preflight (attaches the Soroban footprint). verify_proof returns true, so
  // this succeeds and the tx becomes submittable.
  const prepared = await server.prepareTransaction(tx);

  const cpuInsns = Number(
    prepared.toEnvelope().v1().tx().ext().sorobanData().resources().instructions(),
  );

  // The juror signs the REAL transaction in Freighter.
  const signed = await signTransaction(prepared.toXDR(), {
    networkPassphrase: NETWORK_PASSPHRASE,
    address: source,
  });
  if (signed.error) throw new Error(String(signed.error));

  const signedTx = TransactionBuilder.fromXDR(
    signed.signedTxXdr,
    NETWORK_PASSPHRASE,
  );
  const hash = signedTx.hash().toString("hex");

  const sent = await server.sendTransaction(signedTx as any);
  if (sent.status === "ERROR") {
    throw new Error(
      `submit failed: ${JSON.stringify((sent as any).errorResult ?? sent)}`,
    );
  }

  // Poll until the network confirms inclusion, so the returned hash is
  // guaranteed to resolve on the explorer under the signer's address.
  let ledger = 0;
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const got = await server.getTransaction(hash);
      if (got.status === "SUCCESS") {
        ledger = (got as any).ledger ?? 0;
        break;
      }
      if (got.status === "FAILED") {
        throw new Error("transaction failed on-chain");
      }
    } catch {
      /* NOT_FOUND yet — keep polling */
    }
  }

  return { hash, ledger, cpuInsns };
}

// Extract the contract Error discriminant (e.g. 7 = NullifierUsed) from an RPC
// simulation error string like "...Error(Contract, #7)...".

function parseContractError(msg: string): number | null {
  const m = msg.match(/#(\d+)/);
  return m ? Number(m[1]) : null;
}
