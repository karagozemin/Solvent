import { useEffect, useRef, useState } from "react";
import { Icon, Stamp, type IconName } from "./ui";
import {
  connectWallet,
  disconnectWallet,
  persistWallet,
  verifyProofLive,
  submitVerifyProof,
  submitProveReserve,
  getAttestation,
  DEMO_ISSUER,
  CIRCUIT,
  EXPLORER,
  CONTRACT_ID,
  PROVE_TX,
  TX_CHAIN,
  PUB_SIGNALS,
  DKIM,
  PROOF_HEX,
  SCENARIOS,
  formatUsd,
  formatDate,
  type Scenario,
  type VerifyResult,
  type LandedTx,
  type SubmitResult,
  type Attestation,
} from "./solvent";

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

const short = (a: string, n = 4) => `${a.slice(0, n)}…${a.slice(-n)}`;

function useCountUp(target: number, run: boolean, ms = 1200) {
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

const NAV: { id: View; label: string; icon: IconName; hint: string }[] = [
  { id: "overview", label: "Overview", icon: "seal", hint: "Live reserve status" },
  { id: "verify", label: "Verify reserves", icon: "circuit", hint: "Run the ZK flow" },
  { id: "issuers", label: "Attestations", icon: "bank", hint: "Registered issuers" },
  { id: "onchain", label: "On-chain", icon: "chain", hint: "Contract & journal" },
];

/* ================================================================== */
/*  Console shell                                                     */
/* ================================================================== */

type Props = {
  address: string | null;
  setAddress: (a: string | null) => void;
  onExit: () => void;
};

export function Console({ address, setAddress, onExit }: Props) {
  const [view, setView] = useState<View>("overview");
  const [navOpen, setNavOpen] = useState(false);
  const [walletMenu, setWalletMenu] = useState(false);
  const [addrCopied, setAddrCopied] = useState(false);

  const [att, setAtt] = useState<Attestation | null>(null);
  const [loading, setLoading] = useState(true);
  const [attErr, setAttErr] = useState<string | null>(null);

  const [connecting, setConnecting] = useState(false);
  const [walletErr, setWalletErr] = useState<string | null>(null);

  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [landed, setLanded] = useState<LandedTx | null>(null);
  const [landing, setLanding] = useState(false);
  const [submit, setSubmit] = useState<SubmitResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [flowErr, setFlowErr] = useState<string | null>(null);

  /* ---- wallet ---- */
  async function onConnect() {
    setConnecting(true);
    setWalletErr(null);
    try {
      const w = await connectWallet();
      persistWallet(w.address);
      setAddress(w.address);
    } catch (e) {
      setWalletErr(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  }
  function onDisconnect() {
    disconnectWallet();
    setAddress(null);
    setWalletMenu(false);
    setVerify(null);
    setLanded(null);
    setSubmit(null);
    setFlowErr(null);
  }
  function copyAddress() {
    if (!address) return;
    navigator.clipboard?.writeText(address);
    setAddrCopied(true);
    setTimeout(() => setAddrCopied(false), 1400);
  }

  /* ---- flow ---- */
  async function onVerify() {
    if (!address) return;
    setVerifying(true);
    setFlowErr(null);
    setVerify(null);
    try {
      setVerify(await verifyProofLive(address));
    } catch (e) {
      setFlowErr(e instanceof Error ? e.message : String(e));
    } finally {
      setVerifying(false);
    }
  }
  async function onLand() {
    if (!address) return;
    setLanding(true);
    setFlowErr(null);
    setLanded(null);
    try {
      setLanded(await submitVerifyProof(address));
    } catch (e) {
      setFlowErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLanding(false);
    }
  }
  async function onReplay() {
    if (!address) return;
    setSubmitting(true);
    setFlowErr(null);
    setSubmit(null);
    try {
      setSubmit(await submitProveReserve(address));
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
    if (!walletMenu) return;
    const close = () => setWalletMenu(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [walletMenu]);

  const active = NAV.find((n) => n.id === view)!;

  return (
    <div className="shell">
      {/* ===================== SIDEBAR ===================== */}
      <aside className={`side ${navOpen ? "open" : ""}`}>
        <button className="side-brand" onClick={onExit} title="Back to landing">
          <img className="side-logo" src="/logo.png" alt="Solvent" />
          <span className="side-brand-txt">
            <b>Solvent</b>
            <span className="stencil">ZK PROOF-OF-RESERVES</span>
          </span>
        </button>

        <nav className="side-nav">
          <span className="side-label stencil">Console</span>
          {NAV.map((n) => {
            const Ico = Icon[n.icon];
            return (
              <button
                key={n.id}
                className={`side-item ${view === n.id ? "active" : ""}`}
                onClick={() => {
                  setView(n.id);
                  setNavOpen(false);
                }}
              >
                <span className="side-ic">
                  <Ico size={18} />
                </span>
                <span className="side-txt">
                  <b>{n.label}</b>
                  <i>{n.hint}</i>
                </span>
                {n.id === "issuers" && (
                  <span className="side-count">{SCENARIOS.length}</span>
                )}
              </button>
            );
          })}
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
            <Icon.arrowUpRight size={13} />
          </a>

          {address ? (
            <div className="side-wallet" onClick={(e) => e.stopPropagation()}>
              <button
                className={`side-wallet-btn ${walletMenu ? "active" : ""}`}
                onClick={() => setWalletMenu((o) => !o)}
              >
                <span className="wallet-dot" />
                <span className="mono">{short(address, 5)}</span>
                <span className="wallet-caret">▾</span>
              </button>
              {walletMenu && (
                <div className="wallet-menu">
                  <button className="wallet-menu-item" onClick={copyAddress}>
                    <span>{addrCopied ? "Copied" : "Copy address"}</span>
                    <Icon.copy size={14} />
                  </button>
                  <a
                    className="wallet-menu-item"
                    href={`${EXPLORER}/account/${address}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setWalletMenu(false)}
                  >
                    <span>View on explorer</span>
                    <Icon.arrowUpRight size={14} />
                  </a>
                  <button
                    className="wallet-menu-item danger"
                    onClick={onDisconnect}
                  >
                    <span>Disconnect</span>
                    <Icon.power size={14} />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              className="btn btn-ink wide"
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
        <header className="main-top">
          <button
            className="hamb"
            onClick={() => setNavOpen((o) => !o)}
            aria-label="Menu"
          >
            <span />
            <span />
            <span />
          </button>
          <div className="main-title">
            <h1>{active.label}</h1>
            <span className="stencil">{active.hint}</span>
          </div>
          <div className="main-right">
            <span className="net-pill">
              <span className="net-dot" /> testnet
            </span>
            {address ? (
              <span className="wallet-pill mono">
                <span className="wallet-dot" />
                {short(address)}
              </span>
            ) : (
              <button
                className="btn btn-ink sm"
                onClick={onConnect}
                disabled={connecting}
              >
                {connecting ? "Connecting…" : "Connect"}
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
              address={address}
              onGoVerify={() => setView("verify")}
              onConnect={onConnect}
              connecting={connecting}
            />
          )}
          {view === "verify" && (
            <VerifyWorkbench
              address={address}
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
  address,
  onGoVerify,
  onConnect,
  connecting,
}: {
  att: Attestation | null;
  loading: boolean;
  attErr: string | null;
  address: string | null;
  onGoVerify: () => void;
  onConnect: () => void;
  connecting: boolean;
}) {
  const target = att ? Number(att.threshold) : 0;
  const counted = useCountUp(target, !!att);

  return (
    <div className="view">
      {/* banner */}
      <section className="banner">
        <div className="banner-copy">
          <span className="doc-tag stencil">
            <span className="net-dot" /> LIVE ON STELLAR TESTNET
          </span>
          <h2 className="banner-h">
            Reserves proven. <span className="hero-em">Balance hidden.</span>
          </h2>
          <p>
            An issuer proves their bank balance clears a threshold from a real
            DKIM-signed email, verified on-chain with a BN254 pairing check.

            The actual number never touches the chain.
          </p>
          <div className="banner-cta">
            <button className="btn btn-ink" onClick={onGoVerify}>
              <Icon.bolt size={16} /> Run the live proof
            </button>
            {!address && (
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

        <div className="cert reserve-cert">
          <span className="cert-perf" aria-hidden />
          <div className="cert-issuer">
            <span className="cert-issuer-ico">
              <Icon.bank size={20} />
            </span>
            <div>
              <b>{DEMO_ISSUER.label}</b>
              <span className="cert-domain stencil">RESERVE ATTESTATION</span>
            </div>
          </div>
          <div className="reserve-value">
            {loading ? (
              <span className="reserve-skel" />
            ) : att ? (
              <>
                ≥ {formatUsd(BigInt(counted))}
                <span className="reserve-check">
                  <Icon.check size={22} />
                </span>
              </>
            ) : (
              <span className="muted">Not proven yet</span>
            )}

          </div>
          <div className="cert-row">
            <span>
              <Icon.lock size={14} /> Balance disclosed
            </span>
            <b>none</b>
          </div>
          {att && (
            <div className="cert-row">
              <span>Proven on</span>
              <b className="mono">{formatDate(att.timestamp)}</b>
            </div>
          )}
          <Stamp label="SEALED" sub="ON-CHAIN" tone="seal" angle={-7} size={80} />
        </div>
      </section>

      {attErr && (
        <p className="inline-err">Could not read attestation: {attErr}</p>
      )}

      {/* metrics */}
      <section className="metrics">
        <Metric
          icon="lock"
          value={att ? formatUsd(att.threshold) : "···"}

          label="Reserve floor proven"
          sub="threshold, not the balance"
        />
        <Metric
          icon="circuit"
          value={CIRCUIT.constraints.toLocaleString()}
          label="Circuit constraints"
          sub="BN254 · Groth16"
        />
        <Metric
          icon="bolt"
          value="< 100M"
          label="On-chain budget used"
          sub="fits Soroban limit"
        />
        <Metric
          icon="seal"
          value="#7"
          label="Replay rejection"
          sub="nullifier burned"
        />
      </section>

      {/* two-up */}
      <section className="grid-2">
        <div className="op">
          <div className="op-head slim">
            <h3>How a proof is made</h3>
            <span className="op-tag stencil">4 STAGES</span>
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

        <div className="op">
          <div className="op-head slim">
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
              <span className="reserve-skel row" />
              <span className="reserve-skel row" />
              <span className="reserve-skel row" />
            </div>
          )}
          <a
            className="op-link"
            href={`${EXPLORER}/tx/${PROVE_TX}`}
            target="_blank"
            rel="noreferrer"
          >
            Verify the pairing_check on-chain <Icon.arrowUpRight size={13} />
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
  icon: IconName;
  value: string;
  label: string;
  sub: string;
}) {
  const Ico = Icon[icon];
  return (
    <div className="metric">
      <span className="metric-ic">
        <Ico size={18} />
      </span>
      <b className="metric-val">{value}</b>
      <span className="metric-label">{label}</span>
      <span className="metric-sub stencil">{sub}</span>
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
/*  VERIFY WORKBENCH                                                  */
/* ================================================================== */

const PROVE_STEPS = [
  { k: "Reading DKIM signature", d: `${DKIM.domain} · ${DKIM.algo}` },
  { k: "Extracting sender (in-circuit regex)", d: "From header → Poseidon" },
  { k: "Reading signed balance", d: "body hash matched" },
  { k: "Proving balance ≥ threshold", d: "Groth16 · BN254" },
];
type Phase = "idle" | "proving" | "proved";

function VerifyWorkbench({
  address,
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
  address: string | null;
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
  const [step, setStep] = useState(-1);
  const [sc, setSc] = useState<Scenario>(SCENARIOS[0]);

  function pickScenario(next: Scenario) {
    if (next.id === sc.id) return;
    setSc(next);
    setPhase("idle");
    setStep(-1);
  }

  function generate() {
    if (phase === "proving") return;
    setPhase("proving");
    setStep(0);
    let i = 0;
    const tick = () => {
      i += 1;
      if (i < PROVE_STEPS.length) {
        setStep(i);
        setTimeout(tick, 520);
      } else {
        setTimeout(() => {
          setStep(-1);
          setPhase("proved");
        }, 440);
      }
    };
    setTimeout(tick, 520);
  }

  const stage = !address
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
      {/* progress rail */}
      <div className="wb-progress">
        {["Connect", "Build proof", "Verify", "Sign & land", "Anti-replay"].map(
          (s, i) => (
            <div
              key={s}
              className={`wb-pnode ${i < stage ? "done" : ""} ${i === stage ? "cur" : ""}`}
            >
              <span className="wb-pdot">{i < stage ? "✓" : i + 1}</span>
              <span className="wb-plabel stencil">{s}</span>
            </div>
          ),
        )}
      </div>

      <div className="wb">
        {/* LEFT — build proof */}
        <section className="wb-col">
          <div className="op">
            <div className="op-head slim">
              <h3>1 · Build the proof from an email</h3>
              <span className="op-tag stencil">OFF-CHAIN PROVER</span>
            </div>

            <div className="scenarios" role="tablist">
              {SCENARIOS.map((s) => (
                <button
                  key={s.id}
                  role="tab"
                  aria-selected={s.id === sc.id}
                  className={`scenario ${s.id === sc.id ? "active" : ""}`}
                  onClick={() => pickScenario(s)}
                >
                  <span className="scenario-av">{s.avatar}</span>
                  <span className="scenario-name">{s.label}</span>
                  <span className={`scenario-tag ${s.live ? "live" : ""}`}>
                    {s.live ? "live" : "template"}
                  </span>
                </button>
              ))}
            </div>

            <div className="eml">
              <div className="eml-head">
                <span className="eml-ic">
                  <Icon.envelope size={16} />
                </span>
                <div>
                  <b>Balance statement · {sc.label}</b>
                  <span className="mono">from: alerts@{sc.domain}</span>
                </div>
                <span className="eml-verified">DKIM ✓</span>
              </div>
              <div className="eml-body">
                <div className="eml-line">
                  <span>Available balance</span>
                  <span className="eml-bal">
                    {phase === "proved" ? (
                      <>
                        <Icon.lock size={13} /> hidden
                      </>
                    ) : (
                      "••••••••"
                    )}
                  </span>
                </div>
                <div className="eml-line">
                  <span>Prove floor</span>
                  <b className="mono">≥ {sc.threshold}</b>
                </div>
              </div>
              <div className="eml-sig mono">
                dkim-signature: a={DKIM.algo}; d={DKIM.domain}; s=
                {DKIM.selector};
              </div>
            </div>

            {phase !== "idle" && (
              <div className="pipe">
                {PROVE_STEPS.map((s, i) => {
                  const done = phase === "proved" || i < step;
                  const cur = phase === "proving" && i === step;
                  return (
                    <div
                      key={s.k}
                      className={`pstep ${done ? "done" : ""} ${cur ? "cur" : ""}`}
                    >
                      <span className="pmark">
                        {done ? (
                          <Icon.check size={12} />
                        ) : cur ? (
                          <span className="spinner tiny" />
                        ) : (
                          ""
                        )}
                      </span>
                      <div className="ptext">
                        <b>{s.k}</b>
                        <span className="mono">{s.d}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {phase === "proved" && (
              <div className="proof">
                <div className="proof-head">
                  <span className="mono">π groth16</span>
                  <span className="proof-ok">ready</span>
                </div>
                <div className="proof-hexes">
                  {[PROOF_HEX.a, PROOF_HEX.bx, PROOF_HEX.c].map((h) => (
                    <span key={h} className="proof-hex mono">
                      {h}
                    </span>
                  ))}
                </div>
                <div className="proof-null mono">
                  nullifier {PROOF_HEX.nullifier}
                </div>
                {!sc.live && (
                  <div className="proof-tpl">
                    Template preview. Only <b>Acme Bank</b> has a proof burned

                    on-chain. Pick it to verify live.
                  </div>
                )}
              </div>
            )}

            <button
              className="btn btn-ink wide"
              onClick={generate}
              disabled={phase === "proving" || phase === "proved"}
            >
              {phase === "proving" ? (
                <>
                  <span className="spinner" /> Generating proof…
                </>
              ) : phase === "proved" ? (
                "✓ Proof generated"
              ) : (
                "Generate proof from email"
              )}
            </button>
          </div>
        </section>

        {/* RIGHT — on-chain */}
        <section className="wb-col">
          {!address ? (
            <div className="op gate">
              <span className="gate-lock">
                <Icon.lock size={30} />
              </span>
              <h3>Connect a wallet to verify on-chain</h3>
              <p>
                Everything runs read-only until you explicitly sign. Testnet
                only. No real funds move, and new accounts are auto-funded.

              </p>
              <button
                className="btn btn-ink lg"
                onClick={onConnect}
                disabled={connecting}
              >
                {connecting ? "Connecting…" : "Connect Freighter"}
              </button>
              {walletErr && <p className="inline-err">{walletErr}</p>}
            </div>
          ) : (
            <>
              {/* verify */}
              <div className="op">
                <div className="op-head slim">
                  <h3>2 · Verify on-chain</h3>
                  <span className="op-tag stencil mono">verify_proof · ro</span>
                </div>
                <p className="op-body">
                  Runs Stellar's native <code>bn254.pairing_check</code> against
                  the deployed verification key. No state, no fee, repeatable.

                </p>
                <button
                  className="btn btn-ink wide"
                  onClick={onVerify}
                  disabled={verifying || phase !== "proved"}
                >
                  {verifying ? (
                    <>
                      <span className="spinner" /> Verifying on-chain…
                    </>
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
                      <b className={verify.valid ? "good" : "reject"}>
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
                      Fits under Soroban's 100M budget, so on-chain ZK is
                      practical.

                    </p>
                  </div>
                )}
              </div>

              {/* sign & land */}
              <div className="op">
                <div className="op-head slim">
                  <h3>3 · Sign &amp; broadcast</h3>
                  <span className="op-tag stencil">YOU SIGN · LANDS</span>
                </div>
                <p className="op-body">
                  Sign a real Soroban tx in Freighter. It's included in a ledger
                  under <b>your own address</b>, and the hash truly resolves on

                  Stellar Expert.
                </p>
                <button
                  className="btn btn-stamp wide"
                  onClick={onLand}
                  disabled={landing || !verify}
                >
                  {landing ? (
                    <>
                      <span className="spinner light" /> Waiting for ledger…
                    </>
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
                      Confirmed on testnet, signed by your wallet.
                    </p>
                    <div className="replay-links">
                      <a
                        className="op-link mono"
                        href={`${EXPLORER}/tx/${landed.hash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        tx {short(landed.hash, 8)}{" "}
                        <Icon.arrowUpRight size={12} />
                      </a>
                      <a
                        className="op-link mono"
                        href={`${EXPLORER}/account/${address}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        account <Icon.arrowUpRight size={12} />
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* replay */}
              <div className="op">
                <div className="op-head slim">
                  <h3>4 · Try to double-spend</h3>
                  <span className="op-tag stencil mono">prove · replay</span>
                </div>
                <p className="op-body">
                  <code>prove_reserve</code> burns a nullifier the first time.
                  Replaying the same email is rejected with <b>Error #7</b> at
                  preflight, with no ledger slot and no fee.

                </p>
                <button
                  className="btn btn-ghost wide"
                  onClick={onReplay}
                  disabled={submitting || !landed}
                >
                  {submitting ? (
                    <>
                      <span className="spinner" /> Attempting replay…
                    </>
                  ) : !landed ? (
                    "Land a proof first"
                  ) : (
                    "Run the replay"
                  )}
                </button>
                {submit && submit.replayRejected && (
                  <div className="result replay">
                    <Stamp
                      label="REJECTED"
                      sub={`ERR #${submit.errorCode ?? 7}`}
                      tone="stamp"
                      angle={-9}
                      size={92}
                    />
                    <p className="result-note">
                      Rejected{" "}
                      {submit.preflightRejected
                        ? "at preflight, nothing spent"

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
          <div key={s.id} className={`issuer ${s.live ? "live" : ""}`}>
            <div className="issuer-top">
              <span className="issuer-ico">{s.avatar}</span>
              <div>
                <b>{s.label}</b>
                <span className="mono issuer-dom">{s.domain}</span>
              </div>
              <span className={`issuer-badge ${s.live ? "on" : ""}`}>
                {s.live ? "● live" : "template"}
              </span>
            </div>
            <div className="issuer-line">
              <div className="issuer-thresh">
                <span>Reserve floor</span>
                <b>{s.threshold}</b>
              </div>
            </div>
            <div className="issuer-thresh">
              <span>Status</span>
              <b className={s.live ? "good" : "muted"}>
                {s.live ? "attested on-chain" : "not yet proven"}
              </b>
            </div>
            {s.live && att && (
              <div className="issuer-thresh spaced">
                <span>Proven on</span>
                <b className="mono">{formatDate(att.timestamp)}</b>
              </div>
            )}
            {s.live ? (
              <a
                className="btn btn-ghost sm issuer-cta"
                href={`${EXPLORER}/tx/${PROVE_TX}`}
                target="_blank"
                rel="noreferrer"
              >
                View attestation <Icon.arrowUpRight size={13} />
              </a>
            ) : (
              <button className="btn btn-ghost sm issuer-cta" disabled>
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
  const ref = useRef<number | undefined>(undefined);
  function copy() {
    navigator.clipboard?.writeText(CONTRACT_ID);
    setCopied(true);
    window.clearTimeout(ref.current);
    ref.current = window.setTimeout(() => setCopied(false), 1400);
  }
  return (
    <div className="view">
      <div className="op">
        <div className="op-head slim">
          <h3>Deployed contract</h3>
          <span className="live-chip">
            <span className="net-dot" /> testnet
          </span>
        </div>
        <button className="contract-row" onClick={copy}>
          <span className="mono">{CONTRACT_ID}</span>
          <span className="copy-ic stencil">
            {copied ? "copied ✓" : "copy"}
          </span>
        </button>
        <div className="onchain-facts">
          <Fact k="Proof system" v="Groth16" />
          <Fact k="Curve" v={CIRCUIT.curve} />
          <Fact k="Constraints" v={CIRCUIT.constraints.toLocaleString()} />
          <Fact k="Verifier" v="native pairing_check" />
        </div>
      </div>

      <div className="op">
        <div className="op-head slim">
          <h3>The verifiable transaction chain</h3>
          <span className="op-tag stencil">4 TX · ALL LIVE</span>
        </div>
        <div className="txchain">
          {[
            { k: "Deploy", h: TX_CHAIN.deploy },
            { k: "Init", h: TX_CHAIN.init },
            { k: "Register", h: TX_CHAIN.register },
            { k: "Prove", h: TX_CHAIN.prove },
          ].map((t) => (
            <a
              key={t.k}
              className="txnode"
              href={`${EXPLORER}/tx/${t.h}`}
              target="_blank"
              rel="noreferrer"
            >
              <span className="txnode-k stencil">{t.k}</span>
              <span className="txnode-h mono">{short(t.h, 6)}</span>
              <Icon.arrowUpRight size={13} />
            </a>
          ))}
        </div>
      </div>

      <div className="op">
        <div className="op-head slim">
          <h3>Public journal</h3>
          <span className="op-tag stencil">7 SIGNALS</span>
        </div>
        <div className="journal">
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
          The balance itself is <b>not</b> among these signals, only the
          threshold it clears.

        </p>
      </div>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="ofact">
      <span className="stencil">{k}</span>
      <b>{v}</b>
    </div>
  );
}
