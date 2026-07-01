// Generate MOCK DKIM-signed bank balance emails for end-to-end testing.
//
// ⚠️ THESE ARE MOCKS. We create our own RSA-2048 keypair and DKIM-sign a
// synthetic email. No real bank, no real DNS key. The circuit's DKIM check is
// real; only the signing key is self-generated. Clearly labelled in README.
//
// Emits:
//   fixtures/mock_balance_email.eml       — minimal mock
//   fixtures/real_format_balance.eml       — realistic bank layout (still mock)
//   fixtures/mock_dkim_private.pem         — the mock signer key (gitignored)
//   fixtures/README.md                     — provenance / labelling

import { generateKeyPairSync, createSign, createHash } from "crypto";
import { writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fx = join(__dirname, "..", "fixtures");
mkdirSync(fx, { recursive: true });

const DOMAIN = "bank.example.com";
const SELECTOR = "solvent";

// 1) Mock RSA-2048 keypair (the "bank" DKIM key).
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privPem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
const pubPem = publicKey.export({ type: "spki", format: "pem" }).toString();
writeFileSync(join(fx, "mock_dkim_private.pem"), privPem);
writeFileSync(join(fx, "mock_dkim_public.pem"), pubPem);

// DKIM public key base64 (for the mock DNS TXT record documentation).
const pubDer = publicKey.export({ type: "spki", format: "der" });
const dnsTxt = `${SELECTOR}._domainkey.${DOMAIN} IN TXT "v=DKIM1; k=rsa; p=${pubDer.toString("base64")}"`;
writeFileSync(join(fx, "mock_dkim_dns_txt.txt"), dnsTxt + "\n");

// 2) Build an email, DKIM-sign header (relaxed/relaxed, sha256, bh over body).
function canonBodyRelaxed(body) {
  // relaxed body canon: strip trailing ws each line, collapse internal WSP,
  // remove trailing empty lines, ensure single CRLF at end.
  let lines = body.replace(/\r?\n/g, "\r\n").split("\r\n");
  lines = lines.map((l) => l.replace(/[ \t]+/g, " ").replace(/[ \t]+$/g, ""));
  let s = lines.join("\r\n");
  s = s.replace(/(\r\n)+$/g, "") + "\r\n";
  return s;
}
function canonHeaderRelaxed(name, value) {
  const n = name.toLowerCase();
  const v = value.replace(/\r?\n[ \t]+/g, " ").replace(/[ \t]+/g, " ").trim();
  return `${n}:${v}`;
}
function bodyHash(body) {
  return createHash("sha256").update(canonBodyRelaxed(body), "utf8").digest("base64");
}

function buildEmail({ from, to, subject, date, messageId, body }) {
  const bh = bodyHash(body);
  const headers = {
    from,
    to,
    subject,
    date,
    "message-id": messageId,
    "mime-version": "1.0",
    "content-type": 'text/plain; charset="UTF-8"',
  };
  const signedHeaderNames = ["from", "to", "subject", "date", "message-id"];
  const dkimHeaderBase =
    `v=1; a=rsa-sha256; c=relaxed/relaxed; d=${DOMAIN}; s=${SELECTOR}; ` +
    `t=${Math.floor(new Date(date).getTime() / 1000)}; ` +
    `bh=${bh}; h=${signedHeaderNames.join(":")}; b=`;
  // string that gets signed: canon signed headers + the DKIM-Signature w/ empty b=
  const canonParts = signedHeaderNames.map((h) =>
    canonHeaderRelaxed(h, headers[h])
  );
  const dkimCanon = canonHeaderRelaxed(
    "dkim-signature",
    dkimHeaderBase
  ).replace(/;?\s*$/, ""); // no trailing after b=
  const toSign = canonParts.concat([dkimCanon]).join("\r\n");
  const sig = createSign("RSA-SHA256").update(toSign, "utf8").sign(privateKey).toString("base64");

  const dkimHeader = `DKIM-Signature: ${dkimHeaderBase}${sig}`;
  const rawHeaders = [
    `DKIM-Signature: ${dkimHeaderBase}${sig}`,
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Date: ${date}`,
    `Message-ID: ${messageId}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset="UTF-8"`,
  ].join("\r\n");
  const canonBody = canonBodyRelaxed(body);
  return rawHeaders + "\r\n\r\n" + canonBody;
}

// --- Minimal mock ---
const mock = buildEmail({
  from: `Bank Statements <statements@${DOMAIN}>`,
  to: "Issuer <issuer@solvent.example>",
  subject: "Your account balance",
  date: "Wed, 01 Jul 2026 09:15:00 +0000",
  messageId: `<mock-0001.20260701@${DOMAIN}>`,
  body: `Hello,\n\nAvailable balance: $1000000\n\nThank you for banking with us.\n`,
});
writeFileSync(join(fx, "mock_balance_email.eml"), mock);

// --- Realistic bank layout (still fully synthetic / mock signer) ---
const realFmt = buildEmail({
  from: `Example Bank Alerts <no-reply@${DOMAIN}>`,
  to: "Treasury Ops <treasury@solvent-issuer.example>",
  subject: "Daily Reserve Statement — Account ****4821",
  date: "Wed, 01 Jul 2026 06:00:00 +0000",
  messageId: `<stmt.4821.20260701T0600Z.a1b2c3@${DOMAIN}>`,
  body:
    `Dear Treasury Operations Team,\n\n` +
    `This is your automated daily reserve statement for settlement account\n` +
    `ending 4821 held at Example Bank, N.A.\n\n` +
    `Statement date: 2026-07-01\n` +
    `Account holder: Solvent Issuer LLC\n` +
    `Available balance: $1500000\n` +
    `Ledger balance: $1500000\n\n` +
    `This message is cryptographically signed (DKIM) by the sending domain.\n` +
    `Do not reply.\n`,
});
writeFileSync(join(fx, "real_format_balance.eml"), realFmt);

writeFileSync(
  join(fx, "README.md"),
  `# Fixtures — ⚠️ ALL MOCK DATA\n\n` +
    `These emails are **synthetic** and DKIM-signed with a **self-generated**\n` +
    `RSA-2048 key (\`mock_dkim_private.pem\`, gitignored). There is no real bank\n` +
    `and no real DNS record. The circuit's DKIM signature verification is real;\n` +
    `only the signing authority is mocked.\n\n` +
    `| file | purpose |\n|---|---|\n` +
    `| mock_balance_email.eml | minimal end-to-end test email (balance $1,000,000) |\n` +
    `| real_format_balance.eml | realistic bank statement layout (balance $1,500,000) |\n` +
    `| mock_dkim_public.pem | mock signer public key |\n` +
    `| mock_dkim_dns_txt.txt | the DKIM DNS TXT record a real bank would publish |\n\n` +
    `Domain: \`${DOMAIN}\`  ·  selector: \`${SELECTOR}\`\n`
);

console.log("[fixtures] wrote mock_balance_email.eml, real_format_balance.eml");
console.log(`[fixtures] mock DKIM domain=${DOMAIN} selector=${SELECTOR}`);
console.log(`[fixtures] body hash (mock) = ${bodyHash("Available balance: $1000000")}`);
