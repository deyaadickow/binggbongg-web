// Free Points v2 (Steve, 2026-11-09: "Let's make all the coins same price, every 1000 coins are
// worth $1.00. Signups are 50 points ... The video upload ... 10 points free ... For a limited
// time go live streaming and earn 500 points per hour").
//
// Three balances that all spend the same way for gifts: bought Coins, Free Points (sign-up,
// uploads, going live; the RECEIVER earns $1.00 per 1,000) and Test coins (testers only, $0).
// The server may not have these fields yet: every one missing reads as 0 / feature off, and the
// wallet then shows the old single balance exactly as before.
import { post, type UserSummary } from "./api";

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? Math.floor(x) : 0; };

export interface WalletSplit {
  /** no_redeem_wallet — what a gift is checked against. */
  total: number;
  /** True once the server sends the split; false = show the old single number. */
  split: boolean;
  paid: number;
  free: number;
  test: number;
}

export function walletSplit(u: Partial<UserSummary> | null | undefined): WalletSplit {
  const total = n(u?.no_redeem_wallet);
  const split = !!u && (u.free_points !== undefined || u.paid_coins !== undefined || u.test_coins !== undefined);
  const free = n(u?.free_points), test = n(u?.test_coins);
  const paid = u?.paid_coins !== undefined ? n(u.paid_coins) : Math.max(0, total - free - test);
  return { total, split, paid, free, test };
}

export interface LivePoints {
  enabled: boolean;
  per_hour: number;
  max_hours: number;
  today_seconds: number;
  today_hours_done: number;
  today_points: number;
  next_award_in_seconds: number;
  ends_on: string | null;
}

/** POST fetchLivePoints. null = off, not deployed, or failed — the caller shows nothing. */
export async function fetchLivePoints(myUserId: number): Promise<LivePoints | null> {
  try {
    const res = await post<Record<string, unknown>>("fetchLivePoints", { my_user_id: myUserId });
    const d = res.status ? res.data : null;
    if (!d || typeof d !== "object") return null;
    const enabled = d.enabled === true || d.enabled === 1 || d.enabled === "1";
    if (!enabled) return null;
    const perHour = n(d.per_hour), maxHours = n(d.max_hours);
    if (!perHour || !maxHours) return null;
    return {
      enabled,
      per_hour: perHour,
      max_hours: maxHours,
      today_seconds: n(d.today_seconds),
      today_hours_done: n(d.today_hours_done),
      today_points: n(d.today_points),
      next_award_in_seconds: n(d.next_award_in_seconds),
      ends_on: typeof d.ends_on === "string" ? d.ends_on : null,
    };
  } catch {
    return null;
  }
}

/** The two fields markWatchingLive adds for a host (0 on older servers). */
export function heartbeatLivePoints(res: unknown): { awarded: number; today: number } {
  const r = (res ?? {}) as Record<string, unknown>;
  const d = (r.data ?? {}) as Record<string, unknown>;
  return { awarded: n(r.live_points_awarded ?? d.live_points_awarded), today: n(r.live_points_today ?? d.live_points_today) };
}

/** free_points_used off a sendCoinsToUser answer (top level, or under data). */
export function freePointsUsed(res: unknown): number {
  const r = (res ?? {}) as Record<string, unknown>;
  const d = (r.data && typeof r.data === "object" ? r.data : {}) as Record<string, unknown>;
  return n(r.free_points_used ?? d.free_points_used);
}
