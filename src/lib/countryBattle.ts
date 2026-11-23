// Country Battle v2 (Steve, 2026-11-03): "New Country Battle. Remove all the schedule from the
// country battle. We will have one 10 minutes country battle once a day every day seven days a
// week, in Philippines it will be 8 pm. We will have a lifetime Bragging rights battle board, for
// every day, and we will show the top 100 with the most score daily. Everything else will be the
// same as chat battle."
//
// Hourly (Steve, 2026-11-19): from Sun Nov 22 2026 00:00 Philippine time the once-a-day 8 PM,
// 10-minute battle is replaced by a 5-minute battle at the top of EVERY local hour, 24 a day; one
// push a day at 7:55 PM local. Same shapes, plus `every_hour: true` on the battle and each country.
// A "day" (day_id) is now one country's one HOURLY battle.
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

/**
 * Country Battle camera tiles from 2 to 24 (Steve, 2026-11-16: "add the camera tiles from 2 to 24
 * on the screen for the country battle"): the grid follows how many have a tile — ≤4 2x2, ≤6 2x3,
 * ≤9 3x3, ≤12 3x4, ≤16 4x4, ≤20 4x5, ≤24 4x6 (the Dog Race shapes; more live = the rotation).
 * Two tiles sit side by side here, not 1x2 as on the phones: web tiles keep a 3:4 shape, so two
 * stacked would each be less than half as big.
 */
export function countShape(n: number): { cap: number; cols: number } {
  if (n <= 1) return { cap: 1, cols: 1 };
  if (n <= 2) return { cap: 2, cols: 2 };
  if (n <= 4) return { cap: 4, cols: 2 };
  if (n <= 6) return { cap: 6, cols: 2 };
  if (n <= 9) return { cap: 9, cols: 3 };
  if (n <= 12) return { cap: 12, cols: 3 };
  if (n <= 16) return { cap: 16, cols: 4 };
  if (n <= 20) return { cap: 20, cols: 4 };
  return { cap: 24, cols: 4 };
}

/**
 * "Please do not leave any empty spot, always give the host a bigger tile if there is room"
 * (Steve, 2026-11-16): the first tile (own / followed host) spans the spots the last row would
 * leave empty — 1 left over: 2 wide, 2: 3 wide, 3: a 2x2 block.
 */
export function hostSpan(n: number, cols: number): { cols: number; rows: number; alone: boolean } {
  const one = { cols: 1, rows: 1, alone: false };
  if (n <= 1 || cols <= 1) return one;
  const rows = Math.ceil(n / cols);
  const empty = cols * rows - n;
  const s = empty === 1 ? { cols: 2, rows: 1 } : empty === 2 && cols >= 3 ? { cols: 3, rows: 1 }
    : empty === 3 && rows >= 2 ? { cols: 2, rows: 2 } : null;
  return s ? { ...s, alone: s.cols >= cols } : one;
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

/** One side of a Rival Battle. */
export interface CbRivalSide { country: string; flag: string; score: number; battlers: number }

/** A Rival Battle (Steve, 2026-11-23: "Find ever country's rival and let's set up a 10 minutes battle in between
 *  their own whole country battle"): two countries in one room; a side's score = what its battlers got. */
export interface CbRival { a: CbRivalSide; b: CbRivalSide; winner: string | null; label: string }

export function rivalOf(v: unknown): CbRival | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const side = (x: unknown): CbRivalSide | null => {
    if (!x || typeof x !== "object") return null;
    const s = x as Record<string, unknown>;
    const country = String(s.country ?? "");
    return country ? { country, flag: String(s.flag ?? ""), score: Number(s.score) || 0, battlers: Number(s.battlers) || 0 } : null;
  };
  const a = side(r.a);
  const b = side(r.b);
  if (!a || !b) return null;
  return { a, b, winner: typeof r.winner === "string" && r.winner ? r.winner : null, label: String(r.label ?? `${a.country} vs ${b.country}`) };
}

/** countryBattleDayHeartbeat's `data` (§5) — the Chat Battle state shape plus the day. */
export interface CbDayState {
  /** "rival" = a Rival Battle, with `rival`. */
  kind?: "country" | "rival";
  rival?: CbRival | null;
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
  /** true once battles run every hour, on the hour (2026-11-19). */
  every_hour?: boolean;
  room_name: string | null;
  room_open: boolean;
  /** null = NO LIMIT (Steve 2026-11-03/04). The server may quietly cap a battle, but it never says so here: only a join answers reason "full". */
  max_battlers: number | null;
  battler_count: number;
  live_count: number;
  /** null = NO LIMIT — show no "places left" / "full" line. */
  spaces_left: number | null;
  unlimited?: boolean;
  can_join_now: boolean;
  battlers: (ChbPerson & { score: number; rank: number; is_live: boolean; left: boolean; home_room_name: string | null; chat_room_name: string | null })[];
  live: number[];
  finished: boolean;
  top3: CbTopRow[];
  winner: CbTopRow | null;
  me: CbDayMe;
}

export interface CbCountry { country: string; timezone: string; start_time: string; duration_minutes: number; every_hour?: boolean }

export interface CbLastDay {
  day_id: number;
  date: string;
  date_label: string;
  participants: number;
  is_test: boolean;
  top3: CbTopRow[];
}

/** A Country VS Country battle this country is in (fetchCountryBattleDaily.rival_battles, Round 4). */
export interface CbRivalCard {
  day_id: number;
  /** "Philippines vs Indonesia". */
  country: string;
  rival: CbRival;
  phase: CbDayPhase;
  opens_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  phase_ends_at: string | null;
  live_count: number;
  room_open: boolean;
  can_watch: boolean;
  can_battle: boolean;
}

function rivalCard(v: unknown): CbRivalCard | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const rival = rivalOf(r.rival);
  const day = Number(r.day_id) || 0;
  if (!rival || !day) return null;
  const s = (x: unknown) => (typeof x === "string" && x ? x : null);
  const phases: CbDayPhase[] = ["upcoming", "joining", "battle", "ended"];
  return {
    day_id: day, country: String(r.country ?? rival.label), rival,
    phase: phases.includes(r.phase as CbDayPhase) ? (r.phase as CbDayPhase) : "upcoming",
    opens_at: s(r.opens_at), starts_at: s(r.starts_at), ends_at: s(r.ends_at), phase_ends_at: s(r.phase_ends_at),
    live_count: Number(r.live_count) || 0, room_open: flag(r.room_open),
    can_watch: r.can_watch === undefined ? true : flag(r.can_watch), can_battle: flag(r.can_battle),
  };
}

/** fetchCountryBattleDaily's `data` (§3). */
export interface CbDaily {
  /** This country's Country VS Country battle(s) — usually one; [] on old servers or a VS page. */
  rival_battles: CbRivalCard[];
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
    rival: rivalOf(d.rival),
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
    unlimited: d.unlimited,
    can_join_now: d.can_join_now,
    battlers: d.battlers.map((b): ChbBattler => ({ ...b, is_starter: false })),
    live: d.live,
    winner: d.winner,
    tie: false,
    finished: d.finished,
    me: { ...d.me, starter_bonus: null },
    rival: d.rival ?? null,
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
  if (!d) return { enabled: false, country: null, countries: [], battle: null, next_starts_at: null, last: null, server_now: "", me: null, rival_battles: [] };
  return {
    ...d,
    rival_battles: (Array.isArray(d.rival_battles) ? (d.rival_battles as unknown[]) : []).map(rivalCard).filter((x): x is CbRivalCard => !!x),
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
export async function joinCountryBattleDay(userId: number, dayId: number, side?: string | null): Promise<ChbResult<{ room_name: string; rejoined: boolean; state: CbDayState | null }>> {
  // `side`: a Rival Battle's country to fight for (only the first join counts).
  const res = await post<{ room_name: string; role?: string; rejoined?: boolean; country_battle?: CbDayState }>("joinCountryBattleDay", { user_id: userId, day_id: dayId, ...(side ? { side } : {}) });
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
export function countryBattlePath(dayId: number, opts: { home?: number | null; join?: boolean; battler?: boolean; side?: string | null } = {}): string {
  const q = new URLSearchParams();
  if (opts.side) q.set("side", opts.side);
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

// ---- "Join the Philippine whole country battle Now" ----------------------------------------
// Steve, 2026-11-20: "We have to make it easier to join the battle ... when they click it, they
// will go right in the battle." fetchCountryBattleJoinNow says whether to show the one-tap button
// (show=false: signed out, or not in a battle country) and whether a join would work right now.
// Every button on screen shares ONE poll: on mount, every 30 s while the tab is visible, and the
// moment the countdown runs out.

export interface CbJoinNow {
  show: boolean;
  joinable: boolean;
  phase: CbDayPhase;
  day_id: number | null;
  room_name: string | null;
  opens_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  country: string;
  country_adjective: string;
  every_hour: boolean;
  duration_minutes: number;
  server_now: string | null;
  is_test: boolean;
  /** Every country running a battle, for the banner's dropdown (Steve, 2026-11-21). */
  countries: { country: string; country_adjective: string; live?: boolean; starts_at?: string | null; ends_at?: string | null }[];
  my_country: string | null;
  /** Both countries the member battles for — where they live and where they're from (2026-11-23).
   *  Missing on an older server: then the single my_country / profile country rule. */
  my_countries?: string[];
  /** Any member battles for any country (Steve, 2026-11-23). */
  anyone_can_battle?: boolean;
}

// The banner's dropdown (Steve, 2026-11-21) used to SAVE the chosen country on the button forever: a
// member who once tapped Nepal kept being sent to Nepal (Steve, 2026-11-22: "I click watch on united
// states" -> the Nepal battle). Now a tap opens that country's battle to watch and nothing is saved,
// so the button is always the member's own country. The old saved choice is wiped here.
try { localStorage.removeItem("cb_join_now_pick"); } catch { /* private window */ }

export async function fetchCountryBattleJoinNow(userId: number): Promise<CbJoinNow | null> {
  const res = await post<CbJoinNow>("fetchCountryBattleJoinNow", { user_id: userId });
  const d = res.status && res.data ? res.data : null;
  if (!d) return null;
  noteServerNow(d.server_now);
  const id = Number(d.day_id);
  return {
    ...d,
    show: flag(d.show),
    joinable: flag(d.joinable),
    every_hour: flag(d.every_hour),
    is_test: flag(d.is_test),
    day_id: Number.isFinite(id) && id > 0 ? id : null,
    country: d.country || "",
    country_adjective: d.country_adjective || d.country || "",
    countries: Array.isArray(d.countries) ? d.countries.filter((c) => c && c.country) : [],
    my_country: d.my_country || null,
    anyone_can_battle: d.anyone_can_battle === true,
    my_countries: Array.isArray(d.my_countries) ? d.my_countries.filter((c) => typeof c === "string" && !!c) : undefined,
  };
}

const joinNowStore = {
  uid: 0,
  value: null as CbJoinNow | null,
  subs: new Set<(v: CbJoinNow | null) => void>(),
  timer: 0 as ReturnType<typeof setInterval> | 0,
  inflight: false,
};

function joinNowSet(v: CbJoinNow | null) {
  joinNowStore.value = v;
  joinNowStore.subs.forEach((f) => f(v));
}

export function refreshCountryBattleJoinNow() {
  const uid = joinNowStore.uid;
  if (!uid) { joinNowSet(null); return; }
  if (joinNowStore.inflight || document.visibilityState !== "visible") return;
  joinNowStore.inflight = true;
  fetchCountryBattleJoinNow(uid)
    .then((v) => { if (joinNowStore.uid === uid) joinNowSet(v); })
    .catch(() => undefined) // a failed poll keeps the last answer; the next one tries again
    .finally(() => { joinNowStore.inflight = false; });
}

const onJoinNowVisible = () => { if (document.visibilityState === "visible") refreshCountryBattleJoinNow(); };

/** The join-now answer for the signed-in member, or null while unknown / signed out. */
export function useCountryBattleJoinNow(): CbJoinNow | null {
  const { user } = useSession();
  const uid = user?.id ?? 0;
  const [v, setV] = useState<CbJoinNow | null>(() => (joinNowStore.uid === uid ? joinNowStore.value : null));
  useEffect(() => {
    if (joinNowStore.uid !== uid) { joinNowStore.uid = uid; joinNowStore.value = null; }
    const s = joinNowStore;
    s.subs.add(setV);
    setV(s.value);
    if (s.subs.size === 1) {
      refreshCountryBattleJoinNow();
      s.timer = setInterval(refreshCountryBattleJoinNow, 30000);
      document.addEventListener("visibilitychange", onJoinNowVisible);
    } else if (!s.value) refreshCountryBattleJoinNow();
    return () => {
      s.subs.delete(setV);
      if (s.subs.size === 0) {
        if (s.timer) clearInterval(s.timer);
        s.timer = 0;
        document.removeEventListener("visibilitychange", onJoinNowVisible);
      }
    };
  }, [uid]);
  return uid ? v : null;
}

/** The pieces of a wait: 23 min 55 s -> { h: 0, m: 23, s: 55 }. */
export function joinNowParts(ms: number): { h: number; m: number; s: number } {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 };
}
