// Trivia Battle panel (Steve, 2026-10-27). The black-and-gold panel the board battles use: the two
// players with their scores (and small live screens), the question, four answers, and — for
// viewers — lifelines to buy a player or, in an audience game, a paid vote on an answer.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { LiveTile } from "../lib/live";
import type { TriviaGame, TriviaMode, TriviaPlayer, TriviaStart } from "../lib/trivia";
import { Confetti, CountdownRing, MuteButton, Podium, SceneBanner, SceneChips, firstName, sceneForTrivia } from "./GameShow";
import { haptic, sfx } from "../lib/gameSounds";

const gold = "var(--gold, #F0C420)";
const LETTERS = ["A", "B", "C", "D"];
const GREEN = "#2fbf5b", RED = "#e5484d", BLUE = "#49a8ff";
// Game Show (Steve, 2026-10-27: the games look like "plain text"): the same four tile colours as
// Trivia Night, so A/B/C/D read the same in both quizzes.
const TILE_COLORS = ["#D85A30", "#1D9E75", "#378ADD", "#BA7517"];

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
  // Game Show: a drum roll before each answer is shown, a chime (and confetti) when you're right,
  // a fanfare and the podium at the end. Fired on CHANGES only — the ref holds what the last poll
  // said, so a poll that brings the same state back plays nothing.
  const [drumroll, setDrumroll] = useState(false);
  const [burst, setBurst] = useState(0);
  const scoresOf = (g: TriviaGame) => Object.fromEntries(g.players.map((p) => [p.side, p.score])) as Record<string, number>;
  const prev = useRef({ id: game.trivia_game_id, status: game.status, phase: game.phase, q: game.q_number, mine: game.my_answer, scores: scoresOf(game) });
  // The scores from before the reveal, shown during the drum roll so they don't give it away.
  const [heldScores, setHeldScores] = useState<Record<string, number> | null>(null);
  const drumTimer = useRef<number | undefined>(undefined);
  const lastTick = useRef(-1);
  useEffect(() => () => window.clearTimeout(drumTimer.current), []);
  useEffect(() => { setPolledAt(Date.now()); }, [game]);
  useEffect(() => {
    if (game.status !== "active") return;
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, [game.status, game.trivia_game_id]);
  // A layout effect, so the drum roll is up before the browser paints the revealed answer.
  useLayoutEffect(() => {
    const was = prev.current;
    prev.current = { id: game.trivia_game_id, status: game.status, phase: game.phase, q: game.q_number, mine: game.my_answer, scores: scoresOf(game) };
    if (was.id !== game.trivia_game_id) { window.clearTimeout(drumTimer.current); setDrumroll(false); return; }
    if (was.mine === null && game.my_answer !== null && was.q === game.q_number) { sfx.lock(); haptic(25); }
    if (was.status === "active" && game.status !== "active") {
      window.clearTimeout(drumTimer.current); setDrumroll(false);
      if (game.status !== "cancelled" && (game.result === "one" || game.result === "two")) { sfx.fanfare(); setBurst(Date.now()); }
      else sfx.reveal();
      return;
    }
    if (game.status === "active" && game.phase === "reveal" && was.phase === "question" && game.last_result) {
      const r = game.last_result;
      const mySide = game.players.find((p) => p.user_id === myUserId)?.side ?? null;
      const myPick = mySide ? r.answers[mySide] : null;
      setDrumroll(true); setHeldScores(was.scores); sfx.drumroll();
      window.clearTimeout(drumTimer.current);
      drumTimer.current = window.setTimeout(() => {
        setDrumroll(false);
        if (mySide && myPick === r.correct) { sfx.correct(); haptic([40, 60, 40]); setBurst(Date.now()); }
        else if (mySide) { sfx.wrong(); haptic(80); }
        else sfx.reveal();
      }, 900);
    }
    // Only the fields that mark a change: last_result and players are new objects on every poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.trivia_game_id, game.status, game.phase, game.q_number, game.my_answer, game.result]);
  const since = Date.now() - polledAt;

  const active = game.status === "active";
  const asking = active && game.phase === "question";
  const me = game.players.find((p) => p.user_id === myUserId) ?? null;
  const iVote = asking && game.mode === "audience" && myUserId !== game.host_user_id;
  // Held back during the drum roll, so the right answer lands with the reveal.
  const r = drumroll ? null : game.last_result;
  const mySecondsLeft = me ? Math.max(0, Math.ceil((me.ms_left - since) / 1000)) : Math.max(0, Math.ceil((game.ms_left - since) / 1000));
  const canAnswer = asking && me !== null && game.my_answer === null && mySecondsLeft > 0;
  const ringMs = Math.max(0, (me ? me.ms_left : game.ms_left) - since);
  const ringSecs = Math.ceil(ringMs / 1000);
  if (asking && ringSecs <= 5 && ringSecs > 0 && lastTick.current !== ringSecs) { lastTick.current = ringSecs; sfx.tick(); }

  const answerStyle = (i: number) => {
    const removed = asking && game.my_removed.includes(i);
    const mine = asking && game.my_answer === i;
    const right = !asking && !!r && i === r.correct;
    const wrongPick = !asking && !!r && !right && (r.answers.one === i || r.answers.two === i);
    return { removed, mine, right, wrongPick, dim: (!asking && !!r && !right) || removed };
  };

  const who = (i: number) => {
    if (asking || !r) return null;
    const marks: string[] = [];
    if (r.answers.one === i) marks.push(game.players[0].is_audience ? "👥" : (game.players[0].name.split(" ")[0]));
    if (r.answers.two === i) marks.push(game.players[1].is_audience ? "👥" : game.players[1].is_computer ? "🤖" : (game.players[1].name.split(" ")[0]));
    return marks.length ? <span style={{ fontSize: 10.5, fontWeight: 800, background: "rgba(0,0,0,.35)", borderRadius: 999, padding: "1px 6px", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{marks.join(", ")}</span> : null;
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
            <b style={{ color: gold, fontSize: 18 }}>{shownScore(p)}</b>
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
  const loser = game.players.find((p) => p.side !== game.result);
  const short = (p: TriviaPlayer) => (p.is_audience ? "👥" : p.is_computer ? "🤖" : firstName(p.name));
  const shownScore = (p: TriviaPlayer) => (drumroll && heldScores ? (heldScores[p.side] ?? p.score) : p.score);
  let status = "";
  // The winner's score first: "🏆 Maria wins 44 – 20!"
  if (!active) status = game.status === "cancelled" ? "Game ended — no winner." : game.result === "draw" ? "It's a draw!" : `🏆 ${winner?.name ?? ""} wins ${winner?.score ?? 0} – ${loser?.score ?? 0}!`;
  else if (drumroll) status = "🥁 And the answer is…";
  else if (!asking && r) status = `The answer: ${r.right_answer ?? game.options[r.correct]}`;
  else if (canAnswer) status = "Pick your answer!";
  else if (me && game.my_answer !== null) status = "Answer locked in — waiting for the other side…";
  else if (iVote) status = `Vote for the audience's answer — ${game.prices.vote} coins a vote.`;
  else if (game.mode === "computer") status = "🤖 The computer is thinking…";

  const podium = !active && game.status !== "cancelled"
    ? [...game.players].sort((a, b) => b.score - a.score).map((p) => ({ name: p.name, value: `${p.score} pts` }))
    : [];

  return (
    <div style={{ position: "fixed", top: 96, left: 12, zIndex: 90, background: "rgba(0,0,0,.85)", border: `2px solid ${gold}`, borderRadius: 14, padding: 10, color: "#fff", width: "min(372px, calc(100vw - 24px))", boxSizing: "border-box" }}>
      <Confetti burst={burst} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <b style={{ color: gold, fontSize: 14, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>🧠 Trivia #{game.game_no}</b>
        <MuteButton />
        {asking && collapsed && <b style={{ fontVariantNumeric: "tabular-nums", color: Math.ceil((game.ms_left - since) / 1000) <= 5 ? RED : "#fff" }}>⏱ {Math.max(0, Math.ceil((game.ms_left - since) / 1000))}s</b>}
        {active && game.host_user_id === myUserId && (
          <button onClick={() => { if (window.confirm("End the Trivia game with no winner?")) onEnd(); }} style={{ fontSize: 11, fontWeight: 700, background: gold, color: "#000", border: "none", borderRadius: 999, padding: "2px 10px", cursor: "pointer" }}>End</button>
        )}
        <button onClick={() => setCollapsed((c) => !c)} style={{ background: "none", border: "none", color: gold, fontSize: 18, cursor: "pointer" }}>{collapsed ? "+" : "–"}</button>
        <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: "#fff", fontSize: 15, cursor: "pointer" }}>✕</button>
      </div>
      {!collapsed && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <SceneBanner scene={sceneForTrivia(game.category)} height={68}>
            {asking && <div style={{ position: "absolute", left: 6, top: 6, zIndex: 3 }}><CountdownRing msLeft={ringMs} totalMs={Math.max(ringMs, game.question_seconds * 1000)} size={44} /></div>}
            {/* The score and the question number live here — the title stays "Trivia #N". */}
            <SceneChips bottomRight={[
              ...(game.players.length === 2 ? [[`${short(game.players[0])} ${shownScore(game.players[0])} – ${shownScore(game.players[1])} ${short(game.players[1])}`, false] as [string, boolean]] : []),
              ...(active && game.q_number > 0 ? [[`Q ${game.q_number}/${game.q_count}`, true] as [string, boolean]] : []),
            ]} />
            {drumroll && <div style={{ position: "absolute", inset: 0, zIndex: 4, display: "grid", placeItems: "center", background: "rgba(0,0,0,.45)", fontSize: 17, fontWeight: 900, textShadow: "0 2px 4px #000" }}><span className="gs-anim" style={{ animation: "gs-shake .25s linear infinite" }}>🥁 And the answer is…</span></div>}
            {!active && (
              <div style={{ position: "absolute", inset: 0, zIndex: 4, display: "grid", placeItems: "center", background: "rgba(0,0,0,.4)", padding: "0 10px", textAlign: "center" }}>
                <span className="gs-anim" style={{ fontSize: 16, fontWeight: 900, textShadow: "0 2px 4px #000", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", animation: winner ? "gs-pop .8s ease-in-out 3" : "none" }}>
                  {game.status === "cancelled" ? "Game ended" : game.result === "draw" ? "🤝 It's a draw!" : `👑 ${winner?.name ?? ""} wins!`}
                </span>
              </div>
            )}
          </SceneBanner>
          <div style={{ display: "flex", gap: 6 }}>{playerRow(game.players[0])}{playerRow(game.players[1])}</div>
          {active && game.question && (
            <>
              <div style={{ fontSize: 16, fontWeight: 900, lineHeight: 1.3, padding: "2px", textAlign: "center", textWrap: "balance" } as React.CSSProperties}>{game.question}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {game.options.map((o, i) => {
                  const st = answerStyle(i);
                  const clickable = (canAnswer && !st.removed) || iVote;
                  const votes = game.vote_tallies?.[i];
                  return (
                    <button key={i} disabled={!clickable} className="gs-anim"
                            onClick={() => (iVote ? onBuy(game.host_user_id, "vote", i) : onAnswer(i))}
                            style={{ position: "relative", minHeight: 54, minWidth: 0, padding: "7px 8px", borderRadius: 12, textAlign: "left", overflow: "hidden", color: "#fff",
                                     background: st.removed ? "#3a3a3a" : TILE_COLORS[i % TILE_COLORS.length], border: `3px solid ${st.right || st.mine ? "#fff" : st.wrongPick ? RED : "transparent"}`,
                                     cursor: clickable ? "pointer" : "default", opacity: st.dim ? 0.4 : 1, animation: st.right ? "gs-pop .5s ease-in-out 3" : "none", transition: "opacity .4s",
                                     display: "flex", flexDirection: "column", gap: 3 }}>
                      <span style={{ display: "flex", alignItems: "flex-start", gap: 6, minWidth: 0, width: "100%" }}>
                        <b style={{ background: "rgba(0,0,0,.28)", borderRadius: 7, padding: "1px 6px", fontSize: 12.5, flex: "none" }}>{LETTERS[i]}</b>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 800, lineHeight: 1.2, overflowWrap: "anywhere", textShadow: "0 1px 2px rgba(0,0,0,.35)", textDecoration: st.removed ? "line-through" : undefined }}>
                          {st.right ? "✅ " : st.wrongPick ? "❌ " : ""}{o}
                        </span>
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", fontSize: 10.5, fontWeight: 800, minWidth: 0, width: "100%" }}>
                        {st.mine && <span>⭐ your answer</span>}
                        {votes !== undefined && votes > 0 && <span style={{ background: "rgba(0,0,0,.35)", borderRadius: 999, padding: "1px 6px", color: BLUE }}>🗳 {votes}</span>}
                        {who(i)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          <div style={{ fontSize: 12.5, fontWeight: 600, color: !active ? gold : "#fff", textAlign: "center" }}>{status}</div>
          {podium.length > 0 && <Podium rows={podium} />}
          {!asking && r && active && (
            <div style={{ fontSize: 12, opacity: 0.85 }}>{game.players[0].name.split(" ")[0]} +{r.points.one} · {game.players[1].name.split(" ")[0]} +{r.points.two}</div>
          )}
          {!active && game.results.length > 0 && (
            <div style={{ fontSize: 11.5, maxHeight: 150, overflowY: "auto", opacity: 0.9 }}>
              {game.results.map((x) => (
                <div key={x.q_index} style={{ padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
                  {x.q_index + 1}. {x.question} — <b style={{ color: GREEN }}>{x.right_answer}</b> <span style={{ color: gold }}>{short(game.players[0])} +{x.points.one} · {short(game.players[1])} +{x.points.two}</span>
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
        <p style={{ fontSize: 12, opacity: 0.8, textAlign: "center", margin: "0 0 10px" }}>10 questions, 15 seconds each. A right answer scores 10, plus up to 5 for speed{mode === "audience" ? " (players only)" : ""}.</p>
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
