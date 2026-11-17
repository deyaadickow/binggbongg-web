// DEV-ONLY stand-in for the Q&A + Nearby server (binggbongg-backend qa-nearby 1cc24bd, not deployed
// yet). Loaded only through lib/qa.ts (and lib/socialMock.ts) under `import.meta.env.DEV`, so it is
// never in the production build, and on the dev server a question is never sent to the live server.
//
// Content is REAL where it can be: the Nearby feed and the answer videos are the live, read-only
// fetchPosts. Questions live in sessionStorage.
import { post, type ApiResponse, type Post } from "./api";
import type { QaQuestion, QaQuestionRef } from "./qa";
import { mockFileUrl } from "./socialMock";

const STORE = "bb.qaMock.state";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ok = <T,>(data: T, extra: Record<string, unknown> = {}): ApiResponse<T> => ({ status: true, data, ...extra });
const fail = <T,>(message: string): ApiResponse<T> => ({ status: false, message });

interface Row {
  id: number; creator_user_id: number; asker_id: number; asker_name: string; asker_fullname: string;
  question: string; created_at: string; answer_post_id: number | null; answer_thumb: string | null; hidden: boolean;
}
interface State { rows: Row[]; seeded: number[]; seq: number }
function load(): State {
  const blank: State = { rows: [], seeded: [], seq: 1 };
  try { return { ...blank, ...(JSON.parse(sessionStorage.getItem(STORE) || "{}") as Partial<State>) }; } catch { return blank; }
}
function save(s: State) { try { sessionStorage.setItem(STORE, JSON.stringify(s)); } catch { /* fine */ } }
const nowSql = (minsAgo = 0) => new Date(Date.now() - minsAgo * 60_000).toISOString().slice(0, 19).replace("T", " ");

let pool: Post[] = [];
async function realPosts(min = 10): Promise<Post[]> {
  for (let i = 0; i < 3 && pool.length < min; i++) {
    const r = await post<Post[]>("fetchPosts", {}).catch(() => null);
    const seen = new Set(pool.map((p) => p.id));
    for (const p of r?.data ?? []) if (!seen.has(p.id) && p.user) pool.push(p);
  }
  return pool;
}

const ASKERS = [
  { id: 900101, name: "maria.santos", full: "Maria Santos" },
  { id: 900102, name: "jun_reyes", full: "Jun Reyes" },
  { id: 900103, name: "ella.cruz", full: "Ella Cruz" },
];

/** A few questions on each profile the first time it is opened, one of them answered. */
async function seed(s: State, creatorId: number) {
  if (s.seeded.includes(creatorId)) return;
  s.seeded.push(creatorId);
  const posts = await realPosts();
  const ans = posts[0];
  const texts = [
    "How did you learn to sing like that?",
    "What time do you usually go live?",
    "Can you show us your city next time?",
  ];
  texts.forEach((question, i) => {
    const a = ASKERS[i % ASKERS.length];
    s.rows.push({
      id: s.seq++, creator_user_id: creatorId, asker_id: a.id, asker_name: a.name, asker_fullname: a.full, question,
      created_at: nowSql(60 * (i + 1)), hidden: false,
      answer_post_id: i === 0 && ans ? ans.id : null, answer_thumb: i === 0 && ans ? ans.thumbnail ?? null : null,
    });
  });
}

function toRow(r: Row, me: number): QaQuestion {
  const thumb = r.answer_thumb?.startsWith("mockfile:") ? mockFileUrl(r.answer_thumb.slice(9)) : r.answer_thumb;
  return {
    id: r.id, creator_user_id: r.creator_user_id, question: r.question, created_at: r.created_at,
    asker: { id: r.asker_id, username: r.asker_name, fullname: r.asker_fullname, profile_image: null },
    answered: !!r.answer_post_id, answer_post: r.answer_post_id ? { id: r.answer_post_id, thumbnail: thumb } : null,
    is_mine: !!me && r.asker_id === me, can_answer: !!me && me === r.creator_user_id && !r.answer_post_id,
  };
}

/** uploadPost answer_question_id (called by socialMock): the server's checks, then the link. */
export function mockAnswerQuestion(questionId: number, uploaderId: number, postId: number, thumbKey: string): QaQuestionRef | string {
  const s = load();
  const r = s.rows.find((x) => x.id === questionId && !x.hidden);
  if (!r) return "That question isn't available any more.";
  if (r.creator_user_id !== uploaderId) return "Only the member who was asked can answer this question.";
  r.answer_post_id = postId;
  r.answer_thumb = "mockfile:" + thumbKey;
  save(s);
  return { id: r.id, question: r.question, creator_user_id: r.creator_user_id, user_id: r.asker_id, user_name: r.asker_name, fullname: r.asker_fullname, profile_image: null };
}

export async function mockQaCall<T>(endpoint: string, params: Record<string, unknown>, mode: string): Promise<ApiResponse<T>> {
  await wait(250);
  const s = load();
  const me = Number(params.my_user_id ?? 0);
  switch (endpoint) {
    case "fetchProfileQuestions": {
      const creator = Number(params.creator_id);
      if (!creator) return fail("creator_id is required");
      await seed(s, creator);
      save(s);
      const rows = s.rows.filter((r) => r.creator_user_id === creator && !r.hidden);
      const isCreator = me === creator;
      rows.sort((a, b) => {
        const aa = a.answer_post_id ? 1 : 0, bb = b.answer_post_id ? 1 : 0;
        if (aa !== bb) return isCreator ? aa - bb : bb - aa;
        return b.created_at.localeCompare(a.created_at);
      });
      const start = Number(params.start ?? 0), count = Number(params.count ?? 30);
      return ok(rows.slice(start, start + count).map((r) => toRow(r, me)) as T,
        { total: rows.length, unanswered: rows.filter((r) => !r.answer_post_id).length });
    }
    case "askQuestion": {
      const creator = Number(params.creator_id);
      const q = String(params.question ?? "").trim();
      if (!me) return fail("Please sign in.");
      if (me === creator) return fail("You can't ask yourself a question.");
      if (q.length < 3 || q.length > 150) return fail("A question is 3 to 150 characters.");
      const row: Row = { id: s.seq++, creator_user_id: creator, asker_id: me, asker_name: "testmember", asker_fullname: "Test Member",
        question: q, created_at: nowSql(), answer_post_id: null, answer_thumb: null, hidden: false };
      s.rows.push(row);
      save(s);
      return ok(toRow(row, me) as T, { message: "Question sent (dev mock — nothing was sent)" });
    }
    case "deleteProfileQuestion": {
      const r = s.rows.find((x) => x.id === Number(params.question_id) && !x.hidden);
      if (!r) return fail("That question isn't available any more.");
      if (me !== r.creator_user_id && me !== r.asker_id) return fail("Only the creator or the member who asked can remove this.");
      r.hidden = true;
      save(s);
      return ok(null as T);
    }
    case "fetchNearbyPosts": {
      if (mode.includes("none")) return ok([] as T, { area: { level: "none", name: "" } });
      const level = mode.includes("country") ? "country" : mode.includes("state") ? "state" : "city";
      const name = level === "country" ? "Philippines" : level === "state" ? "Metro Manila" : "Quezon City";
      const r = await post<Post[]>("fetchPosts", {}).catch(() => null);
      return ok((r?.data ?? []) as T, { area: { level, name } });
    }
  }
  return fail(`(dev mock) ${endpoint} is not mocked`);
}
