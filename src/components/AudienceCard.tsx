// The audience card on head-to-head battles (Steve, 2026-10-27): predict the winner, join a team
// and cheer, vote the loser's forfeit — all free. Players see it read-only. Same shape as the phones.
import { useEffect, useRef, useState } from "react";
import { cheerBattle, fetchPredictionLeaderboard, joinBattleTeam, predictBattle, votePunishment, type AudienceRound, type PredictorRow } from "../lib/audience";

const gold = "var(--gold, #F0C420)";
const TEAM_COLORS = ["#e5484d", "#49a8ff", "#2fbf5b", "#f0a020"];

export function AudienceCard({ round, myUserId, onRound, onToast }: {
  round: AudienceRound; myUserId: number | null;
  onRound: (r: AudienceRound) => void; onToast: (m: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [board, setBoard] = useState<PredictorRow[] | null>(null);
  const [polledAt, setPolledAt] = useState(() => Date.now());
  const [, setTick] = useState(0);
  const pending = useRef(0);
  useEffect(() => { setPolledAt(Date.now()); }, [round]);
  useEffect(() => {
    if (!round.predict_open) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 500);
    return () => window.clearInterval(id);
  }, [round.predict_open, round.round_id]);
  // Taps are sent in batches so a fast tapper isn't a request per tap.
  useEffect(() => {
    const id = window.setInterval(async () => {
      if (!myUserId || pending.current === 0) return;
      const taps = Math.min(15, pending.current); pending.current -= taps;
      const { round: r } = await cheerBattle(myUserId, round.round_id, taps);
      if (r) onRound(r);
    }, 1600);
    return () => window.clearInterval(id);
  }, [myUserId, round.round_id, onRound]);

  const open = round.status === "open";
  const viewer = !!myUserId && !round.is_player;
  const secs = Math.max(0, Math.ceil((round.predict_ms_left - (Date.now() - polledAt)) / 1000));
  const sideName = (k: string | null) => round.sides.find((s) => s.key === k)?.label ?? "";
  const totalPred = round.sides.reduce((a, s) => a + (s.predictions ?? 0), 0);
  const maxCheer = Math.max(1, ...round.sides.map((s) => s.cheer));
  const pill = (label: string, onClick: () => void, color = gold) => (
    <button onClick={onClick} style={{ fontSize: 12, fontWeight: 700, color: "#000", background: color, border: "none", borderRadius: 999, padding: "5px 10px", cursor: "pointer", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</button>
  );
  const run = async (p: Promise<{ round: AudienceRound | null; message: string | null }>, ok?: string) => {
    const { round: r, message } = await p;
    if (message) onToast(message); else if (ok) onToast(ok);
    if (r) onRound(r);
  };

  const winnerShare = round.winner_key && totalPred ? Math.round(100 * (round.sides.find((s) => s.key === round.winner_key)?.predictions ?? 0) / totalPred) : null;

  return (
    <div style={{ position: "fixed", right: 12, bottom: 96, zIndex: 85, width: "min(300px, calc(100vw - 24px))", boxSizing: "border-box", background: "rgba(0,0,0,.85)", border: `2px solid ${gold}`, borderRadius: 14, padding: 10, color: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <b style={{ color: gold, fontSize: 13, flex: 1 }}>👥 Audience{round.my_streak > 0 ? ` · 🔥 ${round.my_streak}` : ""}</b>
        <button onClick={() => fetchPredictionLeaderboard().then(setBoard)} style={{ background: "none", border: "none", color: gold, fontSize: 12, cursor: "pointer" }}>🏅 Top</button>
        <button onClick={() => setCollapsed((c) => !c)} style={{ background: "none", border: "none", color: gold, fontSize: 18, cursor: "pointer" }}>{collapsed ? "+" : "–"}</button>
      </div>
      {!collapsed && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6, fontSize: 12.5 }}>
          {/* Predict */}
          {open && round.predict_open && viewer && !round.my_prediction && (
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>🔮 Who wins? <span style={{ opacity: 0.7, fontWeight: 400 }}>({secs}s · free)</span></div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{round.sides.map((s) => <span key={s.key}>{pill(s.label, () => run(predictBattle(myUserId!, round.round_id, s.key), "🔮 Prediction locked in!"))}</span>)}</div>
            </div>
          )}
          {round.my_prediction && open && <div>🔮 You picked <b style={{ color: gold }}>{sideName(round.my_prediction)}</b></div>}
          {!round.predict_open && open && totalPred > 0 && (
            <div style={{ opacity: 0.85 }}>🔮 {round.sides.map((s) => `${Math.round(100 * (s.predictions ?? 0) / totalPred)}% ${s.label.split(" ")[0]}`).join(" · ")}</div>
          )}
          {/* Teams + cheer */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {round.sides.map((s, i) => (
              <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 86, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: round.my_team === s.key ? 700 : 400 }}>{s.label}</span>
                <div style={{ flex: 1, height: 10, borderRadius: 5, background: "rgba(255,255,255,.1)", overflow: "hidden" }}>
                  <div style={{ width: `${(100 * s.cheer) / maxCheer}%`, height: "100%", background: TEAM_COLORS[i % 4], transition: "width .4s" }} />
                </div>
                <span style={{ width: 54, textAlign: "right", fontVariantNumeric: "tabular-nums", opacity: 0.85 }}>📣 {s.cheer}</span>
                {open && viewer && !round.my_team && pill("Join", () => run(joinBattleTeam(myUserId!, round.round_id, s.key), `You're on ${s.label}'s team!`), TEAM_COLORS[i % 4])}
              </div>
            ))}
            {open && viewer && round.my_team && (
              <button onClick={() => { pending.current += 1; onRound({ ...round, sides: round.sides.map((s) => (s.key === round.my_team ? { ...s, cheer: s.cheer + 1 } : s)) }); }}
                      style={{ marginTop: 2, padding: "8px 0", borderRadius: 999, border: "none", fontWeight: 800, fontSize: 14, cursor: "pointer", color: "#000",
                               background: TEAM_COLORS[round.sides.findIndex((s) => s.key === round.my_team) % 4] }}>
                📣 Cheer for {sideName(round.my_team)}!
              </button>
            )}
          </div>
          {/* Forfeit */}
          {round.punishments.length > 0 && open && (
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>😜 Loser's forfeit — {viewer ? "vote!" : "the room is voting"}</div>
              {round.punishments.map((p, i) => (
                <button key={i} disabled={!viewer} onClick={() => run(votePunishment(myUserId!, round.round_id, i))}
                        style={{ display: "flex", width: "100%", gap: 6, alignItems: "center", textAlign: "left", marginBottom: 4, padding: "6px 8px", borderRadius: 8, fontSize: 12, cursor: viewer ? "pointer" : "default",
                                 color: "#fff", background: round.my_punishment_vote === i ? "rgba(240,196,32,.25)" : "rgba(255,255,255,.06)", border: `1px solid ${round.my_punishment_vote === i ? gold : "rgba(240,196,32,.35)"}` }}>
                  <span style={{ flex: 1 }}>{p.text}</span><b style={{ color: gold }}>{p.votes}</b>
                </button>
              ))}
            </div>
          )}
          {/* Result */}
          {!open && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {round.status === "settled" ? <b style={{ color: gold }}>🏆 {sideName(round.winner_key)} won{winnerShare !== null ? ` · ${winnerShare}% called it` : ""}</b> : <b style={{ color: gold }}>No winner this time — predictions don't count.</b>}
              {round.my_prediction && round.status === "settled" && (round.my_prediction_correct ? <span>✅ You called it! 🔥 Streak {round.my_streak}</span> : <span>❌ Not this time — your streak starts again.</span>)}
              {round.punishment_result && <span>😜 Forfeit: <b>{round.punishment_result}</b></span>}
            </div>
          )}
        </div>
      )}
      {board && (
        <div role="dialog" onClick={() => setBoard(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 100, display: "grid", placeItems: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#000", border: `2px solid ${gold}`, borderRadius: 16, padding: 16, width: "min(380px, 100%)", boxSizing: "border-box", maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <button onClick={() => setBoard(null)} aria-label="Back" style={{ width: 34, height: 34, borderRadius: "50%", border: `1.5px solid ${gold}`, background: "#000", color: gold, fontSize: 20, cursor: "pointer" }}>‹</button>
              <b style={{ color: gold, fontSize: 17 }}>🏅 Top predictors</b>
            </div>
            {board.length === 0 ? <p style={{ opacity: 0.8 }}>Nobody has called a battle yet — be the first!</p> : board.map((r) => (
              <div key={r.user_id} style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,.08)", fontSize: 13 }}>
                <b style={{ width: 24, color: gold }}>{r.rank}</b><span style={{ flex: 1 }}>{r.name}</span>
                <span>🔥 {r.best_streak}</span><span style={{ opacity: 0.75 }}>✅ {r.correct}/{r.predictions}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
