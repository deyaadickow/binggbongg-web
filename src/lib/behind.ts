// What's Behind Me? (game #21, Steve 2026-11-02: "Yes, build both on all three platforms").
// The host's phone draws the round's word in huge gold letters BEHIND the host (the camera's
// background is swapped for a dark Bingg Bongg backdrop, the word scrolling slowly sideways), so
// only some letters peek out. Viewers tap one of 4 boxes — the word and 3 decoys of the same
// category — for 5 coins each (a gift to the host). A wrong box can be followed by another one,
// paying again; "Remove a wrong answer" is 5 coins, once a round. Winners get glory, never coins.
//
// The game reaches the page through the room's one combined poll (lib/roomgames.ts, key `behind`).
// The server never sends the word to a viewer before the reveal — only the 4 options — so nothing
// here can leak it. The web cannot draw the word behind a web host (its live camera has no
// background-replacement pipeline), so the web only PLAYS this game; it is started from the phones.
//
// Fields follow the backend contract (scratchpad text_behind_api.md, 2026-11-02); parsing stays
// tolerant of a missing field. The HOST receives the word only through fetchMyRoomGames — the
// signed-in poll lib/roomgames.ts already uses for every signed-in member.
import { post } from "./api";

export type BehindPhase = "ready" | "play" | "reveal" | "done";
export type BehindPerson = { user_id: number; name: string; image?: string | null; correct: number; ms: number | null };
export type BehindGame = {
  game_id: number; room_name: string; host_user_id: number;
  round: number; rounds: number; phase: BehindPhase;
  /** ms left in this phase at the moment the poll answered (phase_ends_at - server_now). */
  ms_left: number;
  /** Seconds the play phase lasts (for the countdown ring). */
  play_seconds: number;
  /** Only the HOST gets it during ready/play; everyone in reveal/done. */
  word: string | null;
  category: string | null;
  options: string[];
  /** Indexes into `options`: the caller's removed box(es) this round / the boxes the caller tried. */
  removed: number[];
  my_answers: number[];
  my_correct: boolean;
  correct_count_this_round: number;
  /** reveal only: the right box (0-3). */
  correct_option: number | null;
  my_total_correct: number;
  /** Who got this round's word (reveal), fastest first, when the server sends it. */
  round_winners: BehindPerson[];
  podium: BehindPerson[];
  coins_per_answer: number;
  remove_price: number;
  coins_total: number;
  is_host: boolean;
  /** False for the host and the host's co-hosts — they can't answer. */
  can_answer: boolean;
  status: "active" | "completed" | string;
  end_reason: string | null;
};

const num = (v: unknown, d = 0): number => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const bool = (v: unknown): boolean => v === true || v === 1 || v === "1" || v === "true";
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : typeof v === "number" ? String(v) : null);
const PHASES: BehindPhase[] = ["ready", "play", "reveal", "done"];

/** The options as text: plain strings, or {text|word|label} objects. */
function optionsOf(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((o) => (typeof o === "string" ? o : str((o as Record<string, unknown>)?.text) ?? str((o as Record<string, unknown>)?.word) ?? str((o as Record<string, unknown>)?.label) ?? String(o)));
}

/** A list of boxes as indexes, whether the server sent indexes or the option texts. */
function indexesOf(raw: unknown, options: string[]): number[] {
  const list = Array.isArray(raw) ? raw : raw === null || raw === undefined || raw === "" ? [] : [raw];
  const out: number[] = [];
  for (const v of list) {
    let i = -1;
    if (typeof v === "number" || (typeof v === "string" && /^\d+$/.test(v))) i = Number(v);
    else if (typeof v === "string") i = options.findIndex((o) => o.toLowerCase() === v.toLowerCase());
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const ix = o.option ?? o.index ?? o.choice;
      const text = str(o.text) ?? str(o.word);
      if (ix !== undefined) i = indexesOf([ix], options)[0] ?? -1;
      else if (text) i = options.findIndex((x) => x.toLowerCase() === text.toLowerCase());
    }
    if (i >= 0 && i < Math.max(options.length, 4) && !out.includes(i)) out.push(i);
  }
  return out;
}

function personOf(raw: unknown): BehindPerson | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const id = num(p.user_id ?? p.id, 0);
  const name = str(p.name) ?? str(p.fullname) ?? str(p.username) ?? "";
  if (!id && !name) return null;
  return {
    user_id: id, name: name || "Someone", image: str(p.image) ?? str(p.profile_image),
    correct: num(p.correct ?? p.correct_count ?? p.score ?? p.points, 0),
    ms: (() => { const v = p.ms ?? p.total_ms ?? p.time_ms ?? p.answer_ms; return v === undefined || v === null ? null : num(v); })(),
  };
}
const people = (raw: unknown): BehindPerson[] => (Array.isArray(raw) ? raw.map(personOf).filter((p): p is BehindPerson => !!p) : []);

export function norm(raw: unknown): BehindGame | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const id = num(d.game_id ?? d.behind_game_id ?? d.id, 0);
  if (!id) return null;
  const options = optionsOf(d.options);
  const phaseRaw = String(d.phase ?? "").toLowerCase();
  const status = String(d.status ?? (phaseRaw === "done" ? "completed" : "active"));
  const phase: BehindPhase = PHASES.includes(phaseRaw as BehindPhase) ? (phaseRaw as BehindPhase)
    : phaseRaw === "question" ? "play" : phaseRaw === "over" || status === "completed" ? "done" : "ready";
  // phase_ends_at / server_now are server ms; tolerate seconds, and a plain ms_left.
  const toMs = (v: unknown) => { const n = num(v, 0); return n > 0 && n < 1e12 ? n * 1000 : n; };
  const ends = toMs(d.phase_ends_at);
  const now = toMs(d.server_now);
  const msLeft = d.ms_left !== undefined && d.ms_left !== null ? num(d.ms_left)
    : ends ? Math.max(0, ends - (now || Date.now())) : 0;
  const myAnswers = indexesOf(d.my_answers ?? d.my_wrong, options);
  return {
    game_id: id, room_name: String(d.room_name ?? ""), host_user_id: num(d.host_user_id ?? d.host_id, 0),
    round: Math.max(1, num(d.round ?? d.round_no, 1)), rounds: Math.max(1, num(d.rounds ?? d.total_rounds, 5)), phase,
    ms_left: Math.max(0, msLeft), play_seconds: Math.max(1, num(d.play_seconds ?? d.round_seconds, 30)),
    word: str(d.word), category: str(d.category),
    options, removed: indexesOf(d.removed, options), my_answers: myAnswers,
    my_correct: bool(d.my_correct),
    correct_option: d.correct_option === null || d.correct_option === undefined ? null : num(d.correct_option, -1) >= 0 ? num(d.correct_option) : null,
    my_total_correct: num(d.my_total_correct, 0),
    correct_count_this_round: num(d.correct_count_this_round ?? d.correct_count, 0),
    round_winners: people(d.round_winners ?? d.correct_users ?? d.got_it),
    podium: people(d.podium),
    coins_per_answer: Math.max(1, num(d.coins_per_answer ?? d.price ?? d.coins, 5)),
    remove_price: Math.max(1, num(d.coins_remove_wrong ?? d.remove_price, 5)),
    coins_total: num(d.coins_total ?? d.coins_earned, 0),
    is_host: bool(d.is_host),
    can_answer: d.can_answer === undefined ? !bool(d.is_host) && !bool(d.is_cohost) : bool(d.can_answer),
    status, end_reason: str(d.end_reason),
  };
}

/** The state that came back with an action: under `behind`, `game` or `data`. */
const stateOf = (res: Record<string, unknown>): BehindGame | null =>
  norm(res.behind) ?? norm((res.data as Record<string, unknown> | undefined)?.behind) ?? norm(res.game) ?? norm(res.data);

/** The server's reason: `not_enough_coins` (code and message both) opens Buy coins on the card;
 *  any other refusal (round_closed, already_tried, …) carries a human `message`. */
export const NOT_ENOUGH_COINS = "not_enough_coins";
const reasonOf = (res: { message?: string; code?: unknown }, fallback: string) => {
  const m = res.message ?? "";
  return res.code === NOT_ENOUGH_COINS || m === NOT_ENOUGH_COINS ? NOT_ENOUGH_COINS : m || fallback;
};
// No startBehindGame here: the game is started from the phones, which draw the word behind the host.

export type BehindAnswer = { game: BehindGame | null; correct: boolean | null; coinsLeft: number | null; message: string | null };

/** A paid tap (5 coins, a gift to the host). Right or wrong comes back at once with the payment. */
export async function answerBehindGame(userId: number, game: BehindGame, option: number): Promise<BehindAnswer> {
  const res = await post<Record<string, unknown>>("answerBehindGame", {
    user_id: userId, game_id: game.game_id, round: game.round, option,
  });
  const d = (res.data && typeof res.data === "object" ? res.data : {}) as Record<string, unknown>;
  const c = res.correct ?? d.correct;
  const left = res.coins_left ?? d.coins_left;
  return {
    // A refusal usually carries the fresh state too — redraw from it either way.
    game: stateOf(res),
    correct: res.status ? (c === undefined ? null : bool(c)) : null,
    coinsLeft: left === undefined || left === null ? null : num(left),
    message: res.status ? null : reasonOf(res, "That answer didn't go through."),
  };
}

/** The power-up: 5 coins (a gift to the host) takes one wrong box away for this viewer, once a round. */
export async function behindRemoveWrong(userId: number, game: BehindGame) {
  const res = await post<Record<string, unknown>>("behindRemoveWrong", { user_id: userId, game_id: game.game_id, round: game.round });
  const d = (res.data && typeof res.data === "object" ? res.data : {}) as Record<string, unknown>;
  const removed = indexesOf(d.removed_option ?? res.removed_option, game.options);
  const left = res.coins_left ?? d.coins_left;
  return {
    game: stateOf(res),
    removed: res.status ? (removed[removed.length - 1] ?? null) : null,
    coinsLeft: left === undefined || left === null ? null : num(left),
    message: res.status ? null : reasonOf(res, "That didn't go through."),
  };
}

export async function endBehindGame(userId: number, game: BehindGame) {
  const res = await post<Record<string, unknown>>("endBehindGame", { user_id: userId, game_id: game.game_id });
  return { game: stateOf(res), message: res.status ? null : (res.message ?? "That didn't go through.") };
}
