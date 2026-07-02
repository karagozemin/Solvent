import { useEffect, useRef, useState } from "react";
import {
  getAttestation,
  connectWallet,
  verifyProofLive,
  submitProveReserve,
  DEMO_ISSUER,
  PROVE_TX,
  CONTRACT_ID,
  EXPLORER,
  CIRCUIT,
  formatUsd,
  formatDate,
  type Attestation,
  type VerifyResult,
  type SubmitResult,
} from "./solvent";
import "./App.css";

const DEPLOY_TX =
  "fa4924c15d01bdd9431d92cd526e13934870fccb163aa5585b009a48abe0fcac";

// Count-up hook for the reserve number
function useCountUp(target: number, run: boolean, ms = 1400) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(Math.floor(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setV(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, ms]);
  return v;
}

const STEPS = [
  {
    icon: "📧",
    title: "Bank email",
    sub: "DKIM-signed",
    detail:
      "A real bank balance email, cryptographically signed by the provider's DKIM key. The signature — not a screenshot — is the source of truth.",
    tag: "gmail.com DKIM · RSA-2048",
  },
  {
    icon: "🔐",
    title: "Groth16 proof",
    sub: "1.69M constraints",
    detail:
      "In-circuit: verify the DKIM signature, extract the sender from the signed header, and prove balance ≥ threshold — all without revealing the balance.",
    tag: "BN254 · Circom · client-side",
  },
  {
    icon: "⛓️",
    title: "pairing_check",
    sub: "on-chain, live",
    detail:
      "Stellar's native BN254 pairing verifies the proof inside a Soroban contract — and fits under the 100M instruction budget. On-chain proof-of-reserves is practical.",
    tag: "Protocol 26 host fns · < 100M",
  },
  {
    icon: "✅",
    title: "Attestation",
    sub: "balance hidden",
    detail:
      "The contract records only: this issuer proved reserves ≥ threshold, at this time. The actual balance never touches the chain. Replays are rejected on-chain.",
    tag: "selective disclosure · anti-replay",
  },
];

export default function App() {
  const [att, setAtt] = useState<Attestation | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [inView, setInView] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // --- dApp state ---
  const [wallet, setWallet] = useState<string | null>(null);
  const [walletErr, setWalletErr] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [submit, setSubmit] = useState<SubmitResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [flowErr, setFlowErr] = useState<string | null>(null);

  const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

  async function onConnect() {
    setConnecting(true);
    setWalletErr(null);
    try {
      const w = await connectWallet();
      setWallet(w.address);
    } catch (e) {
      setWalletErr(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  }

  async function onVerify() {
    if (!wallet) return;
    setVerifying(true);
    setFlowErr(null);
    setVerify(null);
    try {
      setVerify(await verifyProofLive(wallet));
    } catch (e) {
      setFlowErr(e instanceof Error ? e.message : String(e));
    } finally {
      setVerifying(false);
    }
  }

  async function onSubmit() {
    if (!wallet) return;
    setSubmitting(true);
    setFlowErr(null);
    setSubmit(null);
    try {
      setSubmit(await submitProveReserve(wallet));
    } catch (e) {
      setFlowErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    getAttestation(DEMO_ISSUER.senderHashHex)
      .then(setAtt)
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => e.isIntersecting && setInView(true),
      { threshold: 0.4 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const target = att ? Number(att.threshold) : 0;
  const counted = useCountUp(target, inView && !!att);

  return (
    <div className="page">
      <div className="glow glow-a" />
      <div className="glow glow-b" />

      {/* ===== HERO ===== */}
      <section className="hero">
        <div className="brandrow">
          <img src="/solvent.png" alt="" className="logo" />
          <span className="brand">Solvent</span>
          <span className="pill">
            <span className="dot" /> live on Stellar testnet
          </span>
          {wallet ? (
            <span className="pill wallet" title={wallet}>
              <span className="dot" /> {short(wallet)}
            </span>
          ) : (
            <button
              className="btn connect"
              onClick={onConnect}
              disabled={connecting}
            >
              {connecting ? "Connecting…" : "Connect Freighter"}
            </button>
          )}
        </div>
        {walletErr && <p className="error connect-err">{walletErr}</p>}

        <h1 className="headline">
          Prove your reserves.
          <br />
          <span className="grad">Reveal nothing.</span>
        </h1>

        <p className="lede">
          Stablecoin issuers today either <em>expose</em> their bank balance or
          say <em>“trust us.”</em> Solvent lets an issuer prove reserves clear a
          threshold using a real DKIM-signed bank email — verified on-chain with
          zero-knowledge. The balance is never disclosed.
        </p>

        <div className="cta">
          <a className="btn primary" href={`${EXPLORER}/tx/${PROVE_TX}`} target="_blank" rel="noreferrer">
            See it verified on-chain ↗
          </a>
          <a className="btn ghost" href={`${EXPLORER}/contract/${CONTRACT_ID}`} target="_blank" rel="noreferrer">
            View live contract ↗
          </a>
        </div>

        <div className="statbar">
          <div><b>1.69M</b><span>circuit constraints</span></div>
          <div><b>&lt;100M</b><span>on-chain budget</span></div>
          <div><b>BN254</b><span>native pairing</span></div>
          <div><b>0</b><span>balance leaked</span></div>
        </div>
      </section>

      {/* ===== MECHANISM ===== */}
      <section className="mech">
        <h2 className="sec-title">How the magic works</h2>
        <p className="sec-sub">
          A signed email becomes an on-chain proof. Click any step.
        </p>

        <div className="pipe">
          {STEPS.map((s, i) => (
            <button
              key={i}
              className={`node ${open === i ? "active" : ""}`}
              style={{ animationDelay: `${i * 120}ms` }}
              onClick={() => setOpen(open === i ? null : i)}
            >
              <span className="node-icon">{s.icon}</span>
              <span className="node-title">{s.title}</span>
              <span className="node-sub">{s.sub}</span>
              {i < STEPS.length - 1 && <span className="arrow">→</span>}
            </button>
          ))}
        </div>

        {open !== null && (
          <div className="reveal">
            <p>{STEPS[open].detail}</p>
            <span className="reveal-tag mono">{STEPS[open].tag}</span>
          </div>
        )}
      </section>

      {/* ===== INTERACTIVE dAPP ===== */}
      <section className="app">
        <h2 className="sec-title">Try it — verify on-chain yourself</h2>
        <p className="sec-sub">
          Connect your wallet and run the real BN254 pairing check on Stellar
          testnet. Then submit a signed transaction and watch anti-replay reject
          it live.
        </p>

        {!wallet && (
          <div className="app-gate">
            <button
              className="btn primary big"
              onClick={onConnect}
              disabled={connecting}
            >
              {connecting ? "Connecting…" : "Connect Freighter to begin"}
            </button>
            <span className="gate-note">
              Testnet · no real funds · read-only until you explicitly submit
            </span>
          </div>
        )}

        {wallet && (
          <div className="app-grid">
            <div className="app-card">
              <div className="app-card-head">
                <span className="step-num">1</span>
                <div>
                  <b>Run the ZK proof on-chain</b>
                  <span>verify_proof · read-only · repeatable</span>
                </div>
              </div>
              <p className="app-card-body">
                Executes Stellar's native <code>bn254.pairing_check</code>{" "}
                against the deployed verification key. No state, no fee — the
                proof is checked live inside the contract.
              </p>
              <button
                className="btn primary"
                onClick={onVerify}
                disabled={verifying}
              >
                {verifying ? "Verifying on-chain…" : "Verify proof live"}
              </button>
              {verify && (
                <div className={`result ${verify.valid ? "ok" : "bad"}`}>
                  <div className="result-line">
                    <span>pairing_check</span>
                    <b>{verify.valid ? "✓ valid" : "✗ invalid"}</b>
                  </div>
                  <div className="result-line">
                    <span>CPU instructions</span>
                    <b className="mono">
                      {verify.cpuInsns.toLocaleString()} /{" "}
                      {CIRCUIT.budgetLimit.toLocaleString()}
                    </b>
                  </div>
                  <div className="budget-bar">
                    <div
                      className="budget-fill"
                      style={{
                        width: `${Math.min(100, (verify.cpuInsns / verify.budget) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="result-note">
                    Fits under Soroban's 100M budget — on-chain ZK verification
                    is practical.
                  </span>
                </div>
              )}
            </div>

            <div className="app-card">
              <div className="app-card-head">
                <span className="step-num">2</span>
                <div>
                  <b>Submit a signed transaction</b>
                  <span>prove_reserve · you sign · anti-replay</span>
                </div>
              </div>
              <p className="app-card-body">
                Build a real <code>prove_reserve</code> transaction and sign it
                with your wallet. This proof's nullifier is already burned on
                chain — so the contract must reject the replay with{" "}
                <b>Error #7</b>.
              </p>
              <button
                className="btn ghost"
                onClick={onSubmit}
                disabled={submitting}
              >
                {submitting ? "Submitting…" : "Sign & submit prove_reserve"}
              </button>
              {submit && submit.replayRejected && (
                <div className="result ok">
                  <div className="result-line">
                    <span>Contract response</span>
                    <b className="reject">Error #7 · NullifierUsed</b>
                  </div>
                  <span className="result-note">
                    🛡️ Anti-replay works: the same email can never mint twice.
                    Rejected on-chain, before any state change.
                  </span>
                </div>
              )}
              {submit && !submit.replayRejected && submit.errorCode && (
                <div className="result bad">
                  <div className="result-line">
                    <span>Contract error</span>
                    <b className="reject">#{submit.errorCode}</b>
                  </div>
                </div>
              )}
              {submit && submit.hash && (
                <div className="result ok">
                  <div className="result-line">
                    <span>Submitted</span>
                    <b>{submit.success ? "✓ on-chain" : "pending"}</b>
                  </div>
                  <a
                    className="tx-link mono"
                    href={`${EXPLORER}/tx/${submit.hash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {submit.hash.slice(0, 18)}… ↗
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {flowErr && <p className="error">{flowErr}</p>}
      </section>

      {/* ===== LIVE ATTESTATION ===== */}
      <section className="attest" ref={cardRef}>
        <h2 className="sec-title">Live attestation</h2>
        <p className="sec-sub">Read directly from testnet — no backend, no cache.</p>

        <div className="card">
          <div className="card-head">
            <div className="issuer">
              <span className="issuer-name">{DEMO_ISSUER.label}</span>
              <span className="issuer-sub">verified reserve issuer</span>
            </div>
            <span className="chip live"><span className="dot" /> live</span>
          </div>

          {loading && (
            <div className="skeleton">Reading attestation from testnet…</div>
          )}
          {err && <p className="error">Could not read attestation: {err}</p>}

          {att && (
            <>
              <div className="reserve">
                <span className="reserve-label">Reserve proven</span>
                <span className="reserve-value">
                  ≥ {formatUsd(BigInt(counted))}
                  <span className="check">✓</span>
                </span>
              </div>

              <div className="hidden-note">
                🔒 Actual balance <strong>never disclosed</strong> — only the
                threshold is proven in zero knowledge.
              </div>

              <div className="facts">
                <div><span>Proven on</span><b>{formatDate(att.timestamp)}</b></div>
                <div><span>Signed by</span><b>Bank DKIM key (in-circuit)</b></div>
                <div><span>Anti-replay nullifier</span><b className="mono">{att.nullifier.slice(0, 18)}…</b></div>
                <div><span>Replay attempt</span><b className="reject">rejected · Error #7</b></div>
              </div>

              <div className="actions">
                <a className="btn primary" href={`${EXPLORER}/tx/${PROVE_TX}`} target="_blank" rel="noreferrer">
                  Verify pairing_check ↗
                </a>
                <a className="btn ghost" href={`${EXPLORER}/tx/${DEPLOY_TX}`} target="_blank" rel="noreferrer">
                  Deploy tx ↗
                </a>
              </div>
            </>
          )}
        </div>
      </section>

      <footer className="foot">
        <p>
          Real DKIM-signed bank email → Groth16 proof → verified on Stellar with
          native BN254 pairing. No intermediary ever sees the balance.
        </p>
        <p className="mono tiny">{CONTRACT_ID}</p>
      </footer>
    </div>
  );
}