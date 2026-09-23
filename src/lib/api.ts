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
