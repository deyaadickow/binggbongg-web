// Social (Steve, 2026-11-17, "Next"): Stories that disappear after 24 hours, reposts, replying to a
// comment with a video, pinned comments, polls / "Add Yours" / link stickers on videos, playlists
// on a profile.
//
// Server: binggbongg-backend 610de8b (SocialController + new uploadPost params), NOT deployed yet.
// Until it is, the dev server answers the NEW endpoints from lib/socialMock.ts — and also every
// WRITE these features make (reposts, playlists, uploads carrying a sticker or a comment reply),
// so testing on the dev server never sends a story, vote, pin, repost or post to the live server.
// The mock is only ever imported under `import.meta.env.DEV`, so it is not in the production build.
import { post, type ApiResponse, type Post, type UserSummary, type VideoComment } from "./api";
import { createUploadUrls, putToSignedUrl, type UploadSlot } from "./upload";
import type { QaQuestionRef } from "./qa";

/** The endpoints this feature added on the server. In dev they are ALWAYS mocked. */
const NEW_ENDPOINTS = new Set([
  "createStory", "fetchStoriesFeed", "fetchUserStories", "markStorySeen", "fetchStoryViewers", "deleteStory",
  "pinComment", "unpinComment", "votePoll", "fetchPollResults", "fetchAddYours",
]);
/** Writes that already exist on the server but must never reach it from the dev server. */
const DEV_WRITES = new Set(["repostUserPost", "createPlaylist", "editPlaylist", "deletePlaylist"]);

const MOCK_KEY = "bb.socialMock";

/** Dev server only: `?socialmock=member` pretends a member is signed in (so the story row, pins and
 *  sticker uploads can be tried without a real account); `demo` in the value also puts a sample
 *  poll, Add Yours, link and comment reply on every video (`?socialmock=member,demo`).
 *  `?socialmock=0` turns it off. Always "" in the production build. */
export function socialMockMode(): string {
  if (!import.meta.env.DEV) return "";
  try {
    const q = new URLSearchParams(window.location.search).get("socialmock");
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
export const SOCIAL_MOCK_ID = 900002;

export function socialMockUser(): UserSummary | null {
  if (!import.meta.env.DEV || !socialMockMode().includes("member")) return null;
  return { id: SOCIAL_MOCK_ID, fullname: "Test Member", username: "testmember", profile_image: "" };
}

/** The member these features act for: the signed-in member, or the dev mock's pretend member. */
export function socialUser(real: UserSummary | null | undefined): UserSummary | null {
  return real ?? socialMockUser();
}

const isMockPostId = (id: unknown) => Number(id) >= 990_000_000;

async function call<T>(endpoint: string, params: Record<string, unknown>): Promise<ApiResponse<T>> {
  if (import.meta.env.DEV) {
    const m = await import("./socialMock");
    return m.mockSocialCall<T>(endpoint, params, socialMockMode());
  }
  return post<T>(endpoint, params);
}

/** New endpoints and dev-guarded writes go through here. */
export async function socialCall<T>(endpoint: string, params: Record<string, unknown>): Promise<ApiResponse<T>> {
  if (import.meta.env.DEV && (NEW_ENDPOINTS.has(endpoint) || DEV_WRITES.has(endpoint)
    || Number(params.my_user_id) === SOCIAL_MOCK_ID || Number(params.user_id) === SOCIAL_MOCK_ID)) {
    return call<T>(endpoint, params);
  }
  return post<T>(endpoint, params);
}

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

// ---- Shapes --------------------------------------------------------------------------------------

export interface Story {
  id: number;
  user_id: number;
  media_type: "photo" | "video";
  media_url: string;
  thumbnail?: string | null;
  duration?: number | null;
  caption?: string | null;
  created_at?: string;
  expires_at?: string;
  seen?: boolean;
  views_count?: number | null;
}
export interface StoryGroup {
  user: { id: number; fullname?: string; username?: string; profile_image?: string; is_verified?: number };
  is_me?: boolean;
  has_unseen?: boolean;
  latest_at?: string;
  stories: Story[];
}
export interface StoryViewer { id: number; fullname?: string; username?: string; profile_image?: string; viewed_at?: string }

export interface PollOption { text: string; votes: number }
export interface Poll { question: string; options: PollOption[]; total: number; x?: number; y?: number; my_vote?: number | null }
export interface AddYours { id: number; prompt: string; uses: number; creator_user_id?: number }
export interface LinkSticker { url: string; label?: string; domain?: string; x?: number; y?: number }
export interface ReplyComment { id: number; post_id: number; comment?: string; user_id?: number; user_name?: string; fullname?: string; profile_image?: string | null; media_type?: string | null }

/** The fields every post carries once 610de8b is deployed (null when unused). */
export interface SocialPost extends Post {
  reply_comment?: ReplyComment | null;
  poll?: Poll | null;
  add_yours?: AddYours | null;
  link_sticker?: LinkSticker | null;
  /** Q&A (backend 1cc24bd): the profile question this video answers. */
  qa_question?: QaQuestionRef | null;
}

export interface AddYoursPage {
  id: number; prompt: string; uses: number; origin_post_id?: number | null;
  creator?: { id: number; username?: string; fullname?: string } | null;
  videos: { id: number; thumbnail?: string; views?: number; user?: { id: number; username?: string; fullname?: string } | null }[];
}

// ---- Stories -------------------------------------------------------------------------------------

export const STORY_MAX_SECONDS = 60;
export const STORY_PHOTO_SECONDS = 5;

export async function fetchStoriesFeed(myUserId: number): Promise<StoryGroup[]> {
  const r = await socialCall<StoryGroup[]>("fetchStoriesFeed", { my_user_id: myUserId });
  if (!r.status) throw new Error(r.message || "");
  return arr<StoryGroup>(r.data).filter((g) => g?.user && arr(g.stories).length > 0);
}

export async function fetchUserStories(userId: number, myUserId?: number | null): Promise<Story[]> {
  const r = await socialCall<Story[]>("fetchUserStories", { user_id: userId, ...(myUserId ? { my_user_id: myUserId } : {}) });
  return r.status ? arr<Story>(r.data) : [];
}

export async function markStorySeen(myUserId: number, storyId: number): Promise<void> {
  await socialCall("markStorySeen", { my_user_id: myUserId, story_id: storyId }).catch(() => undefined);
}

export async function fetchStoryViewers(myUserId: number, storyId: number): Promise<{ viewers: StoryViewer[]; count: number }> {
  const r = await socialCall<StoryViewer[]>("fetchStoryViewers", { my_user_id: myUserId, story_id: storyId });
  if (!r.status) throw new Error(r.message || "");
  const viewers = arr<StoryViewer>(r.data);
  return { viewers, count: Number(r.views_count ?? viewers.length) || 0 };
}

export async function deleteStory(myUserId: number, storyId: number): Promise<void> {
  const r = await socialCall("deleteStory", { my_user_id: myUserId, story_id: storyId });
  if (!r.status) throw new Error(r.message || "");
}

// ---- Uploads (stories, and posts carrying a sticker / reply) -------------------------------------

/** createUploadUrls, mocked on the dev server when `mocked` (nothing is PUT to S3 then either). */
export async function socialUploadUrls(userId: number, files: { file_name: string; content_type: string }[], mocked: boolean): Promise<UploadSlot[]> {
  if (import.meta.env.DEV && mocked) {
    const r = await call<UploadSlot[]>("createUploadUrls", { user_id: userId, files: JSON.stringify(files) });
    if (!r.status || !r.data) throw new Error(r.message || "Couldn't prepare the upload.");
    return r.data;
  }
  return createUploadUrls(userId, files);
}

export async function socialPut(slot: UploadSlot, file: File, onProgress?: (f: number) => void): Promise<void> {
  if (import.meta.env.DEV && slot.upload_url.startsWith("mock:")) {
    const m = await import("./socialMock");
    return m.mockPut(slot, file, onProgress);
  }
  return putToSignedUrl(slot, file, onProgress);
}

/** uploadPost — on the dev server mocked when `mocked`. */
export async function socialUploadPost(params: Record<string, unknown>, mocked: boolean): Promise<ApiResponse<unknown>> {
  if (import.meta.env.DEV && mocked) return call("uploadPost", params);
  return post("uploadPost", params);
}

export async function createStory(input: {
  myUserId: number; mediaType: "photo" | "video"; mediaPath: string; thumbnail?: string; duration?: number; caption?: string;
}): Promise<Story> {
  const r = await socialCall<Story>("createStory", {
    my_user_id: input.myUserId, media_type: input.mediaType, media_path: input.mediaPath,
    ...(input.thumbnail ? { thumbnail: input.thumbnail } : {}),
    ...(input.duration ? { duration: Math.round(input.duration * 10) / 10 } : {}),
    ...(input.caption?.trim() ? { caption: input.caption.trim() } : {}),
  });
  if (!r.status || !r.data) throw new Error(r.message || "Couldn't post your story.");
  return r.data;
}

// ---- Pinned comments -----------------------------------------------------------------------------

export async function setCommentPinned(myUserId: number, commentId: number, pinned: boolean): Promise<void> {
  const r = await socialCall(pinned ? "pinComment" : "unpinComment", { my_user_id: myUserId, comment_id: commentId });
  if (!r.status) throw new Error(r.message || "");
}

export const isPinned = (c: VideoComment) => Number((c as VideoComment & { is_pinned?: unknown }).is_pinned ?? 0) === 1;

/** The comments under a video. The deployed server sends the pinned one first; this keeps that true
 *  (and on the dev server lays the mock's pins and the mock videos' comments over the real list). */
export async function fetchCommentsSocial(postId: number, start: number, count: number, myId: number | undefined,
  fetchReal: () => Promise<VideoComment[]>): Promise<VideoComment[]> {
  void myId;
  let rows: VideoComment[];
  if (import.meta.env.DEV) {
    const m = await import("./socialMock");
    rows = isMockPostId(postId) ? await m.mockComments(postId, start, count) : m.applyMockPins(postId, await fetchReal());
  } else {
    rows = await fetchReal();
  }
  if (start > 0) return rows.filter((c) => !isPinned(c));
  const pinned = rows.filter(isPinned);
  return [...pinned.slice(0, 1), ...rows.filter((c) => !isPinned(c))];
}

// ---- Posts ---------------------------------------------------------------------------------------

function num(v: unknown, d = 0.5): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : d;
}

export function normalisePoll(raw: unknown): Poll | null {
  const p = raw as Partial<Poll> | null | undefined;
  if (!p || !p.question || !Array.isArray(p.options) || p.options.length < 2) return null;
  const options = p.options.map((o) => ({ text: String((o as PollOption)?.text ?? o ?? ""), votes: Number((o as PollOption)?.votes ?? 0) || 0 }));
  const total = Number(p.total ?? options.reduce((s, o) => s + o.votes, 0)) || 0;
  const mv = p.my_vote;
  return { question: String(p.question), options, total, x: num(p.x), y: num(p.y, 0.35), my_vote: mv === null || mv === undefined ? null : Number(mv) };
}

/** A post as the video page shows it: on the dev server with the mock's stickers / votes over it. */
export async function decoratePost<T extends Post>(p: T): Promise<SocialPost & T> {
  if (import.meta.env.DEV) {
    const m = await import("./socialMock");
    return m.decorateMockPost(p, socialMockMode()) as SocialPost & T;
  }
  return p as SocialPost & T;
}

/** fetchPostById — the dev mock's own uploaded videos are answered by the mock. */
export async function fetchPostByIdSocial(postId: number | string, params: Record<string, unknown>): Promise<ApiResponse<Post | Post[]>> {
  if (import.meta.env.DEV && isMockPostId(postId)) return call<Post>("fetchPostById", { post_id: postId, ...params });
  return post<Post | Post[]>("fetchPostById", { post_id: postId, ...params });
}

export async function votePoll(myUserId: number, postId: number, option: number): Promise<Poll> {
  const r = await socialCall<Poll>("votePoll", { my_user_id: myUserId, post_id: postId, option });
  const p = r.status ? normalisePoll(r.data) : null;
  if (!p) throw new Error(r.message || "Couldn't save your vote.");
  return p;
}

export async function fetchPollResults(postId: number, myUserId?: number | null): Promise<Poll | null> {
  const r = await socialCall<Poll>("fetchPollResults", { post_id: postId, ...(myUserId ? { my_user_id: myUserId } : {}) }).catch(() => null);
  return r?.status ? normalisePoll(r.data) : null;
}

export async function fetchAddYours(id: number, start = 0, count = 30): Promise<AddYoursPage> {
  const r = await socialCall<AddYoursPage>("fetchAddYours", { add_yours_id: id, start, count });
  if (!r.status || !r.data) throw new Error(r.message || "");
  return { ...r.data, videos: arr(r.data.videos) };
}

export async function repostPost(myUserId: number, postId: number): Promise<string> {
  const r = await socialCall("repostUserPost", { user_id: myUserId, post_id: postId });
  if (!r.status) throw new Error(r.message || "");
  return r.message || "";
}

/** The domain a link sticker opens, for the leaving popup. */
export function linkDomain(l: LinkSticker): string {
  if (l.domain) return l.domain;
  try { return new URL(l.url).hostname.replace(/^www\./, ""); } catch { return l.url; }
}

export function validHttpsUrl(s: string): boolean {
  try { const u = new URL(s.trim()); return u.protocol === "https:" && !!u.hostname && u.hostname.includes("."); } catch { return false; }
}

// ---- Playlists -----------------------------------------------------------------------------------

/** A row of user_playlists as fetchUserDetails sends it under `playlists`. */
export interface PlaylistRow { id: number; user_id?: number; title?: string | null; entries?: string | null; post_ids?: string | null }
export interface PlaylistData extends PlaylistRow { data: Post[] }

export function playlistPostIds(p: PlaylistRow): number[] {
  try {
    const e = JSON.parse(p.entries || "[]") as { index?: number; post_id?: number }[];
    if (Array.isArray(e) && e.length) return e.slice().sort((a, b) => Number(a.index ?? 0) - Number(b.index ?? 0)).map((x) => Number(x.post_id)).filter(Boolean);
  } catch { /* fall back to post_ids */ }
  return String(p.post_ids ?? "").split(",").map(Number).filter(Boolean);
}

/** On the dev server, the playlists made in the mock are added to the member's own. */
export async function playlistsFor(userId: number, serverRows: unknown): Promise<PlaylistRow[]> {
  const rows = arr<PlaylistRow>(serverRows);
  if (import.meta.env.DEV) {
    const m = await import("./socialMock");
    return m.mockPlaylists(userId, rows);
  }
  return rows;
}

export async function fetchPlaylistData(playlistId: number, myUserId?: number | null): Promise<PlaylistData> {
  const params = { playlist_id: playlistId, ...(myUserId ? { user_id: myUserId } : {}) };
  const r = import.meta.env.DEV && playlistId >= 990_000_000 ? await call<PlaylistData>("fetchPlaylistData", params) : await post<PlaylistData>("fetchPlaylistData", params);
  if (!r.status || !r.data) throw new Error(r.message || "");
  // decodePlaylistEntries sends [{post_id, index, post: {...}}] (a deleted video has no post).
  const rows = arr<{ index?: number; post?: Post } & Post>(r.data.data).slice().sort((a, b) => Number(a.index ?? 0) - Number(b.index ?? 0));
  return { ...r.data, data: rows.map((e) => (e.post !== undefined ? e.post : e)).filter((p): p is Post => !!p && !!p.id) };
}

export async function savePlaylist(input: { myUserId: number; playlistId?: number; title: string; postIds: number[] }): Promise<void> {
  const entries = JSON.stringify(input.postIds.map((post_id, index) => ({ index, post_id })));
  const r = input.playlistId
    ? await socialCall("editPlaylist", { playlist_id: input.playlistId, title: input.title, entries, post_ids: input.postIds.join(",") })
    : await socialCall("createPlaylist", { user_id: input.myUserId, title: input.title, entries, post_ids: input.postIds.join(",") });
  if (!r.status) throw new Error(r.message || "");
}

export async function deletePlaylist(playlistId: number): Promise<void> {
  const r = await socialCall("deletePlaylist", { playlist_id: playlistId });
  if (!r.status) throw new Error(r.message || "");
}
