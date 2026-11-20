// DEV-ONLY stand-in for the Social server (binggbongg-backend 610de8b, not deployed yet).
// Loaded only through lib/social.ts under `import.meta.env.DEV`, so it is never in the production
// build, and on the dev server a story, vote, pin, repost, playlist or sticker upload never reaches
// the live server.
//
// Content is REAL where it can be: the stories are built from the live, read-only fetchPosts (each
// poster's thumbnails and videos), and comments / playlists read real rows. Everything the member
// does lives in sessionStorage (and, for uploaded files, object URLs in this page's memory).
import { post, type ApiResponse, type Post, type VideoComment } from "./api";
import type { AddYours, LinkSticker, Poll, PlaylistRow, ReplyComment, SocialPost, Story, StoryGroup } from "./social";
import type { UploadSlot } from "./upload";

const ME = 900002;
const STORE = "bb.socialMock.state";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ok = <T,>(data: T, extra: Record<string, unknown> = {}): ApiResponse<T> => ({ status: true, data, ...extra });
const fail = <T,>(message: string): ApiResponse<T> => ({ status: false, message });

interface Chain { id: number; prompt: string; creator_user_id: number; origin_post_id: number | null; post_ids: number[] }
interface State {
  seen: number[];
  myStories: Story[];
  deletedStories: number[];
  pins: Record<string, number>;          // post id -> pinned comment id (0 = none)
  votes: Record<string, number>;         // post id -> my option
  posts: SocialPost[];                    // uploaded in the mock
  chains: Chain[];
  playlists: PlaylistRow[];               // made in the mock
  playlistEdits: Record<string, PlaylistRow>;
  playlistDeleted: number[];
  reposts: number[];
  seq: number;
}
function load(): State {
  const blank: State = { seen: [], myStories: [], deletedStories: [], pins: {}, votes: {}, posts: [], chains: [], playlists: [], playlistEdits: {}, playlistDeleted: [], reposts: [], seq: 1 };
  try { return { ...blank, ...(JSON.parse(sessionStorage.getItem(STORE) || "{}") as Partial<State>) }; } catch { return blank; }
}
function save(s: State) { try { sessionStorage.setItem(STORE, JSON.stringify(s)); } catch { /* fine */ } }

// ---- A pool of real posts, read once from the live (read-only) For You feed ----------------------
let pool: Post[] = [];
let poolLoad: Promise<Post[]> | null = null;
async function posts(min = 24): Promise<Post[]> {
  if (pool.length >= min) return pool;
  if (!poolLoad) {
    poolLoad = (async () => {
      for (let i = 0; i < 4 && pool.length < min; i++) {
        const r = await post<Post[]>("fetchPosts", {}).catch(() => null);
        const seen = new Set(pool.map((p) => p.id));
        for (const p of r?.data ?? []) if (!seen.has(p.id) && p.user) pool.push(p);
      }
      poolLoad = null;
      return pool;
    })();
  }
  return poolLoad;
}
const abs = (path?: string | null) => (!path ? "" : /^(https?:|blob:|data:)/i.test(path) ? path : "https://d32kgcvh9dqf5h.cloudfront.net/" + path.replace(/^\/+/, ""));

// ---- Uploaded files: a key -> object URL in this page's memory -----------------------------------
const files: Record<string, string> = {};
const fileUrl = (key: unknown) => files[String(key)] ?? "";
/** The object URL of a file "uploaded" in the mock (lib/creatorsMock.ts shows scheduled thumbnails). */
export const mockFileUrl = (key: unknown) => fileUrl(key);

export async function mockPut(slot: UploadSlot, file: File, onProgress?: (f: number) => void): Promise<void> {
  for (let i = 1; i <= 5; i++) { await wait(120); onProgress?.(i / 5); }
  files[slot.key] = URL.createObjectURL(file);
}

function resolvePost(p: SocialPost): SocialPost {
  const f = (v: unknown) => (String(v ?? "").startsWith("mockfile:") ? fileUrl(String(v).slice(9)) : String(v ?? ""));
  return { ...p, video: f(p.video), thumbnail: f(p.thumbnail) };
}

// ---- Registries filled as the pages show things --------------------------------------------------
const knownPosts: Record<number, SocialPost> = {};
const knownComments: Record<number, VideoComment> = {};

function demoFor(p: Post): Partial<SocialPost> {
  void posts(12);
  const other = pool.find((x) => x.id !== p.id && x.user) ?? null;
  const seed = p.id % 7;
  return {
    poll: { question: "Which is better?", options: [{ text: "Morning", votes: 12 + seed }, { text: "Night", votes: 8 + seed * 2 }, { text: "Both!", votes: 3 }], total: 0, x: 0.5, y: 0.42 },
    add_yours: { id: 1, prompt: "Show your pet", uses: 0, creator_user_id: other?.user_id ?? 0 },
    link_sticker: { url: "https://example.com/", label: "Example link", domain: "example.com", x: 0.5, y: 0.62 },
    reply_comment: other ? { id: 970000001, post_id: other.id, comment: "Please make a video about this!", user_id: other.user_id, user_name: other.user?.username ?? "", fullname: other.user?.fullname, profile_image: other.user?.profile_image ?? null, media_type: null } : null,
  };
}

function withVote(poll: Poll, postId: number, s: State): Poll {
  const mine = s.votes[String(postId)];
  const options = poll.options.map((o, i) => ({ text: o.text, votes: o.votes + (mine === i ? 1 : 0) }));
  return { ...poll, options, total: options.reduce((n, o) => n + o.votes, 0), my_vote: mine ?? null };
}

function chainUses(id: number, s: State): number {
  const c = s.chains.find((x) => x.id === id);
  return id === 1 ? 6 + (c?.post_ids.length ?? 0) : (c?.post_ids.length ?? 0);
}

export function decorateMockPost(p: Post, mode: string): SocialPost {
  const s = load();
  const own = s.posts.find((x) => x.id === p.id);
  let out: SocialPost = own ? { ...own, ...p } : { ...p };
  if (!own && mode.includes("demo")) out = { ...demoFor(p), ...out } as SocialPost;
  knownPosts[out.id] = out;
  if (out.poll) out = { ...out, poll: withVote(out.poll, out.id, s) };
  if (out.add_yours) out = { ...out, add_yours: { ...out.add_yours, uses: chainUses(out.add_yours.id, s) } };
  return out;
}

// ---- Comments ------------------------------------------------------------------------------------

export function applyMockPins(postId: number, rows: VideoComment[]): VideoComment[] {
  const s = load();
  const pin = s.pins[String(postId)];
  return rows.map((c) => {
    knownComments[c.id] = { ...c, post_id: c.post_id ?? postId };
    return pin === undefined ? c : { ...c, is_pinned: c.id === pin ? 1 : 0 } as VideoComment;
  });
}

export async function mockComments(postId: number, start: number, count: number): Promise<VideoComment[]> {
  if (start > 0) return [];
  const people = (await posts(12)).filter((p) => p.user).slice(0, 4);
  const words = ["This is so good!", "How did you do that?", "Do one with your dog next", "Loved it 😂"];
  const rows: VideoComment[] = people.map((p, i) => ({
    id: 980000000 + postId % 100000 * 10 + i, post_id: postId, user_id: p.user_id, comment: words[i % words.length],
    created_at: new Date(Date.now() - (i + 1) * 3600_000).toISOString().slice(0, 19).replace("T", " "), user: p.user,
  }));
  return applyMockPins(postId, rows).slice(0, count);
}

// ---- Stories -------------------------------------------------------------------------------------

async function storyGroups(s: State): Promise<StoryGroup[]> {
  const all = await posts(24);
  const byUser = new Map<number, Post[]>();
  for (const p of all) if (p.user && p.user_id !== ME) (byUser.get(p.user_id) ?? byUser.set(p.user_id, []).get(p.user_id)!).push(p);
  const groups: StoryGroup[] = [];
  let n = 0;
  for (const [uid, list] of byUser) {
    if (n >= 7) break;
    const u = list[0].user!;
    const stories: Story[] = list.slice(0, 3).map((p, k) => {
      const video = k % 2 === 1 && !!p.video;
      const id = p.id * 10 + k;
      return {
        id, user_id: uid, media_type: (video ? "video" : "photo") as Story["media_type"],
        media_url: abs(video ? p.video : p.thumbnail), thumbnail: abs(p.thumbnail),
        duration: video ? Math.min(15, 60) : 5, caption: k === 0 ? (p.description ?? "").slice(0, 80) || null : null,
        created_at: new Date(Date.now() - (n * 3 + k + 1) * 1800_000).toISOString().slice(0, 19).replace("T", " "),
        expires_at: "", seen: s.seen.includes(id) || n >= 5, views_count: null,
      };
    }).filter((st) => st.media_url && !s.deletedStories.includes(st.id));
    if (!stories.length) continue;
    groups.push({ user: { id: uid, fullname: u.fullname, username: u.username, profile_image: abs(u.profile_image) || undefined, is_verified: Number(u.is_verified ?? 0) }, is_me: false, has_unseen: stories.some((x) => !x.seen), latest_at: stories[stories.length - 1].created_at, stories });
    n++;
  }
  return groups;
}

function myGroup(s: State, uid: number): StoryGroup | null {
  const mine = s.myStories.filter((x) => x.user_id === uid && !s.deletedStories.includes(x.id))
    .map((x) => ({ ...x, media_url: x.media_url.startsWith("mockfile:") ? fileUrl(x.media_url.slice(9)) : x.media_url, thumbnail: x.thumbnail?.startsWith("mockfile:") ? fileUrl(x.thumbnail.slice(9)) : x.thumbnail }))
    .filter((x) => x.media_url);
  if (!mine.length) return null;
  return { user: uid === ME ? { id: ME, fullname: "Test Member", username: "testmember" } : { id: uid }, is_me: true, has_unseen: false, latest_at: mine[mine.length - 1].created_at, stories: mine };
}

// ---- The calls -----------------------------------------------------------------------------------

export async function mockSocialCall<T>(endpoint: string, params: Record<string, unknown>, mode: string): Promise<ApiResponse<T>> {
  await wait(200);
  void mode;
  const s = load();
  const uid = Number(params.my_user_id ?? params.user_id ?? 0);
  switch (endpoint) {
    case "createUploadUrls": {
      const list = JSON.parse(String(params.files ?? "[]")) as { file_name: string; content_type: string }[];
      return ok(list.map((f) => {
        const key = `mock/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${f.file_name}`;
        return { file_name: f.file_name, key, content_type: f.content_type, upload_url: "mock:" + key, headers: {}, public_url: "", expires_in: 600 };
      }) as T);
    }

    case "fetchStoriesFeed": {
      const groups = await storyGroups(s);
      const mine = myGroup(s, uid);
      groups.sort((a, b) => (a.has_unseen === b.has_unseen ? 0 : a.has_unseen ? -1 : 1));
      return ok((mine ? [mine, ...groups] : groups) as T);
    }
    case "fetchUserStories": {
      const owner = Number(params.user_id);
      const mine = myGroup(s, owner);
      if (mine) return ok(mine.stories as T);
      const g = (await storyGroups(s)).find((x) => x.user.id === owner);
      return ok((g?.stories ?? []) as T);
    }
    case "markStorySeen": {
      const id = Number(params.story_id);
      if (!s.seen.includes(id)) { s.seen.push(id); save(s); }
      return ok(null as T);
    }
    case "fetchStoryViewers": {
      const st = s.myStories.find((x) => x.id === Number(params.story_id));
      if (!st) return fail("Story not found.");
      const viewers = pool.filter((p) => p.user).slice(0, 5).map((p, i) => ({ id: p.user_id, fullname: p.user?.fullname, username: p.user?.username, profile_image: abs(p.user?.profile_image) || undefined, viewed_at: new Date(Date.now() - i * 600_000).toISOString() }))
        .filter((v, i, a) => a.findIndex((x) => x.id === v.id) === i);
      return ok(viewers as T, { views_count: viewers.length });
    }
    case "deleteStory": {
      const id = Number(params.story_id);
      if (!s.myStories.some((x) => x.id === id && x.user_id === uid)) return fail("Story not found.");
      s.deletedStories.push(id); save(s);
      return ok(null as T, { message: "Story deleted" });
    }
    case "createStory": {
      const caption = String(params.caption ?? "");
      // Lets the gold refusal popup be tried: the server refuses a flagged story in these words.
      if (/flagme/i.test(caption)) return fail("This story was flagged during review (policy violation) and can't be posted.");
      const type = params.media_type === "video" ? "video" : "photo";
      const dur = Number(params.duration ?? 0);
      if (type === "video" && dur > 62) return fail("A story video can be at most 60 seconds.");
      const story: Story = {
        id: 960000000 + s.seq++, user_id: uid, media_type: type, media_url: "mockfile:" + String(params.media_path),
        thumbnail: params.thumbnail ? "mockfile:" + String(params.thumbnail) : null, duration: type === "video" ? dur || 10 : 5,
        caption: caption.trim() || null, created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
        expires_at: new Date(Date.now() + 86400_000).toISOString().slice(0, 19).replace("T", " "), seen: true, views_count: 0,
      };
      s.myStories.push(story); save(s);
      return ok({ ...story, media_url: fileUrl(params.media_path) } as T, { message: "Your story is up for 24 hours" });
    }

    case "pinComment":
    case "unpinComment": {
      const c = knownComments[Number(params.comment_id)];
      if (!c) return fail("Comment not found.");
      const owner = knownPosts[Number(c.post_id)]?.user_id;
      if (owner !== undefined && Number(owner) !== uid) return fail("Only the video's creator can pin a comment.");
      s.pins[String(c.post_id)] = endpoint === "pinComment" ? c.id : 0; save(s);
      return ok(null as T, { message: endpoint === "pinComment" ? "Pinned" : "Unpinned" });
    }

    case "votePoll":
    case "fetchPollResults": {
      const p = knownPosts[Number(params.post_id)];
      if (!p?.poll) return fail("This video has no poll.");
      if (endpoint === "votePoll") {
        const opt = Number(params.option);
        if (!(opt >= 0 && opt < p.poll.options.length)) return fail("Pick one of the answers.");
        s.votes[String(p.id)] = opt; save(s);
      }
      const mine = uid ? s.votes[String(p.id)] : undefined;
      const poll = withVote(p.poll, p.id, s);
      return ok({ ...poll, my_vote: mine ?? null } as T);
    }

    case "fetchAddYours": {
      const id = Number(params.add_yours_id);
      const all = await posts(24);
      const chain = s.chains.find((c) => c.id === id);
      if (id !== 1 && !chain) return fail("Not found.");
      const own = (chain?.post_ids ?? []).map((pid) => s.posts.find((x) => x.id === pid)).filter(Boolean) as SocialPost[];
      const base = id === 1 ? all.slice(0, 6) : [];
      const videos = [...own.reverse(), ...base].map((p) => ({ id: p.id, thumbnail: String(p.thumbnail ?? "").startsWith("mockfile:") ? fileUrl(String(p.thumbnail).slice(9)) : abs(p.thumbnail), views: p.views ?? 0, user: p.user ? { id: p.user.id, username: p.user.username, fullname: p.user.fullname } : null }));
      const creator = id === 1 ? all[0]?.user : chain && chain.creator_user_id === ME ? { id: ME, username: "testmember", fullname: "Test Member" } : null;
      return ok({ id, prompt: id === 1 ? "Show your pet" : chain!.prompt, uses: chainUses(id, s), origin_post_id: id === 1 ? all[0]?.id ?? null : chain!.origin_post_id,
        creator: creator ? { id: creator.id, username: creator.username, fullname: creator.fullname } : null, videos } as T);
    }

    case "uploadPost": {
      // The server's own checks (PostController::uploadPost, 610de8b).
      const q = String(params.poll_question ?? "").trim();
      let opts: string[] = [];
      if (q) {
        try { opts = (JSON.parse(String(params.poll_options ?? "[]")) as unknown[]).map((x) => String(x).trim()).filter(Boolean); } catch { return fail("The poll's answers could not be read."); }
        if (q.length > 100) return fail("A poll question can be at most 100 characters.");
        if (opts.length < 2 || opts.length > 4 || opts.some((o) => o.length > 40)) return fail("A poll needs 2 to 4 answers of up to 40 characters.");
      }
      const link = String(params.link_url ?? "").trim();
      if (link && !/^https:\/\//i.test(link)) return fail("A link must start with https://");
      const prompt = String(params.add_yours_prompt ?? "").trim();
      if (prompt.length > 80) return fail("An Add Yours prompt can be at most 80 characters.");
      const id = 990000000 + s.seq++;
      let addYours: AddYours | null = null;
      if (params.add_yours_id) {
        const cid = Number(params.add_yours_id);
        let c = s.chains.find((x) => x.id === cid);
        if (!c && cid === 1) { c = { id: 1, prompt: "Show your pet", creator_user_id: 0, origin_post_id: null, post_ids: [] }; s.chains.push(c); }
        if (!c) return fail("That Add Yours is not available.");
        c.post_ids.push(id);
        addYours = { id: c.id, prompt: c.prompt, uses: 0, creator_user_id: c.creator_user_id };
      } else if (prompt) {
        const c: Chain = { id: 2 + s.chains.filter((x) => x.id !== 1).length, prompt, creator_user_id: Number(params.user_id), origin_post_id: id, post_ids: [id] };
        s.chains.push(c);
        addYours = { id: c.id, prompt, uses: 0, creator_user_id: c.creator_user_id };
      }
      const rc = params.reply_comment_id ? knownComments[Number(params.reply_comment_id)] : null;
      const reply: ReplyComment | null = rc ? { id: rc.id, post_id: Number(rc.post_id), comment: rc.comment, user_id: rc.user_id, user_name: rc.user?.username ?? "", fullname: rc.user?.fullname, profile_image: rc.user?.profile_image ?? null, media_type: rc.media_type ?? null } : null;
      const linkSticker: LinkSticker | null = link ? { url: link, label: String(params.link_label ?? "").trim().slice(0, 40) || undefined, domain: (() => { try { return new URL(link).hostname.replace(/^www\./, ""); } catch { return link; } })(), x: Number(params.link_x ?? 0.5), y: Number(params.link_y ?? 0.6) } : null;
      const uidPost = Number(params.user_id);
      // Q&A (1cc24bd): a video answering a question asked on the uploader's own profile.
      let qaQuestion: SocialPost["qa_question"] = null;
      if (params.answer_question_id) {
        const qm = await import("./qaMock");
        const res = qm.mockAnswerQuestion(Number(params.answer_question_id), uidPost, id, String(params.thumbnail));
        if (typeof res === "string") return fail(res);
        qaQuestion = res;
      }
      const newPost: SocialPost = {
        id, user_id: uidPost, video: "mockfile:" + String(params.video), thumbnail: "mockfile:" + String(params.thumbnail),
        description: String(params.description ?? ""), likes: 0, views: 0, total_comments: 0, created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
        user: uidPost === ME ? { id: ME, fullname: "Test Member", username: "testmember" } : { id: uidPost },
        allow_repost: Number(params.allow_repost ?? 1),
        poll: q ? { question: q, options: opts.map((text) => ({ text, votes: 0 })), total: 0, x: Number(params.poll_x ?? 0.5), y: Number(params.poll_y ?? 0.3) } : null,
        add_yours: addYours, link_sticker: linkSticker, reply_comment: reply, qa_question: qaQuestion,
      };
      s.posts.push(newPost); save(s);
      return ok(null as T, { message: "Post uploaded successfully (dev mock — nothing was sent)", post_id: id });
    }
    case "fetchPostById": {
      const p = s.posts.find((x) => x.id === Number(params.post_id));
      if (!p) return fail("That video isn't available.");
      return ok(resolvePost(p) as T);
    }
    // The pretend member's own profile, so its Playlists tab can be tried.
    case "fetchUserDetails": {
      if (Number(params.user_id) !== ME) return fail("User doesn't exists !");
      return ok({ id: ME, fullname: "Test Member", username: "testmember", profile_image: "", bio: "Dev mock member", postCounts: s.posts.filter((x) => x.user_id === ME).length, playlists: [] } as T);
    }
    case "fetchUserPosts": {
      if (Number(params.user_id) !== ME) return fail("not mocked");
      // Pin (2026-11-20): pinned first, most recently pinned first, like the server.
      const pinned = mockPins();
      const mine = s.posts.filter((x) => x.user_id === ME).reverse().map(resolvePost)
        .map((x) => ({ ...x, pinned_at: pinned.includes(x.id) ? "pinned" : null }));
      // ?mockPins=1: five pretend videos so the hold menu can be tried with nothing uploaded.
      if (!mine.length && location.search.includes("mockPins")) {
        for (let i = 5; i >= 1; i--) mine.push({ id: 990000100 + i, user_id: ME, views: i * 10, user_video_number: i, pinned_at: pinned.includes(990000100 + i) ? "pinned" : null } as unknown as (typeof mine)[number]);
      }
      return ok([...pinned.map((id) => mine.find((x) => x.id === id)).filter(Boolean), ...mine.filter((x) => !pinned.includes(x.id))] as T);
    }
    case "pinPost": {
      const pid = Number(params.post_id);
      let pins = mockPins().filter((id) => id !== pid);
      if (Number(params.pin) === 1) {
        if (!mockPins().includes(pid) && mockPins().length >= 3) return { status: false, limit_reached: true, pinned_ids: mockPins(), message: "You can pin only 3 videos. Unpin one first." } as ApiResponse<T>;
        pins = [pid, ...pins];
      }
      try { localStorage.setItem("bb_mock_pins", JSON.stringify(pins)); } catch { /* dev only */ }
      return { status: true, pinned_ids: pins, message: "Pinned (dev mock)" } as ApiResponse<T>;
    }

    case "repostUserPost": {
      const pid = Number(params.post_id);
      if (s.reposts.includes(pid)) return fail("You have already reposted this post!");
      s.reposts.push(pid); save(s);
      return ok(null as T, { message: "Reposted! (dev mock — nothing was sent)" });
    }

    case "createPlaylist": {
      s.playlists.push({ id: 990000000 + s.seq++, user_id: Number(params.user_id), title: String(params.title), entries: String(params.entries), post_ids: String(params.post_ids) });
      save(s);
      return ok(null as T, { message: "Playlist created successfully!" });
    }
    case "editPlaylist": {
      const id = Number(params.playlist_id);
      const row = { id, title: String(params.title), entries: String(params.entries), post_ids: String(params.post_ids) };
      const mine = s.playlists.find((x) => x.id === id);
      if (mine) Object.assign(mine, row); else s.playlistEdits[String(id)] = row;
      save(s);
      return ok(null as T, { message: "Playlist edited successfully !" });
    }
    case "deletePlaylist": {
      const id = Number(params.playlist_id);
      s.playlists = s.playlists.filter((x) => x.id !== id);
      s.playlistDeleted.push(id); save(s);
      return ok(null as T, { message: "playlist deleted successfully!" });
    }
    case "fetchPlaylistData": {
      const row = s.playlists.find((x) => x.id === Number(params.playlist_id));
      if (!row) return fail("Playlist doesn't exists !");
      const ids = String(row.post_ids ?? "").split(",").map(Number).filter(Boolean);
      const data: Post[] = [];
      for (const pid of ids) {
        const own = s.posts.find((x) => x.id === pid);
        if (own) { data.push(resolvePost(own)); continue; }
        const r = await post<Post | Post[]>("fetchPostById", { post_id: pid }).catch(() => null);
        const d = Array.isArray(r?.data) ? r?.data[0] : r?.data;
        if (d) data.push(d);
      }
      return ok({ ...row, data } as T);
    }
  }
  return fail(`(dev mock) ${endpoint} is not mocked`);
}

export function mockPlaylists(userId: number, rows: PlaylistRow[]): PlaylistRow[] {
  const s = load();
  const real = rows.filter((r) => !s.playlistDeleted.includes(r.id)).map((r) => ({ ...r, ...(s.playlistEdits[String(r.id)] ?? {}) }));
  return [...s.playlists.filter((p) => p.user_id === userId), ...real];
}

/** Dev mock: pinned post ids, most recently pinned first (2026-11-20). */
function mockPins(): number[] {
  try { return JSON.parse(localStorage.getItem("bb_mock_pins") || "[]") as number[]; } catch { return []; }
}
