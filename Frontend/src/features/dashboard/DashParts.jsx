import React, { useEffect, useId, useState } from "react";

/* ───────────── OrbitRing ─────────────
   A progress ring with a small "planet" riding the end of the arc.
   value / max decide how far round it goes; children sit in the middle. */
export const OrbitRing = ({ value = 0, max = 10, size = 160, ticks = 0, children }) => {
  const gid = `orb${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const r = 74;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const ang = pct * 2 * Math.PI - Math.PI / 2;
  const px = 90 + r * Math.cos(ang);
  const py = 90 + r * Math.sin(ang);

  return (
    <div className="orbit" style={{ width: size, height: size }}>
      <svg viewBox="0 0 180 180" aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--accent)" }} />
            <stop offset="100%" style={{ stopColor: "var(--accent)" }} />
          </linearGradient>
        </defs>
        <circle className="orbit-guide" cx="90" cy="90" r="58" />
        <circle className="orbit-track" cx="90" cy="90" r={r} />
        {Array.from({ length: ticks }).map((_, i) => {
          const a = (i / ticks) * 2 * Math.PI - Math.PI / 2;
          return (
            <line
              key={i}
              className="orbit-tick"
              x1={90 + (r - 11) * Math.cos(a)} y1={90 + (r - 11) * Math.sin(a)}
              x2={90 + (r - 6) * Math.cos(a)} y2={90 + (r - 6) * Math.sin(a)}
            />
          );
        })}
        <circle
          className="orbit-prog"
          cx="90" cy="90" r={r}
          stroke={`url(#${gid})`}
          strokeDasharray={`${c * pct} ${c}`}
          transform="rotate(-90 90 90)"
        />
        {pct > 0 && (
          <>
            <circle className="orbit-halo" cx={px} cy={py} r="11" />
            <circle className="orbit-planet" cx={px} cy={py} r="6" />
          </>
        )}
      </svg>
      <div className="orbit-center">{children}</div>
    </div>
  );
};

/* ───────────── Pips ─────────────
   10 little segments, filled up to `level` (the app's levels run 1 to 10). */
export const Pips = ({ level = 0, total = 10 }) => (
  <span className="pips" role="img" aria-label={`Level ${level} of ${total}`}>
    {Array.from({ length: total }).map((_, i) => (
      <i key={i} className={i < Math.round(level) ? "on" : ""} />
    ))}
  </span>
);

/* ───────────── CountUp ─────────────
   Numbers glide up to their value on first show. Respects reduced-motion. */
export const CountUp = ({ value = 0, suffix = "" }) => {
  const [n, setN] = useState(0);
  useEffect(() => {
    const target = Number(value) || 0;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || target === 0) {
      setN(target);
      return undefined;
    }
    let raf;
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / 900);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{n}{suffix}</>;
};

/* ───────────── ScoreRing (small, for quiz history cards) ───────────── */
export const ScoreRing = ({ pct = 0, tier = "mid" }) => {
  const r = 20;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  return (
    <span className={`score-ring score-ring--${tier}`}>
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle className="sr-track" cx="24" cy="24" r={r} />
        <circle className="sr-prog" cx="24" cy="24" r={r} strokeDasharray={`${(c * p) / 100} ${c}`} transform="rotate(-90 24 24)" />
      </svg>
      <b>{Math.round(p)}</b>
    </span>
  );
};