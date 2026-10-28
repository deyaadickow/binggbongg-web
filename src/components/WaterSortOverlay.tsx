// "Water Sort" (Steve, 2026-10-27: "Do it now", with a water-sorting puzzle advert) — glass
// bottles on wooden shelves, coloured water in layers: pour the top colour onto the same colour or
// into an empty bottle until every bottle holds one colour. Our own look, the same appeal.
//
// Its own overlay, like One Stroke and Block Escape: nothing about pouring shares the spawn-and-tap
// machinery of the catch games. The rules and the seeded levels live in lib/watersort.ts, free of
// React, so level n is the same puzzle here as on Android and iOS.
//
// Money is Color Balls' (startColourBallSession / endColourBallSession with game_key water_sort):
// 50 coins to start, 1 coin a pour, charged once when the player finishes. The host playing their
// own room's game pays nothing — the server decides that, not this screen.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  CAPACITY, WATER_COLOURS, generateLevel, isComplete, isSolved, pour, pourAmount, type Bottle,
} from "../lib/watersort";
import { confirmColourBallEntryFee, endColourBallSession, startColourBallSession, type ColourBallResult, type ColourBallStart } from "../lib/tapgame";
import { useSession } from "../lib/session";
import { useT } from "../lib/i18n";
import { MuteButton } from "./GameShow";
import { Celebration, type CelebrationShow } from "./Celebration";
import { haptic, sfx } from "../lib/gameSounds";

const LEVEL_KEY = "bb_water_sort_level";
const gold = "var(--gold, #F0C420)";

function storedWaterSortLevel(): number {
  try { return Math.max(1, Math.floor(Number(localStorage.getItem(LEVEL_KEY)) || 1)); } catch { return 1; }
}
function rememberLevel(n: number) {
  try { if (n > storedWaterSortLevel()) localStorage.setItem(LEVEL_KEY, String(n)); } catch { /* private mode */ }
}

type Phase = "starting" | "attention" | "playing" | "finishing" | "done" | "error";

/** The game over the live room, with the coins around it: start (and the first-timer's Attention
 *  popup), play, then Finish -> endColourBallSession -> the result. */
export function WaterSortOverlay({ roomName, hostName, isHost, onClose }: { roomName: string; hostName: string; isHost: boolean; onClose: () => void }) {
  const { t } = useT();
  const { user, refresh } = useSession();
  const [phase, setPhase] = useState<Phase>("starting");
  const [start, setStart] = useState<ColourBallStart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ColourBallResult | null>(null);
  const [finalStats, setFinalStats] = useState({ pours: 0, solved: 0 });
  // Which call failed, so Try again repeats THAT one: a failed finish must never be retried as a
  // fresh start (a second round, a second entry fee).
  const [failed, setFailed] = useState<"start" | "agree" | "finish">("start");
  const begun = useRef(false);

  const begin = useCallback(async () => {
    if (!user) { setError("Sign in to play Water Sort."); setPhase("error"); return; }
    setPhase("starting");
    setError(null);
    try {
      const s = await startColourBallSession(user.id, roomName, "water_sort");
      setStart(s);
      if (s.needs_attention_popup) setPhase("attention");
      else { setPhase("playing"); refresh(); }
    } catch (e) {
      setFailed("start");
      setError((e as Error).message);
      setPhase("error");
    }
  }, [user, roomName, refresh]);

  // Straight in: the member already pressed Play Now on the room's game card. Guarded by a ref so
  // React's development double-mount can't open two rounds.
  useEffect(() => {
    if (begun.current) return;
    begun.current = true;
    void begin();
  }, [begin]);

  async function agree() {
    if (!user || !start) return;
    setPhase("starting");
    try {
      await confirmColourBallEntryFee(user.id, start.session_id);
      refresh();
      setPhase("playing");
    } catch (e) {
      setFailed("agree");
      setError((e as Error).message);
      setPhase("error");
    }
  }

  async function finish(pours: number, solved: number) {
    if (!start) { onClose(); return; }
    setFinalStats({ pours, solved });
    setPhase("finishing");
    setError(null);
    try {
      const r = await endColourBallSession(start.session_id, pours);
      setResult(r);
      setPhase("done");
      refresh();
    } catch (e) {
      setFailed("finish");
      setError((e as Error).message);
      setPhase("error");
    }
  }

  const moveCost = start?.move_cost_coins ?? 1;
  const host = result?.host_name || hostName || t("the_host");

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", background: "linear-gradient(#1F3557, #172840)" }}>
      <WaterSortGame
        isHost={isHost}
        hostName={hostName}
        moveCost={moveCost}
        active={phase === "playing"}
        onFinish={(pours, solved) => (phase === "playing" ? finish(pours, solved) : phase === "finishing" ? undefined : onClose())}
      />
      {phase !== "playing" && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 16, background: "rgba(5,10,20,0.62)", zIndex: 20 }}>
          <div className="card pad" style={{ width: "min(400px, 100%)", textAlign: "center" }}>
            {phase === "starting" && <p className="muted">{t("starting")}</p>}
            {phase === "attention" && start && (
              <>
                <h2 className="card-title" style={{ fontSize: 22 }}>{t("attention")}</h2>
                <p className="soft" style={{ marginTop: 8 }}>{t("tap_game_entry_agreement", start.entry_fee_coins)}</p>
                <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Then every pour is {moveCost} coin{moveCost === 1 ? "" : "s"}, gifted to {hostName || t("the_host")} when you finish.</p>
                <div className="row" style={{ marginTop: 14 }}>
                  <button className="btn ghost" style={{ flex: 1 }} onClick={onClose}>{t("gig_cancel")}</button>
                  <button className="btn" style={{ flex: 1 }} onClick={agree}>{t("agree")}</button>
                </div>
              </>
            )}
            {phase === "finishing" && <p className="muted">{t("adding_up_your_coins")}</p>}
            {phase === "done" && result && (
              <>
                <div style={{ fontSize: 56, lineHeight: 1 }}>🏆</div>
                <h2 className="card-title" style={{ fontSize: 22, marginTop: 8 }}>
                  {finalStats.solved === 1 ? "1 level solved" : `${finalStats.solved} levels solved`}
                </h2>
                <p className="soft" style={{ marginTop: 8, fontSize: 15 }}>
                  {isHost
                    ? `${poursLabel(result.moves)} · free in your own room`
                    : `${poursLabel(result.moves)} · ${coinsLabel(result.coins_charged)} gifted to ${host}`}
                </p>
                <button className="btn block" style={{ marginTop: 14 }} onClick={onClose}>{t("close")}</button>
              </>
            )}
            {phase === "error" && (
              <>
                <p style={{ color: "var(--red)" }}>{error}</p>
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn ghost" style={{ flex: 1 }} onClick={onClose}>{t("close")}</button>
                  {/* A start that never got a round has nothing to retry here — the card in the
                      room is one tap away. */}
                  {start && (
                    <button className="btn" style={{ flex: 1 }}
                      onClick={() => (failed === "finish" ? finish(finalStats.pours, finalStats.solved) : agree())}>{t("try_again")}</button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- The game itself (no network) ------------------------------------------------------------

// Bottle geometry, in SVG units, origin at the bottle's top-left. The lip is wider than the neck,
// the body wider again, with a round bottom.
const BW = 44, BH = 132;
const OUTER = `M5,5 L5,14 Q0,16 0,24 L0,${BH - 22} A22,22 0 0 0 44,${BH - 22} L44,24 Q44,16 39,14 L39,5 Z`;
const INNER = `M8,4 L8,15 Q3,17 3,25 L3,${BH - 22} A19,19 0 0 0 41,${BH - 22} L41,25 Q41,17 36,15 L36,4 Z`;
/** The water: 4 units between Y0 and Y1, across IX0..IX1. */
const IX0 = 3, IX1 = 41, Y0 = 30, Y1 = 129, U = (Y1 - Y0) / CAPACITY;
const LIFT = Math.round(BH * 0.18);
const SLOT = 64, PAD_X = 24, PAD_TOP = 18, SHELF_H = 13, ROW_GAP = 20;
const ROW_H = LIFT + BH + SHELF_H + ROW_GAP;
const TILT = 65;
const POUR_MS = 650, T_ARRIVE = 220, T_LEAVE = 470;

type Pt = [number, number];
type Seg = { c: number; h: number };
type Anim = { from: number; to: number; amount: number; colour: number; t: number; side: 1 | -1; after: Bottle[] };

/** Bottles to shelves: at least 2 shelves (it fills a phone held upright), at most 6 a shelf. */
function shelfLayout(count: number) {
  const rows = Math.max(2, Math.ceil(count / 6));
  const per: number[] = [];
  let left = count;
  for (let r = 0; r < rows; r++) { const n = Math.ceil(left / (rows - r)); per.push(n); left -= n; }
  const widest = Math.max(4, ...per);
  const width = widest * SLOT + PAD_X * 2;
  const slots: { x: number; y: number; row: number }[] = [];
  per.forEach((n, r) => {
    const x0 = (width - n * SLOT) / 2 + (SLOT - BW) / 2;
    for (let k = 0; k < n; k++) slots.push({ x: x0 + k * SLOT, y: PAD_TOP + LIFT + r * ROW_H, row: r });
  });
  return { per, width, height: PAD_TOP + per.length * ROW_H - ROW_GAP + 10, slots };
}

const ease = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const lerp = (a: number, b: number, x: number) => a + (b - a) * x;

function segments(b: Bottle): Seg[] {
  const out: Seg[] = [];
  for (const c of b) { const last = out[out.length - 1]; if (last && last.c === c) last.h += 1; else out.push({ c, h: 1 }); }
  return out;
}

// --- tilted water: the surface stays level while the glass turns ---
// In the bottle's own frame, "down" is g = (sin θ, cos θ). Water fills the part of the glass with
// the largest p·g; each layer is the band between two such levels holding exactly its volume.
const RECT: Pt[] = [[IX0, 6], [IX1, 6], [IX1, Y1], [IX0, Y1]];
function clipHalf(poly: Pt[], g: Pt, s: number, keepAbove: boolean): Pt[] {
  const f = (p: Pt) => (p[0] * g[0] + p[1] * g[1] - s) * (keepAbove ? 1 : -1);
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const fa = f(a), fb = f(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) { const k = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]); }
  }
  return out;
}
function area(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return Math.abs(a) / 2;
}
/** The level s at which the water below it (p·g >= s) has area `want`. */
function levelFor(g: Pt, want: number): number {
  const ds = RECT.map((p) => p[0] * g[0] + p[1] * g[1]);
  let lo = Math.min(...ds), hi = Math.max(...ds);
  if (want <= 0) return hi;
  for (let i = 0; i < 26; i++) { const mid = (lo + hi) / 2; if (area(clipHalf(RECT, g, mid, true)) > want) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
const pts = (p: Pt[]) => p.map((q) => `${q[0].toFixed(2)},${q[1].toFixed(2)}`).join(" ");

function Water({ segs, angle, wave, clip }: { segs: Seg[]; angle: number; wave: boolean; clip: string }) {
  // below[k] = units of water under layer k.
  const below = segs.map((_, k) => segs.slice(0, k).reduce((a, s) => a + s.h, 0));
  const total = segs.reduce((a, s) => a + s.h, 0);
  if (total <= 0.001) return null;
  if (Math.abs(angle) < 0.5) {
    const layers = segs.map((s, k) => {
      const bottom = Y1 - below[k] * U, topY = bottom - s.h * U;
      const col = WATER_COLOURS[s.c];
      return (
        <g key={k}>
          <rect x={0} y={topY} width={BW} height={bottom - topY + (k === 0 ? 6 : 0.6)} fill={col} />
          {/* A lighter band at the top of each layer, so stacked colours read as separate pours. */}
          <rect x={0} y={topY} width={BW} height={Math.min(3.2, s.h * U)} fill="rgba(255,255,255,0.2)" />
        </g>
      );
    });
    const topY = Y1 - total * U;
    const topCol = WATER_COLOURS[segs[segs.length - 1].c];
    return (
      <g clipPath={`url(#${clip})`}>
        {layers}
        {wave && (
          // The surface ripples gently: a strip of small waves sliding sideways under the clip.
          <path className="ws-wave" fill={topCol}
            d={`M-24,${topY + 3} ${"q5,-3 10,0 q5,3 10,0 ".repeat(5)}L76,${topY + 5} L-24,${topY + 5} Z`} />
        )}
      </g>
    );
  }
  const th = (angle * Math.PI) / 180;
  const g: Pt = [Math.sin(th), Math.cos(th)];
  const unitArea = (IX1 - IX0) * U;
  return (
    <g clipPath={`url(#${clip})`}>
      {segs.map((s, k) => {
        const upper = levelFor(g, below[k] * unitArea);
        const lower = levelFor(g, (below[k] + s.h) * unitArea);
        const poly = clipHalf(clipHalf(RECT, g, lower, true), g, upper, false);
        return poly.length > 2 ? <polygon key={k} points={pts(poly)} fill={WATER_COLOURS[s.c]} stroke={WATER_COLOURS[s.c]} strokeWidth={0.6} /> : null;
      })}
    </g>
  );
}

const KEYFRAMES = `
@keyframes ws-wave{from{transform:translateX(0)}to{transform:translateX(-20px)}}
@keyframes ws-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-5px)}40%{transform:translateX(5px)}60%{transform:translateX(-3px)}80%{transform:translateX(2px)}}
@keyframes ws-cork{0%{transform:translateY(-34px) scale(.6);opacity:0}55%{transform:translateY(2px) scale(1.08);opacity:1}75%{transform:translateY(-3px) scale(.98)}100%{transform:translateY(0) scale(1)}}
@keyframes ws-burst{0%{transform:translate(0,0) rotate(0);opacity:1}100%{transform:translate(var(--dx),var(--dy)) rotate(var(--rot));opacity:0}}
@keyframes ws-twinkle{0%,100%{transform:scale(0) rotate(0);opacity:0}45%{transform:scale(1.2) rotate(45deg);opacity:1}}
@keyframes ws-flash{0%{transform:scale(.6);opacity:0}25%{opacity:1}100%{transform:scale(1.25);opacity:0}}
@keyframes ws-glow{0%,100%{opacity:.75}50%{opacity:1}}
@keyframes ws-in{from{opacity:0;transform:translateY(14px) scale(.96)}to{opacity:1;transform:none}}
.ws-wave{animation:ws-wave 2.6s linear infinite}
.ws-shake{animation:ws-shake .38s ease-in-out}
.ws-cork{animation:ws-cork .55s cubic-bezier(.2,.9,.3,1.3) both;transform-box:fill-box;transform-origin:50% 100%}
.ws-twinkle{animation:ws-twinkle 1.1s ease-in-out both;transform-box:fill-box;transform-origin:50% 50%}
@media (prefers-reduced-motion: reduce){.ws-wave{animation:none}}
`;
let injected = false;

/** The board, the header and the Finish button — everything but the money. */
export function WaterSortGame({ isHost, hostName, moveCost, active, onFinish, startLevel }: {
  isHost: boolean; hostName: string; moveCost: number; active: boolean;
  /** Finish / back: total pours this session and how many levels were solved. */
  onFinish: (pours: number, solved: number) => void;
  /** Where to begin; the remembered level when not given. */
  startLevel?: number;
}) {
  useEffect(() => {
    if (injected) return;
    injected = true;
    const s = document.createElement("style"); s.textContent = KEYFRAMES; document.head.appendChild(s);
  }, []);
  const clip = `ws-inner-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const glowId = `${clip}-glow`;
  // The level and its bottles change together, so no render ever pairs one level's shelves with
  // another level's bottles.
  const [game, setGame] = useState(() => {
    const level = generateLevel(startLevel ?? storedWaterSortLevel());
    return { level, bottles: level.bottles.map((b) => b.slice()) };
  });
  const level = game.level, levelNo = level.n, bottles = game.bottles;
  const setBottles = (bs: Bottle[]) => setGame((g) => ({ ...g, bottles: bs }));
  const [selected, setSelected] = useState<number | null>(null);
  const [pours, setPours] = useState(0);
  const [solvedCount, setSolvedCount] = useState(0);
  const [solved, setSolved] = useState(false);
  const [anim, setAnim] = useState<Anim | null>(null);
  const [shake, setShake] = useState<{ i: number; id: number } | null>(null);
  const [bursts, setBursts] = useState<{ i: number; id: number }[]>([]);
  const [celebrate, setCelebrate] = useState<CelebrationShow | null>(null);
  // The handlers read these, not the render's copies: a tap queued during a pour runs after it.
  const bottlesRef = useRef(bottles); bottlesRef.current = bottles;
  const selectedRef = useRef(selected); selectedRef.current = selected;
  const animRef = useRef<Anim | null>(null);
  const queued = useRef<number | null>(null);
  const solvedRef = useRef(false); solvedRef.current = solved;
  const activeRef = useRef(active); activeRef.current = active;
  const levelRef = useRef(levelNo); levelRef.current = levelNo;
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const layout = useMemo(() => shelfLayout(level.bottles.length), [level.bottles.length]);

  const doShake = (i: number) => setShake({ i, id: Date.now() + i });

  const tap = useCallback((i: number) => {
    if (!activeRef.current || solvedRef.current) return;
    if (animRef.current) { if (queued.current === null) queued.current = i; return; }
    const bs = bottlesRef.current;
    const sel = selectedRef.current;
    if (sel === null) {
      // Nothing to pick up in an empty bottle, and a corked one is finished.
      if (bs[i].length === 0 || isComplete(bs[i])) { doShake(i); sfx.tick(); return; }
      setSelected(i); sfx.tick(); return;
    }
    if (sel === i) { setSelected(null); return; }
    const amount = pourAmount(bs[sel], bs[i]);
    const after = amount > 0 ? pour(bs, sel, i) : null;
    if (!after) { doShake(i); sfx.nope(); haptic(20); return; }
    const sx = layout.slots[sel].x, tx = layout.slots[i].x;
    // Come in from the source's own side — unless the tilted bottle would hang off the board.
    let side: 1 | -1 = sx <= tx ? 1 : -1;
    const reach = BH * Math.sin((TILT * Math.PI) / 180) + 10;
    if (side === 1 && tx + BW / 2 - reach < -10) side = -1;
    else if (side === -1 && tx + BW / 2 + reach > layout.width + 10) side = 1;
    runPour({ from: sel, to: i, amount, colour: bs[sel][bs[sel].length - 1], t: 0, side, after });
  // runPour only touches refs and setters.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  /** The pour itself: a requestAnimationFrame clock, committed to the board when it ends. */
  function runPour(a: Anim) {
    animRef.current = a;
    setAnim(a);
    // Counted as it starts, so a Finish pressed mid-pour still pays for the water already moving.
    setPours((p) => p + 1);
    sfx.pour();
    haptic(12);
    let t0 = -1;
    const step = (now: number) => {
      if (t0 < 0) t0 = now;
      const t = Math.min(POUR_MS, now - t0);
      const cur = animRef.current;
      if (!cur) return;
      const next = { ...cur, t };
      animRef.current = next;
      setAnim(next);
      if (t < POUR_MS) { raf.current = requestAnimationFrame(step); return; }
      // Done: the water is where it was poured.
      animRef.current = null;
      setAnim(null);
      setSelected(null);
      setBottles(next.after);
      bottlesRef.current = next.after;
      selectedRef.current = null;
      if (isComplete(next.after[next.to])) {
        sfx.sparkle();
        haptic([30, 40, 60]);
        const id = Date.now();
        setBursts((b) => [...b, { i: next.to, id }]);
        window.setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 1600);
      }
      if (isSolved(next.after)) {
        setSolved(true);
        solvedRef.current = true;
        setSolvedCount((n) => n + 1);
        rememberLevel(levelRef.current + 1);
        window.setTimeout(() => setCelebrate({ id: Date.now() }), 250);
        queued.current = null;
        return;
      }
      const q = queued.current;
      queued.current = null;
      if (q !== null) window.setTimeout(() => tapRef.current(q), 0);
    };
    raf.current = requestAnimationFrame(step);
  }
  const tapRef = useRef(tap); tapRef.current = tap;

  function restart() {
    if (animRef.current) return;
    setBottles(level.bottles.map((b) => b.slice()));
    setSelected(null);
    setSolved(false);
    queued.current = null;
  }

  function nextLevel() {
    const lv = generateLevel(levelNo + 1);
    setCelebrate(null);
    setSelected(null);
    setSolved(false);
    queued.current = null;
    setGame({ level: lv, bottles: lv.bottles.map((b) => b.slice()) });
  }

  // ---- drawing ----
  const rest = (i: number): Pt => [layout.slots[i].x, layout.slots[i].y - (selected === i ? LIFT : 0)];

  /** The source bottle mid-pour: where it is, its tilt, and its mouth corner (the pivot). */
  function pose(a: Anim): { x: number; y: number; angle: number; pivot: Pt; mouth: Pt } {
    const pivot: Pt = a.side === 1 ? [BW - 2, 1] : [2, 1];
    const start: Pt = [layout.slots[a.from].x, layout.slots[a.from].y - LIFT];
    const home: Pt = [layout.slots[a.from].x, layout.slots[a.from].y];
    const tSlot = layout.slots[a.to];
    const mouth: Pt = [tSlot.x + BW / 2 - a.side * 7, tSlot.y - 24];
    const angle = a.side * TILT;
    let k: number, from: Pt, to: Pt, ang: number;
    if (a.t <= T_ARRIVE) { k = ease(a.t / T_ARRIVE); from = start; to = [mouth[0] - pivot[0], mouth[1] - pivot[1]]; ang = angle * k; }
    else if (a.t < T_LEAVE) { k = 1; from = to = [mouth[0] - pivot[0], mouth[1] - pivot[1]]; ang = angle; }
    else { k = ease((a.t - T_LEAVE) / (POUR_MS - T_LEAVE)); from = [mouth[0] - pivot[0], mouth[1] - pivot[1]]; to = home; ang = angle * (1 - k); }
    // Interpolate the PIVOT's position so the mouth glides straight to the target.
    const px = lerp(from[0] + pivot[0], to[0] + pivot[0], k), py = lerp(from[1] + pivot[1], to[1] + pivot[1], k);
    return { x: px - pivot[0], y: py - pivot[1], angle: ang, pivot, mouth: [px, py] };
  }

  const flow = anim ? Math.max(0, Math.min(1, (anim.t - T_ARRIVE) / (T_LEAVE - T_ARRIVE))) : 0;

  function segsFor(i: number): Seg[] {
    const b = bottles[i];
    if (!anim) return segments(b);
    if (i === anim.from) {
      const keep = b.slice(0, b.length - anim.amount);
      const s = segments(keep);
      const left = anim.amount * (1 - flow);
      if (left > 0.001) {
        const last = s[s.length - 1];
        if (last && last.c === anim.colour) last.h += left; else s.push({ c: anim.colour, h: left });
      }
      return s;
    }
    if (i === anim.to) {
      const s = segments(b);
      const add = anim.amount * flow;
      if (add > 0.001) {
        const last = s[s.length - 1];
        if (last && last.c === anim.colour) last.h += add; else s.push({ c: anim.colour, h: add });
      }
      return s;
    }
    return segments(b);
  }

  function bottleArt(i: number, angle: number) {
    const b = bottles[i];
    const done = !anim && isComplete(b);
    const lifted = selected === i;
    return (
      <>
        <path d={OUTER} fill="rgba(255,255,255,0.07)" />
        <Water segs={segsFor(i)} angle={angle} wave={!anim || (i !== anim.from && i !== anim.to)} clip={clip} />
        {/* Glass: a faint inner shadow on the right, a gloss stripe down the left. */}
        <path d={INNER} fill="none" stroke="rgba(0,0,0,0.22)" strokeWidth={2.4} />
        <rect x={8} y={30} width={4.5} height={BH - 62} rx={2.2} fill="rgba(255,255,255,0.28)" />
        <rect x={14.5} y={34} width={1.6} height={BH - 80} rx={0.8} fill="rgba(255,255,255,0.14)" />
        <path d={OUTER} fill="none" stroke={lifted ? "#F0C420" : "rgba(255,255,255,0.55)"} strokeWidth={lifted ? 2.4 : 1.8}
          filter={lifted ? `url(#${glowId})` : undefined} style={lifted ? { animation: "ws-glow 1.2s ease-in-out infinite" } : undefined} />
        <rect x={2} y={0} width={BW - 4} height={6} rx={3} fill="rgba(255,255,255,0.16)" stroke={lifted ? "#F0C420" : "rgba(255,255,255,0.62)"} strokeWidth={1.5} />
        {done && (
          // The cork pops on: this bottle is finished and can't be picked up again.
          <g className="ws-cork">
            <rect x={8} y={-11} width={BW - 16} height={15} rx={3.5} fill="#B07A45" stroke="#6E4520" strokeWidth={1.2} />
            <rect x={8} y={-11} width={BW - 16} height={4} rx={2} fill="#D29A5E" />
            <line x1={15} y1={-4} x2={15} y2={3} stroke="#6E4520" strokeWidth={1} opacity={0.6} />
            <line x1={BW - 15} y1={-5} x2={BW - 15} y2={2} stroke="#6E4520" strokeWidth={1} opacity={0.6} />
          </g>
        )}
      </>
    );
  }

  const p = anim ? pose(anim) : null;
  const streamOn = anim && p && anim.t > T_ARRIVE - 25 && anim.t < T_LEAVE + 25;
  let stream: React.ReactNode = null;
  if (anim && p && streamOn) {
    const ts = layout.slots[anim.to];
    const filled = segsFor(anim.to).reduce((a, s) => a + s.h, 0);
    const surface = ts.y + Y1 - filled * U;
    const x0 = p.mouth[0] + anim.side * 1.5, y0 = p.mouth[1] + 2;
    // It pours in from the mouth (growing down at the start) and lets go at the end (its top
    // falling after the rest).
    const grow = Math.min(1, (anim.t - (T_ARRIVE - 25)) / 70);
    const release = Math.max(0, (anim.t - (T_LEAVE - 40)) / 65);
    const top = lerp(y0, surface, Math.min(1, release));
    const bottom = lerp(y0, surface + 3, grow);
    const wob = Math.sin(anim.t / 28) * 1.3;
    const x1 = ts.x + BW / 2 - anim.side * 3;
    const col = WATER_COLOURS[anim.colour];
    if (bottom > top + 1) {
      const d = `M${x0},${top} C${x0 + wob},${lerp(top, bottom, 0.35)} ${x1 - wob},${lerp(top, bottom, 0.65)} ${x1},${bottom}`;
      stream = (
        <g pointerEvents="none">
          <path d={d} stroke={col} strokeWidth={5.5} strokeLinecap="round" fill="none" />
          <path d={d} stroke="rgba(255,255,255,0.35)" strokeWidth={1.4} strokeLinecap="round" fill="none" transform="translate(-1.2,0)" />
          {grow >= 1 && release === 0 && <ellipse cx={x1} cy={surface + 1} rx={7 + Math.abs(wob) * 2} ry={2} fill="rgba(255,255,255,0.35)" />}
        </g>
      );
    }
  }

  const coins = pours * moveCost;
  const headerStat = isHost ? `💧 ${poursLabel(pours)}` : `💧 ${poursLabel(pours)} · ${coinsLabel(coins)}`;

  return (
    // A phone-shaped column, centred: on a desktop the header and Finish don't stretch edge to edge.
    <div style={{ flex: 1, minHeight: 0, width: "100%", maxWidth: 680, margin: "0 auto", display: "flex", flexDirection: "column", color: "#fff", userSelect: "none" }}>
      <Celebration show={celebrate} />
      <div style={{ padding: "10px 14px 6px", background: "rgba(8,14,26,0.55)", borderBottom: "1px solid rgba(240,196,32,0.35)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => onFinish(pours, solvedCount)} aria-label="Back" style={{ width: 34, height: 34, flex: "none", borderRadius: "50%", border: `1.5px solid ${gold}`, background: "#000", color: gold, fontSize: 20, cursor: "pointer" }}>‹</button>
          <b style={{ flex: 1, minWidth: 0, color: gold, fontSize: 19, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>🧪 Water Sort</b>
          <MuteButton />
          <button onClick={restart} aria-label="Restart level" title="Restart level"
            style={{ width: 32, height: 32, flex: "none", borderRadius: "50%", border: `1.5px solid ${gold}`, background: "#000", color: gold, fontSize: 17, lineHeight: 1, cursor: "pointer", display: "grid", placeItems: "center" }}>↻</button>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 7, flexWrap: "wrap" }}>
          <span style={{ background: gold, color: "#000", fontWeight: 900, fontSize: 13, borderRadius: 999, padding: "3px 11px" }}>Level {levelNo}</span>
          <span style={{ background: "rgba(0,0,0,0.45)", border: "1px solid rgba(255,255,255,0.18)", fontWeight: 800, fontSize: 13, borderRadius: 999, padding: "3px 11px", fontVariantNumeric: "tabular-nums" }}>{headerStat}</span>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", padding: "6px 8px", touchAction: "manipulation" }}>
        <svg viewBox={`0 0 ${layout.width} ${layout.height}`} style={{ width: "100%", height: "100%", maxWidth: 560, overflow: "visible", display: "block" }}
          role="img" aria-label={`Water Sort level ${levelNo}: ${level.bottles.length} bottles`}>
          <defs>
            <clipPath id={clip}><path d={INNER} /></clipPath>
            <filter id={glowId} x="-50%" y="-20%" width="200%" height="140%">
              <feGaussianBlur stdDeviation="2.6" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <linearGradient id={`${clip}-wood`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#B07A45" /><stop offset="0.22" stopColor="#9A6533" /><stop offset="1" stopColor="#7A4A22" />
            </linearGradient>
            <radialGradient id={`${clip}-flash`}>
              <stop offset="0" stopColor="rgba(255,226,122,0.55)" /><stop offset="1" stopColor="rgba(255,226,122,0)" />
            </radialGradient>
            <linearGradient id={`${clip}-under`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="rgba(0,0,0,0.45)" /><stop offset="1" stopColor="rgba(0,0,0,0)" />
            </linearGradient>
          </defs>

          {/* Shelves: warm wood, a lit top edge, a shadow beneath. */}
          {layout.per.map((n, r) => {
            const y = PAD_TOP + LIFT + r * ROW_H + BH - 3;
            const w = n * SLOT + 22;
            const x = (layout.width - w) / 2;
            return (
              <g key={r}>
                <rect x={x + 4} y={y + SHELF_H} width={w - 8} height={12} fill={`url(#${clip}-under)`} />
                <rect x={x} y={y} width={w} height={SHELF_H} rx={2.5} fill={`url(#${clip}-wood)`} />
                <rect x={x} y={y} width={w} height={3} rx={1.5} fill="#C68F55" />
                <path d={`M${x + 18},${y + 7} q${w * 0.2},-2 ${w * 0.42},0 M${x + w * 0.55},${y + 9} q${w * 0.15},1.5 ${w * 0.32},0`} stroke="rgba(60,30,10,0.35)" strokeWidth={0.9} fill="none" />
                {/* Brackets */}
                <path d={`M${x + 14},${y + SHELF_H} l0,10 l8,-10 Z M${x + w - 14},${y + SHELF_H} l0,10 l-8,-10 Z`} fill="#5E3A18" />
              </g>
            );
          })}

          {/* Contact shadows under each bottle. */}
          {layout.slots.map((s, i) => (
            <ellipse key={`sh${i}`} cx={s.x + BW / 2} cy={s.y + BH - 2} rx={BW / 2 - 2} ry={3} fill="rgba(0,0,0,0.3)" />
          ))}

          {bottles.map((_, i) => {
            if (anim && i === anim.from) return null;
            const [x, y] = rest(i);
            return (
              <g key={`b${i}`} style={{ transform: `translate(${x}px, ${y}px)`, transition: "transform 140ms ease-out" }}>
                <g key={shake && shake.i === i ? shake.id : 0} className={shake && shake.i === i ? "ws-shake" : undefined}>
                  {bottleArt(i, 0)}
                </g>
              </g>
            );
          })}

          {stream}

          {anim && p && (
            <g style={{ transform: `translate(${p.x + p.pivot[0]}px, ${p.y + p.pivot[1]}px) rotate(${p.angle}deg) translate(${-p.pivot[0]}px, ${-p.pivot[1]}px)` }}>
              {bottleArt(anim.from, p.angle)}
            </g>
          )}

          {/* A finished bottle: confetti out of its neck and a few sparkles around it. */}
          {bursts.map((bu) => {
            const s = layout.slots[bu.i];
            const cx = s.x + BW / 2, cy = s.y - 6;
            return (
              <g key={bu.id} pointerEvents="none">
                <ellipse cx={cx} cy={s.y + BH / 2} rx={BW * 0.95} ry={BH * 0.62} fill={`url(#${clip}-flash)`}
                  style={{ animation: "ws-flash 1.1s ease-out both", transformBox: "fill-box", transformOrigin: "50% 50%" }} />
                {Array.from({ length: 24 }, (_, k) => {
                  const ang = -Math.PI / 2 + ((k / 23) - 0.5) * 2.9;
                  const d = 46 + (k % 5) * 13;
                  const st = { "--dx": `${Math.cos(ang) * d}px`, "--dy": `${Math.sin(ang) * d + 26}px`, "--rot": `${(k % 2 ? 1 : -1) * 280}deg`,
                    animation: `ws-burst ${1 + (k % 3) * 0.15}s cubic-bezier(.15,.7,.4,1) both`, transformBox: "fill-box", transformOrigin: "50% 50%" } as React.CSSProperties;
                  return <rect key={k} x={cx - 3} y={cy - 4.5} width={6} height={9} rx={1.5} fill={["#F0C420", "#fff", WATER_COLOURS[bottles[bu.i][0] ?? 0], "#49A8FF", "#E5484D"][k % 5]} style={st} />;
                })}
                {[[-30, 14, 10], [30, 30, 8], [-27, 64, 7], [29, 86, 10], [0, -26, 9], [-31, 104, 8], [27, 118, 6], [14, 50, 6]].map(([dx, dy, r], k) => {
                  const x = cx + dx, y = s.y + dy, w = r * 0.28;
                  return (
                    <path key={`s${k}`} className="ws-twinkle" style={{ animationDelay: `${(k % 4) * 0.08}s` }}
                      d={`M${x},${y - r} L${x + w},${y - w} L${x + r},${y} L${x + w},${y + w} L${x},${y + r} L${x - w},${y + w} L${x - r},${y} L${x - w},${y - w} Z`}
                      fill={k % 3 ? "#FFE27A" : "#fff"} />
                  );
                })}
              </g>
            );
          })}

          {/* Tap targets: fixed to the slots (not the moving glass), tall enough to cover a lifted bottle. */}
          {layout.slots.map((s, i) => (
            <rect key={`hit${i}`} data-ws-bottle={i} x={s.x - (SLOT - BW) / 2} y={s.y - LIFT - 6} width={SLOT} height={BH + LIFT + 10}
              fill="transparent" style={{ cursor: "pointer" }}
              onPointerDown={(e) => { e.preventDefault(); tap(i); }} />
          ))}
        </svg>

        {solved && (
          // Low on the board: the celebration's big cheer sits at ~38% of the screen, above it.
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "16px 16px 22px", zIndex: 5 }}>
            <div style={{ width: "min(340px, 100%)", textAlign: "center", background: "rgba(10,16,30,0.9)", border: `2px solid ${gold}`, borderRadius: 20, padding: "20px 18px",
              boxShadow: "0 12px 40px rgba(0,0,0,0.6), 0 0 26px rgba(240,196,32,0.35)", animation: "ws-in .45s cubic-bezier(.2,.9,.3,1.2) .35s both" }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: gold }}>Level {levelNo} complete! 🎉</div>
              <div style={{ fontSize: 14, opacity: 0.85, marginTop: 6 }}>{level.colours} colours sorted</div>
              <button className="btn block" onClick={nextLevel} style={{ marginTop: 16, fontSize: 19, fontWeight: 900, padding: "14px 18px" }}>NEXT LEVEL ›</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: "8px 14px calc(12px + env(safe-area-inset-bottom))" }}>
        <button className="btn block" onClick={() => onFinish(pours, solvedCount)} style={{ fontWeight: 800 }}>
          {isHost ? "Finish" : `Finish — pay ${coinsLabel(coins)} to ${hostName || "the host"}`}
        </button>
      </div>
    </div>
  );
}

const poursLabel = (n: number) => `${n.toLocaleString()} pour${n === 1 ? "" : "s"}`;
const coinsLabel = (n: number) => `${Number(n).toLocaleString()} coin${Number(n) === 1 ? "" : "s"}`;
