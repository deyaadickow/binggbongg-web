// Q&A on profiles and the Nearby feed (Steve, 2026-11-17: "All" — TikTok-style features).
//
// Server: binggbongg-backend branch qa-nearby 1cc24bd (QaController + PostController
// fetchNearbyPosts + uploadPost answer_question_id), NOT deployed yet. Until it is, the dev server
// answers the NEW endpoints from lib/qaMock.ts, so trying them never sends a question to the live
// server. The mock is only ever imported under `import.meta.env.DEV`, so it is not in the
// production build.
import { post, type ApiResponse, type Post } from "./api";

const NEW_ENDPOINTS = new Set(["askQuestion", "fetchProfileQuestions", "deleteProfileQuestion", "fetchNearbyPosts"]);

const MOCK_KEY = "bb.qaMock";

/** Dev server only: `?qamock=none` makes the Nearby feed answer as if the profile had no location
 *  (the "Add your city" note); `?qamock=state` / `country` picks a wider area. `?qamock=0` resets.
 *  Always "" in the production build. */
export function qaMockMode(): string {
  if (!import.meta.env.DEV) return "";
  try {
    const q = new URLSearchParams(window.location.search).get("qamock");
    if (q !== null) {
      if (q === "0" || q === "") localStorage.removeItem(MOCK_KEY);
      else localStorage.setItem(MOCK_KEY, q);
    }
    return localStorage.getItem(MOCK_KEY) ?? "";
  } catch {
    return "";
  }
}

export async function qaCall<T>(endpoint: string, params: Record<string, unknown>): Promise<ApiResponse<T>> {
  if (import.meta.env.DEV && NEW_ENDPOINTS.has(endpoint)) {
    const m = await import("./qaMock");
    return m.mockQaCall<T>(endpoint, params, qaMockMode());
  }
  return post<T>(endpoint, params);
}

// ---- Q&A -----------------------------------------------------------------------------------------

export const QUESTION_MIN = 3;
export const QUESTION_MAX = 150;

export interface QaAsker { id: number; username?: string; fullname?: string; profile_image?: string | null }
export interface QaQuestion {
  id: number;
  creator_user_id: number;
  question: string;
  created_at?: string;
  asker?: QaAsker | null;
  answered: boolean;
  answer_post: { id: number; thumbnail?: string | null } | null;
  is_mine: boolean;
  can_answer: boolean;
}
/** What every post carries once 1cc24bd is deployed (null when it answers no question). */
export interface QaQuestionRef { id: number; question: string; creator_user_id: number; user_id?: number; user_name?: string; fullname?: string; profile_image?: string | null }

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export async function askQuestion(myUserId: number, creatorId: number, question: string): Promise<QaQuestion> {
  const r = await qaCall<QaQuestion>("askQuestion", { my_user_id: myUserId, creator_id: creatorId, question: question.trim() });
  if (!r.status || !r.data) throw new Error(r.message || "");
  return r.data;
}

export async function fetchProfileQuestions(creatorId: number, myUserId: number | null | undefined, start = 0, count = 30):
  Promise<{ rows: QaQuestion[]; total: number; unanswered: number }> {
  const r = await qaCall<QaQuestion[]>("fetchProfileQuestions", {
    creator_id: creatorId, ...(myUserId ? { my_user_id: myUserId } : {}), start, count,
  });
  if (!r.status) throw new Error(r.message || "");
  const rows = arr<QaQuestion>(r.data).map((q) => ({ ...q, answered: !!q.answered, is_mine: !!q.is_mine, can_answer: !!q.can_answer }));
  return { rows, total: Number(r.total ?? rows.length) || 0, unanswered: Number(r.unanswered ?? 0) || 0 };
}

export async function deleteProfileQuestion(myUserId: number, questionId: number): Promise<void> {
  const r = await qaCall("deleteProfileQuestion", { my_user_id: myUserId, question_id: questionId });
  if (!r.status) throw new Error(r.message || "");
}

// ---- Nearby feed ---------------------------------------------------------------------------------

export interface NearbyArea { level: "city" | "state" | "country" | "none"; name: string }

/** One batch of the Nearby feed: videos from the member's own area, from the location already on
 *  their profile. Never asks the browser for its location. */
export async function fetchNearbyPosts(myUserId: number, start: number): Promise<{ posts: Post[]; area: NearbyArea }> {
  const r = await qaCall<Post[]>("fetchNearbyPosts", { my_user_id: myUserId, start, count: 10 });
  if (!r.status) throw new Error(r.message || "");
  const a = (r as { area?: Partial<NearbyArea> }).area;
  const level = a?.level === "city" || a?.level === "state" || a?.level === "country" ? a.level : "none";
  return { posts: arr<Post>(r.data), area: { level, name: String(a?.name ?? "") } };
}
