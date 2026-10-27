// Trivia Night (#20, Steve 2026-10-27) — the quiz panel everyone in the room sees, and the host's
// start dialog. One question at a time; players on stage answer free, viewers pay the host's price
// per answer (a gift to the host). Right answers win points and bragging rights, never coins.
import { useEffect, useState } from "react";
import { fetchTriviaCategories, fetchTriviaFans, type TriviaCategory, type TriviaFanRow, type TriviaNight, type TriviaNightStart } from "../lib/trivianight";

const gold = "var(--gold, #F0C420)";
const LETTERS = ["A", "B", "C", "D"];
const btn = (primary = true): React.CSSProperties => ({ padding: "7px 12px", borderRadius: 999, border: primary ? "none" : `1.5px solid ${gold}`, background: primary ? gold : "transparent", color: primary ? "#000" : gold, fontWeight: 700, fontSize: 12.5, cursor: "pointer" });
const coins = (n: number) => `${n} coin${n === 1 ? "" : "s"}`;
const END_TEXT: Record<string, string> = { host: "The host ended Trivia Night.", out_of_questions: "That's every question in these categories!", room_ended: "The live ended.", expired: "Trivia Night timed out." };

function AnswerButton({ game, i, text, onAnswer }: { game: TriviaNight; i: number; text: string; onAnswer: (i: number) => void }) {
  const open = game.phase === "question";
  const r = game.result && game.result.q_number === game.q_number ? game.result : null;
  const mine = game.my_answer === i;
  const right = r?.correct === i;
  const total = r ? r.counts.reduce((a, b) => a + b, 0) : 0;
  const pct = r && total ? Math.round((100 * (r.counts[i] ?? 0)) / total) : null;
  const canTap = open && game.my_answer === null && !game.is_host;
  const border = r ? (right ? "#2fbf5b" : mine ? "#e5484d" : "rgba(240,196,32,.3)") : mine ? gold : "rgba(240,196,32,.45)";
  return (
    <button disabled={!canTap} onClick={() => onAnswer(i)}
            style={{ position: "relative", display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 10, textAlign: "left", overflow: "hidden",
                     color: "#fff", background: mine && !r ? "rgba(240,196,32,.18)" : "rgba(255,255,255,.06)", border: `2px solid ${border}`, cursor: canTap ? "pointer" : "default", minWidth: 0 }}>
      {pct !== null && <span style={{ position: "absolute", inset: 0, width: `${pct}%`, background: right ? "rgba(47,191,91,.3)" : "rgba(255,255,255,.08)", transition: "width .5s" }} />}
      <b style={{ position: "relative", color: gold, width: 16 }}>{LETTERS[i]}</b>
      <span style={{ position: "relative", flex: 1, fontSize: 13.5, fontWeight: right || mine ? 700 : 500 }}>{right ? "✅ " : r && mine ? "❌ " : ""}{text}</span>
      {pct !== null && <b style={{ position: "relative", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{pct}%</b>}
    </button>
  );
}

export function TriviaNightPanel({ game, myUserId, onAnswer, onPause, onEnd, onClose }: {
  game: TriviaNight; myUserId: number | null;
  onAnswer: (i: number) => void; onPause: (paused: boolean) => void; onEnd: () => void; onClose: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [fans, setFans] = useState<TriviaFanRow[] | null>(null);
  const [polledAt, setPolledAt] = useState(() => Date.now());
  const [, setTick] = useState(0);
  useEffect(() => { setPolledAt(Date.now()); }, [game]);
  useEffect(() => {
    if (game.phase !== "question") return;
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, [game.phase, game.q_number]);
  const over = game.status === "completed";
  const msLeft = game.ms_left === null ? 0 : Math.max(0, game.ms_left - (Date.now() - polledAt));
  const frac = game.question_seconds ? msLeft / (game.question_seconds * 1000) : 0;
  const viewer = !!myUserId && !game.is_host && !game.is_player;
  const leader = game.players[0];

  return (
    <div style={{ position: "fixed", top: 120, left: "50%", transform: "translateX(-50%)", zIndex: 87, width: "min(430px, calc(100vw - 24px))", boxSizing: "border-box",
                  background: "rgba(0,0,0,.9)", border: `2px solid ${gold}`, borderRadius: 16, padding: 12, color: "#fff", maxHeight: "calc(100vh - 220px)", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <b style={{ color: gold, fontSize: 14, flex: 1 }}>🧠 Trivia Night{game.q_number ? ` · Q${game.q_number}` : ""} · {coins(game.coins_per_answer)}</b>
        <button onClick={() => fetchTriviaFans().then(setFans)} style={{ background: "none", border: "none", color: gold, fontSize: 12, cursor: "pointer" }}>🏅 Top</button>
        <button onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? "Expand" : "Collapse"} style={{ background: "none", border: "none", color: gold, fontSize: 18, cursor: "pointer" }}>{collapsed ? "+" : "–"}</button>
        {over && <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: gold, fontSize: 16, cursor: "pointer" }}>✕</button>}
      </div>
      {!collapsed && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
          {game.question && !over && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <span style={{ padding: "2px 8px", borderRadius: 999, border: `1px solid ${gold}`, color: gold }}>{game.question.category_label}</span>
                <span style={{ opacity: 0.75, textTransform: "capitalize" }}>{game.question.difficulty}</span>
                <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: game.phase === "question" && msLeft < 5000 ? "#ff8a8a" : "#fff" }}>
                  {game.phase === "question" ? `⏱ ${Math.ceil(msLeft / 1000)}s` : game.phase === "waiting" ? "⏸ Paused" : "Answer!"}
                </span>
              </div>
              {game.phase === "question" && (
                <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,.12)", overflow: "hidden" }}>
                  <div style={{ width: `${frac * 100}%`, height: "100%", background: frac < 0.25 ? "#e5484d" : gold, transition: "width .25s linear" }} />
                </div>
              )}
              <div style={{ fontSize: 16.5, fontWeight: 800, lineHeight: 1.3, textWrap: "balance" } as React.CSSProperties}>{game.question.text}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 6 }}>
                {game.question.answers.map((a, i) => <AnswerButton key={i} game={game} i={i} text={a} onAnswer={onAnswer} />)}
              </div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>
                {game.phase === "question"
                  ? (game.my_answer !== null ? `Locked in: ${LETTERS[game.my_answer]} · ${game.answered_count} answered` : viewer ? `Tap an answer — ${coins(game.coins_per_answer)}, one per question · ${game.answered_count} answered` : game.is_player ? `You're on stage — your answers are free · ${game.answered_count} answered` : `${game.answered_count} answered`)
                  : game.result ? `${game.result.right_count} got it right${game.my_last_points !== null ? (game.my_last_points > 0 ? ` · +${game.my_last_points} for you!` : " · not this time") : ""}` : ""}
              </div>
            </>
          )}
          {game.phase === "waiting" && !over && <div style={{ opacity: 0.85 }}>⏸ The host paused after that answer.</div>}
          {over && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <b style={{ color: gold, fontSize: 15 }}>🏁 Trivia Night #{game.game_no} is over</b>
              <span style={{ opacity: 0.85, fontSize: 12.5 }}>{END_TEXT[game.end_reason ?? ""] ?? ""} {game.q_number} question{game.q_number === 1 ? "" : "s"}.</span>
              {leader && leader.points > 0 && <span>🏆 <b>{leader.name}</b> wins with {leader.points} points!</span>}
            </div>
          )}

          {game.players.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {game.players.map((p, i) => (
                <span key={p.user_id} style={{ fontSize: 12, padding: "4px 9px", borderRadius: 999, background: i === 0 && p.points > 0 ? "rgba(240,196,32,.22)" : "rgba(255,255,255,.08)", border: `1px solid ${i === 0 && p.points > 0 ? gold : "transparent"}` }}>
                  {i === 0 && p.points > 0 ? "👑 " : ""}{p.name} <b style={{ color: gold }}>{p.points}</b>
                </span>
              ))}
            </div>
          )}
          {game.audience_top.length > 0 && (
            <div style={{ fontSize: 12, opacity: 0.9 }}>👥 Audience: {game.audience_top.slice(0, 3).map((p, i) => `${["🥇", "🥈", "🥉"][i]} ${p.name} ${p.points}`).join("  ")}</div>
          )}
          {(game.my_points > 0 || game.my_streak > 1) && !game.is_host && (
            <div style={{ fontSize: 12, color: gold }}>You: {game.my_points} points{game.my_rank ? ` · #${game.my_rank} in the audience` : ""}{game.my_streak > 1 ? ` · 🔥 ${game.my_streak} in a row` : ""}</div>
          )}
          {!myUserId && !over && <div style={{ fontSize: 12, opacity: 0.8 }}>Sign in to answer.</div>}

          {game.is_host && !over && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", borderTop: "1px solid rgba(240,196,32,.3)", paddingTop: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, opacity: 0.85, flex: 1 }}>💰 {game.coins_total} coins</span>
              <button onClick={() => onPause(!game.paused)} style={btn(false)}>{game.paused ? "▶ Resume" : "⏸ Pause after this one"}</button>
              <button onClick={onEnd} style={btn()}>End</button>
            </div>
          )}
          <div style={{ fontSize: 10.5, opacity: 0.6 }}>For fun only — right answers win points and bragging rights, never coins.</div>
        </div>
      )}
      {fans && (
        <div role="dialog" onClick={() => setFans(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 100, display: "grid", placeItems: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#000", border: `2px solid ${gold}`, borderRadius: 16, padding: 16, width: "min(380px, 100%)", boxSizing: "border-box", maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <button onClick={() => setFans(null)} aria-label="Back" style={{ width: 34, height: 34, borderRadius: "50%", border: `1.5px solid ${gold}`, background: "#000", color: gold, fontSize: 20, cursor: "pointer" }}>‹</button>
              <b style={{ color: gold, fontSize: 17 }}>🏅 Top Trivia Fans</b>
            </div>
            {fans.length === 0 ? <p style={{ opacity: 0.8 }}>No right answers yet — be the first!</p> : fans.map((r) => (
              <div key={r.user_id} style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,.08)", fontSize: 13 }}>
                <b style={{ width: 24, color: gold }}>{r.rank}</b><span style={{ flex: 1 }}>{r.name}</span>
                <span>🔥 {r.best_streak}</span><span style={{ opacity: 0.75, fontVariantNumeric: "tabular-nums" }}>✅ {r.correct}/{r.answered}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Host: categories, difficulty, the timer (15–30s), the price (1–25) and the players. */
export function TriviaNightStartDialog({ people, onStart, onClose }: {
  people: { userId: number; name: string }[]; onStart: (s: TriviaNightStart) => void; onClose: () => void;
}) {
  const [cats, setCats] = useState<TriviaCategory[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState("mixed");
  const [seconds, setSeconds] = useState(20);
  const [price, setPrice] = useState(5);
  const [players, setPlayers] = useState<number[]>([]);
  useEffect(() => { fetchTriviaCategories().then(setCats); }, []);
  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const chip = (on: boolean, label: string, onClick: () => void) => (
    <button key={label} onClick={onClick} style={{ padding: "6px 11px", borderRadius: 999, border: `1.5px solid ${gold}`, background: on ? gold : "transparent", color: on ? "#000" : gold, fontWeight: 700, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap" }}>{label}</button>
  );
  const label = (t: string) => <div style={{ fontSize: 13, fontWeight: 600, margin: "6px 0 4px" }}>{t}</div>;
  return (
    <div role="dialog" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#000", border: `2px solid ${gold}`, borderRadius: 16, padding: 16, maxWidth: 420, width: "100%", boxSizing: "border-box", color: "#fff", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <button onClick={onClose} aria-label="Back" style={{ width: 34, height: 34, flex: "none", borderRadius: "50%", border: `1.5px solid ${gold}`, background: "#000", color: gold, fontSize: 20, cursor: "pointer" }}>‹</button>
          <h3 style={{ color: gold, margin: 0 }}>🧠 Trivia Night</h3>
        </div>
        <p style={{ fontSize: 12, opacity: 0.8, margin: "4px 0 8px" }}>Questions keep coming, one at a time, until you end it. Players on stage answer free; everyone watching pays your price per answer — the coins come to you. Right answers win points, not coins.</p>
        {label(picked.length ? `Categories (${picked.length})` : "Categories — all of them")}
        {cats === null ? <p style={{ opacity: 0.7 }}>Loading…</p> : cats.length === 0 ? (
          <p style={{ fontSize: 13, opacity: 0.85 }}>Couldn't load the categories. <button onClick={() => { setCats(null); fetchTriviaCategories().then(setCats); }} style={{ background: "none", border: "none", color: gold, fontWeight: 700, cursor: "pointer" }}>Retry</button></p>
        ) : (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {chip(picked.length === 0, "🌐 All", () => setPicked([]))}
            {cats.map((c) => chip(picked.includes(c.key), `${c.emoji} ${c.label}`, () => toggle(c.key)))}
          </div>
        )}
        {label("Difficulty")}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{["mixed", "easy", "medium", "hard"].map((d) => chip(difficulty === d, d[0].toUpperCase() + d.slice(1), () => setDifficulty(d)))}</div>
        <label style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 8, fontSize: 13 }}>
          <span>Time per question: <b style={{ color: gold }}>{seconds} seconds</b></span>
          <input type="range" min={15} max={30} step={5} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} style={{ accentColor: "#F0C420" }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4, fontSize: 13 }}>
          <span>Price of an answer: <b style={{ color: gold }}>{coins(price)}</b></span>
          <input type="range" min={1} max={25} value={price} onChange={(e) => setPrice(Number(e.target.value))} style={{ accentColor: "#F0C420" }} />
        </label>
        {label("Who's playing on stage? (optional, up to 4 — they answer free)")}
        {people.map((p) => (
          <label key={p.userId} style={{ display: "flex", justifyContent: "space-between", padding: "7px 10px", borderRadius: 9, background: players.includes(p.userId) ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.05)", marginBottom: 4, cursor: "pointer", fontSize: 13 }}>
            {p.name}<input type="checkbox" checked={players.includes(p.userId)} onChange={() => setPlayers((x) => (x.includes(p.userId) ? x.filter((y) => y !== p.userId) : x.length >= 4 ? x : [...x, p.userId]))} />
          </label>
        ))}
        <button disabled={cats !== null && cats.length === 0} onClick={() => onStart({ categories: picked, difficulty, seconds, price, playerIds: players })}
                style={{ ...btn(), width: "100%", marginTop: 12, padding: "12px 0", fontSize: 16 }}>Start Trivia Night</button>
      </div>
    </div>
  );
}
