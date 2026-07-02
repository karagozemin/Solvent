<h1 align="center">Circuit Fixtures — ⚠️ ALL SYNTHETIC DATA</h1>

<p align="center">
  Test emails for <a href="../reserve.circom"><code>reserve.circom</code></a>.<br>
  The DKIM signature verification is <b>real</b>; only the signing authority is mocked.
</p>

<p align="center">
  <a href="../README.md">← Circuit README</a> ·
  <a href="../../ARCHITECTURE.md">Architecture →</a>
</p>

---

## What's mocked, what's real

These emails are **synthetic** and DKIM-signed with a **self-generated** RSA-2048
key (`mock_dkim_private.pem`, gitignored). There is no real bank and no real DNS
record.

| Real ✅ | Mocked ⚠️ |
|---------|-----------|
| The RSA-2048 signature over the header/body | The signing key (self-generated, not a bank's) |
| In-circuit SHA-256 + RSA DKIM verification | The DNS TXT record (we publish a matching one locally) |
| The `balance ≥ threshold` proof over signed bytes | The balance figures (illustrative amounts) |

> **No real bank data is ever committed.** Swapping in a genuine issuer means
> pinning that provider's real DKIM public-key hash — the circuit logic is
> unchanged.

---

## Files

| file | purpose |
|------|---------|
| `mock_balance_email.eml` | minimal end-to-end test email (balance $1,000,000) |
| `real_format_balance.eml` | realistic bank-statement layout (balance $1,500,000) |
| `mock_dkim_public.pem` | mock signer public key |
| `mock_dkim_dns_txt.txt` | the DKIM DNS TXT record a real bank would publish |

**Signing identity:** domain `bank.example.com` · selector `solvent`

---

## Regenerate

```bash
cd ..
node scripts/gen_fixtures.js        # regenerate synthetic DKIM-signed emails
node scripts/gen_input.js fixtures/mock_balance_email.eml 1000000
```

The private key (`mock_dkim_private.pem`) is gitignored — regenerate locally to
re-sign fixtures.
