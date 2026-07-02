import { Icon, Stamp, SplitFlap, Redacted, Reveal } from "./ui";
import {
  SCENARIOS,
  CIRCUIT,
  DKIM,
  PROOF_HEX,
  TX_CHAIN,
  EXPLORER,
} from "./solvent";

/* ==================================================================
   Landing — "The Attestation Ledger"
   A stamped legal document that proves a bank is solvent without
   ever revealing the balance. Ink on paper, seals, split-flap.
   ================================================================== */

export function Landing({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="page">
      {/* ---------- top bar ---------- */}
      <header className="topbar">
        <div className="brand">
          <span className="brand-seal">
            <Icon.seal size={22} />
          </span>
          <span className="brand-word">Solvent</span>
          <span className="brand-reg">®</span>
        </div>
        <nav className="topnav stencil">
          <a href="#how">Mechanism</a>
          <a href="#registry">Registry</a>
          <a href="#chain">On-Chain</a>
        </nav>
        <button className="btn btn-ink" onClick={onEnter}>
          Open Console
          <Icon.arrowUpRight size={16} />
        </button>
      </header>

      {/* ---------- hero: the certificate ---------- */}
      <section className="hero">
        <div className="hero-grid">
          <div className="hero-left">
            <div className="doc-tag stencil">
              FORM ZK-7 · PROOF OF RESERVES · STELLAR TESTNET
            </div>
            <h1 className="hero-title">
              Prove you hold the money.
              <span className="hero-em"> Reveal nothing else.</span>
            </h1>
            <p className="hero-lede">
              Solvent turns a bank's own <b>DKIM-signed statement email</b> into
              a zero-knowledge proof that its reserves clear a threshold, then

              stamps that proof onto Stellar. The balance is never disclosed.
              No oracle. No trust. Just a seal that either holds or it doesn't.
            </p>

            <div className="hero-cta">
              <button className="btn btn-stamp" onClick={onEnter}>
                <Icon.quill size={17} />
                Verify a proof live
              </button>
              <a
                className="btn btn-ghost"
                href={`${EXPLORER}/tx/${TX_CHAIN.prove}`}
                target="_blank"
                rel="noreferrer"
              >
                Inspect the on-chain tx
                <Icon.arrowUpRight size={15} />
              </a>
            </div>

            <dl className="hero-facts">
              <div>
                <dt className="stencil">Constraints</dt>
                <dd className="mono">{CIRCUIT.constraints.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="stencil">Proving system</dt>
                <dd className="mono">
                  {CIRCUIT.system} · {CIRCUIT.curve}
                </dd>
              </div>
              <div>
                <dt className="stencil">Balance shown</dt>
                <dd className="mono">0 bytes</dd>
              </div>
            </dl>
          </div>

          {/* the certificate card */}
          <Reveal className="hero-right">
            <div className="cert">
              <div className="cert-perf" aria-hidden />
              <div className="cert-head">
                <span className="stencil">CERTIFICATE OF SOLVENCY</span>
                <span className="stencil">No. 0x32117d2f</span>
              </div>

              <div className="cert-issuer">
                <span className="cert-issuer-ico">
                  <Icon.bank size={20} />
                </span>
                <div>
                  <b>Acme Bank</b>
                  <span className="mono cert-domain">
                    signed by @{DKIM.domain}
                  </span>
                </div>
              </div>

              <div className="cert-row">
                <span className="stencil">Attested reserves</span>
                <span className="cert-thresh">
                  ≥ <SplitFlap value="1,000,000" /> USD
                </span>
              </div>

              <div className="cert-row">
                <span className="stencil">Actual balance</span>
                <Redacted chars={11} />
              </div>

              <div className="cert-hashes">
                <Hex label="proof.a" value={PROOF_HEX.a} />
                <Hex label="proof.c" value={PROOF_HEX.c} />
                <Hex label="nullifier" value={PROOF_HEX.nullifier} />
              </div>

              <div className="cert-foot">
                <div className="cert-sign">
                  <span className="cert-sign-line" />
                  <span className="stencil">Verified by pairing check</span>
                </div>
                <Stamp
                  label="VERIFIED"
                  sub="ON-CHAIN"
                  tone="seal"
                  angle={-11}
                  size={104}
                />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- mechanism ---------- */}
      <section id="how" className="band">
        <SectionHead
          kicker="THE MECHANISM"
          title="Four moves, one seal"
          note="Every step below runs on real data, the same proof that is live on testnet."

        />
        <div className="steps">
          {STEPS.map((s, i) => (
            <Reveal key={s.t} delay={i * 80}>
              <article className="step">
                <span className="step-no mono">0{i + 1}</span>
                <span className="step-ico">{s.icon}</span>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- registry of issuers ---------- */}
      <section id="registry" className="band alt">
        <SectionHead
          kicker="THE REGISTRY"
          title="Registered issuers"
          note="Only a domain whose DKIM key is registered on-chain can post a proof under its name."
        />
        <div className="registry">
          {SCENARIOS.map((s, i) => (
            <Reveal key={s.id} delay={i * 70}>
              <article className={`issuer ${s.live ? "live" : ""}`}>
                <header className="issuer-top">
                  <span className="issuer-ico">
                    <Icon.bank size={18} />
                  </span>
                  <b>{s.label}</b>
                  <span
                    className={`issuer-badge stencil ${s.live ? "on" : ""}`}
                  >
                    {s.live ? "● LIVE" : "TEMPLATE"}
                  </span>
                </header>
                <div className="issuer-line mono">@{s.domain}</div>
                <div className="issuer-thresh">
                  <span className="stencil">threshold</span>
                  <b>{s.threshold}</b>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- on-chain chain of custody ---------- */}
      <section id="chain" className="band">
        <SectionHead
          kicker="CHAIN OF CUSTODY"
          title="Every step is a real transaction"
          note="Deploy → initialise → register issuer → prove reserve. All four live on Stellar testnet, click to inspect."

        />
        <div className="custody">
          {CUSTODY.map((c, i) => (
            <Reveal key={c.k} delay={i * 70}>
              <a
                className="custody-item"
                href={`${EXPLORER}/tx/${c.hash}`}
                target="_blank"
                rel="noreferrer"
              >
                <span className="custody-no mono">{i + 1}</span>
                <div className="custody-body">
                  <b>{c.t}</b>
                  <span className="mono custody-hash">
                    {c.hash.slice(0, 10)}…{c.hash.slice(-8)}
                  </span>
                </div>
                <Icon.arrowUpRight size={16} />
              </a>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- closing call ---------- */}
      <section className="closing">
        <Stamp label="SOLVENT" sub="ZK · STELLAR" tone="stamp" angle={-6} size={130} />
        <h2>Don't take their word for it.</h2>
        <p>
          Connect a wallet and make the network verify the proof for you: a

          real BN254 pairing check, signed by your own address.
        </p>
        <button className="btn btn-stamp lg" onClick={onEnter}>
          <Icon.quill size={18} />
          Open the console
        </button>
      </section>

      <footer className="foot stencil">
        <span>SOLVENT · PROOF OF RESERVES</span>
        <span>BUILT ON STELLAR · SOROBAN · GROTH16</span>
      </footer>
    </div>
  );
}

/* ---------- small helpers ---------- */

function Hex({ label, value }: { label: string; value: string }) {
  return (
    <div className="hex">
      <span className="stencil">{label}</span>
      <span className="mono">{value}</span>
    </div>
  );
}

function SectionHead({
  kicker,
  title,
  note,
}: {
  kicker: string;
  title: string;
  note: string;
}) {
  return (
    <Reveal className="sec-head">
      <span className="stencil sec-kicker">{kicker}</span>
      <h2>{title}</h2>
      <p>{note}</p>
    </Reveal>
  );
}

const STEPS = [
  {
    t: "Bank emails a statement",
    d: "A routine reserve statement, DKIM-signed by the bank's own mail server. Nothing custom, just real infrastructure banks already run.",

    icon: <Icon.envelope size={26} />,
  },
  {
    t: "Circuit reads the signature",
    d: "A Circom circuit parses the DKIM RSA signature and the balance line, proving the email is authentic and clears the threshold.",
    icon: <Icon.circuit size={26} />,
  },
  {
    t: "Proof hides the number",
    d: "The Groth16 proof attests 'balance ≥ threshold' and nothing more. The actual figure never leaves the prover.",
    icon: <Icon.lock size={26} />,
  },
  {
    t: "Stellar stamps the seal",
    d: "A Soroban contract runs the pairing check on-chain and burns a nullifier, verifiable by anyone, replayable by no one.",

    icon: <Icon.seal size={26} />,
  },
];

const CUSTODY = [
  { k: "deploy", t: "Contract deployed", hash: TX_CHAIN.deploy },
  { k: "init", t: "Verifier initialised", hash: TX_CHAIN.init },
  { k: "register", t: "Issuer registered", hash: TX_CHAIN.register },
  { k: "prove", t: "Reserve proven", hash: TX_CHAIN.prove },
];
