// Build Your Houses (Steve, 2026-11-05: "You are the builder ... every coin you earn will build 1
// part ... You need 60,000 coins to build one house. A block/street has 40 houses.").
//
// The server contract is binggbongg-backend/docs/build_your_houses_contract.md. The house itself is
// drawn by the SHARED renderer in public/houses/house-view.js — the same file the Android and iOS
// apps show in a WebView — so the three platforms can never draw a different house.
import { ApiError, post } from "./api";

export const PARTS_PER_HOUSE = 60000;
export const HOUSES_PER_STREET = 40;

export interface HouseOwner {
  user_id: number;
  fullname?: string;
  username?: string;
  profile_image?: string;
  country?: string | null;
  flag?: string | null;
}

export interface HousePeriod {
  period_key: string;
  coins: number;
  houses: number;
  country_rank: number | null;
  world_rank: number | null;
}

export interface HousesData {
  user: HouseOwner;
  is_me: boolean;
  lifetime_coins: number;
  houses_built: number;
  streets_built: number;
  houses_on_current_street: number;
  houses_per_street: number;
  current_house: {
    number: number;
    stage: string;
    parts_done: number;
    parts_total: number;
    percent: number;
  };
  this_month: HousePeriod;
  this_year: HousePeriod;
  projection?: {
    coins_last_30_days: number;
    coins_per_day: number;
    houses_per_year: number;
    streets_per_year: number;
  };
  recent?: { coins: number; battle_kind: string; at: string }[];
}

export interface BoardRow {
  rank: number;
  user_id: number;
  fullname?: string;
  username?: string;
  profile_image?: string;
  country?: string | null;
  flag?: string | null;
  coins: number;
  houses: number;
  streets: number;
  in_list?: boolean;
}

export interface Board {
  scope: "country" | "world";
  period: "month" | "year";
  period_key: string;
  country: string | null;
  country_flag?: string | null;
  my_country?: string | null;
  total_builders: number;
  data: BoardRow[];
  me: BoardRow | null;
}

/** What the page shows when a call did not give data. "not_ready" covers the weeks before the
 *  server update is deployed (the route 404s) and the minutes before its migration runs. */
export type HousesResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "not_ready" }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function rankOrNull(v: unknown): number | null {
  return v === null || v === undefined || v === "" ? null : num(v);
}

/** Raw Eloquent rows can send numbers as strings (the JSON-string decode trap) — coerce here once. */
function normaliseHouses(d: Record<string, unknown>): HousesData {
  const per = (p: unknown): HousePeriod => {
    const o = (p ?? {}) as Record<string, unknown>;
    return { period_key: String(o.period_key ?? ""), coins: num(o.coins), houses: num(o.houses), country_rank: rankOrNull(o.country_rank), world_rank: rankOrNull(o.world_rank) };
  };
  const ch = (d.current_house ?? {}) as Record<string, unknown>;
  const pr = d.projection as Record<string, unknown> | undefined;
  const u = (d.user ?? {}) as Record<string, unknown>;
  return {
    user: { user_id: num(u.user_id), fullname: u.fullname as string, username: u.username as string, profile_image: u.profile_image as string, country: (u.country as string) ?? null, flag: (u.flag as string) ?? null },
    is_me: d.is_me === true || d.is_me === 1 || d.is_me === "1",
    lifetime_coins: num(d.lifetime_coins),
    houses_built: num(d.houses_built),
    streets_built: num(d.streets_built),
    houses_on_current_street: num(d.houses_on_current_street),
    houses_per_street: num(d.houses_per_street) || HOUSES_PER_STREET,
    current_house: { number: num(ch.number) || 1, stage: String(ch.stage ?? ""), parts_done: num(ch.parts_done), parts_total: num(ch.parts_total) || PARTS_PER_HOUSE, percent: num(ch.percent) },
    this_month: per(d.this_month),
    this_year: per(d.this_year),
    projection: pr ? { coins_last_30_days: num(pr.coins_last_30_days), coins_per_day: num(pr.coins_per_day), houses_per_year: num(pr.houses_per_year), streets_per_year: num(pr.streets_per_year) } : undefined,
    recent: Array.isArray(d.recent) ? (d.recent as Record<string, unknown>[]).map((r) => ({ coins: num(r.coins), battle_kind: String(r.battle_kind ?? ""), at: String(r.at ?? "") })) : undefined,
  };
}

function normaliseRow(r: Record<string, unknown>): BoardRow {
  return { rank: num(r.rank), user_id: num(r.user_id), fullname: r.fullname as string, username: r.username as string, profile_image: r.profile_image as string, country: (r.country as string) ?? null, flag: (r.flag as string) ?? null, coins: num(r.coins), houses: num(r.houses), streets: num(r.streets), in_list: r.in_list === true || r.in_list === 1 };
}

async function call<T>(endpoint: string, params: Record<string, unknown>, map: (r: Record<string, unknown>) => T): Promise<HousesResult<T>> {
  try {
    const res = (await post(endpoint, params)) as Record<string, unknown>;
    if (res && res.status === true) return { kind: "ok", data: map(res) };
    if (res?.reason === "not_ready") return { kind: "not_ready" };
    if (res?.reason === "user_not_found") return { kind: "not_found" };
    return { kind: "error", message: String(res?.message ?? "") };
  } catch (e) {
    // Before the server update is deployed the route does not exist yet: 404 (or 405).
    if (e instanceof ApiError && (e.status === 404 || e.status === 405)) return { kind: "not_ready" };
    return { kind: "error", message: e instanceof Error ? e.message : "" };
  }
}

export function fetchMyHouses(userId: number) {
  return call("fetchMyHouses", { user_id: userId }, (r) => normaliseHouses((r.data ?? {}) as Record<string, unknown>));
}

export function fetchUserHouses(userId: number, myUserId?: number | null) {
  return call("fetchUserHouses", { user_id: userId, my_user_id: myUserId ?? undefined }, (r) => normaliseHouses((r.data ?? {}) as Record<string, unknown>));
}

export function fetchHouseBoards(p: { scope: "country" | "world"; period: "month" | "year"; userId?: number | null; country?: string | null }) {
  return call("fetchHouseBoards", { scope: p.scope, period: p.period, user_id: p.userId ?? undefined, country: p.country ?? undefined }, (r): Board => ({
    scope: (r.scope as Board["scope"]) ?? p.scope,
    period: (r.period as Board["period"]) ?? p.period,
    period_key: String(r.period_key ?? ""),
    country: (r.country as string) ?? null,
    country_flag: (r.country_flag as string) ?? null,
    my_country: (r.my_country as string) ?? null,
    total_builders: num(r.total_builders),
    data: Array.isArray(r.data) ? (r.data as Record<string, unknown>[]).map(normaliseRow) : [],
    me: r.me ? normaliseRow(r.me as Record<string, unknown>) : null,
  }));
}

/* ---------- the shared renderer (public/houses/house-view.js) ---------- */

export interface HouseViewEvent { type: string; partsShown?: number; house?: number; street?: number; fastForward?: boolean }
export interface HouseViewApi {
  init(o: { container: HTMLElement; lang?: string; sound?: boolean; speedPartsPerSec?: number; height?: number; onEvent?: (e: HouseViewEvent) => void }): HouseViewApi;
  setProgress(p: { lifetimeParts: number; lastSeenParts?: number; housesBuilt?: number; streetsBuilt?: number; theme?: number; reset?: boolean }): void;
  setSpeed(n: number): void;
  mute(b: boolean): void;
  toast(t: string): void;
  destroy(): void;
}
declare global {
  interface Window { HouseView?: HouseViewApi }
}

let loading: Promise<HouseViewApi> | null = null;
/** Load /houses/house-view.js once. The server sends it with no-cache (public/.htaccess), so a
 *  fix to the renderer reaches the web on the next visit, like the page shell. */
export function loadHouseView(): Promise<HouseViewApi> {
  if (window.HouseView) return Promise.resolve(window.HouseView);
  if (!loading) {
    loading = new Promise<HouseViewApi>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "/houses/house-view.js";
      s.async = true;
      s.onload = () => (window.HouseView ? resolve(window.HouseView) : reject(new Error("HouseView missing")));
      s.onerror = () => { loading = null; s.remove(); reject(new Error("HouseView failed to load")); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

/** The renderer speaks en / fil / tl / id / es / ar; anything else reads English. */
export function houseViewLang(lang: string): string {
  return ["fil", "tl", "id", "es", "ar"].includes(lang) ? lang : "en";
}

const SEEN_KEY = (userId: number) => `bb.houses.seen.${userId}`;
export function readLastSeen(userId: number): number | undefined {
  try {
    const v = localStorage.getItem(SEEN_KEY(userId));
    if (v === null) return undefined;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  } catch { return undefined; }
}
export function writeLastSeen(userId: number, parts: number) {
  try { localStorage.setItem(SEEN_KEY(userId), String(Math.max(0, Math.floor(parts)))); } catch { /* private mode */ }
}
