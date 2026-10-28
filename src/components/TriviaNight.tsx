// Quiz Games (was Trivia Night; Steve 2026-10-27): "as a host I don't want to sit here and fill the
// answers, I just want to start the game and start making money ... Pic a game and click start. For
// the player, just show the question and give them 2 to 4 boxes to click on. And that's it."
//
// The host: ONE screen of game tiles and a START button (QuizGamesPicker), then a card with the
// question, the coins earned and End game. The player: the question, the boxes, ONE status line. A
// right answer is a full-screen celebration, a wrong one "Sorry, this answer is wrong, please try
// again" — both straight from the pay response — and a wrong answer can try another box.
import { useEffect, useRef, useState } from "react";
import { Confetti, CountdownRing, MuteButton, Podium } from "./GameShow";
import { Celebration, WrongAnswerNotice, type CelebrationShow } from "./Celebration";
import { sfx } from "../lib/gameSounds";
import { useT } from "../lib/i18n";
import { fetchTriviaCategories, type TriviaCategory, type TriviaNight, type TriviaNightAnswer } from "../lib/trivianight";

const gold = "var(--gold, #F0C420)";
const LETTERS = ["A", "B", "C", "D"];
const TILE_COLORS = ["#D85A30", "#1D9E75", "#378ADD", "#BA7517"];
/** What the server uses when the host sends nothing else — shown under START. */
export const QUIZ_PRICE = 5;
export const QUIZ_SECONDS = 20;
const END_KEYS = { host: "quiz_end_host", out_of_questions: "quiz_end_out", room_ended: "quiz_end_room", expired: "quiz_end_expired" } as const;

/** "🐘 Animals Quiz" for one category, "🌟 Quiz Games" for the mix. */
export function useQuizTitle() {
  const { t } = useT();
  return (game: Pick<TriviaNight, "categories">) => {
    const c = game.categories.length === 1 ? game.categories[0] : null;
    return c ? `${c.emoji} ${t("quiz_x_quiz", c.label)}` : `🌟 ${t("quiz_games")}`;
  };
}

type BoxLook = "plain" | "wrong" | "right" | "dim" | "pending";

/** One answer box. The SAME element across polls (keyed by its index under a grid that stays put),
 *  so a poll landing mid-tap never throws the tap away; it shows pressed the instant it's touched. */
function AnswerBox({ i, text, look, tappable, onTap }: { i: number; text: string; look: BoxLook; tappable: boolean; onTap: (i: number) => void }) {
  const [pressed, setPressed] = useState(false);
  const grey = look === "wrong";
  return (
    <button type="button" aria-disabled={!tappable}
            onPointerDown={() => { if (tappable) setPressed(true); }}
            onPointerUp={() => setPressed(false)} onPointerCancel={() => setPressed(false)} onPointerLeave={() => setPressed(false)}
            onClick={() => { if (tappable) onTap(i); }}
            className="gs-anim"
            style={{ position: "relative", minHeight: 64, minWidth: 0, padding: "10px 10px", borderRadius: 14, textAlign: "left", color: "#fff",
                     background: grey ? "#4A4F55" : TILE_COLORS[i], cursor: tappable ? "pointer" : "default", touchAction: "manipulation",
                     border: `3px solid ${look === "right" ? "#fff" : look === "pending" ? "rgba(255,255,255,.85)" : "transparent"}`,
                     boxShadow: look === "right" ? "0 0 0 3px #2FBF5B, 0 0 18px rgba(47,191,91,.7)" : pressed ? "inset 0 0 0 999px rgba(255,255,255,.22)" : "0 3px 0 rgba(0,0,0,.35)",
                     opacity: look === "dim" ? 0.35 : grey ? 0.75 : 1,
                     transform: pressed ? "scale(.95)" : "scale(1)", transition: "transform .08s, opacity .3s, background .2s",
                     animation: look === "right" ? "gs-pop .5s ease-in-out 3" : look === "pending" ? "gs-pop .6s ease-in-out infinite" : "none",
                     WebkitTapHighlightColor: "transparent", userSelect: "none" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <b style={{ flex: "none", background: "rgba(0,0,0,.3)", borderRadius: 8, padding: "2px 8px", fontSize: 15 }}>{grey ? "✖" : look === "right" ? "✅" : LETTERS[i]}</b>
        <span style={{ flex: 1, minWidth: 0, fontSize: 15.5, fontWeight: 800, lineHeight: 1.22, overflowWrap: "anywhere", textShadow: "0 1px 2px rgba(0,0,0,.35)",
                       textDecoration: grey ? "line-through" : "none" }}>{text}</span>
      </span>
    </button>
  );
}

export function TriviaNightPanel({ game, myUserId, onAnswer, onEnd, onClose }: {
  game: TriviaNight; myUserId: number | null;
  /** Sends the (paid) answer; resolves with right/wrong — or null when it didn't go through. */
  onAnswer: (i: number) => Promise<TriviaNightAnswer | null>;
  onEnd: () => void; onClose: () => void;
}) {
  const { t } = useT();
  const title = useQuizTitle()(game);
  const [collapsed, setCollapsed] = useState(false);
  const [polledAt, setPolledAt] = useState(() => Date.now());
  const [, setTick] = useState(0);
  const [burst, setBurst] = useState(0);
  const [celebrate, setCelebrate] = useState<CelebrationShow | null>(null);
  const [wrongShow, setWrongShow] = useState(0);
  // What THIS page already knows about the open question, ahead of the next poll: a poll that left
  // before the answer was paid must not un-grey a box or unlock the boxes again.
  const [local, setLocal] = useState<{ q: number; wrong: number[]; right: number | null }>({ q: game.q_number, wrong: [], right: null });
  const [pending, setPending] = useState<number | null>(null);
  const prevPhase = useRef(game.phase);
  const lastTick = useRef(-1);
  useEffect(() => { setPolledAt(Date.now()); }, [game]);
  const over = game.status === "completed" || game.phase === "over";
  useEffect(() => {
    if (over) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, [over, game.trivia_night_id]);
  useEffect(() => {
    const was = prevPhase.current;
    prevPhase.current = game.phase;
    if (game.phase === "reveal" && was === "question") sfx.reveal();
    if (over && was !== "over" && game.status === "completed") { sfx.fanfare(); setBurst(Date.now()); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.phase, game.status]);

  const since = Date.now() - polledAt;
  const msLeft = game.ms_left === null ? 0 : Math.max(0, game.ms_left - since);
  const secs = Math.ceil(msLeft / 1000);
  const nextSecs = Math.max(1, Math.ceil(((game.next_ms_left ?? 0) - since) / 1000));
  const asking = !over && game.phase === "question" && !!game.question;
  if (asking && secs <= 5 && secs > 0 && lastTick.current !== secs) { lastTick.current = secs; sfx.tick(); }

  const sameQ = local.q === game.q_number;
  const wrong = new Set([...(game.my_wrong ?? []), ...(sameQ ? local.wrong : [])]);
  const rightChoice = game.my_right ? game.my_answer : sameQ ? local.right : null;
  const gotIt = rightChoice !== null && rightChoice !== undefined;
  const canPlay = !!myUserId && !game.is_host;
  const result = !asking && game.result && game.result.q_number === game.q_number ? game.result : null;

  const lookOf = (i: number): BoxLook => {
    if (result) return i === result.correct ? "right" : "dim";
    if (pending === i) return "pending";
    if (gotIt) return i === rightChoice ? "right" : "dim";
    if (wrong.has(i)) return "wrong";
    return "plain";
  };
  const tappable = (i: number) => asking && canPlay && secs > 0 && !gotIt && pending === null && !wrong.has(i);

  async function tap(i: number) {
    if (!tappable(i)) return;
    const q = game.q_number;
    setPending(i);
    try {
      const r = await onAnswer(i);
      if (r?.correct === true) {
        setLocal((l) => ({ q, wrong: l.q === q ? l.wrong : [], right: i }));
        // The streak the server counts at the reveal — this right answer is the next one in it.
        setCelebrate({ id: Date.now(), streak: (r.game?.my_streak ?? game.my_streak) + 1 });
      } else if (r?.correct === false) {
        setLocal((l) => ({ q, wrong: [...(l.q === q ? l.wrong : []), i], right: null }));
        setWrongShow(Date.now());
      }
    } finally { setPending(null); }
  }

  let status = "";
  if (!over && game.phase === "waiting") status = t("quiz_paused");
  else if (asking) {
    if (game.is_host) status = t("quiz_n_answered", game.answered_count);
    else if (!myUserId) status = t("quiz_sign_in_to_play");
    else if (gotIt) status = t("quiz_you_got_it_wait");
    else status = t("quiz_tap_an_answer", t(game.coins_per_answer === 1 ? "n_coin" : "n_coins", game.coins_per_answer));
  }

  const podiumRows = (game.players.length ? game.players : game.audience_top).filter((p) => p.points > 0).slice(0, 3).map((p) => ({ name: p.name, value: `${p.points} pts` }));
  const endKey = END_KEYS[(game.end_reason ?? "") as keyof typeof END_KEYS];

  return (
    <div style={{ position: "fixed", top: 120, left: "50%", transform: "translateX(-50%)", zIndex: 87, width: "min(430px, calc(100vw - 24px))", boxSizing: "border-box",
                  background: "rgba(0,0,0,.92)", border: `2px solid ${gold}`, borderRadius: 18, padding: 12, color: "#fff", maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}>
      <Confetti burst={burst} />
      <Celebration show={celebrate} />
      <WrongAnswerNotice show={wrongShow} />
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <b style={{ color: gold, fontSize: 16, flex: 1, minWidth: 0, lineHeight: 1.25 }}>{title}</b>
        {asking && collapsed && <b style={{ fontVariantNumeric: "tabular-nums", color: secs <= 5 ? "#E5484D" : "#fff" }}>⏱ {secs}s</b>}
        <MuteButton />
        <button onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? "Expand" : "Collapse"} style={{ background: "none", border: "none", color: gold, fontSize: 20, cursor: "pointer", padding: "0 4px" }}>{collapsed ? "+" : "–"}</button>
        {over && <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: gold, fontSize: 18, cursor: "pointer" }}>✕</button>}
      </div>
      {!collapsed && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          {!over && game.phase === "ready" && (
            <div style={{ textAlign: "center", padding: "10px 0 6px" }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: gold }}>{t("quiz_get_ready")}</div>
              <div style={{ fontSize: 16, fontWeight: 700, opacity: 0.9, marginTop: 2 }}>{t("quiz_question_n", game.q_number)}</div>
              <div key={nextSecs} className="gs-anim" style={{ fontSize: 64, fontWeight: 900, lineHeight: 1.1, marginTop: 4, animation: "gs-pop .5s ease-out" }}>{nextSecs}</div>
            </div>
          )}

          {!over && game.question && game.phase !== "ready" && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {asking && <CountdownRing msLeft={msLeft} totalMs={game.question_seconds * 1000} size={50} />}
                <div style={{ flex: 1, minWidth: 0, fontSize: 18, fontWeight: 900, lineHeight: 1.3, textAlign: "center", textWrap: "balance" } as React.CSSProperties}>{game.question.text}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {game.question.answers.map((a, i) => <AnswerBox key={i} i={i} text={a} look={lookOf(i)} tappable={tappable(i)} onTap={(n) => void tap(n)} />)}
              </div>
            </>
          )}

          {!over && game.phase === "reveal" && (
            <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 2 }}>
              {game.result?.right_answer && <div style={{ fontSize: 16, fontWeight: 900 }}>{t("quiz_the_answer", game.result.right_answer)}</div>}
              {!game.is_host && game.my_last_points !== null && game.my_last_points > 0 && <div style={{ fontSize: 16, fontWeight: 900, color: "#2FBF5B" }}>{t("quiz_plus_points", game.my_last_points)}</div>}
              <div style={{ fontSize: 14, opacity: 0.9 }}>{t("quiz_next_question_in", nextSecs)}</div>
            </div>
          )}

          {status && <div style={{ fontSize: 14, fontWeight: 700, textAlign: "center", opacity: 0.92 }}>{status}</div>}

          {over && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: gold }}>{t("quiz_over")}</div>
              {endKey && <div style={{ fontSize: 13, opacity: 0.8 }}>{t(endKey)}</div>}
              {podiumRows.length > 0 ? <Podium rows={podiumRows} /> : <div style={{ fontSize: 13, opacity: 0.8 }}>{t("quiz_nobody_scored")}</div>}
            </div>
          )}

          {game.is_host && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid rgba(240,196,32,.3)", paddingTop: 10 }}>
              <div style={{ textAlign: "center", fontSize: 20, fontWeight: 900, color: gold }}>{t("quiz_coins_earned", game.coins_total)}</div>
              {!over && (
                <button onClick={onEnd} style={{ padding: "11px 0", borderRadius: 999, border: "none", background: gold, color: "#000", fontWeight: 900, fontSize: 16, cursor: "pointer" }}>{t("quiz_end_game")}</button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The host's ONE screen (Steve: "Pic a game and click start"): a tile per game, START, done. */
export function QuizGamesPicker({ onStart, onClose }: { onStart: (category: string | null) => Promise<void>; onClose: () => void }) {
  const { t } = useT();
  const [cats, setCats] = useState<TriviaCategory[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);   // null = Mix of everything
  const [busy, setBusy] = useState(false);
  const load = () => { setCats(null); fetchTriviaCategories().then(setCats).catch(() => setCats([])); };
  useEffect(load, []);
  const tile = (key: string | null, emoji: string, label: string) => {
    const on = picked === key;
    return (
      <button key={key ?? "mix"} type="button" onClick={() => setPicked(key)}
              style={{ minHeight: 84, padding: "10px 8px", borderRadius: 16, cursor: "pointer", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
                       background: on ? "rgba(240,196,32,.18)" : "rgba(255,255,255,.07)", border: `2px solid ${on ? "#F0C420" : "rgba(212,175,55,.78)"}`,
                       boxShadow: on ? "0 0 0 3px #F0C420, 0 0 16px rgba(240,196,32,.45)" : "none", touchAction: "manipulation", minWidth: 0 }}>
        <span style={{ fontSize: 32, lineHeight: 1 }}>{emoji}</span>
        <span style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.2, textAlign: "center", overflowWrap: "anywhere", color: on ? "#F0C420" : "#fff" }}>{label}</span>
      </button>
    );
  };
  return (
    <div role="dialog" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#000", border: `2px solid ${gold}`, borderRadius: 18, padding: 16, maxWidth: 440, width: "100%", boxSizing: "border-box", color: "#fff", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <button onClick={onClose} aria-label="Back" style={{ width: 34, height: 34, flex: "none", borderRadius: "50%", border: `1.5px solid ${gold}`, background: "#000", color: gold, fontSize: 20, cursor: "pointer" }}>‹</button>
          <h3 style={{ color: gold, margin: 0, fontSize: 20 }}>🧠 {t("quiz_games")}</h3>
        </div>
        <div style={{ overflowY: "auto", flex: 1, minHeight: 0, padding: 4, margin: -4 }}>
          {cats === null ? <p style={{ opacity: 0.75, textAlign: "center" }}>{t("quiz_loading_games")}</p> : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {tile(null, "🌟", t("quiz_mix_of_everything"))}
                {cats.map((c) => tile(c.key, c.emoji, t("quiz_x_quiz", c.label)))}
              </div>
              {cats.length === 0 && (
                <p style={{ fontSize: 13, opacity: 0.85, textAlign: "center" }}>{t("quiz_couldnt_load_games")} <button onClick={load} style={{ background: "none", border: "none", color: gold, fontWeight: 700, cursor: "pointer" }}>{t("quiz_retry")}</button></p>
              )}
            </>
          )}
        </div>
        <button disabled={busy || cats === null} onClick={async () => { setBusy(true); try { await onStart(picked); } finally { setBusy(false); } }}
                style={{ width: "100%", marginTop: 14, padding: "15px 0", borderRadius: 999, border: "none", background: gold, color: "#000", fontWeight: 900, fontSize: 22, letterSpacing: 2, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}>
          {busy ? t("quiz_starting") : t("quiz_start")}
        </button>
        <div style={{ textAlign: "center", fontSize: 12.5, opacity: 0.75, marginTop: 8 }}>{t("quiz_start_line", QUIZ_PRICE, QUIZ_SECONDS)}</div>
      </div>
    </div>
  );
}
