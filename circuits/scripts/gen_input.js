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
const MAX_HEADERS = 640;
const MAX_BODY = 384;
const MAX_BAL_DIGITS = 20;
const FROM_WINDOW = 192;

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
  const balanceLength = balanceStr.length;
  if (balanceLength > MAX_BAL_DIGITS) throw new Error("balance longer than MAX_BAL_DIGITS");

  // NOTE: no prover-supplied digit bytes. The circuit derives the value from
  // the VERIFIED body via RevealSubstring + DigitBytesToIntPadded. We only
  // pass the start index and length (both range-checked in-circuit).

  // 3) From-window start: locate the "from:" header line within the SIGNED
  //    header and pick a window start so the whole From line fits in
  //    FROM_WINDOW. The circuit's FromAddrRegex asserts `from:` is present in
  //    the window, so this index is validated in-circuit (a wrong start fails).
  const headerStr = Buffer.from(ev.emailHeader.map(Number)).toString("latin1");
  const fromLineIdx = headerStr.search(/\r\nfrom:/i);
  // +2 to land on 'from' (skip the CRLF); clamp to >=0.
  let fromWindowStart = fromLineIdx >= 0 ? fromLineIdx + 2 : headerStr.search(/^from:/i);
  if (fromWindowStart < 0) throw new Error("'from:' header not found");
  // Ensure window fits inside maxHeaders.
  if (fromWindowStart + FROM_WINDOW > MAX_HEADERS) {
    fromWindowStart = MAX_HEADERS - FROM_WINDOW;
  }

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
    // balance (offset/length only; value derived from verified body in-circuit)
    balanceStartIndex: digitsStart.toString(),
    balanceLength: balanceLength.toString(),
    // from-address window start (validated in-circuit by FromAddrRegex)
    fromWindowStart: fromWindowStart.toString(),
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
  console.log(`  fromWindowStart     = ${fromWindowStart}`);
  console.log(`  from line preview   = ${JSON.stringify(headerStr.slice(fromWindowStart, fromWindowStart + 48))}`);
  console.log(`  timestamp           = ${ts}`);
  console.log(`  emailBodyLength     = ${bodyLen}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
