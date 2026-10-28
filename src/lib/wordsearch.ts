// Word Search (#21; Steve, 2026-10-28: "all audiences can participate, charge 1 to 25 coins per
// letter with leaderboard and the whole shabang") — WordSearchController. The host picks a theme and
// a price per letter and starts; the whole room races on ONE 12x12 grid. Finding a word is a gift to
// the host of its letters x the price — a swipe that isn't a word costs nothing, and each word can
// only be bought once (the first finder claims it). Finds win points (one a letter), never coins.
// The game reaches the page through the room's one combined poll (lib/roomgames.ts).
import { post } from "./api";

export type WSTheme = { key: string; label: string; emoji: string; count?: number };
export type WSCell = [number, number];
export type WSWord = {
  word: string; letters: number; found: boolean; found_by: { user_id: number; name: string } | null;
  /** The finder's colour, 0..7 (WS_COLORS). */
  color: number | null;
  /** Where it is, in reading order — once found, and for every word once the puzzle is over. */
  cells: WSCell[] | null; found_ms: number | null;
};
export type WSPerson = { user_id: number; name: string; image?: string | null; points: number; words: number; color?: number };
export type WordSearch = {
  word_search_id: number; game_no: number; room_name: string; host_user_id: number;
  status: "active" | "completed"; end_reason: string | null;
  theme: WSTheme | null; is_mix: boolean; coins_per_letter: number;
  phase: "ready" | "playing" | "result" | "over"; puzzle_no: number;
  /** ms_left: the puzzle's clock. next_ms_left: "Get ready" (ready) / "Next puzzle in N" (result). */
  ms_left: number | null; next_ms_left: number | null;
  size: number; grid: string[] | null; words: WSWord[]; found_count: number; total_words: number;
  recent: { word: string; name: string; user_id: number; letters: number; ms_ago: number }[];
  result: { puzzle_no: number; why: string; found: number; total: number; top: WSPerson[] } | null;
  top: WSPerson[]; coins_total: number;
  is_host: boolean; my_points: number; my_words: number; my_rank: number | null; my_color: number | null;
};
export type WSFinder = { rank: number; user_id: number; name: string; image: string | null; words: number; letters: number; longest: number };

/** The eight finder colours — the same hexes on Android and iOS. */
export const WS_COLORS = ["#FF4D6D", "#4DABFF", "#3DDC84", "#FFB020", "#B76BFF", "#00D1C1", "#FF7A3D", "#FF5FD2"];
export const WS_PRICES = [1, 5, 10, 25];
export const WS_DEFAULT_PRICE = 5;
export const WS_PUZZLE_MS = 300_000;

export const norm = (raw: unknown): WordSearch | null =>
  raw && typeof raw === "object" && typeof (raw as WordSearch).word_search_id === "number" ? (raw as WordSearch) : null;

/** The letters of a list word as hidden in the grid: "CAR SEAT" -> "CARSEAT". */
export const lettersOf = (word: string) => word.toUpperCase().replace(/[^A-Z]/g, "");

/** The cells from a to b along a straight row, column or diagonal — or null. */
export function lineCells(a: WSCell, b: WSCell): WSCell[] | null {
  const dr = Math.sign(b[0] - a[0]), dc = Math.sign(b[1] - a[1]);
  const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
  if (n === 0) return null;
  if (dr !== 0 && dc !== 0 && Math.abs(b[0] - a[0]) !== Math.abs(b[1] - a[1])) return null;
  return Array.from({ length: n + 1 }, (_, k) => [a[0] + dr * k, a[1] + dc * k] as WSCell);
}

/** What a swipe spells, matched against the list (either way round). */
export function matchSwipe(game: WordSearch, cells: WSCell[]): { kind: "new"; word: WSWord } | { kind: "taken"; word: WSWord } | { kind: "none" } {
  if (!game.grid) return { kind: "none" };
  const s = cells.map(([r, c]) => game.grid![r]?.[c] ?? "").join("");
  const rev = s.split("").reverse().join("");
  let taken: WSWord | null = null;
  for (const w of game.words) {
    const l = lettersOf(w.word);
    if (l !== s && l !== rev) continue;
    if (!w.found) return { kind: "new", word: w };
    taken = taken ?? w;
  }
  return taken ? { kind: "taken", word: taken } : { kind: "none" };
}

export async function fetchWordSearchThemes(): Promise<WSTheme[]> {
  // Never an empty body: the host's WAF answers an empty-body POST with a 403.
  const res = await post<WSTheme[]>("fetchWordSearchThemes", { lang: "en" });
  return res.status && Array.isArray(res.data) ? res.data : [];
}

/** A theme key, or null for "Mix of everything"; the price per letter (1–25). */
export async function startWordSearch(userId: number, roomName: string, theme: string | null, coinsPerLetter: number) {
  const res = await post<Record<string, unknown>>("startWordSearch", {
    user_id: userId, room_name: roomName, coins_per_letter: coinsPerLetter, ...(theme ? { theme } : {}),
  });
  return { game: norm(res.data), message: res.status ? null : (res.message ?? "Couldn't start Word Search.") };
}

export type WSFindResult = { game: WordSearch | null; found: { word: string; letters: number; coins: number } | null; message: string | null };

/** Buys the word the swipe spells — a gift to the host, priced by the server. */
export async function findWord(myUserId: number, game: WordSearch, from: WSCell, to: WSCell): Promise<WSFindResult> {
  const res = await post<Record<string, unknown>>("sendCoinsToUser", {
    my_user_id: myUserId, user_id: game.host_user_id, word_search_id: game.word_search_id,
    from_r: from[0], from_c: from[1], to_r: to[0], to_c: to[1], room_name: game.room_name,
  });
  const f = res.found as WSFindResult["found"] | undefined;
  return { game: res.status ? norm(res.word_search) : null, found: res.status && f ? f : null, message: res.status ? null : (res.message ?? "That didn't go through.") };
}

export async function endWordSearch(userId: number, game: WordSearch) {
  const res = await post<Record<string, unknown>>("endWordSearch", { user_id: userId, word_search_id: game.word_search_id });
  return { game: norm(res.data), message: res.status ? null : (res.message ?? "That didn't go through.") };
}

export async function fetchWordFinders(): Promise<WSFinder[]> {
  const res = await post<WSFinder[]>("fetchWordSearchLeaderboard", { limit: 50 });
  return res.status && Array.isArray(res.data) ? res.data : [];
}
