// "Country you're from" (Steve, 2026-11-23: "What Country you live in and what country are you
// from. So these members can participate in the country battles in both countries." Then: "let
// them battle for both countries at the same time"). tbl_users.from_country — null = the same as
// where they live. The server is the authority on both countries: every Join button follows its
// my_countries / is_my_country, never the profile's single country.
//
// fetchFromCountry / setFromCountry may not be deployed yet: any error, a missing `asked`, or
// reason "not_ready" means "no answer" — no sheet, no row, nothing breaks.
import { post } from "./api";
import { flag } from "./countryBattle";

export interface FromCountry {
  country: string | null;
  from_country: string | null;
  asked: boolean;
  can_change: boolean;
  can_change_at: string | null;
  countries: string[];
}

function clean(d: Partial<FromCountry> | null | undefined): FromCountry | null {
  if (!d || typeof d !== "object" || !("asked" in d)) return null;
  return {
    country: d.country || null,
    from_country: d.from_country || null,
    asked: flag(d.asked),
    can_change: d.can_change === undefined ? true : flag(d.can_change),
    can_change_at: d.can_change_at || null,
    countries: Array.isArray(d.countries) ? d.countries.filter((c): c is string => typeof c === "string" && !!c) : [],
  };
}

/** null = can't tell (signed out, not deployed, any error). */
export async function fetchFromCountry(userId: number): Promise<FromCountry | null> {
  if (!userId) return null;
  const res = await post<FromCountry>("fetchFromCountry", { user_id: userId }).catch(() => null);
  return res?.status ? clean(res.data) : null;
}

export type SetFromResult = { ok: true; data: FromCountry | null } | { ok: false; reason: string; message: string; data: FromCountry | null };

/** "" = "Same as where I live". Reasons: too_soon (data.can_change_at), unknown_country, not_ready. */
export async function setFromCountry(userId: number, fromCountry: string): Promise<SetFromResult> {
  const res = await post<FromCountry>("setFromCountry", { user_id: userId, from_country: fromCountry }).catch(() => null);
  const data = clean(res?.data);
  if (res?.status) {
    askCache.delete(userId);
    return { ok: true, data };
  }
  return { ok: false, reason: typeof res?.reason === "string" ? res.reason : "", message: res?.message ?? "", data };
}

// ---- the one-time question ---------------------------------------------------------------------
// Asked when a Country Battle page or the Country Board opens and the member never answered.
// "Not now" just closes: asked again on the next app start (a page load), not on every screen.
const askCache = new Map<number, Promise<FromCountry | null>>();
let notNow = false;

export function fromCountryAskData(userId: number): Promise<FromCountry | null> {
  if (!userId) return Promise.resolve(null);
  let p = askCache.get(userId);
  if (!p) {
    p = fetchFromCountry(userId);
    askCache.set(userId, p);
  }
  return p;
}
export const fromCountryNotNow = () => { notNow = true; };
export const fromCountryDismissed = () => notNow;

/** "You can change this on Dec 23, 2026". */
export function fromCountryDate(iso: string | null | undefined): string {
  const d = new Date(iso ?? "");
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Same country, any spelling of case/space. */
export const sameCountry = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** The countries the member may battle for: the server's my_countries, else the old single rule. */
export function myBattleCountries(serverList: unknown, fallback: string | null | undefined): string[] {
  const list = Array.isArray(serverList) ? serverList.filter((c): c is string => typeof c === "string" && !!c.trim()) : [];
  return list.length ? list : fallback ? [fallback] : [];
}

/** Dev-only sample for the screenshot check (?from_demo=1 under `vite`): never asked yet. */
export function demoFromCountry(): FromCountry {
  return {
    country: "United States", from_country: null, asked: false, can_change: true, can_change_at: null,
    countries: ["Philippines", "United States", "Canada", "United Kingdom", "Indonesia", "India", "Japan", "Mexico", "Nepal", "Australia"],
  };
}
