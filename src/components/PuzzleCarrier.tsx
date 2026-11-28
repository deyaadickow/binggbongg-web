// Bingg Bongg Puzzle carriers (Steve, 2026-11-28: "Please create things like this moving horse for our puzzle game.
// I think that would look really nice."). The piece now arrives on a small animated carrier — a galloping horse, a
// parrot, a rocket, a hot-air balloon, a paper plane… — that travels across the screen while it lasts. The server
// picks the carrier (drop.carrier) and names the NEXT one in every answer (preload) so its picture is usually cached
// before it is needed. If a carrier picture does not load within 2.5 s, the plain floating piece shows instead.
//
// The same path maths lives in Android (Puzzle.kt CarrierPath) and iOS (Puzzle.swift CarrierPath) — keep them alike.
import { useEffect, useRef, useState } from "react";
import { mediaUrl } from "../lib/api";
import type { PzCarrier } from "../lib/puzzle";
import { PuzzlePieceArt } from "./Puzzle";

const loaded = new Set<string>();
const loading = new Map<string, Promise<boolean>>();

/** Starts fetching a carrier picture (the browser keeps it in its cache). */
export function preloadCarrier(file?: string | null): Promise<boolean> {
  if (!file) return Promise.resolve(false);
  const url = mediaUrl(file);
  if (loaded.has(url)) return Promise.resolve(true);
  const had = loading.get(url);
  if (had) return had;
  const p = new Promise<boolean>((resolve) => {
    const img = new Image();
    img.onload = () => { loaded.add(url); loading.delete(url); resolve(true); };
    img.onerror = () => { loading.delete(url); resolve(false); };
    img.src = url;
  });
  loading.set(url, p);
  return p;
}

/** True once the picture is ready, false if it failed or took longer than `ms`. */
export function carrierReady(file: string, ms: number): Promise<boolean> {
  return Promise.race([preloadCarrier(file), new Promise<boolean>((r) => window.setTimeout(() => r(false), ms))]);
}

export interface CarrierTrip {
  dir: 1 | -1;
  y0: number;
  y1: number;
  phase: number;
  /** Reduced motion: the spot it bobs on. */
  x: number;
}

/** Random choices for one trip, made once when the piece appears. */
export function planTrip(motion: string, w: number, h: number, cw: number, ch: number, top: number): CarrierTrip {
  const yTop = Math.max(top + 8, h * 0.12);
  const yBottom = Math.max(yTop, h * 0.78 - ch - 22);
  const span = yBottom - yTop;
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  let y0: number, y1: number;
  switch (motion) {
    case "ground": y0 = y1 = yTop + span * rnd(0.35, 1); break;
    case "leap": y0 = y1 = yTop + span * rnd(0.6, 1); break;
    case "float": {
      const up = Math.random() < 0.5;
      y0 = yTop + span * (up ? rnd(0.6, 1) : rnd(0, 0.4));
      y1 = yTop + span * (up ? rnd(0, 0.4) : rnd(0.6, 1));
      break;
    }
    default: y0 = yTop + span * rnd(0, 1); y1 = yTop + span * rnd(0, 1);
  }
  return { dir: Math.random() < 0.5 ? 1 : -1, y0, y1, phase: rnd(0, Math.PI * 2), x: rnd(16, Math.max(16, w - cw - 16)) };
}

/** Where the carrier's top-left is at `t` seconds of `secs`. */
export function tripAt(trip: CarrierTrip, motion: string, t: number, secs: number, w: number, h: number, cw: number, ch: number, top: number, still: boolean) {
  const yTop = Math.max(top + 8, h * 0.12);
  const yBottom = Math.max(yTop, h * 0.78 - ch - 22);
  if (still) return { x: trip.x, y: Math.min(yBottom, Math.max(yTop, trip.y0)) + Math.sin(t * Math.PI) * 4 };
  const u = Math.min(1, Math.max(0, t / secs));
  const from = trip.dir > 0 ? -0.35 * cw : w - 0.65 * cw;
  const to = trip.dir > 0 ? w - 0.65 * cw : -0.35 * cw;
  const x = from + (to - from) * u;
  const base = trip.y0 + (trip.y1 - trip.y0) * u;
  let y: number;
  switch (motion) {
    case "ground": y = base - Math.abs(Math.sin(t * 9)) * 2; break;
    case "leap": y = base - Math.abs(Math.sin(Math.PI * u * 3)) * h * 0.1; break;
    case "float": y = base + Math.sin(t * 2 + trip.phase) * 6; break;
    default: y = base + Math.sin(Math.PI * 2 * u * 1.5 + trip.phase) * h * 0.06;
  }
  return { x, y: Math.min(yBottom, Math.max(yTop - 4, y)) };
}

/** The piece's size (px) for this carrier: about the sign it is held by, never tiny, never huge. */
export function carrierPieceSize(c: PzCarrier): number {
  const s = c.anchors.find((a) => a)?.[2] ?? 0.2;
  return Math.max(42, Math.min(62, (s * c.h * 1.3) / 0.62));
}

const PILL = 20;

export function PuzzleCarrierPiece({ carrier, color, seconds, label, tapLabel, onTap }: {
  carrier: PzCarrier; color: string; seconds: number; label: string; tapLabel: string; onTap: () => void;
}) {
  const ch = carrier.h;
  const cw = (ch * carrier.fw) / carrier.fh;
  const ps = carrierPieceSize(carrier);
  const still = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [trip] = useState(() => planTrip(carrier.motion, window.innerWidth, window.innerHeight, cw, ch, 0));
  const box = useRef<HTMLButtonElement>(null);
  const sprite = useRef<HTMLSpanElement>(null);
  const piece = useRef<HTMLSpanElement>(null);
  const url = mediaUrl(carrier.file);

  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = (now - start) / 1000;
      const w = window.innerWidth, h = window.innerHeight;
      const p = tripAt(trip, carrier.motion, t, seconds, w, h, cw, ch, 0, !!still);
      const i = still ? 0 : Math.floor(t * carrier.fps) % carrier.frames;
      const left = seconds - t;
      const fade = left < 0.6 ? Math.max(0, left / 0.6) : Math.min(1, t / 0.25);
      if (box.current) {
        box.current.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
        box.current.style.opacity = String(fade);
      }
      if (sprite.current) sprite.current.style.backgroundPosition = `${-i * cw}px 0`;
      const a = carrier.anchors[i] ?? carrier.anchors.find((x) => x);
      if (piece.current && a) {
        const ax = (trip.dir > 0 ? a[0] : 1 - a[0]) * cw;
        const ay = a[1] * ch;
        const ang = trip.dir > 0 ? a[3] : -a[3];
        piece.current.style.transform = `translate(${ax - 0.49 * ps}px, ${ay - 0.53 * ps}px) rotate(${ang}deg)`;
      }
      if (left > 0) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [trip, carrier, cw, ch, ps, seconds, still]);

  return (
    <button
      ref={box}
      type="button"
      aria-label={label}
      data-testid="puzzle-piece"
      data-carrier={carrier.id}
      onClick={onTap}
      style={{
        position: "fixed", left: 0, top: 0, zIndex: 9003, width: cw, height: ch + PILL, padding: 0, border: 0,
        background: "none", cursor: "pointer", WebkitTapHighlightColor: "transparent", opacity: 0, willChange: "transform",
      }}
    >
      <span ref={sprite} aria-hidden style={{
        position: "absolute", left: 0, top: 0, width: cw, height: ch,
        backgroundImage: `url("${url}")`, backgroundRepeat: "no-repeat",
        backgroundSize: `${cw * carrier.frames}px ${ch}px`, backgroundPosition: "0 0",
        transform: trip.dir < 0 ? "scaleX(-1)" : undefined,
      }} />
      <span ref={piece} aria-hidden style={{ position: "absolute", left: 0, top: 0, width: ps, height: ps, transformOrigin: "49% 53%" }}>
        <PuzzlePieceArt size={ps} color={color} />
      </span>
      <span className="pz-anim" style={{
        position: "absolute", left: "50%", top: ch + 2, transform: "translateX(-50%)",
        background: "rgba(0,0,0,.85)", color: "#FFDD55", border: "1px solid #D4AF37", borderRadius: 999,
        padding: "1px 9px", fontSize: 11, fontWeight: 900, letterSpacing: ".06em", whiteSpace: "nowrap",
      }}>{tapLabel}</span>
    </button>
  );
}
