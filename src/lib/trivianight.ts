// Quiz Games (was Trivia Night; Steve 2026-10-27: "Pic a game and click start") — TriviaNightController.
// The host picks ONE category (or the mix) and starts; the server's defaults do the rest: 20s questions,
// 5 coins an answer, "Get ready" 3s before each question, the answer shown 10s. Viewers pay per try (a
// gift to the host) and are told at once whether they were right; a wrong try can try another box on
// the same question. Right answers win points, never coins. The game reaches the page through the
// room's one combined poll (lib/roomgames.ts).
import { post } from "./api";

export type TriviaCategory = { key: string; label: string; emoji: string; count?: number };
export type TNPerson = { user_id: number; name: string; image?: string | null; points: number; correct?: number };
export type TriviaNight = {
  trivia_night_id: number; game_no: number; room_name: string; host_user_id: number;
  status: "active" | "completed"; end_reason: string | null; categories: TriviaCategory[]; difficulty: string;
  question_seconds: number; coins_per_answer: number; paused: boolean; phase: "ready" | "question" | "reveal" | "waiting" | "over";
  /** ms_left: the open question's clock. next_ms_left: "Get ready" (ready) / "Next question in N" (reveal). */
  q_number: number; ms_left: number | null; next_ms_left?: number | null;
  question: { text: string; category: string; category_label: string; difficulty: string; answers: string[] } | null;
  answered_count: number;
  result: { q_number: number; correct: number; counts: number[]; right_count: number; right_answer: string | null } | null;
  players: TNPerson[]; audience_top: TNPerson[]; coins_total: number;
  is_host: boolean; is_player: boolean; my_answer: number | null; my_points: number; my_correct: number;
  my_rank: number | null; my_last_points: number | null; my_streak: number;
  /** This question: got it right (every box locks) / the boxes already tried wrong (greyed, ✖) / how many tries. */
  my_right?: boolean; my_wrong?: number[]; my_tries?: number;
};
/** What a paid (or on-stage) answer came back with: right or wrong at once, the fresh state, or why it was refused. */
export type TriviaNightAnswer = { game: TriviaNight | null; correct: boolean | null; message: string | null };
export type TriviaFanRow = { rank: number; user_id: number; name: string; answered: number; correct: number; best_streak: number };

export const norm = (raw: unknown): TriviaNight | null =>
  raw && typeof raw === "object" && typeof (raw as TriviaNight).trivia_night_id === "number" ? (raw as TriviaNight) : null;

export async function fetchTriviaCategories(): Promise<TriviaCategory[]> {
  // Never an empty body: the host's WAF answers an empty-body POST with a 403.
  const res = await post<TriviaCategory[]>("fetchTriviaCategories", { lang: "en" });
  return res.status && Array.isArray(res.data) ? res.data : [];
}

/** One game: a category key, or null for "Mix of everything". Nothing else is sent — the server's
 *  defaults are the game (20s questions, 5 coins an answer, mixed difficulty, nobody on stage). */
export async function startTriviaNight(userId: number, roomName: string, category: string | null) {
  const res = await post<Record<string, unknown>>("startTriviaNight", {
    user_id: userId, room_name: roomName, ...(category ? { categories: category } : {}),
  });
  return { game: res.status ? norm(res.data) : null, message: res.status ? null : (res.message ?? "Couldn't start Trivia Night.") };
}

const correctOf = (v: unknown): boolean | null => (v === true || v === 1 || v === "1" || v === "true" ? true : v === false || v === 0 || v === "0" || v === "false" ? false : null);

/** A player on stage answers free; anyone else pays the host's price (a gift to the host). Both
 *  answers come back with `correct` — the celebration or "Sorry, this answer is wrong" is shown from
 *  THAT, at once. A refusal (the same wrong box twice, anything after a right answer) is a message. */
export async function answerTriviaNight(myUserId: number, game: TriviaNight, choice: number): Promise<TriviaNightAnswer> {
  if (game.is_player) {
    const res = await post<Record<string, unknown>>("answerTriviaNight", { user_id: myUserId, trivia_night_id: game.trivia_night_id, choice });
    return { game: norm(res.data), correct: res.status ? correctOf(res.correct) : null, message: res.status ? null : (res.message ?? "That answer didn't go through.") };
  }
  const res = await post<Record<string, unknown>>("sendCoinsToUser", {
    my_user_id: myUserId, user_id: game.host_user_id, trivia_night_id: game.trivia_night_id, choice, room_name: game.room_name,
  });
  return {
    game: res.status ? norm(res.trivia_night) : null, correct: res.status ? correctOf(res.correct) : null,
    message: res.status ? null : (res.message ?? "That answer didn't go through."),
  };
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
