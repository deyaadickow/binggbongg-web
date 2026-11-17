// DEV-ONLY stand-in for the Creators and money server (binggbongg-backend 5c98576, not deployed
// yet). Loaded only through lib/creators.ts under `import.meta.env.DEV`, so it is never in the
// production build, and on the dev server a subscribe, purchase, plan, series or scheduled post
// never reaches the live server.
//
// Content is REAL where it can be: locks and series are laid over real posts read from the live,
// read-only fetchPosts / fetchUserPosts / fetchPostById, and members come from fetchUserDetails.
// Everything the member does lives in sessionStorage (and covers in this page's memory).
import { post, type ApiResponse, type Post, type PostLock, type UserSummary } from "./api";
import type { MySubscription, Perks, Pricing, ScheduledPost, Series } from "./creators";
import { normalisePerks } from "./creators";

const STORE = "bb.creatorsMock.state";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ok = <T,>(data: T, extra: Record<string, unknown> = {}): ApiResponse<T> => ({ status: true, data, ...extra });
const fail = <T,>(message: string, code = ""): ApiResponse<T> => ({ status: false, message, ...(code ? { code } : {}) });
const utc = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
const DAY = 86400_000;

const SUB_PRICES = [99, 199, 499, 999];
const SERIES_PRICES = [49, 99, 199, 499, 999];
const EPISODE_PRICES = [9, 19, 49, 99];
const PERKS = [
  { key: "videos", label: "Subscriber-only videos" },
  { key: "series", label: "My paid series free" },
  { key: "badge", label: "Subscriber badge in my comments and lives" },
  { key: "lives", label: "Subscriber-only lives" },
];

interface PlanRow { price_bbs: number; is_active: number; perks: Perks; extra_perks: string[]; welcome_message: string }
interface SubRow { creator_id: number; status: MySubscription["status"]; price_bbs: number; started_at: string; current_period_end: string; renews: number; creator?: UserSummary }
interface SeriesRow {
  id: number; creator_id: number; title: string; description: string; cover: string; pricing: Pricing;
  series_price_bbs: number | null; episode_price_bbs: number | null; first_episode_free: number; free_for_subscribers: number;
  episode_ids: number[]; buyers_count: number;
}
interface Sched { id: number; user_id: number; thumbnail_url: string; description: string; publish_at: string; status: ScheduledPost["status"]; error: string | null }
interface State {
  plans: Record<string, PlanRow>;
  subs: Record<string, SubRow>;              // "viewer:creator"
  spent: Record<string, number>;             // viewer -> BBs spent in the mock
  series: SeriesRow[];                       // made (or edited) in the mock
  deletedSeries: number[];
  ownedSeries: Record<string, number[]>;     // viewer -> series ids
  ownedEpisodes: Record<string, number[]>;   // viewer -> post ids
  subsOnly: number[];                        // post ids uploaded as subscribers only
  demoEpisodes: Record<string, number[]>;    // creator -> post ids of the demo series, in order
  scheduled: Sched[];
  seededScheduled: number[];                 // viewers whose demo rows were added
  liveSubsOnly: string[];                    // room names
  seq: number;
}
function load(): State {
  const blank: State = { plans: {}, subs: {}, spent: {}, series: [], deletedSeries: [], ownedSeries: {}, ownedEpisodes: {}, subsOnly: [], demoEpisodes: {}, scheduled: [], seededScheduled: [], liveSubsOnly: [], seq: 1 };
  try { return { ...blank, ...(JSON.parse(sessionStorage.getItem(STORE) || "{}") as Partial<State>) }; } catch { return blank; }
}
function save(s: State) { try { sessionStorage.setItem(STORE, JSON.stringify(s)); } catch { /* fine */ } }

// ---- Files + posts seen -------------------------------------------------------------------------

const files: Record<string, string> = {};
export function rememberFile(key: string, url: string) { files[key] = url; }
const coverUrl = (key: string) => (key && files[key]) || key;

/** Every post the pages have shown, as the server sent it (with its real video). */
const known: Record<number, Post> = {};
const users: Record<number, UserSummary> = {};

async function realPost(id: number): Promise<Post | null> {
  if (known[id]) return known[id];
  if (id >= 990_000_000) {
    const m = await import("./socialMock");
    const r = await m.mockSocialCall<Post>("fetchPostById", { post_id: id }, "");
    if (r.status && r.data) known[id] = r.data;
    return r.data ?? null;
  }
  const r = await post<Post | Post[]>("fetchPostById", { post_id: id }).catch(() => null);
  const d = Array.isArray(r?.data) ? r?.data[0] : r?.data;
  if (d) known[id] = d;
  return d ?? null;
}

const userPostsLoaded: Record<number, Promise<Post[]>> = {};
function userPosts(uid: number): Promise<Post[]> {
  if (!userPostsLoaded[uid]) {
    userPostsLoaded[uid] = post<Post[]>("fetchUserPosts", { user_id: uid, start: 0, count: 10 })
      .then((r) => { const list = Array.isArray(r.data) ? r.data : []; for (const p of list) { known[p.id] = known[p.id] ?? p; if (p.user) users[uid] = p.user; } return list; })
      .catch(() => []);
  }
  return userPostsLoaded[uid];
}

let pool: Post[] = [];
async function feedPool(): Promise<Post[]> {
  if (pool.length >= 10) return pool;
  const r = await post<Post[]>("fetchPosts", {}).catch(() => null);
  for (const p of r?.data ?? []) if (p.user && !pool.some((x) => x.id === p.id)) { pool.push(p); known[p.id] = known[p.id] ?? p; users[p.user_id] = p.user; }
  return pool;
}

async function userOf(uid: number): Promise<UserSummary> {
  if (users[uid]) return users[uid];
  if (uid === 900002) return { id: uid, fullname: "Test Member", username: "testmember" }; // the Social mock's pretend member
  const r = await post<UserSummary>("fetchUserDetails", { user_id: uid }).catch(() => null);
  const u = r?.data ? { id: uid, fullname: r.data.fullname, username: r.data.username, profile_image: r.data.profile_image, is_verified: r.data.is_verified } : { id: uid };
  users[uid] = u;
  return u;
}

// ---- Plans, subscriptions, series ---------------------------------------------------------------

function demoPlan(c: number): PlanRow {
  return {
    price_bbs: SUB_PRICES[c % 4], is_active: 1,
    perks: { videos: 1, series: c % 2 === 0 ? 1 : 0, badge: 1, lives: c % 2 },
    extra_perks: ["Monthly shout-out", "Ask me anything every Friday"],
    welcome_message: "Thank you for subscribing! You're one of my VIPs now.",
  };
}
function planOf(s: State, c: number, viewer: number | null, mode: string): PlanRow | null {
  if (s.plans[String(c)]) return s.plans[String(c)];
  if (mode.includes("demo") && c !== viewer && c > 0) return demoPlan(c);
  return null;
}
function subOf(s: State, viewer: number | null, c: number): SubRow | null {
  if (!viewer) return null;
  const row = s.subs[`${viewer}:${c}`];
  if (!row) return null;
  const end = new Date(row.current_period_end.replace(" ", "T") + "Z").getTime();
  if (end < Date.now()) return { ...row, status: "expired" };
  return row;
}
const paidUp = (row: SubRow | null) => !!row && row.status !== "expired";
const subJson = (row: SubRow): MySubscription => ({ status: row.status, price_bbs: row.price_bbs, started_at: row.started_at, current_period_end: row.current_period_end, is_paid_up: paidUp(row), renews: !!row.renews });

function balance(s: State, viewer: number, mode: string): number {
  return (mode.includes("broke") ? 0 : 1000) - (s.spent[String(viewer)] ?? 0);
}
function charge(s: State, viewer: number, mode: string, bbs: number): ApiResponse<never> | null {
  if (balance(s, viewer, mode) < bbs) return fail(`You need ${bbs} BBs and have ${Math.max(0, balance(s, viewer, mode))} BBs. Buy BBs to continue.`, "low_balance");
  s.spent[String(viewer)] = (s.spent[String(viewer)] ?? 0) + bbs;
  return null;
}

const DEMO_SERIES_BASE = 970_000_000;
function demoSeries(s: State, c: number, mode: string): SeriesRow | null {
  if (!mode.includes("demo") || c <= 0) return null;
  const id = DEMO_SERIES_BASE + c;
  if (s.deletedSeries.includes(id)) return null;
  const edited = s.series.find((x) => x.id === id);
  if (edited) return edited;
  const pricing: Pricing = c % 3 === 0 ? "both" : c % 3 === 1 ? "series" : "episode";
  return {
    id, creator_id: c, title: "Behind the Scenes", description: "How I make my videos, step by step — one new episode every week.",
    cover: "", pricing, series_price_bbs: pricing === "episode" ? null : SERIES_PRICES[1 + (c % 2)],
    episode_price_bbs: pricing === "series" ? null : EPISODE_PRICES[1], first_episode_free: 1,
    free_for_subscribers: demoPlan(c).perks.series, episode_ids: s.demoEpisodes[String(c)] ?? [], buyers_count: 3 + (c % 7),
  };
}
function seriesById(s: State, id: number, mode: string): SeriesRow | null {
  if (s.deletedSeries.includes(id)) return null;
  const own = s.series.find((x) => x.id === id);
  if (own) return own;
  return id > DEMO_SERIES_BASE && id < DEMO_SERIES_BASE + 100_000_000 ? demoSeries(s, id - DEMO_SERIES_BASE, mode) : null;
}
function seriesOfCreator(s: State, c: number, viewer: number | null, mode: string): SeriesRow[] {
  const own = s.series.filter((x) => x.creator_id === c && !s.deletedSeries.includes(x.id) && x.id < DEMO_SERIES_BASE);
  const demo = c !== viewer ? demoSeries(s, c, mode) : null;
  return demo ? [...own, demo] : own;
}
/** Fill a demo series with the creator's real videos so its page is never empty. */
async function fillDemo(s: State, row: SeriesRow): Promise<SeriesRow> {
  if (row.id <= DEMO_SERIES_BASE || row.episode_ids.length >= 3) return row;
  const list = await userPosts(row.creator_id);
  const ids = s.demoEpisodes[String(row.creator_id)] ?? [];
  for (const p of list) { if (ids.length >= 5) break; if (!ids.includes(p.id) && !s.subsOnly.includes(p.id) && p.id % 4 !== 1) ids.push(p.id); }
  s.demoEpisodes[String(row.creator_id)] = ids;
  save(s);
  return { ...row, episode_ids: ids };
}

function canWatchEpisode(s: State, row: SeriesRow, idx: number, postId: number, viewer: number | null, mode: string): boolean {
  if (viewer === row.creator_id) return true;
  if (row.pricing === "free") return true;
  if (idx === 0 && row.first_episode_free) return true;
  if (!viewer) return false;
  if ((s.ownedSeries[String(viewer)] ?? []).includes(row.id)) return true;
  if ((s.ownedEpisodes[String(viewer)] ?? []).includes(postId)) return true;
  if (row.free_for_subscribers && paidUp(subOf(s, viewer, row.creator_id)) && planOf(s, row.creator_id, viewer, mode)?.perks.series) return true;
  return false;
}
function seriesLockInfo(row: SeriesRow) {
  return { id: row.id, title: row.title, pricing: row.pricing, series_price_bbs: row.series_price_bbs, episode_price_bbs: row.episode_price_bbs,
    first_episode_free: row.first_episode_free, free_for_subscribers: row.free_for_subscribers, episodes_count: row.episode_ids.length };
}

function decorateOne<T extends Post>(s: State, p: T, viewer: number | null, mode: string): T {
  const c = Number(p.user_id);
  if (p.video) known[p.id] = { ...(known[p.id] ?? {}), ...p };
  else if (known[p.id]?.video) p = { ...p, video: known[p.id].video } as T;
  if (p.user) users[c] = p.user;
  const own = viewer !== null && c === viewer;
  let out: T = { ...p, locked: null, series_info: null };

  // Which series is it in?
  let row = s.series.find((x) => !s.deletedSeries.includes(x.id) && x.episode_ids.includes(p.id)) ?? null;
  if (!row && mode.includes("demo") && !own) {
    const demo = demoSeries(s, c, mode);
    if (demo) {
      const ids = s.demoEpisodes[String(c)] ?? [];
      if (!ids.includes(p.id) && (p.id % 4 === 2 || p.id % 4 === 3) && !s.subsOnly.includes(p.id)) { ids.push(p.id); s.demoEpisodes[String(c)] = ids; save(s); }
      if (ids.includes(p.id)) row = { ...demo, episode_ids: ids };
    }
  }
  if (row) {
    const idx = row.episode_ids.indexOf(p.id);
    out = { ...out, series_info: { id: row.id, title: row.title, episode_no: idx + 1, episodes_count: row.episode_ids.length } };
    if (!canWatchEpisode(s, row, idx, p.id, viewer, mode)) {
      const lock: PostLock = { reason: "series", creator_id: c, series: seriesLockInfo(row), episode_no: idx + 1 };
      return { ...out, video: "", locked: lock };
    }
    return out;
  }

  const subsOnly = s.subsOnly.includes(p.id) || (mode.includes("demo") && !own && p.id % 4 === 1);
  if (subsOnly && !own) {
    const plan = planOf(s, c, viewer, mode);
    if (plan && plan.is_active && !paidUp(subOf(s, viewer, c))) {
      return { ...out, video: "", locked: { reason: "subscribers", creator_id: c, sub_price_bbs: plan.price_bbs } };
    }
  }
  return out;
}

export function decorateCreatorPosts<T extends Post>(posts: T[], viewer: number | null, mode: string): T[] {
  const s = load();
  return posts.map((p) => (p && p.id ? decorateOne(s, p, viewer, mode) : p));
}

async function seriesJson(s: State, row: SeriesRow, viewer: number | null, mode: string, withEpisodes: boolean): Promise<Series> {
  const r = await fillDemo(s, row);
  const owned = !!viewer && (s.ownedSeries[String(viewer)] ?? []).includes(r.id);
  const out: Series = {
    id: r.id, title: r.title, description: r.description, cover: coverUrl(r.cover) || null, pricing: r.pricing,
    series_price_bbs: r.series_price_bbs, episode_price_bbs: r.episode_price_bbs, first_episode_free: r.first_episode_free,
    free_for_subscribers: r.free_for_subscribers, episodes_count: r.episode_ids.length, buyers_count: r.buyers_count,
    creator_id: r.creator_id, owned, creator: await userOf(r.creator_id),
    owned_episode_ids: viewer ? (s.ownedEpisodes[String(viewer)] ?? []).filter((id) => r.episode_ids.includes(id)) : [],
    is_subscribed: paidUp(subOf(s, viewer, r.creator_id)),
  };
  const first = r.episode_ids[0] ? await realPost(r.episode_ids[0]) : null;
  out.first_thumbnail = first?.thumbnail ?? null;
  if (withEpisodes) {
    const eps: Post[] = [];
    for (const id of r.episode_ids) { const p = await realPost(id); if (p) eps.push(p); }
    out.episodes = decorateCreatorPosts(eps, viewer, mode);
  }
  return out;
}

// ---- Uploads -------------------------------------------------------------------------------------

function unixOf(v: unknown): number {
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return n;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? 0 : Math.floor(d.getTime() / 1000);
}
function scheduleRefusal(unix: number): string {
  const now = Date.now() / 1000;
  if (!unix) return "Pick a date and time.";
  if (unix < now + 5 * 60 - 5) return "Pick a time at least 5 minutes from now.";
  if (unix > now + 60 * 86400) return "You can schedule up to 60 days ahead.";
  return "";
}

export async function mockCreatorUpload(params: Record<string, unknown>, mode: string): Promise<ApiResponse<unknown>> {
  await wait(250);
  const s = load();
  const uid = Number(params.user_id);
  if (Number(params.subscribers_only) === 1) {
    const plan = planOf(s, uid, uid, mode);
    if (!plan || !plan.is_active) return fail("Set up your subscription first (price and what subscribers get), then post subscriber-only videos.", "no_plan");
  }
  let row: SeriesRow | null = null;
  if (params.series_id) {
    row = s.series.find((x) => x.id === Number(params.series_id) && x.creator_id === uid && !s.deletedSeries.includes(x.id)) ?? null;
    if (!row) return fail("That series isn't one of yours.");
  }
  if (params.scheduled_at !== undefined && params.scheduled_at !== "") {
    const unix = unixOf(params.scheduled_at);
    const why = scheduleRefusal(unix);
    if (why) return fail(why);
    const m = await import("./socialMock");
    const thumb = m.mockFileUrl(params.thumbnail);
    const sched: Sched = { id: 950_000_000 + s.seq++, user_id: uid, thumbnail_url: thumb, description: String(params.description ?? ""),
      publish_at: utc(new Date(unix * 1000)), status: "pending", error: null };
    s.scheduled.push(sched);
    save(s);
    return { status: true, scheduled: true, scheduled_id: sched.id, publish_at: sched.publish_at, message: "Scheduled (dev mock — nothing was sent)" };
  }
  const m = await import("./socialMock");
  const r = await m.mockSocialCall<unknown>("uploadPost", params, "");
  const postId = Number((r as { post_id?: unknown }).post_id ?? 0);
  if (r.status && postId) {
    const s2 = load();
    if (Number(params.subscribers_only) === 1) s2.subsOnly.push(postId);
    if (row) { const live = s2.series.find((x) => x.id === row!.id); live?.episode_ids.push(postId); }
    save(s2);
  }
  return r;
}

// ---- The calls -----------------------------------------------------------------------------------

export async function mockCreatorCall<T>(endpoint: string, params: Record<string, unknown>, viewer: number | null, mode: string): Promise<ApiResponse<T>> {
  await wait(180);
  const s = load();
  const me = Number(params.my_user_id ?? 0) || null;
  const needMe = (): ApiResponse<T> | null => (me ? null : fail("Please sign in again."));

  switch (endpoint) {
    case "fetchCreatorOptions":
      return ok({ sub_prices: SUB_PRICES, series_prices: SERIES_PRICES, episode_prices: EPISODE_PRICES, perks: PERKS, max_extra_perks: 5, schedule_min_minutes: 5, schedule_max_days: 60 } as T);

    case "saveCreatorPlan": {
      const bad = needMe(); if (bad) return bad;
      const price = Number(params.price_bbs);
      if (!SUB_PRICES.includes(price)) return fail("Pick one of the prices.");
      const perks = normalisePerks(params.perks);
      const extra = String(params.extra_perks ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
      if (extra.length > 5) return fail("Up to 5 of your own perks.");
      if (extra.some((x) => x.length > 80)) return fail("Each perk can be at most 80 characters.");
      if (!Object.values(perks).some(Boolean) && !extra.length) return fail("Turn on at least one perk or write one of your own.");
      const welcome = String(params.welcome_message ?? "").trim();
      if (welcome.length > 300) return fail("The welcome message can be at most 300 characters.");
      s.plans[String(me)] = { price_bbs: price, is_active: Number(params.is_active) ? 1 : 0, perks, extra_perks: extra, welcome_message: welcome };
      save(s);
      const p = s.plans[String(me)];
      return ok({ creator_id: me, ...p, subscribers_count: 12 } as T, { message: "Saved (dev mock — nothing was sent)" });
    }

    case "fetchCreatorPlan": {
      const c = Number(params.creator_id);
      const isMe = viewer === c;
      const p = planOf(s, c, viewer, mode);
      const plan = p && (p.is_active || isMe) ? { creator_id: c, ...p, subscribers_count: isMe ? 12 : 40 + (c % 50) } : null;
      const series = await Promise.all(seriesOfCreator(s, c, viewer, mode).map((r) => seriesJson(s, r, viewer, mode, false)));
      const sub = subOf(s, viewer, c);
      return ok({ plan, series, my_subscription: sub ? subJson(sub) : null, is_me: isMe } as T);
    }

    case "subscribeToCreator": {
      const bad = needMe(); if (bad) return bad;
      const c = Number(params.creator_id);
      if (c === me) return fail("You can't subscribe to yourself.");
      const plan = planOf(s, c, me, mode);
      if (!plan || !plan.is_active) return fail("This member isn't offering subscriptions right now.");
      const cur = subOf(s, me, c);
      if (cur && paidUp(cur) && cur.renews) return fail("You're already subscribed.", "already_subscribed");
      if (cur && paidUp(cur) && !cur.renews) {
        s.subs[`${me}:${c}`] = { ...cur, status: "active", renews: 1 };
        save(s);
        return ok(subJson(s.subs[`${me}:${c}`]) as T, { message: "Your subscription will renew again each month.", charged_bbs: 0, welcome_message: plan.welcome_message });
      }
      const refused = charge(s, me!, mode, plan.price_bbs);
      if (refused) return refused as ApiResponse<T>;
      const now = new Date();
      s.subs[`${me}:${c}`] = { creator_id: c, status: "active", price_bbs: plan.price_bbs, started_at: utc(now), current_period_end: utc(new Date(now.getTime() + 30 * DAY)), renews: 1, creator: await userOf(c) };
      save(s);
      return ok(subJson(s.subs[`${me}:${c}`]) as T, { message: `Subscribed! ${plan.price_bbs} BBs (dev mock — nothing was charged)`, charged_bbs: plan.price_bbs, welcome_message: plan.welcome_message });
    }

    case "cancelSubscription": {
      const bad = needMe(); if (bad) return bad;
      const c = Number(params.creator_id);
      const cur = subOf(s, me, c);
      if (!cur || !paidUp(cur)) return fail("You're not subscribed.");
      s.subs[`${me}:${c}`] = { ...cur, status: "cancelled", renews: 0 };
      save(s);
      const end = new Date(cur.current_period_end.replace(" ", "T") + "Z").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
      return ok(null as T, { message: `Cancelled. You keep everything until ${end}.` });
    }

    case "fetchMySubscriptions": {
      const bad = needMe(); if (bad) return bad;
      const rows = [];
      for (const [k, row] of Object.entries(s.subs)) {
        if (!k.startsWith(`${me}:`)) continue;
        const cur = subOf(s, me, row.creator_id)!;
        rows.push({ creator: row.creator ?? await userOf(row.creator_id), status: cur.status, price_bbs: cur.price_bbs, current_period_end: cur.current_period_end, is_paid_up: paidUp(cur), renews: !!cur.renews });
      }
      return ok(rows as T);
    }

    case "fetchMySubscribers": {
      const bad = needMe(); if (bad) return bad;
      const plan = s.plans[String(me)];
      if (!plan) return ok([] as T, { totals: { subscribers: 0, bbs_this_month: 0, bbs_all_time: 0, subscription_bbs_this_month: 0, series_bbs_this_month: 0 } });
      const people = (await feedPool()).map((p) => p.user!).filter((u, i, a) => u && u.id !== me && a.findIndex((x) => x.id === u.id) === i).slice(0, 6);
      const rows = people.map((u, i) => ({
        subscriber: u, status: i === 4 ? "cancelled" : "active", price_bbs: plan.price_bbs,
        started_at: utc(new Date(Date.now() - (i * 9 + 3) * DAY)), current_period_end: utc(new Date(Date.now() + (27 - i * 4) * DAY)), renews: i !== 4,
      }));
      const subsMonth = rows.length * plan.price_bbs;
      return ok(rows as T, { totals: { subscribers: rows.filter((r) => r.status === "active").length, bbs_this_month: subsMonth + 297, bbs_all_time: subsMonth * 3 + 1290, subscription_bbs_this_month: subsMonth, series_bbs_this_month: 297 } });
    }

    case "fetchSubscriberBadges": {
      const c = Number(params.creator_id);
      const plan = planOf(s, c, viewer, mode);
      if (!plan || !plan.perks.badge) return ok([] as T);
      const ids = String(params.user_ids ?? "").split(",").map(Number).filter(Boolean);
      return ok(ids.filter((id) => paidUp(subOf(s, id, c)) || (mode.includes("demo") && id % 3 === 0 && id !== c)) as T);
    }

    case "createSeries":
    case "editSeries": {
      const bad = needMe(); if (bad) return bad;
      const title = String(params.title ?? "").trim();
      if (!title) return fail("Give your series a title.");
      if (title.length > 80) return fail("A title can be at most 80 characters.");
      const description = String(params.description ?? "").trim();
      if (description.length > 500) return fail("A description can be at most 500 characters.");
      const pricing = String(params.pricing) as Pricing;
      if (!["series", "episode", "both", "free"].includes(pricing)) return fail("Choose how the series is sold.");
      const sp = params.series_price_bbs ? Number(params.series_price_bbs) : null;
      const ep = params.episode_price_bbs ? Number(params.episode_price_bbs) : null;
      if ((pricing === "series" || pricing === "both") && !SERIES_PRICES.includes(sp ?? 0)) return fail("Pick a price for the whole series.");
      if ((pricing === "episode" || pricing === "both") && !EPISODE_PRICES.includes(ep ?? 0)) return fail("Pick a price per episode.");
      const fields = {
        title, description, pricing,
        series_price_bbs: pricing === "series" || pricing === "both" ? sp : null,
        episode_price_bbs: pricing === "episode" || pricing === "both" ? ep : null,
        first_episode_free: Number(params.first_episode_free ?? 1) ? 1 : 0, free_for_subscribers: Number(params.free_for_subscribers ?? 0) ? 1 : 0,
      };
      let row: SeriesRow;
      if (endpoint === "createSeries") {
        row = { id: 960_000_000 + s.seq++, creator_id: me!, cover: String(params.cover ?? ""), episode_ids: [], buyers_count: 0, ...fields };
        s.series.push(row);
      } else {
        const cur = s.series.find((x) => x.id === Number(params.series_id) && x.creator_id === me);
        if (!cur) return fail("That series isn't one of yours.");
        Object.assign(cur, fields, params.cover ? { cover: String(params.cover) } : {});
        row = cur;
      }
      save(s);
      return ok(await seriesJson(s, row, me, mode, false) as T, { message: endpoint === "createSeries" ? "Series created (dev mock — nothing was sent)" : "Saved (dev mock — nothing was sent)" });
    }

    case "deleteSeries": {
      const bad = needMe(); if (bad) return bad;
      const id = Number(params.series_id);
      const row = s.series.find((x) => x.id === id && x.creator_id === me);
      if (!row) return fail("That series isn't one of yours.");
      s.deletedSeries.push(id);
      save(s);
      return ok(null as T, { message: "Series deleted. Its episodes are ordinary free videos now." });
    }

    case "fetchUserSeries": {
      const c = Number(params.creator_id);
      return ok(await Promise.all(seriesOfCreator(s, c, viewer, mode).map((r) => seriesJson(s, r, viewer, mode, false))) as T);
    }

    case "fetchSeries": {
      const row = seriesById(s, Number(params.series_id), mode);
      if (!row) return fail("That series isn't available.");
      return ok(await seriesJson(s, row, viewer, mode, true) as T);
    }

    case "buySeries": {
      const bad = needMe(); if (bad) return bad;
      const row0 = seriesById(s, Number(params.series_id), mode);
      if (!row0) return fail("That series isn't available.");
      const row = await fillDemo(s, row0);
      const postId = Number(params.post_id ?? 0);
      const ownedS = s.ownedSeries[String(me)] ?? [];
      const ownedE = s.ownedEpisodes[String(me)] ?? [];
      if (ownedS.includes(row.id)) return fail("You already own this series.", "already_owned");
      let price: number;
      if (postId) {
        if (row.pricing !== "episode" && row.pricing !== "both") return fail("This series is sold as a whole.");
        if (!row.episode_ids.includes(postId)) return fail("That video isn't in this series.");
        if (ownedE.includes(postId)) return fail("You already own this episode.", "already_owned");
        price = row.episode_price_bbs ?? 0;
      } else {
        if (row.pricing !== "series" && row.pricing !== "both") return fail("This series is sold per episode.");
        price = row.series_price_bbs ?? 0;
      }
      const refused = charge(s, me!, mode, price);
      if (refused) return refused as ApiResponse<T>;
      if (postId) s.ownedEpisodes[String(me)] = [...ownedE, postId];
      else s.ownedSeries[String(me)] = [...ownedS, row.id];
      save(s);
      return ok(await seriesJson(s, row, me, mode, false) as T, { message: `${postId ? "Episode unlocked" : "Series unlocked"} — ${price} BBs (dev mock — nothing was charged)`, charged_bbs: price });
    }

    case "fetchMyScheduledPosts": {
      const bad = needMe(); if (bad) return bad;
      if (mode.includes("demo") && !s.seededScheduled.includes(me!)) {
        const thumbs = (await feedPool()).slice(0, 2).map((p) => String(p.thumbnail ?? ""));
        const base = new Date(); base.setMinutes(0, 0, 0);
        s.scheduled.push(
          { id: 950_000_000 + s.seq++, user_id: me!, thumbnail_url: thumbs[0] ?? "", description: "My new dance — part 2", publish_at: utc(new Date(base.getTime() + DAY + 3600_000 * 2)), status: "pending", error: null },
          { id: 950_000_000 + s.seq++, user_id: me!, thumbnail_url: thumbs[1] ?? "", description: "Cooking adobo with Lola", publish_at: utc(new Date(base.getTime() - 3600_000)), status: "failed", error: "The video could not be processed. Please upload it again." },
        );
        s.seededScheduled.push(me!);
        save(s);
      }
      const rows = s.scheduled.filter((x) => x.user_id === me).sort((a, b) => a.publish_at.localeCompare(b.publish_at))
        .map((x) => ({ id: x.id, thumbnail: x.thumbnail_url, thumbnail_url: x.thumbnail_url, description: x.description, publish_at: x.publish_at, status: x.status, error: x.error }));
      return ok(rows as T);
    }

    case "rescheduleScheduledPost": {
      const bad = needMe(); if (bad) return bad;
      const row = s.scheduled.find((x) => x.id === Number(params.scheduled_id) && x.user_id === me);
      if (!row) return fail("That scheduled video isn't there any more.");
      const unix = unixOf(params.publish_at);
      const why = scheduleRefusal(unix);
      if (why) return fail(why);
      row.publish_at = utc(new Date(unix * 1000));
      row.status = "pending"; row.error = null;
      save(s);
      return ok(null as T, { message: "Time changed." });
    }

    case "cancelScheduledPost": {
      const bad = needMe(); if (bad) return bad;
      const before = s.scheduled.length;
      s.scheduled = s.scheduled.filter((x) => !(x.id === Number(params.scheduled_id) && x.user_id === me));
      if (s.scheduled.length === before) return fail("That scheduled video isn't there any more.");
      save(s);
      return ok(null as T, { message: "Cancelled. It won't be posted." });
    }

    case "setLiveSubscribersOnly": {
      const bad = needMe(); if (bad) return bad;
      const room = String(params.room_name ?? "");
      const plan = s.plans[String(me)];
      if (!plan || !plan.is_active || !plan.perks.lives) return fail("Turn on \"Subscriber-only lives\" in My Subscription first.", "no_lives_perk");
      s.liveSubsOnly = s.liveSubsOnly.filter((x) => x !== room);
      if (Number(params.on)) s.liveSubsOnly.push(room);
      save(s);
      return ok(null as T, { message: Number(params.on) ? "Only your subscribers can join now." : "Everyone can join now.", on: Number(params.on) ? 1 : 0 });
    }

    case "checkLiveAccess": {
      const room = String(params.room_name ?? "");
      const host = Number(room.match(/^bb-(?:live|priv)-(\d+)-\d+$/)?.[1] ?? 0);
      if (!host || host === viewer) return { status: true, allowed: true } as ApiResponse<T>;
      const plan = planOf(s, host, viewer, mode);
      const gated = s.liveSubsOnly.includes(room) || (mode.includes("lives") && !!plan?.perks.lives);
      if (!gated || !plan || paidUp(subOf(s, viewer, host))) return { status: true, allowed: true } as ApiResponse<T>;
      return { status: true, allowed: false, reason: "subscribers", creator_id: host, sub_price_bbs: plan.price_bbs, message: "This live is for subscribers only." } as ApiResponse<T>;
    }
  }
  return fail(`(dev mock) ${endpoint} is not mocked`);
}
