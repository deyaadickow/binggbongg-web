// Guessing Games (Steve, 2026-10-27) — the card everyone in the room sees, and the host's start
// dialog. One paid guess per viewer (the host's price, a gift to the host), free to change until
// guessing locks; the host enters the answer and the closest guesses win — bragging rights only.
import { useEffect, useMemo, useRef, useState } from "react";
import { Confetti, CountdownRing, MuteButton, Podium, SceneBanner, sceneForGuess, type Lane } from "./GameShow";
import { haptic, sfx } from "../lib/gameSounds";
import {
  fetchGuessLeaderboard, fetchGuessTemplates, GUESS_PRICE_MAX, GUESS_PRICE_MIN,
  type GuessGame, type GuessKind, type GuessStart, type GuessTemplate, type GuessValue, type GuesserRow,
} from "../lib/guess";

const gold = "var(--gold, #F0C420)";
const OPTION_COLORS = ["#D85A30", "#1D9E75", "#378ADD", "#BA7517", "#8E5BD9", "#D4537E", "#16A3A3", "#6B7280"];
const field: React.CSSProperties = { padding: "7px 9px", borderRadius: 8, border: `1px solid ${gold}`, background: "#111", color: "#fff", fontSize: 14, minWidth: 0, boxSizing: "border-box" };
const btn = (primary = true): React.CSSProperties => ({ padding: "8px 12px", borderRadius: 999, border: primary ? "none" : `1.5px solid ${gold}`, background: primary ? gold : "transparent", color: primary ? "#000" : gold, fontWeight: 700, fontSize: 13, cursor: "pointer" });

const asInt = (s: string) => (/^\d+$/.test(s.trim()) ? parseInt(s.trim(), 10) : null);

/** The number / score entry used both for a viewer's guess and the host's answer. */
function ValueInput({ game, initial, label, onSubmit }: { game: GuessGame; initial: GuessValue | null; label: string; onSubmit: (v: GuessValue) => void }) {
  const [n, setN] = useState(initial?.n !== undefined ? String(initial.n) : "");
  const [a, setA] = useState(initial?.a !== undefined ? String(initial.a) : "");
  const [b, setB] = useState(initial?.b !== undefined ? String(initial.b) : "");
  if (game.kind === "number") {
    const v = asInt(n);
    return (
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input inputMode="numeric" value={n} onChange={(e) => setN(e.target.value.replace(/[^\d]/g, "").slice(0, 7))} placeholder="0" style={{ ...field, width: 90 }} />
        {game.unit && <span style={{ fontSize: 12, opacity: 0.8, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{game.unit}</span>}
        <button disabled={v === null} onClick={() => v !== null && onSubmit({ n: v })} style={{ ...btn(), marginLeft: "auto", opacity: v === null ? 0.5 : 1 }}>{label}</button>
      </div>
    );
  }
  const va = asInt(a), vb = asInt(b);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 12, width: 70, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{game.options[0]}</span>
        <input inputMode="numeric" value={a} onChange={(e) => setA(e.target.value.replace(/[^\d]/g, "").slice(0, 3))} placeholder="0" style={{ ...field, width: 56 }} />
        <span>–</span>
        <input inputMode="numeric" value={b} onChange={(e) => setB(e.target.value.replace(/[^\d]/g, "").slice(0, 3))} placeholder="0" style={{ ...field, width: 56 }} />
        <span style={{ fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{game.options[1]}</span>
      </div>
      <button disabled={va === null || vb === null} onClick={() => va !== null && vb !== null && onSubmit({ a: va, b: vb })} style={{ ...btn(), opacity: va === null || vb === null ? 0.5 : 1 }}>{label}</button>
    </div>
  );
}

export function GuessCard({ game, myUserId, onGuess, onLock, onResolve, onCancel, onClose }: {
  game: GuessGame; myUserId: number | null;
  onGuess: (v: GuessValue) => void; onLock: () => void; onResolve: (v: GuessValue) => void; onCancel: () => void;
  /** A finished game can be closed straight away (Steve, 2026-10-27) instead of waiting out its 90s. */
  onClose: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [board, setBoard] = useState<GuesserRow[] | null>(null);
  const [answering, setAnswering] = useState<number | null>(null);   // host: the pick they are about to confirm
  const [polledAt, setPolledAt] = useState(() => Date.now());
  const [, setTick] = useState(0);
  // Game Show (Steve, 2026-10-27): a drum roll before the answer, then confetti for the winners.
  const [drumroll, setDrumroll] = useState(false);
  const [burst, setBurst] = useState(0);
  const prevStatus = useRef(game.status);
  const prevMine = useRef(game.my_guess);
  const lastTick = useRef(-1);
  useEffect(() => { setPolledAt(Date.now()); }, [game]);
  useEffect(() => {
    if (game.status !== "open" || game.lock_ms_left === null) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [game.status, game.lock_ms_left, game.guess_game_id]);
  useEffect(() => {
    if (!prevMine.current && game.my_guess) { sfx.lock(); haptic(25); }
    prevMine.current = game.my_guess;
  }, [game.my_guess]);
  useEffect(() => {
    const was = prevStatus.current; prevStatus.current = game.status;
    if (game.status === "resolved" && (was === "open" || was === "locked")) {
      setDrumroll(true); sfx.drumroll();
      const t = window.setTimeout(() => {
        setDrumroll(false);
        if (game.my_is_winner === true) { sfx.correct(); haptic([40, 60, 40]); } else if (game.my_is_winner === false) { sfx.wrong(); haptic(80); } else sfx.reveal();
        if (game.winners_count > 0) setBurst(Date.now());
      }, 1100);
      return () => window.clearTimeout(t);
    }
  }, [game.status, game.my_is_winner, game.winners_count]);

  const open = game.status === "open";
  const live = open || game.status === "locked";
  const resolved = game.status === "resolved" && !drumroll;
  const viewer = !!myUserId && !game.is_host && !game.is_player;
  const msLeft = game.lock_ms_left === null ? null : Math.max(0, game.lock_ms_left - (Date.now() - polledAt));
  const secsLeft = msLeft === null ? null : Math.ceil(msLeft / 1000);
  if (secsLeft !== null && open && secsLeft <= 5 && secsLeft > 0 && lastTick.current !== secsLeft) { lastTick.current = secsLeft; sfx.tick(); }
  const tallies = game.tallies ?? [];
  const maxTally = Math.max(1, ...tallies);
  const totalTally = tallies.reduce((x, y) => x + y, 0);
  const guessLabel = game.my_guess ? "Change guess (free)" : `Guess · ${game.coins_per_guess} coin${game.coins_per_guess === 1 ? "" : "s"}`;
  const { scene, racer } = sceneForGuess(game.template_key, game.kind);
  const racing = game.kind === "pick" && !!racer && game.options.length <= 4;
  const lanes: Lane[] | undefined = racing ? game.options.map((o, i) => {
    const won = resolved && game.answer?.choice === i;
    return { label: o, emoji: racer!, progress: won ? 1 : 0.1 + 0.62 * ((tallies[i] ?? 0) / maxTally), winner: won, loser: resolved && !won };
  }) : undefined;

  return (
    <div style={{ position: "fixed", left: 12, bottom: 96, zIndex: 86, width: "min(320px, calc(100vw - 24px))", boxSizing: "border-box", background: "rgba(0,0,0,.9)", border: `2px solid ${gold}`, borderRadius: 16, padding: 10, color: "#fff", maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}>
      <Confetti burst={burst} />
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <b style={{ color: gold, fontSize: 13, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{game.emoji} #{game.game_no} · {game.coins_per_guess} coin{game.coins_per_guess === 1 ? "" : "s"}{game.my_streak > 0 ? ` · 🔥 ${game.my_streak}` : ""}</b>
        <MuteButton />
        <button onClick={() => fetchGuessLeaderboard().then(setBoard)} style={{ background: "none", border: "none", color: gold, fontSize: 12, cursor: "pointer" }}>🏅 Top</button>
        <button onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? "Expand" : "Collapse"} style={{ background: "none", border: "none", color: gold, fontSize: 18, cursor: "pointer" }}>{collapsed ? "+" : "–"}</button>
        {game.status === "resolved" && <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: gold, fontSize: 16, cursor: "pointer" }}>✕</button>}
      </div>
      {!collapsed && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6, fontSize: 12.5 }}>
          <SceneBanner scene={scene} height={racing ? 128 : 100} lanes={lanes}>
            {open && msLeft !== null && <div style={{ position: "absolute", left: 6, top: 6 }}><CountdownRing msLeft={msLeft} totalMs={Math.max(msLeft, 60000)} size={40} /></div>}
            {game.status === "locked" && <div style={{ position: "absolute", left: 6, top: 6, background: "rgba(0,0,0,.6)", borderRadius: 999, padding: "3px 9px", fontSize: 12, fontWeight: 800 }}>🔒 Locked</div>}
            {drumroll && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(0,0,0,.45)", fontSize: 18, fontWeight: 900, textShadow: "0 2px 4px #000" }}><span className="gs-anim" style={{ animation: "gs-shake .25s linear infinite" }}>🥁 And the answer is…</span></div>}
            {resolved && game.answer_label && !racing && <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", background: "rgba(0,0,0,.72)", border: `2px solid ${gold}`, borderRadius: 12, padding: "6px 12px", fontSize: 16, fontWeight: 900, whiteSpace: "nowrap", maxWidth: "88%", overflow: "hidden", textOverflow: "ellipsis" }}>✅ {game.answer_label}</div>}
          </SceneBanner>
          <div style={{ fontSize: 15.5, fontWeight: 800, lineHeight: 1.25, textWrap: "balance" } as React.CSSProperties}>{game.title}</div>
          {game.players.length > 0 && game.kind !== "pick" && <div style={{ opacity: 0.8 }}>🎮 {game.players.map((p) => p.name).join(" · ")}</div>}
          <div style={{ opacity: 0.85 }}>
            {open ? (secsLeft !== null ? `Guessing closes in ${Math.floor(secsLeft / 60)}:${String(secsLeft % 60).padStart(2, "0")}` : "Guessing is open") : game.status === "locked" ? "Guessing closed — watch what happens!" : drumroll ? "…" : `Answer: ${game.answer_label}`}
            {` · ${game.guesses_count} guess${game.guesses_count === 1 ? "" : "es"}`}
          </div>

          {game.kind === "pick" && (
            <div style={{ display: "grid", gridTemplateColumns: game.options.length <= 4 ? "1fr 1fr" : "1fr", gap: 6 }}>
              {game.options.map((o, i) => {
                const mine = game.my_guess?.choice === i;
                const right = resolved && game.answer?.choice === i;
                const count = tallies[i] ?? 0;
                const canTap = (open && viewer && !mine) || (game.is_host && live);
                return (
                  <button key={i} disabled={!canTap}
                          onClick={() => { if (game.is_host) setAnswering(i); else onGuess({ choice: i }); }}
                          className="gs-anim"
                          style={{ position: "relative", minHeight: 48, padding: "8px 9px", borderRadius: 11, overflow: "hidden", textAlign: "left", cursor: canTap ? "pointer" : "default", color: "#fff",
                                   background: OPTION_COLORS[i % OPTION_COLORS.length], border: `3px solid ${right ? "#fff" : mine ? "#fff" : "transparent"}`,
                                   opacity: resolved && !right ? 0.4 : 1, animation: right ? "gs-pop .5s ease-in-out 3" : "none", transition: "opacity .4s" }}>
                    <span style={{ position: "absolute", left: 0, bottom: 0, height: 5, width: `${totalTally ? (100 * count) / totalTally : 0}%`, background: "rgba(255,255,255,.7)", transition: "width .5s" }} />
                    <span style={{ position: "relative", display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ flex: 1, fontSize: 13.5, fontWeight: 800, textShadow: "0 1px 2px rgba(0,0,0,.4)" }}>{right ? "✅ " : ""}{o}</span>
                      <b style={{ fontVariantNumeric: "tabular-nums", background: "rgba(0,0,0,.3)", borderRadius: 999, padding: "1px 7px", fontSize: 12 }}>{count}</b>
                    </span>
                    {mine && <span style={{ position: "relative", fontSize: 10.5, fontWeight: 800 }}>⭐ your pick</span>}
                  </button>
                );
              })}
            </div>
          )}
          {game.kind === "pick" && open && viewer && <div style={{ fontSize: 11, opacity: 0.7 }}>{game.my_guess ? "Tap another choice to change it — free until guessing closes." : `Tap your pick — ${game.coins_per_guess} coin${game.coins_per_guess === 1 ? "" : "s"}, one guess each.`}</div>}

          {game.kind !== "pick" && open && viewer && (
            <ValueInput key={`g${game.guess_game_id}`} game={game} initial={game.my_guess} label={guessLabel} onSubmit={onGuess} />
          )}
          {game.my_guess_label && game.kind !== "pick" && live && <div>Your guess: <b style={{ color: gold }}>{game.my_guess_label}</b></div>}
          {!myUserId && open && <div style={{ opacity: 0.8 }}>Sign in to guess.</div>}
          {game.is_player && live && <div style={{ opacity: 0.8 }}>You're playing — the room is guessing about you!</div>}

          {game.is_host && live && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid rgba(240,196,32,.3)", paddingTop: 8 }}>
              <div style={{ opacity: 0.85 }}>💰 {game.coins_total} coins from {game.guesses_count} guess{game.guesses_count === 1 ? "" : "es"}</div>
              {open && <button onClick={onLock} style={btn(false)}>🔒 Lock guessing now</button>}
              <div style={{ fontWeight: 700 }}>What really happened?</div>
              {game.kind === "pick" ? (
                answering === null ? <div style={{ fontSize: 11, opacity: 0.75 }}>Tap the right choice above.</div> : (
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ flex: 1 }}>Answer: <b style={{ color: gold }}>{game.options[answering]}</b></span>
                    <button onClick={() => setAnswering(null)} style={btn(false)}>Back</button>
                    <button onClick={() => { onResolve({ choice: answering }); setAnswering(null); }} style={btn()}>Finish</button>
                  </div>
                )
              ) : (
                <ValueInput key={`a${game.guess_game_id}`} game={game} initial={null} label="Finish" onSubmit={onResolve} />
              )}
              {game.guesses_count === 0 && <button onClick={onCancel} style={{ ...btn(false), opacity: 0.8 }}>Cancel game</button>}
            </div>
          )}

          {resolved && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {game.winners_count === 0 ? <b style={{ color: gold, textAlign: "center" }}>Nobody got it this time!</b> : (
                <>
                  <b style={{ color: gold, textAlign: "center" }}>🏆 {game.winners_count === 1 ? "Closest guess" : `${game.winners_count} got it`}{game.kind === "pick" ? "" : " (closest wins)"}</b>
                  <Podium rows={game.winners.slice(0, 3).map((w) => ({ name: w.name, value: w.guess_label }))} />
                  {game.winners_count > 3 && <span style={{ opacity: 0.7, textAlign: "center" }}>+{game.winners_count - 3} more</span>}
                </>
              )}
              {game.my_is_winner === true && <span style={{ textAlign: "center", fontWeight: 800 }}>✅ You got it! 🔥 Streak {game.my_streak}</span>}
              {game.my_is_winner === false && <span style={{ textAlign: "center" }}>❌ Not this time — your guess: {game.my_guess_label}</span>}
            </div>
          )}
          <div style={{ fontSize: 10.5, opacity: 0.6 }}>For fun only — a right guess wins bragging rights, never coins.</div>
        </div>
      )}
      {board && (
        <div role="dialog" onClick={() => setBoard(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 100, display: "grid", placeItems: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#000", border: `2px solid ${gold}`, borderRadius: 16, padding: 16, width: "min(380px, 100%)", boxSizing: "border-box", maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <button onClick={() => setBoard(null)} aria-label="Back" style={{ width: 34, height: 34, borderRadius: "50%", border: `1.5px solid ${gold}`, background: "#000", color: gold, fontSize: 20, cursor: "pointer" }}>‹</button>
              <b style={{ color: gold, fontSize: 17 }}>🏅 Top Guessers</b>
            </div>
            {board.length === 0 ? <p style={{ opacity: 0.8 }}>Nobody has guessed right yet — be the first!</p> : board.map((r) => (
              <div key={r.user_id} style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,.08)", fontSize: 13 }}>
                <b style={{ width: 24, color: gold }}>{r.rank}</b><span style={{ flex: 1 }}>{r.name}</span>
                <span>🔥 {r.best_streak}</span><span style={{ opacity: 0.75, fontVariantNumeric: "tabular-nums" }}>✅ {r.correct}/{r.guesses}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const KIND_LABEL: Record<GuessKind, string> = { pick: "Pick one", number: "A number", score: "A score" };
const LOCK_CHOICES = [{ m: 1, l: "1 min" }, { m: 3, l: "3 min" }, { m: 5, l: "5 min" }, { m: 10, l: "10 min" }, { m: 0, l: "When I lock it" }];

/** Host: pick a ready-made game (or write one), the players, the price and the timer. */
export function GuessStartDialog({ people, onStart, onClose }: {
  people: { userId: number; name: string }[];   // everyone on screen, the host first
  onStart: (s: GuessStart) => void; onClose: () => void;
}) {
  const [templates, setTemplates] = useState<GuessTemplate[] | null>(null);
  const [cat, setCat] = useState("All");
  const [tpl, setTpl] = useState<GuessTemplate | "custom" | null>(null);
  const [kind, setKind] = useState<GuessKind>("pick");
  const [title, setTitle] = useState("");
  const [unit, setUnit] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [players, setPlayers] = useState<number[]>([]);
  const [price, setPrice] = useState(5);
  const [lockMinutes, setLockMinutes] = useState(3);
  useEffect(() => { fetchGuessTemplates().then(setTemplates); }, []);
  const cats = useMemo(() => ["All", ...Array.from(new Set((templates ?? []).map((t) => t.category)))], [templates]);
  const usesPlayers = tpl !== null && tpl !== "custom" && tpl.uses_players;

  function choose(t: GuessTemplate | "custom") {
    setTpl(t);
    if (t === "custom") { setKind("pick"); setTitle(""); setUnit(""); setOptions(["", ""]); return; }
    setKind(t.kind); setTitle(t.title); setUnit(t.unit ?? ""); setOptions(t.options ? [...t.options] : ["", ""]);
  }
  const togglePlayer = (id: number) => setPlayers((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 4 ? p : [...p, id]));
  const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
  const problem =
    !title.trim() ? "Write the question." :
    usesPlayers && players.length < 2 ? "Pick 2 to 4 players." :
    kind === "pick" && !usesPlayers && cleanOptions.length < 2 ? "Give at least 2 choices." :
    kind === "score" && !(players.length === 2) && cleanOptions.length !== 2 ? "Name both sides." : null;

  const chip = (on: boolean, label: string, onClick: () => void) => (
    <button key={label} onClick={onClick} style={{ padding: "6px 12px", borderRadius: 999, border: `1.5px solid ${gold}`, background: on ? gold : "transparent", color: on ? "#000" : gold, fontWeight: 700, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap" }}>{label}</button>
  );

  return (
    <div role="dialog" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#000", border: `2px solid ${gold}`, borderRadius: 16, padding: 16, maxWidth: 420, width: "100%", boxSizing: "border-box", color: "#fff", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <button onClick={tpl ? () => setTpl(null) : onClose} aria-label="Back" style={{ width: 34, height: 34, flex: "none", borderRadius: "50%", border: `1.5px solid ${gold}`, background: "#000", color: gold, fontSize: 20, cursor: "pointer" }}>‹</button>
          <h3 style={{ color: gold, margin: 0, flex: 1 }}>🔮 Guessing Games</h3>
        </div>
        {tpl === null ? (
          <>
            <p style={{ fontSize: 12, opacity: 0.8, margin: "0 0 10px" }}>Do something on camera and let the room guess what happens. Each viewer gets one guess at your price — the coins come to you. Right guesses win bragging rights, not coins.</p>
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, marginBottom: 6 }}>{cats.map((c) => chip(cat === c, c, () => setCat(c)))}</div>
            <button onClick={() => choose("custom")} style={{ display: "flex", width: "100%", gap: 10, alignItems: "center", padding: "10px 12px", marginBottom: 6, borderRadius: 10, border: `1.5px dashed ${gold}`, background: "transparent", color: gold, fontWeight: 700, cursor: "pointer", textAlign: "left" }}>✏️ Write your own</button>
            {templates !== null && templates.length === 0 && (
              <p style={{ fontSize: 13, opacity: 0.85 }}>Couldn't load the ready-made games. <button onClick={() => { setTemplates(null); fetchGuessTemplates().then(setTemplates); }} style={{ background: "none", border: "none", color: gold, fontWeight: 700, cursor: "pointer" }}>Retry</button></p>
            )}
            {templates === null ? <p style={{ opacity: 0.7 }}>Loading…</p> : templates.filter((t) => cat === "All" || t.category === cat).map((t) => (
              <button key={t.key} onClick={() => choose(t)} style={{ display: "flex", width: "100%", gap: 10, alignItems: "center", padding: "9px 12px", marginBottom: 5, borderRadius: 10, border: "1px solid rgba(240,196,32,.35)", background: "rgba(255,255,255,.04)", color: "#fff", cursor: "pointer", textAlign: "left" }}>
                <span style={{ fontSize: 20 }}>{t.emoji}</span><span style={{ flex: 1, fontSize: 13.5 }}>{t.title}</span><span style={{ fontSize: 10.5, color: gold, opacity: 0.8 }}>{KIND_LABEL[t.kind]}</span>
              </button>
            ))}
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
            {tpl === "custom" && <div style={{ display: "flex", gap: 6 }}>{(["pick", "number", "score"] as GuessKind[]).map((k) => chip(kind === k, KIND_LABEL[k], () => { setKind(k); if (k === "score" && options.length !== 2) setOptions(["Me", "You"]); }))}</div>}
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>The question
              <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "number" ? "How many sweets are in my jar?" : "Which car finishes first?"} style={field} />
            </label>
            {kind === "number" && (
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>Counted in (optional)
                <input value={unit} maxLength={30} onChange={(e) => setUnit(e.target.value)} placeholder="sweets, minutes, steps…" style={field} />
              </label>
            )}
            <div>
              <div style={{ marginBottom: 4 }}>{usesPlayers ? "Who's playing? (2 to 4 — they're the choices)" : "Who's playing? (optional, up to 4)"}</div>
              {people.map((p) => (
                <label key={p.userId} style={{ display: "flex", justifyContent: "space-between", padding: "7px 10px", borderRadius: 9, background: players.includes(p.userId) ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.05)", marginBottom: 4, cursor: "pointer" }}>
                  {p.name}<input type="checkbox" checked={players.includes(p.userId)} onChange={() => togglePlayer(p.userId)} />
                </label>
              ))}
              {usesPlayers && people.length < 2 && <div style={{ fontSize: 11.5, opacity: 0.8 }}>Bring at least one guest on screen to play this one.</div>}
            </div>
            {((kind === "pick" && !usesPlayers) || (kind === "score" && players.length !== 2)) && (
              <div>
                <div style={{ marginBottom: 4 }}>{kind === "score" ? "The two sides" : "The choices"}</div>
                {options.map((o, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                    <input value={o} maxLength={30} onChange={(e) => setOptions((all) => all.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Choice ${i + 1}`} style={{ ...field, flex: 1 }} />
                    {kind === "pick" && options.length > 2 && <button onClick={() => setOptions((all) => all.filter((_, j) => j !== i))} aria-label="Remove" style={btn(false)}>✕</button>}
                  </div>
                ))}
                {kind === "pick" && options.length < 8 && <button onClick={() => setOptions((all) => [...all, ""])} style={btn(false)}>+ Add a choice</button>}
              </div>
            )}
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span>Price of a guess: <b style={{ color: gold }}>{price} coin{price === 1 ? "" : "s"}</b></span>
              <input type="range" min={GUESS_PRICE_MIN} max={GUESS_PRICE_MAX} value={price} onChange={(e) => setPrice(Number(e.target.value))} style={{ accentColor: "#F0C420" }} />
            </label>
            <div>
              <div style={{ marginBottom: 4 }}>Guessing closes</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{LOCK_CHOICES.map((c) => chip(lockMinutes === c.m, c.l, () => setLockMinutes(c.m)))}</div>
            </div>
            {problem && <div style={{ fontSize: 12, color: "#ffb4b4" }}>{problem}</div>}
            <button disabled={!!problem}
                    onClick={() => onStart({
                      templateKey: tpl === "custom" ? undefined : tpl.key, title: title.trim(), kind, unit: unit.trim() || undefined,
                      options: (kind === "pick" && !usesPlayers) || (kind === "score" && players.length !== 2) ? cleanOptions : undefined,
                      playerIds: players, price, lockMinutes,
                    })}
                    style={{ ...btn(), padding: "12px 0", fontSize: 16, opacity: problem ? 0.5 : 1 }}>Start guessing</button>
          </div>
        )}
      </div>
    </div>
  );
}
