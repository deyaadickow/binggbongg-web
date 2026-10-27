// Trivia Battle (Steve, 2026-10-27) — the server is TriviaController. The right answer never
// arrives while a question is open. Players poll fetchMyTrivia (adds only their own answer and
// 50/50); everyone else polls fetchTriviaGame. Lifelines and votes are sendCoinsToUser with
// trivia_game_id; the PRICE is the host's, read off the game there.
import { post } from "./api";

export type TriviaMode = "duel" | "computer" | "audience";
export type TriviaPlayer = { side: "one" | "two"; user_id: number | null; is_audience: boolean; is_computer: boolean; name: string; image?: string | null; score: number; coins: number; answered: boolean; ms_left: number };
export type TriviaResult = { q_index: number; correct: number; answers: { one: number | null; two: number | null }; points: { one: number; two: number }; question?: string; right_answer?: string };
export type TriviaGame = {
  trivia_game_id: number; game_no: number; host_user_id: number; mode: TriviaMode; ai_level?: string | null;
  status: string; result: "one" | "two" | "draw" | null; winner_user_id: number | null;
  phase: "question" | "reveal"; q_number: number; q_count: number; question_seconds: number; ms_left: number;
  question: string | null; category?: string | null; options: string[];
  last_result: TriviaResult | null; my_side: "one" | "two" | null; my_answer: number | null; my_removed: number[];
  vote_tallies: number[] | null; events: { type: string; by: string; for_user_id: number }[]; results: TriviaResult[];
  prices: { "5050": number; time: number; vote: number }; players: TriviaPlayer[];
};

export const norm = (raw: unknown): TriviaGame | null => (raw && typeof raw === "object" && Array.isArray((raw as TriviaGame).players) ? raw as TriviaGame : null);

/** Players get their own secrets through the signed-in call; everyone else the public one. */
export async function fetchTrivia(roomName: string, myUserId: number | null, iAmPlayer: boolean): Promise<TriviaGame | null> {
  const res = iAmPlayer && myUserId
    ? await post<Record<string, unknown>>("fetchMyTrivia", { user_id: myUserId, room_name: roomName })
    : await post<Record<string, unknown>>("fetchTriviaGame", { room_name: roomName });
  return res.status ? norm(res.data) : null;
}

export type TriviaStart = { mode: TriviaMode; level?: string; opponent?: number; prices: { "5050": number; time: number; vote: number } };

export async function startTrivia(userId: number, roomName: string, s: TriviaStart) {
  const res = await post<Record<string, unknown>>("startTriviaGame", {
    user_id: userId, room_name: roomName, mode: s.mode, ai_level: s.level ?? "", opponent_user_id: s.opponent ?? "",
    price_5050: s.prices["5050"], price_time: s.prices.time, price_vote: s.prices.vote,
  });
  return { game: res.status ? norm(res.data) : null, message: res.message };
}

export async function answerTrivia(userId: number, gameId: number, choice: number) {
  const res = await post<Record<string, unknown>>("answerTrivia", { user_id: userId, trivia_game_id: gameId, choice });
  return { game: norm(res.data), message: res.status ? null : (res.message ?? "That answer didn't go through.") };
}

export async function cancelTrivia(userId: number, gameId: number) {
  const res = await post("cancelTriviaGame", { user_id: userId, trivia_game_id: gameId });
  return res.status ? null : (res.message ?? "Couldn't end the game.");
}

export async function buyTrivia(myUserId: number, recipientId: number, gameId: number, powerup: "5050" | "time" | "vote", roomName: string, choice?: number) {
  const res = await post<Record<string, unknown>>("sendCoinsToUser", {
    my_user_id: myUserId, user_id: recipientId, trivia_game_id: gameId, powerup, choice: choice ?? "", room_name: roomName,
  });
  return { game: res.status ? norm(res.trivia_game) : null, message: res.status ? null : (res.message ?? "That didn't go through.") };
}
