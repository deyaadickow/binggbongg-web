// The For You feed as a play queue, so the video page can step up/down and auto-advance the way
// the phone app swipes (Steve, 2026-09-24). Kept in sessionStorage so a reload or a deep link
// still has the queue; fetchPosts hands back 10 random posts per call, so "more" means another
// call with the ones we've already seen filtered out.
import { type Post } from "./api";
import { tt } from "./i18n";
import { fetchFeedBatch, type FeedTab } from "./finding";

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

/** Which of the three feeds (Friends | Following | For You, Steve 2026-11-16) the queue came from,
 *  so the video page tops it up from the same one. */
const SOURCE_KEY = "bb.feedSource";
export function getFeedSource(): FeedTab {
  try { const v = sessionStorage.getItem(SOURCE_KEY); return v === "friends" || v === "following" || v === "nearby" ? v : "foryou"; } catch { return "foryou"; }
}
export function setFeedSource(tab: FeedTab) {
  try { sessionStorage.setItem(SOURCE_KEY, tab); } catch { /* private mode etc. */ }
}
/** Take one video out of the queue ("Not interested"). */
export function removeFromFeed(postId: number): Post[] {
  const next = getFeed().filter((p) => p.id !== postId);
  setFeed(next);
  return next;
}
/** Put it back where it was (the Undo). */
export function insertIntoFeed(p: Post, at: number): Post[] {
  const cur = getFeed().filter((x) => x.id !== p.id);
  cur.splice(Math.max(0, Math.min(at, cur.length)), 0, p);
  setFeed(cur);
  return cur;
}
export async function fetchMoreFeed(userId: number | null): Promise<Post[]> {
  const source = getFeedSource();
  try {
    const { posts } = await fetchFeedBatch(userId || source === "foryou" ? source : "foryou", userId, getFeed().length);
    return appendToFeed(posts);
  } catch (e) {
    throw new Error((e as Error).message || tt("couldn_t_load_more_videos"));
  }
}
