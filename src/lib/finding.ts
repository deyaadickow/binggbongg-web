// Finding videos (Steve, 2026-11-16: "Hashtags and a Discover/Explore page", "Three feeds: For You,
// Following and Friends side by side", "Search across videos, sounds, hashtags and people",
// "'Not interested' and keyword filters so people can shape their feed").
//
// Server: binggbongg-backend 9716126 (DiscoverController + PostController::fetchFriendsPosts).
// Until that is deployed, the dev server answers the NEW endpoints from lib/findingMock.ts. The
// mock is only ever imported under `import.meta.env.DEV`, so it is not in the production build,
// and in dev a "Not interested" or a keyword can never reach the live server.
import { tt } from "./i18n";
import { post, type ApiResponse, type Post, type Sound, type UserSummary } from "./api";

/** The endpoints this feature added on the server. In dev they are ALWAYS mocked. */
const NEW_ENDPOINTS = new Set([
  "fetchDiscover", "searchAll", "fetchFriendsPosts", "notInterestedPost", "undoNotInterested",
  "fetchKeywordFilters", "addKeywordFilter", "removeKeywordFilter",
]);

const MOCK_KEY = "bb.findMock";

/** Dev server only: `?findmock=member` pretends a member is signed in (so the Friends / Following
 *  tabs, Not interested and Filter keywords can be tried without a real account), and
 *  `?findmock=nofriends` does the same with no mutual follows. `?findmock=0` turns it off.
 *  Always "" in the production build. */
export function findMockMode(): string {
  if (!import.meta.env.DEV) return "";
  try {
    const q = new URLSearchParams(window.location.search).get("findmock");
    if (q !== null) {
      if (q === "0" || q === "") localStorage.removeItem(MOCK_KEY);
      else localStorage.setItem(MOCK_KEY, q);
    }
    return localStorage.getItem(MOCK_KEY) ?? "";
  } catch {
    return "";
  }
}

/** The pretend member's id in the dev mock (never in production). */
export const MOCK_MEMBER_ID = 900001;
export function mockMemberId(): number | null {
  return import.meta.env.DEV && findMockMode() ? MOCK_MEMBER_ID : null;
}

/** The member these features act for: the signed-in member, or the dev mock's pretend member. */
export function findingUserId(realId: number | null | undefined): number | null {
  return realId || mockMemberId();
}

export async function findCall<T>(endpoint: string, params: Record<string, unknown>): Promise<ApiResponse<T>> {
  if (import.meta.env.DEV) {
    const pretend = Number(params.my_user_id) === MOCK_MEMBER_ID;
    if (NEW_ENDPOINTS.has(endpoint) || pretend) {
      const m = await import("./findingMock");
      return m.mockFindingCall<T>(endpoint, params, findMockMode());
    }
  }
  return post<T>(endpoint, params);
}

// ---- Shapes --------------------------------------------------------------------------------------

export interface TrendingHashtag { hashtag: string; recent_videos?: number; total_videos?: number; videos?: { id: number; thumbnail?: string }[] }
export interface TrendingSound extends Sound { uses?: number }
export interface Topic { id: number; name: string; image?: string | null; videos?: number }
export interface RisingCreator { id: number; fullname?: string; username?: string; profile_image?: string | null; views?: number }
export interface Discover { trending_hashtags: TrendingHashtag[]; trending_sounds: TrendingSound[]; topics: Topic[]; rising_creators: RisingCreator[] }

export interface SearchVideo { id: number; thumbnail?: string; description?: string; views?: number; likes?: number; user?: { id: number; fullname?: string; username?: string } | null }
export interface SearchHashtag { id: number; hashtag: string; video_count?: number }
export interface SearchAll { videos: SearchVideo[]; people: UserSummary[]; sounds: Sound[]; hashtags: SearchHashtag[] }

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export async function fetchDiscover(myUserId?: number | null): Promise<Discover> {
  const r = await findCall<Partial<Discover>>("fetchDiscover", myUserId ? { my_user_id: myUserId } : {});
  if (!r.status || !r.data) throw new Error(r.message || "");
  return {
    trending_hashtags: arr<TrendingHashtag>(r.data.trending_hashtags),
    trending_sounds: arr<TrendingSound>(r.data.trending_sounds),
    topics: arr<Topic>(r.data.topics),
    rising_creators: arr<RisingCreator>(r.data.rising_creators),
  };
}

export async function searchAll(query: string, myUserId?: number | null): Promise<SearchAll> {
  const r = await findCall<Partial<SearchAll>>("searchAll", { query, ...(myUserId ? { my_user_id: myUserId } : {}) });
  if (!r.status || !r.data) throw new Error(r.message || "");
  return { videos: arr(r.data.videos), people: arr(r.data.people), sounds: arr(r.data.sounds), hashtags: arr(r.data.hashtags) };
}

export async function searchPostsList(keyword: string, myUserId?: number | null): Promise<Post[]> {
  const r = await findCall<Post[]>("searchPosts", { keyword, start: 0, count: 30, ...(myUserId ? { my_user_id: myUserId } : {}) });
  return r.status ? arr<Post>(r.data) : [];
}

export async function searchUsersList(keyword: string, myUserId?: number | null): Promise<UserSummary[]> {
  const r = await findCall<UserSummary[]>("searchUser", { keyword, start: 0, count: 30, ...(myUserId ? { my_user_id: myUserId } : {}) });
  return r.status ? arr<UserSummary>(r.data) : [];
}

export async function fetchPostsByHashtag(hashtag: string, start: number, count: number, myUserId?: number | null): Promise<{ total: number | null; posts: Post[] }> {
  const r = await findCall<Post[]>("fetchPostsByHashtag", { hashtag, start, count, ...(myUserId ? { my_user_id: myUserId } : {}) });
  // "Hashtag doesn't exists !" just means no videos use it yet.
  if (!r.status) return { total: 0, posts: [] };
  const h = r.hashtag as { video_count?: number } | undefined;
  return { total: h?.video_count != null ? Number(h.video_count) : null, posts: arr<Post>(r.data) };
}

export async function fetchPostsByTopic(topicId: number, start: number, count: number, myUserId?: number | null): Promise<Post[]> {
  const r = await findCall<Post[]>("fetchPostsByProfileCategory", { profile_category_id: topicId, start, count, ...(myUserId ? { my_user_id: myUserId } : {}) });
  if (!r.status) throw new Error(r.message || "");
  return arr<Post>(r.data);
}

// ---- The three feeds -----------------------------------------------------------------------------

export type FeedTab = "friends" | "following" | "foryou";
const FEED_ENDPOINT: Record<FeedTab, string> = { friends: "fetchFriendsPosts", following: "fetchFollowingPosts", foryou: "fetchPosts" };

/** One batch of a feed. `noFriends`: the member follows nobody who follows them back. */
export async function fetchFeedBatch(tab: FeedTab, myUserId: number | null): Promise<{ posts: Post[]; noFriends: boolean }> {
  const params = myUserId ? { my_user_id: myUserId } : {};
  const r = tab === "foryou" && !(import.meta.env.DEV && myUserId === MOCK_MEMBER_ID)
    ? await post<Post[]>(FEED_ENDPOINT[tab], params)
    : await findCall<Post[]>(FEED_ENDPOINT[tab], params);
  if (!r.status) throw new Error(r.message || "");
  return { posts: arr<Post>(r.data), noFriends: tab === "friends" && r.message === "no_friends" };
}

// ---- Not interested + keyword filters ------------------------------------------------------------

export async function notInterested(myUserId: number, postId: number): Promise<void> {
  const r = await findCall("notInterestedPost", { my_user_id: myUserId, post_id: postId });
  if (!r.status) throw new Error(r.message || "");
}

export async function undoNotInterested(myUserId: number, postId: number): Promise<void> {
  const r = await findCall("undoNotInterested", { my_user_id: myUserId, post_id: postId });
  if (!r.status) throw new Error(r.message || "");
}

export async function fetchKeywordFilters(myUserId: number): Promise<string[]> {
  const r = await findCall<string[]>("fetchKeywordFilters", { my_user_id: myUserId });
  if (!r.status) throw new Error(r.message || "");
  return arr<string>(r.data);
}

export async function addKeywordFilter(myUserId: number, keyword: string): Promise<string[]> {
  const r = await findCall<string[]>("addKeywordFilter", { my_user_id: myUserId, keyword });
  if (!r.status) throw new Error(r.message || "");
  return arr<string>(r.data);
}

export async function removeKeywordFilter(myUserId: number, keyword: string): Promise<string[]> {
  const r = await findCall<string[]>("removeKeywordFilter", { my_user_id: myUserId, keyword });
  if (!r.status) throw new Error(r.message || "");
  return arr<string>(r.data);
}

export const MAX_KEYWORDS = 50;

// ---- Recent searches (kept on this device) -------------------------------------------------------

const RECENT_KEY = "bb.recentSearches";
export function recentSearches(): string[] {
  try { return arr<string>(JSON.parse(localStorage.getItem(RECENT_KEY) || "[]")).filter((s) => typeof s === "string").slice(0, 10); } catch { return []; }
}
export function rememberSearch(q: string): string[] {
  const s = q.trim();
  if (s.length < 2) return recentSearches();
  const next = [s, ...recentSearches().filter((x) => x.toLowerCase() !== s.toLowerCase())].slice(0, 10);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  return next;
}
export function clearRecentSearches() {
  try { localStorage.removeItem(RECENT_KEY); } catch { /* private mode */ }
}

// ---- Hashtags in text ----------------------------------------------------------------------------

/** Letters, digits and _ in any script, after a # that starts a word. */
const TAG_RE = /(^|[^\p{L}\p{N}_&])#([\p{L}\p{N}_]{1,60})/gu;

/** Splits text into plain runs and hashtags (without the #). */
export function splitHashtags(text: string): { text: string; tag?: string }[] {
  const out: { text: string; tag?: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(TAG_RE)) {
    const start = (m.index ?? 0) + m[1].length;
    if (start > last) out.push({ text: text.slice(last, start) });
    out.push({ text: "#" + m[2], tag: m[2] });
    last = start + 1 + m[2].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** The post's `hashtags` column ("dark,spirits") as tags. */
export function postHashtags(p: { hashtags?: string | null }): string[] {
  return String(p.hashtags ?? "").split(/[\s,#]+/).map((s) => s.trim()).filter(Boolean);
}

export function hashtagPath(tag: string): string {
  return `/hashtag/${encodeURIComponent(tag.replace(/^#+/, ""))}`;
}

/** "1 video" / "12 videos" / "1.2K videos". */
export function videosLabel(n: number | string | null | undefined): string {
  const v = Number(n ?? 0) || 0;
  if (v === 1) return tt("fnd_one_video");
  return tt("fnd_n_videos", new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(v));
}
