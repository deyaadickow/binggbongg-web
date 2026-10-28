// Word Search (#21; Steve, 2026-10-28: "all audiences can participate, charge 1 to 25 coins per
// letter with leaderboard and the whole shabang"). ONE shared 12x12 grid for the whole room — a race:
// the first to swipe a word claims it, it lights up in their colour with their name. A swipe pays only
// when it spells a word still on the list (its letters x the host's price, a gift to the host); a
// swipe that isn't a word is free and never reaches the server.
//
// The grid is ONE <svg> that stays mounted across polls (pointer capture on it, touch-action: none),
// so a poll landing mid-swipe only redraws the found-word capsules — it never throws the swipe away.
import { useEffect, useMemo, useRef, useState } from "react";
import { Confetti, MuteButton, Podium, firstName } from "./GameShow";
import { Celebration, type CelebrationShow } from "./Celebration";
import { sfx, haptic } from "../lib/gameSounds";
import { useT } from "../lib/i18n";
import {
  WS_COLORS, WS_DEFAULT_PRICE, WS_PRICES, fetchWordFinders, fetchWordSearchThemes, lettersOf, lineCells, matchSwipe,
  type WSCell, type WSFindResult, type WSFinder, type WSTheme, type WordSearch,
} from "../lib/wordsearch";

const gold = "var(--gold, #F0C420)";
const GOLD = "#F0C420";
const MEDALS = ["#F0C420", "#C9D1D9", "#D08A4E"];
const END_KEYS = { host: "ws_end_host", room_ended: "quiz_end_room", expired: "quiz_end_expired", no_words: "ws_end_no_words" } as const;
/** The eight snap directions (row, col). */
const DIRS: WSCell[] = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]];

const mmss = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/** "🍼 Baby Shower Word Search", or "🌟 Word Search" for the mix. */
export function useWordSearchTitle() {
  const { t } = useT();
  return (game: Pick<WordSearch, "theme" | "is_mix">) =>
    !game.is_mix && game.theme ? `${game.theme.emoji} ${t("ws_title_theme", game.theme.label)}` : `🌟 ${t("ws_word_search")}`;
}

type Sel = { start: WSCell; end: WSCell };

/** The letter grid. Found words are capsules in the finder's colour; the swipe in progress is gold. */
function LetterGrid({ game, canSwipe, onSwipe, pending, rejected }: {
  game: WordSearch; canSwipe: boolean; pending: Sel | null;
  /** A swipe that spelled nothing on the list: shown for a moment, shaking. */
  rejected: { sel: Sel; id: number } | null;
  /** A finished swipe of 2+ cells in a straight line. */
  onSwipe: (s: Sel) => void;
}) {
  const n = game.size || 12;
  const svg = useRef<SVGSVGElement | null>(null);
  const [sel, setSel] = useState<Sel | null>(null);
  const drag = useRef<{ id: number; start: WSCell; end: WSCell } | null>(null);

  const at = (e: React.PointerEvent): [number, number] | null => {
    const el = svg.current; if (!el) return null;
    const r = el.getBoundingClientRect();
    return [((e.clientY - r.top) / r.height) * n, ((e.clientX - r.left) / r.width) * n];
  };
  const inside = (r: number, c: number) => r >= 0 && c >= 0 && r < n && c < n;

  function down(e: React.PointerEvent) {
    if (!canSwipe || pending) return;
    const p = at(e); if (!p) return;
    const start: WSCell = [Math.min(n - 1, Math.max(0, Math.floor(p[0]))), Math.min(n - 1, Math.max(0, Math.floor(p[1])))];
    try { svg.current?.setPointerCapture(e.pointerId); } catch { /* capture is a nicety */ }
    drag.current = { id: e.pointerId, start, end: start };
    setSel({ start, end: start });
    sfx.letter();
  }
  function move(e: React.PointerEvent) {
    const d = drag.current; if (!d || d.id !== e.pointerId) return;
    const p = at(e); if (!p) return;
    const vy = p[0] - (d.start[0] + 0.5), vx = p[1] - (d.start[1] + 0.5);
    if (Math.hypot(vx, vy) < 0.45) { if (d.end[0] !== d.start[0] || d.end[1] !== d.start[1]) { d.end = d.start; setSel({ start: d.start, end: d.start }); } return; }
    // Snap to the nearest of the eight directions, then go as far along it as the finger is.
    let best = DIRS[0], bestDot = -Infinity;
    for (const dir of DIRS) {
      const len = Math.hypot(dir[0], dir[1]);
      const dot = (vy * dir[0] + vx * dir[1]) / len;
      if (dot > bestDot) { bestDot = dot; best = dir; }
    }
    let k = Math.max(0, Math.round((vy * best[0] + vx * best[1]) / (best[0] ** 2 + best[1] ** 2)));
    while (k > 0 && !inside(d.start[0] + best[0] * k, d.start[1] + best[1] * k)) k--;
    const end: WSCell = [d.start[0] + best[0] * k, d.start[1] + best[1] * k];
    if (end[0] !== d.end[0] || end[1] !== d.end[1]) { d.end = end; setSel({ start: d.start, end }); sfx.letter(); }
  }
  function up(e: React.PointerEvent) {
    const d = drag.current; if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setSel(null);
    if (e.type === "pointercancel") return;
    if (lineCells(d.start, d.end)) onSwipe({ start: d.start, end: d.end });
  }

  const showSel = sel ?? pending ?? rejected?.sel ?? null;
  const shaking = !sel && !pending && !!rejected;
  const reveal = game.phase === "result" || game.phase === "over";
  const onCapsule = useMemo(() => {
    const s = new Set<string>();
    for (const w of game.words) if (w.found && w.cells) for (const [r, c] of w.cells) s.add(`${r},${c}`);
    return s;
  }, [game.words]);
  const selCells = new Set((showSel ? lineCells(showSel.start, showSel.end) ?? [showSel.start] : []).map(([r, c]) => `${r},${c}`));
  const capsule = (cells: WSCell[], key: string, stroke: string, opacity: number) => {
    const a = cells[0], b = cells[cells.length - 1];
    return <line key={key} x1={a[1] + 0.5} y1={a[0] + 0.5} x2={b[1] + 0.5} y2={b[0] + 0.5} stroke={stroke} strokeOpacity={opacity}
                 strokeWidth={0.78} strokeLinecap="round" />;
  };
  const grid = game.grid;

  return (
    <svg ref={svg} viewBox={`0 0 ${n} ${n}`} role="img" aria-label="Word search grid"
         onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
         style={{ display: "block", width: "100%", aspectRatio: "1 / 1", touchAction: "none", userSelect: "none", WebkitUserSelect: "none",
                  cursor: canSwipe ? "pointer" : "default", borderRadius: 12, boxShadow: "0 4px 18px rgba(0,0,0,.45)" }}>
      <rect x={0} y={0} width={n} height={n} rx={0.35} fill="#FFF7E3" />
      {Array.from({ length: n - 1 }, (_, i) => (
        <g key={i} stroke="#E9DcBC" strokeWidth={0.02}>
          <line x1={i + 1} y1={0.15} x2={i + 1} y2={n - 0.15} /><line x1={0.15} y1={i + 1} x2={n - 0.15} y2={i + 1} />
        </g>
      ))}
      {game.words.map((w, i) => {
        if (!w.cells || w.cells.length === 0) return null;
        if (w.found) return capsule(w.cells, `f${i}`, WS_COLORS[(w.color ?? 0) % WS_COLORS.length], 0.88);
        return reveal ? capsule(w.cells, `m${i}`, "#8C8473", 0.42) : null;
      })}
      {showSel && (
        <g key={shaking ? `rej${rejected!.id}` : "sel"} style={{ animation: shaking ? "ws-shake .4s ease-in-out" : pending ? "ws-pulse .7s ease-in-out infinite" : "none" }}>
          {capsule(lineCells(showSel.start, showSel.end) ?? [showSel.start, showSel.start], "sel", shaking ? "#9AA0A6" : GOLD, 0.78)}
        </g>
      )}
      {grid && grid.map((row, r) => row.split("").map((ch, c) => {
        const key = `${r},${c}`;
        const lit = onCapsule.has(key) || selCells.has(key);
        return (
          <text key={key} x={c + 0.5} y={r + 0.53} textAnchor="middle" dominantBaseline="central" fontSize={0.6} fontWeight={lit ? 900 : 800}
                fontFamily="'Arial Rounded MT Bold', 'Helvetica Neue', Arial, sans-serif" fill={lit ? "#FFFFFF" : "#2B2118"}
                style={{ pointerEvents: "none" }}>{ch}</text>
        );
      }))}
    </svg>
  );
}

export function WordSearchPanel({ game, myUserId, onFind, onEnd, onClose, onNotice }: {
  game: WordSearch; myUserId: number | null;
  /** Buys the word the swipe spells; resolves with the result (null when it didn't go through). */
  onFind: (from: WSCell, to: WSCell) => Promise<WSFindResult | null>;
  onEnd: () => void; onClose: () => void; onNotice: (msg: string) => void;
}) {
  const { t } = useT();
  const title = useWordSearchTitle()(game);
  const [collapsed, setCollapsed] = useState(false);
  const [polledAt, setPolledAt] = useState(() => Date.now());
  const [, setTick] = useState(0);
  const [burst, setBurst] = useState(0);
  const [celebrate, setCelebrate] = useState<CelebrationShow | null>(null);
  const [pending, setPending] = useState<Sel | null>(null);
  const [rejected, setRejected] = useState<{ sel: Sel; id: number } | null>(null);
  const [banner, setBanner] = useState<{ id: number; text: string } | null>(null);
  const [boardOpen, setBoardOpen] = useState(false);
  const busy = useRef(false);
  const seen = useRef<Map<string, boolean> | null>(null);
  const prevPhase = useRef(game.phase);
  const lastTick = useRef(-1);
  const over = game.status === "completed" || game.phase === "over";

  useEffect(() => { setPolledAt(Date.now()); }, [game]);
  useEffect(() => {
    if (over) return;
    const id = window.setInterval(() => setTick((x) => x + 1), 250);
    return () => window.clearInterval(id);
  }, [over, game.word_search_id]);

  // Someone else's find: a banner and a pop. The first sight of a puzzle announces nothing.
  useEffect(() => {
    const now = new Map(game.words.map((w) => [`${game.puzzle_no}:${w.word}`, w.found]));
    const before = seen.current;
    seen.current = now;
    if (!before) return;
    for (const w of game.words) {
      const k = `${game.puzzle_no}:${w.word}`;
      if (w.found && before.get(k) === false && w.found_by && w.found_by.user_id !== myUserId) {
        setBanner({ id: Date.now(), text: t("ws_someone_found", firstName(w.found_by.name) || w.found_by.name, w.word) });
        sfx.sparkle();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.words, game.puzzle_no]);
  useEffect(() => {
    if (!banner) return;
    const id = window.setTimeout(() => setBanner((b) => (b && b.id === banner.id ? null : b)), 2600);
    return () => window.clearTimeout(id);
  }, [banner]);
  useEffect(() => {
    const was = prevPhase.current;
    prevPhase.current = game.phase;
    if (game.phase === "result" && was === "playing") {
      sfx.fanfare();
      if (game.result?.top[0] && game.result.top[0].user_id === myUserId) setBurst(Date.now());
    }
    if (over && was !== "over") { sfx.fanfare(); setBurst(Date.now()); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.phase, game.status]);

  const since = Date.now() - polledAt;
  const playing = !over && game.phase === "playing" && !!game.grid;
  const msLeft = game.ms_left === null ? 0 : Math.max(0, game.ms_left - since);
  const nextSecs = Math.max(1, Math.ceil(((game.next_ms_left ?? 0) - since) / 1000));
  const secs = Math.ceil(msLeft / 1000);
  if (playing && secs <= 10 && secs > 0 && lastTick.current !== secs) { lastTick.current = secs; sfx.tick(); }
  const canSwipe = playing && !!myUserId && !game.is_host && msLeft > 0;
  const price = game.coins_per_letter;

  async function swiped(s: Sel) {
    if (busy.current) return;
    const cells = lineCells(s.start, s.end);
    if (!cells) return;
    const m = matchSwipe(game, cells);
    if (m.kind === "none") {
      const id = Date.now();
      setRejected({ sel: s, id });
      window.setTimeout(() => setRejected((r) => (r && r.id === id ? null : r)), 450);
      sfx.nope(); haptic(40); onNotice(t("ws_not_on_list"));
      return;
    }
    if (m.kind === "taken") { onNotice(t("ws_already_found", m.word.found_by?.name ?? "Someone", m.word.word)); return; }
    busy.current = true;
    setPending(s);
    try {
      const r = await onFind(s.start, s.end);
      if (r?.found) {
        const fresh = r.game ?? game;
        const last = fresh.words.every((w) => w.found);
        const extra = last ? t("ws_last_one") : r.found.letters >= 8 ? t("ws_huge_word") : null;
        setCelebrate({ id: Date.now(), line: t("ws_plus_letters", r.found.word, r.found.letters), extra });
      }
    } finally { busy.current = false; setPending(null); }
  }

  const res = game.phase === "result" || over ? game.result : null;
  const podium = (rows: { name: string; points: number }[]) => rows.filter((p) => p.points > 0).slice(0, 3).map((p) => ({ name: p.name, value: t("ws_pts", p.points) }));
  const endKey = END_KEYS[(game.end_reason ?? "") as keyof typeof END_KEYS];
  const recent = game.recent[0] && game.recent[0].ms_ago + since < 20000 ? game.recent[0] : null;

  let status = "";
  if (playing) {
    if (game.is_host) status = t("ws_host_watch");
    else if (!myUserId) status = t("quiz_sign_in_to_play");
    else status = t("ws_swipe_line", t(price === 1 ? "n_coin" : "n_coins", price));
  }

  return (
    <div style={{ position: "fixed", top: 64, left: "50%", transform: "translateX(-50%)", zIndex: 87, width: "min(460px, calc(100vw - 16px))", boxSizing: "border-box",
                  background: "rgba(8,8,10,.94)", border: `2px solid ${gold}`, borderRadius: 18, padding: 10, color: "#fff", maxHeight: "calc(100vh - 80px)", overflowY: "auto" }}>
      <style>{`@keyframes ws-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-.18px)}50%{transform:translateX(.16px)}75%{transform:translateX(-.1px)}}
@keyframes ws-pulse{0%,100%{opacity:1}50%{opacity:.55}}
@keyframes ws-banner{0%{transform:translate(-50%,-8px);opacity:0}12%{transform:translate(-50%,0);opacity:1}85%{opacity:1}100%{opacity:0}}`}</style>
      <Confetti burst={burst} />
      <Celebration show={celebrate} />
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <b style={{ color: gold, fontSize: 16, flex: 1, minWidth: 0, lineHeight: 1.25 }}>
          {title}{game.puzzle_no > 0 && !over && <span style={{ color: "#fff", opacity: 0.75, fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" }}> · {t("ws_puzzle_n", game.puzzle_no)}</span>}
        </b>
        {playing && <b style={{ fontVariantNumeric: "tabular-nums", fontSize: 17, color: secs <= 10 ? "#E5484D" : "#fff" }}>⏱ {mmss(msLeft)}</b>}
        {collapsed && !over && <b style={{ fontSize: 13, opacity: 0.9 }}>{t("ws_found_n", game.found_count, game.total_words)}</b>}
        <MuteButton />
        <button onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? "Expand" : "Collapse"} style={{ background: "none", border: "none", color: gold, fontSize: 20, cursor: "pointer", padding: "0 4px" }}>{collapsed ? "+" : "–"}</button>
        {over && <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: gold, fontSize: 18, cursor: "pointer" }}>✕</button>}
      </div>

      {!collapsed && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {/* The host's money and the one button they need, at the top where they can't miss them. */}
          {game.is_host && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, textAlign: "center", fontSize: 19, fontWeight: 900, color: gold }}>{t("quiz_coins_earned", game.coins_total)}</div>
              {!over && (
                <button onClick={() => { if (window.confirm(t("ws_end_confirm"))) onEnd(); }}
                        style={{ flex: "none", padding: "9px 18px", borderRadius: 999, border: "none", background: gold, color: "#000", fontWeight: 900, fontSize: 15, cursor: "pointer" }}>{t("quiz_end_game")}</button>
              )}
            </div>
          )}
          {status && <div style={{ fontSize: 14, fontWeight: 700, textAlign: "center", opacity: 0.95 }}>{status}</div>}
          {!game.is_host && game.my_points > 0 && !over && (
            <div style={{ fontSize: 14, fontWeight: 800, textAlign: "center", color: gold }}>
              {game.my_rank ? t("ws_you_line", game.my_points, game.my_rank) : t("ws_you_points", game.my_points)}
            </div>
          )}

          {!over && game.phase === "ready" && (
            <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: gold }}>{t("quiz_get_ready")}</div>
              <div style={{ fontSize: 16, fontWeight: 700, opacity: 0.9, marginTop: 2 }}>
                {t("ws_puzzle_n", game.puzzle_no)}{game.theme ? ` — ${game.theme.emoji} ${game.theme.label}` : ""}
              </div>
              <div key={nextSecs} className="gs-anim" style={{ fontSize: 64, fontWeight: 900, lineHeight: 1.1, marginTop: 4, animation: "gs-pop .5s ease-out" }}>{nextSecs}</div>
            </div>
          )}

          {game.grid && (
            <div style={{ position: "relative" }}>
              <LetterGrid game={game} canSwipe={canSwipe} onSwipe={(s) => void swiped(s)} pending={pending} rejected={rejected} />
              {banner && (
                <div key={banner.id} style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", pointerEvents: "none", whiteSpace: "nowrap", maxWidth: "94%",
                  overflow: "hidden", textOverflow: "ellipsis", background: "rgba(0,0,0,.85)", border: `1.5px solid ${gold}`, borderRadius: 999, padding: "6px 14px",
                  fontWeight: 900, fontSize: 14, animation: "ws-banner 2.6s ease both" }}>{banner.text}</div>
              )}
            </div>
          )}

          {/* The result sits UNDER the grid, so everyone can see where the missed words were. */}
          {res && !over && (
            <div style={{ background: "rgba(255,255,255,.05)", border: `2px solid ${gold}`, borderRadius: 16, padding: "10px 10px", textAlign: "center",
              display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 19, fontWeight: 900, color: gold }}>
                {res.why === "all_found" ? t("ws_puzzle_complete", res.found, res.total) : t("ws_times_up", res.found, res.total)}
              </div>
              {res.top.length ? <Podium rows={podium(res.top)} /> : <div style={{ fontSize: 13, opacity: 0.85 }}>{t("ws_nobody_found")}</div>}
              <div style={{ fontSize: 14, opacity: 0.9 }}>{t("ws_next_puzzle_in", nextSecs)}</div>
            </div>
          )}

          {!over && !res && game.words.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(124px, 1fr))", gap: 5 }}>
              {game.words.map((w) => {
                const col = w.found ? WS_COLORS[(w.color ?? 0) % WS_COLORS.length] : null;
                return (
                  <div key={w.word} style={{ minWidth: 0, borderRadius: 10, padding: "5px 8px", display: "flex", alignItems: "baseline", gap: 6,
                    background: col ? `${col}2E` : "rgba(255,255,255,.07)", border: `1.5px solid ${col ?? "rgba(255,255,255,.14)"}` }}>
                    <span style={{ flex: 1, minWidth: 0, fontWeight: 900, fontSize: 13.5, letterSpacing: 0.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      textDecoration: w.found ? "line-through" : "none", color: col ?? "#fff" }}>{w.word}</span>
                    <span style={{ flex: "none", fontSize: 11, fontWeight: 700, opacity: 0.85, whiteSpace: "nowrap", color: col ?? "#fff" }}>
                      {w.found ? `✓ ${firstName(w.found_by?.name) || ""}` : `${lettersOf(w.word).length}×${price}=${lettersOf(w.word).length * price}`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {(game.top.length > 0 || recent) && !over && (
            <div style={{ display: "flex", flexDirection: "column", gap: 5, borderTop: "1px solid rgba(240,196,32,.25)", paddingTop: 7 }}>
              {game.top.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
                  {game.top.slice(0, 3).map((p, i) => (
                    <span key={p.user_id} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 800, background: "rgba(255,255,255,.07)", borderRadius: 999, padding: "3px 10px 3px 4px" }}>
                      <b style={{ width: 20, height: 20, borderRadius: "50%", background: MEDALS[i], color: "#000", display: "grid", placeItems: "center", fontSize: 12 }}>{i + 1}</b>
                      <span style={{ color: WS_COLORS[(p.color ?? 0) % WS_COLORS.length] }}>{firstName(p.name) || p.name}</span>
                      <span style={{ opacity: 0.85 }}>{t("ws_pts", p.points)}</span>
                    </span>
                  ))}
                </div>
              )}
              {recent && <div style={{ textAlign: "center", fontSize: 13, opacity: 0.9 }}>🎉 {t("ws_recent", firstName(recent.name) || recent.name, recent.word, recent.letters)}</div>}
            </div>
          )}

          {over && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: gold }}>{t("ws_over")}</div>
              {endKey && <div style={{ fontSize: 13, opacity: 0.8 }}>{t(endKey)}</div>}
              {podium(game.top).length > 0 ? <Podium rows={podium(game.top)} /> : <div style={{ fontSize: 13, opacity: 0.8 }}>{t("ws_nobody_found")}</div>}
            </div>
          )}
          {(over || game.phase === "result") && (
            <button onClick={() => setBoardOpen(true)} style={{ alignSelf: "center", padding: "8px 18px", borderRadius: 999, border: `1.5px solid ${gold}`, background: "transparent", color: gold, fontWeight: 900, fontSize: 14, cursor: "pointer" }}>
              {t("ws_top_finders")}
            </button>
          )}

        </div>
      )}
      {boardOpen && <WordFindersBoard onClose={() => setBoardOpen(false)} />}
    </div>
  );
}

/** 🏆 Top Word Finders — every game, all time. */
export function WordFindersBoard({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const [rows, setRows] = useState<WSFinder[] | null>(null);
  useEffect(() => { fetchWordFinders().then(setRows).catch(() => setRows([])); }, []);
  return (
    <div role="dialog" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 101, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#000", border: `2px solid ${gold}`, borderRadius: 18, padding: 16, maxWidth: 420, width: "100%", boxSizing: "border-box", color: "#fff", maxHeight: "86vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <button onClick={onClose} aria-label="Back" style={{ width: 34, height: 34, flex: "none", borderRadius: "50%", border: `1.5px solid ${gold}`, background: "#000", color: gold, fontSize: 20, cursor: "pointer" }}>‹</button>
          <h3 style={{ color: gold, margin: 0, fontSize: 20 }}>{t("ws_top_finders")}</h3>
        </div>
        <div style={{ overflowY: "auto", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {rows === null ? <p style={{ opacity: 0.75, textAlign: "center" }}>{t("quiz_loading_games")}</p>
            : rows.length === 0 ? <p style={{ opacity: 0.75, textAlign: "center" }}>{t("ws_nobody_found")}</p>
            : rows.map((r) => (
              <div key={r.user_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 12, background: "rgba(255,255,255,.06)" }}>
                <b style={{ width: 28, height: 28, flex: "none", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 13,
                  background: MEDALS[r.rank - 1] ?? "rgba(255,255,255,.12)", color: r.rank <= 3 ? "#000" : "#fff" }}>{r.rank}</b>
                {r.image ? <img src={r.image} alt="" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", flex: "none" }} />
                  : <span style={{ width: 34, height: 34, borderRadius: "50%", background: "#222", display: "grid", placeItems: "center", flex: "none" }}>🔤</span>}
                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                  <span style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
                  <span style={{ fontSize: 12.5, opacity: 0.85, fontVariantNumeric: "tabular-nums" }}>{t("ws_finder_row", r.words, r.letters)}</span>
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

/** The host's ONE screen: a theme, the coins per letter, START. */
export function WordSearchPicker({ onStart, onClose }: { onStart: (theme: string | null, price: number) => Promise<void>; onClose: () => void }) {
  const { t } = useT();
  const [themes, setThemes] = useState<WSTheme[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);   // null = Mix of everything
  const [price, setPrice] = useState(WS_DEFAULT_PRICE);
  const [busy, setBusy] = useState(false);
  const load = () => { setThemes(null); fetchWordSearchThemes().then(setThemes).catch(() => setThemes([])); };
  useEffect(load, []);
  const tile = (key: string | null, emoji: string, label: string) => {
    const on = picked === key;
    return (
      <button key={key ?? "mix"} type="button" onClick={() => setPicked(key)}
              style={{ minHeight: 78, padding: "8px 6px", borderRadius: 16, cursor: "pointer", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
                       background: on ? "rgba(240,196,32,.18)" : "rgba(255,255,255,.07)", border: `2px solid ${on ? GOLD : "rgba(255,255,255,.14)"}`,
                       boxShadow: on ? `0 0 0 3px ${GOLD}, 0 0 16px rgba(240,196,32,.45)` : "none", touchAction: "manipulation", minWidth: 0 }}>
        <span style={{ fontSize: 30, lineHeight: 1 }}>{emoji}</span>
        <span style={{ fontSize: 13.5, fontWeight: 800, lineHeight: 1.2, textAlign: "center", overflowWrap: "anywhere", color: on ? GOLD : "#fff" }}>{label}</span>
      </button>
    );
  };
  return (
    <div role="dialog" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#000", border: `2px solid ${gold}`, borderRadius: 18, padding: 16, maxWidth: 460, width: "100%", boxSizing: "border-box", color: "#fff", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <button onClick={onClose} aria-label="Back" style={{ width: 34, height: 34, flex: "none", borderRadius: "50%", border: `1.5px solid ${gold}`, background: "#000", color: gold, fontSize: 20, cursor: "pointer" }}>‹</button>
          <h3 style={{ color: gold, margin: 0, fontSize: 20 }}>🔤 {t("ws_word_search")}</h3>
        </div>
        <div style={{ overflowY: "auto", flex: 1, minHeight: 0, padding: 4, margin: -4 }}>
          {themes === null ? <p style={{ opacity: 0.75, textAlign: "center" }}>{t("ws_loading")}</p> : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {tile(null, "🌟", t("quiz_mix_of_everything"))}
                {themes.map((c) => tile(c.key, c.emoji, c.label))}
              </div>
              {themes.length === 0 && (
                <p style={{ fontSize: 13, opacity: 0.85, textAlign: "center" }}>{t("ws_couldnt_load")} <button onClick={load} style={{ background: "none", border: "none", color: gold, fontWeight: 700, cursor: "pointer" }}>{t("quiz_retry")}</button></p>
              )}
            </>
          )}
        </div>
        <b style={{ fontSize: 15, textAlign: "center", marginTop: 12 }}>{t("ws_coins_per_letter")}</b>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, justifyContent: "center" }}>
          {WS_PRICES.map((p) => (
            <button key={p} type="button" onClick={() => setPrice(p)}
                    style={{ minWidth: 56, padding: "8px 12px", borderRadius: 999, cursor: "pointer", fontWeight: 900, fontSize: 16,
                             background: price === p ? GOLD : "transparent", color: price === p ? "#000" : "#fff", border: `2px solid ${price === p ? GOLD : "rgba(255,255,255,.3)"}` }}>{p}</button>
          ))}
        </div>
        <div style={{ textAlign: "center", fontSize: 12.5, opacity: 0.8, marginTop: 6 }}>{t("ws_price_example", 4 * price)}</div>
        <button disabled={busy || themes === null} onClick={async () => { setBusy(true); try { await onStart(picked, price); } finally { setBusy(false); } }}
                style={{ width: "100%", marginTop: 12, padding: "15px 0", borderRadius: 999, border: "none", background: gold, color: "#000", fontWeight: 900, fontSize: 22, letterSpacing: 2, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}>
          {busy ? t("quiz_starting") : t("quiz_start")}
        </button>
      </div>
    </div>
  );
}

