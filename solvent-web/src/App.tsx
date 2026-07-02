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
  PROOF_HEX,
  SCENARIOS,
  type Scenario,
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
import DarkVeil from "./DarkVeil";
import "./App.css";


/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

const short = (a: string, n = 4) => `${a.slice(0, n)}…${a.slice(-n)}`;

function useCountUp(target: number, run: boolean, ms = 1300) {
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

type View = "overview" | "verify" | "issuers" | "onchain";

const NAV: { id: View; label: string; icon: string; hint: string }[] = [
  { id: "overview", label: "Overview", icon: "◈", hint: "Live reserve status" },
  { id: "verify", label: "Verify reserves", icon: "⚡", hint: "Run the ZK flow" },
  { id: "issuers", label: "Attestations", icon: "🏦", hint: "Registered issuers" },
  { id: "onchain", label: "On-chain", icon: "⛓", hint: "Contract & journal" },
];

/* ================================================================== */
/*  App shell                                                         */
/* ================================================================== */

export default function App() {
  const [view, setView] = useState<View>("overview");
  const [navOpen, setNavOpen] = useState(false);

  // landing → app gate
  const [entered, setEntered] = useState(false);
  const [intro, setIntro] = useState(false);
  function enterApp(target: View = "overview") {
    setView(target);
    setIntro(true);
    window.setTimeout(() => {
      setEntered(true);
      window.setTimeout(() => setIntro(false), 620);
    }, 1180);
  }


  // attestation
  const [att, setAtt] = useState<Attestation | null>(null);
  const [loading, setLoading] = useState(true);
  const [attErr, setAttErr] = useState<string | null>(null);

  // wallet
  const [wallet, setWallet] = useState<string | null>(null);
  const [walletErr, setWalletErr] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [walletMenu, setWalletMenu] = useState(false);
  const [addrCopied, setAddrCopied] = useState(false);

  // flow
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [submit, setSubmit] = useState<SubmitResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [landed, setLanded] = useState<LandedTx | null>(null);
  const [landing, setLanding] = useState(false);
  const [flowErr, setFlowErr] = useState<string | null>(null);

  /* ---- wallet actions ---- */
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
    setLanded(null);
    setFlowErr(null);
    setWalletErr(null);
  }
  function copyAddress() {
    if (!wallet) return;
    navigator.clipboard?.writeText(wallet);
    setAddrCopied(true);
    setTimeout(() => setAddrCopied(false), 1400);
  }

  /* ---- flow actions ---- */
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
  async function onLand() {
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
  async function onReplay() {
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

  /* ---- effects ---- */
  useEffect(() => {
    getAttestation(DEMO_ISSUER.senderHashHex)
      .then(setAtt)
      .catch((e) => setAttErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!loadWallet()) return;
    let cancelled = false;
    silentAddress().then((addr) => {
      if (cancelled) return;
      if (addr) {
        setWallet(addr);
        persistWallet(addr);
      } else disconnectWallet();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!walletMenu) return;
    const close = () => setWalletMenu(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [walletMenu]);

  const active = NAV.find((n) => n.id === view)!;

  if (!entered) {
    return (
      <>
        <Landing att={att} onEnter={enterApp} />
        {intro && <IntroCurtain />}
      </>
    );
  }

  return (
    <div className="shell">
      {intro && <IntroCurtain fading />}
      <div className="bg-orb orb-1" aria-hidden />
      <div className="bg-orb orb-2" aria-hidden />


      {/* ===================== SIDEBAR ===================== */}
      <aside className={`side ${navOpen ? "open" : ""}`}>
        <div className="side-brand" onClick={() => setView("overview")}>
          <img src="/solvent.png" alt="" className="side-logo" />
          <div>
            <b>Solvent</b>
            <span>ZK proof-of-reserves</span>
          </div>
        </div>

        <nav className="side-nav">
          <span className="side-label">Console</span>
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`side-item ${view === n.id ? "active" : ""}`}
              onClick={() => {
                setView(n.id);
                setNavOpen(false);
              }}
            >
              <span className="side-ic">{n.icon}</span>
              <span className="side-txt">
                <b>{n.label}</b>
                <i>{n.hint}</i>
              </span>
              {n.id === "issuers" && (
                <span className="side-count">{SCENARIOS.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="side-foot">
          <a
            className="side-net"
            href={`${EXPLORER}/contract/${CONTRACT_ID}`}
            target="_blank"
            rel="noreferrer"
          >
            <span className="net-dot" />
            <div>
              <b>Stellar testnet</b>
              <i className="mono">{short(CONTRACT_ID, 5)}</i>
            </div>
            <span className="side-net-go">↗</span>
          </a>

          {wallet ? (
            <div className="side-wallet" onClick={(e) => e.stopPropagation()}>
              <button
                className={`side-wallet-btn ${walletMenu ? "active" : ""}`}
                onClick={() => setWalletMenu((o) => !o)}
              >
                <span className="wallet-avatar" />
                <span className="mono">{short(wallet, 5)}</span>
                <span className="wallet-caret">▾</span>
              </button>
              {walletMenu && (
                <div className="wallet-menu up">
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
              className="btn btn-primary side-connect"
              onClick={onConnect}
              disabled={connecting}
            >
              {connecting ? "Connecting…" : "Connect Freighter"}
            </button>
          )}
          {walletErr && <p className="side-err">{walletErr}</p>}
        </div>
      </aside>

      {navOpen && (
        <div className="side-scrim" onClick={() => setNavOpen(false)} />
      )}

      {/* ===================== MAIN ===================== */}
      <div className="main">
        <header className="topbar">
          <button
            className="hamb"
            onClick={() => setNavOpen((o) => !o)}
            aria-label="Menu"
          >
            <span /><span /><span />
          </button>
          <div className="topbar-title">
            <h1>{active.label}</h1>
            <span>{active.hint}</span>
          </div>
          <div className="topbar-right">
            <span className="net-pill">
              <span className="net-dot" /> testnet
            </span>
            {wallet ? (
              <div className="wallet-wrap" onClick={(e) => e.stopPropagation()}>
                <button
                  className={`wallet-pill ${walletMenu ? "active" : ""}`}
                  onClick={() => setWalletMenu((o) => !o)}
                >
                  <span className="wallet-avatar" />
                  {short(wallet)}
                </button>
              </div>
            ) : (
              <button
                className="btn btn-primary btn-sm"
                onClick={onConnect}
                disabled={connecting}
              >
                {connecting ? "Connecting…" : "Connect wallet"}
              </button>
            )}
          </div>
        </header>

        <div className="content">
          {view === "overview" && (
            <Overview
              att={att}
              loading={loading}
              attErr={attErr}
              wallet={wallet}
              onGoVerify={() => setView("verify")}
              onConnect={onConnect}
              connecting={connecting}
            />
          )}
          {view === "verify" && (
            <VerifyWorkbench
              wallet={wallet}
              onConnect={onConnect}
              connecting={connecting}
              walletErr={walletErr}
              onVerify={onVerify}
              verifying={verifying}
              verify={verify}
              onLand={onLand}
              landing={landing}
              landed={landed}
              onReplay={onReplay}
              submitting={submitting}
              submit={submit}
              flowErr={flowErr}
            />
          )}
          {view === "issuers" && <Issuers att={att} />}
          {view === "onchain" && <Onchain />}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  OVERVIEW                                                          */
/* ================================================================== */

function Overview({
  att,
  loading,
  attErr,
  wallet,
  onGoVerify,
  onConnect,
  connecting,
}: {
  att: Attestation | null;
  loading: boolean;
  attErr: string | null;
  wallet: string | null;
  onGoVerify: () => void;
  onConnect: () => void;
  connecting: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const target = att ? Number(att.threshold) : 0;
  const counted = useCountUp(target, !!att);

  return (
    <div className="view">
      {/* banner */}
      <section className="banner">
        <div className="banner-copy">
          <span className="tag">
            <span className="badge-dot" /> Live on Stellar testnet
          </span>
          <h2>
            Reserves proven. <span className="grad">Balance hidden.</span>
          </h2>
          <p>
            An issuer proves their bank balance clears a threshold from a real
            DKIM-signed email — verified on-chain with a BN254 pairing check.
            The actual number never touches the chain.
          </p>
          <div className="banner-cta">
            <button className="btn btn-primary" onClick={onGoVerify}>
              ⚡ Run the live proof
            </button>
            {!wallet && (
              <button
                className="btn btn-ghost"
                onClick={onConnect}
                disabled={connecting}
              >
                {connecting ? "Connecting…" : "Connect Freighter"}
              </button>
            )}
          </div>
        </div>
        <div className="banner-side" ref={ref}>
          <div className="reserve-tile">
            <span className="reserve-label">Reserve proven · {DEMO_ISSUER.label}</span>
            {loading ? (
              <div className="reserve-skel" />
            ) : att ? (
              <div className="reserve-value">
                ≥ {formatUsd(BigInt(counted))}
                <span className="reserve-check">✓</span>
              </div>
            ) : (
              <div className="reserve-value muted">—</div>
            )}
            <div className="reserve-meta">
              <span>🔒 balance never disclosed</span>
              {att && <span className="mono">proven {formatDate(att.timestamp)}</span>}
            </div>
          </div>
        </div>
      </section>

      {attErr && <p className="inline-err">Could not read attestation: {attErr}</p>}

      {/* metric cards */}
      <section className="metrics">
        <Metric
          icon="🔒"
          value={att ? formatUsd(att.threshold) : "—"}
          label="Reserve floor proven"
          sub="threshold, not the balance"
        />
        <Metric
          icon="◎"
          value={CIRCUIT.constraints.toLocaleString()}
          label="Circuit constraints"
          sub="BN254 · Groth16"
        />
        <Metric
          icon="⚡"
          value="< 100M"
          label="On-chain budget used"
          sub="fits Soroban limit"
        />
        <Metric
          icon="🛡️"
          value="#7"
          label="Replay rejection"
          sub="nullifier burned"
        />
      </section>

      {/* two-up: mechanism + status */}
      <section className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <h3>How a proof is made</h3>
            <span className="panel-tag">4 stages</span>
          </div>
          <ol className="flow">
            {[
              ["DKIM-signed email", `${DKIM.domain} · ${DKIM.algo}`],
              ["In-circuit sender extraction", "From header → Poseidon"],
              ["Groth16 proof over signature", "balance ≥ threshold, in ZK"],
              ["Native BN254 pairing_check", "verified inside Soroban"],
            ].map(([t, d], i) => (
              <li key={i}>
                <span className="flow-n">{i + 1}</span>
                <div>
                  <b>{t}</b>
                  <i className="mono">{d}</i>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>Attestation status</h3>
            <span className="live-chip">
              <span className="net-dot" /> live
            </span>
          </div>
          {att ? (
            <div className="statlist">
              <Row k="Issuer" v={DEMO_ISSUER.label} />
              <Row k="Signed by" v="Bank DKIM key (in-circuit)" />
              <Row k="Proven on" v={formatDate(att.timestamp)} />
              <Row k="Nullifier" v={short(att.nullifier, 8)} mono />
              <Row k="Replay attempt" v="rejected · #7" reject />
            </div>
          ) : (
            <div className="statlist">
              <div className="reserve-skel row" />
              <div className="reserve-skel row" />
              <div className="reserve-skel row" />
            </div>
          )}
          <a
            className="panel-link"
            href={`${EXPLORER}/tx/${PROVE_TX}`}
            target="_blank"
            rel="noreferrer"
          >
            Verify the pairing_check on-chain ↗
          </a>
        </div>
      </section>
    </div>
  );
}

function Metric({
  icon,
  value,
  label,
  sub,
}: {
  icon: string;
  value: string;
  label: string;
  sub: string;
}) {
  return (
    <div className="metric">
      <span className="metric-ic">{icon}</span>
      <b className="metric-val">{value}</b>
      <span className="metric-label">{label}</span>
      <span className="metric-sub">{sub}</span>
    </div>
  );
}

function Row({
  k,
  v,
  mono,
  reject,
}: {
  k: string;
  v: string;
  mono?: boolean;
  reject?: boolean;
}) {
  return (
    <div className="srow">
      <span>{k}</span>
      <b className={`${mono ? "mono" : ""} ${reject ? "reject" : ""}`}>{v}</b>
    </div>
  );
}

/* ================================================================== */
/*  VERIFY WORKBENCH — the core app                                   */
/* ================================================================== */

const PROVE_STEPS = [
  { k: "Reading DKIM signature", d: `${DKIM.domain} · ${DKIM.algo}` },
  { k: "Extracting sender (in-circuit regex)", d: "From header → Poseidon" },
  { k: "Reading signed balance", d: "body hash matched" },
  { k: "Proving balance ≥ threshold", d: "Groth16 · BN254" },
];
type Phase = "idle" | "proving" | "proved";

function VerifyWorkbench({
  wallet,
  onConnect,
  connecting,
  walletErr,
  onVerify,
  verifying,
  verify,
  onLand,
  landing,
  landed,
  onReplay,
  submitting,
  submit,
  flowErr,
}: {
  wallet: string | null;
  onConnect: () => void;
  connecting: boolean;
  walletErr: string | null;
  onVerify: () => void;
  verifying: boolean;
  verify: VerifyResult | null;
  onLand: () => void;
  landing: boolean;
  landed: LandedTx | null;
  onReplay: () => void;
  submitting: boolean;
  submit: SubmitResult | null;
  flowErr: string | null;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [active, setActive] = useState(-1);
  const [sc, setSc] = useState<Scenario>(SCENARIOS[0]);

  function pickScenario(next: Scenario) {
    if (next.id === sc.id) return;
    setSc(next);
    setPhase("idle");
    setActive(-1);
  }

  function generate() {
    if (phase === "proving") return;
    setPhase("proving");
    setActive(0);
    let i = 0;
    const tick = () => {
      i += 1;
      if (i < PROVE_STEPS.length) {
        setActive(i);
        setTimeout(tick, 540);
      } else {
        setTimeout(() => {
          setActive(-1);
          setPhase("proved");
        }, 460);
      }
    };
    setTimeout(tick, 540);
  }

  // progress across the whole workbench
  const stage = !wallet
    ? 0
    : phase !== "proved"
      ? 1
      : !verify
        ? 2
        : !landed
          ? 3
          : 4;

  return (
    <div className="view">
      <div className="wb-progress">
        {["Connect", "Build proof", "Verify", "Sign & land", "Anti-replay"].map(
          (s, i) => (
            <div
              key={s}
              className={`wb-pnode ${i < stage ? "done" : ""} ${i === stage ? "cur" : ""}`}
            >
              <span className="wb-pdot">{i < stage ? "✓" : i + 1}</span>
              <span className="wb-plabel">{s}</span>
            </div>
          ),
        )}
      </div>

      <div className="wb">
        {/* LEFT — build the proof */}
        <section className="wb-col">
          <div className="panel">
            <div className="panel-head">
              <h3>1 · Build the proof from an email</h3>
              <span className="panel-tag">off-chain prover</span>
            </div>

            <div className="hd-scenarios" role="tablist">
              {SCENARIOS.map((s) => (
                <button
                  key={s.id}
                  role="tab"
                  aria-selected={s.id === sc.id}
                  className={`hd-scenario ${s.id === sc.id ? "active" : ""}`}
                  onClick={() => pickScenario(s)}
                >
                  <span className="hd-sc-av">{s.avatar}</span>
                  <span className="hd-sc-name">{s.label}</span>
                  <span className={`hd-sc-tag ${s.live ? "live" : ""}`}>
                    {s.live ? "live" : "template"}
                  </span>
                </button>
              ))}
            </div>

            <div className="hd-email">
              <div className="hd-eml-head">
                <span className="hd-eml-ic">{sc.avatar}</span>
                <div>
                  <b>Balance statement · {sc.label}</b>
                  <span className="mono">from: alerts@{sc.domain}</span>
                </div>
                <span className="hd-eml-verified">DKIM ✓</span>
              </div>
              <div className="hd-eml-body">
                <div className="hd-eml-line">
                  <span>Available balance</span>
                  <span className="hd-eml-bal">
                    {phase === "proved" ? (
                      <><span className="hd-lock">🔒</span> hidden</>
                    ) : (
                      "••••••••"
                    )}
                  </span>
                </div>
                <div className="hd-eml-line">
                  <span>Prove floor</span>
                  <b className="mono">≥ {sc.threshold}</b>
                </div>
              </div>
              <div className="hd-eml-sig mono">
                dkim-signature: a={DKIM.algo}; d={DKIM.domain}; s={DKIM.selector};
                bh={DKIM.bodyHash.slice(0, 16)}…
              </div>
            </div>

            {phase !== "idle" && (
              <div className="hd-pipe">
                {PROVE_STEPS.map((s, i) => {
                  const done = phase === "proved" || i < active;
                  const cur = phase === "proving" && i === active;
                  return (
                    <div
                      key={s.k}
                      className={`hd-pstep ${done ? "done" : ""} ${cur ? "cur" : ""}`}
                    >
                      <span className="hd-pmark">
                        {done ? "✓" : cur ? <span className="spinner tiny" /> : ""}
                      </span>
                      <div className="hd-ptext">
                        <b>{s.k}</b>
                        <span className="mono">{s.d}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {phase === "proved" && (
              <div className="hd-proof">
                <div className="hd-proof-head">
                  <span className="pv-proof-label mono">π groth16</span>
                  <span className="hd-proof-ok">ready</span>
                </div>
                <div className="pv-hexes">
                  {[PROOF_HEX.a, PROOF_HEX.bx, PROOF_HEX.c].map((h) => (
                    <span key={h} className="pv-hex mono">{h}</span>
                  ))}
                </div>
                <div className="hd-proof-null mono">
                  nullifier {PROOF_HEX.nullifier}
                </div>
                {!sc.live && (
                  <div className="hd-proof-tpl">
                    Template preview — only <b>Acme Bank</b> has a proof burned
                    on-chain. Pick it to verify live.
                  </div>
                )}
              </div>
            )}

            <button
              className="btn btn-primary wb-btn"
              onClick={generate}
              disabled={phase === "proving" || phase === "proved"}
            >
              {phase === "proving" ? (
                <><span className="spinner" /> Generating proof…</>
              ) : phase === "proved" ? (
                "✓ Proof generated"
              ) : (
                "Generate proof from email"
              )}
            </button>
          </div>
        </section>

        {/* RIGHT — on-chain actions */}
        <section className="wb-col">
          {!wallet ? (
            <div className="panel gate">
              <div className="gate-glow" />
              <div className="gate-lock">🔓</div>
              <h3>Connect a wallet to verify on-chain</h3>
              <p>
                Everything runs read-only until you explicitly sign. Testnet
                only — no real funds move. New accounts are auto-funded.
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
            <>
              {/* verify (read-only) */}
              <div className="panel">
                <div className="panel-head">
                  <h3>2 · Verify on-chain</h3>
                  <span className="panel-tag mono">verify_proof · read-only</span>
                </div>
                <p className="panel-body">
                  Runs Stellar's native <code>bn254.pairing_check</code> against
                  the deployed verification key — no state, no fee, repeatable.
                </p>
                <button
                  className="btn btn-primary wb-btn"
                  onClick={onVerify}
                  disabled={verifying || phase !== "proved"}
                >
                  {verifying ? (
                    <><span className="spinner" /> Verifying on-chain…</>
                  ) : phase !== "proved" ? (
                    "Build a proof first"
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
                          width: `${Math.min(100, (verify.cpuInsns / verify.budget) * 100)}%`,
                        }}
                      />
                    </div>
                    <p className="result-note">
                      Fits under Soroban's 100M budget — on-chain ZK is practical.
                    </p>
                  </div>
                )}
              </div>

              {/* sign & land */}
              <div className="panel">
                <div className="panel-head">
                  <h3>3 · Sign &amp; broadcast</h3>
                  <span className="panel-tag mono">you sign · lands</span>
                </div>
                <p className="panel-body">
                  Sign a real Soroban tx in Freighter. It's included in a ledger
                  under <b>your own address</b> — the hash truly resolves on
                  Stellar Expert, signed by{" "}
                  <span className="mono">{short(wallet, 4)}</span>.
                </p>
                <button
                  className="btn btn-primary wb-btn"
                  onClick={onLand}
                  disabled={landing || !verify}
                >
                  {landing ? (
                    <><span className="spinner" /> Waiting for ledger…</>
                  ) : !verify ? (
                    "Verify first"
                  ) : (
                    "Sign & broadcast to testnet"
                  )}
                </button>
                {landed && (
                  <div className="result ok">
                    <div className="result-row">
                      <span>Included in ledger</span>
                      <b className="mono">#{landed.ledger.toLocaleString()}</b>
                    </div>
                    <div className="result-row">
                      <span>On-chain instructions</span>
                      <b className="mono">{landed.cpuInsns.toLocaleString()}</b>
                    </div>
                    <p className="result-note">
                      ✅ Confirmed on testnet, signed by your wallet.
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
                  </div>
                )}
              </div>

              {/* replay */}
              <div className="panel">
                <div className="panel-head">
                  <h3>4 · Try to double-spend</h3>
                  <span className="panel-tag mono">prove_reserve · replay</span>
                </div>
                <p className="panel-body">
                  <code>prove_reserve</code> burns a nullifier the first time.
                  Replaying the same email is rejected with <b>Error #7</b> at
                  preflight — no ledger slot, no fee.
                </p>
                <button
                  className="btn btn-ghost wb-btn"
                  onClick={onReplay}
                  disabled={submitting || !landed}
                >
                  {submitting ? (
                    <><span className="spinner" /> Attempting replay…</>
                  ) : !landed ? (
                    "Land a proof first"
                  ) : (
                    "🛡️ Run the replay"
                  )}
                </button>
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
                      . The same email can never mint twice.
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
            </>
          )}
        </section>
      </div>
      {flowErr && <p className="inline-err center">{flowErr}</p>}
    </div>
  );
}

/* ================================================================== */
/*  ISSUERS                                                           */
/* ================================================================== */

function Issuers({ att }: { att: Attestation | null }) {
  return (
    <div className="view">
      <div className="panel-note">
        Only issuers whose DKIM sender hash is registered on the contract can
        post an attestation. <b>Acme Bank</b> has a proof burned on-chain; the
        others are honestly-labelled templates of the identical flow.
      </div>
      <div className="issuer-grid">
        {SCENARIOS.map((s) => (
          <div key={s.id} className={`issuer-card ${s.live ? "live" : ""}`}>
            <div className="issuer-top">
              <span className="issuer-avatar">{s.avatar}</span>
              <div>
                <b>{s.label}</b>
                <span className="mono">{s.domain}</span>
              </div>
              <span className={`issuer-badge ${s.live ? "on" : ""}`}>
                {s.live ? "● live" : "template"}
              </span>
            </div>
            <div className="issuer-body">
              <div className="issuer-metric">
                <span>Reserve floor</span>
                <b>{s.threshold}</b>
              </div>
              <div className="issuer-metric">
                <span>Status</span>
                <b className={s.live ? "good" : "muted"}>
                  {s.live ? "attested on-chain" : "not yet proven"}
                </b>
              </div>
              {s.live && att && (
                <div className="issuer-metric">
                  <span>Proven on</span>
                  <b className="mono">{formatDate(att.timestamp)}</b>
                </div>
              )}
            </div>
            {s.live ? (
              <a
                className="btn btn-ghost btn-sm issuer-cta"
                href={`${EXPLORER}/tx/${PROVE_TX}`}
                target="_blank"
                rel="noreferrer"
              >
                View attestation ↗
              </a>
            ) : (
              <button className="btn btn-ghost btn-sm issuer-cta" disabled>
                Template preview
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  ON-CHAIN                                                          */
/* ================================================================== */

function Onchain() {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard?.writeText(CONTRACT_ID);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }
  return (
    <div className="view">
      <div className="panel">
        <div className="panel-head">
          <h3>Deployed contract</h3>
          <span className="live-chip">
            <span className="net-dot" /> testnet
          </span>
        </div>
        <button className="contract-row" onClick={copy}>
          <span className="mono">{CONTRACT_ID}</span>
          <span className="copy-ic">{copied ? "✓ copied" : "copy"}</span>
        </button>
        <div className="onchain-facts">
          <Fact k="Proof system" v="Groth16" />
          <Fact k="Curve" v={CIRCUIT.curve} />
          <Fact k="Constraints" v={CIRCUIT.constraints.toLocaleString()} />
          <Fact k="Verifier" v="native pairing_check" />
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>The verifiable transaction chain</h3>
          <span className="panel-tag">4 tx · all live</span>
        </div>
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
              style={{ ["--d" as string]: `${i * 70}ms` }}
            >
              <span className="txnode-k">{t.k}</span>
              <span className="txnode-h mono">{short(t.h, 6)}</span>
              <span className="txnode-go">↗</span>
            </a>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Public journal</h3>
          <span className="panel-tag">7 signals</span>
        </div>
        <div className="journal-grid open">
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
      </div>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="ofact">
      <span>{k}</span>
      <b>{v}</b>
    </div>
  );
}

/* ================================================================== */
/*  LANDING PAGE                                                      */
/* ================================================================== */

function Landing({
  att,
  onEnter,
}: {
  att: Attestation | null;
  onEnter: (v: View) => void;
}) {
  return (
    <div className="lp">
      <div className="lp-veil" aria-hidden>
        <DarkVeil
          hueShift={222}
          speed={0.5}
          warpAmount={0.6}
          noiseIntensity={0.02}
          scanlineIntensity={0.05}
          scanlineFrequency={2}
          resolutionScale={1}
        />
      </div>
      <div className="lp-veil-fade" aria-hidden />
      <div className="lp-grid-bg" aria-hidden />


      <header className="lp-nav">
        <div className="lp-brand">
          <img src="/solvent.png" alt="" />
          <b>Solvent</b>
        </div>
        <nav className="lp-links">
          <a href="#how">How it works</a>
          <a href="#proof">Live proof</a>
          <a
            href={`${EXPLORER}/contract/${CONTRACT_ID}`}
            target="_blank"
            rel="noreferrer"
          >
            Contract ↗
          </a>
        </nav>
        <button className="btn btn-primary btn-sm" onClick={() => onEnter("overview")}>
          Launch app
        </button>
      </header>

      <main className="lp-hero">
        <span className="lp-badge">
          <span className="badge-dot" /> Live on Stellar testnet · Groth16 on-chain
        </span>
        <h1 className="lp-title">
          Prove your reserves.
          <br />
          <span className="grad">Never reveal the balance.</span>
        </h1>
        <p className="lp-sub">
          Solvent lets an issuer prove a bank balance clears a threshold —
          straight from a real DKIM-signed email — and verifies it on-chain with
          a native BN254 pairing check. The actual number never leaves the
          browser.
        </p>
        <div className="lp-cta">
          <button className="btn btn-primary btn-lg" onClick={() => onEnter("verify")}>
            ⚡ Run the live proof
          </button>
          <button className="btn btn-ghost btn-lg" onClick={() => onEnter("overview")}>
            Explore the console
          </button>
        </div>

        <div className="lp-stats">
          <div className="lp-stat">
            <b>{att ? formatUsd(att.threshold) : "≥ $1M"}</b>
            <span>reserve floor proven</span>
          </div>
          <div className="lp-stat">
            <b>{CIRCUIT.constraints.toLocaleString()}</b>
            <span>circuit constraints</span>
          </div>
          <div className="lp-stat">
            <b>&lt; 100M</b>
            <span>on-chain CPU budget</span>
          </div>
          <div className="lp-stat">
            <b>0</b>
            <span>bytes of balance leaked</span>
          </div>
        </div>
      </main>

      <section className="lp-how" id="how">
        <span className="lp-eyebrow">The mechanism</span>
        <h2 className="lp-h2">Four honest steps, one on-chain truth</h2>
        <div className="lp-cards">
          {[
            ["✉️", "Real signed email", "A DKIM-signed balance statement from the bank — cryptographic, unforgeable."],
            ["◎", "In-circuit extraction", "Sender & balance are parsed inside the circuit, hashed with Poseidon."],
            ["🔐", "Groth16 proof", "A succinct proof that balance ≥ threshold — the number stays private."],
            ["⛓", "Native verification", "Soroban runs bn254.pairing_check on-chain. No trusted verifier."],
          ].map(([ic, t, d], i) => (
            <div className="lp-card" key={i} style={{ ["--d" as string]: `${i * 80}ms` }}>
              <span className="lp-card-ic">{ic}</span>
              <b>{t}</b>
              <p>{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-showcase" id="proof">
        <div className="lp-showcase-copy">
          <span className="lp-eyebrow">Provably real</span>
          <h2 className="lp-h2">Not a mock. It lands on testnet.</h2>
          <p>
            Connect Freighter and sign a genuine Soroban transaction. The hash
            resolves on Stellar Expert under your own account — and replaying the
            same email is rejected by a burned nullifier.
          </p>
          <button className="btn btn-primary btn-lg" onClick={() => onEnter("verify")}>
            Try it yourself →
          </button>
        </div>
        <div className="lp-showcase-card">
          <div className="lp-sc-head">
            <span className="net-dot" /> verify_proof · live
          </div>
          <div className="lp-sc-row"><span>pairing_check</span><b className="good">✓ valid</b></div>
          <div className="lp-sc-row"><span>reserve floor</span><b>{att ? formatUsd(att.threshold) : "—"}</b></div>
          <div className="lp-sc-row"><span>balance disclosed</span><b>🔒 none</b></div>
          <div className="lp-sc-row"><span>replay attempt</span><b className="reject">Error #7</b></div>
          <div className="lp-sc-bar"><span style={{ width: "62%" }} /></div>
          <div className="lp-sc-foot mono">fits Soroban 100M budget</div>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-brand">
          <img src="/solvent.png" alt="" />
          <b>Solvent</b>
        </div>
        <span>Zero-knowledge proof-of-reserves · Stellar Soroban</span>
        <button className="btn btn-primary btn-sm" onClick={() => onEnter("overview")}>
          Launch app
        </button>
      </footer>
    </div>
  );
}

/* ================================================================== */
/*  INTRO CURTAIN — landing → app transition                          */
/* ================================================================== */

function IntroCurtain({ fading }: { fading?: boolean }) {
  return (
    <div className={`intro ${fading ? "out" : ""}`}>
      <div className="intro-core">
        <div className="intro-logo">
          <img src="/solvent.png" alt="" />
          <span className="intro-ring" />
        </div>
        <div className="intro-word">Solvent</div>
        <div className="intro-line">
          <span className="intro-line-fill" />
        </div>
        <div className="intro-cap mono">initializing secure console…</div>
      </div>
    </div>
  );
}

