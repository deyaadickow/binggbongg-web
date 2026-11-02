// What's Behind Me? (game #21, Steve 2026-11-02) — the viewer's card, in the game-show kit.
//
// The host's phone draws the round's word behind the host; this card is everyone else's half:
// "What's behind me?" and 4 big coloured boxes. A tap is 5 coins (a gift to the host). Right = the
// full-screen celebration at once; wrong = "Sorry, this answer is wrong, please try again" and
// another box may be tapped, paying again — the quiz games' rule. "Remove a wrong answer" (5 coins,
// once a round) takes one wrong box away for this viewer. 5 words a game: ready 3s, play 30s,
// reveal 10s; then the podium of the fastest and the Word Master, 10s.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Confetti, CountdownRing, MuteButton, Podium, SceneBanner, SceneChips } from "./GameShow";
import { Celebration, WrongAnswerNotice, type CelebrationShow } from "./Celebration";
import { sfx } from "../lib/gameSounds";
import { SCENES, type Scene } from "../lib/gameSceneData";
import { useT, type StringKey } from "../lib/i18n";
import { NOT_ENOUGH_COINS, type BehindAnswer, type BehindGame } from "../lib/behind";

const gold = "var(--gold, #F0C420)";
const LETTERS = ["A", "B", "C", "D"];
const TILE_COLORS = ["#D85A30", "#1D9E75", "#378ADD", "#BA7517"];
/** The word bank's categories, each on the scene that fits it (scenes come from the shared table). */
const CATEGORY_SCENE: Record<string, string> = {
  animals: "jungle", food: "kitchen", places: "castle", sports: "stadium", music: "stage", things: "playroom", jobs: "road", nature: "forest",
};
const sceneFor = (category: string | null): Scene => SCENES[CATEGORY_SCENE[category ?? ""] ?? "stage"] ?? SCENES.stage;
const CATEGORY_KEY: Record<string, StringKey> = {
  animals: "wbm_cat_animals", food: "wbm_cat_food", places: "wbm_cat_places", sports: "wbm_cat_sports",
  music: "wbm_cat_music", things: "wbm_cat_things", jobs: "wbm_cat_jobs", nature: "wbm_cat_nature",
};

type BoxLook = "plain" | "wrong" | "right" | "dim" | "pending" | "gone";

function AnswerBox({ i, text, look, tappable, onTap }: { i: number; text: string; look: BoxLook; tappable: boolean; onTap: (i: number) => void }) {
  const [pressed, setPressed] = useState(false);
  const grey = look === "wrong" || look === "gone";
  return (
    <button type="button" aria-disabled={!tappable}
            onPointerDown={() => { if (tappable) setPressed(true); }}
            onPointerUp={() => setPressed(false)} onPointerCancel={() => setPressed(false)} onPointerLeave={() => setPressed(false)}
            onClick={() => { if (tappable) onTap(i); }}
            className="gs-anim"
            style={{ position: "relative", minHeight: 64, minWidth: 0, padding: "10px 10px", borderRadius: 14, textAlign: "left", color: "#fff",
                     background: grey ? "#4A4F55" : TILE_COLORS[i % 4], cursor: tappable ? "pointer" : "default", touchAction: "manipulation",
                     border: `3px solid ${look === "right" ? "#fff" : look === "pending" ? "rgba(255,255,255,.85)" : look === "gone" ? "rgba(255,255,255,.18)" : "transparent"}`,
                     borderStyle: look === "gone" ? "dashed" : "solid",
                     boxShadow: look === "right" ? "0 0 0 3px #2FBF5B, 0 0 18px rgba(47,191,91,.7)" : pressed ? "inset 0 0 0 999px rgba(255,255,255,.22)" : grey ? "none" : "0 3px 0 rgba(0,0,0,.35)",
                     opacity: look === "dim" ? 0.35 : look === "gone" ? 0.4 : grey ? 0.75 : 1,
                     transform: pressed ? "scale(.95)" : "scale(1)", transition: "transform .08s, opacity .3s, background .2s",
                     animation: look === "right" ? "gs-pop .5s ease-in-out 3" : look === "pending" ? "gs-pop .6s ease-in-out infinite" : "none",
                     WebkitTapHighlightColor: "transparent", userSelect: "none" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <b style={{ flex: "none", background: "rgba(0,0,0,.3)", borderRadius: 8, padding: "2px 8px", fontSize: 15 }}>{grey ? "✖" : look === "right" ? "✅" : LETTERS[i % 4]}</b>
        <span style={{ flex: 1, minWidth: 0, fontSize: 17, fontWeight: 900, lineHeight: 1.2, overflowWrap: "anywhere", textShadow: "0 1px 2px rgba(0,0,0,.35)",
                       textTransform: "uppercase", letterSpacing: 0.5, textDecoration: grey ? "line-through" : "none" }}>{text}</span>
      </span>
    </button>
  );
}

export function BehindGamePanel({ game, myUserId, iAmOnScreen, onAnswer, onRemoveWrong, onEnd, onClose }: {
  game: BehindGame; myUserId: number | null;
  /** The host and the host's co-hosts are on screen in the room — they can't answer. */
  iAmOnScreen: boolean;
  /** Sends the paid tap; resolves with right/wrong — or null when it didn't go through. */
  onAnswer: (i: number) => Promise<BehindAnswer | null>;
  /** Sends the paid power-up; resolves with the removed box, or null. */
  onRemoveWrong: () => Promise<{ removed: number | null; message: string | null } | null>;
  onEnd: () => void; onClose: () => void;
}) {
  const { t } = useT();
  const [collapsed, setCollapsed] = useState(false);
  const [polledAt, setPolledAt] = useState(() => Date.now());
  const [, setTick] = useState(0);
  const [burst, setBurst] = useState(0);
  const [celebrate, setCelebrate] = useState<CelebrationShow | null>(null);
  const [wrongShow, setWrongShow] = useState(0);
  const [needCoins, setNeedCoins] = useState(false);
  // What THIS page already knows about the round, ahead of the next poll: a poll that left before
  // the tap was paid must not un-grey a box, bring a removed box back, or unlock the boxes again.
  const [local, setLocal] = useState<{ key: string; wrong: number[]; right: number | null; removed: number[] }>({ key: "", wrong: [], right: null, removed: [] });
  const [pending, setPending] = useState<number | "remove" | null>(null);
  const prevPhase = useRef(game.phase);
  const lastTick = useRef(-1);
  useEffect(() => { setPolledAt(Date.now()); }, [game]);
  const over = game.phase === "done" || game.status === "completed";
  useEffect(() => {
    if (over) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, [over, game.game_id]);
  useEffect(() => {
    const was = prevPhase.current;
    prevPhase.current = game.phase;
    if (game.phase === "reveal" && was === "play") sfx.reveal();
    if (game.phase === "done" && was !== "done") { sfx.fanfare(); setBurst(Date.now()); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.phase]);

  const roundKey = `${game.game_id}:${game.round}`;
  const sameRound = local.key === roundKey;
  const msLeft = Math.max(0, game.ms_left - (Date.now() - polledAt));
  const secs = Math.ceil(msLeft / 1000);
  const playing = !over && game.phase === "play" && game.options.length > 0;
  if (playing && secs <= 5 && secs > 0 && lastTick.current !== secs) { lastTick.current = secs; sfx.tick(); }

  const wrong = new Set([...game.my_answers, ...(sameRound ? local.wrong : [])]);
  const removed = new Set([...game.removed, ...(sameRound ? local.removed : [])]);
  const rightLocal = sameRound ? local.right : null;
  const gotIt = game.my_correct || rightLocal !== null;
  const canPlay = !!myUserId && !game.is_host && game.can_answer && !iAmOnScreen;
  // At the reveal the word is on the card; the box that matches it is the right one.
  const word = game.word;
  const rightIndex = game.correct_option ?? (word ? game.options.findIndex((o) => o.toLowerCase() === word.toLowerCase()) : -1);
  const revealing = !over && game.phase === "reveal";
  // The box this viewer got right: tapped here, or (after a reload) the word once it is known, or
  // the last box they tapped — a right tap ends their round, so it is always the last one.
  const myRight = rightLocal ?? (game.my_correct ? (rightIndex >= 0 ? rightIndex : game.my_answers[game.my_answers.length - 1] ?? null) : null);
  if (myRight !== null) wrong.delete(myRight);

  const lookOf = (i: number): BoxLook => {
    if (revealing && rightIndex >= 0) return i === rightIndex ? "right" : "dim";
    if (pending === i) return "pending";
    if (gotIt) return i === myRight ? "right" : "dim";
    if (removed.has(i)) return "gone";
    if (wrong.has(i)) return "wrong";
    return "plain";
  };
  const tappable = (i: number) => playing && canPlay && secs > 0 && !gotIt && pending === null && !wrong.has(i) && !removed.has(i);
  const wrongLeft = game.options.filter((_, i) => !wrong.has(i) && !removed.has(i)).length;
  const removeUsed = removed.size > 0;
  const canRemove = playing && canPlay && secs > 0 && !gotIt && pending === null && !removeUsed && wrongLeft > 1;

  async function tap(i: number) {
    if (!tappable(i)) return;
    const key = roundKey;
    setPending(i);
    setNeedCoins(false);
    try {
      const r = await onAnswer(i);
      if (r?.message === NOT_ENOUGH_COINS) setNeedCoins(true);
      if (r?.correct === true) {
        setLocal((l) => ({ ...(l.key === key ? l : { key, wrong: [], removed: [] }), key, right: i }));
        setCelebrate({ id: Date.now() });
      } else if (r?.correct === false) {
        setLocal((l) => { const b = l.key === key ? l : { key, wrong: [], right: null, removed: [] }; return { ...b, key, wrong: [...b.wrong, i] }; });
        setWrongShow(Date.now());
      }
    } finally { setPending(null); }
  }

  async function removeOne() {
    if (!canRemove) return;
    const key = roundKey;
    setPending("remove");
    setNeedCoins(false);
    try {
      const r = await onRemoveWrong();
      if (r?.message === NOT_ENOUGH_COINS) setNeedCoins(true);
      if (r && r.removed !== null) {
        const gone = r.removed;
        setLocal((l) => { const b = l.key === key ? l : { key, wrong: [], right: null, removed: [] }; return { ...b, key, removed: [...b.removed, gone] }; });
        sfx.tick();
      }
    } finally { setPending(null); }
  }

  const coins = (n: number) => t(n === 1 ? "n_coin" : "n_coins", n);
  let status = "";
  if (playing) {
    if (game.is_host) status = t("quiz_n_answered", game.correct_count_this_round);
    else if (!myUserId) status = t("quiz_sign_in_to_play");
    else if (!canPlay) status = t("wbm_on_screen_cant_answer");
    else if (gotIt) status = t("wbm_you_got_it_wait");
    else status = t("quiz_tap_an_answer", coins(game.coins_per_answer));
  }

  const winners = game.round_winners;
  const podiumRows = game.podium.slice(0, 3).map((p) => ({ name: p.name, value: t("wbm_n_right", p.correct) }));
  const master = game.podium[0] ?? null;
  const scene = sceneFor(game.category);

  return (
    <div style={{ position: "fixed", top: 120, left: "50%", transform: "translateX(-50%)", zIndex: 87, width: "min(430px, calc(100vw - 24px))", boxSizing: "border-box",
                  background: "rgba(0,0,0,.92)", border: `2px solid ${gold}`, borderRadius: 18, padding: 12, color: "#fff", maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}>
      <Confetti burst={burst} />
      <Celebration show={celebrate} />
      <WrongAnswerNotice show={wrongShow} />
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <b style={{ color: gold, fontSize: 16, flex: 1, minWidth: 0, lineHeight: 1.25 }}>🫣 {t("wbm_title")}</b>
        {!over && <span style={{ fontSize: 12.5, fontWeight: 800, opacity: 0.9, whiteSpace: "nowrap" }}>{t("wbm_word_n_of_m", game.round, game.rounds)}</span>}
        {playing && collapsed && <b style={{ fontVariantNumeric: "tabular-nums", color: secs <= 5 ? "#E5484D" : "#fff" }}>⏱ {secs}s</b>}
        <MuteButton />
        <button onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? "Expand" : "Collapse"} style={{ background: "none", border: "none", color: gold, fontSize: 20, cursor: "pointer", padding: "0 4px" }}>{collapsed ? "+" : "–"}</button>
        {over && <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: gold, fontSize: 18, cursor: "pointer" }}>✕</button>}
      </div>
      {!collapsed && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          <SceneBanner scene={scene} height={64}>
            <SceneChips topLeft={game.category ? (CATEGORY_KEY[game.category] ? t(CATEGORY_KEY[game.category]) : game.category) : null}
                        bottomRight={game.phase === "reveal" || over ? [] : [[coins(game.coins_per_answer), true]]}
                        centre={revealing && word ? null : over ? null : t("wbm_whats_behind_me_q")} pop={game.phase === "ready"} />
          </SceneBanner>

          {!over && game.phase === "ready" && (
            <div style={{ textAlign: "center", padding: "4px 0 2px" }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: gold }}>{t("quiz_get_ready")}</div>
              <div style={{ fontSize: 16, fontWeight: 700, opacity: 0.9, marginTop: 2 }}>{t("wbm_word_n", game.round)}</div>
              <div key={secs} className="gs-anim" style={{ fontSize: 56, fontWeight: 900, lineHeight: 1.1, marginTop: 2, animation: "gs-pop .5s ease-out" }}>{Math.max(1, secs)}</div>
              {game.is_host && word && <div style={{ fontSize: 14, opacity: 0.9 }}>{t("wbm_your_word", word.toUpperCase())}</div>}
            </div>
          )}

          {!over && (game.phase === "play" || game.phase === "reveal") && game.options.length > 0 && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {playing && <CountdownRing msLeft={msLeft} totalMs={game.play_seconds * 1000} size={50} />}
                <div style={{ flex: 1, minWidth: 0, fontSize: 19, fontWeight: 900, lineHeight: 1.3, textAlign: "center" }}>
                  {revealing && word ? t("wbm_it_was", word.toUpperCase()) : t("wbm_whats_behind_me_q")}
                </div>
              </div>
              {game.is_host && playing && word && <div style={{ textAlign: "center", fontSize: 13, opacity: 0.85 }}>{t("wbm_your_word", word.toUpperCase())}</div>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {game.options.map((a, i) => <AnswerBox key={i} i={i} text={a} look={lookOf(i)} tappable={tappable(i)} onTap={(n) => void tap(n)} />)}
              </div>
              {/* Hidden once used (the box it took is greyed), once right, or for anyone who can't answer. */}
              {playing && canPlay && !gotIt && !removeUsed && (
                <button type="button" onClick={() => void removeOne()} disabled={!canRemove}
                        style={{ padding: "10px 12px", borderRadius: 999, border: `2px solid ${gold}`, background: canRemove ? "rgba(240,196,32,.14)" : "transparent",
                                 color: canRemove ? gold : "rgba(255,255,255,.5)", fontWeight: 900, fontSize: 15, cursor: canRemove ? "pointer" : "default", touchAction: "manipulation" }}>
                  {pending === "remove" ? "…" : `✂️ ${t("wbm_remove_wrong", coins(game.remove_price))}`}
                </button>
              )}
            </>
          )}

          {revealing && (
            <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 3 }}>
              {/* The word itself, big and gold, the way it stood behind the host. */}
              {word && <div className="gs-anim" style={{ fontSize: 34, fontWeight: 900, letterSpacing: 2, color: gold, textShadow: "0 3px 0 #6B4A00, 0 0 18px rgba(240,196,32,.45)", animation: "gs-pop .8s ease-in-out 2" }}>{word.toUpperCase()}</div>}
              <div style={{ fontSize: 15, fontWeight: 800 }}>
                {game.correct_count_this_round === 0 ? t("wbm_nobody_got_it") : t("wbm_n_got_it", game.correct_count_this_round)}
              </div>
              {winners.length > 0 && <div style={{ fontSize: 13, opacity: 0.85, overflowWrap: "anywhere" }}>⚡ {winners.slice(0, 5).map((w) => w.name).join(" · ")}</div>}
              {game.round < game.rounds && <div style={{ fontSize: 13.5, opacity: 0.9 }}>{t("wbm_next_word_in", Math.max(1, secs))}</div>}
            </div>
          )}

          {status && <div style={{ fontSize: 14, fontWeight: 700, textAlign: "center", opacity: 0.92 }}>{status}</div>}
          {playing && canPlay && !gotIt && removeUsed && <div style={{ fontSize: 12.5, textAlign: "center", opacity: 0.8 }}>{t("wbm_removed_one")}</div>}
          {needCoins && (
            <div style={{ textAlign: "center", fontSize: 14, fontWeight: 700, color: "#FFB4B4" }}>
              {t("wbm_not_enough_coins")} <Link to="/wallet" style={{ color: gold }}>{t("buy_coins")}</Link>
            </div>
          )}

          {over && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: gold }}>{t("wbm_game_over")}</div>
              {master ? (
                <>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>👑 {t("wbm_word_master", master.name)}</div>
                  <Podium rows={podiumRows} />
                </>
              ) : <div style={{ fontSize: 13, opacity: 0.8 }}>{t("wbm_nobody_won")}</div>}
              {word && <div style={{ fontSize: 13, opacity: 0.8 }}>{t("wbm_last_word", word.toUpperCase())}</div>}
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
