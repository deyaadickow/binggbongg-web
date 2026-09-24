// The For You feed as a play queue, so the video page can step up/down and auto-advance the way
// the phone app swipes (Steve, 2026-09-24). Kept in sessionStorage so a reload or a deep link
// still has the queue; fetchPosts hands back 10 random posts per call, so "more" means another
// call with the ones we've already seen filtered out.
import { post, type Post } from "./api";

const KEY = "bb.feed";

export function getFeed(): Post[] {
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as Post[]; } catch { return []; }
}
export function setFeed(posts: Post[]) {
  try { sessionStorage.setItem(KEY, JSON.stringify(posts.slice(-300))); } catch { /* private mode etc. */ }
}
export function appendToFeed(posts: Post[]): Post[] {
  const cur = getFeed();
  const seen = new Set(cur.map((p) => p.id));
  const next = [...cur, ...posts.filter((p) => !seen.has(p.id))];
  setFeed(next);
  return next;
}
export async function fetchMoreFeed(userId: number | null): Promise<Post[]> {
  const res = await post<Post[]>("fetchPosts", userId ? { my_user_id: userId } : {});
  if (!res.status) throw new Error(res.message ?? "Couldn't load more videos.");
  return appendToFeed(res.data ?? []);
}
