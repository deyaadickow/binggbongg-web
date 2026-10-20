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
  // Suspended or blocked (2026-10-09). The server answers 403 with the sentence meant to be
  // shown — "Your account has been suspended until December 25th." Without this the member
  // just sees "Server error (403)" on every click and has no idea what happened or when it ends.
  if (res.status === 403) {
    const body = await res.clone().json().catch(() => null);
    if (body && (body.suspended === true || body.blocked === true)) {
      const message = typeof body.message === "string" && body.message
        ? body.message
        : "Your account has been suspended.";
      showSuspendedOverlay(message);
      throw new ApiError(403, message);
    }
  }
  if (!res.ok) throw new ApiError(res.status, `Server error (${res.status})`);
  return (await res.json()) as ApiResponse<T>;
}

/**
 * The one screen a suspended member sees.
 *
 * Built straight onto the document rather than as a React component on purpose: a suspension can
 * land on any call from any page, including ones with no error UI of their own, and every one of
 * those would otherwise fail silently. It is also deliberately not dismissable — there is nothing
 * useful behind it until the suspension ends.
 */
let suspendedOverlayShown = false;
function showSuspendedOverlay(message: string) {
  if (suspendedOverlayShown || typeof document === "undefined") return;
  suspendedOverlayShown = true;

  const overlay = document.createElement("div");
  overlay.setAttribute("role", "alertdialog");
  overlay.setAttribute("aria-live", "assertive");
  overlay.style.cssText = [
    "position:fixed", "inset:0", "z-index:99999",
    "background:rgba(0,0,0,0.94)",
    "display:flex", "align-items:center", "justify-content:center",
    "padding:24px",
    "font-family:inherit",
  ].join(";");

  const card = document.createElement("div");
  card.style.cssText = [
    "max-width:420px", "width:100%",
    "background:#0d0d0d", "border:2px solid #D4AF37", "border-radius:18px",
    "padding:28px 24px", "text-align:center", "color:#fff",
  ].join(";");

  const title = document.createElement("div");
  title.textContent = "Account Suspended";
  title.style.cssText = "color:#FFD54A;font-size:20px;font-weight:700;margin-bottom:12px";

  const text = document.createElement("div");
  text.textContent = message;
  text.style.cssText = "font-size:15px;line-height:1.5";

  const help = document.createElement("div");
  help.textContent = "If you think this is a mistake, contact support.";
  help.style.cssText = "margin-top:14px;font-size:13px;color:#C8C8C8";

  card.append(title, text, help);
  overlay.append(card);
  document.body.append(overlay);
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
  /** Steve, 2026-10-11 (direct messages): the chat identity string the phones key every
   *  Firestore conversation off. Returned by the API for any member — it is NOT one of the
   *  self-only hidden fields — and is what lib/dm.ts builds conversationId from. */
  identity?: string;
  is_verified?: number;
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
  /** The category ids this member marked as favourites, comma separated — the same CSV the
   *  phones read off their own row (CategoryFragment.initFav). Only ever set on your own user. */
  fav_cats?: string;
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
  /** Steve, 2026-10-13: what the (C) button copies for this video. */
  share_url?: string;
  /** Non-null only when the poster pasted a link onto this video — drives the "Link" tab.
   *  The server also sends null when the linked video has since been deleted, so a tab is
   *  never drawn for something that would open nothing. */
  linked_video?: { id: number; thumbnail?: string; user_name?: string; url?: string } | null;
  /** The song on this video. fetchPosts has always eager-loaded it; nothing on the web read it
   *  until the feed's hold-to-open menu (Steve, 2026-10-19) needed somewhere for "the turning
   *  record" to go. `sound` is the file, `sound_title` the name members see. */
  sound?: { id?: number; sound_title?: string; sound?: string; singer?: string } | null;
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
  /** Steve, 2026-10-07: favourites sort to the top of Live Now and the heart filters to them.
   *  The server sends this on every row. */
  is_favourite?: boolean;
  /** Daily Live Badge (Steve, 2026-10-16). 0 none, 1 Bronze, 2 Silver, 3 Gold, 4 Diamond —
   *  today's badge for THIS broadcaster, earned by hosting a live with real viewers in it.
   *  The server also uses it to lift the row up this same list. */
  live_badge_tier?: number;
  live_badge_tier_name?: string;
  live_badge_minutes?: number;
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
  /** Steve, 2026-10-19: Spot — many at once, each holding one place for 3-5 seconds. */
  is_spot?: boolean;
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

/**
 * Lucky numbers + daily horoscope (Steve, 2026-10-09): "for entertainment only so we can bring
 * members to the app on a daily bases."
 *
 * The numbers are STRINGS and must stay strings: "048" is a three digit number and 48 is not,
 * and roughly one draw in ten starts with a zero. Never Number() them.
 *
 * Pass `dateOfBirth` only to set or correct the member's own — the server stores it on the same
 * column the age check reads, so there is nothing else to save.
 */
export type DailyFortune = {
  status: boolean;
  message?: string;
  date?: string;
  lucky_numbers?: Record<string, string>;
  sign?: string | null;
  date_of_birth?: string | null;
  age?: number | null;
  horoscope?: string | null;
  /** Which language the reading actually came back in — "en" when translation was unavailable. */
  horoscope_language?: string;
  disclaimer?: string;
};

export async function fetchDailyFortune(userId: number, dateOfBirth?: string): Promise<DailyFortune> {
  // This endpoint answers at the TOP level rather than nesting under `data`, so the response
  // is read as a whole rather than via res.data.
  //
  // The web has no app-wide language setting — the UI is English only — so the READING is
  // asked for in the BROWSER's language (Steve, 2026-10-10: translate the reading too). "fr-FR"
  // becomes "fr"; Google wants the base code. If the server has no translate key it returns
  // English and says so in horoscope_language.
  const browserLanguage = (navigator.language || "en").split("-")[0].toLowerCase();
  const res = await post("fetchDailyFortune", {
    user_id: userId,
    language: browserLanguage,
    ...(dateOfBirth ? { date_of_birth: dateOfBirth } : {}),
  });
  return res as unknown as DailyFortune;
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

// --- Birthday Page (Steve, 2026-10-20) --------------------------------------------------

export type BirthdayMember = {
  user_id: number;
  fullname?: string;
  username?: string;
  profile_image?: string;
  is_me?: boolean;
  already_wished?: boolean;
};

export type BirthdayList = {
  date?: string;
  flower_coins?: number;
  invite_text?: string;
  /** The member's OWN birthday, or null when they have not saved one. */
  my_birthday?: string | null;
  members?: BirthdayMember[];
};

export type BirthdayWish = {
  id: number;
  /** "wish" (free) or "flower" (100 coins). */
  kind?: string;
  coins?: number;
  sender_user_id?: number;
  fullname?: string;
  username?: string;
  profile_image?: string;
};

export type BirthdayWishes = {
  total_wishes?: number;
  total_flowers?: number;
  total_coins?: number;
  wishes?: BirthdayWish[];
};

export async function fetchTodaysBirthdays(myId: number) {
  const res = await post<BirthdayList>("fetchTodaysBirthdays", { my_user_id: myId });
  return res.data ?? null;
}

/** Free, once per sender per birthday. The server enforces the once — this only reports. */
export async function sendBirthdayWish(myId: number, recipientUserId: number) {
  return post("sendBirthdayWish", { my_user_id: myId, recipient_user_id: recipientUserId });
}

/** 100 coins, uncapped — a member may send flowers as often as they want to pay for. */
export async function sendBirthdayFlowers(myId: number, recipientUserId: number) {
  return post("sendBirthdayFlowers", { my_user_id: myId, recipient_user_id: recipientUserId });
}

/**
 * Who wished ME, and what they sent.
 *
 * markSeen is deliberately left off by the page: it must keep showing everything for ever.
 * Only the (not yet built) login pop-ups should stamp them seen.
 */
export async function fetchMyBirthdayWishes(myId: number) {
  const res = await post<BirthdayWishes>("fetchMyBirthdayWishes", {
    my_user_id: myId,
    unseen_only: 0,
    mark_seen: 0,
  });
  return res.data ?? null;
}

// --- Reporting (Steve, 2026-10-20) --------------------------------------------------------

export type ReportReason = { id: number; reason: string };

/**
 * The reason list an admin maintains, straight off the settings payload the phones already
 * read. Fetched rather than hardcoded so a reason added in the admin panel appears on the web
 * without a deploy.
 */
export async function fetchReportReasons(): Promise<ReportReason[]> {
  try {
    const res = await post<unknown>("fetchSettings", {});
    const data = (res as { data?: { report_reasons?: ReportReason[] } }).data;
    return data?.report_reasons ?? [];
  } catch {
    return [];
  }
}

/**
 * Report a member.
 *
 * `user_id` is the person being REPORTED — not the reporter. The web previously sent the
 * signed-in member's own id here and the reported member as `to_user_id`, which the endpoint
 * does not read at all, so every web report was filed against the person who clicked Report.
 * It also sent no description, which the server requires, so the report was rejected and the
 * member thanked anyway. Both fixed 2026-10-20.
 *
 * `post_id` is optional and names the video the complaint is about, so an admin can watch the
 * thing being complained about instead of guessing.
 */
export async function reportUser(input: {
  reportedUserId: number;
  reason: string;
  description: string;
  postId?: number;
}) {
  return post("reportUser", {
    user_id: input.reportedUserId,
    reason: input.reason,
    description: input.description,
    ...(input.postId ? { post_id: input.postId } : {}),
  });
}

/**
 * Report a VIDEO.
 *
 * A post report, the same kind both phones file when a member reports from the feed — the
 * reported clip is recorded against the report itself, so an admin watches the actual video
 * rather than guessing. The web had no way to report a video at all until 2026-10-20; only a
 * profile could be reported.
 */
export async function reportPost(input: { postId: number; reason: string; description: string }) {
  return post("reportPost", {
    post_id: input.postId,
    reason: input.reason,
    description: input.description,
  });
}
