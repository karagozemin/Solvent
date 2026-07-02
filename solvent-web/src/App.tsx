import { useEffect, useRef, useState } from "react";
import {
  getAttestation,
  connectWallet,
  disconnectWallet,
  persistWallet,
  loadWallet,
  silentAddress,
  verifyProofLive,
  submitProveReserve,
  submitVerifyProof,
  DEMO_ISSUER,
  type LandedTx,



  PROVE_TX,
  CONTRACT_ID,
  EXPLORER,
  CIRCUIT,
  DKIM,
  TX_CHAIN,
  PUB_SIGNALS,
  formatUsd,
  formatDate,
  type Attestation,
  type VerifyResult,
  type SubmitResult,
} from "./solvent";
import "./App.css";

/* ------------------------------------------------------------------ */
/*  Small hooks / helpers                                             */
/* ------------------------------------------------------------------ */

function useCountUp(target: number, run: boolean, ms = 1600) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 4);
      setV(Math.floor(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setV(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, ms]);
  return v;
}

function useInView<T extends HTMLElement>(threshold = 0.25) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          obs.disconnect();
        }
      },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, seen] as const;
}

const short = (a: string, n = 4) => `${a.slice(0, n)}…${a.slice(-n)}`;

/* ------------------------------------------------------------------ */
/*  Static content                                                    */
/* ------------------------------------------------------------------ */

const STEPS = [
  {
    n: "01",
    kicker: "Source of truth",
    title: "A DKIM-signed bank email",
    body: "The issuer's bank sends a balance statement, cryptographically signed by the provider's DKIM key. The RSA-2048 signature — not a screenshot — is what Solvent trusts.",
    tags: [`${DKIM.domain} · ${DKIM.algo}`, "RSA-2048"],
  },
  {
    n: "02",
    kicker: "Off-chain prover",
    title: "Groth16 proof over the signature",
    body: "Inside the circuit: verify the DKIM signature, extract the sender from the signed header via regex, read the balance from the signed body, and prove balance ≥ threshold — all in zero knowledge.",
    tags: [`${CIRCUIT.constraints.toLocaleString()} constraints`, "BN254 · Circom"],
  },
  {
    n: "03",
    kicker: "On-chain verifier",
    title: "Native BN254 pairing_check",
    body: "Stellar's native pairing host functions verify the proof inside a Soroban contract — and it fits under the 100M instruction budget. On-chain proof-of-reserves is practical, not theoretical.",
    tags: ["Soroban host fns", "< 100M budget"],
  },
  {
    n: "04",
    kicker: "Settlement",
    title: "Attestation, balance hidden",
    body: "The contract records only that this issuer proved reserves ≥ threshold, at this time. The actual balance never touches the chain, and the email's nullifier blocks any replay.",
    tags: ["selective disclosure", "anti-replay"],
  },
];

const FAQ = [
  {
    q: "How can you trust a number the issuer sends?",
    a: "You don't trust the issuer — you trust their bank's RSA signature, which is verified inside the SNARK. The contract never sees a self-declared number; it only accepts a proof bound to a valid DKIM signature from a pinned provider key.",
  },
  {
    q: "What stops someone spoofing the sender?",
    a: "The From address is extracted by in-circuit regex over the DKIM-signed header — not supplied by the prover. Its Poseidon hash must match a registered issuer, so a forged sender simply won't verify.",
  },
  {
    q: "Can the same email be reused to mint twice?",
    a: "No. Each email yields a nullifier = Poseidon²(signature) that is burned on-chain the first time. A replay is rejected with Error #7 before any state changes — you can trigger this yourself below.",
  },
  {
    q: "Is the balance ever exposed?",
    a: "Never. The public journal contains the threshold, timestamp, sender and key hashes — but the balance itself is not among the seven signals. Only 'balance ≥ threshold' is proven.",
  },
];

/* ------------------------------------------------------------------ */
/*  App                                                               */
/* ------------------------------------------------------------------ */

export default function App() {
  // attestation
  const [att, setAtt] = useState<Attestation | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // wallet + flow
  const [wallet, setWallet] = useState<string | null>(null);
  const [walletErr, setWalletErr] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [submit, setSubmit] = useState<SubmitResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [landed, setLanded] = useState<LandedTx | null>(null);
  const [landing, setLanding] = useState(false);
  const [flowErr, setFlowErr] = useState<string | null>(null);


  const [faqOpen, setFaqOpen] = useState<number | null>(0);
  const [copied, setCopied] = useState(false);
  const [walletMenu, setWalletMenu] = useState(false);
  const [addrCopied, setAddrCopied] = useState(false);

  const [cardRef, cardSeen] = useInView<HTMLDivElement>(0.35);

  async function onConnect() {
    setConnecting(true);
    setWalletErr(null);
    try {
      const w = await connectWallet();
      setWallet(w.address);
      persistWallet(w.address);
    } catch (e) {
      setWalletErr(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  }

  function onDisconnect() {
    disconnectWallet();
    setWallet(null);
    setWalletMenu(false);
    setVerify(null);
    setSubmit(null);
    setFlowErr(null);
    setWalletErr(null);
  }

  function copyAddress() {
    if (!wallet) return;
    navigator.clipboard?.writeText(wallet);
    setAddrCopied(true);
    setTimeout(() => setAddrCopied(false), 1400);
  }

  // Restore a previous session on reload — only if Freighter still has this
  // site authorized and unlocked (silent, never opens a popup). Prevents a
  // stale "connected" pill after the user locked or revoked the wallet.
  useEffect(() => {
    if (!loadWallet()) return;
    let cancelled = false;
    silentAddress().then((addr) => {
      if (cancelled) return;
      if (addr) {
        setWallet(addr);
        persistWallet(addr);
      } else {
        disconnectWallet();
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Close the wallet menu when clicking outside.
  useEffect(() => {
    if (!walletMenu) return;
    const close = () => setWalletMenu(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [walletMenu]);


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

  // Sign a REAL verify_proof transaction with the connected wallet and submit
  // it to testnet. It lands on-chain under the signer's own address, so the
  // returned hash truly resolves on stellar.expert — the honest, verifiable
  // "I signed this myself" action.
  async function onLandProof() {
    if (!wallet) return;
    setLanding(true);
    setFlowErr(null);
    setLanded(null);
    try {
      setLanded(await submitVerifyProof(wallet));
    } catch (e) {
      setFlowErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLanding(false);
    }
  }


  useEffect(() => {
    getAttestation(DEMO_ISSUER.senderHashHex)
      .then(setAtt)
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const target = att ? Number(att.threshold) : 0;
  const counted = useCountUp(target, cardSeen && !!att);

  function copyContract() {
    navigator.clipboard?.writeText(CONTRACT_ID);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="app-root">
      {/* ambient background */}
      <div className="bg-grid" aria-hidden />
      <div className="bg-orb orb-1" aria-hidden />
      <div className="bg-orb orb-2" aria-hidden />
      <div className="bg-noise" aria-hidden />

      {/* ===================== NAV ===================== */}
      <header className="nav">
        <div className="nav-inner">
          <a className="nav-brand" href="#top">
            <img src="/solvent.png" alt="" className="nav-logo" />
            <span>Solvent</span>
          </a>

          <nav className="nav-links">
            <a href="#how">How it works</a>
            <a href="#try">Live demo</a>
            <a href="#proof">On-chain</a>
            <a href="#faq">FAQ</a>
          </nav>

          <div className="nav-right">
            <span className="net-pill">
              <span className="net-dot" />
              Stellar testnet
            </span>
            {wallet ? (
              <div
                className="wallet-wrap"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className={`wallet-pill ${walletMenu ? "active" : ""}`}
                  title={wallet}
                  onClick={() => setWalletMenu((o) => !o)}
                >
                  <span className="wallet-avatar" />
                  {short(wallet)}
                  <span className="wallet-caret">▾</span>
                </button>

                {walletMenu && (
                  <div className="wallet-menu">
                    <div className="wallet-menu-head">
                      <span className="wallet-avatar lg" />
                      <div>
                        <b className="mono">{short(wallet, 6)}</b>
                        <span>Freighter · Testnet</span>
                      </div>
                    </div>
                    <button className="wallet-menu-item" onClick={copyAddress}>
                      <span>{addrCopied ? "✓ Copied" : "Copy address"}</span>
                      <span className="wmi-ic">⧉</span>
                    </button>
                    <a
                      className="wallet-menu-item"
                      href={`${EXPLORER}/account/${wallet}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setWalletMenu(false)}
                    >
                      <span>View on explorer</span>
                      <span className="wmi-ic">↗</span>
                    </a>
                    <button
                      className="wallet-menu-item danger"
                      onClick={onDisconnect}
                    >
                      <span>Disconnect</span>
                      <span className="wmi-ic">⏻</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                className="btn btn-connect"
                onClick={onConnect}
                disabled={connecting}
              >
                {connecting ? "Connecting…" : "Connect wallet"}
              </button>
            )}
          </div>

        </div>
      </header>

      <main id="top">
        {/* ===================== HERO ===================== */}
        <section className="hero">
          <div className="hero-copy">
            <a
              className="hero-badge"
              href={`${EXPLORER}/tx/${PROVE_TX}`}
              target="_blank"
              rel="noreferrer"
            >
              <span className="badge-dot" />
              Live proof verified on-chain
              <span className="badge-arrow">↗</span>
            </a>

            <h1 className="hero-title">
              Prove your reserves.
              <br />
              <span className="hero-grad">Reveal nothing.</span>
            </h1>

            <p className="hero-lede">
              Stablecoin issuers today either <em>expose</em> their bank balance
              or say <em>“trust us.”</em> Solvent lets an issuer prove reserves
              clear a threshold from a real DKIM-signed bank email — verified
              on-chain with zero-knowledge. The balance is never disclosed.
            </p>

            <div className="hero-cta">
              <a className="btn btn-primary" href="#try">
                Try the live demo
              </a>
              <a
                className="btn btn-ghost"
                href={`${EXPLORER}/contract/${CONTRACT_ID}`}
                target="_blank"
                rel="noreferrer"
              >
                View contract ↗
              </a>
            </div>

            <div className="hero-trust">
              <span>Built on</span>
              <b>Soroban</b>
              <i />
              <b>BN254</b>
              <i />
              <b>Groth16</b>
              <i />
              <b>Circom</b>
            </div>
          </div>

          {/* proof visual */}
          <ProofVisual />
        </section>

        {/* ===================== STAT STRIP ===================== */}
        <section className="stats">
          {[
            { v: CIRCUIT.constraints.toLocaleString(), l: "circuit constraints" },
            { v: "< 100M", l: "on-chain instruction budget" },
            { v: "BN254", l: "native Stellar pairing" },
            { v: "$0", l: "balance ever leaked" },
          ].map((s, i) => (
            <div className="stat" key={i}>
              <b>{s.v}</b>
              <span>{s.l}</span>
            </div>
          ))}
        </section>

        {/* ===================== PROBLEM ===================== */}
        <section className="problem">
          <div className="prob-col prob-bad">
            <span className="prob-tag">Today</span>
            <h3>A false choice</h3>
            <ul>
              <li>
                <span className="x">✕</span> Publish the bank balance — leak your
                treasury to every competitor.
              </li>
              <li>
                <span className="x">✕</span> Or post a PDF and say “trust us” —
                unverifiable, forgeable, stale.
              </li>
              <li>
                <span className="x">✕</span> Auditors are periodic; runs happen
                in minutes.
              </li>
            </ul>
          </div>
          <div className="prob-arrow">→</div>
          <div className="prob-col prob-good">
            <span className="prob-tag good">With Solvent</span>
            <h3>Prove the floor, hide the rest</h3>
            <ul>
              <li>
                <span className="c">✓</span> “Reserves ≥ $1,000,000” — proven,
                not promised.
              </li>
              <li>
                <span className="c">✓</span> Bound to your bank's real DKIM
                signature, checked in-circuit.
              </li>
              <li>
                <span className="c">✓</span> Verifiable by anyone, anytime,
                on-chain — balance stays private.
              </li>
            </ul>
          </div>
        </section>

        {/* ===================== HOW IT WORKS ===================== */}
        <section id="how" className="section">
          <SectionHead
            eyebrow="Mechanism"
            title="A signed email becomes an on-chain proof"
            sub="Four stages turn an ordinary bank email into a trustless, private attestation."
          />

          <div className="steps">
            {STEPS.map((s, i) => (
              <article className="step" key={i} style={{ ["--d" as string]: `${i * 90}ms` }}>
                <div className="step-top">
                  <span className="step-n">{s.n}</span>
                  <span className="step-kicker">{s.kicker}</span>
                </div>
                <h4>{s.title}</h4>
                <p>{s.body}</p>
                <div className="step-tags">
                  {s.tags.map((t) => (
                    <span className="chip" key={t}>
                      {t}
                    </span>
                  ))}
                </div>
                {i < STEPS.length - 1 && <span className="step-link" aria-hidden />}
              </article>
            ))}
          </div>
        </section>

        {/* ===================== INTERACTIVE dAPP ===================== */}
        <section id="try" className="section">
          <SectionHead
            eyebrow="Live on testnet"
            title="Verify it yourself — no backend involved"
            sub="Connect Freighter and run the real BN254 pairing check on Stellar. Then submit a signed transaction and watch anti-replay reject it live."
          />

          {!wallet ? (
            <div className="gate">
              <div className="gate-glow" />
              <div className="gate-lock">🔓</div>
              <h4>Connect a wallet to run the live proof</h4>
              <p>
                Everything runs read-only until you explicitly sign. Testnet
                only — no real funds are ever moved.
              </p>
              <button
                className="btn btn-primary btn-lg"
                onClick={onConnect}
                disabled={connecting}
              >
                {connecting ? "Connecting…" : "Connect Freighter"}
              </button>
              {walletErr && <p className="inline-err">{walletErr}</p>}
            </div>
          ) : (
            <div className="demo-grid">
              {/* card 1 — verify */}
              <div className="demo-card">
                <div className="demo-head">
                  <span className="demo-num">1</span>
                  <div>
                    <b>Run the ZK proof on-chain</b>
                    <span>
                      <code>verify_proof</code> · read-only · repeatable
                    </span>
                  </div>
                </div>
                <p className="demo-body">
                  Executes Stellar's native <code>bn254.pairing_check</code>{" "}
                  against the deployed verification key. No state, no fee — the
                  proof is checked live inside the contract.
                </p>
                <button
                  className="btn btn-primary demo-action"
                  onClick={onVerify}
                  disabled={verifying}
                >
                  {verifying ? (
                    <>
                      <span className="spinner" /> Verifying on-chain…
                    </>
                  ) : (
                    "Verify proof live"
                  )}
                </button>

                {verify && (
                  <div className={`result ${verify.valid ? "ok" : "bad"}`}>
                    <div className="result-row">
                      <span>pairing_check</span>
                      <b className={verify.valid ? "good" : "bad-t"}>
                        {verify.valid ? "✓ valid" : "✗ invalid"}
                      </b>
                    </div>
                    <div className="result-row">
                      <span>CPU instructions</span>
                      <b className="mono">
                        {verify.cpuInsns.toLocaleString()} /{" "}
                        {CIRCUIT.budgetLimit.toLocaleString()}
                      </b>
                    </div>
                    <div className="budget">
                      <div
                        className="budget-fill"
                        style={{
                          width: `${Math.min(
                            100,
                            (verify.cpuInsns / verify.budget) * 100,
                          )}%`,
                        }}
                      />
                    </div>
                    <p className="result-note">
                      Fits comfortably under Soroban's 100M budget — on-chain ZK
                      verification is practical.
                    </p>
                  </div>
                )}
              </div>

              {/* card 2 — land a REAL signed tx under YOUR OWN address */}
              <div className="demo-card">
                <div className="demo-head">
                  <span className="demo-num">2</span>
                  <div>
                    <b>Sign it with your wallet</b>
                    <span>
                      <code>verify_proof</code> · you sign · lands on-chain
                    </span>
                  </div>
                </div>
                <p className="demo-body">
                  Sign a real Soroban transaction in Freighter and broadcast it
                  to testnet. It's included in a ledger under{" "}
                  <b>your own address</b> — so the resulting hash truly opens on
                  Stellar Expert, signed by <span className="mono">{short(wallet, 4)}</span>.
                </p>
                <button
                  className="btn btn-primary demo-action"
                  onClick={onLandProof}
                  disabled={landing}
                >
                  {landing ? (
                    <>
                      <span className="spinner" /> Waiting for ledger…
                    </>
                  ) : (
                    "Sign & broadcast to testnet"
                  )}
                </button>

                {landed && (
                  <div className="result ok">
                    <div className="result-row">
                      <span>You signed</span>
                      <b className="good">✓ verify_proof</b>
                    </div>
                    <div className="result-row">
                      <span>Included in ledger</span>
                      <b className="mono">#{landed.ledger.toLocaleString()}</b>
                    </div>
                    <div className="result-row">
                      <span>On-chain instructions</span>
                      <b className="mono">
                        {landed.cpuInsns.toLocaleString()}
                      </b>
                    </div>
                    <p className="result-note">
                      ✅ Confirmed on testnet, signed by your wallet. Open it on
                      the explorer — it resolves under your own account, no
                      pre-baked hash.
                    </p>
                    <div className="replay-links">
                      <a
                        className="tx-link mono"
                        href={`${EXPLORER}/tx/${landed.hash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        your tx {short(landed.hash, 8)} ↗
                      </a>
                      <a
                        className="tx-link mono"
                        href={`${EXPLORER}/account/${wallet}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        your account ↗
                      </a>
                    </div>
                    <div className="replay-note">
                      <b>🛡️ Now try to double-spend it:</b> the{" "}
                      <code>prove_reserve</code> path burns a nullifier the first
                      time. Replaying the same email is rejected with{" "}
                      <b>Error&nbsp;#7</b> at preflight — no ledger slot, no fee.
                      <button
                        className="linkish"
                        onClick={onSubmit}
                        disabled={submitting}
                      >
                        {submitting ? "checking…" : "run the replay →"}
                      </button>
                    </div>
                  </div>
                )}

                {submit && submit.replayRejected && (
                  <div className="result ok slim">
                    <div className="result-row">
                      <span>Replay of burned email</span>
                      <b className="reject">Error #7 · NullifierUsed</b>
                    </div>
                    <p className="result-note">
                      Rejected{" "}
                      {submit.preflightRejected
                        ? "at preflight — nothing spent"
                        : "before any state change"}
                      . The same email can never mint twice.{" "}
                      <a
                        className="tx-link mono inline"
                        href={`${EXPLORER}/tx/${PROVE_TX}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        original prove tx ↗
                      </a>
                    </p>
                  </div>
                )}

                {submit && !submit.replayRejected && submit.errorCode && (
                  <div className="result bad slim">
                    <div className="result-row">
                      <span>Guard error</span>
                      <b className="reject">#{submit.errorCode}</b>
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}
          {flowErr && <p className="inline-err center">{flowErr}</p>}
        </section>

        {/* ===================== LIVE ATTESTATION ===================== */}
        <section id="proof" className="section">
          <SectionHead
            eyebrow="On-chain state"
            title="Live attestation"
            sub="Read directly from the deployed contract on testnet — no backend, no cache."
          />

          <div className="attest-card" ref={cardRef}>
            <div className="attest-head">
              <div className="issuer">
                <span className="issuer-avatar">🏦</span>
                <div>
                  <b>{DEMO_ISSUER.label}</b>
                  <span>verified reserve issuer</span>
                </div>
              </div>
              <span className="live-chip">
                <span className="net-dot" /> live
              </span>
            </div>

            {loading && (
              <div className="attest-load">
                <span className="spinner dark" /> Reading attestation from
                testnet…
              </div>
            )}
            {err && <p className="inline-err">Could not read attestation: {err}</p>}

            {att && (
              <div className="attest-body">
                <div className="reserve-box">
                  <span className="reserve-label">Reserve proven</span>
                  <div className="reserve-value">
                    ≥ {formatUsd(BigInt(counted))}
                    <span className="reserve-check">✓</span>
                  </div>
                  <div className="reserve-hidden">
                    🔒 Actual balance <b>never disclosed</b> — only the threshold
                    is proven in zero knowledge.
                  </div>
                </div>

                <div className="facts">
                  <Fact label="Proven on" value={formatDate(att.timestamp)} />
                  <Fact label="Signed by" value="Bank DKIM key (in-circuit)" />
                  <Fact
                    label="Nullifier"
                    value={short(att.nullifier, 8)}
                    mono
                  />
                  <Fact label="Replay attempt" value="rejected · #7" reject />
                </div>
              </div>
            )}

            {att && (
              <div className="attest-actions">
                <a
                  className="btn btn-primary"
                  href={`${EXPLORER}/tx/${PROVE_TX}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Verify pairing_check ↗
                </a>
                <a
                  className="btn btn-ghost"
                  href={`${EXPLORER}/tx/${TX_CHAIN.deploy}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Deploy tx ↗
                </a>
              </div>
            )}
          </div>

          {/* transaction chain */}
          <div className="txchain">
            <h4 className="txchain-title">The full verifiable chain</h4>
            <div className="txchain-row">
              {[
                { k: "Deploy", h: TX_CHAIN.deploy },
                { k: "Init", h: TX_CHAIN.init },
                { k: "Register", h: TX_CHAIN.register },
                { k: "Prove", h: TX_CHAIN.prove },
              ].map((t, i) => (
                <a
                  key={t.k}
                  className="txnode"
                  href={`${EXPLORER}/tx/${t.h}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ ["--d" as string]: `${i * 80}ms` }}
                >
                  <span className="txnode-k">{t.k}</span>
                  <span className="txnode-h mono">{short(t.h, 6)}</span>
                  <span className="txnode-go">↗</span>
                </a>
              ))}
            </div>
          </div>

          {/* public journal */}
          <details className="journal">
            <summary>
              <span>Inspect the public journal (7 signals)</span>
              <span className="journal-chev">▾</span>
            </summary>
            <div className="journal-grid">
              {[
                ["pubkey_hash", "which provider signed it"],
                ["sender_hash", "who the issuer is"],
                ["nullifier", "anti-replay uniqueness"],
                ["threshold_out", "echo of threshold"],
                ["timestamp_out", "echo of timestamp"],
                ["threshold", "reserve floor proven"],
                ["timestamp", "email date (unix)"],
              ].map(([name, meaning], i) => (
                <div className="jrow" key={name}>
                  <span className="jidx mono">{i}</span>
                  <div className="jmain">
                    <b className="mono">{name}</b>
                    <span>{meaning}</span>
                  </div>
                  <span className="jval mono">{short(PUB_SIGNALS[i], 6)}</span>
                </div>
              ))}
            </div>
            <p className="journal-note">
              The balance itself is <b>not</b> among these signals — only the
              threshold it clears.
            </p>
          </details>
        </section>

        {/* ===================== FAQ ===================== */}
        <section id="faq" className="section">
          <SectionHead
            eyebrow="Soundness"
            title="Why this isn't a toy"
            sub="Correctness lives in the math, not in the operator."
          />
          <div className="faq">
            {FAQ.map((f, i) => (
              <div
                className={`faq-item ${faqOpen === i ? "open" : ""}`}
                key={i}
              >
                <button
                  className="faq-q"
                  onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                >
                  <span>{f.q}</span>
                  <span className="faq-plus">{faqOpen === i ? "−" : "+"}</span>
                </button>
                <div className="faq-a">
                  <p>{f.a}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ===================== CTA ===================== */}
        <section className="final-cta">
          <div className="cta-card">
            <div className="cta-glow" />
            <h2>Solvency you can verify, privacy you keep.</h2>
            <p>
              A real DKIM-signed bank email → a Groth16 proof → verified on
              Stellar with native BN254 pairing. No intermediary ever sees the
              balance.
            </p>
            <div className="cta-actions">
              <a className="btn btn-primary btn-lg" href="#try">
                Run the live demo
              </a>
              <a
                className="btn btn-ghost btn-lg"
                href={`${EXPLORER}/contract/${CONTRACT_ID}`}
                target="_blank"
                rel="noreferrer"
              >
                Explore on-chain ↗
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* ===================== FOOTER ===================== */}
      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <img src="/solvent.png" alt="" className="nav-logo" />
            <div>
              <b>Solvent</b>
              <span>ZK proof-of-reserves on Stellar</span>
            </div>
          </div>
          <button className="contract-copy" onClick={copyContract} title="Copy">
            <span className="mono">{short(CONTRACT_ID, 8)}</span>
            <span className="copy-ic">{copied ? "✓ copied" : "copy"}</span>
          </button>
        </div>
        <div className="footer-fine">
          Built for the Stellar ecosystem · Soroban · Protocol 25+ BN254
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */

function SectionHead({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub: string;
}) {
  return (
    <div className="sec-head">
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      <p>{sub}</p>
    </div>
  );
}

function Fact({
  label,
  value,
  mono,
  reject,
}: {
  label: string;
  value: string;
  mono?: boolean;
  reject?: boolean;
}) {
  return (
    <div className="fact">
      <span>{label}</span>
      <b className={`${mono ? "mono" : ""} ${reject ? "reject" : ""}`}>
        {value}
      </b>
    </div>
  );
}

/* Animated hero proof panel */
function ProofVisual() {
  return (
    <div className="proof-visual">
      <div className="pv-card">
        <div className="pv-top">
          <span className="pv-dots">
            <i /><i /><i />
          </span>
          <span className="pv-label mono">proof.json</span>
        </div>

        <div className="pv-row">
          <span className="pv-key mono">DKIM</span>
          <span className="pv-val mono">{DKIM.domain} · verified ✓</span>
        </div>
        <div className="pv-row">
          <span className="pv-key mono">balance</span>
          <span className="pv-hidden">••••••••</span>
          <span className="pv-lock">🔒 hidden</span>
        </div>
        <div className="pv-row">
          <span className="pv-key mono">threshold</span>
          <span className="pv-val mono">≥ $1,000,000</span>
        </div>

        <div className="pv-divider" />

        <div className="pv-proof">
          <span className="pv-proof-label mono">π groth16</span>
          <div className="pv-hexes">
            {[
              "0x20445263…d754338",
              "0x08320016…5887369e",
              "0x09787604…6141450b",
            ].map((h) => (
              <span key={h} className="pv-hex mono">
                {h}
              </span>
            ))}
          </div>
        </div>

        <div className="pv-verify">
          <span className="pv-verify-dot" />
          <span className="mono">pairing_check() → true</span>
          <span className="pv-verify-badge">on-chain</span>
        </div>
      </div>

      <div className="pv-float pv-float-1 mono">BN254</div>
      <div className="pv-float pv-float-2 mono">Poseidon²</div>
      <div className="pv-float pv-float-3 mono">Soroban</div>
    </div>
  );
}
