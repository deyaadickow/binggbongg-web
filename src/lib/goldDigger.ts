// Gold Digger (Steve, 2026-11-17): "World wide Gold diggers. When you see gold click it and it's
// yours." / "Find gold where ever you are on the app. On any page on any live stream, on any battle,
// at any time." / "You find the gold by the gram and that's how the score goes by the gram."
//
// The SERVER decides every nugget and its grams. The web only asks (goldDiggerRoll), draws what it
// is told, and hands back the server's token when the member taps it (goldDiggerClaim). Months are
// calendar months in Philippine time; the server does that arithmetic too.
//
//   fetchGoldDigger  checkHeader   — the board; works signed out, adds `me` when signed in
//   goldDiggerRoll   authorizeUser — { context, ref_id } -> maybe a drop { token, size, seconds }
//   goldDiggerClaim  authorizeUser — { token } -> grams, or { reason: late | gone | capped }
import { post } from "./api";

export type GdContext = "browse" | "live" | "battle" | "video_end" | "gift";
export type GdSize = "small" | "big" | "giant";

export interface GdUser {
  id: number;
  fullname?: string;
  username?: string;
  profile_image?: string | null;
  country?: string;
  is_verified?: number;
}

export interface GdBadge { month: string; month_label: string; place: number; grams: number }

export interface GdLeader { rank: number; grams: number; nuggets: number; champion_wins: number; user: GdUser }

export interface GdHallMonth {
  month: string;
  month_label: string;
  winners: { place: number; grams: number; prize_bbs: number; user: GdUser }[];
}

export interface GdMe {
  rank: number;
  grams: number;
  nuggets: number;
  today_grams: number;
  user: GdUser;
  badges: GdBadge[];
}

export interface GdBoard {
  enabled: boolean;
  switch_on: boolean;
  month: string;
  month_label: string;
  starts_at: string;
  ends_at: string;
  seconds_left: number;
  timezone: string;
  prizes: number[];
  prizes_paid: boolean;
  first_paid_month: string;
  first_paid_month_label: string;
  daily_cap_grams: number;
  nugget_seconds: number;
  total_diggers: number;
  me: GdMe | null;
  leaders: GdLeader[];
  hall_of_fame: GdHallMonth[];
}

export interface GdDrop { token: string; size: GdSize; seconds: number }
export interface GdRoll { enabled: boolean; next_in: number; drop: GdDrop | null; capped?: boolean }
export interface GdClaim { grams: number; size: GdSize; month_grams: number; rank: number; today_grams: number; daily_cap_grams: number }


export async function fetchGoldDigger(userId?: number | null): Promise<GdBoard | null> {
  const res = await post<GdBoard>("fetchGoldDigger", userId ? { user_id: userId } : {});
  return res.status && res.data ? res.data : null;
}

export async function goldDiggerRoll(userId: number, context: GdContext, refId?: number | string | null): Promise<GdRoll | null> {
  const res = await post<GdRoll>("goldDiggerRoll", { user_id: userId, context, ...(refId ? { ref_id: refId } : {}) });
  return res.status && res.data ? res.data : null;
}

export type ClaimResult =
  | { ok: true; data: GdClaim }
  | { ok: false; message: string; reason: string };

export async function goldDiggerClaim(userId: number, token: string): Promise<ClaimResult> {
  try {
    const res = await post<GdClaim & { reason?: string }>("goldDiggerClaim", { user_id: userId, token });
    if (res.status && res.data) return { ok: true, data: res.data };
    const reason = String((res.data as { reason?: string } | undefined)?.reason ?? "");
    return { ok: false, message: typeof res.message === "string" ? res.message : "", reason };
  } catch {
    return { ok: false, message: "", reason: "network" };
  }
}

// ---- the extra chances: a feed video played to the end, a gift sent ---------------------------
// The app-wide manager (components/GoldDigger.tsx) registers itself here; anything else just calls
// rollGoldNow(). Signed out, or before the manager mounts, it is a no-op. The server throttles
// every roll, so calling is always safe.
type RollFn = (context: GdContext, refId?: number | string | null) => void;
let roller: RollFn | null = null;
export function setGoldRoller(fn: RollFn | null) { roller = fn; }
export function rollGoldNow(context: GdContext, refId?: number | string | null) { roller?.(context, refId); }

/** Which context a route is: live room, a battle screen, or browsing anything else. */
export function contextForPath(pathname: string): GdContext {
  if (/^\/live\/[^/]+/.test(pathname)) return "live";
  if (/^\/(chat-battle\/|country-battle\/live\/|cvc\/[^/]+)/.test(pathname)) return "battle";
  return "browse";
}

/** "13 d 4 h", "4 h 12 m", "12 m" — the month's countdown. */
export function countdownParts(seconds: number): { d: number; h: number; m: number } {
  const s = Math.max(0, Math.floor(seconds));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60) };
}

export const MEDALS = ["🥇", "🥈", "🥉"];
