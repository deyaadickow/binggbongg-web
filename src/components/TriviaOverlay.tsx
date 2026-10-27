// Trivia Battle panel (Steve, 2026-10-27). The black-and-gold panel the board battles use: the two
// players with their scores (and small live screens), the question, four answers, and — for
// viewers — lifelines to buy a player or, in an audience game, a paid vote on an answer.
import { useEffect, useRef, useState } from "react";
import type { LiveTile } from "../lib/live";
import type { TriviaGame, TriviaMode, TriviaPlayer, TriviaStart } from "../lib/trivia";

const gold = "var(--gold, #F0C420)";
const LETTERS = ["A", "B", "C", "D"];
const GREEN = "#2fbf5b", RED = "#e5484d", BLUE = "#49a8ff";

function Screen({ tile }: { tile: LiveTile }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { const el = ref.current; if (!el) return; return tile.attach(el); }, [tile]);
  return <video ref={ref} autoPlay playsInline muted style={{ width: 46, height: 62, objectFit: "cover", borderRadius: 8, flex: "none", background: "#000", border: `2px solid ${gold}`, transform: tile.isLocal ? "scaleX(-1)" : undefined }} />;
}

export function TriviaOverlay({ game, myUserId, tileFor, onAnswer, onBuy, onEnd, onClose }: {
  game: TriviaGame; myUserId: number;
  tileFor?: (userId: number) => LiveTile | undefined;
  onAnswer: (choice: number) => void;
  onBuy: (recipientId: number, powerup: "5050" | "time" | "vote", choice?: number) => void;
  onEnd: () => void; onClose: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [polledAt, setPolledAt] = useState(() => Date.now());
  const [, setTick] = useState(0);
  useEffect(() => { setPolledAt(Date.now()); }, [game]);
  useEffect(() => {
    if (game.status !== "active") return;
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, [game.status, game.trivia_game_id]);
  const since = Date.now() - polledAt;

  const active = game.status === "active";
  const asking = active && game.phase === "question";
  const me = game.players.find((p) => p.user_id === myUserId) ?? null;
  const iVote = asking && game.mode === "audience" && myUserId !== game.host_user_id;
  const r = game.last_result;
  const mySecondsLeft = me ? Math.max(0, Math.ceil((me.ms_left - since) / 1000)) : Math.max(0, Math.ceil((game.ms_left - since) / 1000));
  const canAnswer = asking && me !== null && game.my_answer === null && mySecondsLeft > 0;

  const answerStyle = (i: number) => {
    let bg = "rgba(255,255,255,.07)", border = "rgba(240,196,32,.5)", color = "#fff";
    const removed = asking && game.my_removed.includes(i);
    if (asking && game.my_answer === i) { bg = "rgba(240,196,32,.25)"; border = gold; }
    if (!asking && r) {
      if (i === r.correct) { bg = "rgba(47,191,91,.3)"; border = GREEN; }
      else if (r.answers.one === i || r.answers.two === i) { bg = "rgba(229,72,77,.25)"; border = RED; }
    }
    if (removed) { color = "rgba(255,255,255,.3)"; border = "rgba(255,255,255,.15)"; }
    return { bg, border, color, removed };
  };

  const who = (i: number) => {
    if (asking || !r) return null;
    const marks: string[] = [];
    if (r.answers.one === i) marks.push(game.players[0].is_audience ? "👥" : (game.players[0].name.split(" ")[0]));
    if (r.answers.two === i) marks.push(game.players[1].is_audience ? "👥" : game.players[1].is_computer ? "🤖" : (game.players[1].name.split(" ")[0]));
    return marks.length ? <span style={{ fontSize: 11, color: gold, marginLeft: 6 }}>← {marks.join(", ")}</span> : null;
  };

  const playerRow = (p: TriviaPlayer) => {
    const won = !active && game.result === p.side;
    const tile = p.user_id !== null ? tileFor?.(p.user_id) : undefined;
    const helpable = asking && game.mode !== "audience" && p.user_id !== null && me === null && !p.answered;
    const left = Math.max(0, Math.ceil((p.ms_left - since) / 1000));
    const pill = (label: string, onClick: () => void) => (
      <button onClick={onClick} style={{ fontSize: 11, fontWeight: 700, color: "#000", background: gold, border: "none", borderRadius: 999, padding: "4px 8px", cursor: "pointer", whiteSpace: "nowrap" }}>{label}</button>
    );
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
        {tile && <Screen tile={tile} />}
        <div style={{ flex: 1, minWidth: 0, padding: "6px 8px", borderRadius: 10, background: "rgba(255,255,255,.05)" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: won ? gold : "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {won ? "👑 " : ""}{p.is_audience ? "👥 " : ""}{p.is_computer ? "🤖 " : ""}{p.name}{p.user_id === myUserId ? " (you)" : ""}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <b style={{ color: gold, fontSize: 18 }}>{p.score}</b>
            {asking && <span style={{ opacity: 0.85 }}>{p.answered ? "✅ answered" : `⏱ ${left}s`}</span>}
          </div>
          {helpable && p.user_id !== null && (
            <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
              {pill(`50/50 · ${game.prices["5050"]}`, () => onBuy(p.user_id!, "5050"))}
              {pill(`+10s · ${game.prices.time}`, () => onBuy(p.user_id!, "time"))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const winner = game.players.find((p) => p.side === game.result);
  let status = "";
  if (!active) status = game.status === "cancelled" ? "Game ended — no winner." : game.result === "draw" ? "It's a draw!" : `🏆 ${winner?.name ?? ""} wins ${game.players[0].score} – ${game.players[1].score}!`;
  else if (!asking && r) status = `The answer: ${r.right_answer ?? game.options[r.correct]}`;
  else if (canAnswer) status = "Pick your answer!";
  else if (me && game.my_answer !== null) status = "Answer locked in — waiting for the other side…";
  else if (iVote) status = `Vote for the audience's answer — ${game.prices.vote} coins a vote.`;
  else if (game.mode === "computer") status = "🤖 The computer is thinking…";

  return (
    <div style={{ position: "fixed", top: 96, left: 12, zIndex: 90, background: "rgba(0,0,0,.85)", border: `2px solid ${gold}`, borderRadius: 14, padding: 10, color: "#fff", width: "min(372px, calc(100vw - 24px))", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <b style={{ color: gold, fontSize: 14, flex: 1 }}>🧠 Trivia #{game.game_no}{active ? ` · Question ${game.q_number}/${game.q_count}` : ""}</b>
        {asking && <b style={{ fontVariantNumeric: "tabular-nums", color: Math.ceil((game.ms_left - since) / 1000) <= 5 ? RED : "#fff" }}>⏱ {Math.max(0, Math.ceil((game.ms_left - since) / 1000))}s</b>}
        {active && game.host_user_id === myUserId && (
          <button onClick={() => { if (window.confirm("End the Trivia game with no winner?")) onEnd(); }} style={{ fontSize: 11, fontWeight: 700, background: gold, color: "#000", border: "none", borderRadius: 999, padding: "2px 10px", cursor: "pointer" }}>End</button>
        )}
        <button onClick={() => setCollapsed((c) => !c)} style={{ background: "none", border: "none", color: gold, fontSize: 18, cursor: "pointer" }}>{collapsed ? "+" : "–"}</button>
        <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: "#fff", fontSize: 15, cursor: "pointer" }}>✕</button>
      </div>
      {!collapsed && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 6 }}>{playerRow(game.players[0])}{playerRow(game.players[1])}</div>
          {active && game.question && (
            <>
              <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3, padding: "4px 2px" }}>{game.question}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {game.options.map((o, i) => {
                  const st = answerStyle(i);
                  const clickable = (canAnswer && !st.removed) || iVote;
                  const votes = game.vote_tallies?.[i];
                  return (
                    <button key={i} disabled={!clickable}
                            onClick={() => (iVote ? onBuy(game.host_user_id, "vote", i) : onAnswer(i))}
                            style={{ display: "flex", alignItems: "center", gap: 8, textAlign: "left", padding: "9px 10px", borderRadius: 10, border: `2px solid ${st.border}`, background: st.bg, color: st.color,
                                     cursor: clickable ? "pointer" : "default", textDecoration: st.removed ? "line-through" : undefined, fontSize: 14 }}>
                      <b style={{ color: gold, width: 16 }}>{LETTERS[i]}</b><span style={{ flex: 1 }}>{o}</span>
                      {votes !== undefined && votes > 0 && <b style={{ color: BLUE }}>🗳 {votes}</b>}
                      {who(i)}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          <div style={{ fontSize: 12.5, fontWeight: 600, color: !active ? gold : "#fff" }}>{status}</div>
          {!asking && r && active && (
            <div style={{ fontSize: 12, opacity: 0.85 }}>{game.players[0].name.split(" ")[0]} +{r.points.one} · {game.players[1].name.split(" ")[0]} +{r.points.two}</div>
          )}
          {!active && game.results.length > 0 && (
            <div style={{ fontSize: 11.5, maxHeight: 150, overflowY: "auto", opacity: 0.9 }}>
              {game.results.map((x) => (
                <div key={x.q_index} style={{ padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
                  {x.q_index + 1}. {x.question} — <b style={{ color: GREEN }}>{x.right_answer}</b> <span style={{ color: gold }}>(+{x.points.one} / +{x.points.two})</span>
                </div>
              ))}
            </div>
          )}
          {game.events.length > 0 && active && (() => {
            const e = game.events[game.events.length - 1];
            const forName = game.players.find((p) => p.user_id === e.for_user_id)?.name ?? "the host";
            return <div style={{ fontSize: 11, opacity: 0.8 }}>{e.type === "vote" ? `${e.by} voted` : `${e.by} bought ${forName} ${e.type === "5050" ? "a 50/50" : "+10 seconds"}`}</div>;
          })()}
        </div>
      )}
    </div>
  );
}

/** The host's dialog: who they play, the computer's level, and the prices. */
export function TriviaStartDialog({ candidates, onStart, onClose }: {
  candidates: { userId: number; name: string }[];
  onStart: (s: TriviaStart) => void; onClose: () => void;
}) {
  const [mode, setMode] = useState<TriviaMode>(candidates.length ? "duel" : "computer");
  const [opponent, setOpponent] = useState<number | null>(candidates[0]?.userId ?? null);
  const [level, setLevel] = useState("medium");
  const [prices, setPrices] = useState({ "5050": 25, time: 15, vote: 5 });
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
        <h3 style={{ color: gold, margin: "0 0 4px", textAlign: "center" }}>🧠 Trivia</h3>
        <p style={{ fontSize: 12, opacity: 0.8, textAlign: "center", margin: "0 0 10px" }}>10 questions, 15 seconds each. A right answer scores 10, plus up to 5 for speed.</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 10 }}>
          {chip(mode === "duel", "Play someone", () => setMode("duel"))}
          {chip(mode === "audience", "Play the audience", () => setMode("audience"))}
          {chip(mode === "computer", "Play the computer", () => setMode("computer"))}
        </div>
        {mode === "duel" && (candidates.length === 0 ? <p style={{ fontSize: 13, opacity: 0.85 }}>Nobody is on screen with you yet — bring a guest up, or play the computer or the audience.</p> : (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Who are you playing?</div>
            {candidates.map((c) => (
              <label key={c.userId} style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", borderRadius: 10, background: opponent === c.userId ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.05)", marginBottom: 4, cursor: "pointer" }}>
                {c.name}<input type="radio" checked={opponent === c.userId} onChange={() => setOpponent(c.userId)} />
              </label>
            ))}
          </div>
        ))}
        {mode === "computer" && (
          <div style={{ marginBottom: 8 }}>
            <p style={{ fontSize: 13, opacity: 0.85, margin: "0 0 8px" }}>Easy gets about half right, Medium about 7 in 10, Hard about 9 in 10 — and Hard answers fast.</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              {["easy", "medium", "hard"].map((l) => <span key={l}>{chip(level === l, l[0].toUpperCase() + l.slice(1), () => setLevel(l))}</span>)}
            </div>
          </div>
        )}
        {mode === "audience" && <p style={{ fontSize: 13, opacity: 0.85, margin: "0 0 8px" }}>Everyone watching plays as one team: they vote for an answer and the most-voted answer is theirs. Every vote's coins come to you.</p>}
        <div style={{ fontSize: 13, fontWeight: 600, margin: "10px 0 2px" }}>Your prices</div>
        {mode === "audience" ? price("vote", "🗳 One vote") : (
          <>
            {price("5050", "50/50 (two wrong answers disappear)")}
            {price("time", "+10 seconds")}
            <div style={{ fontSize: 11, opacity: 0.7 }}>Viewers buy these for a player — the coins go to that player.</div>
          </>
        )}
        <button disabled={mode === "duel" && opponent === null}
                onClick={() => onStart({ mode, level: mode === "computer" ? level : undefined, opponent: mode === "duel" ? opponent ?? undefined : undefined, prices })}
                style={{ marginTop: 16, width: "100%", padding: "12px 0", borderRadius: 999, border: "none", background: gold, color: "#000", fontWeight: 700, fontSize: 16, cursor: "pointer", opacity: mode === "duel" && opponent === null ? 0.5 : 1 }}>Start</button>
      </div>
    </div>
  );
}
