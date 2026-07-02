import { useEffect, useState } from "react";
import {
  getAttestation,
  DEMO_ISSUER,
  PROVE_TX,
  CONTRACT_ID,
  EXPLORER,
  formatUsd,
  formatDate,
  type Attestation,
} from "./solvent";
import "./App.css";

export default function App() {
  const [att, setAtt] = useState<Attestation | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getAttestation(DEMO_ISSUER.senderHashHex)
      .then(setAtt)
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <header className="hero">
        <img src="/solvent.png" alt="Solvent" className="logo" />
        <h1>Solvent</h1>
        <p className="tagline">Zero-knowledge proof-of-reserves on Stellar</p>
      </header>

      <main className="card">
        <div className="card-head">
          <span className="issuer">{DEMO_ISSUER.label}</span>
          <span className="chip live">● live on testnet</span>
        </div>

        {loading && <p className="muted">Reading attestation from testnet…</p>}
        {err && <p className="error">Could not read attestation: {err}</p>}

        {att && (
          <>
            <div className="reserve">
              <span className="reserve-label">Reserve proven</span>
              <span className="reserve-value">
                ≥ {formatUsd(att.threshold)} <span className="check">✓</span>
              </span>
            </div>

            <div className="hidden-note">
              🔒 Actual balance <strong>never disclosed</strong> — only the
              threshold is proven in zero knowledge.
            </div>

            <dl className="facts">
              <div>
                <dt>Proven on</dt>
                <dd>{formatDate(att.timestamp)}</dd>
              </div>
              <div>
                <dt>Anti-replay nullifier</dt>
                <dd className="mono">{att.nullifier.slice(0, 20)}…</dd>
              </div>
              <div>
                <dt>Signed by</dt>
                <dd>gmail.com DKIM key (verified in-circuit)</dd>
              </div>
            </dl>

            <div className="actions">
              <a className="btn primary" href={`${EXPLORER}/tx/${PROVE_TX}`} target="_blank" rel="noreferrer">
                Verify pairing_check on-chain ↗
              </a>
              <a className="btn" href={`${EXPLORER}/contract/${CONTRACT_ID}`} target="_blank" rel="noreferrer">
                View contract ↗
              </a>
            </div>
          </>
        )}
      </main>

      <footer className="foot">
        <p>
          A real DKIM-signed bank email → Groth16 proof → verified on Stellar
          with native BN254 pairing. No intermediary sees the balance.
        </p>
        <p className="mono tiny">contract {CONTRACT_ID}</p>
      </footer>
    </div>
  );
}
