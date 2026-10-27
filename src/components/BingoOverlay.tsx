// Bingg Bongg Bingo Battle (Steve, 2026-10-11) — the card over the live room, web side.
//
// The card is an OVERLAY on the room, not its own page. The whole mechanic is that viewers
// double-click a number WHILE they watch; navigating away would mean they stop watching the
// stream they are gifting into.
//
// The numbers sit on Steve's own artwork as PERCENTAGES of it, which is why this is a plain
// <img> inside a position:relative box with absolutely-positioned cells rather than a canvas:
// percentages mean the card scales as one piece, so a wide desktop card and a narrow phone
// one stay aligned with no per-size arithmetic. That is also the one thing the web gets for
// free that both phones had to compute by hand.
//
// Steve, 2026-10-11: "Add a live video grid for the host and all the guest on top of the
// bingo card if there is more than just the host." Here the strip is the room's own video
// elements cloned by the caller — see the `strip` prop; this component only lays them out.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BINGO_CELL_H, BINGO_CELL_W, BINGO_COLUMNS, BINGO_COL_X, BINGO_ROW_Y, BINGO_ASPECT,
  BINGO_FALLBACK, BINGO_MIN, BINGO_PAYABLE_SQUARES, BINGO_QUICK_CHOICES, BINGO_STEP,
  bingoClamp, bingoFormat, bingoPlayedOn, fetchBingoBoard, fetchBingoGameWinners, winLabel,
  type BingoBoard, type BingoCard, type BingoGame, type BingoWin, type BingoWinners,
} from "../lib/bingo";
import { Overlay } from "./BattleEngines";
import { useT } from "../lib/i18n";
import { Confetti, MuteButton, Podium, SceneBanner } from "./GameShow";
import { SCENES } from "../lib/gameSceneData";
import { haptic, sfx } from "../lib/gameSounds";

/** The Bingo podium rule, one everywhere (the room, the game's winners page, Android, iOS): the
 *  whole-card winner first, then whoever took the most patterns. Under each name: "Whole card"
 *  for the whole-card winner, otherwise "N patterns" ("1 pattern"). */
function bingoPodium(wins: BingoWin[], winnerUserId: number | null, t: ReturnType<typeof useT>["t"]) {
  const byUser = new Map<string, BingoWin[]>();
  for (const w of wins) {
    const k = String(w.user_id ?? w.name ?? "");
    byUser.set(k, [...(byUser.get(k) ?? []), w]);
  }
  return [...byUser.values()]
    .map((l) => ({ l, whole: l.some((w) => w.pattern === "whole_card") || (winnerUserId !== null && l[0].user_id === winnerUserId), n: l.length }))
    .sort((a, b) => Number(b.whole) - Number(a.whole) || b.n - a.n)
    .slice(0, 3)
    .map(({ l, whole, n }) => ({ name: l[0].name ?? "A member", value: whole ? t("bingo_whole_card") : n === 1 ? t("bingo_one_pattern") : t("bingo_n_patterns", n) }));
}

export function BingoCardArt({ card, onBuy, popped }: {
  card: BingoCard | null;
  /** Absent makes the card read-only — a finished game, or a card nobody may buy into. */
  onBuy?: (cell: string) => void;
  /** "col-row" keys of squares covered since the last poll — they pop in (Game Show). */
  popped?: Set<string>;
}) {
  const { t } = useT();
  const cells = useMemo(() => {
    const out: { key: string; cell: string; number: number; left: string; top: string; gifter: string | null }[] = [];
    if (!card) return out;
    for (let col = 0; col < 5; col++) {
      const column = card.numbers[col] ?? [];
      for (let row = 0; row < 5; row++) {
        const n = column[row];
        // null is the free centre, already printed into the artwork.
        if (n === null || n === undefined) continue;
        const covered = card.covered.find((s) => s.col === col && s.row === row);
        out.push({
          key: `${col}-${row}`,
          cell: `${BINGO_COLUMNS[col]}${n}`,
          number: n,
          left: `${(BINGO_COL_X[col] * 100).toFixed(2)}%`,
          top: `${(BINGO_ROW_Y[row] * 100).toFixed(2)}%`,
          gifter: covered ? (covered.gifter_name ?? "") : null,
        });
      }
    }
    return out;
  }, [card]);

  return (
    <div className="bingo-card" style={{ aspectRatio: String(BINGO_ASPECT) }}>
      <img src="/bingo_card_frame.webp" alt={t("bingg_bongg_bingo_card")} />
      {cells.map((c) => (
        <div
          key={c.key}
          className={`bingo-cell${c.gifter !== null ? " covered" : ""}${c.gifter !== null && popped?.has(c.key) ? " popped" : ""}`}
          style={{
            left: c.left, top: c.top,
            width: `${BINGO_CELL_W * 100}%`, height: `${BINGO_CELL_H * 100}%`,
          }}
          // Double-click, matching the phones' double-tap. No confirmation step: that is the
          // spec — "all they have to do is double tap that number" — and a confirm dialog
          // would undo the mechanic it describes. The price band above is always on screen
          // for exactly that reason.
          onDoubleClick={onBuy ? () => onBuy(c.cell) : undefined}
          title={c.gifter !== null ? `${c.cell} — gifted by ${c.gifter || "a member"}` : `Double-click to gift ${c.cell}`}
        >
          <span>{c.gifter !== null ? (c.gifter || "Gifted") : c.number}</span>
        </div>
      ))}
    </div>
  );
}

export function BingoOverlay({ game, myUserId, isHost, strip, onBuy, onEndGame, onClose }: {
  game: BingoGame;
  myUserId: number;
  isHost: boolean;
  /** The live faces, already rendered by the caller — empty or one entry draws no strip. */
  strip: React.ReactNode[];
  onBuy: (card: BingoCard, cell: string) => void;
  onEndGame: () => void;
  onClose: () => void;
}) {
  const { t } = useT();
  // "Mine if I have one, else the first" — resolved on every render rather than stored, so it
  // stays right if the game's player list is not what this browser last saw.
  const [pickedUserId, setPickedUserId] = useState<number | null>(null);
  const shown = useMemo(() => {
    return game.cards.find((c) => c.user_id === pickedUserId)
      ?? game.cards.find((c) => c.user_id === myUserId)
      ?? game.cards[0] ?? null;
  }, [game.cards, pickedUserId, myUserId]);

  // Escape closes it, like every other overlay in this app. The game keeps running.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const active = game.status === "active";

  // Game Show (Steve, 2026-10-27: make the games "entertaining"): a square that gets covered pops
  // in with a sound, a pattern win flashes BINGO! with confetti, and the end gets a fanfare and a
  // podium. All of it fires on what CHANGED since the last poll — the ref holds the last one.
  const [popped, setPopped] = useState<Set<string>>(() => new Set());
  const [burst, setBurst] = useState(0);
  const [shout, setShout] = useState<string | null>(null);
  const timers = useRef<{ pop?: number; shout?: number }>({});
  const coveredKeys = (g: BingoGame) => new Set(g.cards.flatMap((c) => c.covered.map((s) => `${c.bingo_card_id}:${s.col}-${s.row}`)));
  const prev = useRef({ id: game.bingo_game_id, status: game.status, covered: coveredKeys(game), wins: game.wins.length });
  useEffect(() => () => { window.clearTimeout(timers.current.pop); window.clearTimeout(timers.current.shout); }, []);
  useEffect(() => {
    const was = prev.current;
    const covered = coveredKeys(game);
    prev.current = { id: game.bingo_game_id, status: game.status, covered, wins: game.wins.length };
    if (was.id !== game.bingo_game_id) { setPopped(new Set()); setShout(null); return; }
    const fresh = [...covered].filter((k) => !was.covered.has(k));
    if (fresh.length) {
      setPopped(new Set(fresh));
      window.clearTimeout(timers.current.pop);
      timers.current.pop = window.setTimeout(() => setPopped(new Set()), 1400);
    }
    const ended = was.status === "active" && game.status !== "active";
    if (game.wins.length > was.wins) {
      const w = game.wins[game.wins.length - 1];
      setShout(`BINGO! ${winLabel(w.pattern)} — ${w.name ?? "A member"}`);
      window.clearTimeout(timers.current.shout);
      timers.current.shout = window.setTimeout(() => setShout(null), 4000);
      setBurst(Date.now());
      if (!ended) { sfx.correct(); haptic([40, 60, 40]); }
    } else if (fresh.length && !ended) { sfx.reveal(); haptic(20); }
    if (ended && (game.winner_user_id !== null || game.wins.length > 0)) { sfx.fanfare(); setBurst(Date.now()); }
  }, [game]);

  // The one podium rule on every platform: the whole-card winner first, then most patterns.
  const podium = active ? [] : bingoPodium(game.wins, game.winner_user_id, t);
  const shownPopped = useMemo(() => {
    if (!shown) return undefined;
    const prefix = `${shown.bingo_card_id}:`;
    return new Set([...popped].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length)));
  }, [popped, shown]);

  return (
    <div className="bingo-overlay">
      <Confetti burst={burst} />
      <div className="bingo-inner">
        <div className="bingo-top">
          <button className="btn ghost" onClick={onClose}>{t("close_2")}</button>
          <span style={{ flex: 1 }} />
          <MuteButton />
          {isHost && active && <button className="btn" onClick={onEndGame}>{t("end_game")}</button>}
        </div>

        {/* One face is the host looking at their own card, which the room behind already
            shows — nothing worth a strip. */}
        {strip.length > 1 && <div className="bingo-strip">{strip.map((node, i) => <div key={i}>{node}</div>)}</div>}

        <SceneBanner scene={SCENES.retro} height={84}>
          <div style={{ position: "absolute", left: 8, right: 8, top: "50%", transform: "translateY(-50%)", textAlign: "center" }}>
            <span className="bingo-title" style={{ display: "inline-block", maxWidth: "100%", boxSizing: "border-box", background: "rgba(0,0,0,.6)", borderRadius: 999, padding: "4px 14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textShadow: "0 1px 3px #000" }}>
              {active ? t("bingo_number", game.game_no) : t("bingo_number_finished", game.game_no)}
            </span>
          </div>
          {shout && (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(0,0,0,.45)", padding: "0 10px" }}>
              <span className="gs-anim" style={{ maxWidth: "100%", boxSizing: "border-box", textAlign: "center", overflowWrap: "anywhere", lineHeight: 1.2, fontSize: 16, fontWeight: 900, color: "#000", background: "var(--gold, #F0C420)", borderRadius: 12, padding: "5px 12px", animation: "gs-pop .6s ease-in-out 4" }}>🎉 {shout}</span>
            </div>
          )}
        </SceneBanner>

        {/* Always on screen, because a double-click spends this without asking. */}
        <div className="bingo-price">
          {active
            ? t("bingo_price_line_click", bingoFormat(game.coins_per_square))
            : t("bingo_game_has_finished")}
        </div>

        {game.cards.length > 1 && (
          <div className="bingo-pills">
            {game.cards.map((c) => (
              <button
                key={c.bingo_card_id}
                className={`btn ${c.bingo_card_id === shown?.bingo_card_id ? "" : "ghost"}`}
                onClick={() => setPickedUserId(c.user_id)}
              >#{c.card_no} {c.player_name}</button>
            ))}
          </div>
        )}

        {/* Above the card, so the result is the first thing seen when the game ends. */}
        {podium.length > 0 && <div style={{ color: "#fff" }}><Podium rows={podium} /></div>}
        <BingoCardArt
          card={shown}
          onBuy={active && shown ? (cell) => onBuy(shown, cell) : undefined}
          popped={shownPopped}
        />


        <div className="bingo-wins">
          {game.wins.length === 0
            ? t("bingo_patterns_line")
            : game.wins.map((w) => `${winLabel(w.pattern)} — ${w.name ?? "A member"}`).join("   ")}
        </div>
      </div>
    </div>
  );
}

/** The host picks who gets a card and what a square costs, in ONE dialog.
 *
 *  Steve, 2026-10-11: "Give the host the ability to change the coin cost settings for each
 *  square. Minimum 50 coins." The admin setting is only the default this opens on; the host's
 *  choice is snapshotted onto the game, so it is fixed for that game's life.
 *
 *  Two deliberate decisions, same as both phones:
 *   - The floor is SHOWN as a figure, not only enforced. A host who wants a cheap game and
 *     finds the minus button stopping dead will think it is broken; "Minimum 50" tells them
 *     it is a rule.
 *   - "A whole card is 24 squares" updates live. The price per square is what the host sets,
 *     but what a viewer feels is the cost of filling a card — at 1,000 a square that is
 *     24,000 coins, worth seeing BEFORE starting rather than when nobody plays.
 */
export function BingoStartDialog({ defaultPrice, candidates, onStart, onClose }: {
  defaultPrice: number;
  candidates: { userId: number; name: string }[];
  onStart: (otherPlayerIds: number[], price: number) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [price, setPrice] = useState(() => bingoClamp(defaultPrice > 0 ? defaultPrice : BINGO_FALLBACK));
  const [typed, setTyped] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [capWarning, setCapWarning] = useState(false);
  const MAX_OTHERS = 3;

  function toggle(userId: number) {
    setPicked((prev) => {
      if (prev.includes(userId)) { setCapWarning(false); return prev.filter((id) => id !== userId); }
      // One card each, four cards maximum — Steve's rule, shown rather than silently refused.
      if (prev.length >= MAX_OTHERS) { setCapWarning(true); return prev; }
      return [...prev, userId];
    });
  }

  return (
    <Overlay title={t("start_bingo")} onClose={onClose} width={480}>
      {candidates.length > 0 && (
        <>
          <p className="soft" style={{ marginTop: 0 }}>{t("who_gets_a_card_pick_nobody_to_play_it_o")}</p>
          <div className="bingo-players">
            {candidates.map((c) => (
              <button key={c.userId} className={`btn block ${picked.includes(c.userId) ? "" : "ghost"}`} onClick={() => toggle(c.userId)}>
                {c.name}{picked.includes(c.userId) ? "  ✓" : ""}
              </button>
            ))}
          </div>
          {capWarning && <p className="muted" style={{ fontSize: 13 }}>{t("up_to_n_others_four_cards", MAX_OTHERS)}</p>}
          <hr className="bingo-rule" />
        </>
      )}

      <p className="soft" style={{ marginBottom: 4 }}>{t("square_cost_explainer", BINGO_MIN)}</p>
      <div className="bingo-stepper">
        <button className="btn ghost" onClick={() => setPrice(bingoClamp(price - BINGO_STEP))}>−</button>
        <div className="bingo-amount">{bingoFormat(price)}</div>
        <button className="btn ghost" onClick={() => setPrice(bingoClamp(price + BINGO_STEP))}>+</button>
      </div>
      <p className="muted" style={{ fontSize: 13, textAlign: "center" }}>
        {t("whole_card_is_n_squares", BINGO_PAYABLE_SQUARES, bingoFormat(price * BINGO_PAYABLE_SQUARES))}
      </p>

      <div className="bingo-quick">
        {BINGO_QUICK_CHOICES.map((c) => (
          <button key={c} className="btn ghost" onClick={() => { setTyped(""); setPrice(bingoClamp(c)); }}>{bingoFormat(c)}</button>
        ))}
      </div>

      <input className="input block" inputMode="numeric" placeholder={t("type_a_price")}
             value={typed} onChange={(e) => setTyped(e.target.value.replace(/[^0-9]/g, ""))} />

      <div className="bingo-actions">
        <button className="btn ghost" onClick={onClose}>{t("cancel")}</button>
        <button className="btn" onClick={() => {
          // A typed value wins over the stepper, and is CLAMPED rather than refused: a host
          // who types 10 watches it become 50 instead of dismissing an error.
          const chosen = typed.trim() === "" ? price : bingoClamp(Number(typed));
          onStart(picked, chosen);
        }}>{t("start_bingo_2")}</button>
      </div>
    </Overlay>
  );
}

/** "Bingg Bongg Bingo Battle Board" — every game ever, numbered from 1 and never reset,
 *  newest first. Tap a game for its winners.
 *
 *  Steve, 2026-10-12: "How do we see the game winners and the lifetime bingo battle board?
 *  when a game was over i did not see any of them." Android had both screens built and then
 *  never linked from anywhere; iOS and web had neither. */
export function BingoBoardOverlay({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const [board, setBoard] = useState<BingoBoard | null>(null);
  // A failed fetch is NOT an empty board. Collapsing the two is what tells somebody "no games
  // yet" while the network is down, which reads as the feature being broken.
  const [failed, setFailed] = useState(false);
  const [openGameId, setOpenGameId] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetchBingoBoard()
      .then((b) => { if (alive) { setBoard(b); setFailed(false); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  if (openGameId !== null) {
    return <BingoWinnersOverlay bingoGameId={openGameId} onClose={() => setOpenGameId(null)} />;
  }

  return (
    <Overlay title={t("bingo_battle_board")} onClose={onClose} back width={520}>
      {board && (
        <div className="bingo-stats">
          <div><b>{board.total_games}</b><span>{t("games_2")}</span></div>
          <div><b>{board.total_wins}</b><span>{t("wins")}</span></div>
          <div><b>{board.total_members}</b><span>{t("members")}</span></div>
        </div>
      )}
      {!board && failed && <p className="soft">{t("couldn_t_load_the_board_check_your_conne")}</p>}
      {!board && !failed && <p className="soft">{t("imagePickerLoading")}</p>}
      {board && board.games.length === 0 && (
        <p className="soft">{t("no_games_yet_the_first_one_played_will_b")}</p>
      )}
      {board?.games.map((g) => (
        <button key={g.bingo_game_id} className="btn block bingo-board-row" onClick={() => setOpenGameId(g.bingo_game_id)}>
          <span className="bingo-no">#{g.game_no}</span>
          <span className="bingo-row-main">
            <b>{g.winner_name ?? (g.status === "active" ? "Playing now" : "No whole card")}</b>
            <span className="muted">{bingoPlayedOn(g.played_at)}</span>
          </span>
          <span className="bingo-row-wins">{t("bingo_wins_n", g.wins_count)}</span>
          <span className="kind-go">›</span>
        </button>
      ))}
    </Overlay>
  );
}

/** One game's winners. A LIST, never a single winner: this engine has none by design — a
 *  pattern falling does not end the game, only a whole card does, so one game can carry six
 *  different names, and showing only the whole-card winner would throw away five results that
 *  people paid real coins for. */
export function BingoWinnersOverlay({ bingoGameId, onClose }: { bingoGameId: number; onClose: () => void }) {
  const { t } = useT();
  const [data, setData] = useState<BingoWinners | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchBingoGameWinners(bingoGameId)
      .then((w) => { if (alive) { setData(w); setFailed(false); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [bingoGameId]);

  return (
    <Overlay title={`🎱 Bingo #${data?.game_no ?? ""}`} onClose={onClose} back width={460}>
      {data && (
        <p className="soft" style={{ marginTop: 0 }}>
          {[bingoPlayedOn(data.played_at), t("bingo_players_n", data.players), t("bingo_squares_gifted_n", data.squares_gifted)].filter(Boolean).join(" · ")}
        </p>
      )}
      {!data && failed && <p className="soft">{t("couldn_t_load_this_game_try_again")}</p>}
      {!data && !failed && <p className="soft">{t("imagePickerLoading")}</p>}
      {data && data.winners.length === 0 && <p className="soft">{t("nobody_completed_a_pattern_in_this_game")}</p>}
      {data && data.winners.length > 0 && <div style={{ marginBottom: 10 }}><Podium rows={bingoPodium(data.winners, null, t)} /></div>}
      {data?.winners.map((w, i) => (
        <div key={i} className="bingo-winner-row">
          <span className="bingo-pattern">{winLabel(w.pattern)}</span>
          <span className="bingo-row-main">
            <b>{w.name ?? "A member"}</b>
            {w.pattern_detail && <span className="muted">{w.pattern_detail}</span>}
          </span>
        </div>
      ))}
    </Overlay>
  );
}
