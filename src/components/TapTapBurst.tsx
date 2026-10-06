import { useEffect, useMemo, useState } from "react";
import { giftPrice, mediaUrl, type Gift } from "../lib/api";

/**
 * Eddie, 2026-09-19: "the gift will appear 100 times one after another… Everyone will see these
 * gifts." Steve, 2026-10-06: "please extend it to everywhere the gift is given."
 *
 * A TapTap gift bursts one copy of its own icon per coin it costs — a 100-coin gift really does
 * send 100 up the screen — rising, drifting and fading, instead of the single card a normal gift
 * shows. The apps have had this inside live rooms since September; the web had none at all.
 */

/** Matches the apps: a very expensive TapTap gift is capped so it can't flood the screen. */
const MAX_ICONS = 150;
const STAGGER_MS = 55;
const FLIGHT_MS = 2600;

export function isTapTapGift(gift: Gift): boolean {
  return gift.is_taptap === true;
}

/** How long a burst of this gift runs, so the caller knows when to stop showing it. */
export function tapTapBurstDuration(gift: Gift): number {
  const count = Math.min(Math.max(giftPrice(gift), 1), MAX_ICONS);
  return (count - 1) * STAGGER_MS + FLIGHT_MS + 200;
}

interface Icon {
  key: number;
  delayMs: number;
  startLeftPct: number;
  driftPx: number;
  risePct: number;
  size: number;
  spin: number;
}

export function TapTapBurst({ gift }: { gift: Gift }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const icons = useMemo<Icon[]>(() => {
    const count = Math.min(Math.max(giftPrice(gift), 1), MAX_ICONS);
    // Deterministic per-icon scatter: random() inside render would re-roll every paint.
    return Array.from({ length: count }, (_, i) => ({
      key: i,
      delayMs: i * STAGGER_MS,
      // Rises from the bottom-right, where the gift button is — the same corner the apps use.
      startLeftPct: 55 + Math.random() * 35,
      driftPx: (Math.random() - 0.5) * 140,
      risePct: 45 + Math.random() * 25,
      size: 26 + Math.random() * 14,
      spin: (Math.random() - 0.5) * 50,
    }));
  }, [gift]);

  const src = gift.image ? mediaUrl(gift.image) : undefined;

  return (
    <div
      aria-hidden="true"
      style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 8000, overflow: "hidden" }}
    >
      <style>{`
        @keyframes bb-taptap-rise {
          0%   { opacity: 0; transform: translate(0, 0) scale(.6) rotate(0deg); }
          12%  { opacity: 1; transform: translate(0, -8vh) scale(1) rotate(0deg); }
          100% { opacity: 0; transform: translate(var(--bb-drift), calc(var(--bb-rise) * -1)) scale(1) rotate(var(--bb-spin)); }
        }
        @media (prefers-reduced-motion: reduce) {
          .bb-taptap-icon { animation-duration: 1ms !important; opacity: .9; }
        }
      `}</style>
      {mounted && icons.map((icon) => (
        <div
          key={icon.key}
          className="bb-taptap-icon"
          style={{
            position: "absolute",
            left: `${icon.startLeftPct}%`,
            bottom: "12%",
            width: icon.size,
            height: icon.size,
            ["--bb-drift" as string]: `${icon.driftPx}px`,
            ["--bb-rise" as string]: `${icon.risePct}vh`,
            ["--bb-spin" as string]: `${icon.spin}deg`,
            animation: `bb-taptap-rise ${FLIGHT_MS}ms ease-out ${icon.delayMs}ms both`,
          }}
        >
          {src
            ? <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            : <span style={{ fontSize: icon.size }}>🎁</span>}
        </div>
      ))}
    </div>
  );
}
