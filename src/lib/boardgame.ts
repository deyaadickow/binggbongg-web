// Checkers + Chess battles (Steve, 2026-10-27) — the server is BoardGameController and decides
// every move; each poll carries the legal moves, so this side only highlights them. Power-ups and
// audience votes are bought through sendCoinsToUser with board_game_id; the PRICE is the host's,
// read off the game there.
import { post } from "./api";

export type BoardKind = "checkers" | "chess" | "fourinarow" | "reversi" | "mancala";
export type Sq = [number, number];
/** `from` is null in placement games (Four in a Row, Reversi, Mancala): one tap plays it. */
export type BoardMove = { key: string; from: Sq | null; to: Sq; path: Sq[]; label: string; column?: number };
export type BoardPlayer = { side: "one" | "two"; user_id: number | null; is_audience: boolean; is_computer?: boolean; name: string; image?: string | null; ms_left: number | null; coins: number };
export type BoardEvent = { type: string; by: string; for_user_id: number; move?: string | null };
export type BoardGame = {
  board_game_id: number; game_no: number; kind: BoardKind; mode: "duel" | "audience" | "computer"; ai_level?: string | null; host_user_id: number;
  status: string; result: "one" | "two" | "draw" | null; reason: string | null; winner_user_id: number | null;
  turn: "one" | "two"; plies: number; in_check: boolean; board: string[][]; moves: BoardMove[];
  last_move: { key: string; path: Sq[]; side: string } | null;
  hint: { side: string; key: string; path: Sq[]; label: string } | null;
  frozen: { side: "one" | "two"; ms_left: number } | null;
  vote: { ms_left: number; tallies: { key: string; label: string; path: Sq[]; votes: number }[] } | null;
  history: string[]; events: BoardEvent[]; clock_minutes: number;
  winning_line?: Sq[] | null; blocked_column?: number | null; counts?: { one: number; two: number } | null;
  prices: { time: number; freeze: number; hint: number; vote: number };
  players: BoardPlayer[];
};

function normalise(raw: unknown): BoardGame | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as BoardGame;
  if (!Array.isArray(g.board) || !Array.isArray(g.players)) return null;
  return { ...g, moves: g.moves ?? [], history: g.history ?? [], events: g.events ?? [] };
}

export async function fetchBoardGame(roomName: string): Promise<BoardGame | null> {
  const res = await post<Record<string, unknown>>("fetchBoardGame", { room_name: roomName });
  return res.status ? normalise(res.data) : null;
}

export type AiLevel = "easy" | "medium" | "hard";
export type BoardStart = { kind: BoardKind; mode: "duel" | "audience" | "computer"; level?: AiLevel; opponent?: number; minutes: number; prices: BoardGame["prices"] };

export async function startBoardGame(userId: number, roomName: string, s: BoardStart) {
  const res = await post<Record<string, unknown>>("startBoardGame", {
    user_id: userId, room_name: roomName, kind: s.kind, mode: s.mode, ai_level: s.level ?? "", opponent_user_id: s.opponent ?? "",
    clock_minutes: s.minutes, price_time: s.prices.time, price_freeze: s.prices.freeze, price_hint: s.prices.hint, price_vote: s.prices.vote,
  });
  return { game: res.status ? normalise(res.data) : null, message: res.message };
}

export async function makeBoardMove(userId: number, gameId: number, key: string) {
  const res = await post<Record<string, unknown>>("makeBoardMove", { user_id: userId, board_game_id: gameId, move: key });
  return { game: normalise(res.data), message: res.status ? null : (res.message ?? "That move didn't go through.") };
}

export async function resignBoardGame(userId: number, gameId: number) {
  const res = await post("resignBoardGame", { user_id: userId, board_game_id: gameId });
  return res.status ? null : (res.message ?? "Couldn't resign.");
}

export async function cancelBoardGame(userId: number, gameId: number) {
  const res = await post("cancelBoardGame", { user_id: userId, board_game_id: gameId });
  return res.status ? null : (res.message ?? "Couldn't end the game.");
}

/** A power-up for a player (coins go to them) or a vote (recipient = the host). */
export type BoardPowerup = "time" | "freeze" | "hint" | "vote" | "block";
export async function buyBoardPowerup(myUserId: number, recipientId: number, gameId: number, powerup: BoardPowerup, roomName: string, move?: string) {
  const res = await post<Record<string, unknown>>("sendCoinsToUser", {
    my_user_id: myUserId, user_id: recipientId, board_game_id: gameId, powerup, move: move ?? "", room_name: roomName,
  });
  return { game: res.status ? normalise(res.board_game) : null, message: res.status ? null : (res.message ?? "That didn't go through.") };
}
