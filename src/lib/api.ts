// Bingg Bongg web — API client. Same backend the iOS/Android apps use (admin.binggbongg.com/api),
// same static apiKey header those apps ship with, plus AUTHTOKEN/USERID once signed in.
export const API_BASE = "https://admin.binggbongg.com/api/";
export const WEB_BASE = "https://admin.binggbongg.com/";
export const UPLOAD_BASE = "https://d32kgcvh9dqf5h.cloudfront.net/";
export const TOKEN_SERVER = "https://binggbongg-livekit-token.onrender.com/";
const API_KEY = "123";

export type ApiResponse<T> = { status: boolean; message?: string; data?: T } & Record<string, unknown>;

export function mediaUrl(path?: string | null): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return UPLOAD_BASE + path.replace(/^\/+/, "");
}

let authHeaders: Record<string, string> = {};
export function setAuthHeaders(token: string | null, userId: number | null) {
  authHeaders = token && userId ? { AUTHTOKEN: token, USERID: String(userId) } : {};
}

/** The headers every authorised call sends, for the two uploads that must build their own
 *  request (multipart / progress) instead of going through post(). */
export function currentAuthHeaders(): Record<string, string> {
  return { apikey: API_KEY, ...authHeaders };
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function post<T = unknown>(endpoint: string, params: Record<string, unknown> = {}): Promise<ApiResponse<T>> {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) v.forEach((item) => body.append(`${k}[]`, String(item)));
    else body.append(k, String(v));
  }
  const res = await fetch(API_BASE + endpoint, {
    method: "POST",
    headers: { apikey: API_KEY, ...authHeaders, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (res.status === 401) throw new ApiError(401, "Please sign in again.");
  if (!res.ok) throw new ApiError(res.status, `Server error (${res.status})`);
  return (await res.json()) as ApiResponse<T>;
}

/** LiveKit token server: same AUTHTOKEN/USERID headers, JSON bodies. */
export async function tokenServer<T = unknown>(path: string, init: { method?: string; query?: Record<string, string>; body?: unknown } = {}): Promise<T> {
  const url = new URL(TOKEN_SERVER + path);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    method: init.method ?? "GET",
    headers: { ...authHeaders, ...(init.body ? { "Content-Type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, json.error ?? `Token server error (${res.status})`);
  return json;
}

// ---- shapes we actually read (everything else in the payloads is ignored)
export interface UserSummary {
  id: number;
  /** Steve, 2026-10-05: "(BBBB) Bingg Bongg Battle Badge" — battles completed, counted one by
   *  one ("just add the battles in real time… just count up one by one"). 0 = no badge yet. */
  battle_badge?: number;
  /** Steve, 2026-10-05: days battled in a row, and the flames (free days) banked with them —
   *  one flame for every 30 days kept. Server-computed; see Users::extendStreak. */
  battle_streak?: number;
  battle_flames?: number;
  fullname?: string;
  username?: string;
  profile_image?: string;
  bio?: string;
  country?: string;
  total_followers?: number;
  total_followings?: number;
  total_likes?: number;
  coin_wallet?: number;
  no_redeem_wallet?: number;
  redeem_wallet?: number;
  cash_wallet?: number;
  is_following?: boolean | number;
  auth_token?: string;
}

export interface Post {
  id: number;
  user_id: number;
  video?: string;
  thumbnail?: string;
  description?: string;
  hashtags?: string;
  likes?: number;
  views?: number;
  total_comments?: number;
  vote_count?: number;
  is_post_liked?: boolean | number;
  created_at?: string;
  user?: UserSummary;
}

export interface LiveStream {
  room_name: string;
  started_at?: string;
  host_user_id: number;
  host_fullname?: string;
  host_username?: string;
  host_profile_image?: string;
  viewers?: number;
  watching_count?: number;
}

export interface Gift {
  id: number;
  name?: string;
  image?: string;
  /** tbl_gifts stores the price as `votes`; the battle ledgers call it coin_price. */
  votes?: number;
  coin_price?: number;
  /** Eddie, 2026-09-19: "the gift will appear 100 times one after another" — an admin flag on
   *  individual gifts. A 100-coin TapTap gift bursts 100 copies of its own icon instead of one. */
  is_taptap?: boolean;
  /** Rainfall — the same burst falling instead of rising. Mutually exclusive with is_taptap. */
  is_rainfall?: boolean;
  /** Left Hander / Right Hander — the NAME is the side they come FROM, so a Left Hander
   *  travels rightwards. All four effects are mutually exclusive. */
  is_left_hander?: boolean;
  is_right_hander?: boolean;
  /** Surprise — pops batches of 5-10 all over the screen for 5 seconds. The ONE effect whose
   *  count is not the gift's coin price. */
  is_surprise?: boolean;
  /** Universal — each gift picks one of the four sides, so a quarter arrive from each. */
  is_universal?: boolean;
}
export function giftPrice(g: Gift): number {
  return Number(g.coin_price ?? g.votes ?? 0);
}

export interface CoinPlan {
  id: number;
  coin_amount?: number;
  coins?: number;
  price?: number;
  amount?: number;
  currency?: string;
}

export function displayName(u?: Partial<UserSummary> | null): string {
  if (!u) return "Member";
  return (u.fullname && u.fullname.trim()) || (u.username && u.username.trim()) || "Member";
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ------------------------------------------------------------------------- *
 * My Live/Battle Schedule (Steve, 2026-10-06)
 *
 * starts_at is UTC from the server, always. Render it with toLocaleString() and never with a
 * hand-rolled format — members are in every timezone the app sells ads in.
 * ------------------------------------------------------------------------- */

export type ScheduleKind = "live" | "battle";

export interface ScheduleItem {
  id: number;
  user_id: number;
  kind: ScheduleKind;
  battle_type?: string | null;
  note?: string | null;
  /** UTC. */
  starts_at: string;
  opponent_user_id?: number | null;
  user?: UserSummary | null;
  opponent?: UserSummary | null;
}

export interface BattleRequestItem {
  id: number;
  from_user_id: number;
  to_user_id: number;
  battle_type: string;
  note?: string | null;
  /** UTC. */
  starts_at: string;
  status: "pending" | "accepted" | "denied";
  from_user?: UserSummary | null;
  to_user?: UserSummary | null;
}

/** The nine battle engines, as the apps name them. */
export const BATTLE_TYPES = [
  "1v1", "2v2", "5-5-5", "Marathon", "Best Out Of", "Virtual", "Hide & Seek", "Solo", "PK Battle",
] as const;

/** A datetime-local input gives local time with no zone; the server wants UTC. */
export function localInputToUtc(value: string): string {
  return new Date(value).toISOString();
}

/** UTC from the server -> the viewer's own local time, in their own locale. */
export function formatScheduleTime(utc: string): string {
  const d = new Date(utc);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export async function fetchUserSchedule(userId: number, myId?: number) {
  const res = await post<ScheduleItem[]>("fetchUserSchedule", {
    user_id: userId,
    ...(myId ? { my_user_id: myId } : {}),
  });
  return res.data ?? [];
}

export async function fetchUpcomingSchedules(myId: number, kind?: ScheduleKind) {
  const res = await post<ScheduleItem[]>("fetchUpcomingSchedules", {
    my_user_id: myId,
    user_id: myId,
    ...(kind ? { kind } : {}),
  });
  return res.data ?? [];
}

export async function addSchedule(input: {
  myId: number;
  kind: ScheduleKind;
  startsAtUtc: string;
  battleType?: string;
  note?: string;
}) {
  return post("addSchedule", {
    user_id: input.myId,
    my_user_id: input.myId,
    kind: input.kind,
    starts_at: input.startsAtUtc,
    battle_type: input.battleType,
    note: input.note,
  });
}

export async function deleteSchedule(myId: number, scheduleId: number) {
  return post("deleteSchedule", { my_user_id: myId, user_id: myId, schedule_id: scheduleId });
}

export async function sendBattleRequest(input: {
  myId: number;
  toUserId: number;
  battleType: string;
  startsAtUtc: string;
  note?: string;
}) {
  return post("sendBattleRequest", {
    my_user_id: input.myId,
    to_user_id: input.toUserId,
    battle_type: input.battleType,
    starts_at: input.startsAtUtc,
    note: input.note,
  });
}

export async function fetchMyBattleRequests(myId: number) {
  const res = await post<BattleRequestItem[]>("fetchMyBattleRequests", {
    my_user_id: myId, user_id: myId,
  });
  return { incoming: res.data ?? [], sent: ((res as unknown as { sent?: BattleRequestItem[] }).sent) ?? [] };
}

export async function respondToBattleRequest(myId: number, requestId: number, accept: boolean) {
  return post("respondToBattleRequest", {
    my_user_id: myId, user_id: myId, battle_request_id: requestId, accept: accept ? 1 : 0,
  });
}
