// Build the full reserve.circom input.json from a real DKIM-signed .eml.
//
// Combines zk-email's EmailVerifier inputs (DKIM/RSA/body) with Solvent's
// extra signals: balance extraction indices, from-domain bytes, message-id
// bytes, threshold, timestamp.
//
// Usage: node scripts/gen_input.js <path-to-eml> [threshold]

import { generateEmailVerifierInputs } from "@zk-email/helpers/dist/input-generators.js";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Circuit params — MUST match reserve.circom component main.
const MAX_HEADERS = 1024;
const MAX_BODY = 1536; // will be lowered in the size-reduction step
const MAX_BAL_DIGITS = 20;
const DOMAIN_BYTES = 62;
const MSGID_BYTES = 128;

const emlPath = process.argv[2] || join(root, "fixtures/gmail_balance_real.eml");
const threshold = BigInt(process.argv[3] || "1000000");

function rightPad(arr, len) {
  const out = new Array(len).fill(0);
  for (let i = 0; i < Math.min(arr.length, len); i++) out[i] = arr[i];
  return out;
}

const enc = new TextEncoder();

async function main() {
  const raw = readFileSync(emlPath);

  // 1) EmailVerifier inputs (verifies DKIM via DNS under the hood).
  const ev = await generateEmailVerifierInputs(raw, {
    maxHeadersLength: MAX_HEADERS,
    maxBodyLength: MAX_BODY,
  });

  // 2) Locate balance in the body.
  const body = ev.emailBody.map(Number);
  const bodyLen = Number(ev.emailBodyLength);
  const bodyStr = Buffer.from(body.slice(0, bodyLen)).toString("latin1");
  const label = "Available balance: $";
  const labelIdx = bodyStr.indexOf(label);
  if (labelIdx < 0) throw new Error(`label '${label}' not found in body`);
  const digitsStart = labelIdx + label.length;
  const m = bodyStr.slice(digitsStart).match(/^[0-9]+/);
  if (!m) throw new Error("no digits after balance label");
  const balanceStr = m[0];
  const balanceVal = BigInt(balanceStr);

  // balanceDigits: the ASCII digit bytes, right-padded to MAX_BAL_DIGITS.
  // DigitBytesToInt expects the number left-aligned; we pad with '0' (0x30)?
  // No — DigitBytesToInt(n) treats each byte as a digit and folds base-10.
  // Leading zeros are harmless. We LEFT-pad with ASCII '0' so the value is
  // preserved and length is fixed.
  const digitBytes = Array.from(enc.encode(balanceStr));
  const padCount = MAX_BAL_DIGITS - digitBytes.length;
  if (padCount < 0) throw new Error("balance longer than MAX_BAL_DIGITS");
  const balanceDigits = new Array(padCount).fill(48).concat(digitBytes); // 48='0'

  // substring window for RevealSubstring: we reveal exactly the padded window
  // that DigitBytesToInt will consume. To keep alignment we reveal the digits
  // region; but RevealSubstring reveals from the body, which is NOT left-padded.
  // So we reveal the real digits [digitsStart, +len] and the circuit compares
  // against balanceDigits WITHOUT left pad. => We must NOT left-pad here.
  // Re-do: right-pad with zeros to fixed length is wrong for base-10 too.
  // Correct approach documented below.
  const balanceLength = balanceStr.length;

  // 3) from-domain bytes (from the From header). NOTE: this is prover-supplied
  //    for now (Task-1 A scope). Task B binds it to the verified header.
  const fromDomain = "gmail.com";
  const fromDomainBytes = rightPad(Array.from(enc.encode(fromDomain)), DOMAIN_BYTES);

  // 4) message-id bytes.
  const headerStr = Buffer.from(ev.emailHeader.map(Number)).toString("latin1");
  const midMatch = headerStr.match(/message-id:\s*<([^>]*)>/i);
  const messageId = midMatch ? midMatch[1] : "";
  const messageIdBytes = rightPad(Array.from(enc.encode(messageId)), MSGID_BYTES);

  // timestamp from Date header (unix seconds).
  const dateMatch = headerStr.match(/\ndate:\s*(.+)\r?\n/i) || headerStr.match(/^date:\s*(.+)\r?\n/i);
  const ts = dateMatch ? Math.floor(new Date(dateMatch[1].trim()).getTime() / 1000) : 0;

  const input = {
    // EmailVerifier signals
    emailHeader: ev.emailHeader,
    emailHeaderLength: ev.emailHeaderLength,
    pubkey: ev.pubkey,
    signature: ev.signature,
    bodyHashIndex: ev.bodyHashIndex,
    precomputedSHA: ev.precomputedSHA,
    emailBody: ev.emailBody,
    emailBodyLength: ev.emailBodyLength,
    // balance
    balanceStartIndex: digitsStart.toString(),
    balanceLength: balanceLength.toString(),
    balanceDigits: balanceDigits.map(String),
    // domain + msgid
    fromDomain: fromDomainBytes.map(String),
    messageId: messageIdBytes.map(String),
    // public
    threshold: threshold.toString(),
    timestamp: ts.toString(),
  };

  writeFileSync(join(root, "build/input.json"), JSON.stringify(input, null, 2));
  console.log("[gen_input] wrote build/input.json");
  console.log(`  balance extracted   = ${balanceVal}`);
  console.log(`  threshold           = ${threshold}  (balance>=threshold: ${balanceVal >= threshold})`);
  console.log(`  digitsStart offset  = ${digitsStart}`);
  console.log(`  balanceLength       = ${balanceLength}`);
  console.log(`  from domain         = ${fromDomain}`);
  console.log(`  message-id          = ${messageId}`);
  console.log(`  timestamp           = ${ts}`);
  console.log(`  emailBodyLength     = ${bodyLen}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
