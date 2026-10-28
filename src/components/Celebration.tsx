// The "you got it!" celebration and the "sorry, wrong" card for Quiz Games (Steve, 2026-10-27: "If
// they get it right, make all kinds of different happy effects, like fireworks, confetti falling,
// money all over the screen or 100 different happy celebration. If he is wrong on the answer, just
// say on the screen, Sorry this answer is wrong, please try again").
//
// Both cover the WHOLE live room (portalled to <body>, so a transformed card can't shrink them),
// ignore every touch (pointer-events: none — never in the way of the next tap) and fade by themselves.
// 10 effects x 10 messages = 100 different celebrations; the effect never repeats twice in a row.
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { haptic, sfx } from "../lib/gameSounds";
import { useT } from "../lib/i18n";
import type { StringKey } from "../lib/i18n";

export const CELEBRATION_EFFECTS = ["confetti", "fireworks", "money", "coins", "balloons", "stars", "hearts", "trophy", "fountain", "glitter"] as const;
export type CelebrationEffect = (typeof CELEBRATION_EFFECTS)[number];
const CHEERS: StringKey[] = ["quiz_cheer_1", "quiz_cheer_2", "quiz_cheer_3", "quiz_cheer_4", "quiz_cheer_5", "quiz_cheer_6", "quiz_cheer_7", "quiz_cheer_8", "quiz_cheer_9", "quiz_cheer_10"];

/** One show: `id` changes for every right answer (Date.now() is fine). */
export type CelebrationShow = { id: number; streak?: number; points?: number | null; effect?: number; message?: number };

const CELEBRATE_MS = 2800;
const WRONG_MS = 2200;
const COLORS = ["#F0C420", "#2FBF5B", "#E5484D", "#49A8FF", "#D4537E", "#B36BFF", "#FF8A1F"];

const KEYFRAMES = `
@keyframes cel-in{from{opacity:0}to{opacity:1}}
@keyframes cel-out{from{opacity:1}to{opacity:0}}
@keyframes cel-fall{from{transform:translate(0,-14vh) rotate(0)}to{transform:translate(var(--dx,0px),114vh) rotate(var(--rot,360deg))}}
@keyframes cel-coin{from{transform:translate(0,-14vh) rotateY(0)}to{transform:translate(var(--dx,0px),114vh) rotateY(1080deg)}}
@keyframes cel-rise{from{transform:translate(0,0) rotate(0)}50%{transform:translate(var(--dx,0px),-60vh) rotate(var(--rot,0deg))}to{transform:translate(0,-125vh) rotate(0)}}
@keyframes cel-spark{0%{transform:translate(0,0) scale(.5);opacity:0}6%{opacity:1}70%{opacity:1}100%{transform:translate(var(--dx),calc(var(--dy) + 30px)) scale(var(--s1,.3));opacity:0}}
@keyframes cel-flash{0%{transform:scale(.1);opacity:0}15%{opacity:1}100%{transform:scale(1.4);opacity:0}}
@keyframes cel-fountain{0%{transform:translate(0,0) rotate(0);opacity:0}6%{opacity:1}50%{transform:translate(calc(var(--dx) * .6),var(--dy)) rotate(calc(var(--rot) * .5))}100%{transform:translate(var(--dx),calc(var(--dy) * -0.15)) rotate(var(--rot));opacity:0}}
@keyframes cel-twinkle{0%,100%{transform:scale(0) rotate(0);opacity:0}50%{transform:scale(1.2) rotate(90deg);opacity:1}}
@keyframes cel-zoom{0%{transform:scale(.1) rotate(-20deg);opacity:0}45%{transform:scale(1.15) rotate(6deg);opacity:1}65%{transform:scale(1) rotate(0)}100%{transform:scale(1.04)}}
@keyframes cel-spin{to{transform:rotate(360deg)}}
@keyframes cel-msg{0%{transform:scale(.2);opacity:0}55%{transform:scale(1.18);opacity:1}75%{transform:scale(.96)}100%{transform:scale(1)}}
@keyframes cel-msgfade{0%{opacity:0}15%{opacity:1}100%{opacity:1}}
@keyframes cel-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-10px)}40%{transform:translateX(9px)}60%{transform:translateX(-6px)}80%{transform:translateX(4px)}}
`;
let injected = false;
function useKeyframes() {
  useEffect(() => {
    if (injected) return;
    injected = true;
    const s = document.createElement("style"); s.textContent = KEYFRAMES; document.head.appendChild(s);
  }, []);
}

function reducedMotion(): boolean {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

let lastEffect = -1;
/** A random effect, never the same as the last one shown. */
function pickEffect(): number {
  let e = Math.floor(Math.random() * CELEBRATION_EFFECTS.length);
  if (e === lastEffect) e = (e + 1 + Math.floor(Math.random() * (CELEBRATION_EFFECTS.length - 1))) % CELEBRATION_EFFECTS.length;
  lastEffect = e;
  return e;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
type Css = React.CSSProperties & Record<`--${string}`, string>;
const abs: React.CSSProperties = { position: "absolute", display: "block", willChange: "transform, opacity" };

/** Falling things (confetti, money, coins): spread across the top, falling the whole height. */
function fall(n: number, make: (i: number) => { node: React.ReactNode; style?: React.CSSProperties }, anim = "cel-fall", rot = 360) {
  return Array.from({ length: n }, (_, i) => {
    const m = make(i);
    const style: Css = { ...abs, top: 0, left: `${rnd(-2, 98)}%`, "--dx": `${rnd(-60, 60)}px`, "--rot": `${rnd(-rot, rot)}deg`,
      animation: `${anim} ${rnd(1.6, 2.4)}s cubic-bezier(.3,.1,.7,1) ${rnd(0, 0.7)}s both`, ...m.style };
    return <span key={i} style={style}>{m.node}</span>;
  });
}

/** Things flying out of a point: (x%, y%) of the screen. */
function burstFrom(x: number, y: number, n: number, dist: [number, number], delay: number, make: (i: number) => React.ReactNode, key: string, dur = 1.1) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + rnd(-0.15, 0.15);
    const d = rnd(dist[0], dist[1]);
    const style: Css = { ...abs, left: `${x}%`, top: `${y}%`, "--dx": `${Math.cos(a) * d}px`, "--dy": `${Math.sin(a) * d}px`, "--s1": `${rnd(0.2, 0.6)}`,
      animation: `cel-spark ${dur + rnd(-0.15, 0.25)}s cubic-bezier(.1,.7,.3,1) ${delay}s both` };
    return <span key={`${key}${i}`} style={style}>{make(i)}</span>;
  });
}

function Particles({ effect }: { effect: CelebrationEffect }) {
  // Made once per show: a poll re-rendering the page must not re-roll every particle mid-flight.
  return useMemo(() => {
    switch (effect) {
      case "confetti":
        return <>{fall(80, (i) => ({ node: null, style: { width: rnd(7, 11), height: rnd(11, 17), borderRadius: 2, background: COLORS[i % COLORS.length] } }), "cel-fall", 720)}</>;
      case "fireworks": {
        const bursts = Array.from({ length: 5 }, (_, b) => ({ x: [22, 74, 48, 28, 76][b] + rnd(-8, 8), y: [22, 30, 14, 52, 58][b] + rnd(-6, 6), c: COLORS[(b * 2) % COLORS.length], c2: COLORS[(b * 2 + 3) % COLORS.length], at: b * 0.32 }));
        return <>{bursts.flatMap((b, bi) => [
          <span key={`f${bi}`} style={{ ...abs, left: `calc(${b.x}% - 60px)`, top: `calc(${b.y}% - 60px)`, width: 120, height: 120, borderRadius: "50%",
            background: `radial-gradient(circle, ${b.c}cc 0%, ${b.c}33 40%, transparent 70%)`, animation: `cel-flash .9s ease-out ${b.at}s both` }} />,
          ...burstFrom(b.x, b.y, 28, [100, 170], b.at, (i) => <span style={{ display: "block", width: 13, height: 13, marginLeft: -6, marginTop: -6, borderRadius: "50%", background: i % 3 ? b.c : "#fff", boxShadow: `0 0 12px 5px ${i % 3 ? b.c : b.c2}` }} />, `s${bi}`, 1.3),
        ])}</>;
      }
      case "money":
        return <>{fall(34, (i) => ({ node: i % 3 === 0 ? "💰" : "💵", style: { fontSize: rnd(28, 44) } }), "cel-fall", 70)}</>;
      case "coins":
        return <>
          {fall(36, () => ({ node: "🪙", style: { fontSize: rnd(28, 42), filter: "sepia(1) saturate(5) hue-rotate(-8deg) brightness(1.08) drop-shadow(0 0 6px rgba(240,196,32,.9))" } }), "cel-coin")}
          {Array.from({ length: 16 }, (_, i) => (
            <span key={`g${i}`} style={{ ...abs, left: `${rnd(4, 94)}%`, top: `${rnd(5, 90)}%`, fontSize: rnd(14, 22), color: "#FFE27A", animation: `cel-twinkle ${rnd(0.7, 1.1)}s ease-in-out ${rnd(0, 1.8)}s both` }}>✦</span>
          ))}
        </>;
      case "balloons":
        return <>{Array.from({ length: 22 }, (_, i) => {
          const style: Css = { ...abs, bottom: -90, left: `${rnd(0, 92)}%`, fontSize: rnd(40, 60), filter: `hue-rotate(${[0, 50, 120, 200, 280][i % 5]}deg) saturate(1.3)`,
            "--dx": `${rnd(-40, 40)}px`, "--rot": `${rnd(-14, 14)}deg`, animation: `cel-rise ${rnd(2.1, 2.7)}s ease-in ${rnd(0, 0.5)}s both` };
          return <span key={i} style={style}>🎈</span>;
        })}</>;
      case "stars":
        return <>
          <span style={{ ...abs, left: "calc(50% - 90px)", top: "calc(45% - 90px)", width: 180, height: 180, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,226,122,.9), rgba(255,226,122,0) 70%)", animation: "cel-flash 1s ease-out both" }} />
          {burstFrom(50, 45, 18, [140, 260], 0, (i) => <span style={{ fontSize: i % 2 ? 34 : 46 }}>{i % 2 ? "✨" : "⭐"}</span>, "a", 1.5)}
          {burstFrom(50, 45, 14, [90, 200], 0.55, (i) => <span style={{ fontSize: i % 2 ? 30 : 38 }}>{i % 2 ? "⭐" : "✨"}</span>, "b", 1.4)}
        </>;
      case "hearts":
        return <>{Array.from({ length: 28 }, (_, i) => {
          const style: Css = { ...abs, bottom: -60, left: `${rnd(0, 94)}%`, fontSize: rnd(26, 42),
            "--dx": `${rnd(-50, 50)}px`, "--rot": `${rnd(-20, 20)}deg`, animation: `cel-rise ${rnd(2, 2.6)}s ease-out ${rnd(0, 0.7)}s both` };
          return <span key={i} style={style}>{["💖", "💛", "💜"][i % 3]}</span>;
        })}</>;
      case "trophy":
        return <>
          <span style={{ ...abs, left: "50%", top: "40%", width: "150vmax", height: "150vmax", marginLeft: "-75vmax", marginTop: "-75vmax", borderRadius: "50%",
            background: "repeating-conic-gradient(rgba(240,196,32,.42) 0deg 9deg, rgba(240,196,32,0) 9deg 22deg)",
            WebkitMaskImage: "radial-gradient(circle, #000 0%, #000 18%, transparent 42%)", maskImage: "radial-gradient(circle, #000 0%, #000 18%, transparent 42%)",
            animation: "cel-spin 6s linear infinite" }} />
          <span style={{ ...abs, left: "50%", top: "40%", width: 0, height: 0 }}>
            <span style={{ display: "block", fontSize: 150, lineHeight: 1, transform: "translate(-50%,-50%)" }}>
              <span style={{ display: "block", animation: "cel-zoom .9s cubic-bezier(.2,.9,.3,1.2) both", filter: "drop-shadow(0 0 22px rgba(240,196,32,.85))" }}>🏆</span>
            </span>
          </span>
        </>;
      case "fountain":
        return <>{Array.from({ length: 42 }, (_, i) => {
          const style: Css = { ...abs, bottom: 10, left: "calc(50% - 18px)", fontSize: rnd(26, 40),
            "--dx": `${rnd(-46, 46)}vw`, "--dy": `${rnd(-78, -45)}vh`, "--rot": `${rnd(-300, 300)}deg`,
            animation: `cel-fountain ${rnd(1.6, 2.2)}s cubic-bezier(.2,.6,.4,1) ${(i % 14) * 0.06 + Math.floor(i / 14) * 0.35}s both` };
          return <span key={i} style={style}>{["🎉", "🥳", "🎊"][i % 3]}</span>;
        })}</>;
      case "glitter":
        return <>{Array.from({ length: 80 }, (_, i) => (
          <span key={i} style={{ ...abs, left: `${rnd(1, 95)}%`, top: `${rnd(2, 94)}%`, fontSize: rnd(18, 40), color: i % 4 ? "#FFE27A" : "#fff",
            textShadow: "0 0 10px rgba(255,226,122,.9)", animation: `cel-twinkle ${rnd(0.7, 1.1)}s ease-in-out ${rnd(0, 1)}s 2 both` }}>{i % 3 ? "✨" : "✦"}</span>
        ))}</>;
    }
  }, [effect]);
}

/** The full-screen celebration. Renders nothing until `show` is set; each new `show.id` plays once. */
export function Celebration({ show, durationMs = CELEBRATE_MS, silent }: { show: CelebrationShow | null; durationMs?: number; silent?: boolean }) {
  useKeyframes();
  const { t } = useT();
  const [live, setLive] = useState<{ id: number; effect: number; message: number; reduced: boolean } | null>(null);
  useEffect(() => {
    if (!show) return;
    const effect = show.effect ?? pickEffect();
    const message = show.message ?? Math.floor(Math.random() * CHEERS.length);
    setLive({ id: show.id, effect, message, reduced: reducedMotion() });
    if (!silent) { sfx.correct(); window.setTimeout(() => sfx.fanfare(), 480); haptic([70, 50, 140]); }
    const timer = window.setTimeout(() => setLive((l) => (l && l.id === show.id ? null : l)), durationMs);
    return () => window.clearTimeout(timer);
    // Only a NEW show plays; the same one re-rendered by a poll does nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show?.id]);
  if (!live || !show) return null;
  const streak = show.streak ?? 0;
  const stroke: React.CSSProperties = { color: "#F0C420", WebkitTextStroke: "2px #3B2A00", paintOrder: "stroke fill",
    textShadow: "0 4px 0 #6B4A00, 0 6px 18px rgba(0,0,0,.85), 0 0 26px rgba(240,196,32,.55)" };
  return createPortal(
    <div aria-live="polite" role="status" style={{ position: "fixed", inset: 0, zIndex: 1000, pointerEvents: "none", overflow: "hidden",
      animation: `cel-in .18s ease both, cel-out .6s ease ${Math.max(0, durationMs - 600)}ms forwards` }} key={live.id}>
      {!live.reduced && <Particles effect={CELEBRATION_EFFECTS[live.effect]} />}
      <div style={{ position: "absolute", left: 0, right: 0, top: CELEBRATION_EFFECTS[live.effect] === "trophy" && !live.reduced ? "56%" : "38%", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "0 16px", textAlign: "center" }}>
        <div style={{ ...stroke, fontSize: "min(84px, calc((100vw - 32px) / 8.2))", whiteSpace: "nowrap", fontWeight: 900, lineHeight: 1.02, letterSpacing: 1, fontFamily: "'Arial Black', 'Helvetica Neue', system-ui, sans-serif",
          animation: live.reduced ? "cel-msgfade .4s ease both" : "cel-msg .6s cubic-bezier(.2,.9,.3,1.3) .05s both" }}>{t(CHEERS[live.message])}</div>
        {show.points != null && show.points > 0 && (
          <div style={{ fontSize: 24, fontWeight: 900, color: "#fff", textShadow: "0 2px 6px #000", animation: "cel-msgfade .4s ease .35s both" }}>{t("quiz_plus_points", show.points)}</div>
        )}
        {streak >= 3 && (
          <div style={{ fontSize: 19, fontWeight: 900, color: "#000", background: "#F0A020", borderRadius: 999, padding: "5px 14px", boxShadow: "0 3px 10px rgba(0,0,0,.6)",
            animation: live.reduced ? "cel-msgfade .4s ease .3s both" : "cel-msg .5s cubic-bezier(.2,.9,.3,1.3) .4s both" }}>{t("quiz_on_fire", streak)}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** "😕 Sorry, this answer is wrong, please try again" — a big centred card for ~2.2s. */
export function WrongAnswerNotice({ show, durationMs = WRONG_MS, silent }: { show: number; durationMs?: number; silent?: boolean }) {
  useKeyframes();
  const { t } = useT();
  const [live, setLive] = useState(0);
  useEffect(() => {
    if (!show) return;
    setLive(show);
    if (!silent) { sfx.wrong(); haptic([90, 40, 90]); }
    const timer = window.setTimeout(() => setLive((l) => (l === show ? 0 : l)), durationMs);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);
  if (!live) return null;
  const reduced = reducedMotion();
  return createPortal(
    <div role="alert" key={live} style={{ position: "fixed", inset: 0, zIndex: 1000, pointerEvents: "none", display: "grid", placeItems: "center", padding: 16,
      animation: `cel-in .18s ease both, cel-out .6s ease ${Math.max(0, durationMs - 600)}ms forwards` }}>
      <div style={{ maxWidth: 360, width: "100%", boxSizing: "border-box", background: "rgba(16,16,18,.94)", border: "3px solid #E5484D", borderRadius: 20, padding: "22px 20px",
        color: "#fff", textAlign: "center", fontSize: 22, fontWeight: 900, lineHeight: 1.3, boxShadow: "0 10px 40px rgba(0,0,0,.7), 0 0 24px rgba(229,72,77,.45)",
        animation: reduced ? "none" : "cel-shake .45s ease-in-out .1s both" }}>
        {t("quiz_wrong_try_again")}
      </div>
    </div>,
    document.body,
  );
}
