// Trivia Night (#20, Steve 2026-10-27) — TriviaNightController. Unlimited questions by category for
// the whole room, one at a time on a 15–30s timer. The players on stage answer free; viewers pay the
// host's price per answer (a gift to the host). Right answers win points, never coins. The game
// reaches the page through the room's one combined poll (lib/roomgames.ts).
import { post } from "./api";

export type TriviaCategory = { key: string; label: string; emoji: string; count?: number };
export type TNPerson = { user_id: number; name: string; image?: string | null; points: number; correct?: number };
export type TriviaNight = {
  trivia_night_id: number; game_no: number; room_name: string; host_user_id: number;
  status: "active" | "completed"; end_reason: string | null; categories: TriviaCategory[]; difficulty: string;
  question_seconds: number; coins_per_answer: number; paused: boolean; phase: "question" | "reveal" | "waiting" | "over";
  q_number: number; ms_left: number | null;
  question: { text: string; category: string; category_label: string; difficulty: string; answers: string[] } | null;
  answered_count: number;
  result: { q_number: number; correct: number; counts: number[]; right_count: number; right_answer: string | null } | null;
  players: TNPerson[]; audience_top: TNPerson[]; coins_total: number;
  is_host: boolean; is_player: boolean; my_answer: number | null; my_points: number; my_correct: number;
  my_rank: number | null; my_last_points: number | null; my_streak: number;
};
export type TriviaNightStart = { categories: string[]; difficulty: string; seconds: number; price: number; playerIds: number[] };
export type TriviaFanRow = { rank: number; user_id: number; name: string; answered: number; correct: number; best_streak: number };

export const norm = (raw: unknown): TriviaNight | null =>
  raw && typeof raw === "object" && typeof (raw as TriviaNight).trivia_night_id === "number" ? (raw as TriviaNight) : null;

export async function fetchTriviaCategories(): Promise<TriviaCategory[]> {
  // Never an empty body: the host's WAF answers an empty-body POST with a 403.
  const res = await post<TriviaCategory[]>("fetchTriviaCategories", { lang: "en" });
  return res.status && Array.isArray(res.data) ? res.data : [];
}

export async function startTriviaNight(userId: number, roomName: string, s: TriviaNightStart) {
  const res = await post<Record<string, unknown>>("startTriviaNight", {
    user_id: userId, room_name: roomName, categories: s.categories.join(","), difficulty: s.difficulty,
    question_seconds: s.seconds, coins_per_answer: s.price, player_user_ids: s.playerIds.join(","),
  });
  return { game: res.status ? norm(res.data) : null, message: res.status ? null : (res.message ?? "Couldn't start Trivia Night.") };
}

/** A player on stage answers free; anyone else pays the host's price (a gift to the host). */
export async function answerTriviaNight(myUserId: number, game: TriviaNight, choice: number) {
  if (game.is_player) {
    const res = await post<Record<string, unknown>>("answerTriviaNight", { user_id: myUserId, trivia_night_id: game.trivia_night_id, choice });
    return { game: norm(res.data), message: res.status ? null : (res.message ?? "That answer didn't go through.") };
  }
  const res = await post<Record<string, unknown>>("sendCoinsToUser", {
    my_user_id: myUserId, user_id: game.host_user_id, trivia_night_id: game.trivia_night_id, choice, room_name: game.room_name,
  });
  return { game: res.status ? norm((res as unknown as { trivia_night?: unknown }).trivia_night) : null, message: res.status ? null : (res.message ?? "That answer didn't go through.") };
}

const act = async (endpoint: string, params: Record<string, unknown>) => {
  const res = await post<Record<string, unknown>>(endpoint, params);
  return { game: norm(res.data), message: res.status ? null : (res.message ?? "That didn't go through.") };
};
export const pauseTriviaNight = (userId: number, game: TriviaNight, paused: boolean) => act("pauseTriviaNight", { user_id: userId, trivia_night_id: game.trivia_night_id, paused: paused ? 1 : 0 });
export const endTriviaNight = (userId: number, game: TriviaNight) => act("endTriviaNight", { user_id: userId, trivia_night_id: game.trivia_night_id });

export async function fetchTriviaFans(): Promise<TriviaFanRow[]> {
  const res = await post<TriviaFanRow[]>("fetchTriviaNightLeaderboard", { limit: 50 });
  return res.status && Array.isArray(res.data) ? res.data : [];
}
