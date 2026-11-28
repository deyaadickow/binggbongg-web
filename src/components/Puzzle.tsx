// Bingg Bongg Puzzle (Steve, 2026-11-28): "Pieces pop up at random on ANY page; tap it like the
// Golden Nugget." Mounted ONCE in App.tsx (next to GoldDiggerManager): the roll timer (visible
// tab + any signed-in member, verified or not), the piece drawn over whatever page is on screen, and
// the catch popup — varied lines from the server, "only N left to find", the free FBB milestone,
// Share ("I found #742!"), Send to a friend (a repeat), Watch the video, My Puzzle, OK.
//
// The server decides everything that matters (whether a piece drops, which item, new or repeat,
// the FBBs). Nothing here can make a piece appear or pick which one it is.
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSession } from "../lib/session";
import { mediaUrl } from "../lib/api";
import { useT } from "../lib/i18n";
import { haptic, sfx } from "../lib/gameSounds";
import { Confetti } from "./GameShow";
import {
  emitPuzzleCatch, puzzleClaim, puzzleContext, puzzleRoll, puzzleVideoPath, PZ_COLORS,
  type PzCatch, type PzDrop, type PzItem,
} from "../lib/puzzle";
import { carrierReady, preloadCarrier, PuzzleCarrierPiece } from "./PuzzleCarrier";

const KEYFRAMES = `
@keyframes pz-pop{0%{transform:scale(0) rotate(-40deg)}60%{transform:scale(1.2) rotate(8deg)}80%{transform:scale(.95)}100%{transform:scale(1) rotate(0)}}
@keyframes pz-float{0%,100%{transform:translateY(0) rotate(-6deg)}50%{transform:translateY(-8px) rotate(6deg)}}
@keyframes pz-fade{from{opacity:1}to{opacity:0;transform:scale(.6) rotate(30deg)}}
@keyframes pz-halo{0%,100%{opacity:.7;transform:scale(1)}50%{opacity:1;transform:scale(1.1)}}
@keyframes pz-tap{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}
@keyframes pz-in{from{transform:translateY(24px) scale(.92);opacity:0}to{transform:none;opacity:1}}
@keyframes pz-shine{0%{transform:translateX(-120%) rotate(20deg)}100%{transform:translateX(220%) rotate(20deg)}}
@media (prefers-reduced-motion: reduce){.pz-anim{animation:none!important}}`;
let injected = false;
function usePzKeyframes() {
  useEffect(() => {
    if (injected) return;
    injected = true;
    const s = document.createElement("style");
    s.textContent = KEYFRAMES;
    document.head.appendChild(s);
  }, []);
}

let seq = 0;
/** A glossy jigsaw piece (two knobs out, one socket in) with a "?" — pure SVG. */
export function PuzzlePieceArt({ size = 72, color = "gold", mark = "?" }: { size?: number; color?: string; mark?: string }) {
  const [id] = useState(() => `pzp${++seq}`);
  const [hi, mid, lo] = PZ_COLORS[color] ?? PZ_COLORS.gold;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={hi} />
          <stop offset="45%" stopColor={mid} />
          <stop offset="100%" stopColor={lo} />
        </linearGradient>
        <radialGradient id={`${id}h`} cx="35%" cy="25%" r="45%">
          <stop offset="0%" stopColor="#fff" stopOpacity=".85" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="52" cy="92" rx="30" ry="5" fill="#000" opacity=".4" />
      <path
        d="M18 22 H40 C40 14 44 8 50 8 C56 8 60 14 60 22 H80 V44 C88 44 94 48 94 54 C94 60 88 64 80 64 V84 H60 C60 78 56 74 50 74 C44 74 40 78 40 84 H18 V64 C24 64 28 60 28 54 C28 48 24 44 18 44 Z"
        fill={`url(#${id}g)`} stroke={lo} strokeWidth="2.5" strokeLinejoin="round"
      />
      <path
        d="M18 22 H40 C40 14 44 8 50 8 C56 8 60 14 60 22 H80 V44 C88 44 94 48 94 54 C94 60 88 64 80 64 V84 H60 C60 78 56 74 50 74 C44 74 40 78 40 84 H18 V64 C24 64 28 60 28 54 C28 48 24 44 18 44 Z"
        fill={`url(#${id}h)`}
      />
      <text x="50" y="62" textAnchor="middle" fontSize="34" fontWeight="900" fill="#fff" stroke={lo} strokeWidth="2" paintOrder="stroke" fontFamily="system-ui, sans-serif">{mark}</text>
    </svg>
  );
}

/** The item's picture: the photo (thumb or full), else its emoji. */
export function PuzzleItemPicture({ item, size = 56, full = false, dim = false }: { item: PzItem; size?: number; full?: boolean; dim?: boolean }) {
  const [broken, setBroken] = useState(false);
  const raw = full ? item.image ?? item.thumb : item.thumb ?? item.image;
  const src = raw ? mediaUrl(raw) : null;
  return (
    <span style={{
      width: size, height: size, flex: "none", borderRadius: Math.round(size * 0.18), background: "#fff",
      display: "inline-flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
      filter: dim ? "grayscale(1) opacity(.45)" : undefined,
    }}>
      {src && !broken
        ? <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        : <span style={{ fontSize: Math.round(size * 0.62), lineHeight: 1 }}>{item.emoji}</span>}
    </span>
  );
}

type Shown = PzDrop & { x: number; y: number; key: number; carried: boolean };
type Toast = { text: string; key: number };
const PX = 76;

export function PuzzleManager() {
  usePzKeyframes();
  const { t, lang } = useT();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, isLoggedIn } = useSession();
  // Everyone signed in plays, verified email or not (Steve, 2026-11-28: "Let everyone play the Puzzle, verified or not.").
  const userId = isLoggedIn ? user?.id ?? 0 : 0;

  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const [piece, setPiece] = useState<Shown | null>(null);
  const pieceRef = useRef<Shown | null>(null);
  pieceRef.current = piece;
  const [caught, setCaught] = useState<PzCatch | null>(null);
  const caughtRef = useRef<PzCatch | null>(null);
  caughtRef.current = caught;
  const [toast, setToast] = useState<Toast | null>(null);
  const [confetti, setConfetti] = useState(0);
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);
  const nextAt = useRef(0);
  const hideTimer = useRef(0);
  const busy = useRef(false);
  const k = useRef(0);

  const hide = useCallback(() => { window.clearTimeout(hideTimer.current); setPiece(null); }, []);

  const show = useCallback(async (drop: PzDrop) => {
    if (pieceRef.current || caughtRef.current || document.hidden) return;
    // Its carrier (a horse, a parrot, a rocket…) if its picture is ready within a moment, else the plain piece.
    const asked = Date.now();
    const carried = !!drop.carrier && await carrierReady(drop.carrier.file, 2500);
    if (pieceRef.current || caughtRef.current || document.hidden) return;
    // Time spent waiting comes off the trip, so the token never runs out on screen.
    drop = { ...drop, seconds: Math.max(3, (drop.seconds || 8) - Math.floor((Date.now() - asked) / 1000)) };
    const w = window.innerWidth, h = window.innerHeight;
    const x = 16 + Math.random() * Math.max(0, w - PX - 32);
    const top = h * 0.15, bottom = h * 0.78 - PX - 24;
    const y = top + Math.random() * Math.max(0, bottom - top);
    const shown = { ...drop, x, y, key: ++k.current, carried };
    setPiece(shown);
    sfx.reveal();
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setPiece((p) => (p && p.key === shown.key ? null : p)), Math.max(2, shown.seconds || 8) * 1000);
  }, []);

  const rollRef = useRef<(fromTimer: boolean) => Promise<void>>(async () => undefined);
  rollRef.current = async (fromTimer: boolean) => {
    if (!userId) return;
    if (busy.current || pieceRef.current || caughtRef.current) { if (fromTimer) schedule(8000); return; }
    busy.current = true;
    try {
      const r = await puzzleRoll(userId, puzzleContext(pathRef.current));
      if (fromTimer) schedule(Math.max(10, Number(r?.next_in ?? (r && !r.enabled ? 900 : 75))) * 1000);
      if (r?.preload) void preloadCarrier(r.preload);
      if (r?.drop?.token) void show(r.drop);
    } catch {
      if (fromTimer) schedule(120_000);
    } finally {
      busy.current = false;
    }
  };
  function schedule(ms: number) {
    window.clearTimeout(timer.current);
    nextAt.current = Date.now() + ms;
    timer.current = window.setTimeout(() => { if (!document.hidden) void rollRef.current(true); }, ms);
  }

  useEffect(() => {
    if (!userId) return;
    // DEV ONLY (the explainer video kit): ask now instead of waiting for the timer. Never in a build.
    if (import.meta.env.DEV) (window as unknown as { __pzRoll?: () => void }).__pzRoll = () => { void rollRef.current(false); };
    schedule(20_000);   // a little after the Golden Nuggets' first look, never on top of it
    const onVis = () => {
      if (document.hidden) { window.clearTimeout(timer.current); hide(); }
      else schedule(Math.max(4000, nextAt.current - Date.now()));
    };
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); window.clearTimeout(timer.current); hide(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  async function tap(p: Shown) {
    hide();
    haptic(25);
    const res = await puzzleClaim(userId, p.token, lang);
    if (res.ok) {
      const d = res.data;
      if (d.milestone || d.completed) { sfx.fanfare(); setConfetti((c) => c + 1); }
      else if (d.is_new) { sfx.correct(); setConfetti((c) => c + 1); }
      else sfx.sparkle();
      setCopied(false);
      setCaught(d);
      emitPuzzleCatch();
    } else {
      sfx.nope();
      setToast({ text: res.message || t("pz_load_failed"), key: Date.now() });
      window.setTimeout(() => setToast((x) => (x && Date.now() - x.key > 3500 ? null : x)), 4000);
    }
  }

  function close() { setCaught(null); }
  function go(path: string) { setCaught(null); navigate(path); }

  async function share(d: PzCatch) {
    const line = t("pz_share_line", d.item.no, d.item.name, d.found.toLocaleString());
    const url = "https://www.binggbongg.com/puzzle";
    try {
      if (navigator.share) { await navigator.share({ title: t("pz_share_card", d.item.no), text: line, url }); return; }
    } catch { /* cancelled */ }
    try { await navigator.clipboard.writeText(`${line} ${url}`); setCopied(true); } catch { /* ignore */ }
  }

  if (!userId && !caught && !toast) return null;
  const video = caught ? puzzleVideoPath(caught.video_play_id) : null;
  return (
    <>
      {piece && piece.carried && piece.carrier && (
        <PuzzleCarrierPiece
          key={piece.key}
          carrier={piece.carrier}
          color={piece.color}
          seconds={Math.max(2, piece.seconds || 8)}
          label={t("pz_piece_label")}
          tapLabel={t("pz_tap")}
          onTap={() => void tap(piece)}
        />
      )}
      {piece && !piece.carried && (
        <button
          key={piece.key}
          type="button"
          aria-label={t("pz_piece_label")}
          data-testid="puzzle-piece"
          onClick={() => void tap(piece)}
          style={{
            position: "fixed", left: piece.x, top: piece.y, zIndex: 9003, width: PX, padding: 0, border: 0,
            background: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <span className="pz-anim" style={{
            display: "block", position: "relative",
            animation: `pz-pop .45s ease-out both, pz-fade .6s ease-in ${Math.max(0.5, (piece.seconds || 8) - 0.6)}s forwards`,
          }}>
            <span className="pz-anim" aria-hidden style={{
              position: "absolute", inset: "-30%", borderRadius: "50%",
              background: "radial-gradient(circle, rgba(255,255,255,.45) 0%, rgba(0,0,0,.55) 45%, rgba(0,0,0,0) 70%)",
              animation: "pz-halo 1.2s ease-in-out infinite",
            }} />
            <span className="pz-anim" style={{ display: "block", position: "relative", animation: "pz-float 1.5s ease-in-out .45s infinite" }}>
              <PuzzlePieceArt size={PX} color={piece.color} />
            </span>
          </span>
          <span className="pz-anim" style={{
            marginTop: 2, background: "rgba(0,0,0,.85)", color: "#FFDD55", border: "1px solid #D4AF37", borderRadius: 999,
            padding: "1px 9px", fontSize: 11, fontWeight: 900, letterSpacing: ".06em", animation: "pz-tap .8s ease-in-out infinite",
          }}>{t("pz_tap")}</span>
        </button>
      )}

      {confetti > 0 && caught && (
        <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 9005, pointerEvents: "none" }}>
          <Confetti burst={confetti} />
        </div>
      )}

      {caught && (
        <div role="dialog" aria-modal="true" onClick={close} style={{
          position: "fixed", inset: 0, zIndex: 9004, background: "rgba(0,0,0,.72)", display: "flex",
          alignItems: "center", justifyContent: "center", padding: 16,
        }}>
          <div className="pz-anim" data-testid="puzzle-catch" onClick={(e) => e.stopPropagation()} style={{
            width: "min(420px, 100%)", maxHeight: "calc(100vh - 32px)", overflowY: "auto", background: "#000",
            border: "2px solid #F0C420", borderRadius: 22, padding: "18px 18px 16px", textAlign: "center", color: "#fff",
            boxShadow: "0 10px 40px rgba(0,0,0,.7), 0 0 24px rgba(240,196,32,.35)", animation: "pz-in .28s ease-out both",
          }}>
            <div style={{
              display: "inline-block", borderRadius: 999, padding: "4px 14px", fontWeight: 900, fontSize: 14, letterSpacing: ".05em",
              background: caught.is_new ? "linear-gradient(90deg,#FFE066,#F0C420)" : "#1d1d1d",
              color: caught.is_new ? "#000" : "#FFDD55", border: caught.is_new ? "none" : "1.5px solid #D4AF37",
            }}>{caught.is_new ? t("pz_new_badge") : t("pz_repeat_badge")}</div>

            {/* The share card: picture, number, name — "I found #742!" */}
            <div style={{
              position: "relative", overflow: "hidden", margin: "14px auto 10px", width: "min(260px, 80%)",
              borderRadius: 18, border: "2px solid #D4AF37", background: "#fff", padding: "12px 12px 10px",
            }}>
              <div style={{ display: "flex", justifyContent: "center" }}><PuzzleItemPicture item={caught.item} size={170} full /></div>
              <div style={{ color: "#000", fontWeight: 900, fontSize: 26, marginTop: 4 }}>#{caught.item.no}</div>
              <div style={{ color: "#333", fontWeight: 800, fontSize: 16 }}>{caught.item.name}</div>
              {caught.is_new && <span aria-hidden className="pz-anim" style={{
                position: "absolute", top: 0, left: 0, width: "40%", height: "100%",
                background: "linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.7), rgba(255,255,255,0))",
                animation: "pz-shine 1.4s ease-out .3s 1 both",
              }} />}
            </div>

            <div style={{ color: "#FFDD55", fontWeight: 900, fontSize: "clamp(18px, 5vw, 21px)", lineHeight: 1.3 }}>{caught.headline}</div>
            {caught.left_line && <div style={{ color: "#fff", fontWeight: 800, fontSize: 17, marginTop: 6 }}>{caught.left_line}</div>}
            <div style={{ height: 8, background: "#222", borderRadius: 99, margin: "12px 8px 2px", overflow: "hidden" }}>
              <div style={{ width: `${Math.min(100, (caught.found / caught.total) * 100)}%`, minWidth: 4, height: "100%", background: "linear-gradient(90deg,#FFE066,#F0C420)" }} />
            </div>
            <div style={{ color: "rgba(255,255,255,.75)", fontSize: 13 }}>{t("pz_progress", caught.found.toLocaleString(), caught.total.toLocaleString())}</div>

            {caught.milestone && (
              <div style={{ marginTop: 12, borderRadius: 14, padding: "10px 12px", background: "linear-gradient(90deg,#FFE066,#F0C420)", color: "#000", fontWeight: 900, fontSize: 17 }}>
                🎉 {caught.milestone.line}
              </div>
            )}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 14 }}>
              {caught.is_new && (
                <button type="button" className="btn gold" onClick={() => void share(caught)}>{copied ? t("pz_copied") : `📤 ${t("pz_share")}`}</button>
              )}
              {!caught.is_new && caught.spares > 0 && (
                <button type="button" className="btn gold" onClick={() => go(`/puzzle?send=${caught.item.no}`)}>🎁 {t("pz_send_friend")}</button>
              )}
              <button type="button" className="btn" onClick={() => go(`/puzzle?item=${caught.item.no}`)}>🧩 {t("pz_open_puzzle")}</button>
            </div>
            {video && (
              <button type="button" onClick={() => go(video)} style={{
                marginTop: 12, background: "none", border: 0, color: "#FFDD55", fontWeight: 800, fontSize: 15,
                textDecoration: "underline", cursor: "pointer",
              }}>▶ {t("pz_watch_video")}</button>
            )}
            <div>
              <button type="button" data-testid="puzzle-ok" onClick={close} style={{
                marginTop: 12, minWidth: 120, background: "linear-gradient(180deg,#FFE066,#F0C420 55%,#C9971A)", color: "#000",
                border: "1px solid #FFDD55", borderRadius: 12, padding: "10px 22px", fontWeight: 900, fontSize: 17, cursor: "pointer",
              }}>{t("pz_ok")}</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div key={toast.key} role="status" onClick={() => setToast(null)} style={{
          position: "fixed", left: "50%", bottom: 96, zIndex: 9004, transform: "translateX(-50%)",
          maxWidth: "min(520px, calc(100vw - 32px))", width: "max-content", background: "#000", color: "#fff",
          border: "2px solid #D4AF37", borderRadius: 16, padding: "12px 16px", fontWeight: 800, fontSize: 17,
        }}>🧩 {toast.text}</div>
      )}
    </>
  );
}
