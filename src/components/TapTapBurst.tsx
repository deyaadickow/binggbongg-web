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

/**
 * Steve, 2026-10-06: "Appear all over the screen between 5 and 10 gifts at a time for 5 seconds
 * and disappear. Call it 'Surprise'." The one effect that does not travel, and the one whose
 * count is fixed by the effect rather than by the gift's coin price.
 */
export const SURPRISE = "Surprise";

/**
 * Steve, 2026-10-06: "'Universal' 25% of the gifts will come out of each side, Top, Bottom, Left
 * and right." Not a direction of its own — each gift picks one of the four at random.
 */
export const UNIVERSAL = "Universal";
const UNIVERSAL_SIDES: BurstDirection[] = ["up", "down", "left", "right"];
/**
 * Icon size, ONE constant for both spawn paths. Steve, 2026-10-06: "Please make them all the same
 * size." Surprise built its icons in a separate branch and kept its own literal, so when the
 * travel effects were raised the web's Surprise stayed small — caught by grepping the deployed
 * bundle and finding BOTH sizes in it. Same bug shape as the two name mappings that drifted.
 */
const ICON_SIZE_MIN = 70;
const ICON_SIZE_RANGE = 26;

const SURPRISE_MS = 5000;
/* Steve, 2026-10-06: "they pop out and they move too fast, when they move slow them down." Each
   gift now takes ~1.7s to appear, sit and go (was ~0.9s), and the batches are spaced to match so
   there are still only 5-10 on screen at once rather than two batches overlapping. */
const SURPRISE_BATCH_MS = 1500;
const SURPRISE_LIFE_MS = 1700;

/** Which way a burst's icons travel. The gift decides; no caller passes this in. */
export type BurstDirection = "up" | "down" | "left" | "right" | "surprise" | "universal";

/** null for an ordinary gift, which bursts not at all. */
export function burstDirection(gift: Gift): BurstDirection | null {
  if (gift.is_taptap === true) return "up";
  if (gift.is_rainfall === true) return "down";
  if (gift.is_left_hander === true) return "right";  // enters at the LEFT, travels right
  if (gift.is_right_hander === true) return "left";  // enters at the RIGHT, travels left
  if (gift.is_surprise === true) return "surprise";
  if (gift.is_universal === true) return "universal";
  return null;
}

/**
 * Matches the apps. Steve, 2026-10-06: raised from 150 to 500 once he started pricing gifts at
 * 195-250 and the old cap was quietly sending fewer gifts than the price promised. Still a
 * ceiling, so a future 5,000-coin gift cannot lock up a browser.
 */
const MAX_ICONS = 500;
const FLIGHT_MS = 2600;

/**
 * Spacing between icons. A flat 55ms was fine at 150 (8s) and would be 27 SECONDS at 500, so it
 * tightens as the count grows to keep any burst inside roughly the same window. A gift of 145
 * coins or fewer is spaced exactly as it was before.
 */
function staggerMs(count: number): number {
  return Math.min(55, 8000 / Math.max(count, 1));
}

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
    case "surprise": return SURPRISE;
    case "universal": return UNIVERSAL;
    default: return null;
  }
}

/** How long a burst of this gift runs, so the caller knows when to stop showing it. */
export function tapTapBurstDuration(gift: Gift): number {
  // Surprise runs for a fixed 5 seconds whatever the gift costs.
  if (burstDirection(gift) === "surprise") return SURPRISE_MS + SURPRISE_LIFE_MS;
  const count = Math.min(Math.max(giftPrice(gift), 1), MAX_ICONS);
  return (count - 1) * staggerMs(count) + FLIGHT_MS + 200;
}

interface Icon {
  key: number;
  delayMs: number;
  startLeftPct: number;
  driftPx: number;
  risePct: number;
  size: number;
  spin: number;
  /** Surprise only: it is the one effect placed in BOTH axes. */
  topPct?: number;
  /** This icon's OWN direction. Same as the gift's for every effect except Universal, where each
   *  icon picks one of the four sides so a quarter arrive from each. */
  dir: BurstDirection;
}

export function TapTapBurst({ gift }: { gift: Gift }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const dir = burstDirection(gift) ?? "up";

  const icons = useMemo<Icon[]>(() => {
    // Surprise doesn't stream — batches of 5-10 at random places, each batch replacing the last,
    // until 5 seconds are up. The gift's coin price has no say in how many.
    if (dir === "surprise") {
      const out: Icon[] = [];
      let key = 0;
      for (let at = 0; at < SURPRISE_MS; at += SURPRISE_BATCH_MS) {
        const batch = 5 + Math.floor(Math.random() * 6);   // 5..10
        for (let n = 0; n < batch; n++) {
          out.push({
            key: key++,
            // A little jitter inside the batch so they don't all land on the same frame.
            dir: "surprise",
            delayMs: at + Math.random() * 180,
            // Kept clear of the very edges so a gift is never half off the screen.
            startLeftPct: 10 + Math.random() * 80,
            topPct: 12 + Math.random() * 76,
            driftPx: 0,
            risePct: 0,
            size: ICON_SIZE_MIN + Math.random() * ICON_SIZE_RANGE,
            spin: (Math.random() - 0.5) * 24,
          });
        }
      }
      return out;
    }

    const count = Math.min(Math.max(giftPrice(gift), 1), MAX_ICONS);
    const stagger = staggerMs(count);
    // Deterministic per-icon scatter: random() inside render would re-roll every paint.
    return Array.from({ length: count }, (_, i) => {
      // Universal isn't a direction — each gift picks one of the four at random, so roughly a
      // quarter arrive from each side.
      const d: BurstDirection = dir === "universal"
        ? UNIVERSAL_SIDES[Math.floor(Math.random() * UNIVERSAL_SIDES.length)]
        : dir;
      return {
      key: i,
      dir: d,
      delayMs: i * stagger,
      // Steve, 2026-10-06: "make them appear from the entire screen and not just on one side."
      // Bongg Burst used to rise only from the bottom-right, where the gift button is — that was
      // the one side. Every direction now spreads right across its whole entry edge.
      startLeftPct: 2 + Math.random() * 94,
      // Only a rising gift swerves; any other direction sways a little or it reads as a bug.
      driftPx: (Math.random() - 0.5) * (d === "up" ? 140 : 40),
      // Everything except UP travels far enough to leave the far side instead of stopping
      // part-way; UP fades out mid-air, because it has nowhere to go.
      risePct: d === "up" ? 45 + Math.random() * 25 : 115 + Math.random() * 20,
      // Steve, 2026-10-06: the apps' 56pt, then raised for Universal, then "Please make them all
      // the same size" — so every effect flies at the bigger size now. (Universal never actually
      // rendered smaller; his Balloons2 artwork is just tall and narrow.)
      size: ICON_SIZE_MIN + Math.random() * ICON_SIZE_RANGE,
      spin: (Math.random() - 0.5) * (d === "up" ? 50 : 30),
      };
    });
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
        /* Surprise: pops where it is put, holds, and goes. Travels nowhere. */
        @keyframes bb-taptap-pop {
          0%   { opacity: 0; transform: scale(.2) rotate(0deg); }
          18%  { opacity: 1; transform: scale(1.12) rotate(var(--bb-spin)); }
          30%  { transform: scale(1) rotate(var(--bb-spin)); }
          62%  { opacity: 1; }
          100% { opacity: 0; transform: scale(1) rotate(var(--bb-spin)); }
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
            ...(icon.dir === "surprise"
              ? { left: `${icon.startLeftPct}%`, top: `${icon.topPct}%` }
              : icon.dir === "left" || icon.dir === "right"
              ? { top: `${icon.startLeftPct}%`, ...(icon.dir === "right"
                  ? { left: `-${icon.size}px` }
                  : { right: `-${icon.size}px` }) }
              : { left: `${icon.startLeftPct}%`, ...(icon.dir === "down"
                  ? { top: `-${icon.size}px` }
                  : { bottom: "12%" }) }),
            width: icon.size,
            height: icon.size,
            ["--bb-drift" as string]: `${icon.driftPx}px`,
            ["--bb-rise" as string]:
              `${icon.risePct}${icon.dir === "left" || icon.dir === "right" ? "vw" : "vh"}`,
            ["--bb-spin" as string]: `${icon.spin}deg`,
            // Rising floats and slows (ease-out) because it fights gravity; falling ACCELERATES
            // like real rain (ease-in). A sideways sweep does neither — steady, so linear.
            animation:
              icon.dir === "surprise"
                ? `bb-taptap-pop ${SURPRISE_LIFE_MS}ms ease-out ${icon.delayMs}ms both`
                : icon.dir === "up"
                ? `bb-taptap-rise ${FLIGHT_MS}ms ease-out ${icon.delayMs}ms both`
                : icon.dir === "down"
                ? `bb-taptap-fall ${FLIGHT_MS}ms ease-in ${icon.delayMs}ms both`
                : icon.dir === "right"
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
