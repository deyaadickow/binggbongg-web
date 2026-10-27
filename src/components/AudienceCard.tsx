// The audience card on head-to-head battles (Steve, 2026-10-27): predict the winner, join a team
// and cheer, vote the loser's forfeit — all free. Players see it read-only. Same shape as the phones.
import { useEffect, useRef, useState } from "react";
import { cheerBattle, fetchPredictionLeaderboard, joinBattleTeam, predictBattle, votePunishment, type AudienceRound, type PredictorRow } from "../lib/audience";
import { Confetti, CountdownRing, FORFEIT_COLORS, MuteButton, SceneBanner, SceneChips, percentages, shortSideNames, sideColor, textOn } from "./GameShow";
import { SCENES } from "../lib/gameSceneData";
import { haptic, sfx } from "../lib/gameSounds";

const gold = "var(--gold, #F0C420)";
// Game Show (Steve, 2026-10-27): the choices are big coloured boxes, like the quiz tiles — and ONE
// colour per side everywhere on the card (predict box, cheer bar, Join, Cheer, "You picked"):
// blue for the first side, red for the second, like 2v2's Team A / Team B. Forfeits get colours
// no side uses. Names may take two lines in a box.
const boxText: React.CSSProperties = { fontSize: 13, fontWeight: 800, textShadow: "0 1px 2px rgba(0,0,0,.4)", minWidth: 0, lineHeight: 1.2,
  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" };

export function AudienceCard({ round, myUserId, onRound, onToast }: {
  round: AudienceRound; myUserId: number | null;
  onRound: (r: AudienceRound) => void; onToast: (m: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [board, setBoard] = useState<PredictorRow[] | null>(null);
  const [polledAt, setPolledAt] = useState(() => Date.now());
  const [, setTick] = useState(0);
  const pending = useRef(0);
  // Game Show: a click when your pick locks in, a chime + confetti when your prediction comes
  // true. Fired on CHANGES between polls only (the ref is what the last poll said).
  const [burst, setBurst] = useState(0);
  const prev = useRef({ id: round.round_id, status: round.status, pred: round.my_prediction, vote: round.my_punishment_vote });
  // The longest predict window seen this round, so the ring drains from full.
  const predictTotal = useRef({ id: round.round_id, ms: round.predict_ms_left });
  if (predictTotal.current.id !== round.round_id) predictTotal.current = { id: round.round_id, ms: round.predict_ms_left };
  else if (round.predict_ms_left > predictTotal.current.ms) predictTotal.current.ms = round.predict_ms_left;
  useEffect(() => {
    const was = prev.current;
    prev.current = { id: round.round_id, status: round.status, pred: round.my_prediction, vote: round.my_punishment_vote };
    if (was.id !== round.round_id) return;
    if (!was.pred && round.my_prediction) { sfx.lock(); haptic(25); }
    if (was.vote !== round.my_punishment_vote && round.my_punishment_vote !== null) sfx.lock();
    if (was.status === "open" && round.status === "settled" && round.my_prediction) {
      if (round.my_prediction_correct) { sfx.correct(); haptic([40, 60, 40]); setBurst(Date.now()); }
      else { sfx.wrong(); haptic(80); }
    }
  }, [round.round_id, round.status, round.my_prediction, round.my_punishment_vote, round.my_prediction_correct]);
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
  const predictMs = Math.max(0, round.predict_ms_left - (Date.now() - polledAt));
  const secs = Math.ceil(predictMs / 1000);
  const sideName = (k: string | null) => round.sides.find((s) => s.key === k)?.label ?? "";
  const shortNames = shortSideNames(round.sides.map((s) => s.label));
  const sideIdx = (k: string | null) => Math.max(0, round.sides.findIndex((s) => s.key === k));
  const shortName = (k: string | null) => (k === null ? "" : shortNames[sideIdx(k)] ?? "");
  const totalPred = round.sides.reduce((a, s) => a + (s.predictions ?? 0), 0);
  // Shown percentages always add up to exactly 100.
  const predPct = percentages(round.sides.map((s) => s.predictions ?? 0));
  const loudest = [...round.sides].sort((a, b) => b.cheer - a.cheer)[0];
  const maxCheer = Math.max(1, ...round.sides.map((s) => s.cheer));
  // Solo Battle can have many entrants: the six loudest teams (and always your own), then "+N more".
  const MAX_ROWS = 6;
  const ranked = [...round.sides].map((s, i) => ({ s, i })).sort((a, b) => b.s.cheer - a.s.cheer);
  const shown = ranked.filter((x, n) => n < MAX_ROWS || x.s.key === round.my_team).sort((a, b) => a.i - b.i);
  const hiddenCount = round.sides.length - shown.length;
  const pill = (label: string, onClick: () => void, color = gold) => (
    <button onClick={onClick} style={{ fontSize: 12, fontWeight: 700, color: textOn(color), background: color, border: "none", borderRadius: 999, padding: "5px 10px", cursor: "pointer", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</button>
  );
  const run = async (p: Promise<{ round: AudienceRound | null; message: string | null }>, ok?: string) => {
    const { round: r, message } = await p;
    if (message) onToast(message); else if (ok) onToast(ok);
    if (r) onRound(r);
  };

  const winnerShare = round.winner_key && totalPred ? predPct[sideIdx(round.winner_key)] : null;

  return (
    <div style={{ position: "fixed", right: 12, bottom: 96, zIndex: 85, width: "min(300px, calc(100vw - 24px))", boxSizing: "border-box", background: "rgba(0,0,0,.85)", border: `2px solid ${gold}`, borderRadius: 14, padding: 10, color: "#fff" }}>
      <Confetti burst={burst} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <b style={{ color: gold, fontSize: 13, flex: 1 }}>👥 Audience{round.my_streak > 0 ? ` · 🔥 ${round.my_streak}` : ""}</b>
        <MuteButton />
        <button onClick={() => fetchPredictionLeaderboard().then(setBoard)} style={{ background: "none", border: "none", color: gold, fontSize: 12, cursor: "pointer" }}>🏅 Top</button>
        <button onClick={() => setCollapsed((c) => !c)} style={{ background: "none", border: "none", color: gold, fontSize: 18, cursor: "pointer" }}>{collapsed ? "+" : "–"}</button>
      </div>
      {!collapsed && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6, fontSize: 12.5 }}>
          <SceneBanner scene={SCENES.stadium} height={58}>
            {/* The ring drains from the longest predict window seen this round — never padded. */}
            {open && round.predict_open && <div style={{ position: "absolute", left: 5, top: 5, zIndex: 3 }}><CountdownRing msLeft={predictMs} totalMs={predictTotal.current.ms} size={40} /></div>}
            <SceneChips
              topLeft={open && !round.predict_open && loudest && loudest.cheer > 0 ? `📣 ${shortName(loudest.key)} loudest` : null}
              bottomRight={round.my_streak > 0 ? [[`🔥 ${round.my_streak}`, true]] : []}
              centre={round.status === "settled" && round.winner_key ? `🏆 ${shortName(round.winner_key)} won!` : !open ? "No winner" : null}
              pop={round.status === "settled"} />
            {open && (
              <div style={{ position: "absolute", left: round.predict_open ? 50 : 8, right: round.my_streak > 0 ? 52 : 8, bottom: 5, textAlign: "center", zIndex: 3 }}>
                <span style={{ display: "inline-block", maxWidth: "100%", background: "rgba(0,0,0,.6)", borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", boxSizing: "border-box" }}>
                  {round.predict_open ? "🔮 Who wins?" : "📣 Cheer your team!"}
                </span>
              </div>
            )}
          </SceneBanner>
          {round.my_streak >= 3 && (
            <div className="gs-anim" style={{ textAlign: "center", fontWeight: 900, fontSize: 13, color: "#000", background: "#F0A020", borderRadius: 10, padding: "3px 8px", animation: "gs-pop .8s ease-in-out infinite" }}>🔥 ON FIRE — {round.my_streak} right in a row!</div>
          )}
          {/* Predict */}
          {open && round.predict_open && viewer && !round.my_prediction && (
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>🔮 Who wins? <span style={{ opacity: 0.7, fontWeight: 400 }}>({secs}s · free)</span></div>
              <div style={{ display: "grid", gridTemplateColumns: round.sides.length === 1 ? "1fr" : "1fr 1fr", gap: 6 }}>
                {round.sides.map((s, i) => (
                  <button key={s.key} onClick={() => run(predictBattle(myUserId!, round.round_id, s.key), "🔮 Prediction locked in!")}
                          style={{ minHeight: 44, minWidth: 0, padding: "6px 8px", borderRadius: 11, border: "3px solid transparent", background: sideColor(i), color: textOn(sideColor(i)), cursor: "pointer", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={boxText}>{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Your pick, in its side's own box — the same as the phones. */}
          {round.my_prediction && open && (() => {
            const c = sideColor(sideIdx(round.my_prediction));
            return (
              <div style={{ minHeight: 40, padding: "6px 8px", borderRadius: 11, border: "3px solid #fff", background: c, color: textOn(c), display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", boxSizing: "border-box" }}>
                <span style={boxText}>🔮 You picked {sideName(round.my_prediction)}</span>
              </div>
            );
          })()}
          {!round.predict_open && open && totalPred > 0 && (
            <div style={{ opacity: 0.85 }}>🔮 {round.sides.map((s, i) => ({ s, i })).filter(({ s }) => (s.predictions ?? 0) > 0).sort((a, b) => (b.s.predictions ?? 0) - (a.s.predictions ?? 0)).slice(0, 4).map(({ i }) => `${predPct[i]}% ${shortNames[i]}`).join(" · ")}</div>
          )}
          {/* Teams + cheer */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {shown.map(({ s, i }) => (
              <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span title={s.label} style={{ width: 86, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: round.my_team === s.key ? 700 : 400 }}>{shortNames[i]}</span>
                <div style={{ flex: 1, height: 10, borderRadius: 5, background: "rgba(255,255,255,.1)", overflow: "hidden" }}>
                  <div style={{ width: `${(100 * s.cheer) / maxCheer}%`, height: "100%", background: sideColor(i), transition: "width .4s" }} />
                </div>
                <span style={{ width: 54, textAlign: "right", fontVariantNumeric: "tabular-nums", opacity: 0.85 }}>📣 {s.cheer}</span>
                {open && viewer && !round.my_team && pill("Join", () => run(joinBattleTeam(myUserId!, round.round_id, s.key), `You're on ${s.label}'s team!`), sideColor(i))}
              </div>
            ))}
            {hiddenCount > 0 && <div style={{ fontSize: 11, opacity: 0.7 }}>+{hiddenCount} more</div>}
            {open && viewer && round.my_team && (
              <button onClick={() => { pending.current += 1; onRound({ ...round, sides: round.sides.map((s) => (s.key === round.my_team ? { ...s, cheer: s.cheer + 1 } : s)) }); }}
                      style={{ marginTop: 2, padding: "8px 0", borderRadius: 999, border: "none", fontWeight: 800, fontSize: 14, cursor: "pointer",
                               color: textOn(sideColor(sideIdx(round.my_team))), background: sideColor(sideIdx(round.my_team)) }}>
                📣 Cheer for {sideName(round.my_team)}!
              </button>
            )}
          </div>
          {/* Forfeit */}
          {round.punishments.length > 0 && open && (
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>😜 Loser's forfeit — {viewer ? "vote!" : "the room is voting"}</div>
              {round.punishments.map((p, i) => {
                const mine = round.my_punishment_vote === i;
                return (
                  <button key={i} disabled={!viewer} onClick={() => run(votePunishment(myUserId!, round.round_id, i))}
                          style={{ display: "flex", width: "100%", gap: 6, alignItems: "center", textAlign: "left", marginBottom: 5, padding: "7px 9px", borderRadius: 11, cursor: viewer ? "pointer" : "default", boxSizing: "border-box",
                                   color: "#fff", background: FORFEIT_COLORS[i % FORFEIT_COLORS.length], border: `3px solid ${mine ? "#fff" : "transparent"}` }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 800, textShadow: "0 1px 2px rgba(0,0,0,.4)", overflowWrap: "anywhere" }}>{mine ? "⭐ " : ""}{p.text}</span>
                    <b style={{ fontVariantNumeric: "tabular-nums", background: "rgba(0,0,0,.3)", borderRadius: 999, padding: "1px 7px", fontSize: 12 }}>{p.votes}</b>
                  </button>
                );
              })}
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
