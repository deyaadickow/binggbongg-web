// Sunday Battle Bonus (Steve, 2026-11-09): every Sunday, Philippine time, members earn an extra 5%
// on every BATTLE coin they receive ($1.00 per 1,000 coins, no limit). Battles only — no shows, no
// plain live gifts, no video gifts. The server counts the coins and pays the wallet on Monday
// (backend fetchSundayBonus); the web only shows the banner on /battles and the pill in battles.
//
// Any failure (endpoint not deployed yet, 404, offline, signed out) means "no promotion": show
// NOTHING, never an error.
import { useEffect, useState } from "react";
import { post } from "./api";

export interface SundayBonus {
  promotion_on: boolean;
  /** It is a bonus Sunday right now (PH time). */
  today: boolean;
  next_sunday: string | null;
  end_date: string | null;
  percent: number;
  per_1000: number;
  coins_today: number;
  bonus_today: number;
  ends_at: string | null;
}

export async function fetchSundayBonus(userId: number): Promise<SundayBonus | null> {
  try {
    const r = await post<Record<string, unknown>>("fetchSundayBonus", { user_id: userId });
    const d = r.status ? r.data : null;
    if (!d || !d.promotion_on) return null;
    return {
      promotion_on: true,
      today: Boolean(d.today),
      next_sunday: (d.next_sunday as string | null) ?? null,
      end_date: (d.end_date as string | null) ?? null,
      percent: Number(d.percent ?? 5) || 5,
      per_1000: Number(d.per_1000 ?? 1) || 1,
      coins_today: Number(d.coins_today ?? 0) || 0,
      bonus_today: Number(d.bonus_today ?? 0) || 0,
      ends_at: (d.ends_at as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

/** Fetch once, then every `pollMs` while mounted (0 = once). `bump` re-reads now (e.g. a gift arrived). */
export function useSundayBonus(userId: number | null | undefined, pollMs = 0, bump: unknown = 0): SundayBonus | null {
  const [data, setData] = useState<SundayBonus | null>(null);
  useEffect(() => {
    if (!userId) { setData(null); return; }
    let alive = true;
    const load = () => fetchSundayBonus(userId).then((d) => { if (alive) setData(d); });
    load();
    const iv = pollMs > 0 ? setInterval(load, pollMs) : null;
    return () => { alive = false; if (iv) clearInterval(iv); };
  }, [userId, pollMs, bump]);
  return data;
}

/** Money is always "$" with 2 decimals. */
export const money = (n: number) => `$${(Number(n) || 0).toFixed(2)}`;

/** "2026-12-06" -> "Sunday, Dec 6" in the member's language. */
export function formatSunday(ymd: string, lang: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return ymd;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  const locale = lang === "tl" ? "fil" : lang;
  try {
    return date.toLocaleDateString(locale, { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
  } catch {
    return date.toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
  }
}
