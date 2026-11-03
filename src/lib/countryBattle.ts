// Country Battle v2 (Steve, 2026-11-03): "New Country Battle. Remove all the schedule from the
// country battle. We will have one 10 minutes country battle once a day every day seven days a
// week, in Philippines it will be 8 pm. We will have a lifetime Bragging rights battle board, for
// every day, and we will show the top 100 with the most score daily. Everything else will be the
// same as chat battle."
//
// The wire contract (scratchpad country_battle_v2_api.md) and nothing more. The server is the
// authority for every rule and every time — the schedule, who may join, the cap, the score, the
// badges. One id per battle: `day_id` (a "day" IS one country's one battle). The v1 weekly calls
// (fetchCountryBattleStatus, joinCountryBattle, countryBattleHeartbeat, ...) are retired: never call them.
//
// Never send an empty POST body (the LiteSpeed WAF 403s it) — every call carries user_id.
import { useEffect, useState } from "react";
import { post, type ApiResponse } from "./api";
import { useSession } from "./session";
import type { StringKey } from "./i18n";
import type { ChbBattler, ChbGiftInfo, ChbPerson, ChbResult, ChbState } from "./chatBattle";

/** The grid's three layouts, named after v1's days: "sunday" 6 tiles 2 across, "saturday" 12 and
 *  "weekday" 24, 4 across. Both battles pick one by how many are live (chatBattleStage). */
export type CbStage = "weekday" | "saturday" | "sunday";

/** The grid for a layout. */
export function gridShape(stage: CbStage): { cap: number; cols: number } {
  if (stage === "sunday") return { cap: 6, cols: 2 };
  if (stage === "saturday") return { cap: 12, cols: 4 };
  return { cap: 24, cols: 4 };
}

/** A 0/1, "0"/"1" or boolean flag off the wire. */
export const flag = (v: unknown): boolean => v === true || v === 1 || v === "1" || v === "true";

// ---- the server clock ---------------------------------------------------------------------
// Every countdown runs off the SERVER's clock: a phone whose clock is two minutes out would
// otherwise show "Starts in 0:00" while the room is still shut. The offset is measured from
// server_now on each answer and shared by every screen.
let clockOffset = 0;
export function noteServerNow(serverNow?: string | null) {
  if (!serverNow) return;
  const t = Date.parse(serverNow);
  if (!Number.isNaN(t)) clockOffset = t - Date.now();
}
export const serverNow = (): number => Date.now() + clockOffset;

/** Re-render once a second (countdowns). */
export function useTick(ms = 1000): number {
  const [n, setN] = useState(() => serverNow());
  useEffect(() => {
    const t = setInterval(() => setN(serverNow()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return n;
}

/** 75 s -> "1:15", 3725 s -> "1:02:05". */
export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** The cb_ strings carry {n} {time} {country} {date} tokens (shared with the phones). */
export function cbText(raw: string, vars: Record<string, string | number> = {}): string {
  return raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** "8:00 PM" in the viewer's own clock, from an ISO time. */
export function localTime(iso: string | null | undefined): string {
  const d = new Date(iso ?? "");
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// ---- the shapes -----------------------------------------------------------------------------

export type CbDayPhase = "upcoming" | "joining" | "battle" | "ended";

export interface CbTopRow extends ChbPerson { place: number; score: number }

export interface CbDayMe {
  user_id: number;
  is_battler: boolean;
  is_live: boolean;
  left: boolean;
  score: number | null;
  rank: number | null;
  home_room_name: string | null;
  can_join: boolean;
  join_reason: string | null;
}

/** countryBattleDayHeartbeat's `data` (§5) — the Chat Battle state shape plus the day. */
export interface CbDayState {
  day_id: number;
  country: string;
  date: string;
  date_label: string;
  name: string;
  is_test: boolean;
  phase: CbDayPhase;
  server_now: string;
  opens_at: string;
  starts_at: string;
  ends_at: string;
  phase_ends_at: string | null;
  timezone?: string;
  start_time?: string;
  duration_minutes?: number;
  room_name: string | null;
  room_open: boolean;
  max_battlers: number;
  battler_count: number;
  live_count: number;
  spaces_left: number;
  can_join_now: boolean;
  battlers: (ChbPerson & { score: number; rank: number; is_live: boolean; left: boolean; home_room_name: string | null; chat_room_name: string | null })[];
  live: number[];
  finished: boolean;
  top3: CbTopRow[];
  winner: CbTopRow | null;
  me: CbDayMe;
}

export interface CbCountry { country: string; timezone: string; start_time: string; duration_minutes: number }

export interface CbLastDay {
  day_id: number;
  date: string;
  date_label: string;
  participants: number;
  is_test: boolean;
  top3: CbTopRow[];
}

/** fetchCountryBattleDaily's `data` (§3). */
export interface CbDaily {
  enabled: boolean;
  country: string | null;
  countries: CbCountry[];
  battle: CbDayState | null;
  next_starts_at: string | null;
  last: CbLastDay | null;
  server_now: string;
  me: {
    user_id: number;
    country: string | null;
    is_tester: boolean;
    reminders_on: boolean;
    badges: CbBadgeCounts;
  } | null;
}

export interface CbBadgeCounts { first: number; second: number; third: number }

/** One daily badge off the user payload (§11), newest first. */
export interface CbBadge {
  place: number;
  country?: string;
  date?: string;
  date_label?: string;
  day_id?: number;
  /** Older payloads; equal to date_label now. */
  month_label?: string;
  battle_id?: number;
}

/** One finished day on the Bragging Rights board (§7). */
export interface CbBoardDay {
  day_id: number;
  country: string;
  date: string;
  date_label: string;
  starts_at: string;
  participants: number;
  is_test: boolean;
  top3: CbTopRow[];
}

export interface CbDayTopRow extends ChbPerson { rank: number; score: number; badge: number | null }

export interface CbDayTop {
  day: { day_id: number; country: string; date: string; date_label: string; starts_at: string; ends_at: string; finished: boolean; participants: number; is_test: boolean };
  rows: CbDayTopRow[];
  me: { rank: number; score: number } | null;
}

export interface CbReminder {
  enabled: boolean;
  country: string | null;
  remind_at_local: string | null;
  timezone: string | null;
  available: boolean;
}

// ---- the calls ------------------------------------------------------------------------------

type Fail = { ok: false; reason: string; message: string; full: boolean };
function fail(res: ApiResponse<unknown> | null): Fail {
  return {
    ok: false,
    reason: typeof res?.reason === "string" ? res.reason : "",
    message: res?.message ?? "",
    full: res?.full === true || res?.reason === "full",
  };
}

const numList = (v: unknown): number[] => (Array.isArray(v) ? v.map(Number).filter((x) => x > 0) : []);

/** Tidy one heartbeat/join state: arrays present, ids numbers. */
function cleanDay(d: CbDayState): CbDayState {
  return {
    ...d,
    is_test: flag(d.is_test),
    battlers: Array.isArray(d.battlers) ? d.battlers : [],
    live: numList(d.live),
    top3: Array.isArray(d.top3) ? d.top3 : [],
    me: d.me ?? { user_id: 0, is_battler: false, is_live: false, left: false, score: null, rank: null, home_room_name: null, can_join: false, join_reason: null },
  };
}

/** A day in the Chat Battle state shape, so the one shared battle screen runs both battles. No
 *  starter, never a tie (ties go to whoever reached the score first). */
export function dayAsBattleState(d: CbDayState): ChbState {
  return {
    contest_id: d.day_id,
    // The header already says "Country Battle": under it, which country and which day.
    name: [d.country, d.date_label].filter(Boolean).join(" · ") || d.name,
    shared: true,
    phase: d.phase,
    server_now: d.server_now,
    created_at: d.opens_at,
    starts_at: d.starts_at,
    ends_at: d.ends_at,
    phase_ends_at: d.phase_ends_at,
    room_name: d.room_name,
    room_open: d.room_open,
    starter: null,
    max_battlers: d.max_battlers,
    battler_count: d.battler_count,
    live_count: d.live_count,
    spaces_left: d.spaces_left,
    can_join_now: d.can_join_now,
    battlers: d.battlers.map((b): ChbBattler => ({ ...b, is_starter: false })),
    live: d.live,
    winner: d.winner,
    tie: false,
    finished: d.finished,
    me: { ...d.me, starter_bonus: null },
    is_test: d.is_test,
    top3: d.top3,
    opens_at: d.opens_at,
  };
}

/** The Country Battle page: switch, countries, today's (or the next) battle, yesterday's top 3. */
export async function fetchCountryBattleDaily(userId: number, country?: string): Promise<CbDaily> {
  const res = await post<CbDaily>("fetchCountryBattleDaily", { user_id: userId, ...(country ? { country } : {}) });
  const d = res.status && res.data ? res.data : null;
  noteServerNow(d?.server_now);
  if (!d) return { enabled: false, country: null, countries: [], battle: null, next_starts_at: null, last: null, server_now: "", me: null };
  return {
    ...d,
    enabled: flag(d.enabled),
    countries: Array.isArray(d.countries) ? d.countries : [],
    battle: d.battle ? cleanDay(d.battle) : null,
    last: d.last ? { ...d.last, top3: Array.isArray(d.last.top3) ? d.last.top3 : [] } : null,
  };
}

/** The 5-second poll (§5). `live` = 1 while this browser is a BATTLER on the battle screen. */
export async function countryBattleDayHeartbeat(userId: number, dayId: number, live: boolean): Promise<ChbResult<CbDayState>> {
  const res = await post<CbDayState>("countryBattleDayHeartbeat", { user_id: userId, day_id: dayId, live: live ? 1 : 0 });
  if (!res.status || !res.data) return fail(res);
  noteServerNow(res.data.server_now);
  return { ok: true, data: cleanDay(res.data) };
}

/** Join, or rejoin, from the lobby until the end (§4). Over the cap: reason "full". */
export async function joinCountryBattleDay(userId: number, dayId: number): Promise<ChbResult<{ room_name: string; rejoined: boolean; state: CbDayState | null }>> {
  const res = await post<{ room_name: string; role?: string; rejoined?: boolean; country_battle?: CbDayState }>("joinCountryBattleDay", { user_id: userId, day_id: dayId });
  if (!res.status || !res.data?.room_name) return fail(res);
  return { ok: true, data: { room_name: res.data.room_name, rejoined: !!res.data.rejoined, state: res.data.country_battle ? cleanDay(res.data.country_battle) : null } };
}

/** Idempotent. Your tile and place go, your score stays (§6). */
export async function leaveCountryBattleDay(userId: number, dayId: number) {
  return post<{ home_room_name?: string | null }>("leaveCountryBattleDay", { user_id: userId, day_id: dayId });
}

/** A gift from a tile's gift box (§10): priced from gift_id on the server (no coins sent). The
 *  answer carries `country_battle_gift` (its cb_gift is published on the room as-is). */
export async function sendCountryBattleDayGift(input: { myId: number; toUserId: number; giftId: number; roomName: string; dayId: number }) {
  return post("sendCoinsToUser", {
    my_user_id: input.myId,
    user_id: input.toUserId,
    gift_id: input.giftId,
    room_name: input.roomName,
    country_battle_day_id: input.dayId,
  });
}

/** The gift details of a confirmed Country Battle gift, or null (not deployed yet / malformed). */
export function countryGiftInfo(res: ApiResponse<unknown>): ChbGiftInfo | null {
  const g = res.status ? res.country_battle_gift : null;
  return g && typeof g === "object" ? (g as ChbGiftInfo) : null;
}

/** The Bragging Rights board: every finished day, newest first, 30 a page (§7). */
export async function fetchCountryBattleDays(userId: number, page = 1, country?: string): Promise<{ enabled: boolean; country: string | null; page: number; has_more: boolean; days: CbBoardDay[] }> {
  const res = await post<{ enabled: boolean; country: string | null; page: number; has_more: boolean; days: CbBoardDay[] }>("fetchCountryBattleDays", {
    user_id: userId, page, ...(country ? { country } : {}),
  });
  const d = res.status && res.data ? res.data : null;
  if (!d) return { enabled: false, country: null, page, has_more: false, days: [] };
  return {
    enabled: flag(d.enabled), country: d.country ?? null, page: Number(d.page) || page, has_more: !!d.has_more,
    days: (Array.isArray(d.days) ? d.days : []).map((x) => ({ ...x, is_test: flag(x.is_test), top3: Array.isArray(x.top3) ? x.top3 : [] })),
  };
}

/** One day's top 100, plus my own rank (§7). */
export async function fetchCountryBattleDayTop(userId: number, dayId: number): Promise<ChbResult<CbDayTop>> {
  const res = await post<CbDayTop>("fetchCountryBattleDayTop", { user_id: userId, day_id: dayId });
  if (!res.status || !res.data?.day) return fail(res);
  return { ok: true, data: { ...res.data, day: { ...res.data.day, is_test: flag(res.data.day.is_test) }, rows: Array.isArray(res.data.rows) ? res.data.rows : [], me: res.data.me ?? null } };
}

/** The Settings toggle "Country Battle reminders" (§8). null = can't tell (signed out, not deployed). */
export async function fetchCountryBattleReminder(userId: number): Promise<CbReminder | null> {
  const res = await post<CbReminder>("fetchCountryBattleReminder", { user_id: userId }).catch(() => null);
  if (!res?.status || !res.data) return null;
  return { ...res.data, enabled: flag(res.data.enabled), available: flag(res.data.available) };
}

export async function setCountryBattleReminder(userId: number, enabled: boolean): Promise<{ ok: boolean; reminder: CbReminder | null; message: string }> {
  const res = await post<CbReminder>("setCountryBattleReminder", { user_id: userId, enabled: enabled ? 1 : 0 }).catch(() => null);
  if (!res?.status || !res.data) return { ok: false, reminder: null, message: res?.message ?? "" };
  return { ok: true, reminder: { ...res.data, enabled: flag(res.data.enabled), available: flag(res.data.available) }, message: res.message ?? "" };
}

// ---- helpers --------------------------------------------------------------------------------

/** The battle screen's URL. `home` pins the battler a viewer followed in; `join` asks the screen
 *  to join (camera + mic) as soon as it opens; `battler` says this browser has already joined. */
export function countryBattlePath(dayId: number, opts: { home?: number | null; join?: boolean; battler?: boolean } = {}): string {
  const q = new URLSearchParams();
  if (opts.home) q.set("home", String(opts.home));
  if (opts.join) q.set("join", "1");
  if (opts.battler) q.set("battler", "1");
  const s = q.toString();
  return `/country-battle/live/${dayId}${s ? `?${s}` : ""}`;
}

/** Why a join (or me.join_reason) was refused, in the member's language (§12). The server's
 *  `reason` is matched as a code; anything else shows the server's own message. */
export function cbReasonText(t: (k: StringKey) => string, reason: string | null | undefined, message?: string | null, country?: string | null): string {
  switch (reason) {
    case "signin": return t("cb_signin");
    case "full": return t("cb2_full");
    case "off": return t("cb_off");
    case "not_found": return t("cb2_over");
    case "ended": return t("cb2_over");
    case "not_live_eligible": return t("cb_not_live_eligible");
    case "not_country": return cbText(t("cb_not_country"), { country: country || "" });
    case "not_open": return t("cb2_not_open");
    case "busy": return t("cb2_busy");
    case "not_set_up": return t("cb_not_set_up");
    case "already_in": return "";
    default: return message || t("cb_off");
  }
}

/** "🥇×2 🥉×5" — the lifetime daily badge counts, zeros left out. */
export function badgeCountsText(c: CbBadgeCounts | null | undefined): string {
  if (!c) return "";
  return [["🥇", c.first], ["🥈", c.second], ["🥉", c.third]]
    .filter(([, n]) => Number(n) > 0).map(([m, n]) => `${m}×${n}`).join(" ");
}

// ---- is the directory tile's battle shown? --------------------------------------------------
// Steve: "Add on/off switch because we will not start this battle until we have a few thousand
// members." True when tbl_settings.country_battle_enabled is 1, or for a tester (the signed-in
// member's own row carries country_battle_tester; if it does not, the daily call answers
// enabled=true for a tester even with the switch off).
let switchRequest: Promise<boolean> | null = null;
const testerRequests = new Map<number, Promise<boolean>>();

export function useCountryBattleVisible(): boolean {
  const { user } = useSession();
  const uid = user?.id ?? 0;
  const tester = flag((user as { country_battle_tester?: unknown } | null)?.country_battle_tester);
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    switchRequest ??= post<{ country_battle_enabled?: number | string }>("fetchSettings", { x: 1 })
      .then((r) => flag(Number(r.data?.country_battle_enabled ?? 0)))
      .catch(() => { switchRequest = null; return false; });
    switchRequest.then(async (enabled) => {
      if (enabled || tester) { if (live) setOn(true); return; }
      if (!uid) { if (live) setOn(false); return; }
      let req = testerRequests.get(uid);
      if (!req) {
        req = fetchCountryBattleDaily(uid).then((s) => s.enabled).catch(() => false);
        testerRequests.set(uid, req);
      }
      const v = await req;
      if (live) setOn(v);
    });
    return () => { live = false; };
  }, [uid, tester]);
  return on;
}
