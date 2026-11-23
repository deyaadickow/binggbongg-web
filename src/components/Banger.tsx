// Bingg Bongg Banger (Steve, 2026-11-23) — the host's setup sheet, the board everyone in the room sees,
// the host's game loop and the viewers' booster bar. Rules: lib/banger.ts (= backend docs/banger_contract.md).
//
// The board is ONE canvas: our own pieces drawn as vectors (gold coin, Bingg Bongg mark, heart, star,
// crown, gem), a glowing gold line while the host drags, pops + sparks on a clear, pieces falling in,
// a shake for a Bomb and a rainbow sweep for a Color Blast. Viewers get the same animations from the
// pushed board (seq + last_path), so the whole room sees every move land.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Confetti, MuteButton, Podium } from "./GameShow";
import { sfx, useStopGameSoundsOnUnmount } from "../lib/gameSounds";
import { useT } from "../lib/i18n";
import {
  BOOSTER_ICON, CELLS, COLS, LAST_CHANCE_MS, NOT_ENOUGH_COINS, ROWS,
  blastCells, bombCells, clearAndFall, dropFor, endBanger, hasMove, idx, lineScore, newBoard, newRng, parseBoard,
  pushBanger, rc, shuffle, toPath, touching, wordFor,
  type Banger, type BoostResult, type BoosterKind, type Rng, type WordKey,
} from "../lib/banger";

const gold = "var(--gold, #F0C420)";
const GOLD = "#F0C420";
/** Piece colours (contract): coin, mark, heart, star, crown, gem. */
export const PIECE_COLORS = ["#FFC83D", "#F0C420", "#FF3B5C", "#2E9BFF", "#B026FF", "#39D98A"];

// ---- Drawing the pieces --------------------------------------------------------------------

let logoImg: HTMLImageElement | null = null;
function logo(): HTMLImageElement | null {
  if (typeof Image === "undefined") return null;
  if (!logoImg) { logoImg = new Image(); logoImg.src = "/logo_round.png"; }
  return logoImg.complete && logoImg.naturalWidth > 0 ? logoImg : null;
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, ro: number, ri: number, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? ro : ri;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const x = cx + r * Math.cos(a); const y = cy + r * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function shine(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.13, cy - s * 0.17, s * 0.11, s * 0.06, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** One piece centred at (cx, cy) in a cell of size s. */
export function drawPiece(ctx: CanvasRenderingContext2D, kind: number, cx: number, cy: number, s: number) {
  const r = s * 0.4;
  ctx.save();
  ctx.lineJoin = "round";
  switch (kind) {
    case 0: { // gold coin with "BB"
      const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
      g.addColorStop(0, "#FFF1B0"); g.addColorStop(0.55, "#FFC83D"); g.addColorStop(1, "#C98A00");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = s * 0.05; ctx.strokeStyle = "#8A5A00"; ctx.stroke();
      ctx.lineWidth = s * 0.025; ctx.strokeStyle = "rgba(138,90,0,.6)"; ctx.beginPath(); ctx.arc(cx, cy, r * 0.74, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "#7A4E00"; ctx.font = `900 ${Math.round(s * 0.3)}px system-ui, sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("BB", cx, cy + s * 0.01);
      break;
    }
    case 1: { // Bingg Bongg mark: black disc, gold ring, our gold wordmark
      ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      const img = logo();
      if (img) {
        ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r * 0.92, 0, Math.PI * 2); ctx.clip();
        const w = r * 2.2; ctx.drawImage(img, cx - w / 2, cy - w / 2, w, w); ctx.restore();
      } else {
        ctx.fillStyle = GOLD; ctx.font = `italic 900 ${Math.round(s * 0.42)}px Georgia, serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("B", cx, cy);
      }
      const ring = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      ring.addColorStop(0, "#FFE58A"); ring.addColorStop(0.5, "#C9961A"); ring.addColorStop(1, "#FFE58A");
      ctx.lineWidth = s * 0.07; ctx.strokeStyle = ring; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 2: { // heart
      const w = r * 1.05;
      ctx.beginPath();
      ctx.moveTo(cx, cy + w * 0.9);
      ctx.bezierCurveTo(cx - w * 1.25, cy + w * 0.05, cx - w * 0.85, cy - w * 1.0, cx, cy - w * 0.38);
      ctx.bezierCurveTo(cx + w * 0.85, cy - w * 1.0, cx + w * 1.25, cy + w * 0.05, cx, cy + w * 0.9);
      ctx.closePath();
      const g = ctx.createLinearGradient(cx, cy - w, cx, cy + w);
      g.addColorStop(0, "#FF7A93"); g.addColorStop(1, "#D5153C");
      ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = s * 0.035; ctx.strokeStyle = "#8E0B26"; ctx.stroke();
      shine(ctx, cx - s * 0.02, cy, s);
      break;
    }
    case 3: { // star
      star(ctx, cx, cy + s * 0.02, r * 1.12, r * 0.5);
      const g = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
      g.addColorStop(0, "#8FD0FF"); g.addColorStop(1, "#1C6FD1");
      ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = s * 0.035; ctx.strokeStyle = "#0B3F80"; ctx.stroke();
      shine(ctx, cx + s * 0.04, cy + s * 0.04, s);
      break;
    }
    case 4: { // crown
      const w = r * 1.1; const top = cy - w * 0.7; const base = cy + w * 0.55;
      ctx.beginPath();
      ctx.moveTo(cx - w, base); ctx.lineTo(cx - w, top + w * 0.35); ctx.lineTo(cx - w * 0.5, cy - w * 0.05);
      ctx.lineTo(cx, top); ctx.lineTo(cx + w * 0.5, cy - w * 0.05); ctx.lineTo(cx + w, top + w * 0.35); ctx.lineTo(cx + w, base);
      ctx.closePath();
      const g = ctx.createLinearGradient(cx, top, cx, base);
      g.addColorStop(0, "#DA8BFF"); g.addColorStop(1, "#7A12C4");
      ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = s * 0.035; ctx.strokeStyle = "#4A0880"; ctx.stroke();
      ctx.fillStyle = "#FFE58A";
      ctx.fillRect(cx - w, base - w * 0.28, w * 2, w * 0.28);
      for (const x of [-w, 0, w]) { ctx.beginPath(); ctx.arc(cx + x, x === 0 ? top : top + w * 0.35, s * 0.05, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    default: { // gem with a flag stripe
      const w = r * 1.05; const top = cy - w * 0.65; const mid = cy - w * 0.15; const bot = cy + w * 0.9;
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.55, top); ctx.lineTo(cx + w * 0.55, top); ctx.lineTo(cx + w, mid); ctx.lineTo(cx, bot); ctx.lineTo(cx - w, mid);
      ctx.closePath();
      const g = ctx.createLinearGradient(cx - w, top, cx + w, bot);
      g.addColorStop(0, "#9CFFD0"); g.addColorStop(0.5, "#39D98A"); g.addColorStop(1, "#0E8A4F");
      ctx.fillStyle = g; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = "rgba(255,255,255,.55)";            // the flag stripe across the gem
      ctx.beginPath(); ctx.moveTo(cx - w, mid + w * 0.05); ctx.lineTo(cx + w, mid - w * 0.35); ctx.lineTo(cx + w, mid - w * 0.12); ctx.lineTo(cx - w, mid + w * 0.28); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.lineWidth = s * 0.03; ctx.strokeStyle = "#075E33";
      ctx.beginPath(); ctx.moveTo(cx - w, mid); ctx.lineTo(cx + w, mid); ctx.moveTo(cx - w * 0.3, top); ctx.lineTo(cx - w * 0.45, mid); ctx.lineTo(cx, bot);
      ctx.moveTo(cx + w * 0.3, top); ctx.lineTo(cx + w * 0.45, mid); ctx.lineTo(cx, bot); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - w * 0.55, top); ctx.lineTo(cx + w * 0.55, top); ctx.lineTo(cx + w, mid); ctx.lineTo(cx, bot); ctx.lineTo(cx - w, mid); ctx.closePath();
      ctx.lineWidth = s * 0.035; ctx.stroke();
    }
  }
  ctx.restore();
}

// ---- The board canvas ----------------------------------------------------------------------

export type BoardAnim = {
  key: number; cleared: number[]; clearedKinds: number[]; drop: number[];
  effect: "line" | "bomb" | "blast" | "shuffle" | null;
};
type Spark = { x: number; y: number; vx: number; vy: number; color: string; born: number; life: number; size: number };

const DROP_MS = 380;

function BangerBoard({ board, anim, interactive, onLine, onDrag, width }: {
  board: number[] | null; anim: BoardAnim | null; interactive: boolean;
  onLine: (cells: number[]) => void; onDrag?: (dragging: boolean) => void; width: number;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const path = useRef<number[]>([]);
  const dragging = useRef(false);
  const sparks = useRef<Spark[]>([]);
  const animStart = useRef(0);
  const lastAnimKey = useRef<number | null>(null);
  const boardRef = useRef(board); boardRef.current = board;
  const animRef = useRef(anim); animRef.current = anim;
  const cell = width / COLS;
  const height = cell * ROWS;

  // A new move: sparks from every cleared cell, the drop clock restarts.
  useEffect(() => {
    if (!anim || anim.key === lastAnimKey.current) return;
    lastAnimKey.current = anim.key;
    const now = performance.now();
    animStart.current = now;
    const many = anim.cleared.length > 20;
    anim.cleared.forEach((i, n) => {
      const [r, c] = rc(i);
      const x = (c + 0.5) * cell; const y = (r + 0.5) * cell;
      const color = anim.effect === "blast" ? `hsl(${(n * 47) % 360} 95% 60%)` : PIECE_COLORS[anim.clearedKinds[n] ?? 0] ?? GOLD;
      for (let k = 0; k < (many ? 5 : 9); k++) {
        const a = Math.random() * Math.PI * 2; const v = (0.06 + Math.random() * 0.16) * cell;
        sparks.current.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.05 * cell, color, born: now, life: 520 + Math.random() * 380, size: cell * (0.05 + Math.random() * 0.07) });
      }
      sparks.current.push({ x, y, vx: 0, vy: 0, color: "#FFFFFF", born: now, life: 260, size: -cell * 0.5 }); // the white pop ring
    });
  }, [anim, cell]);

  // One draw loop for the whole board.
  useEffect(() => {
    const el = canvas.current; if (!el) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    el.width = Math.round(width * dpr); el.height = Math.round(height * dpr);
    const ctx = el.getContext("2d"); if (!ctx) return;
    let raf = 0;
    const draw = () => {
      const now = performance.now();
      const a = animRef.current;
      const t = a ? Math.min(1, (now - animStart.current) / DROP_MS) : 1;
      const ease = 1 - Math.pow(1 - t, 3);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      // Shake for a Bomb.
      const shakeT = a?.effect === "bomb" ? Math.max(0, 1 - (now - animStart.current) / 450) : 0;
      if (shakeT > 0) ctx.translate((Math.random() - 0.5) * cell * 0.25 * shakeT, (Math.random() - 0.5) * cell * 0.25 * shakeT);
      // Cells: dark wells with thin gold borders.
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        ctx.fillStyle = (r + c) % 2 ? "#15110A" : "#1C160C";
        ctx.fillRect(c * cell, r * cell, cell, cell);
      }
      ctx.strokeStyle = "rgba(240,196,32,.28)"; ctx.lineWidth = 1;
      for (let c = 1; c < COLS; c++) { ctx.beginPath(); ctx.moveTo(c * cell, 0); ctx.lineTo(c * cell, height); ctx.stroke(); }
      for (let r = 1; r < ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r * cell); ctx.lineTo(width, r * cell); ctx.stroke(); }
      // Color Blast: a rainbow wash sweeping down the board.
      if (a?.effect === "blast") {
        const p = (now - animStart.current) / 700;
        if (p < 1) {
          const y = p * height * 1.3 - height * 0.15;
          const g = ctx.createLinearGradient(0, y - cell, width, y + cell);
          ["#FF3B5C", "#FFC83D", "#39D98A", "#2E9BFF", "#B026FF"].forEach((col, i) => g.addColorStop(i / 4, col));
          ctx.save(); ctx.globalAlpha = 0.35 * (1 - p); ctx.fillStyle = g; ctx.fillRect(0, y - cell, width, cell * 2); ctx.restore();
        }
      }
      // Pieces (falling into place after a clear; a quick spin-in after a shuffle).
      const b = boardRef.current;
      if (b) {
        const inPath = new Set(path.current);
        const swirl = a?.effect === "shuffle" ? Math.min(1, (now - animStart.current) / 450) : 1;
        for (let i = 0; i < CELLS; i++) {
          const k = b[i]; if (k < 0) continue;
          const [r, c] = rc(i);
          const d = a && t < 1 ? (a.drop[i] ?? 0) * (1 - ease) : 0;
          const cx = (c + 0.5) * cell; const cy = (r + 0.5 - d) * cell;
          if (cy < -cell) continue;
          const lift = inPath.has(i) ? 1.14 : 1;
          ctx.save();
          if (inPath.has(i)) { ctx.shadowColor = GOLD; ctx.shadowBlur = cell * 0.35; }
          if (swirl < 1) { ctx.translate(cx, cy); ctx.rotate((1 - swirl) * Math.PI * 1.5); ctx.scale(0.4 + 0.6 * swirl, 0.4 + 0.6 * swirl); ctx.translate(-cx, -cy); }
          drawPiece(ctx, k, cx, cy, cell * lift);
          ctx.restore();
        }
      }
      // The line being drawn.
      const p = path.current;
      if (p.length > 0) {
        ctx.save();
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.shadowColor = GOLD; ctx.shadowBlur = cell * 0.4;
        ctx.strokeStyle = "rgba(255,229,138,.95)"; ctx.lineWidth = cell * 0.16;
        ctx.beginPath();
        p.forEach((i, n) => { const [r, c] = rc(i); const x = (c + 0.5) * cell; const y = (r + 0.5) * cell; if (n === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
        ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.shadowBlur = 0;
        p.forEach((i) => { const [r, c] = rc(i); ctx.beginPath(); ctx.arc((c + 0.5) * cell, (r + 0.5) * cell, cell * 0.07, 0, Math.PI * 2); ctx.fill(); });
        ctx.font = `900 ${Math.round(cell * 0.34)}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        const [lr, lc] = rc(p[p.length - 1]);
        ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc((lc + 0.85) * cell, (lr + 0.15) * cell, cell * 0.24, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = GOLD; ctx.fillText(String(p.length), (lc + 0.85) * cell, (lr + 0.16) * cell);
        ctx.restore();
      }
      // Sparks and pop rings.
      const keep: Spark[] = [];
      for (const s of sparks.current) {
        const age = now - s.born; if (age > s.life) continue;
        keep.push(s);
        const f = age / s.life;
        ctx.save(); ctx.globalAlpha = 1 - f;
        if (s.size < 0) {
          ctx.strokeStyle = s.color; ctx.lineWidth = 3 * (1 - f);
          ctx.beginPath(); ctx.arc(s.x, s.y, -s.size * (0.4 + f * 0.9), 0, Math.PI * 2); ctx.stroke();
        } else {
          const x = s.x + s.vx * age / 16; const y = s.y + s.vy * age / 16 + 0.0009 * cell * age * age / 16;
          ctx.fillStyle = s.color; star(ctx, x, y, s.size, s.size * 0.45, 4); ctx.fill();
        }
        ctx.restore();
      }
      sparks.current = keep;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [width, height, cell]);

  const cellAt = (e: React.PointerEvent<HTMLCanvasElement>, strict: boolean): number | null => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width * COLS; const y = (e.clientY - rect.top) / rect.height * ROWS;
    const c = Math.floor(x); const r = Math.floor(y);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
    // While dragging, only count the inner part of a cell, so a diagonal doesn't catch a neighbour.
    if (strict && Math.hypot(x - c - 0.5, y - r - 0.5) > 0.42) return null;
    return idx(r, c);
  };

  return (
    <canvas
      ref={canvas}
      style={{ width, height, display: "block", borderRadius: 12, touchAction: "none", cursor: interactive ? "pointer" : "default" }}
      onPointerDown={(e) => {
        if (!interactive || !boardRef.current) return;
        const i = cellAt(e, false); if (i === null) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = true; onDrag?.(true); path.current = [i]; sfx.linkNote(0);
      }}
      onPointerMove={(e) => {
        if (!dragging.current || !boardRef.current) return;
        const i = cellAt(e, true); if (i === null) return;
        const p = path.current; const last = p[p.length - 1];
        if (i === last) return;
        if (p.length >= 2 && i === p[p.length - 2]) { p.pop(); sfx.linkNote(p.length - 1); return; }
        if (p.includes(i) || !touching(last, i) || boardRef.current[i] !== boardRef.current[last]) return;
        p.push(i); sfx.linkNote(p.length - 1);
      }}
      onPointerUp={() => {
        if (!dragging.current) return;
        dragging.current = false; onDrag?.(false);
        const p = path.current; path.current = [];
        if (p.length >= 3) onLine(p); else if (p.length > 0) sfx.nope();
      }}
      onPointerCancel={() => { dragging.current = false; onDrag?.(false); path.current = []; }}
    />
  );
}

// ---- Setup sheet ----------------------------------------------------------------------------

export function BangerStartDialog({ onClose, onStart }: { onClose: () => void; onStart: (limit: "moves" | "time") => Promise<void> }) {
  const { t } = useT();
  const [limit, setLimit] = useState<"moves" | "time">("moves");
  const [busy, setBusy] = useState(false);
  const tile = (on: boolean, color: string): React.CSSProperties => ({
    flex: 1, padding: "16px 8px", borderRadius: 16, cursor: "pointer", color: "#fff", fontWeight: 900, fontSize: 18,
    background: color, border: `3px solid ${on ? "#fff" : "transparent"}`, boxShadow: on ? `0 0 0 3px ${GOLD}` : "0 3px 0 rgba(0,0,0,.35)",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
  });
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 95, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", padding: 12 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(440px, 100%)", boxSizing: "border-box", background: "#000", border: `2px solid ${gold}`,
        borderRadius: 18, padding: 16, color: gold, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <b style={{ flex: 1, fontSize: 20 }}>💥 {t("banger_title")}</b>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: gold, fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <PieceRow />
        <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", textAlign: "center", lineHeight: 1.35 }}>{t("banger_tagline")}</div>
        <div style={{ fontWeight: 800, textAlign: "center" }}>{t("banger_pick_mode")}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={tile(limit === "moves", "#1D9E75")} onClick={() => setLimit("moves")}><span style={{ fontSize: 28 }}>👆</span>{t("banger_moves_mode")}</button>
          <button style={tile(limit === "time", "#378ADD")} onClick={() => setLimit("time")}><span style={{ fontSize: 28 }}>⏱️</span>{t("banger_time_mode")}</button>
        </div>
        <button disabled={busy} onClick={() => { setBusy(true); void onStart(limit).finally(() => setBusy(false)); }}
          style={{ padding: "14px 0", borderRadius: 999, border: "none", background: gold, color: "#000", fontWeight: 900, fontSize: 18, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? "…" : t("banger_start")}
        </button>
      </div>
    </div>
  );
}

function PieceRow({ size = 40 }: { size?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    el.width = size * 6 * dpr; el.height = size * dpr;
    const ctx = el.getContext("2d"); if (!ctx) return;
    const paint = () => { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, size * 6, size); for (let k = 0; k < 6; k++) drawPiece(ctx, k, (k + 0.5) * size, size / 2, size); };
    paint();
    const id = window.setTimeout(paint, 400); // once the logo image has loaded
    return () => window.clearTimeout(id);
  }, [size]);
  return <canvas ref={ref} style={{ width: size * 6, height: size, alignSelf: "center" }} />;
}

// ---- The panel: host game loop + everyone's view --------------------------------------------

type Toast = { id: number; text: string; image: string | null; icon: string };

export function BangerPanel({ game, myUserId, onGame, onBoost, onClose }: {
  game: Banger; myUserId: number | null;
  /** A fresher state from a push / end (the page keeps it). */
  onGame: (g: Banger) => void;
  onBoost: (kind: BoosterKind) => Promise<BoostResult | null>;
  onClose: () => void;
}) {
  useStopGameSoundsOnUnmount();
  const { t } = useT();
  const [collapsed, setCollapsed] = useState(false);
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((n) => n + 1), []);
  const [anim, setAnim] = useState<BoardAnim | null>(null);
  const [word, setWord] = useState<{ key: number; w: WordKey; pts: number } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [burst, setBurst] = useState(0);
  const [needCoins, setNeedCoins] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [boostBusy, setBoostBusy] = useState<BoosterKind | null>(null);
  const isHost = game.is_host && myUserId !== null && myUserId === game.host_user_id;
  // The host plays on a big board; viewers get a smaller one so more of the host's camera shows.
  const width = Math.min(isHost ? 360 : 300, (typeof window !== "undefined" ? window.innerWidth : 400) - 48);
  const over = game.status !== "active";

  const wordText = (w: WordKey) => ({
    nice: t("banger_word_nice"), great: t("banger_word_great"), awesome: t("banger_word_awesome"), banger: t("banger_word_banger"),
    mega: t("banger_word_mega"), reshuffle: t("banger_word_reshuffle"), bomb: `💣 ${t("banger_booster_bomb")}!`,
    blast: `🌈 ${t("banger_booster_blast")}!`, shuffle: `🔀 ${t("banger_booster_shuffle")}!`,
    moves: `➕ ${game.limit_type === "time" ? t("banger_booster_seconds") : t("banger_booster_moves")}!`,
  }[w]);
  const boosterName = (k: BoosterKind) => k === "moves" ? (game.limit_type === "time" ? t("banger_booster_seconds") : t("banger_booster_moves"))
    : k === "shuffle" ? t("banger_booster_shuffle") : k === "bomb" ? t("banger_booster_bomb") : t("banger_booster_blast");

  const playWordSound = (w: WordKey, n: number) => {
    if (w === "bomb") sfx.boom(); else if (w === "blast") sfx.blastSweep();
    else if (w === "shuffle" || w === "reshuffle") sfx.shuffleSwish(); else if (w === "moves") sfx.boosterIn();
    else sfx.bangerClear(n);
  };
  const showWord = (w: WordKey, pts: number) => setWord({ key: Date.now() + Math.random(), w, pts });

  // ---- Booster toasts (everyone, host too) --------------------------------------------------
  const seenBoosters = useRef<Set<number> | null>(null);
  useEffect(() => {
    const ids = game.recent_boosters.map((b) => b.id);
    if (seenBoosters.current === null) { seenBoosters.current = new Set(ids); return; } // don't replay old ones on open
    const fresh = game.recent_boosters.filter((b) => !seenBoosters.current!.has(b.id)).reverse();
    fresh.forEach((b) => {
      seenBoosters.current!.add(b.id);
      const toast: Toast = { id: b.id, text: t("banger_sent", b.name || "—", `${BOOSTER_ICON[b.kind]} ${boosterName(b.kind)}`), image: b.image, icon: BOOSTER_ICON[b.kind] };
      setToasts((l) => [...l.slice(-2), toast]);
      window.setTimeout(() => setToasts((l) => l.filter((x) => x.id !== b.id)), 3200);
    });
    if (fresh.length && !isHost) sfx.boosterIn();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.recent_boosters]);

  // ---- Game over: cheer + confetti once ---------------------------------------------------
  const wasOver = useRef(over);
  useEffect(() => {
    if (!wasOver.current && over) { sfx.fanfare(); setBurst(Date.now()); }
    wasOver.current = over;
  }, [over]);

  // ---- VIEWER: animate each pushed move ------------------------------------------------------
  const viewBoard = useMemo(() => (game.board ? parseBoard(game.board) : null), [game.board]);
  const prevView = useRef<{ seq: number; board: number[] | null }>({ seq: game.seq, board: viewBoard });
  useEffect(() => {
    if (isHost) return;
    const prev = prevView.current;
    if (game.seq > prev.seq && viewBoard) {
      const cells = game.last_path.map(([r, c]) => idx(r, c)).filter((i) => i >= 0 && i < CELLS);
      const w = game.last_word;
      const effect: BoardAnim["effect"] = w === "bomb" ? "bomb" : w === "blast" ? "blast" : w === "shuffle" || w === "reshuffle" ? "shuffle" : cells.length ? "line" : null;
      if (effect) {
        setAnim({ key: Date.now(), cleared: cells, clearedKinds: cells.map((i) => prev.board?.[i] ?? 0), drop: effect === "shuffle" ? new Array(CELLS).fill(0) : dropFor(cells), effect });
      }
      if (w) { playWordSound(w, cells.length); showWord(w, 0); }
    }
    prevView.current = { seq: game.seq, board: viewBoard };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.seq, viewBoard, isHost]);

  // ---- HOST: the game itself -----------------------------------------------------------------
  type HostState = {
    id: number; board: number[]; rng: Rng; score: number; moves: number; combo: number; best: number;
    endsAt: number | null; lastChanceUntil: number | null; ended: boolean;
    applied: Set<number>; queue: { id: number; kind: BoosterKind }[]; nextBoosterAt: number;
    unsentApplied: number[]; lastPath: [number, number][]; lastWord: WordKey | null;
    pushing: boolean; dirty: boolean; failures: number;
  };
  const host = useRef<HostState | null>(null);

  const push = useCallback(async () => {
    const h = host.current; if (!h || !myUserId) return;
    if (h.pushing) { h.dirty = true; return; }
    h.pushing = true; h.dirty = false;
    const applied = h.unsentApplied.slice();
    try {
      const r = await pushBanger(myUserId, h.id, { board: h.board, score: h.score, movesLeft: h.moves, combo: h.combo, bestChain: h.best, lastPath: h.lastPath, lastWord: h.lastWord, applied });
      if (r.ok) h.unsentApplied = h.unsentApplied.filter((x) => !applied.includes(x));
      if (r.code === "game_over") h.ended = true;
      if (r.game) onGame(r.game);
      h.failures = 0;
    } catch { h.dirty = true; h.failures++; } finally {
      h.pushing = false;
      // A dropped connection retries, slower each time (the next move carries the whole board anyway).
      if (h.dirty) window.setTimeout(() => void push(), h.failures ? Math.min(8000, 1000 * h.failures) : 250);
    }
  }, [myUserId, onGame]);

  const finish = useCallback(async (finished: boolean) => {
    const h = host.current; if (!h || h.ended || !myUserId) return;
    h.ended = true; rerender();
    try {
      const r = await endBanger(myUserId, h.id, finished, h.score);
      if (r.game) onGame(r.game);
    } catch {
      // Not ended on the server: let the clock (or the End button) try again shortly.
      window.setTimeout(() => { const hh = host.current; if (hh && hh.id === h.id && game.status === "active") { hh.ended = false; rerender(); } }, 2000);
    }
  }, [myUserId, onGame, rerender]);

  // Set the host's board up once per game (resume from the server's board after a reload).
  if (isHost && (!host.current || host.current.id !== game.banger_id)) {
    const resume = game.board.length === CELLS;
    const rng = newRng(resume ? (game.seed ^ Math.imul(game.seq + 1, 0x9E3779B1)) : game.seed);
    host.current = {
      id: game.banger_id, board: resume ? parseBoard(game.board) : newBoard(rng), rng,
      score: game.score, moves: game.limit_type === "moves" ? game.moves_left : 0, combo: game.combo, best: game.best_chain,
      endsAt: game.limit_type === "time" && game.seconds_left !== null ? Date.now() + game.seconds_left * 1000 : null,
      lastChanceUntil: null, ended: over, applied: new Set(), queue: [], nextBoosterAt: 0,
      unsentApplied: [], lastPath: [], lastWord: null, pushing: false, dirty: false, failures: 0,
    };
    if (!resume && !over) window.setTimeout(() => void push(), 0); // the room sees the board at once
  }

  // Keep the host in step with the server: new boosters to play, the timed game's clock.
  useEffect(() => {
    const h = host.current; if (!isHost || !h || h.id !== game.banger_id) return;
    if (game.status !== "active") { h.ended = true; return; }
    for (const p of game.pending_boosters) {
      if (!h.applied.has(p.id) && !h.queue.some((q) => q.id === p.id)) h.queue.push(p);
    }
    if (game.limit_type === "time" && game.seconds_left !== null) {
      const ends = Date.now() + game.seconds_left * 1000;
      if (h.endsAt === null || Math.abs(ends - h.endsAt) > 1200) h.endsAt = ends;
    }
  }, [game, isHost]);

  const dragBusy = useRef(false);
  const onLine = useCallback((cells: number[]) => {
    const h = host.current; if (!h || h.ended) return;
    if (game.limit_type === "moves" && h.moves <= 0) return;
    const n = cells.length;
    const pts = lineScore(n, h.combo);
    h.combo = n >= 4 ? Math.min(6, h.combo + 1) : 0;
    h.score += pts; h.best = Math.max(h.best, n);
    const kinds = cells.map((i) => h.board[i]);
    const res = clearAndFall(h.board, cells, h.rng);
    h.board = res.board;
    if (game.limit_type === "moves") { h.moves -= 1; if (h.moves === 0) h.lastChanceUntil = Date.now() + LAST_CHANCE_MS; }
    const w = wordFor(n);
    h.lastPath = toPath(cells); h.lastWord = w;
    setAnim({ key: Date.now(), cleared: cells, clearedKinds: kinds, drop: res.drop, effect: "line" });
    playWordSound(w, n); showWord(w, pts);
    void push();
    // No line left anywhere: a free reshuffle once the pieces have landed.
    if (!hasMove(h.board)) {
      window.setTimeout(() => {
        const hh = host.current; if (!hh || hh.ended) return;
        hh.board = shuffle(hh.board, hh.rng); hh.lastPath = []; hh.lastWord = "reshuffle";
        setAnim({ key: Date.now(), cleared: [], clearedKinds: [], drop: new Array(CELLS).fill(0), effect: "shuffle" });
        playWordSound("reshuffle", 0); showWord("reshuffle", 0); void push(); rerender();
      }, 600);
    }
    rerender();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.limit_type, push, rerender]);

  // Host clock: play boosters one at a time, end the game when moves / time run out.
  useEffect(() => {
    if (!isHost) return;
    const id = window.setInterval(() => {
      const h = host.current; if (!h || h.ended) return;
      const now = Date.now();
      if (h.queue.length && now >= h.nextBoosterAt && !dragBusy.current) {
        const b = h.queue.shift()!;
        h.applied.add(b.id); h.unsentApplied.push(b.id); h.nextBoosterAt = now + 800;
        let cells: number[] = []; let effect: BoardAnim["effect"] = null; let pts = 0;
        if (b.kind === "moves") {
          if (game.limit_type === "moves") { h.moves += game.extra_moves || 5; h.lastChanceUntil = null; }
        } else if (b.kind === "shuffle") {
          h.board = shuffle(h.board, h.rng); effect = "shuffle";
        } else {
          cells = b.kind === "bomb" ? bombCells(h.rng) : blastCells(h.board);
          pts = b.kind === "bomb" ? 180 : cells.length * 15;
          effect = b.kind === "bomb" ? "bomb" : "blast";
        }
        const kinds = cells.map((i) => h.board[i]);
        let drop = new Array<number>(CELLS).fill(0);
        if (cells.length) { const res = clearAndFall(h.board, cells, h.rng); h.board = res.board; drop = res.drop; h.score += pts; }
        h.lastPath = toPath(cells); h.lastWord = b.kind;
        if (effect) setAnim({ key: now, cleared: cells, clearedKinds: kinds, drop, effect });
        playWordSound(b.kind, cells.length); showWord(b.kind, pts);
        void push(); rerender();
        return;
      }
      if (game.limit_type === "moves" && h.moves <= 0 && h.lastChanceUntil !== null && now >= h.lastChanceUntil
          && !h.queue.some((q) => q.kind === "moves")) void finish(true);
      if (game.limit_type === "time" && h.endsAt !== null && now >= h.endsAt) void finish(true);
      rerender();
    }, 250);
    return () => window.clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, game.limit_type, game.extra_moves, push, finish, rerender]);

  // Viewers' timed-game clock ticks locally between polls.
  const viewEnds = useRef<number | null>(null);
  useEffect(() => { viewEnds.current = game.seconds_left !== null ? Date.now() + game.seconds_left * 1000 : null; }, [game.seconds_left, game.seq]);
  useEffect(() => {
    if (isHost || game.limit_type !== "time" || over) return;
    const id = window.setInterval(rerender, 500);
    return () => window.clearInterval(id);
  }, [isHost, game.limit_type, over, rerender]);

  // ---- What to show ----------------------------------------------------------------------------
  const h = isHost ? host.current : null;
  const board = h ? h.board : viewBoard;
  const score = h ? h.score : game.score;
  const combo = h ? h.combo : game.combo;
  const movesLeft = h ? h.moves : game.moves_left;
  const endsAt = h ? h.endsAt : viewEnds.current;
  const secondsLeft = endsAt !== null ? Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)) : game.seconds_left ?? 0;
  const lastChance = !!h && !h.ended && game.limit_type === "moves" && h.moves <= 0 && h.lastChanceUntil !== null;
  const viewerLastChance = !isHost && !over && game.limit_type === "moves" && game.moves_left <= 0 && game.seq > 0;
  const interactive = isHost && !over && !(h?.ended) && !(game.limit_type === "moves" && (h?.moves ?? 0) <= 0);
  const best = Math.max(game.host_best, score);
  const bbs = (n: number) => t("banger_bbs", n);

  const stat = (label: string, value: string, hot = false) => (
    <div style={{ flex: 1, minWidth: 0, textAlign: "center", background: "#0D0A04", border: `1px solid ${hot ? "#FF3B5C" : "rgba(240,196,32,.45)"}`, borderRadius: 10, padding: "3px 2px",
                  animation: hot ? "bgr-blink 1s steps(2) infinite" : undefined }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: gold, opacity: 0.85, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 900, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );

  return (
    <div style={{ position: "fixed", top: 84, left: "50%", transform: "translateX(-50%)", zIndex: 87, width: width + 24, boxSizing: "border-box",
                  background: "rgba(0,0,0,.93)", border: `2px solid ${gold}`, borderRadius: 18, padding: 12, color: "#fff", maxHeight: "calc(100vh - 150px)", overflowY: "auto" }}>
      <Confetti burst={burst} />
      <style>{`@keyframes bgr-word{0%{transform:translate(-50%,-50%) scale(.3);opacity:0}18%{transform:translate(-50%,-50%) scale(1.15);opacity:1}70%{transform:translate(-50%,-50%) scale(1);opacity:1}100%{transform:translate(-50%,-70%) scale(1.05);opacity:0}}
@keyframes bgr-toast{0%{transform:translateY(-10px);opacity:0}12%{transform:none;opacity:1}85%{opacity:1}100%{opacity:0}}
@keyframes bgr-blink{0%{border-color:#FF3B5C}50%{border-color:transparent}}`}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <b style={{ color: gold, fontSize: 16, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>💥 {t("banger_title")}</b>
        <MuteButton />
        <button onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? "Expand" : "Collapse"} style={{ background: "none", border: "none", color: gold, fontSize: 20, cursor: "pointer", padding: "0 4px" }}>{collapsed ? "+" : "–"}</button>
        {(over || !isHost) && <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: gold, fontSize: 18, cursor: "pointer" }}>✕</button>}
      </div>

      {!collapsed && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {stat(t("banger_score"), score.toLocaleString())}
            {game.limit_type === "time"
              ? stat(t("banger_time"), `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`, !over && secondsLeft <= 10)
              : stat(t("banger_moves"), String(Math.max(0, movesLeft)), !over && movesLeft <= 5)}
            {stat(t("banger_best"), best.toLocaleString())}
          </div>
          {combo >= 1 && !over && (
            <div style={{ textAlign: "center", fontWeight: 900, color: "#FF8A3D", fontSize: 15 }}>🔥 {t("banger_combo", (1 + 0.5 * combo).toString())}</div>
          )}

          <div style={{ position: "relative", alignSelf: "center", border: `2px solid ${gold}`, borderRadius: 14, padding: 2, background: "#0B0803",
                        boxShadow: "0 0 18px rgba(240,196,32,.25)" }}>
            {board
              ? <BangerBoard board={board} anim={anim} interactive={interactive} width={width - 8}
                  onDrag={(d) => { dragBusy.current = d; }} onLine={onLine} />
              : <div style={{ width: width - 8, height: (width - 8) / COLS * ROWS, display: "grid", placeItems: "center", color: gold, fontWeight: 800 }}>{t("banger_waiting")}</div>}
            {word && (
              <div key={word.key} style={{ position: "absolute", left: "50%", top: "45%", pointerEvents: "none", textAlign: "center", whiteSpace: "nowrap",
                                           animation: "bgr-word 1.3s ease-out forwards" }}>
                <div style={{ fontSize: word.w === "mega" || word.w === "banger" ? 40 : 32, fontWeight: 900, color: word.w === "mega" || word.w === "banger" ? "#FFE58A" : "#fff",
                              textShadow: `0 0 12px ${GOLD}, 0 3px 0 #000, 0 0 2px #000`, letterSpacing: 1 }}>{wordText(word.w)}</div>
                {word.pts > 0 && <div style={{ fontSize: 22, fontWeight: 900, color: GOLD, textShadow: "0 2px 0 #000" }}>+{word.pts.toLocaleString()}</div>}
              </div>
            )}
            {toasts.length > 0 && (
              <div style={{ position: "absolute", left: 6, right: 6, top: 6, display: "flex", flexDirection: "column", gap: 4, pointerEvents: "none" }}>
                {toasts.map((x) => (
                  <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(0,0,0,.85)", border: `1.5px solid ${gold}`, borderRadius: 999,
                                           padding: "4px 10px 4px 4px", animation: "bgr-toast 3.2s ease-out forwards" }}>
                    {x.image ? <img src={x.image} alt="" style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover", maxWidth: "none" }} />
                      : <span style={{ fontSize: 20, width: 26, textAlign: "center" }}>{x.icon}</span>}
                    <span style={{ fontWeight: 800, fontSize: 13.5, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.text}</span>
                  </div>
                ))}
              </div>
            )}
            {over && (
              <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.84)", borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center",
                            justifyContent: "center", gap: 8, padding: 12, textAlign: "center" }}>
                <div style={{ fontSize: 30, fontWeight: 900, color: gold }}>{t("banger_game_over")}</div>
                <div style={{ fontSize: 14, fontWeight: 800, opacity: 0.85 }}>{t("banger_final_score")}</div>
                <div style={{ fontSize: 44, fontWeight: 900, color: "#fff", textShadow: `0 0 14px ${GOLD}` }}>{game.score.toLocaleString()}</div>
                {game.new_best && <div style={{ fontSize: 20, fontWeight: 900, color: "#FFE58A" }}>👑 {t("banger_new_best")}</div>}
                {game.top_boosters.length > 0 && (
                  <div style={{ width: "100%" }}>
                    <div style={{ fontWeight: 900, color: gold, marginBottom: 4 }}>{t("banger_top_boosters")}</div>
                    <Podium rows={game.top_boosters.map((b) => ({ name: b.name || "—", value: bbs(b.coins) }))} />
                  </div>
                )}
              </div>
            )}
          </div>

          {(lastChance || viewerLastChance) && !over && (
            <div style={{ textAlign: "center", fontWeight: 900, color: "#FF5A5F", fontSize: 15, animation: "bgr-blink 1s steps(2) infinite" }}>⏳ {t("banger_last_chance")}</div>
          )}

          {isHost && !over && (
            <>
              <div style={{ textAlign: "center", fontSize: 13, opacity: 0.85 }}>{t("banger_how_to")}</div>
              {game.coins_total !== null && game.coins_total > 0 && (
                <div style={{ textAlign: "center", fontSize: 17, fontWeight: 900, color: gold }}>{t("quiz_coins_earned", game.coins_total)}</div>
              )}
              {confirmEnd ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ flex: 1, fontWeight: 800, color: gold }}>{t("banger_end_confirm")}</span>
                  <button onClick={() => { setConfirmEnd(false); void finish(false); }} style={{ padding: "9px 16px", borderRadius: 999, border: "none", background: gold, color: "#000", fontWeight: 900, cursor: "pointer" }}>{t("fa_yes")}</button>
                  <button onClick={() => setConfirmEnd(false)} style={{ padding: "9px 16px", borderRadius: 999, border: `2px solid ${gold}`, background: "transparent", color: gold, fontWeight: 900, cursor: "pointer" }}>{t("no")}</button>
                </div>
              ) : (
                <button onClick={() => setConfirmEnd(true)} style={{ padding: "10px 0", borderRadius: 999, border: `2px solid ${gold}`, background: "transparent", color: gold, fontWeight: 900, fontSize: 15, cursor: "pointer" }}>{t("banger_end")}</button>
              )}
            </>
          )}

          {!isHost && !over && (
            <>
              <div style={{ textAlign: "center", fontSize: 14, fontWeight: 800, color: gold }}>{t("banger_send_boosters")}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                {game.boosters.map((b, i) => (
                  <button key={b.kind} type="button" disabled={boostBusy !== null}
                    onClick={async () => {
                      if (!myUserId) return;
                      setBoostBusy(b.kind); setNeedCoins(false);
                      try {
                        const r = await onBoost(b.kind);
                        if (r?.message === NOT_ENOUGH_COINS) setNeedCoins(true);
                        else if (r?.ok) sfx.boosterIn();
                      } finally { setBoostBusy(null); }
                    }}
                    style={{ padding: "8px 2px", borderRadius: 14, border: "none", cursor: myUserId ? "pointer" : "default", color: "#fff",
                             background: ["#1D9E75", "#378ADD", "#D85A30", "#8E5BD9"][i % 4], boxShadow: "0 3px 0 rgba(0,0,0,.35)",
                             display: "flex", flexDirection: "column", alignItems: "center", gap: 2, opacity: boostBusy && boostBusy !== b.kind ? 0.6 : 1 }}>
                    <span style={{ fontSize: 24 }}>{boostBusy === b.kind ? "…" : BOOSTER_ICON[b.kind]}</span>
                    <span style={{ fontSize: 12, fontWeight: 900, lineHeight: 1.1, textAlign: "center" }}>{boosterName(b.kind)}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 800, background: "rgba(0,0,0,.35)", borderRadius: 999, padding: "1px 6px" }}>{bbs(b.bbs)}</span>
                  </button>
                ))}
              </div>
              {!myUserId && <div style={{ textAlign: "center", fontSize: 13 }}>{t("quiz_sign_in_to_play")}</div>}
              {needCoins && (
                <div style={{ textAlign: "center", fontSize: 14, fontWeight: 700, color: "#FFB4B4" }}>
                  {t("lv_not_enough_bbs")} <Link to="/wallet" style={{ color: gold }}>{t("buy_coins")}</Link>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
