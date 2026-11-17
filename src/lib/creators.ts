// Creators and money (Steve, 2026-11-17): "Paid subscriptions to a creator. Paid video series.
// Scheduling posts ahead of time." The creator picks the monthly price from a list and decides what
// subscribers get and how a series is sold; members pay in BBs.
//
// Server: binggbongg-backend 5c98576, NOT deployed yet. Until it is, the dev server answers every
// one of these endpoints from lib/creatorsMock.ts — and also every upload that carries
// subscribers_only / series_id / scheduled_at — so testing on the dev server never subscribes,
// buys, saves a plan or series, or schedules anything on the live server. The mock is only ever
// imported under `import.meta.env.DEV`, so it is not in the production build.
//
// The apikey-only reads (fetchCreatorPlan, fetchSeries, fetchPosts…) work out the viewer from the
// session headers; lib/api.ts post() always sends AUTHTOKEN + USERID once signed in.
import { currentUserId, post, type ApiResponse, type Post, type UserSummary } from "./api";
import { socialMockUser } from "./social";

const NEW_ENDPOINTS = new Set([
  "fetchCreatorOptions", "saveCreatorPlan", "fetchCreatorPlan", "subscribeToCreator", "cancelSubscription",
  "fetchMySubscriptions", "fetchMySubscribers", "fetchSubscriberBadges",
  "createSeries", "editSeries", "deleteSeries", "fetchUserSeries", "fetchSeries", "buySeries",
  "fetchMyScheduledPosts", "rescheduleScheduledPost", "cancelScheduledPost",
  "setLiveSubscribersOnly", "checkLiveAccess",
]);

const MOCK_KEY = "bb.creatorsMock";

/** Dev server only: `?creatormock=demo` puts subscriber-only and series locks, plans and series on
 *  real feed videos so every screen can be tried; `lives` in the value gates odd-numbered hosts'
 *  lives; `broke` starts the pretend wallet at 0 BBs (the low-balance popup). `?creatormock=0` off. */
export function creatorMockMode(): string {
  if (!import.meta.env.DEV) return "";
  try {
    const q = new URLSearchParams(window.location.search).get("creatormock");
    if (q !== null) {
      if (q === "0" || q === "") localStorage.removeItem(MOCK_KEY);
      else localStorage.setItem(MOCK_KEY, q);
    }
    return localStorage.getItem(MOCK_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Who is looking: the signed-in member, or on the dev server the Social mock's pretend member. */
export function viewerId(): number | null {
  return currentUserId() ?? socialMockUser()?.id ?? null;
}

export async function creatorCall<T>(endpoint: string, params: Record<string, unknown>): Promise<ApiResponse<T>> {
  if (import.meta.env.DEV && NEW_ENDPOINTS.has(endpoint)) {
    const m = await import("./creatorsMock");
    return m.mockCreatorCall<T>(endpoint, params, viewerId(), creatorMockMode());
  }
  return post<T>(endpoint, params);
}

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const n = (v: unknown) => Number(v ?? 0) || 0;

// ---- Shapes --------------------------------------------------------------------------------------

export type PerkKey = "videos" | "series" | "badge" | "lives";
export const PERK_KEYS: PerkKey[] = ["videos", "series", "badge", "lives"];
export type Perks = Record<PerkKey, number>;

export interface CreatorOptions {
  sub_prices: number[];
  series_prices: number[];
  episode_prices: number[];
  perks: { key: PerkKey; label: string }[];
  max_extra_perks: number;
  schedule_min_minutes: number;
  schedule_max_days: number;
}

export interface CreatorPlan {
  creator_id: number;
  price_bbs: number;
  is_active: number;
  perks: Perks;
  extra_perks: string[];
  welcome_message?: string | null;
  subscribers_count?: number;
}

export interface MySubscription {
  status: "active" | "cancelled" | "expired";
  price_bbs: number;
  started_at?: string;
  current_period_end?: string;
  is_paid_up?: boolean | number;
  renews?: boolean | number;
}

export type Pricing = "series" | "episode" | "both" | "free";

export interface Series {
  id: number;
  title: string;
  description?: string | null;
  cover?: string | null;
  first_thumbnail?: string | null;
  pricing: Pricing;
  series_price_bbs?: number | null;
  episode_price_bbs?: number | null;
  first_episode_free?: number;
  free_for_subscribers?: number;
  episodes_count?: number;
  buyers_count?: number;
  creator_id: number;
  owned?: boolean | number;
  creator?: UserSummary | null;
  owned_episode_ids?: number[];
  is_subscribed?: boolean | number;
  episodes?: Post[];
}

export interface CreatorPlanInfo {
  plan: CreatorPlan | null;
  series: Series[];
  my_subscription: MySubscription | null;
  is_me: boolean;
}

export interface SubscriptionRow {
  creator: UserSummary;
  status: MySubscription["status"];
  price_bbs: number;
  current_period_end?: string;
  is_paid_up?: boolean | number;
  renews?: boolean | number;
}

export interface SubscriberRow {
  subscriber: UserSummary;
  status: MySubscription["status"];
  price_bbs: number;
  started_at?: string;
  current_period_end?: string;
  renews?: boolean | number;
}

export interface SubscriberTotals {
  subscribers: number;
  bbs_this_month: number;
  bbs_all_time: number;
  subscription_bbs_this_month?: number;
  series_bbs_this_month?: number;
}

export interface ScheduledPost {
  id: number;
  thumbnail?: string | null;
  thumbnail_url?: string | null;
  description?: string | null;
  publish_at: string;
  status: "pending" | "publishing" | "failed";
  error?: string | null;
}

/** A refusal from one of these calls: the server's sentence plus its code (low_balance …). */
export class CreatorError extends Error {
  code: string;
  constructor(message: string, code = "") {
    super(message);
    this.code = code;
  }
}
function refuse(r: ApiResponse<unknown>, fallback: string): never {
  throw new CreatorError(r.message || fallback, String(r.code ?? ""));
}

// ---- Normalising -------------------------------------------------------------------------------

export function normalisePerks(raw: unknown): Perks {
  let p: Record<string, unknown> = {};
  if (typeof raw === "string") { try { p = JSON.parse(raw) as Record<string, unknown>; } catch { p = {}; } }
  else if (raw && typeof raw === "object") p = raw as Record<string, unknown>;
  return { videos: n(p.videos) ? 1 : 0, series: n(p.series) ? 1 : 0, badge: n(p.badge) ? 1 : 0, lives: n(p.lives) ? 1 : 0 };
}

function normalisePlan(raw: unknown): CreatorPlan | null {
  const p = raw as Partial<CreatorPlan> & { extra_perks?: unknown } | null;
  if (!p || !p.price_bbs) return null;
  const extra = Array.isArray(p.extra_perks) ? p.extra_perks : String(p.extra_perks ?? "").split("\n");
  return {
    creator_id: n(p.creator_id), price_bbs: n(p.price_bbs), is_active: n(p.is_active),
    perks: normalisePerks(p.perks), extra_perks: extra.map((x) => String(x).trim()).filter(Boolean),
    welcome_message: p.welcome_message ?? null, subscribers_count: n(p.subscribers_count),
  };
}

export const truthy = (v: unknown) => v === true || Number(v) === 1;

// ---- Options -------------------------------------------------------------------------------------

const DEFAULT_OPTIONS: CreatorOptions = {
  sub_prices: [99, 199, 499, 999], series_prices: [49, 99, 199, 499, 999], episode_prices: [9, 19, 49, 99],
  perks: [
    { key: "videos", label: "Subscriber-only videos" },
    { key: "series", label: "My paid series free" },
    { key: "badge", label: "Subscriber badge in my comments and lives" },
    { key: "lives", label: "Subscriber-only lives" },
  ],
  max_extra_perks: 5, schedule_min_minutes: 5, schedule_max_days: 60,
};
let optionsCache: Promise<CreatorOptions> | null = null;

export function fetchCreatorOptions(): Promise<CreatorOptions> {
  if (!optionsCache) {
    optionsCache = creatorCall<CreatorOptions>("fetchCreatorOptions", {})
      .then((r) => {
        const d = r.status && r.data ? r.data : DEFAULT_OPTIONS;
        return {
          sub_prices: arr<number>(d.sub_prices).map(Number).filter(Boolean),
          series_prices: arr<number>(d.series_prices).map(Number).filter(Boolean),
          episode_prices: arr<number>(d.episode_prices).map(Number).filter(Boolean),
          perks: arr<{ key: PerkKey; label: string }>(d.perks).filter((p) => PERK_KEYS.includes(p.key)),
          max_extra_perks: n(d.max_extra_perks) || 5,
          schedule_min_minutes: n(d.schedule_min_minutes) || 5,
          schedule_max_days: n(d.schedule_max_days) || 60,
        };
      })
      .catch(() => { optionsCache = null; return DEFAULT_OPTIONS; });
  }
  return optionsCache;
}

// ---- Plans + subscribing -------------------------------------------------------------------------

export async function fetchCreatorPlan(creatorId: number): Promise<CreatorPlanInfo> {
  const r = await creatorCall<CreatorPlanInfo>("fetchCreatorPlan", { creator_id: creatorId });
  if (!r.status || !r.data) refuse(r, "");
  return {
    plan: normalisePlan(r.data.plan),
    series: arr<Series>(r.data.series),
    my_subscription: r.data.my_subscription ?? null,
    is_me: truthy(r.data.is_me),
  };
}

export async function saveCreatorPlan(myUserId: number, input: {
  price: number; perks: Perks; extra: string[]; welcome: string; active: boolean;
}): Promise<CreatorPlan> {
  const r = await creatorCall<CreatorPlan>("saveCreatorPlan", {
    my_user_id: myUserId, price_bbs: input.price, perks: JSON.stringify(input.perks),
    extra_perks: input.extra.map((x) => x.trim()).filter(Boolean).join("\n"),
    welcome_message: input.welcome.trim(), is_active: input.active ? 1 : 0,
  });
  const plan = r.status ? normalisePlan(r.data) : null;
  if (!plan) refuse(r, "Couldn't save your subscription.");
  return plan;
}

export interface SubscribeResult { message: string; charged: number; welcome: string; sub: MySubscription | null }

export async function subscribeToCreator(myUserId: number, creatorId: number): Promise<SubscribeResult> {
  const r = await creatorCall<MySubscription>("subscribeToCreator", { my_user_id: myUserId, creator_id: creatorId });
  if (!r.status) refuse(r, "Couldn't subscribe.");
  return { message: r.message || "", charged: n(r.charged_bbs), welcome: String(r.welcome_message ?? ""), sub: r.data ?? null };
}

export async function cancelSubscription(myUserId: number, creatorId: number): Promise<string> {
  const r = await creatorCall("cancelSubscription", { my_user_id: myUserId, creator_id: creatorId });
  if (!r.status) refuse(r, "Couldn't cancel.");
  return r.message || "";
}

export async function fetchMySubscriptions(myUserId: number): Promise<SubscriptionRow[]> {
  const r = await creatorCall<SubscriptionRow[]>("fetchMySubscriptions", { my_user_id: myUserId });
  if (!r.status) refuse(r, "");
  return arr<SubscriptionRow>(r.data).filter((x) => x?.creator?.id);
}

export async function fetchMySubscribers(myUserId: number, start = 0, count = 50): Promise<{ rows: SubscriberRow[]; totals: SubscriberTotals }> {
  const r = await creatorCall<SubscriberRow[]>("fetchMySubscribers", { my_user_id: myUserId, start, count });
  if (!r.status) refuse(r, "");
  const t = (r.totals ?? {}) as Partial<SubscriberTotals>;
  return {
    rows: arr<SubscriberRow>(r.data).filter((x) => x?.subscriber?.id),
    totals: { subscribers: n(t.subscribers), bbs_this_month: n(t.bbs_this_month), bbs_all_time: n(t.bbs_all_time),
      subscription_bbs_this_month: n(t.subscription_bbs_this_month), series_bbs_this_month: n(t.series_bbs_this_month) },
  };
}

export async function fetchSubscriberBadges(creatorId: number, userIds: number[]): Promise<Set<number>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!creatorId || !ids.length) return new Set();
  const r = await creatorCall<number[]>("fetchSubscriberBadges", { creator_id: creatorId, user_ids: ids.join(",") }).catch(() => null);
  return new Set(r?.status ? arr<number>(r.data).map(Number) : []);
}

// ---- Series --------------------------------------------------------------------------------------

export interface SeriesInput {
  title: string; description: string; cover?: string | null; pricing: Pricing;
  seriesPrice?: number | null; episodePrice?: number | null; firstFree: boolean; freeForSubscribers: boolean;
}
function seriesParams(i: SeriesInput): Record<string, unknown> {
  return {
    title: i.title.trim(), description: i.description.trim(), ...(i.cover ? { cover: i.cover } : {}), pricing: i.pricing,
    ...((i.pricing === "series" || i.pricing === "both") && i.seriesPrice ? { series_price_bbs: i.seriesPrice } : {}),
    ...((i.pricing === "episode" || i.pricing === "both") && i.episodePrice ? { episode_price_bbs: i.episodePrice } : {}),
    first_episode_free: i.firstFree ? 1 : 0, free_for_subscribers: i.freeForSubscribers ? 1 : 0,
  };
}

export async function createSeries(myUserId: number, input: SeriesInput): Promise<Series> {
  const r = await creatorCall<Series>("createSeries", { my_user_id: myUserId, ...seriesParams(input) });
  if (!r.status || !r.data) refuse(r, "Couldn't create the series.");
  return r.data;
}
export async function editSeries(myUserId: number, seriesId: number, input: SeriesInput): Promise<Series> {
  const r = await creatorCall<Series>("editSeries", { my_user_id: myUserId, series_id: seriesId, ...seriesParams(input) });
  if (!r.status || !r.data) refuse(r, "Couldn't save the series.");
  return r.data;
}
export async function deleteSeries(myUserId: number, seriesId: number): Promise<string> {
  const r = await creatorCall("deleteSeries", { my_user_id: myUserId, series_id: seriesId });
  if (!r.status) refuse(r, "Couldn't delete the series.");
  return r.message || "";
}
export async function fetchUserSeries(creatorId: number): Promise<Series[]> {
  const r = await creatorCall<Series[]>("fetchUserSeries", { creator_id: creatorId });
  if (!r.status) refuse(r, "");
  return arr<Series>(r.data);
}
export async function fetchSeries(seriesId: number): Promise<Series> {
  const r = await creatorCall<Series>("fetchSeries", { series_id: seriesId });
  if (!r.status || !r.data) refuse(r, "That series isn't available.");
  return { ...r.data, episodes: arr<Post>(r.data.episodes), owned_episode_ids: arr<number>(r.data.owned_episode_ids).map(Number) };
}
export async function buySeries(myUserId: number, seriesId: number, postId?: number): Promise<{ message: string; charged: number; series: Series | null }> {
  const r = await creatorCall<Series>("buySeries", { my_user_id: myUserId, series_id: seriesId, ...(postId ? { post_id: postId } : {}) });
  if (!r.status) refuse(r, "Couldn't buy that.");
  return { message: r.message || "", charged: n(r.charged_bbs), series: r.data ?? null };
}

// ---- Scheduled posts -----------------------------------------------------------------------------

export async function fetchMyScheduledPosts(myUserId: number): Promise<ScheduledPost[]> {
  const r = await creatorCall<ScheduledPost[]>("fetchMyScheduledPosts", { my_user_id: myUserId });
  if (!r.status) refuse(r, "");
  return arr<ScheduledPost>(r.data);
}
export async function rescheduleScheduledPost(myUserId: number, scheduledId: number, publishAtUnix: number): Promise<string> {
  const r = await creatorCall("rescheduleScheduledPost", { my_user_id: myUserId, scheduled_id: scheduledId, publish_at: publishAtUnix });
  if (!r.status) refuse(r, "Couldn't change the time.");
  return r.message || "";
}
export async function cancelScheduledPost(myUserId: number, scheduledId: number): Promise<string> {
  const r = await creatorCall("cancelScheduledPost", { my_user_id: myUserId, scheduled_id: scheduledId });
  if (!r.status) refuse(r, "Couldn't cancel it.");
  return r.message || "";
}

/** The server's publish_at is UTC ("2026-11-20 13:00:00", or ISO). */
export function parseUtc(s?: string | null): Date | null {
  if (!s) return null;
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(" ", "T") + "Z";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
export function localDateTime(s?: string | null): string {
  const d = parseUtc(s);
  return d ? d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
}
export function localDate(s?: string | null): string {
  const d = parseUtc(s);
  return d ? d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : "";
}
/** A datetime-local value (local wall time, no zone) for a Date. */
export function toLocalInput(d: Date): string {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
/** Unix seconds for a datetime-local value, read in the member's own time zone. */
export function localInputToUnix(v: string): number {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? 0 : Math.floor(d.getTime() / 1000);
}
/** "" when the time is inside the 5 minutes – 60 days window, else why not. */
export function scheduleProblem(unix: number, o: Pick<CreatorOptions, "schedule_min_minutes" | "schedule_max_days">): "" | "soon" | "far" {
  const now = Date.now() / 1000;
  if (!unix || unix < now + o.schedule_min_minutes * 60 - 5) return "soon";
  if (unix > now + o.schedule_max_days * 86400) return "far";
  return "";
}

// ---- Lives ---------------------------------------------------------------------------------------

export async function setLiveSubscribersOnly(myUserId: number, roomName: string, on: boolean): Promise<string> {
  const r = await creatorCall("setLiveSubscribersOnly", { my_user_id: myUserId, room_name: roomName, on: on ? 1 : 0 });
  if (!r.status) refuse(r, "Couldn't change that.");
  return r.message || "";
}

export type LiveAccess = { allowed: true } | { allowed: false; reason: string; creator_id: number; sub_price_bbs: number; message?: string };
export async function checkLiveAccess(roomName: string): Promise<LiveAccess> {
  const r = await creatorCall("checkLiveAccess", { room_name: roomName }).catch(() => null);
  // Anything but a clear "no" lets the member in: the room itself still has the final say.
  if (!r || r.allowed !== false) return { allowed: true };
  return { allowed: false, reason: String(r.reason ?? "subscribers"), creator_id: n(r.creator_id), sub_price_bbs: n(r.sub_price_bbs), message: r.message };
}

// ---- Posts ---------------------------------------------------------------------------------------

/** On the dev server: the mock's locks / series episodes laid over real posts. Production: as is. */
export async function devCreatorDecorate<T extends Post>(posts: T[]): Promise<T[]> {
  if (!import.meta.env.DEV) return posts;
  const m = await import("./creatorsMock");
  return m.decorateCreatorPosts(posts, viewerId(), creatorMockMode());
}

/** uploadPost carrying subscribers_only / series_id / scheduled_at — on the dev server, the mock. */
export async function creatorUploadPost(params: Record<string, unknown>): Promise<ApiResponse<unknown>> {
  if (import.meta.env.DEV) {
    const m = await import("./creatorsMock");
    return m.mockCreatorUpload(params, creatorMockMode());
  }
  return post("uploadPost", params);
}

/** Dev only: a cover picked in the mock is an object URL kept in this page's memory. */
export async function devRememberFile(key: string, file: File): Promise<void> {
  if (!import.meta.env.DEV) return;
  const m = await import("./creatorsMock");
  m.rememberFile(key, URL.createObjectURL(file));
}

export const priceLabel = (bbs: number) => `${bbs} BBs`;
