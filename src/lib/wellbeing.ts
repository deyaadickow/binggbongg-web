// Safety and wellbeing (Steve, 2026-11-17): "Screen-time limits and reminders. Family Pairing:
// parents link to a teen's account and set limits. Restricted Mode to filter mature content."
//
// Server: binggbongg-backend 8280090, NOT deployed yet. Until it is, the dev server answers every
// one of these endpoints from lib/wellbeingMock.ts (only ever imported under import.meta.env.DEV,
// so it is not in the production build and nothing is written to the live server from dev).
// In production, before deploy, the server answers `code: "not_ready"` (or does not know the
// endpoint at all) — the screens then show a calm "Coming soon" line and the tracker stays quiet.
import { ApiError, post, type ApiResponse, type UserSummary } from "./api";
import { socialMockUser } from "./social";
import { currentUserId } from "./api";

const NEW_ENDPOINTS = new Set([
  "fetchWellbeing", "saveScreenTime", "screenTimePing", "screenTimeUnlock", "setRestrictedMode",
  "familyStatus", "familyCreateCode", "familyJoin", "familySetTeenSettings", "familyRequestUnlink", "familyUnlink",
]);

const MOCK_KEY = "bb.wbMock";

/** Dev server only: `?wbmock=` picks a starting state for the mock — `parent` (two linked teens,
 *  one asking to unlink), `teen` (linked to a parent, limit 60, parent's passcode 1234), `limit`
 *  (own limit 30 min, passcode 1234), `over` (with `limit`/`teen`: today's time already used up),
 *  `fast` (pings every 5 s and the break counter runs 60x), `notready` (the server's "not ready"
 *  answer). Comma-separate them. `?wbmock=0` = a fresh member with nothing set. Always "" in production. */
export function wbMockMode(): string {
  if (!import.meta.env.DEV) return "";
  try {
    const q = new URLSearchParams(window.location.search).get("wbmock");
    if (q !== null) {
      if (q === "0" || q === "") localStorage.removeItem(MOCK_KEY);
      else localStorage.setItem(MOCK_KEY, q);
    }
    return localStorage.getItem(MOCK_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Who these features act for: the signed-in member, or on the dev server the Social mock's pretend member. */
export function wbUserId(): number | null {
  return currentUserId() ?? socialMockUser()?.id ?? null;
}

/** The browser's IANA time zone ("Asia/Manila"), sent on every call so "today" is the member's day. */
export function tz(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
}

export class WellbeingError extends Error {
  code: string;
  constructor(message: string, code = "") { super(message); this.code = code; }
}

async function call<T>(endpoint: string, params: Record<string, unknown>, opts: { keepalive?: boolean } = {}): Promise<T> {
  const me = wbUserId();
  const body = { my_user_id: me, tz: tz(), ...params };
  let r: ApiResponse<T>;
  try {
    if (import.meta.env.DEV && NEW_ENDPOINTS.has(endpoint)) {
      const m = await import("./wellbeingMock");
      r = await m.mockWellbeingCall<T>(endpoint, body, wbMockMode());
    } else {
      r = await post<T>(endpoint, body, opts);
    }
  } catch (e) {
    // An endpoint the live server does not have yet (404/405) or answers with a non-JSON page:
    // the same as "not ready". A real network error keeps its own message.
    if (e instanceof SyntaxError || (e instanceof ApiError && [404, 405].includes(e.status))) throw new WellbeingError("", "not_ready");
    throw new WellbeingError((e as Error).message || "Something went wrong.", "");
  }
  if (!r.status) throw new WellbeingError(r.message ?? "Something went wrong.", String(r.code ?? ""));
  return r.data as T;
}

// ---- Shapes --------------------------------------------------------------------------------------

export type Audience = "everyone" | "friends" | "nobody";

export interface TodayStatus {
  day: string;
  today_minutes: number;
  extra_minutes_today: number;
  minutes_left: number | null;
  over_limit: boolean;
  daily_limit_minutes: number;
  break_every_minutes: number;
  managed_by_parent: boolean;
}

export interface Wellbeing extends TodayStatus {
  has_passcode: boolean;
  restricted_mode: boolean;
  who_can_message: Audience;
  who_can_comment: Audience;
  parent: UserSummary | null;
  limit_options: number[];
  break_options: number[];
  extra_options: number[];
  audiences: Audience[];
}

export interface TeenSettings {
  daily_limit_minutes: number;
  break_every_minutes: number;
  has_passcode: boolean;
  restricted_mode: boolean;
  who_can_message: Audience;
  who_can_comment: Audience;
}

export interface TeenCard {
  user: UserSummary;
  linked_at: string;
  unlink_requested: boolean;
  settings: TeenSettings;
  day: string;
  today_minutes: number;
  extra_minutes_today: number;
  minutes_left: number | null;
  over_limit: boolean;
}

export interface FamilyCode { code: string; qr_text: string; expires_at: string }

export interface FamilyStatus {
  role: "none" | "parent" | "teen";
  parent: UserSummary | null;
  unlink_requested: boolean;
  teens: TeenCard[];
  my_settings: Wellbeing | null;
  active_code: FamilyCode | null;
}

const truthy = (v: unknown) => v === true || v === 1 || v === "1";
const num = (v: unknown, d = 0) => (v === null || v === undefined || v === "" ? d : Number(v) || 0);
const aud = (v: unknown): Audience => (v === "friends" || v === "nobody" ? v : "everyone");
const user = (u: unknown): UserSummary | null => {
  if (!u || typeof u !== "object") return null;
  const o = u as Record<string, unknown>;
  return { ...(o as unknown as UserSummary), id: Number(o.id ?? 0) };
};

function today(d: Record<string, unknown>): TodayStatus {
  return {
    day: String(d.day ?? ""),
    today_minutes: num(d.today_minutes),
    extra_minutes_today: num(d.extra_minutes_today),
    minutes_left: d.minutes_left === null || d.minutes_left === undefined ? null : num(d.minutes_left),
    over_limit: truthy(d.over_limit),
    daily_limit_minutes: num(d.daily_limit_minutes),
    break_every_minutes: num(d.break_every_minutes),
    managed_by_parent: truthy(d.managed_by_parent),
  };
}

const arrNum = (v: unknown, d: number[]) => (Array.isArray(v) && v.length ? v.map((x) => Number(x)) : d);

export function normaliseWellbeing(d: Record<string, unknown>): Wellbeing {
  return {
    ...today(d),
    has_passcode: truthy(d.has_passcode),
    restricted_mode: truthy(d.restricted_mode),
    who_can_message: aud(d.who_can_message),
    who_can_comment: aud(d.who_can_comment),
    parent: user(d.parent),
    limit_options: arrNum(d.limit_options, [0, 30, 45, 60, 90, 120]),
    break_options: arrNum(d.break_options, [0, 10, 20, 30, 60]),
    extra_options: arrNum(d.extra_options, [15, 30, 60]),
    audiences: Array.isArray(d.audiences) && d.audiences.length ? (d.audiences as unknown[]).map(aud) : ["everyone", "friends", "nobody"],
  };
}

function teenCard(d: Record<string, unknown>): TeenCard {
  const s = (d.settings ?? {}) as Record<string, unknown>;
  return {
    user: user(d.user) ?? { id: 0 },
    linked_at: String(d.linked_at ?? ""),
    unlink_requested: truthy(d.unlink_requested),
    settings: {
      daily_limit_minutes: num(s.daily_limit_minutes),
      break_every_minutes: num(s.break_every_minutes),
      has_passcode: truthy(s.has_passcode),
      restricted_mode: truthy(s.restricted_mode),
      who_can_message: aud(s.who_can_message),
      who_can_comment: aud(s.who_can_comment),
    },
    day: String(d.day ?? ""),
    today_minutes: num(d.today_minutes),
    extra_minutes_today: num(d.extra_minutes_today),
    minutes_left: d.minutes_left === null || d.minutes_left === undefined ? null : num(d.minutes_left),
    over_limit: truthy(d.over_limit),
  };
}

// ---- Calls ---------------------------------------------------------------------------------------

type Raw = Record<string, unknown>;

export async function fetchWellbeing(): Promise<Wellbeing> {
  return normaliseWellbeing(await call<Raw>("fetchWellbeing", {}));
}

export async function saveScreenTime(p: { daily_limit_minutes: number; break_every_minutes: number; passcode?: string; current_passcode?: string }): Promise<Wellbeing> {
  return normaliseWellbeing(await call<Raw>("saveScreenTime", p));
}

export async function screenTimePing(seconds: number, opts: { keepalive?: boolean } = {}): Promise<TodayStatus> {
  return today(await call<Raw>("screenTimePing", { seconds: Math.max(0, Math.min(300, Math.round(seconds))) }, opts));
}

export async function screenTimeUnlock(passcode: string, minutes: number): Promise<TodayStatus> {
  return today(await call<Raw>("screenTimeUnlock", { passcode, minutes }));
}

export async function setRestrictedMode(on: boolean, passcode?: string): Promise<Wellbeing> {
  return normaliseWellbeing(await call<Raw>("setRestrictedMode", { on: on ? 1 : 0, ...(passcode ? { passcode } : {}) }));
}

export async function familyStatus(): Promise<FamilyStatus> {
  const d = await call<Raw>("familyStatus", {});
  const role = d.role === "parent" || d.role === "teen" ? d.role : "none";
  const code = d.active_code as Raw | null | undefined;
  return {
    role,
    parent: user(d.parent),
    unlink_requested: truthy(d.unlink_requested),
    teens: Array.isArray(d.teens) ? (d.teens as Raw[]).map(teenCard) : [],
    my_settings: d.my_settings && typeof d.my_settings === "object" ? normaliseWellbeing(d.my_settings as Raw) : null,
    active_code: code && code.code ? { code: String(code.code), qr_text: String(code.qr_text ?? `BBFAMILY:${code.code}`), expires_at: String(code.expires_at ?? "") } : null,
  };
}

export async function familyCreateCode(): Promise<FamilyCode> {
  const d = await call<Raw>("familyCreateCode", {});
  return { code: String(d.code ?? ""), qr_text: String(d.qr_text ?? `BBFAMILY:${d.code}`), expires_at: String(d.expires_at ?? "") };
}

export async function familyJoin(code: string): Promise<UserSummary | null> {
  const d = await call<Raw>("familyJoin", { code });
  return user(d?.parent);
}

export async function familySetTeenSettings(teenId: number, changes: Record<string, unknown>): Promise<TeenCard> {
  return teenCard(await call<Raw>("familySetTeenSettings", { teen_id: teenId, ...changes }));
}

export async function familyRequestUnlink(): Promise<void> {
  await call<Raw>("familyRequestUnlink", {});
}

export async function familyUnlink(teenId: number, keep = false): Promise<void> {
  await call<Raw>("familyUnlink", { teen_id: teenId, ...(keep ? { keep: 1 } : {}) });
}

/** The server's times are UTC "Y-m-d H:i:s" (or ISO). */
export function parseUtc(s: string): number {
  if (!s) return 0;
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(" ", "T")}Z`;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

// ---- One shared "today" status: the tracker and the pages keep it in step ------------------------

type Listener = (s: TodayStatus | null) => void;
let current: TodayStatus | null = null;
const listeners = new Set<Listener>();
export function getTodayStatus(): TodayStatus | null { return current; }
export function publishTodayStatus(s: TodayStatus | null) {
  current = s;
  listeners.forEach((l) => l(s));
}
export function subscribeTodayStatus(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
