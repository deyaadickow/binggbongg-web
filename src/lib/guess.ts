// Guessing Games (Steve, 2026-10-27) — GuessGameController. The host runs a guess about something
// on their own camera; each viewer makes ONE paid guess (1–25 coins, the host's price, a gift to the
// host) and can change it free until guessing locks. Right guesses win recognition only — never
// coins. The game reaches the page through the room's one combined poll (lib/roomgames.ts).
import { post } from "./api";

export type GuessKind = "pick" | "number" | "score";
export type GuessTemplate = { key: string; category: string; emoji: string; kind: GuessKind; title: string; unit: string | null; options: string[] | null; uses_players: boolean };
export type GuessPerson = { user_id: number; name: string; image?: string | null };
export type GuessValue = { choice?: number; n?: number; a?: number; b?: number };
export type GuessGame = {
  guess_game_id: number; game_no: number; room_name: string; host_user_id: number; template_key: string | null; emoji: string;
  kind: GuessKind; title: string; unit: string | null; options: string[]; players: GuessPerson[]; coins_per_guess: number;
  status: "open" | "locked" | "resolved" | "cancelled" | "expired"; lock_ms_left: number | null;
  guesses_count: number; coins_total: number; tallies: number[] | null;
  answer_label: string | null; answer: GuessValue | null; winners_count: number; winners: (GuessPerson & { guess_label: string })[];
  is_host: boolean; is_player: boolean; my_guess: GuessValue | null; my_guess_label: string | null; my_is_winner: boolean | null; my_streak: number;
};
export type GuessStart = {
  templateKey?: string; title: string; kind: GuessKind; unit?: string; options?: string[]; usePlayers?: boolean;
  playerIds: number[]; price: number; lockMinutes: number;
};
export type GuesserRow = { rank: number; user_id: number; name: string; image?: string | null; guesses: number; correct: number; streak: number; best_streak: number };

export const GUESS_PRICE_MIN = 1;
export const GUESS_PRICE_MAX = 25;

export const norm = (raw: unknown): GuessGame | null =>
  raw && typeof raw === "object" && typeof (raw as GuessGame).guess_game_id === "number" ? (raw as GuessGame) : null;

/** The guess fields the server reads — also how the host enters the answer. */
const fields = (kind: GuessKind, v: GuessValue) =>
  kind === "pick" ? { choice: v.choice } : kind === "number" ? { guess_number: v.n } : { guess_a: v.a, guess_b: v.b };

export async function fetchGuessTemplates(): Promise<GuessTemplate[]> {
  // Never an empty body: the host's WAF answers an empty-body POST with a 403.
  const res = await post<GuessTemplate[]>("fetchGuessTemplates", { lang: "en" });
  return res.status && Array.isArray(res.data) ? res.data : [];
}

export async function startGuessGame(userId: number, roomName: string, s: GuessStart) {
  const res = await post<Record<string, unknown>>("startGuessGame", {
    user_id: userId, room_name: roomName, template_key: s.templateKey, title: s.title, kind: s.kind, unit: s.unit,
    options: s.options && s.options.length ? JSON.stringify(s.options) : undefined, use_players: s.usePlayers ? 1 : undefined,
    player_user_ids: s.playerIds.join(","), coins_per_guess: s.price, lock_minutes: s.lockMinutes,
  });
  return { game: res.status ? norm(res.data) : null, message: res.status ? null : (res.message ?? "Couldn't start the game.") };
}

/** The first guess is paid — a gift to the host at the host's price. */
export async function buyGuess(myUserId: number, game: GuessGame, v: GuessValue) {
  const res = await post<Record<string, unknown>>("sendCoinsToUser", {
    my_user_id: myUserId, user_id: game.host_user_id, guess_game_id: game.guess_game_id, room_name: game.room_name, ...fields(game.kind, v),
  });
  return { game: res.status ? norm((res as unknown as { guess_game?: unknown }).guess_game) : null, message: res.status ? null : (res.message ?? "That guess didn't go through.") };
}

const act = async (endpoint: string, params: Record<string, unknown>) => {
  const res = await post<Record<string, unknown>>(endpoint, params);
  return { game: norm(res.data), message: res.status ? null : (res.message ?? "That didn't go through.") };
};
export const changeGuess = (userId: number, game: GuessGame, v: GuessValue) => act("changeGuess", { user_id: userId, guess_game_id: game.guess_game_id, ...fields(game.kind, v) });
export const lockGuess = (userId: number, game: GuessGame) => act("lockGuessGame", { user_id: userId, guess_game_id: game.guess_game_id });
export const resolveGuess = (userId: number, game: GuessGame, v: GuessValue) => act("resolveGuessGame", { user_id: userId, guess_game_id: game.guess_game_id, ...fields(game.kind, v) });
export const cancelGuess = (userId: number, game: GuessGame) => act("cancelGuessGame", { user_id: userId, guess_game_id: game.guess_game_id });

export async function fetchGuessLeaderboard(): Promise<GuesserRow[]> {
  const res = await post<GuesserRow[]>("fetchGuessLeaderboard", { limit: 50 });
  return res.status && Array.isArray(res.data) ? res.data : [];
}
