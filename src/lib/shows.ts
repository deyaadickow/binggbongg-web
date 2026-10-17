// Your own live Bingg Bongg show (Steve, 2026-10-17) — mirrors ShowController.php.
//
//   $99 a month out of EARNINGS (cash_wallet, the same wallet the simulcast fee comes from),
//   as many hours a day as the host likes with a 2-hour minimum, 30% of what an advertiser
//   they brought in pays, and an extra 5% on gifts received on the show itself.
//
// The whole feature is behind shows_enabled, off until he opens it — every screen here has to
// handle that being false rather than assuming a show can be had.
import { post } from "./api";

export type ShowStatus =
  | "pending_review" | "approved" | "active" | "past_due" | "suspended" | "rejected" | "cancelled";

export interface ShowDay { date: string; hours: number; met_minimum: boolean }
export interface ShowShortDay { date: string; hours: number }
export interface ShowCharge {
  type: string; amount: number; period_start?: string | null; period_end?: string | null;
  note?: string | null; created_at?: string;
}
export interface ShowAdEarning {
  video_ad_id: number; advertiser_paid: number; share_percent: number; amount: number; created_at?: string;
}

export interface MyShow {
  id: number;
  name: string;
  tagline?: string | null;
  description?: string | null;
  status: ShowStatus;
  rejected_reason?: string | null;
  monthly_price: number;
  paid_until?: string | null;
  balance_due: number;
  started_at?: string | null;
  hours_today: number;
  min_hours_per_day: number;
  last_7_days: ShowDay[];
  short_days_30: ShowShortDay[];
  ad_earnings_total: number;
  gift_bonus_total: number;
  ad_earnings: ShowAdEarning[];
  charges: ShowCharge[];
}

export interface MyShowResponse {
  shows_enabled: boolean;
  monthly_price: number;
  min_hours_per_day: number;
  ad_share_percent: number;
  gift_bonus_percent: number;
  /** The host's own referral code — it IS what they hand an advertiser, so there is no second
   *  code to issue. See VideoAdController::createVideoAd. */
  my_referral_code?: string | null;
  wallet: number;
  show: MyShow | null;
}

export interface ShowListing {
  id: number; user_id: number; name: string; tagline?: string | null; description?: string | null;
  host_name?: string | null; host_username?: string | null; host_image?: string | null;
  is_live_now: boolean; room_name?: string | null; live_stream_id?: number | null;
}

export async function fetchMyShow(myUserId: number): Promise<MyShowResponse> {
  const r = await post<MyShow | null>("fetchMyShow", { user_id: myUserId });
  const body = r as unknown as Record<string, unknown>;
  return {
    shows_enabled: Boolean(body.shows_enabled),
    monthly_price: Number(body.monthly_price ?? 99),
    min_hours_per_day: Number(body.min_hours_per_day ?? 2),
    ad_share_percent: Number(body.ad_share_percent ?? 30),
    gift_bonus_percent: Number(body.gift_bonus_percent ?? 5),
    my_referral_code: (body.my_referral_code as string | null) ?? null,
    wallet: Number(body.wallet ?? 0),
    show: (r.data as MyShow | null) ?? null,
  };
}

export async function applyForShow(myUserId: number, f: { name: string; tagline: string; description: string }) {
  const r = await post<MyShow>("applyForShow", { user_id: myUserId, ...f });
  if (!r.status) throw new Error(r.message ?? "Couldn't send that.");
  return { message: r.message ?? "Sent for review.", show: (r.data as MyShow | null) ?? null };
}

export async function startShow(myUserId: number) {
  const r = await post<MyShow>("startShow", { user_id: myUserId });
  // The server's message carries the real reason — most often that earnings don't cover the
  // first month, with both figures in it. It has to reach the host word for word.
  if (!r.status) throw new Error(r.message ?? "Couldn't start your show.");
  return { message: r.message ?? "Your show is on the air.", show: (r.data as MyShow | null) ?? null };
}

export async function cancelShow(myUserId: number) {
  const r = await post<MyShow>("cancelShow", { user_id: myUserId });
  if (!r.status) throw new Error(r.message ?? "Couldn't stop your show.");
  return { message: r.message ?? "Your show has been stopped.", show: (r.data as MyShow | null) ?? null };
}

export async function fetchShows(): Promise<ShowListing[]> {
  const r = await post<ShowListing[]>("fetchShows", {});
  return r.data ?? [];
}
