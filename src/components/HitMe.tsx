// Hit Me (Steve, 2026-11-02: "New tap game called "Hit Me" Put the host's avatar on the many balloons while they
// are going up and members hits the avatar. This game will be the first one on top for that host.")
//
// Glossy balloons on strings float UP from the bottom at different speeds and sizes, each one carrying the room
// host's picture. A tap is a hit: the balloon bursts into shards, the host's face squashes with an "OUCH!", and the
// score goes up by one. Paid exactly like every catch game (TapGameOverlay owns the session and the money); this
// file is only the play field and the host's "add your picture" prompt.
import { useEffect, useRef, useState } from "react";
import { API_BASE, currentAuthHeaders, post } from "../lib/api";
import { tt, useT } from "../lib/i18n";
import { haptic, sfx } from "../lib/gameSounds";

/** The Bingg Bongg logo goes on the balloons when the host has no picture. */
export const HIT_ME_LOGO = "/logo_round.png";

// Steve, 2026-11-02: "with neon colors to stand out" — hot pink, electric blue, neon green, neon yellow, neon orange,
// neon purple.
const COLORS = ["#FF2BD6", "#00E5FF", "#39FF14", "#FFF01F", "#FF6B00", "#B026FF"];
/** Steve, 2026-11-02: "The balloons are round? please make them oval." The element is 1.9 x its width: a 1 : 1.28
 *  body, then the knot and the string. */
const TALL = 1.9;
const MAX_ON_SCREEN = 9;
const SPAWN_MS = 430;
const OUCH_WORDS_KEY = "hm_ouch" as const;

interface Balloon { id: number; x: number; size: number; color: string; riseMs: number; swayMs: number; sway: number; tilt: number }
interface Burst { id: number; x: number; y: number; size: number; color: string; streak: number }

export function HitMeField({ avatarUrl, playing, onHit }: { avatarUrl: string | null; playing: boolean; onHit: () => void }) {
  const { t } = useT();
  const areaRef = useRef<HTMLDivElement>(null);
  const [balloons, setBalloons] = useState<Balloon[]>([]);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const nextId = useRef(1);
  const streak = useRef(0);
  const lastHitAt = useRef(0);
  const [img, setImg] = useState<string>(avatarUrl || HIT_ME_LOGO);
  useEffect(() => { setImg(avatarUrl || HIT_ME_LOGO); }, [avatarUrl]);

  useEffect(() => {
    if (!playing) { setBalloons([]); return; }
    const spawn = () => {
      const area = areaRef.current;
      if (!area) return;
      const w = area.clientWidth;
      // Bigger on a big screen, never so small that a thumb misses: 22-34% of the width, capped.
      const size = Math.round(Math.min(150, Math.max(70, w * (0.22 + Math.random() * 0.12))));
      setBalloons((prev) => prev.length >= MAX_ON_SCREEN ? prev : [...prev, {
        id: nextId.current++,
        x: Math.random() * Math.max(0, w - size),
        size,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        // Smaller balloons rise a little faster, so the size is part of the challenge.
        riseMs: Math.round(3600 + Math.random() * 2600 + (size - 70) * 12),
        swayMs: Math.round(1300 + Math.random() * 900),
        sway: Math.round(10 + Math.random() * 16),
        tilt: Math.round(-6 + Math.random() * 12),
      }]);
    };
    spawn();
    const timer = setInterval(spawn, SPAWN_MS);
    return () => clearInterval(timer);
  }, [playing]);

  function hit(b: Balloon, el: HTMLElement) {
    if (!playing) return;
    const area = areaRef.current;
    const r = el.getBoundingClientRect();
    const a = area?.getBoundingClientRect();
    setBalloons((prev) => prev.filter((x) => x.id !== b.id));
    const now = Date.now();
    streak.current = now - lastHitAt.current < 1200 ? streak.current + 1 : 1;
    lastHitAt.current = now;
    const burst: Burst = { id: b.id, x: r.left - (a?.left ?? 0) + r.width / 2, y: r.top - (a?.top ?? 0) + b.size * 0.6, size: b.size, color: b.color, streak: streak.current };
    setBursts((prev) => [...prev, burst]);
    setTimeout(() => setBursts((prev) => prev.filter((x) => x.id !== burst.id)), 900);
    sfx.hitPop();
    haptic(25);
    onHit();
  }

  return (
    <div ref={areaRef} style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {/* Every neon halo is its own layer UNDER all the balloons, riding the same rise and sway: a glow drawn as part
          of a balloon would tint the face of any balloon behind it. Mounted with its balloon, so the animations match. */}
      {balloons.map((b) => (
        <div key={`g${b.id}`} data-hm={b.id} aria-hidden style={{
          position: "absolute", left: b.x, top: "100%", width: b.size, height: b.size * TALL, pointerEvents: "none",
          animation: `hm-rise ${b.riseMs}ms linear forwards`,
        }}>
          <div style={{ width: "100%", height: "100%", animation: `hm-sway ${b.swayMs}ms ease-in-out infinite alternate`, ["--hm-sway" as string]: `${b.sway}px`, ["--hm-tilt" as string]: `${b.tilt}deg` }}>
            <div style={{
              position: "absolute", left: -b.size * 0.45, top: b.size * 0.64 - b.size * 0.92, width: b.size * 1.9, height: b.size * 1.84,
              borderRadius: "50%", background: `radial-gradient(closest-side, ${b.color}99 55%, ${b.color}00 100%)`,
            }} />
          </div>
        </div>
      ))}
      {balloons.map((b) => (
        <button
          key={b.id}
          data-hm={b.id}
          aria-label={t("hm_hit_label")}
          onPointerDown={(e) => { e.preventDefault(); hit(b, e.currentTarget); }}
          onAnimationEnd={(e) => { if (e.target === e.currentTarget) setBalloons((prev) => prev.filter((x) => x.id !== b.id)); }}
          style={{
            position: "absolute", left: b.x, top: "100%", width: b.size, height: b.size * TALL,
            padding: 0, border: "none", background: "transparent", cursor: "pointer", touchAction: "manipulation",
            animation: `hm-rise ${b.riseMs}ms linear forwards`,
          }}
        >
          <div style={{ width: "100%", height: "100%", animation: `hm-sway ${b.swayMs}ms ease-in-out infinite alternate`, ["--hm-sway" as string]: `${b.sway}px`, ["--hm-tilt" as string]: `${b.tilt}deg` }}>
            <BalloonArt size={b.size} color={b.color} img={img} onImgError={() => setImg(HIT_ME_LOGO)} />
          </div>
        </button>
      ))}
      {bursts.map((p) => <BurstFx key={p.id} p={p} img={img} ouch={t(OUCH_WORDS_KEY)} />)}
    </div>
  );
}

/** One glossy neon balloon: an oval body (1 : 1.28) with a highlight and a darker underside, a soft neon glow, the
 *  host's picture in a ring of the balloon's own colour, a knot and a curly string. SVG + one <img>, crisp at any size. */
function BalloonArt({ size, color, img, onImgError }: { size: number; color: string; img: string; onImgError: () => void }) {
  const gid = `hmg-${color.slice(1)}`;
  const face = size * 0.62;
  const ring = Math.max(3, size * 0.05);
  return (
    <div style={{ position: "relative", width: size, height: size * TALL }}>
      <svg width={size} height={size * TALL} viewBox="0 0 100 190" style={{
        position: "absolute", inset: 0, overflow: "visible",
        // A tight neon edge glow; the wide halo is the separate layer under all the balloons (see HitMeField).
        filter: `drop-shadow(0 0 ${Math.round(size * 0.04)}px ${color})`,
      }}>
        <defs>
          <radialGradient id={gid} cx="34%" cy="26%" r="82%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity=".95" />
            <stop offset="16%" stopColor={color} />
            <stop offset="55%" stopColor={color} />
            <stop offset="100%" stopColor={shade(color, -38)} />
          </radialGradient>
        </defs>
        {/* string: a loose S-curve hanging from the knot */}
        <path d="M50 128 C 40 142, 60 154, 48 168 S 56 182, 50 190" fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="1.6" strokeLinecap="round" />
        {/* body: 92 wide, 118 tall */}
        <path d="M50 4 C 82 4, 97 32, 96 60 C 95 94, 72 116, 54 122 L 46 122 C 28 116, 5 94, 4 60 C 3 32, 18 4, 50 4 Z" fill={`url(#${gid})`} />
        {/* knot */}
        <path d="M44 121 L56 121 L52 130 L48 130 Z" fill={shade(color, -30)} />
        {/* gloss */}
        <ellipse cx="28" cy="30" rx="10" ry="18" fill="rgba(255,255,255,.55)" transform="rotate(-24 28 30)" />
      </svg>
      <img src={img} alt="" draggable={false} onError={onImgError}
        style={{
          position: "absolute", left: (size - face) / 2 - ring, top: size * 0.6 - face / 2 - ring, width: face + ring * 2, height: face + ring * 2,
          boxSizing: "border-box", maxWidth: "none",
          borderRadius: "50%", objectFit: "cover", border: `${ring}px solid ${color}`,
          boxShadow: `0 0 0 1.5px ${shade(color, -55)}, 0 2px 6px rgba(0,0,0,.3)`, background: "#000", pointerEvents: "none",
        }} />
      {/* the gloss again, over the photo, so the picture looks printed ON the balloon */}
      <div style={{ position: "absolute", left: size * 0.18, top: size * 0.16, width: size * 0.2, height: size * 0.34, borderRadius: "50%", background: "rgba(255,255,255,.28)", transform: "rotate(-24deg)", pointerEvents: "none" }} />
    </div>
  );
}

/** The hit: shards of the balloon flying out, the host's face squashed with an OUCH!, +1, and a combo count. */
function BurstFx({ p, img, ouch }: { p: Burst; img: string; ouch: string }) {
  const face = p.size * 0.62;
  const shards = Array.from({ length: 12 }, (_, i) => {
    const ang = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
    const dist = p.size * (0.55 + Math.random() * 0.45);
    return { dx: Math.cos(ang) * dist, dy: Math.sin(ang) * dist, rot: Math.round(Math.random() * 360), w: 6 + Math.random() * 8 };
  });
  return (
    <div style={{ position: "absolute", left: p.x, top: p.y, width: 0, height: 0, pointerEvents: "none", zIndex: 3 }}>
      {shards.map((s, i) => (
        <span key={i} style={{
          position: "absolute", left: -s.w / 2, top: -s.w / 2, width: s.w, height: s.w * 0.6, borderRadius: 3,
          background: i % 4 === 0 ? "#fff" : p.color, ["--dx" as string]: `${s.dx}px`, ["--dy" as string]: `${s.dy}px`, ["--rot" as string]: `${s.rot}deg`,
          animation: "hm-shard 620ms cubic-bezier(.15,.8,.3,1) forwards",
        }} />
      ))}
      <span style={{ position: "absolute", left: -p.size * 0.55, top: -p.size * 0.55, width: p.size * 1.1, height: p.size * 1.1, borderRadius: "50%",
        border: `3px solid ${p.color}`, animation: "hm-ring 420ms ease-out forwards" }} />
      <img src={img} alt="" style={{
        position: "absolute", left: -face / 2, top: -face / 2, width: face, height: face, borderRadius: "50%", objectFit: "cover",
        border: `${Math.max(3, p.size * 0.05)}px solid ${p.color}`, background: "#000", animation: "hm-ouch 820ms ease-out forwards",
        // The site-wide img { max-width: 100% } would squeeze it to nothing inside this zero-width anchor.
        maxWidth: "none",
      }} />
      {/* dizzy stars circling the squashed face */}
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ position: "absolute", left: -10, top: -12, fontSize: Math.max(14, p.size * 0.16), ["--a" as string]: `${i * 120}deg`, ["--r" as string]: `${face * 0.62}px`,
          animation: "hm-star 820ms linear forwards" }}>⭐</span>
      ))}
      <b style={{ position: "absolute", left: 0, top: -face / 2 - 14, transform: "translateX(-50%)", whiteSpace: "nowrap", fontSize: Math.max(18, p.size * 0.24),
        color: "#fff", WebkitTextStroke: "1.5px #C2185B", textShadow: "0 3px 0 #C2185B, 0 4px 10px rgba(0,0,0,.4)", fontWeight: 900, animation: "hm-word 820ms ease-out forwards" }}>
        {ouch}
      </b>
      <b style={{ position: "absolute", left: face * 0.35, top: face * 0.1, color: "#FFD21F", fontSize: Math.max(16, p.size * 0.2), fontWeight: 900,
        textShadow: "0 2px 0 #000, 0 0 8px rgba(0,0,0,.5)", animation: "hm-plus 820ms ease-out forwards" }}>+1</b>
      {p.streak >= 3 && (
        <b style={{ position: "absolute", left: -40, width: 80, textAlign: "center", top: face * 0.55, whiteSpace: "nowrap", color: "#FFD21F", fontSize: 15, fontWeight: 900,
          textShadow: "0 2px 0 #000", animation: "hm-plus 820ms ease-out forwards" }}>🔥 x{p.streak}</b>
      )}
    </div>
  );
}

function shade(hex: string, pct: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (c * pct) / 100)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/** True when this member has a real profile picture (not empty, not the bare CDN root an empty path turns into). */
export function hasProfilePicture(profileImage?: string | null): boolean {
  const v = (profileImage ?? "").trim();
  return v !== "" && !/\/$/.test(v);
}

/** Steve, 2026-11-02: "When ever the host is trying to play the hit me game, if they don't have an image/picture on
 *  their avatar, Please suggest in a popup please add your image to the avatar and give them a button "Add Your
 *  Picture" so he can click and search his image folder."
 *
 *  Uses the routes every other profile picture already goes through — uploadFileToS3 (which runs the same Hive and
 *  PhotoDNA check as any image) and then updateUserDetails(profile_image), which moderates it again on the way in.
 *  Resolves with the new picture's path, or null when the host chose "Not now". */
export function AddPicturePopup({ userId, onDone }: { userId: number; onDone: (path: string | null) => void }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    if (!file.type.startsWith("image/")) { setError(tt("hm_pic_failed")); return; }
    setBusy(true); setError(null);
    setPreview(URL.createObjectURL(file));
    try {
      const form = new FormData();
      form.append("user_id", String(userId));
      form.append("file", file);
      const res = await fetch(API_BASE + "uploadFileToS3", { method: "POST", headers: currentAuthHeaders(), body: form });
      const body = await res.json() as { status?: boolean; message?: string; path?: string };
      if (!body.status || !body.path) throw new Error(body.message || tt("hm_pic_failed"));
      const saved = await post("updateUserDetails", { user_id: userId, profile_image: body.path });
      if (!saved.status) throw new Error(saved.message || tt("hm_pic_failed"));
      onDone(body.path);
    } catch (e) {
      setError((e as Error).message || tt("hm_pic_failed"));
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div className="card pad" style={{ maxWidth: 400, width: "100%", textAlign: "center", background: "#000", borderColor: "var(--gold-border)" }}>
        <div style={{ position: "relative", width: 96, height: 96, margin: "4px auto 12px" }}>
          <img src={preview || HIT_ME_LOGO} alt="" style={{ width: 96, height: 96, borderRadius: "50%", objectFit: "cover", border: "3px solid var(--gold-border)" }} />
          <span style={{ position: "absolute", right: -6, bottom: -2, fontSize: 30 }}>🎈</span>
        </div>
        <b style={{ color: "var(--gold)", fontSize: 18 }}>{t("hm_add_pic_title")}</b>
        <p style={{ margin: "10px 0 16px", color: "#fff", fontSize: 15 }}>{t("hm_add_pic_body")}</p>
        {error && <p style={{ margin: "0 0 12px", color: "var(--red)", fontSize: 13 }}>{error}</p>}
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
        <button className="btn block" disabled={busy} onClick={() => fileRef.current?.click()}
          style={{ background: "var(--gold-border)", color: "#000", borderColor: "var(--gold-border)", fontWeight: 800 }} autoFocus>
          {busy ? t("hm_uploading") : t("hm_add_pic_button")}
        </button>
        <button className="btn ghost block" style={{ marginTop: 8 }} disabled={busy} onClick={() => onDone(null)}>{t("hm_not_now")}</button>
      </div>
    </div>
  );
}
