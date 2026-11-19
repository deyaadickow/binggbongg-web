// Gold Digger (Steve, 2026-11-17): "World wide Gold diggers. When you see gold click it and it's
// yours." / "Find gold where ever you are on the app. On any page on any live stream, on any battle,
// at any time."
//
// Three things live here:
//   GoldNugget          the drawn nugget — a lumpy gold rock with shading, highlights and a twinkle
//   GoldDiggerManager   ONE app-wide manager, mounted once in App.tsx above every route: the roll
//                       timer (visible tab + signed in only), the extra chances (rollGoldNow), and
//                       the nugget drawn over whatever page is on screen
//   GoldDiggerBadge     the profile pill for a member who finished a month in the top 3
//
// The server decides everything that matters (whether gold drops, how big, how many grams, the
// daily cap). Nothing here can make gold appear or change its weight.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "../lib/session";
import { useT } from "../lib/i18n";
import { haptic, sfx } from "../lib/gameSounds";
import { Confetti } from "./GameShow";
import {
  contextForPath, goldDiggerClaim, goldDiggerRoll, setGoldRoller, MEDALS,
  type GdBadge, type GdContext, type GdDrop, type GdSize,
} from "../lib/goldDigger";

const KEYFRAMES = `
@keyframes gd-pop{0%{transform:scale(0) rotate(-25deg)}60%{transform:scale(1.18) rotate(6deg)}80%{transform:scale(.94)}100%{transform:scale(1) rotate(0)}}
@keyframes gd-bob{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-7px) rotate(3deg)}}
@keyframes gd-twinkle{0%,100%{opacity:0;transform:scale(.3) rotate(0)}45%{opacity:1;transform:scale(1) rotate(45deg)}70%{opacity:.2;transform:scale(.5) rotate(70deg)}}
@keyframes gd-fade{from{opacity:1}to{opacity:0;transform:scale(.7)}}
@keyframes gd-halo{0%,100%{opacity:.75;transform:scale(1)}50%{opacity:1;transform:scale(1.08)}}
@keyframes gd-spark{0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(var(--dx),var(--dy)) scale(.2);opacity:0}}
@keyframes gd-rise{0%{transform:translate(-50%,0) scale(.6);opacity:0}15%{transform:translate(-50%,-10px) scale(1.15);opacity:1}100%{transform:translate(-50%,-90px) scale(1);opacity:0}}
@keyframes gd-toast{from{transform:translate(-50%,16px);opacity:0}to{transform:translate(-50%,0);opacity:1}}
@keyframes gd-tap{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}
@media (prefers-reduced-motion: reduce){.gd-anim{animation:none!important}}`;
let injected = false;
function useGdKeyframes() {
  useEffect(() => {
    if (injected) return;
    injected = true;
    const s = document.createElement("style");
    s.textContent = KEYFRAMES;
    document.head.appendChild(s);
  }, []);
}

const PX: Record<GdSize, number> = { small: 56, big: 80, giant: 120 };

let gradSeq = 0;
/** The nugget itself: a lumpy rock in five golds, two darker facets, bright highlights, and a
 *  four-point twinkle. Pure SVG — crisp at every size, no image to load. */
export function GoldNugget({ size = 56, twinkle = true }: { size?: number; twinkle?: boolean }) {
  useGdKeyframes();
  const [id] = useState(() => `gdn${++gradSeq}`);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ display: "block", overflow: "visible" }}>
      <defs>
        <radialGradient id={`${id}b`} cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#FFF6B8" />
          <stop offset="22%" stopColor="#FFE066" />
          <stop offset="52%" stopColor="#F0C420" />
          <stop offset="80%" stopColor="#C08A12" />
          <stop offset="100%" stopColor="#7A5200" />
        </radialGradient>
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#B07A08" stopOpacity="0" />
          <stop offset="100%" stopColor="#6B4500" stopOpacity="0.85" />
        </linearGradient>
        <radialGradient id={`${id}h`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* ground shadow */}
      <ellipse cx="52" cy="86" rx="34" ry="6" fill="#000" opacity="0.45" />
      {/* the rock */}
      <path
        d="M22 52 C16 40 24 26 36 24 C42 15 58 14 64 22 C76 20 86 30 84 42 C92 50 88 66 78 70 C74 80 60 84 50 80 C40 86 24 80 22 70 C12 66 14 56 22 52 Z"
        fill={`url(#${id}b)`} stroke="#5C3D00" strokeWidth="2" strokeLinejoin="round"
      />
      {/* darker facets and dents give it weight */}
      <path d="M58 78 C66 74 76 70 80 60 C84 66 78 72 74 74 C70 80 62 82 58 78 Z" fill={`url(#${id}f)`} />
      <path d="M24 66 C30 70 36 72 42 78 C34 80 26 76 24 70 Z" fill="#7A5200" opacity="0.5" />
      <path d="M48 46 C52 42 58 44 58 50 C54 54 50 52 48 46 Z" fill="#8A5E00" opacity="0.45" />
      <path d="M66 36 C70 34 74 38 72 42 C68 43 66 40 66 36 Z" fill="#8A5E00" opacity="0.4" />
      <path d="M32 56 C35 53 39 55 38 59 C35 61 32 59 32 56 Z" fill="#8A5E00" opacity="0.4" />
      {/* highlights */}
      <ellipse cx="40" cy="34" rx="11" ry="6" fill={`url(#${id}h)`} transform="rotate(-25 40 34)" />
      <ellipse cx="62" cy="28" rx="5" ry="2.5" fill="#fff" opacity="0.7" transform="rotate(-10 62 28)" />
      <circle cx="30" cy="46" r="2.2" fill="#fff" opacity="0.75" />
      <circle cx="74" cy="48" r="1.6" fill="#fff" opacity="0.6" />
      {/* twinkle */}
      {twinkle && (
        <g className="gd-anim" style={{ transformOrigin: "70px 26px", animation: "gd-twinkle 1.6s ease-in-out infinite" }}>
          <path d="M70 12 L73 23 L84 26 L73 29 L70 40 L67 29 L56 26 L67 23 Z" fill="#fff" />
        </g>
      )}
    </svg>
  );
}

type Shown = GdDrop & { x: number; y: number; px: number; key: number };
type Burst = { x: number; y: number; grams: number; size: GdSize; key: number };
type Toast = { text: string; ok: boolean; key: number; quip?: string };

/** Mounted ONCE (App.tsx). Runs only while a signed-in, verified member has the tab visible. */
export function GoldDiggerManager() {
  useGdKeyframes();
  const { t, lang } = useT();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, isLoggedIn } = useSession();
  // Keyed on the id, never the user object (binggbongg-web-session-user-identity-trap).
  const userId = isLoggedIn && user?.needs_email_verification !== true ? user?.id ?? 0 : 0;

  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const [nugget, setNugget] = useState<Shown | null>(null);
  const nuggetRef = useRef<Shown | null>(null);
  nuggetRef.current = nugget;
  const [burst, setBurst] = useState<Burst | null>(null);
  const [confetti, setConfetti] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef(0);
  const nextAt = useRef(0);
  const hideTimer = useRef(0);
  const busy = useRef(false);
  const seq = useRef(0);

  const hide = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    setNugget(null);
  }, []);

  const show = useCallback((drop: GdDrop) => {
    if (nuggetRef.current || document.hidden) return; // one nugget at a time
    const px = PX[drop.size] ?? 56;
    const w = window.innerWidth, h = window.innerHeight;
    // Away from the top ~15 % (header) and bottom ~20 % (bars, gift row, comments).
    const x = 16 + Math.random() * Math.max(0, w - px - 32);
    const top = h * 0.15, bottom = h * 0.8 - px - 22;
    const y = top + Math.random() * Math.max(0, bottom - top);
    const shown = { ...drop, x, y, px, key: ++seq.current };
    setNugget(shown);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setNugget((n) => (n && n.key === shown.key ? null : n)), Math.max(1, shown.seconds || 4) * 1000);
  }, []);

  const roll = useCallback(async (context: GdContext, refId?: number | string | null, fromTimer = false) => {
    if (!userId) return;
    if (busy.current || nuggetRef.current) {
      if (fromTimer) schedule(5000);
      return;
    }
    busy.current = true;
    try {
      const r = await goldDiggerRoll(userId, context, refId);
      if (fromTimer) schedule(Math.max(5, Number(r?.next_in ?? (r && !r.enabled ? 600 : 45))) * 1000);
      if (r?.drop?.token) show(r.drop);
    } catch {
      if (fromTimer) schedule(60_000);
    } finally {
      busy.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, show]);

  const rollRef = useRef(roll);
  rollRef.current = roll;
  function schedule(ms: number) {
    window.clearTimeout(timer.current);
    nextAt.current = Date.now() + ms;
    timer.current = window.setTimeout(() => {
      if (document.hidden) return; // the visibility handler picks it up again
      void rollRef.current(contextForPath(pathRef.current), null, true);
    }, ms);
  }

  // The roll timer: starts a few seconds after sign-in, pauses while the tab is hidden.
  useEffect(() => {
    if (!userId) return;
    schedule(8000);
    setGoldRoller((context, refId) => { if (!document.hidden) void rollRef.current(context, refId); });
    const onVis = () => {
      if (document.hidden) {
        window.clearTimeout(timer.current);
        hide();
      } else {
        schedule(Math.max(3000, nextAt.current - Date.now()));
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearTimeout(timer.current);
      setGoldRoller(null);
      hide();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  // Steve, 2026-11-18: "the banner appears and disappears before i can read what it says. please
  // add a small 'OK' on it for a member to click for it to disappear." — no auto-hide any more; the
  // banner stays until the member taps OK (a new catch replaces it).
  const say = useCallback((text: string, ok: boolean, quip?: string) => {
    setToast({ text, ok, key: Date.now(), quip: quip || undefined });
  }, []);

  async function tap(n: Shown) {
    hide();
    haptic(25);
    const res = await goldDiggerClaim(userId, n.token, lang);
    if (res.ok) {
      const g = res.data.grams;
      if (n.size === "giant") { sfx.fanfare(); setConfetti((c) => c + 1); }
      else if (n.size === "big") sfx.correct();
      else sfx.sparkle();
      setBurst({ x: n.x + n.px / 2, y: n.y + n.px / 2, grams: g, size: n.size, key: n.key });
      window.setTimeout(() => setBurst((b) => (b && b.key === n.key ? null : b)), 1600);
      // Steve, 2026-11-18: bigger text + "make this game more fun with different words" — the
      // server's headline and cheeky line (older servers send neither: the old text is kept).
      say(res.data.headline || (res.data.rank > 0
        ? t("gd_toast_found", g, res.data.month_grams, res.data.rank)
        : t("gd_toast_found_norank", g, res.data.month_grams)), true, res.data.quip);
    } else {
      sfx.nope();
      say(res.message || (res.reason === "capped" ? t("gd_capped", 100) : t("gd_too_slow")), false);
    }
  }

  if (!userId && !toast) return null;
  return (
    <>
      {nugget && (
        <button
          key={nugget.key}
          type="button"
          aria-label={t("gd_nugget_label")}
          onClick={() => void tap(nugget)}
          style={{
            position: "fixed", left: nugget.x, top: nugget.y, zIndex: 9000,
            width: nugget.px, padding: 0, border: 0, background: "none", cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <span className="gd-anim" style={{
            display: "block", position: "relative",
            animation: `gd-pop .45s ease-out both, gd-fade .5s ease-in ${Math.max(0.5, (nugget.seconds || 4) - 0.5)}s forwards`,
          }}>
            {/* the dark halo keeps it readable on any background; giant adds a gold glow */}
            <span className="gd-anim" aria-hidden style={{
              position: "absolute", inset: nugget.size === "giant" ? "-38%" : "-26%", borderRadius: "50%",
              background: nugget.size === "giant"
                ? "radial-gradient(circle, rgba(255,214,64,.55) 0%, rgba(240,196,32,.25) 35%, rgba(0,0,0,.55) 60%, rgba(0,0,0,0) 72%)"
                : "radial-gradient(circle, rgba(0,0,0,.62) 0%, rgba(0,0,0,.4) 50%, rgba(0,0,0,0) 70%)",
              animation: "gd-halo 1.2s ease-in-out infinite",
            }} />
            <span className="gd-anim" style={{ display: "block", position: "relative", animation: "gd-bob 1.4s ease-in-out .45s infinite" }}>
              <GoldNugget size={nugget.px} />
              {nugget.size !== "small" && <Sparkles count={nugget.size === "giant" ? 8 : 5} radius={nugget.px * 0.62} />}
            </span>
          </span>
          {nugget.size === "giant" && (
            <span style={{
              position: "absolute", top: -26, left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap",
              background: "#000", color: "#FFDD55", border: "2px solid #F0C420", borderRadius: 999,
              padding: "2px 10px", fontWeight: 900, fontSize: 13, textShadow: "0 0 6px rgba(240,196,32,.8)",
            }}>{t("gd_big_nugget")}</span>
          )}
          <span className="gd-anim" style={{
            marginTop: 2, background: "rgba(0,0,0,.82)", color: "#FFDD55", border: "1px solid #D4AF37",
            borderRadius: 999, padding: "1px 8px", fontSize: 11, fontWeight: 900, letterSpacing: ".06em",
            animation: "gd-tap .8s ease-in-out infinite",
          }}>{t("gd_tap")}</span>
        </button>
      )}

      {burst && (
        <div key={burst.key} aria-hidden style={{ position: "fixed", left: burst.x, top: burst.y, zIndex: 9001, pointerEvents: "none" }}>
          {Array.from({ length: burst.size === "small" ? 12 : 20 }, (_, i) => {
            const a = (i / (burst.size === "small" ? 12 : 20)) * Math.PI * 2;
            const d = (burst.size === "small" ? 46 : 78) * (0.7 + ((i * 37) % 10) / 20);
            return (
              <span key={i} className="gd-anim" style={{
                position: "absolute", left: -4, top: -4, width: 8, height: 8, borderRadius: i % 3 ? "50%" : 2,
                background: i % 4 === 0 ? "#fff" : i % 2 ? "#FFDD55" : "#F0C420", boxShadow: "0 0 6px #F0C420",
                ["--dx" as string]: `${Math.cos(a) * d}px`, ["--dy" as string]: `${Math.sin(a) * d}px`,
                animation: `gd-spark .9s ease-out ${(i % 3) * 0.04}s both`,
              } as React.CSSProperties} />
            );
          })}
          <span className="gd-anim" style={{
            position: "absolute", left: 0, top: -20, whiteSpace: "nowrap",
            color: "#FFDD55", fontWeight: 900, fontSize: burst.size === "giant" ? 34 : 26,
            WebkitTextStroke: "1px #5C3D00", textShadow: "0 2px 0 #000, 0 0 12px rgba(240,196,32,.9)",
            animation: "gd-rise 1.5s ease-out both",
          }}>{t("gd_plus_grams", burst.grams)}</span>
        </div>
      )}

      {confetti > 0 && (
        <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 9001, pointerEvents: "none" }}>
          <Confetti burst={confetti} />
        </div>
      )}

      {toast && (
        <div
          key={toast.key}
          role="status"
          className="gd-anim"
          style={{
            position: "fixed", left: "50%", bottom: 96, zIndex: 9002, transform: "translateX(-50%)",
            maxWidth: "min(560px, calc(100vw - 32px))", width: "max-content",
            background: "#000", color: toast.ok ? "#FFDD55" : "#fff", border: `2px solid ${toast.ok ? "#F0C420" : "#D4AF37"}`,
            borderRadius: 16, padding: "14px 14px 14px 18px", fontWeight: 900, fontSize: 20, lineHeight: 1.3,
            boxShadow: "0 6px 24px rgba(0,0,0,.6), 0 0 14px rgba(240,196,32,.35)",
            display: "flex", alignItems: "center", gap: 10, textAlign: "left",
            animation: "gd-toast .25s ease-out both",
          }}
        >
          {/* The message still opens the Gold Digger board on a catch; OK just closes the banner. */}
          <span
            onClick={toast.ok ? () => { setToast(null); navigate("/gold-digger"); } : undefined}
            style={{ display: "flex", alignItems: "center", gap: 10, cursor: toast.ok ? "pointer" : "default", minWidth: 0 }}
          >
            {toast.ok && <GoldNugget size={40} twinkle={false} />}
            <span style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
              <span style={{ textShadow: "0 1px 4px #000", fontSize: "clamp(17px, 4.9vw, 20px)" }}>{toast.text}</span>
              {toast.quip && <span style={{ color: "#fff", fontSize: 17, fontWeight: 800, lineHeight: 1.35 }}>{toast.quip}</span>}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setToast(null)}
            style={{
              flex: "none", background: "linear-gradient(180deg,#FFE066,#F0C420 55%,#C9971A)", color: "#000",
              border: "1px solid #FFDD55", borderRadius: 10, padding: "8px 16px", fontWeight: 900, fontSize: 16,
              lineHeight: 1.2, cursor: "pointer", boxShadow: "0 0 8px rgba(240,196,32,.45)",
            }}
          >{t("ok")}</button>
        </div>
      )}
    </>
  );
}

function Sparkles({ count, radius }: { count: number; radius: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2 - Math.PI / 2;
        return (
          <span key={i} className="gd-anim" aria-hidden style={{
            position: "absolute", left: `calc(50% + ${Math.cos(a) * radius}px - 6px)`, top: `calc(50% + ${Math.sin(a) * radius}px - 6px)`,
            width: 12, height: 12, color: "#FFF6B8", fontSize: 12, lineHeight: "12px", textAlign: "center",
            textShadow: "0 0 6px #F0C420", animation: `gd-twinkle 1.3s ease-in-out ${(i * 0.17).toFixed(2)}s infinite`,
          }}>✦</span>
        );
      })}
    </>
  );
}

/** "⛏️ Gold Digger 🥇 October 2026" (+ "×N" with more than one) — opens the board. */
export function GoldDiggerBadge({ badges }: { badges?: GdBadge[] | null }) {
  const { t } = useT();
  if (!Array.isArray(badges) || badges.length === 0) return null;
  const b = badges[0];
  return (
    <Link
      to="/gold-digger"
      title={t("gd_title")}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4, height: 26, padding: "0 10px", borderRadius: 26,
        border: "2px solid var(--gold)", background: "#000", color: "var(--gold)", fontWeight: 800, fontSize: 12,
        whiteSpace: "nowrap", textDecoration: "none", flex: "0 0 auto",
      }}
    >
      {t("gd_badge", MEDALS[(b.place || 1) - 1] ?? "🏅", b.month_label)}
      {badges.length > 1 && <span style={{ opacity: 0.85 }}>{t("gd_badge_more", badges.length)}</span>}
    </Link>
  );
}
