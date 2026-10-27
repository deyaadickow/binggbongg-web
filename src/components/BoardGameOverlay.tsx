// Checkers + Chess battle panel (Steve, 2026-10-27). Same black-and-gold panel as Pyramid, with the
// board in the middle. Click a piece, then where it goes — the squares it can reach light up, and
// the server checks the move again. In an audience game viewers pick a move the same way, and that
// click is their (paid) vote. Same shape as the phones.
import { useEffect, useMemo, useRef, useState } from "react";
import type { LiveTile } from "../lib/live";
import type { AiLevel, BoardGame, BoardKind, BoardMove, BoardPlayer, BoardStart, Sq } from "../lib/boardgame";

const gold = "var(--gold, #F0C420)";
const LIGHT = "#E9D8A6", DARK = "#7A5230", CHECKERS_LIGHT = "#D9C29A", CHECKERS_DARK = "#2E4A2E";
// One glyph set (the filled one) for both sides, coloured per side; ︎ keeps iOS/Android from
// swapping ♟ for an emoji.
const GLYPH: Record<string, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };

export const BOARD_TITLE: Record<BoardKind, string> = { checkers: "Checkers", chess: "Chess" };

function clock(ms: number | null) {
  if (ms === null) return "";
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function why(reason: string | null) {
  switch (reason) {
    case "checkmate": return "checkmate";
    case "time": return "on time";
    case "resigned": return "by resignation";
    case "no_moves": return "no moves left";
    case "stalemate": return "stalemate";
    case "fifty_moves": return "50-move rule";
    case "repetition": return "repetition";
    case "insufficient_material": return "not enough pieces to mate";
    case "no_captures": return "40 moves each without a capture";
    default: return "";
  }
}

/** A player's live camera, small, beside their name (Steve, 2026-10-27: "add two small screens
 *  for the two players"). A second video element on the track the room's grid already shows. */
function PlayerScreen({ tile, active }: { tile: LiveTile; active: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return tile.attach(el);
  }, [tile]);
  return (
    <video ref={ref} autoPlay playsInline muted
           style={{ width: 58, height: 78, objectFit: "cover", borderRadius: 8, flex: "none", background: "#000",
                    border: `2px solid ${active ? gold : "rgba(212,175,55,.6)"}`, transform: tile.isLocal ? "scaleX(-1)" : undefined }} />
  );
}

const same = (a: Sq | undefined, r: number, c: number) => !!a && a[0] === r && a[1] === c;
const onPath = (p: Sq[] | undefined, r: number, c: number) => !!p && p.some((q) => q[0] === r && q[1] === c);

export function BoardGameOverlay({ game, myUserId, onMove, onBuy, onResign, onEnd, onClose, tileFor }: {
  game: BoardGame; myUserId: number;
  /** The live tile of a member on stage, if any. */
  tileFor?: (userId: number) => LiveTile | undefined;
  onMove: (key: string) => void;
  onBuy: (recipientId: number, powerup: "time" | "freeze" | "hint" | "vote", move?: string) => void;
  onResign: () => void; onEnd: () => void; onClose: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [picked, setPicked] = useState<Sq | null>(null);
  const [tick, setTick] = useState(0);
  const [polledAt, setPolledAt] = useState(() => Date.now());
  useEffect(() => { setPolledAt(Date.now()); setPicked(null); }, [game]);
  useEffect(() => {
    if (game.status !== "active") return;
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, [game.status, game.board_game_id]);
  void tick;
  const since = Date.now() - polledAt;

  const active = game.status === "active";
  const me = game.players.find((p) => p.user_id === myUserId) ?? null;
  const flip = me?.side === "two";
  const myTurn = active && me !== null && game.turn === me.side;
  const frozenMe = myTurn && game.frozen?.side === me?.side && game.frozen.ms_left - since > 0;
  const iVote = active && game.mode === "audience" && game.turn === "two" && myUserId !== game.host_user_id;
  const canPick = (myTurn && !frozenMe) || iVote;
  const fromHere = useMemo(() => picked ? game.moves.filter((m) => same(m.from, picked[0], picked[1])) : [], [picked, game.moves]);
  const movable = useMemo(() => new Set(game.moves.map((m) => m.from.join(","))), [game.moves]);
  const topVote = game.vote?.tallies[0];
  const host = game.players[0];

  function clickSquare(r: number, c: number) {
    if (!canPick) return;
    const m: BoardMove | undefined = fromHere.find((x) => same(x.to, r, c));
    if (m) {
      setPicked(null);
      if (iVote) onBuy(game.host_user_id, "vote", m.key); else onMove(m.key);
      return;
    }
    setPicked(movable.has(`${r},${c}`) ? [r, c] : null);
  }

  const kingInCheck = (r: number, c: number) => {
    if (!game.in_check || game.kind !== "chess") return false;
    const p = game.board[r][c];
    return game.turn === "one" ? p === "K" : p === "k";
  };

  const piece = (p: string) => {
    if (!p) return null;
    const mine = game.kind === "chess" ? p === p.toUpperCase() : p.toLowerCase() === "b";
    if (game.kind === "chess") {
      return <span style={{ fontSize: 30, lineHeight: 1, color: mine ? "#fff" : "#111", textShadow: mine ? "0 0 2px #000, 0 0 1px #000" : "0 0 2px #fff8" }}>{GLYPH[p.toLowerCase()]}{"︎"}</span>;
    }
    return (
      <span style={{ width: "78%", height: "78%", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 16,
                     background: mine ? "radial-gradient(circle at 35% 30%, #555, #111)" : "radial-gradient(circle at 35% 30%, #f05a5a, #9b1111)",
                     border: `2px solid ${p === p.toUpperCase() ? gold : "rgba(0,0,0,.5)"}`, boxShadow: "0 2px 3px rgba(0,0,0,.5)" }}>
        {p === p.toUpperCase() ? "👑" : ""}
      </span>
    );
  };

  const rows = [0, 1, 2, 3, 4, 5, 6, 7];
  const view = flip ? [...rows].reverse() : rows;
  const board = (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", width: "min(352px, 86vw)", aspectRatio: "1", border: `2px solid ${gold}`, borderRadius: 6, overflow: "hidden" }}>
      {view.map((r) => view.map((c) => {
        const dark = (r + c) % 2 === 1;
        const target = fromHere.some((m) => same(m.to, r, c));
        const sel = same(picked ?? undefined, r, c);
        const last = onPath(game.last_move?.path, r, c);
        const hint = active && onPath(game.hint?.path, r, c);
        const voted = active && onPath(topVote?.path, r, c);
        let bg = game.kind === "chess" ? (dark ? DARK : LIGHT) : (dark ? CHECKERS_DARK : CHECKERS_LIGHT);
        if (last) bg = dark ? "#8f7a2a" : "#d8c66a";
        let ring = "";
        if (hint) ring = "inset 0 0 0 3px #3fe07a";
        if (voted) ring = "inset 0 0 0 3px #49a8ff";
        if (sel) ring = `inset 0 0 0 3px ${gold}`;
        if (kingInCheck(r, c)) ring = "inset 0 0 0 4px #ff3b30";
        return (
          <button key={`${r}-${c}`} onClick={() => clickSquare(r, c)} aria-label={`square ${r},${c}`}
                  style={{ position: "relative", border: "none", padding: 0, background: bg, boxShadow: ring, display: "grid", placeItems: "center", cursor: canPick ? "pointer" : "default" }}>
            {piece(game.board[r][c])}
            {target && <span style={{ position: "absolute", width: "30%", height: "30%", borderRadius: "50%", background: "rgba(240,196,32,.85)", pointerEvents: "none" }} />}
          </button>
        );
      }))}
    </div>
  );

  const playerRow = (p: BoardPlayer) => {
    const turn = active && game.turn === p.side;
    const frozen = game.frozen?.side === p.side ? Math.max(0, game.frozen.ms_left - since) : 0;
    const left = p.ms_left === null ? null : (turn ? p.ms_left - since : p.ms_left);
    const won = !active && game.result === p.side;
    const isMe = p.user_id === myUserId;
    // Duel: either player. Computer: the host (the computer has no user). Audience: nobody.
    const helpable = active && game.mode !== "audience" && !isMe && p.user_id !== null && me === null;
    const pill = (label: string, onClick: () => void, title: string) => (
      <button title={title} onClick={onClick} style={{ fontSize: 11, fontWeight: 700, color: "#000", background: gold, border: "none", borderRadius: 999, padding: "4px 8px", cursor: "pointer", whiteSpace: "nowrap" }}>{label}</button>
    );
    const tile = p.user_id !== null ? tileFor?.(p.user_id) : undefined;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {tile && <PlayerScreen tile={tile} active={turn} />}
      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 10, background: turn ? "rgba(240,196,32,.16)" : "rgba(255,255,255,.05)", border: `1px solid ${turn ? gold : "transparent"}`, flexWrap: "wrap" }}>
        <b style={{ fontSize: 13, color: won ? gold : "#fff", flex: 1, minWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {won ? "👑 " : ""}{p.is_audience ? "👥 " : ""}{p.is_computer ? "🤖 " : ""}{p.name}{isMe ? " (you)" : ""}
        </b>
        {frozen > 0 && <span style={{ fontSize: 12, color: "#7fd3ff", fontWeight: 700 }}>❄ {Math.ceil(frozen / 1000)}s</span>}
        <span style={{ fontSize: 11, color: gold }}>{p.coins} coins</span>
        {left !== null && <b style={{ fontSize: 15, fontVariantNumeric: "tabular-nums", color: turn && left < 20000 ? "#ff6b6b" : "#fff" }}>⏱ {clock(left)}</b>}
        {helpable && p.user_id !== null && (
          <div style={{ display: "flex", gap: 4, width: "100%" }}>
            {pill(`+30s · ${game.prices.time}`, () => onBuy(p.user_id!, "time"), "30 more seconds on their clock")}
            {game.turn !== p.side && game.mode === "duel" && pill(`❄ Freeze · ${game.prices.freeze}`, () => onBuy(p.user_id!, "freeze"), "Their opponent can't move for 10 seconds")}
            {game.turn === p.side && !game.hint && pill(`💡 Hint · ${game.prices.hint}`, () => onBuy(p.user_id!, "hint"), "Shows them a good move")}
          </div>
        )}
      </div>
      </div>
    );
  };

  const top = flip ? game.players[0] : game.players[1];
  const bottom = flip ? game.players[1] : game.players[0];
  const winner = game.players.find((p) => p.side === game.result);
  let status = "";
  if (!active) status = game.status === "cancelled" ? "Game ended — no winner." : game.result === "draw" ? `Draw — ${why(game.reason)}.` : `🏆 ${winner?.name ?? ""} wins — ${why(game.reason)}!`;
  else if (frozenMe) status = "❄ You're frozen — your clock is still running!";
  else if (myTurn) status = picked ? "Now click where it goes." : "Your move — click a piece.";
  else if (iVote) status = `Vote for the audience's move — click a piece, then where it goes (${game.prices.vote} coins a vote).`;
  else if (game.mode === "audience" && game.turn === "two") status = "The audience is voting…";
  else if (game.mode === "computer" && game.turn === "two") status = "🤖 The computer is thinking…";
  else status = `${(game.turn === "one" ? game.players[0] : game.players[1]).name} to move${game.in_check ? " — check!" : ""}`;

  const lastEvent = game.events[game.events.length - 1];
  const eventText = (e: typeof lastEvent) => {
    if (!e) return "";
    const who = game.players.find((p) => p.user_id === e.for_user_id)?.name ?? "the host";
    return e.type === "time" ? `${e.by} gave ${who} +30s` : e.type === "freeze" ? `${e.by} froze ${who}'s opponent ❄` : e.type === "hint" ? `${e.by} bought ${who} a hint 💡` : `${e.by} voted`;
  };

  return (
    <div style={{ position: "fixed", top: 96, left: 12, zIndex: 90, background: "rgba(0,0,0,.82)", border: `2px solid ${gold}`, borderRadius: 14, padding: 10, color: "#fff", userSelect: "none", maxWidth: "calc(100vw - 24px)", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <b style={{ color: gold, fontSize: 14, flex: 1 }}>{game.kind === "chess" ? "♞" : "⛀"} {BOARD_TITLE[game.kind]} #{game.game_no}{game.mode === "audience" ? " · vs the audience" : game.mode === "computer" ? " · vs the computer" : ""}</b>
        {active && me !== null && (
          <button onClick={() => { if (window.confirm("Resign this game?")) onResign(); }} style={{ fontSize: 11, fontWeight: 700, background: "transparent", color: gold, border: `1px solid ${gold}`, borderRadius: 999, padding: "2px 10px", cursor: "pointer" }}>Resign</button>
        )}
        {active && game.host_user_id === myUserId && (
          <button onClick={() => { if (window.confirm("End the game with no winner?")) onEnd(); }} style={{ fontSize: 11, fontWeight: 700, background: gold, color: "#000", border: "none", borderRadius: 999, padding: "2px 10px", cursor: "pointer" }}>End</button>
        )}
        <button onClick={() => setCollapsed((c) => !c)} style={{ background: "none", border: "none", color: gold, fontSize: 18, cursor: "pointer" }}>{collapsed ? "+" : "–"}</button>
        <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: "#fff", fontSize: 15, cursor: "pointer" }}>✕</button>
      </div>
      {!collapsed && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "min(352px, 86vw)" }}>
          {playerRow(top)}
          {board}
          {playerRow(bottom)}
          <div style={{ fontSize: 12, fontWeight: 600, color: !active ? gold : "#fff" }}>{status}</div>
          {game.vote && (
            <div style={{ fontSize: 12, background: "rgba(73,168,255,.12)", border: "1px solid #49a8ff", borderRadius: 10, padding: "6px 8px" }}>
              <b>🗳 {Math.ceil(Math.max(0, game.vote.ms_left - since) / 1000)}s left</b>
              {game.vote.tallies.length === 0 ? " · no votes yet — the computer picks if nobody votes"
                : game.vote.tallies.slice(0, 4).map((t) => <span key={t.key} style={{ marginLeft: 10 }}>{t.label} <b style={{ color: "#49a8ff" }}>{t.votes}</b></span>)}
            </div>
          )}
          {game.hint && active && <div style={{ fontSize: 12, color: "#3fe07a" }}>💡 Hint for {game.players.find((p) => p.side === game.hint!.side)?.name}: {game.hint.label}</div>}
          {lastEvent && <div style={{ fontSize: 11, opacity: 0.85 }}>{eventText(lastEvent)}</div>}
          {game.history.length > 0 && (
            <div style={{ fontSize: 11, opacity: 0.7, maxHeight: 34, overflow: "hidden" }}>
              {game.history.slice(-12).map((h, i, a) => <span key={i} style={{ marginRight: 6 }}>{game.history.length - a.length + i + 1}. {h}</span>)}
            </div>
          )}
          {host && game.mode === "audience" && myUserId === game.host_user_id && active && (
            <div style={{ fontSize: 11, opacity: 0.75 }}>Every vote's coins come to you.</div>
          )}
        </div>
      )}
    </div>
  );
}

/** The host's dialog: who plays, the clock and every price. */
export function BoardGameStartDialog({ kind, candidates, onStart, onClose }: {
  kind: BoardKind; candidates: { userId: number; name: string }[];
  onStart: (s: BoardStart) => void; onClose: () => void;
}) {
  const [mode, setMode] = useState<"duel" | "audience" | "computer">(candidates.length ? "duel" : "computer");
  const [level, setLevel] = useState<AiLevel>("medium");
  const [opponent, setOpponent] = useState<number | null>(candidates[0]?.userId ?? null);
  const [minutes, setMinutes] = useState(5);
  const [prices, setPrices] = useState({ time: 50, freeze: 100, hint: 25, vote: 5 });
  const chip = (on: boolean, label: string, onClick: () => void) => (
    <button onClick={onClick} style={{ padding: "8px 14px", borderRadius: 999, border: `2px solid ${gold}`, background: on ? gold : "transparent", color: on ? "#000" : gold, fontWeight: 700, cursor: "pointer" }}>{label}</button>
  );
  const price = (key: keyof typeof prices, label: string) => (
    <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "6px 0" }}>
      <span style={{ fontSize: 13 }}>{label}</span>
      <span><input type="number" min={1} max={1000} value={prices[key]}
                   onChange={(e) => setPrices((p) => ({ ...p, [key]: Math.max(1, Math.min(1000, Number(e.target.value) || 1)) }))}
                   style={{ width: 70, padding: "4px 6px", borderRadius: 8, border: `1px solid ${gold}`, background: "#111", color: "#fff", textAlign: "right" }} /> coins</span>
    </label>
  );
  return (
    <div role="dialog" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#000", border: `2px solid ${gold}`, borderRadius: 16, padding: 18, maxWidth: 400, width: "100%", boxSizing: "border-box", color: "#fff", maxHeight: "90vh", overflowY: "auto" }}>
        <h3 style={{ color: gold, margin: "0 0 10px", textAlign: "center" }}>{kind === "chess" ? "♞" : "⛀"} {BOARD_TITLE[kind]}</h3>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 10 }}>
          {chip(mode === "duel", "Play someone", () => setMode("duel"))}
          {chip(mode === "audience", "Play the audience", () => setMode("audience"))}
          {chip(mode === "computer", "Play the computer", () => setMode("computer"))}
        </div>
        {mode === "duel" ? (
          candidates.length === 0 ? <p style={{ fontSize: 13, opacity: 0.85 }}>Nobody is on screen with you yet — bring a guest up, or play the audience.</p> : (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Who are you playing?</div>
              {candidates.map((c) => (
                <label key={c.userId} style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", borderRadius: 10, background: opponent === c.userId ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.05)", marginBottom: 4, cursor: "pointer" }}>
                  {c.name}<input type="radio" checked={opponent === c.userId} onChange={() => setOpponent(c.userId)} />
                </label>
              ))}
            </div>
          )
        ) : mode === "computer" ? (
          <div style={{ marginBottom: 8 }}>
            <p style={{ fontSize: 13, opacity: 0.85, margin: "0 0 8px" }}>You move first. The computer answers a moment after each of your moves and has no clock — only you are timed. Viewers can buy you +30 seconds or a Hint.</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              {(["easy", "medium", "hard"] as AiLevel[]).map((l) => <span key={l}>{chip(level === l, l[0].toUpperCase() + l.slice(1), () => setLevel(l))}</span>)}
            </div>
          </div>
        ) : <p style={{ fontSize: 13, opacity: 0.85, margin: "0 0 8px" }}>You move first. On the audience's turn everyone watching has 20 seconds to vote, and the most-voted move is played. Every vote's coins come to you.</p>}
        <div style={{ fontSize: 13, fontWeight: 600, margin: "8px 0 6px" }}>{mode === "duel" ? "Each player's clock" : "Your clock"}</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          {[3, 5, 10].map((m) => <span key={m}>{chip(minutes === m, `${m} min`, () => setMinutes(m))}</span>)}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, margin: "12px 0 2px" }}>Your prices</div>
        {mode === "duel" ? (
          <>
            {price("time", "+30 seconds")}
            {price("freeze", "❄ Freeze (10 seconds)")}
            {price("hint", "💡 Hint")}
            <div style={{ fontSize: 11, opacity: 0.7 }}>Viewers buy these for a player — the coins go to that player.</div>
          </>
        ) : mode === "computer" ? (
          <>
            {price("time", "+30 seconds")}
            {price("hint", "💡 Hint")}
            <div style={{ fontSize: 11, opacity: 0.7 }}>Viewers buy these for you — the coins come to you.</div>
          </>
        ) : price("vote", "🗳 One vote")}
        <button disabled={mode === "duel" && opponent === null}
                onClick={() => onStart({ kind, mode, level: mode === "computer" ? level : undefined, opponent: mode === "duel" ? opponent ?? undefined : undefined, minutes, prices })}
                style={{ marginTop: 16, width: "100%", padding: "12px 0", borderRadius: 999, border: "none", background: gold, color: "#000", fontWeight: 700, fontSize: 16, cursor: "pointer", opacity: mode === "duel" && opponent === null ? 0.5 : 1 }}>Start</button>
      </div>
    </div>
  );
}
