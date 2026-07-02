/* ==================================================================
   Solvent — shared UI primitives for "The Attestation Ledger"
   Custom hairline SVG icons, ink-stamp, split-flap numerals,
   redaction band. All dependency-free, reduced-motion aware.
   ================================================================== */

import { useEffect, useRef, useState, type ReactNode } from "react";

/* ------------------------------------------------------------------ */
/*  ICONS — single 1.4px hairline stroke, currentColor                */
/* ------------------------------------------------------------------ */

type IconProps = { size?: number; className?: string };

function Svg({
  size = 20,
  className,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const Icon = {
  ledger: (p: IconProps) => (
    <Svg {...p}>
      <path d="M5 3h11l3 3v15H5z" />
      <path d="M16 3v3h3" />
      <path d="M8 10h8M8 14h8M8 18h5" />
    </Svg>
  ),
  seal: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="10" r="6" />
      <path d="M9 15l-1.5 6L12 19l4.5 2L15 15" />
      <path d="M9.5 10l1.7 1.7L15 8" />
    </Svg>
  ),
  envelope: (p: IconProps) => (
    <Svg {...p}>
      <rect x="3" y="5" width="18" height="14" rx="1" />
      <path d="M3.5 6.5l8.5 6 8.5-6" />
    </Svg>
  ),
  chain: (p: IconProps) => (
    <Svg {...p}>
      <rect x="3" y="9" width="9" height="6" rx="3" />
      <rect x="12" y="9" width="9" height="6" rx="3" />
    </Svg>
  ),
  quill: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 20c6-1 9-4 12-9 1.5-2.5 2-5 2-8-3 0-5.5.5-8 2-5 3-8 6-9 12z" />
      <path d="M4 20l5-5" />
    </Svg>
  ),
  scale: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 3v18" />
      <path d="M6 21h12" />
      <path d="M5 7h14" />
      <path d="M5 7l-2.5 6a3 3 0 0 0 5 0z" />
      <path d="M19 7l-2.5 6a3 3 0 0 0 5 0z" />
    </Svg>
  ),
  circuit: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="6" cy="6" r="1.6" />
      <circle cx="18" cy="18" r="1.6" />
      <circle cx="18" cy="6" r="1.6" />
      <path d="M7.6 6H18M6 7.6V16a2 2 0 0 0 2 2h8.4M18 7.6v8.8" />
    </Svg>
  ),
  lock: (p: IconProps) => (
    <Svg {...p}>
      <rect x="5" y="10" width="14" height="10" rx="1.5" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <path d="M12 14v2" />
    </Svg>
  ),
  bolt: (p: IconProps) => (
    <Svg {...p}>
      <path d="M13 3L5 13h5l-1 8 8-11h-5z" />
    </Svg>
  ),
  bank: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 9l9-5 9 5" />
      <path d="M4 9h16" />
      <path d="M6 9v8M10 9v8M14 9v8M18 9v8" />
      <path d="M3 20h18" />
    </Svg>
  ),
  hash: (p: IconProps) => (
    <Svg {...p}>
      <path d="M9 3L7 21M17 3l-2 18M4 8h16M3 16h16" />
    </Svg>
  ),
  arrowUpRight: (p: IconProps) => (
    <Svg {...p}>
      <path d="M7 17L17 7M8 7h9v9" />
    </Svg>
  ),
  check: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 12l5 5L20 6" />
    </Svg>
  ),
  copy: (p: IconProps) => (
    <Svg {...p}>
      <rect x="9" y="9" width="11" height="11" rx="1.5" />
      <path d="M5 15V5a1 1 0 0 1 1-1h9" />
    </Svg>
  ),
  power: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 3v8" />
      <path d="M6.5 7a8 8 0 1 0 11 0" />
    </Svg>
  ),
};

export type IconName = keyof typeof Icon;

/* ------------------------------------------------------------------ */
/*  INK STAMP — a stamp that thuds onto the page when `on` flips true  */
/* ------------------------------------------------------------------ */

export function Stamp({
  label,
  sub,
  tone = "seal",
  on = true,
  angle = -8,
  size = 116,
}: {
  label: string;
  sub?: string;
  tone?: "seal" | "stamp";
  on?: boolean;
  angle?: number;
  size?: number;
}) {
  const color = tone === "seal" ? "var(--seal)" : "var(--stamp)";
  return (
    <div
      className={`stamp ${on ? "on" : ""}`}
      style={{
        // @ts-expect-error custom props
        "--stamp-color": color,
        "--stamp-angle": `${angle}deg`,
        width: size,
        height: size,
      }}
    >
      <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden>
        <circle cx="60" cy="60" r="55" className="stamp-ring" />
        <circle cx="60" cy="60" r="47" className="stamp-ring thin" />
      </svg>
      <div className="stamp-text">
        <b>{label}</b>
        {sub && <span className="mono">{sub}</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SPLIT-FLAP — airport-board numerals that roll into place          */
/* ------------------------------------------------------------------ */

function Flap({ char }: { char: string }) {
  const [display, setDisplay] = useState(char);
  const [flipping, setFlipping] = useState(false);
  const prev = useRef(char);

  useEffect(() => {
    if (prev.current === char) return;
    prev.current = char;
    setFlipping(true);
    const t = setTimeout(() => {
      setDisplay(char);
      setFlipping(false);
    }, 180);
    return () => clearTimeout(t);
  }, [char]);

  const isDigit = /[0-9]/.test(display);
  return (
    <span className={`flap ${isDigit ? "digit" : "sep"} ${flipping ? "flip" : ""}`}>
      <span className="flap-char">{display}</span>
    </span>
  );
}

export function SplitFlap({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const chars = value.split("");
  return (
    <span className={`splitflap ${className ?? ""}`}>
      {chars.map((c, i) => (
        <Flap key={`${i}-${c}`} char={c} />
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  REDACTION BAND — the balance is a black bar that never opens       */
/* ------------------------------------------------------------------ */

export function Redacted({ chars = 9 }: { chars?: number }) {
  return (
    <span className="redacted" title="Balance is never disclosed">
      <span className="redacted-fill">{"█".repeat(chars)}</span>
      <span className="redacted-label mono">REDACTED</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  REVEAL — fade/slide a block in when it scrolls into view           */
/* ------------------------------------------------------------------ */

export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${seen ? "in" : ""} ${className ?? ""}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
