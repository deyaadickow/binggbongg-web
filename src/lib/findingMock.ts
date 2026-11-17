// DEV-ONLY stand-in for the Finding videos server (binggbongg-backend 9716126, not deployed yet).
// Loaded only through lib/finding.ts under `import.meta.env.DEV`, so it is never in the production
// build, and in dev "Not interested" / keyword writes never reach the live server.
//
// Content is REAL: it reads the live, read-only fetchPosts (without any member id) and builds the
// Discover lists, the Friends / Following feeds and searchAll from those posts. What the member
// marked "Not interested" and their keywords live in sessionStorage, and every mocked feed leaves
// them out the way the server's FeedFilters does.
import { post, type ApiResponse, type Post, type Sound, type UserSummary } from "./api";

const STORE = "bb.findMock.state";
interface State { notInterested: number[]; keywords: string[] }
function load(): State {
  try {
    const s = JSON.parse(sessionStorage.getItem(STORE) || "{}") as Partial<State>;
    return { notInterested: Array.isArray(s.notInterested) ? s.notInterested : [], keywords: Array.isArray(s.keywords) ? s.keywords : ["spoiler"] };
  } catch { return { notInterested: [], keywords: ["spoiler"] }; }
}
function save(s: State) { try { sessionStorage.setItem(STORE, JSON.stringify(s)); } catch { /* fine */ } }
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A pool of real posts, read once per page load from the live (read-only) For You feed. */
let pool: Post[] = [];
let poolLoad: Promise<Post[]> | null = null;
async function posts(min = 30): Promise<Post[]> {
  if (pool.length >= min) return pool;
  if (!poolLoad) {
    poolLoad = (async () => {
      for (let i = 0; i < 4 && pool.length < min; i++) {
        const r = await post<Post[]>("fetchPosts", {}).catch(() => null);
        const seen = new Set(pool.map((p) => p.id));
        for (const p of r?.data ?? []) if (!seen.has(p.id)) pool.push(p);
      }
      poolLoad = null;
      return pool;
    })();
  }
  return poolLoad;
}

function tagsOf(p: Post): string[] {
  return String(p.hashtags ?? "").split(/[\s,#]+/).map((s) => s.trim().toLowerCase()).filter((s) => s.length >= 2);
}

function hidden(p: Post, s: State): boolean {
  if (s.notInterested.includes(p.id)) return true;
  const hay = `${p.description ?? ""} ${p.hashtags ?? ""}`.toLowerCase();
  return s.keywords.some((k) => hay.includes(k));
}

const ok = <T,>(data: T, extra: Record<string, unknown> = {}): ApiResponse<T> => ({ status: true, data, ...extra });

export async function mockFindingCall<T>(endpoint: string, params: Record<string, unknown>, mode: string): Promise<ApiResponse<T>> {
  await wait(250);
  const s = load();
  const kw = String(params.keyword ?? "").trim().toLowerCase().replace(/^#+/, "");
  switch (endpoint) {
    case "fetchDiscover": {
      const all = await posts(30);
      const count: Record<string, Post[]> = {};
      for (const p of all) for (const t of tagsOf(p)) (count[t] ??= []).push(p);
      const tags = Object.entries(count).sort((a, b) => b[1].length - a[1].length).slice(0, 8)
        .map(([hashtag, ps]) => ({ hashtag, recent_videos: ps.length, total_videos: ps.length * 7, videos: ps.slice(0, 6).map((p) => ({ id: p.id, thumbnail: p.thumbnail })) }));
      const sounds: Record<number, Sound & { uses: number }> = {};
      for (const p of all) if (p.sound?.id) (sounds[p.sound.id] ??= { ...p.sound, uses: 0 }).uses += 1;
      const users: Record<number, UserSummary & { views: number }> = {};
      for (const p of all) if (p.user) (users[p.user.id] ??= { ...p.user, views: 0 }).views += p.views ?? 0;
      return ok({
        trending_hashtags: tags,
        trending_sounds: Object.values(sounds).sort((a, b) => b.uses - a.uses).slice(0, 10),
        // The server's topics may be empty — the page hides the section then. mode "notopics" tries that.
        topics: mode.includes("notopics") ? [] : [{ id: 1, name: "Comedy", image: null, videos: 120 }, { id: 2, name: "Music", image: null, videos: 88 }, { id: 3, name: "Dance", image: null, videos: 61 }],
        rising_creators: Object.values(users).sort((a, b) => b.views - a.views).slice(0, 10)
          .map((u) => ({ id: u.id, fullname: u.fullname, username: u.username, profile_image: u.profile_image, views: u.views })),
      } as T);
    }
    case "searchAll": {
      const q = String(params.query ?? "").trim().toLowerCase().replace(/^[#@]+/, "");
      const all = await posts(30);
      if (!q) return ok({ videos: [], people: [], sounds: [], hashtags: [] } as T);
      const [vids, people] = await Promise.all([
        post<Post[]>("searchPosts", { keyword: q, start: 0, count: 12 }).then((r) => r.data ?? []).catch(() => [] as Post[]),
        post<UserSummary[]>("searchUser", { keyword: q, start: 0, count: 10 }).then((r) => r.data ?? []).catch(() => [] as UserSummary[]),
      ]);
      const sounds: Record<number, Sound> = {};
      const tags: Record<string, number> = {};
      for (const p of [...all, ...vids]) {
        if (p.sound?.id && `${p.sound.title ?? ""} ${p.sound.singer ?? ""}`.toLowerCase().includes(q)) sounds[p.sound.id] = { ...p.sound, video_count: p.sound.video_count ?? 1 };
        for (const t of tagsOf(p)) if (t.includes(q)) tags[t] = (tags[t] ?? 0) + 1;
      }
      return ok({
        videos: vids.map((p) => ({ id: p.id, thumbnail: p.thumbnail, description: p.description, views: p.views, likes: p.likes, user: p.user ? { id: p.user.id, fullname: p.user.fullname, username: p.user.username } : null })),
        people: people.slice(0, 10),
        sounds: Object.values(sounds).slice(0, 10),
        hashtags: Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([hashtag, n], i) => ({ id: i + 1, hashtag, video_count: n })),
      } as T);
    }
    case "fetchFriendsPosts": {
      if (mode.includes("nofriends")) return { status: true, message: "no_friends", data: [] as unknown as T };
      const all = await posts(30);
      // "Friends": a few creators from the pool, so the feed visibly differs from For You.
      const ids = [...new Set(all.map((p) => p.user_id))].slice(0, 4);
      const list = all.filter((p) => ids.includes(p.user_id) && !hidden(p, s));
      return ok(list.sort(() => Math.random() - 0.5).slice(0, 10) as T, { message: "Post fetched successfully !" });
    }
    case "fetchFollowingPosts": {
      const all = await posts(30);
      const ids = [...new Set(all.map((p) => p.user_id))].slice(0, 9);
      return ok(all.filter((p) => ids.includes(p.user_id) && !hidden(p, s)).sort(() => Math.random() - 0.5).slice(0, 10) as T);
    }
    case "fetchPosts": {
      const all = await posts(30);
      return ok(all.filter((p) => !hidden(p, s)).sort(() => Math.random() - 0.5).slice(0, 10) as T);
    }
    case "notInterestedPost": {
      const id = Number(params.post_id);
      if (!id) return { status: false, message: "Video not found." };
      if (!s.notInterested.includes(id)) s.notInterested.push(id);
      save(s);
      return { status: true, message: "Got it. You'll see fewer videos like this." };
    }
    case "undoNotInterested": {
      s.notInterested = s.notInterested.filter((x) => x !== Number(params.post_id));
      save(s);
      return { status: true, message: "Undone" };
    }
    case "fetchKeywordFilters":
      return ok(s.keywords as T);
    case "addKeywordFilter": {
      if (kw.length < 2 || kw.length > 40) return { status: false, message: "A keyword is 2 to 40 letters." };
      if (s.keywords.length >= 50) return { status: false, message: "You can filter up to 50 keywords." };
      if (!s.keywords.includes(kw)) s.keywords.push(kw);
      save(s);
      return { status: true, message: "Added", data: [...s.keywords].sort() as T };
    }
    case "removeKeywordFilter": {
      s.keywords = s.keywords.filter((k) => k !== kw);
      save(s);
      return { status: true, message: "Removed", data: [...s.keywords].sort() as T };
    }
    default: {
      // An existing, live, READ-ONLY call made for the pretend member (searchPosts, searchUser,
      // fetchPostsByHashtag, …): sent without the made-up member id, which the server would refuse.
      const rest = { ...params };
      delete rest.my_user_id;
      return post<T>(endpoint, rest);
    }
  }
}
