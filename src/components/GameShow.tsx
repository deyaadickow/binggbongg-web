// Game Show pieces shared by Guessing Games and Trivia Night (Steve, 2026-10-27: "make these games
// more exciting ... add more visuals like horses, dogs, cartoons, moon, sun, blue water lake, sky,
// green trees, grass, fishing, hunting, swimming pool"). A scene banner (sky, sun/moon, ground,
// decor and moving cartoon actors, optionally race lanes), a countdown ring, confetti, a podium
// and a mute button. Scenes come from lib/gameSceneData.ts — the same table the phones use.
import { useEffect, useState } from "react";
import { SCENES, GUESS_SCENES, GUESS_KIND_SCENE, TRIVIA_SCENES, type Scene } from "../lib/gameSceneData";
import { isMuted, setMuted } from "../lib/gameSounds";

const gold = "var(--gold, #F0C420)";

export function sceneForGuess(templateKey: string | null, kind: string): { scene: Scene; racer: string | null } {
  const [key, racer] = (templateKey && GUESS_SCENES[templateKey]) || [GUESS_KIND_SCENE[kind] ?? "stage", null];
  return { scene: SCENES[key] ?? SCENES.stage, racer };
}
/** The colour of an answer box: a box named after a colour IS that colour (Steve, 2026-10-27 — "Blue"
 *  was a green box), otherwise the box's place in the game-show palette. Racers wear the same colour. */
export const OPTION_COLORS = ["#D85A30", "#1D9E75", "#378ADD", "#BA7517", "#8E5BD9", "#D4537E", "#16A3A3", "#6B7280"];
const NAMED_COLORS: Record<string, string> = {
  red: "#E0312F", blue: "#2563EB", green: "#1E9E4A", yellow: "#F2C230", pink: "#EC5C9F", orange: "#F28C28",
  purple: "#8E4FD6", white: "#F2F2F2", black: "#26272B", gold: "#D4A017", silver: "#AEB6BF", brown: "#8B5A2B",
};
export function optionColor(label: string, i: number): string {
  return NAMED_COLORS[label.trim().toLowerCase()] ?? OPTION_COLORS[i % OPTION_COLORS.length];
}
/** Dark text on a light box (yellow, white, silver), white text otherwise. */
export function textOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.68 ? "#1A1A1A" : "#fff";
}

/** One colour per SIDE on the audience card and anything else that shows two teams (Steve,
 *  2026-10-27): side 0 is blue, side 1 red — the 2v2 Team A / Team B colours — and a Solo Battle
 *  with more entrants continues through yellow, green, purple, pink. Same table on the phones. */
export const SIDE_COLORS = ["#2E9BFF", "#FF5A5F", "#F2C230", "#1E9E4A", "#8E4FD6", "#EC5C9F"];
export const sideColor = (i: number) => SIDE_COLORS[Math.max(0, i) % SIDE_COLORS.length];
/** Forfeit choices: neutral colours no side ever uses, so a forfeit never reads as a team. */
export const FORFEIT_COLORS = ["#8E5BD9", "#16A3A3", "#BA7517"];

/** Whole percentages that always add up to exactly 100 (largest remainder): 1/3 each shows
 *  34 · 33 · 33, never 33 · 33 · 33. All zero stays all zero. */
export function percentages(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0) return counts.map(() => 0);
  const raw = counts.map((c) => (100 * Math.max(0, c)) / total);
  const out = raw.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const o of order) { if (left <= 0) break; out[o.i] += 1; left -= 1; }
  return out;
}

/** A person's first name ("Maria Santos" -> "Maria"). */
export const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] ?? "";

/** Short side names for tight spots: "Team A…"/"Team B…" stay "Team A"/"Team B", anything with
 *  "Computer" is "Computer", anyone else their first name — unless two sides would then read
 *  the same, when both keep their full label. */
export function shortSideNames(labels: string[]): string[] {
  const short = labels.map((l) => {
    const t = (l ?? "").trim();
    if (/^Team A/i.test(t)) return "Team A";
    if (/^Team B/i.test(t)) return "Team B";
    if (t.includes("Computer")) return "Computer";
    return firstName(t) || t;
  });
  return short.map((s, i) => (short.some((o, j) => j !== i && o === s) ? labels[i] : s));
}

/** "🤖 Computer (Medium)" -> "Computer"; anyone else as given. */
export const podiumName = (name: string) => (name.includes("Computer") ? "Computer" : name);

/** A NASCAR-style stock car seen from the side, facing left, in its lane's colour with its number. */
export function StockCar({ color, number, width = 56 }: { color: string; number: number; width?: number }) {
  const dark = shade(color, -38);
  return (
    <svg width={width} height={width / 3} viewBox="0 0 120 40" style={{ display: "block", overflow: "visible" }}>
      <ellipse cx="60" cy="38" rx="58" ry="2.6" fill="rgba(0,0,0,.4)" />
      {/* Rear wing on its stand */}
      <path d="M103 12 L120 11 L120 14.5 L104 15.5 Z" fill={dark} />
      <path d="M114 14 L117 14 L116 19 L113 19 Z" fill="#111" />
      {/* Low, long body with a fastback roof */}
      <path d="M2 29 Q1 24 6 22 L42 18.5 Q50 10 58 9.5 L78 9.5 Q86 10 101 18 L116 19 Q119 20 119 25 L119 30 Q119 33 115 33 L5 33 Q2 33 2 29 Z" fill={color} stroke={dark} strokeWidth="1" />
      {/* Paint scheme: a dark rear quarter and a white stripe */}
      <path d="M88 19.5 L116 20 Q118 21 118 25 L118 31 L94 31 Z" fill={dark} opacity=".85" />
      <path d="M4 26 L118 26 L118 27.8 L4 27.8 Z" fill="#fff" opacity=".85" />
      {/* Glass, with the window net pillar */}
      <path d="M46 18 Q53 11.5 59 11.5 L77 11.5 Q84 12 92 18 Z" fill="#17202B" />
      <path d="M69 11.5 L71.5 11.5 L71.5 18 L69 18 Z" fill={color} />
      {/* Headlight decal and splitter */}
      <path d="M4 23.5 L11 23 L11 24.6 L4 25.2 Z" fill="#FFE9A8" />
      <path d="M1 31.5 L18 31.5" stroke="#0B0B0B" strokeWidth="2.6" />
      {/* Door number */}
      <circle cx="64" cy="23.5" r="7.6" fill="#fff" stroke="#111" strokeWidth="1" />
      <text x="64" y="27.6" textAnchor="middle" fontSize="11.5" fontWeight="900" fill="#111" fontFamily="Arial Black, Arial, sans-serif">{number}</text>
      {/* Racing wheels */}
      {[26, 96].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="31.5" r="8.6" fill="#121212" />
          <circle cx={cx} cy="31.5" r="4.6" fill="#C9CED6" />
          <circle cx={cx} cy="31.5" r="1.6" fill="#444" />
        </g>
      ))}
    </svg>
  );
}

/** A rubber duck, facing left. */
function RubberDuck({ color, size = 26 }: { color: string; size?: number }) {
  const dark = shade(color, -30);
  return (
    <svg width={size} height={size * 0.9} viewBox="0 0 40 36" style={{ display: "block", overflow: "visible" }}>
      <path d="M6 22 Q6 33 20 33 Q36 33 37 21 Q38 16 33 18 Q30 19 28 17 Q24 15 18 17 Z" fill={color} stroke={dark} strokeWidth="1" />
      <circle cx="13" cy="12" r="8.5" fill={color} stroke={dark} strokeWidth="1" />
      <path d="M5.5 12 Q0 12.5 1 15 Q3 17 8 15 Z" fill="#F28C28" />
      <circle cx="11" cy="9.5" r="1.8" fill="#111" /><circle cx="10.4" cy="8.9" r=".6" fill="#fff" />
      <path d="M22 22 Q27 19 31 22 Q27 25 22 22 Z" fill={dark} opacity=".6" />
    </svg>
  );
}

/** A folded paper boat, facing left. */
function PaperBoat({ color, size = 30 }: { color: string; size?: number }) {
  const dark = shade(color, -30);
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 40 32" style={{ display: "block", overflow: "visible" }}>
      <path d="M20 2 L28 20 L12 20 Z" fill={shade(color, 25)} stroke={dark} strokeWidth="1" />
      <path d="M1 20 L39 20 L32 30 L8 30 Z" fill={color} stroke={dark} strokeWidth="1" />
      <path d="M12 20 L20 26 L28 20" fill="none" stroke={dark} strokeWidth="1" />
    </svg>
  );
}

/** A glossy marble. */
function Marble({ color, size = 20 }: { color: string; size?: number }) {
  return <span style={{ display: "block", width: size, height: size, borderRadius: "50%", background: `radial-gradient(circle at 32% 30%, #fff 0 12%, ${color} 38%, ${shade(color, -40)} 100%)`, boxShadow: "0 2px 3px rgba(0,0,0,.45)" }} />;
}

export function sceneForTrivia(category: string | null | undefined): Scene {
  return SCENES[TRIVIA_SCENES[category ?? ""] ?? "lake"] ?? SCENES.lake;
}

const KEYFRAMES = `
@keyframes gs-drift{from{left:104%}to{left:-16%}}
@keyframes gs-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes gs-hop{0%,100%{transform:translateY(0)}40%{transform:translateY(-10px)}}
@keyframes gs-jump{0%{transform:translate(0,0) rotate(0);opacity:0}10%{opacity:1}50%{transform:translate(-30px,-34px) rotate(-30deg)}90%{opacity:1}100%{transform:translate(-60px,0) rotate(-70deg);opacity:0}}
@keyframes gs-twinkle{0%,100%{opacity:.25;transform:scale(.8)}50%{opacity:1;transform:scale(1.1)}}
@keyframes gs-spin{to{transform:rotate(360deg)}}
@keyframes gs-ripple{from{transform:translateX(0)}to{transform:translateX(-40px)}}
@keyframes gs-gallop{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-3px) rotate(-4deg)}}
@keyframes gs-pop{0%{transform:scale(1)}40%{transform:scale(1.07)}100%{transform:scale(1)}}
@keyframes gs-fall{from{top:-20px;transform:rotate(0);opacity:1}to{top:100%;transform:rotate(540deg);opacity:0}}
@keyframes gs-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}
@media (prefers-reduced-motion: reduce){.gs-anim{animation:none!important}}`;
let injected = false;
function useKeyframes() {
  useEffect(() => {
    if (injected) return;
    injected = true;
    const s = document.createElement("style"); s.textContent = KEYFRAMES; document.head.appendChild(s);
  }, []);
}

const OUTDOOR = new Set(["grass", "lake", "pool", "track", "road", "sand", "field"]);

/** A colour `pct` percent lighter (+) or darker (-). */
function shade(hex: string, pct: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (pct / 100) * (pct > 0 ? 255 - c : c))));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

function Ground({ scene, racing }: { scene: Scene; racing?: boolean }) {
  const top = racing ? "40%" : scene.ground === "lake" || scene.ground === "pool" ? "62%" : scene.ground === "track" || scene.ground === "road" ? "58%" : "70%";
  const base: React.CSSProperties = { position: "absolute", left: 0, right: 0, top, bottom: 0, background: scene.groundColor };
  switch (scene.ground) {
    case "none": return null;
    case "lake":
      return (
        <div style={base}>
          {[18, 45, 72].map((y, i) => (
            <div key={i} className="gs-anim" style={{ position: "absolute", top: `${y}%`, left: 0, width: "calc(100% + 40px)", height: 2,
              background: "repeating-linear-gradient(90deg, rgba(255,255,255,.55) 0 14px, transparent 14px 40px)", animation: `gs-ripple ${3 + i}s linear infinite` }} />
          ))}
        </div>
      );
    case "pool":
      return <div style={{ ...base, border: "3px solid #E9F7FF", borderBottom: "none", backgroundImage: "linear-gradient(rgba(255,255,255,.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.35) 1px, transparent 1px)", backgroundSize: "18px 18px" }} />;
    case "track":
      return <div style={{ ...base, borderTop: "6px solid #5FB548" }} />;
    case "road":
      return <div style={{ ...base, borderTop: "4px solid #9AA0A6" }}><div style={{ position: "absolute", top: "48%", left: 0, right: 0, height: 3, background: "repeating-linear-gradient(90deg, #F5D547 0 18px, transparent 18px 34px)" }} /></div>;
    case "field":
      return <div style={{ ...base, background: `repeating-linear-gradient(90deg, ${scene.groundColor} 0 26px, #37944A 26px 52px)`, borderTop: "2px solid #fff" }} />;
    case "floor":
      return <div style={{ ...base, background: `repeating-linear-gradient(90deg, ${scene.groundColor} 0 30px, rgba(0,0,0,.18) 30px 32px)` }} />;
    case "stage":
      return (
        <>
          <div style={{ position: "absolute", left: "8%", top: 0, width: "34%", height: "100%", background: "linear-gradient(180deg, rgba(255,240,180,.45), rgba(255,240,180,0))", clipPath: "polygon(45% 0, 55% 0, 100% 100%, 0 100%)" }} />
          <div style={{ position: "absolute", right: "8%", top: 0, width: "34%", height: "100%", background: "linear-gradient(180deg, rgba(180,220,255,.4), rgba(180,220,255,0))", clipPath: "polygon(45% 0, 55% 0, 100% 100%, 0 100%)" }} />
          <div style={base} />
        </>
      );
    default:
      return <div style={{ ...base, borderTop: `3px solid rgba(255,255,255,.18)` }} />;
  }
}

export type Lane = { label: string; emoji: string; progress: number; winner?: boolean; loser?: boolean; color?: string; number?: number };

/** The animated scene. `lanes` turns the ground into a race track (racers run right -> left). */
export function SceneBanner({ scene, height = 104, lanes, children }: { scene: Scene; height?: number; lanes?: Lane[]; children?: React.ReactNode }) {
  useKeyframes();
  const night = scene.stars;
  return (
    // flex "none": inside a scrolling flex column (Bingo, One Stroke) a long page otherwise squashes
    // the banner to 0px, since overflow:hidden lets it shrink below its height.
    <div style={{ position: "relative", height, flex: "none", borderRadius: 12, overflow: "hidden", background: `linear-gradient(180deg, ${scene.sky[0]}, ${scene.sky[1]})` }}>
      {night && Array.from({ length: 16 }, (_, i) => (
        <span key={i} className="gs-anim" style={{ position: "absolute", left: `${(i * 37) % 100}%`, top: `${(i * 23) % 55}%`, width: 3, height: 3, borderRadius: 2, background: "#fff", animation: `gs-twinkle ${1.6 + (i % 5) * 0.4}s ease-in-out ${i * 0.2}s infinite` }} />
      ))}
      {scene.body === "sun" && <span className="gs-anim" style={{ position: "absolute", right: "6%", top: 6, fontSize: 28, animation: "gs-spin 18s linear infinite" }}>☀️</span>}
      {scene.body === "moon" && <span style={{ position: "absolute", right: "7%", top: 6, fontSize: 24 }}>🌙</span>}
      {/* Fluffy clouds drifting across a daytime sky. */}
      {scene.body === "sun" && [0, 1].map((i) => (
        <span key={`c${i}`} className="gs-anim" style={{ position: "absolute", top: `${10 + i * 14}%`, width: 54 - i * 12, height: 16 - i * 3, borderRadius: 20, background: "rgba(255,255,255,.9)",
          boxShadow: `${14 - i * 4}px -7px 0 2px rgba(255,255,255,.9), ${-12 + i * 3}px -4px 0 0 rgba(255,255,255,.9)`, animation: `gs-drift ${38 + i * 17}s linear ${-i * 19}s infinite` }} />
      ))}
      {/* Rolling hills behind outdoor ground. */}
      {OUTDOOR.has(scene.ground) && (
        <>
          <div style={{ position: "absolute", left: "-12%", width: "62%", top: "50%", height: "60%", borderRadius: "50%", background: shade(scene.ground === "lake" || scene.ground === "pool" ? "#5FB548" : scene.groundColor, -18), opacity: 0.85 }} />
          <div style={{ position: "absolute", right: "-14%", width: "66%", top: "54%", height: "60%", borderRadius: "50%", background: shade(scene.ground === "lake" || scene.ground === "pool" ? "#5FB548" : scene.groundColor, -8), opacity: 0.85 }} />
        </>
      )}
      <Ground scene={scene} racing={!!lanes} />
      {/* Grass tufts in the foreground of grassy scenes. */}
      {(scene.ground === "grass" || scene.ground === "field") && !lanes && [8, 27, 46, 63, 79, 93].map((x, i) => (
        <span key={`g${i}`} style={{ position: "absolute", left: `${x}%`, bottom: 2 + (i % 2) * 6, fontSize: 11, opacity: 0.9 }}>🌱</span>
      ))}
      {!lanes && scene.decor.map(([e, x, y, size], i) => (
        <span key={`d${i}`} style={{ position: "absolute", left: `${x * 100}%`, top: `${y * 100}%`, fontSize: size, transform: "translate(-50%,-50%)", lineHeight: 1 }}>{e}</span>
      ))}
      {!lanes && scene.actors.map(([e, kind, y, size, secs], i) => {
        const style: React.CSSProperties = { position: "absolute", top: `${y * 100}%`, fontSize: size, lineHeight: 1, transform: "translateY(-50%)" };
        if (kind === "drift" || kind === "swim" || kind === "fly") {
          return (
            <span key={`a${i}`} className="gs-anim" style={{ ...style, left: "100%", animation: `gs-drift ${secs}s linear ${-i * 3}s infinite` }}>
              <span className="gs-anim" style={{ display: "inline-block", animation: `${kind === "drift" ? "gs-gallop" : "gs-bob"} ${kind === "fly" ? 1.2 : 0.9}s ease-in-out infinite` }}>{e}</span>
            </span>
          );
        }
        if (kind === "jump") return <span key={`a${i}`} className="gs-anim" style={{ ...style, left: "60%", animation: `gs-jump ${secs}s ease-in-out infinite` }}>{e}</span>;
        if (kind === "bounce") return <span key={`a${i}`} className="gs-anim" style={{ ...style, left: `${30 + i * 18}%`, animation: `gs-hop ${0.8 + secs * 0.2}s ease-in-out infinite` }}>{e}</span>;
        return <span key={`a${i}`} className="gs-anim" style={{ ...style, left: `${20 + i * 22}%`, animation: `gs-twinkle ${secs}s ease-in-out infinite` }}>{e}</span>;
      })}
      {lanes && (
        <div style={{ position: "absolute", left: 0, right: 0, top: "41%", bottom: 2, display: "flex", flexDirection: "column" }}>
          <span style={{ position: "absolute", left: 10, top: -22, fontSize: 18 }}>🏁</span>
          <div style={{ position: "absolute", left: 22, top: 0, bottom: 0, width: 3, background: "repeating-linear-gradient(180deg, #fff 0 6px, #111 6px 12px)" }} />
          {lanes.map((l, i) => (
            <div key={i} style={{ position: "relative", flex: 1, borderTop: i ? "1px dashed rgba(255,255,255,.45)" : "none" }}>
              <span style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", fontSize: 10.5, fontWeight: 700, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,.7)", maxWidth: "24%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.label}</span>
              <span style={{ position: "absolute", top: "50%", left: `${(0.7 - 0.6 * Math.max(0, Math.min(1, l.progress))) * 100}%`, transform: "translate(-50%,-50%)", transition: "left 1.2s cubic-bezier(.3,1.2,.5,1)", fontSize: 21, opacity: l.loser ? 0.45 : 1 }}>
                <span className="gs-anim" style={{ display: "inline-block", animation: l.loser ? "none" : "gs-gallop .45s ease-in-out infinite" }}>
                  {l.emoji === "🏎️" && l.color ? <StockCar color={l.color} number={l.number ?? i + 1} /> :
                   l.emoji === "🔵" && l.color ? <Marble color={l.color} /> :
                   l.emoji === "🦆" && l.color ? <RubberDuck color={l.color} /> :
                   l.emoji === "⛵" && l.color ? <PaperBoat color={l.color} /> :
                   <span style={{ position: "relative", display: "inline-block" }}>{l.emoji}
                     {l.color && <b style={{ position: "absolute", right: -9, bottom: -2, minWidth: 14, height: 14, borderRadius: 7, background: l.color, color: textOn(l.color), border: "1.5px solid #fff", fontSize: 9, lineHeight: "11px", textAlign: "center", fontFamily: "Arial, sans-serif" }}>{l.number ?? i + 1}</b>}
                   </span>}
                </span>
                {l.winner && <span style={{ position: "absolute", top: -14, left: 2, fontSize: 13 }}>👑</span>}
              </span>
            </div>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}

/** A ring that drains as time runs out; red for the last 5 seconds. */
export function CountdownRing({ msLeft, totalMs, size = 44 }: { msLeft: number; totalMs: number; size?: number }) {
  const r = size / 2 - 4; const c = 2 * Math.PI * r;
  const frac = totalMs > 0 ? Math.max(0, Math.min(1, msLeft / totalMs)) : 0;
  const secs = Math.ceil(msLeft / 1000);
  const late = msLeft < 5000;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="gs-anim" style={{ flex: "none", animation: late && msLeft > 0 ? "gs-shake .3s linear infinite" : "none" }}>
      <circle cx={size / 2} cy={size / 2} r={r + 2} fill="rgba(0,0,0,.55)" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.25)" strokeWidth={4} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke={late ? "#E5484D" : "#F0C420"} strokeWidth={4} fill="none" strokeLinecap="round"
              strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dashoffset .25s linear" }} />
      <text x="50%" y="50%" dy=".35em" textAnchor="middle" fill="#fff" fontSize={secs > 99 ? 11 : 15} fontWeight={800}>{secs > 99 ? `${Math.floor(secs / 60)}m` : secs}</text>
    </svg>
  );
}

/** Confetti that falls once each time `burst` changes (0 = none). */
export function Confetti({ burst }: { burst: number }) {
  useKeyframes();
  const [pieces, setPieces] = useState<{ id: number; left: number; delay: number; color: string; dur: number }[]>([]);
  useEffect(() => {
    if (!burst) return;
    const colors = ["#F0C420", "#2FBF5B", "#E5484D", "#49A8FF", "#D4537E", "#B36BFF"];
    setPieces(Array.from({ length: 46 }, (_, i) => ({ id: burst * 100 + i, left: Math.random() * 100, delay: Math.random() * 0.5, color: colors[i % colors.length], dur: 1.4 + Math.random() * 0.9 })));
    const t = window.setTimeout(() => setPieces([]), 2600);
    return () => window.clearTimeout(t);
  }, [burst]);
  if (!pieces.length) return null;
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 5 }}>
      {pieces.map((p) => (
        <span key={p.id} className="gs-anim" style={{ position: "absolute", top: -20, left: `${p.left}%`, width: 7, height: 11, borderRadius: 2, background: p.color, animation: `gs-fall ${p.dur}s ease-in ${p.delay}s both` }} />
      ))}
    </div>
  );
}

/** 1st in the middle, 2nd left, 3rd right. Names may wrap to two lines. `tie` = a shared first
 *  place: nobody is crowned. */
export function Podium({ rows, tie }: { rows: { name: string; value: string }[]; tie?: boolean }) {
  const order = [rows[1], rows[0], rows[2]];
  const heights = [34, 48, 24];
  const colors = ["#9AA0A6", "#F0C420", "#C77B3B"];
  const medals = ["🥈", "🥇", "🥉"];
  const twoLines: React.CSSProperties = { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere", lineHeight: 1.2 };
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 6, marginTop: 4 }}>
      {order.map((r, i) => r ? (
        <div key={i} style={{ width: 86, textAlign: "center" }}>
          <div style={{ fontSize: i === 1 ? 20 : 16 }}>{i === 1 ? (tie ? "🤝" : "👑") : medals[i]}</div>
          <div style={{ fontSize: 11.5, fontWeight: 700, ...twoLines }}>{podiumName(r.name)}</div>
          <div style={{ fontSize: 10.5, opacity: 0.85, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.value}</div>
          <div style={{ height: heights[i], background: colors[i], borderRadius: "6px 6px 0 0", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#111", fontSize: 15 }}>{i === 1 ? 1 : i === 0 ? 2 : 3}</div>
        </div>
      ) : <div key={i} style={{ width: 86 }} />)}
    </div>
  );
}

/** The phones' scene overlays, drawn over a SceneBanner: a dark chip top-left (whose turn, who is
 *  loudest), chips bottom-right (gold = the important one), and a centred banner that dims the
 *  scene (the result, "Check!"). Above the scene's moving actors, so a rocket never crosses them. */
export function SceneChips({ topLeft, topLeftOffset = 8, bottomRight = [], centre, shake, pop }: {
  topLeft?: string | null; topLeftOffset?: number; bottomRight?: [string, boolean][]; centre?: string | null; shake?: boolean; pop?: boolean;
}) {
  useKeyframes();
  const chip = (gold: boolean): React.CSSProperties => ({ background: gold ? "#F0C420" : "rgba(0,0,0,.63)", color: gold ? "#000" : "#fff", borderRadius: 999, padding: "2px 8px", fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%", boxSizing: "border-box", lineHeight: "15px" });
  return (
    <>
      {topLeft && <span style={{ ...chip(false), position: "absolute", left: topLeftOffset, top: 6, maxWidth: `calc(100% - ${topLeftOffset + 8}px)`, zIndex: 3 }}>{topLeft}</span>}
      {bottomRight.length > 0 && (
        <div style={{ position: "absolute", right: 6, bottom: 5, left: 6, display: "flex", justifyContent: "flex-end", gap: 5, zIndex: 3, minWidth: 0 }}>
          {bottomRight.map(([t, g], i) => <span key={i} style={{ ...chip(g), flex: "0 1 auto", minWidth: 0 }}>{t}</span>)}
        </div>
      )}
      {centre && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(0,0,0,.45)", padding: "0 10px", zIndex: 4 }}>
          <span className="gs-anim" style={{ maxWidth: "100%", boxSizing: "border-box", textAlign: "center", overflowWrap: "anywhere", lineHeight: 1.2, fontSize: 16, fontWeight: 900, color: "#fff", textShadow: "0 2px 4px #000",
                                             animation: shake ? "gs-shake .25s linear infinite" : pop ? "gs-pop .8s ease-in-out 3" : "none" }}>{centre}</span>
        </div>
      )}
    </>
  );
}

export function MuteButton() {
  const [m, setM] = useState(isMuted());
  return (
    <button onClick={() => { setMuted(!m); setM(!m); }} aria-label={m ? "Sound on" : "Sound off"} title={m ? "Sound on" : "Sound off"}
            style={{ background: "none", border: "none", color: gold, fontSize: 15, cursor: "pointer", padding: "0 2px" }}>{m ? "🔇" : "🔊"}</button>
  );
}
