// Live button -> straight into a random live, swipe for the next (Steve, 2026-11-12: "When i click
// on the live button from main feed it supposed to go to anyone that is live at random and keep
// scrolling for the next live.").
//
// ONE list, built once when the feed's Live button is pressed: every real live in the server's
// order (one per room, like Live Now), then the Live Section Videos in admin order. It travels in
// the router state ({ liveSwipe }), so it survives a reload of the page and never leaks into any
// other way of opening a live — the Live Now list, a link, a notification all open a room with no
// swipe state and behave exactly as before.
import type { NavigateFunction } from "react-router-dom";
import { fetchFeaturedLiveVideos, post, type FeaturedLiveVideo, type LiveStream } from "./api";

export type LiveSwipeItem =
  | { kind: "live"; room_name: string }
  | { kind: "video"; video: FeaturedLiveVideo };

export interface LiveSwipeState { items: LiveSwipeItem[]; index: number }

export function swipeStateOf(locationState: unknown): LiveSwipeState | null {
  const s = (locationState as { liveSwipe?: LiveSwipeState } | null)?.liveSwipe;
  if (!s || !Array.isArray(s.items) || s.items.length === 0) return null;
  if (!Number.isInteger(s.index) || s.index < 0 || s.index >= s.items.length) return null;
  return s;
}

export function swipePath(item: LiveSwipeItem): string {
  return item.kind === "live" ? `/live/${encodeURIComponent(item.room_name)}` : `/live-video/${item.video.id}`;
}

/** Open item `index` of the list. `replace` for every step after the first, so the browser's Back
 *  (and the close button) goes straight back to the feed rather than through every live seen. */
export function goToSwipe(navigate: NavigateFunction, items: LiveSwipeItem[], index: number, replace: boolean) {
  const n = items.length;
  const i = ((index % n) + n) % n; // wraps both ways
  navigate(swipePath(items[i]), { replace, state: { liveSwipe: { items, index: i } satisfies LiveSwipeState } });
}

/** The two lists Live Now uses (global, not connections-only), as one swipe list. */
export async function buildSwipeList(userId: number): Promise<LiveSwipeItem[]> {
  const [res, featured] = await Promise.all([
    post<LiveStream[]>("fetchActiveLiveStreams", { user_id: userId, connections_only: false }).catch(() => null),
    fetchFeaturedLiveVideos(),
  ]);
  const rooms: string[] = [];
  const seen = new Set<string>();
  // The API lists every broadcaster in a room, host first — one entry per room.
  for (const s of res?.status ? res.data ?? [] : []) {
    if (s?.room_name && !seen.has(s.room_name)) { seen.add(s.room_name); rooms.push(s.room_name); }
  }
  return [
    ...rooms.map((room_name) => ({ kind: "live" as const, room_name })),
    ...featured.map((video) => ({ kind: "video" as const, video })),
  ];
}

/** Fisher-Yates: a new array in random order. */
function shuffled<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** The feed's Live button. Steve, 2026-11-12: "Make it always start on the welcome video" / "After the
 *  welcome video, All other videos will be at random" — it always opens on the admin's #1 Live Section
 *  video (the Welcome video); swipe up goes through the real lives in random order, then the other
 *  featured videos in random order, wrapping. No featured videos → the lives at random; nothing at all
 *  → the Live Now list with its empty state. */
export async function openRandomLive(navigate: NavigateFunction, userId: number) {
  const all = await buildSwipeList(userId);
  if (all.length === 0) { navigate("/live"); return; }
  const lives = shuffled(all.filter((x) => x.kind === "live"));
  const videos = all.filter((x) => x.kind === "video");
  const items = videos.length > 0 ? [videos[0], ...lives, ...shuffled(videos.slice(1))] : lives;
  goToSwipe(navigate, items, 0, false);
}
