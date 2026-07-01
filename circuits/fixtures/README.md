# Fixtures — ⚠️ ALL MOCK DATA

These emails are **synthetic** and DKIM-signed with a **self-generated**
RSA-2048 key (`mock_dkim_private.pem`, gitignored). There is no real bank
and no real DNS record. The circuit's DKIM signature verification is real;
only the signing authority is mocked.

| file | purpose |
|---|---|
| mock_balance_email.eml | minimal end-to-end test email (balance $1,000,000) |
| real_format_balance.eml | realistic bank statement layout (balance $1,500,000) |
| mock_dkim_public.pem | mock signer public key |
| mock_dkim_dns_txt.txt | the DKIM DNS TXT record a real bank would publish |

Domain: `bank.example.com`  ·  selector: `solvent`
