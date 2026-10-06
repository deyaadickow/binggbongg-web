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

/**
 * Steve, 2026-10-06: "we need to add a name on the screen not TapTap gifts." The feature is a
 * Bongg Burst — its own name, no longer colliding with the Tap Tap games. The admin column stays
 * is_taptap so a rename needs no migration.
 */
export const BONGG_BURST = "Bongg Burst";

/**
 * Steve, 2026-10-06: "another gift feature called Rainfall. Instead of gifts going up this
 * feature will be gifts going down like a rainfall." Same mechanic, opposite direction, so this
 * one component serves both and the gift's own flag picks which way its icons travel. The admin
 * panel keeps the two mutually exclusive, so both flags true never reaches a client.
 */
export const RAINFALL = "Rainfall";

/**
 * Steve, 2026-10-06: "'Left Hander' and 'Right Hander' where the gifts come out from the left
 * side to the right and from the right side to the left." The NAME is which side they come FROM,
 * so a Left Hander travels rightwards.
 */
export const LEFT_HANDER = "Left Hander";
export const RIGHT_HANDER = "Right Hander";

/** Which way a burst's icons travel. The gift decides; no caller passes this in. */
export type BurstDirection = "up" | "down" | "left" | "right";

/** null for an ordinary gift, which bursts not at all. */
export function burstDirection(gift: Gift): BurstDirection | null {
  if (gift.is_taptap === true) return "up";
  if (gift.is_rainfall === true) return "down";
  if (gift.is_left_hander === true) return "right";  // enters at the LEFT, travels right
  if (gift.is_right_hander === true) return "left";  // enters at the RIGHT, travels left
  return null;
}

/** Matches the apps: a very expensive gift is capped so it can't flood the screen. */
const MAX_ICONS = 150;
const STAGGER_MS = 55;
const FLIGHT_MS = 2600;

export function isTapTapGift(gift: Gift): boolean {
  return burstDirection(gift) !== null;
}

/**
 * Steve, 2026-10-06: "add the name on each gift here when we add Bongg Burst or Rainfall on that
 * gift" — a member should be able to see which gifts do the big full-screen effect before
 * spending on one. null for an ordinary gift, which gets no nameplate at all.
 */
export function burstLabel(gift: Gift): string | null {
  switch (burstDirection(gift)) {
    case "up": return BONGG_BURST;
    case "down": return RAINFALL;
    case "right": return LEFT_HANDER;
    case "left": return RIGHT_HANDER;
    default: return null;
  }
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

  const dir = burstDirection(gift) ?? "up";
  const horizontal = dir === "left" || dir === "right";

  const icons = useMemo<Icon[]>(() => {
    const count = Math.min(Math.max(giftPrice(gift), 1), MAX_ICONS);
    // Deterministic per-icon scatter: random() inside render would re-roll every paint.
    return Array.from({ length: count }, (_, i) => ({
      key: i,
      delayMs: i * STAGGER_MS,
      // UP comes from the bottom-right, where the gift button is — the corner the apps use.
      // Everything else spreads right across its entry edge, because a stream from one corner
      // doesn't read as a sweep.
      startLeftPct: dir === "up" ? 55 + Math.random() * 35 : 2 + Math.random() * 94,
      // Only a rising gift swerves; any other direction sways a little or it reads as a bug.
      driftPx: (Math.random() - 0.5) * (dir === "up" ? 140 : 40),
      // Everything except UP travels far enough to leave the far side instead of stopping
      // part-way; UP fades out mid-air, because it has nowhere to go.
      risePct: dir === "up" ? 45 + Math.random() * 25 : 115 + Math.random() * 20,
      // Steve, 2026-10-06: "make the roses larger." Matches the apps' 56pt icon.
      size: 46 + Math.random() * 20,
      spin: (Math.random() - 0.5) * (dir === "up" ? 50 : 30),
    }));
  }, [gift, dir]);

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
        /* Rainfall: starts above the top edge and travels DOWN past the bottom. It stays solid
           almost the whole way (unlike the rise, which fades out mid-air having nowhere to go)
           because it leaves the screen under its own steam. */
        @keyframes bb-taptap-fall {
          0%   { opacity: 0; transform: translate(0, 0) scale(.7) rotate(0deg); }
          8%   { opacity: 1; transform: translate(0, 4vh) scale(1) rotate(0deg); }
          88%  { opacity: 1; }
          100% { opacity: 0; transform: translate(var(--bb-drift), var(--bb-rise)) scale(1) rotate(var(--bb-spin)); }
        }
        /* Left Hander: enters off the LEFT edge and sweeps right. Right Hander is its mirror.
           Same "stays solid until it leaves" shape as the fall — it exits under its own steam. */
        @keyframes bb-taptap-sweep-right {
          0%   { opacity: 0; transform: translate(0, 0) scale(.7) rotate(0deg); }
          8%   { opacity: 1; transform: translate(4vw, 0) scale(1) rotate(0deg); }
          88%  { opacity: 1; }
          100% { opacity: 0; transform: translate(var(--bb-rise), var(--bb-drift)) scale(1) rotate(var(--bb-spin)); }
        }
        @keyframes bb-taptap-sweep-left {
          0%   { opacity: 0; transform: translate(0, 0) scale(.7) rotate(0deg); }
          8%   { opacity: 1; transform: translate(-4vw, 0) scale(1) rotate(0deg); }
          88%  { opacity: 1; }
          100% { opacity: 0; transform: translate(calc(var(--bb-rise) * -1), var(--bb-drift)) scale(1) rotate(var(--bb-spin)); }
        }
        @keyframes bb-taptap-name {
          0%   { opacity: 0; transform: scale(.85); }
          8%   { opacity: 1; transform: scale(1); }
          80%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .bb-taptap-icon { animation-duration: 1ms !important; opacity: .9; }
        }
      `}</style>
      {mounted && (
        <div
          style={{
            position: "absolute", top: "20%", left: 0, right: 0, textAlign: "center",
            animation: "bb-taptap-name 2800ms ease-out both",
          }}
        >
          <span style={{
            display: "inline-block", padding: "9px 18px", borderRadius: 999,
            background: "rgba(0,0,0,.75)", border: "1.5px solid var(--gold)",
            color: "var(--gold)", fontWeight: 800, fontSize: 20,
          }}>{burstLabel(gift) ?? BONGG_BURST}</span>
        </div>
      )}
      {mounted && icons.map((icon) => (
        <div
          key={icon.key}
          className="bb-taptap-icon"
          style={{
            position: "absolute",
            // Each direction hangs just off its own entry edge, so no icon is ever seen
            // appearing out of nothing. The cross-axis percentage spreads them along that edge.
            ...(horizontal
              ? { top: `${icon.startLeftPct}%`, ...(dir === "right"
                  ? { left: `-${icon.size}px` }
                  : { right: `-${icon.size}px` }) }
              : { left: `${icon.startLeftPct}%`, ...(dir === "down"
                  ? { top: `-${icon.size}px` }
                  : { bottom: "12%" }) }),
            width: icon.size,
            height: icon.size,
            ["--bb-drift" as string]: `${icon.driftPx}px`,
            ["--bb-rise" as string]: `${icon.risePct}${horizontal ? "vw" : "vh"}`,
            ["--bb-spin" as string]: `${icon.spin}deg`,
            // Rising floats and slows (ease-out) because it fights gravity; falling ACCELERATES
            // like real rain (ease-in). A sideways sweep does neither — steady, so linear.
            animation:
              dir === "up"
                ? `bb-taptap-rise ${FLIGHT_MS}ms ease-out ${icon.delayMs}ms both`
                : dir === "down"
                ? `bb-taptap-fall ${FLIGHT_MS}ms ease-in ${icon.delayMs}ms both`
                : dir === "right"
                ? `bb-taptap-sweep-right ${FLIGHT_MS}ms linear ${icon.delayMs}ms both`
                : `bb-taptap-sweep-left ${FLIGHT_MS}ms linear ${icon.delayMs}ms both`,
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
