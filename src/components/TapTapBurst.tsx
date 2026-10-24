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

/**
 * Steve, 2026-10-19: "add another one called 'Spot' — these gifts will appear all over the
 * screen in one spot each for 3 to 5 seconds and disappear... if 100 coin gift every 15 to 20
 * will appear at the same time, if 250 coin gift, 30 to 40."
 *
 * Like Surprise it travels nowhere; unlike Surprise the gift's price DOES decide how many.
 * His two numbers give the rule exactly: 5 + coins/10 is the low end (100 -> 15, 250 -> 30)
 * and a third more is the high end (-> 20 and 40).
 */
export const SPOT = "Spot";
const SPOT_FADE_IN_MS = 400;
const SPOT_FADE_OUT_MS = 500;
const SPOT_HOLD_MIN_MS = 3000;
const SPOT_HOLD_MAX_MS = 5000;
/** Landed over this window rather than on one frame, so it reads as appearing, not blinking. */
const SPOT_SPAWN_WINDOW_MS = 700;

/** The longest a Spot shower may run before the last gift is spawned — see spotIntervalMs.
 *  Steve, 2026-10-21: "Yes make it faster, twice as many on screen" — halved from 20s. */
const SPOT_MAX_RUN_MS = 10000;
/** Twice as many standing at once as his original "15 to 20 for a 100 coin gift", which halves
 *  how long the shower takes to get through one gift per coin. */
const SPOT_CROWD = 2;

/**
 * How many Spot gifts stand on the screen AT ONCE.
 *
 * Steve, 2026-10-21: "I sent 100 coin gift of roses and only a few roses showed up. We need for
 * the roses to keep appearing 5, 7, 10 or whatever as many at a time and before these disappear
 * more will show up until all 100 of them show." So his original numbers were never the TOTAL —
 * the total is one gift per coin, the same as every other effect, and this is how many are up
 * together while they take their turns.
 */
function spotOnScreen(price: number): number {
  const low = spotOnScreenMin(price);
  const high = low + Math.max(5, Math.floor(low / 3));
  return Math.max(low + Math.floor(Math.random() * (high - low + 1)), 1);
}

/** The LOW end of that range. Fewer on screen means a LONGER run, so anything that has to
 *  out-last a run it did not schedule (tapTapBurstDuration) uses the worst case. */
function spotOnScreenMin(price: number): number {
  return Math.max((5 + Math.floor(price / 10)) * SPOT_CROWD, 1);
}

/** How long to leave between spawns so `onScreen` are standing at any moment and the run still
 *  finishes. Past the cap the gifts simply arrive faster and more stand together — also what
 *  Steve asked for ("the bigger the gift the more will appear"). */
function spotIntervalMs(total: number, onScreen: number): number {
  const averageHold = (SPOT_HOLD_MIN_MS + SPOT_HOLD_MAX_MS) / 2;
  const keepingUp = averageHold / Math.max(onScreen, 1);
  const withinCap = SPOT_MAX_RUN_MS / Math.max(total, 1);
  return Math.max(Math.min(keepingUp, withinCap), 25);
}

/** When the last Spot gift of a run is spawned, from the start of the burst. */
function spotLastLandsAt(total: number, onScreen: number): number {
  if (total <= onScreen) return SPOT_SPAWN_WINDOW_MS;
  return SPOT_SPAWN_WINDOW_MS + (total - onScreen) * spotIntervalMs(total, onScreen);
}
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
export type BurstDirection = "up" | "down" | "left" | "right" | "surprise" | "universal" | "spot";

/** null for an ordinary gift, which bursts not at all. */
export function burstDirection(gift: Gift): BurstDirection | null {
  if (gift.is_taptap === true) return "up";
  if (gift.is_rainfall === true) return "down";
  if (gift.is_left_hander === true) return "right";  // enters at the LEFT, travels right
  if (gift.is_right_hander === true) return "left";  // enters at the RIGHT, travels left
  if (gift.is_surprise === true) return "surprise";
  if (gift.is_universal === true) return "universal";
  if (gift.is_spot === true) return "spot";
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
    case "spot": return SPOT;
    default: return null;
  }
}

/** How long a burst of this gift runs, so the caller knows when to stop showing it. */
export function tapTapBurstDuration(gift: Gift): number {
  // Surprise runs for a fixed 5 seconds whatever the gift costs.
  if (burstDirection(gift) === "surprise") return SURPRISE_MS + SURPRISE_LIFE_MS;
  // Spot is a stream, so this is when the LAST one lands plus how long it can stay. The worst
  // case (fewest on screen, longest run), because spotOnScreen is random and this must never
  // end a burst before its last gift.
  if (burstDirection(gift) === "spot") {
    const total = Math.min(Math.max(giftPrice(gift), 1), MAX_ICONS);
    return spotLastLandsAt(total, spotOnScreenMin(giftPrice(gift)))
      + SPOT_FADE_IN_MS + SPOT_HOLD_MAX_MS + SPOT_FADE_OUT_MS;
  }
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
  /** Surprise and Spot: the two effects placed in BOTH axes. */
  topPct?: number;
  /** Spot only: this icon's own hold, so they do not all vanish together. */
  holdMs?: number;
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

    // Spot: one wave, every gift at once, each sitting in its own place for 3-5 seconds.
    //
    // "All over the screen" — so the places are a JITTERED GRID, not pure random. Twenty random
    // points clump badly: half the screen ends up bare and the middle is a pile (seen on the
    // iOS Simulator before this). One per cell, jittered inside it, keeps them spread while
    // still looking scattered rather than laid out.
    // A STREAM, not a wave (Steve, 2026-10-21): `onScreen` stand at any moment and as each
    // one's 3-5 seconds run out another takes its place, until all of them — one per coin, like
    // every other effect — have been seen. The grid is sized to how many STAND at once and its
    // cells are reshuffled each time round, so a long shower keeps covering the screen evenly
    // instead of dropping gifts into the same cells in the same order.
    if (dir === "spot") {
      const total = Math.min(Math.max(giftPrice(gift), 1), MAX_ICONS);
      const onScreen = spotOnScreen(giftPrice(gift));
      const interval = spotIntervalMs(total, onScreen);
      const columns = Math.max(1, Math.ceil(Math.sqrt(onScreen)));
      const rows = Math.max(1, Math.ceil(onScreen / columns));
      const cellCount = Math.max(columns * rows, 1);
      let bag: number[] = [];
      return Array.from({ length: total }, (_, n) => {
        if (bag.length === 0) {
          bag = Array.from({ length: cellCount }, (_, i) => i).sort(() => Math.random() - 0.5);
        }
        const cell = bag.pop() as number;
        return {
          key: n,
          dir: "spot" as BurstDirection,
          // The opening screenful lands together; the rest keep pace with the ones leaving.
          delayMs: n < onScreen
            ? (n / onScreen) * SPOT_SPAWN_WINDOW_MS + Math.random() * 120
            : SPOT_SPAWN_WINDOW_MS + (n - onScreen + 1) * interval,
          // 10..90 inside the cell keeps a gift off its neighbour and off the screen edge.
          startLeftPct: ((cell % columns) + 0.1 + Math.random() * 0.8) * (100 / columns),
          topPct: (Math.floor(cell / columns) + 0.1 + Math.random() * 0.8) * (100 / rows),
          driftPx: 0,
          risePct: 0,
          size: ICON_SIZE_MIN + Math.random() * ICON_SIZE_RANGE,
          spin: (Math.random() - 0.5) * 14,
          holdMs: SPOT_HOLD_MIN_MS + Math.random() * (SPOT_HOLD_MAX_MS - SPOT_HOLD_MIN_MS),
        };
      });
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
        /* Spot: fades in where it is put, holds its own 3-5 seconds, fades out. No bounce —
           a few dozen of these arriving at once is a lot of movement already. */
        @keyframes bb-taptap-spot {
          0%   { opacity: 0; transform: scale(.75) rotate(var(--bb-spin)); }
          10%  { opacity: 1; transform: scale(1) rotate(var(--bb-spin)); }
          88%  { opacity: 1; transform: scale(1) rotate(var(--bb-spin)); }
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
            ...(icon.dir === "surprise" || icon.dir === "spot"
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
              icon.dir === "spot"
                ? `bb-taptap-spot ${SPOT_FADE_IN_MS + (icon.holdMs ?? SPOT_HOLD_MIN_MS) + SPOT_FADE_OUT_MS}ms ease-out ${icon.delayMs}ms both`
                : icon.dir === "surprise"
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
