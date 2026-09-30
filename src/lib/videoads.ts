// Video Ads — the web side of the create-an-ad flow, ported from iOS's CreateVideoAdView /
// CreateVideoAdViewModel (Steve, 2026-09-30: "Build it the same way it works on ios").
//
// The one thing that can't follow the web's usual upload path: createVideoAd validates
// `video` and `thumbnail` as `required|file` and hands them straight to S3 server-side, so this
// posts real multipart parts rather than the pre-signed-URL keys uploadPost uses.
import { API_BASE, currentAuthHeaders, post } from "./api";
import { uploadErrorMessage } from "./upload";

/** Mirrors iOS's AdVideoValidator.maxDurationSeconds and the backend's own expectation. */
export const MAX_AD_VIDEO_SECONDS = 60;
/** Mirrors VideoAdController::MAX_TARGETS_PER_AD — checked here so members hear about it
 *  before a long upload rather than after it. */
export const MAX_TARGETS_PER_AD = 25;

export type GeoLevel = "city" | "state" | "country";

/** One row of tbl_ad_pricing_tiers (fetchAdPricingTiers). Only active tiers come back, and a
 *  country absent from this list simply cannot be targeted — which is why the country picker is
 *  built from these rows rather than from the full country list. */
export interface AdPricingTier {
  id: number;
  country_code: string;
  country_name: string;
  level: GeoLevel;
  advertiser_monthly_price: number;
  referral_commission_monthly: number;
}

/** Exactly the shape resolveTargets() reads — no tier id and no price, because the server always
 *  recomputes price from tbl_ad_pricing_tiers and ignores anything the client claims. */
export interface PendingTarget {
  geo_level: GeoLevel;
  country_code: string;
  country_name: string;
  state_name?: string;
  city_name?: string;
}

export async function fetchAdPricingTiers(): Promise<AdPricingTier[]> {
  // { x: 1 }, not {} — an empty-body POST is rejected by the host WAF with a 403 (see the
  // empty-body WAF fix); every other no-argument call in this app carries the same filler.
  const r = await post<AdPricingTier[]>("fetchAdPricingTiers", { x: 1 });
  if (!r.status) throw new Error(r.message ?? "Couldn't load ad pricing.");
  return (r.data ?? []).map((t) => ({
    ...t,
    advertiser_monthly_price: Number(t.advertiser_monthly_price),
    referral_commission_monthly: Number(t.referral_commission_monthly),
  }));
}

/** `state_code` is the ISO sub-code (e.g. "CA"), not the state's name — the name is what goes in
 *  the target row. Unknown combinations come back as an empty list, not an error. */
export async function fetchCitiesForState(countryCode: string, stateCode: string): Promise<string[]> {
  const r = await post<string[]>("fetchCitiesForState", { country_code: countryCode, state_code: stateCode });
  if (!r.status) throw new Error(r.message ?? "Couldn't load cities for that state.");
  return r.data ?? [];
}

export function tierFor(tiers: AdPricingTier[], countryCode: string, level: GeoLevel): AdPricingTier | undefined {
  return tiers.find((t) => t.country_code === countryCode && t.level === level);
}

export function priceForTarget(tiers: AdPricingTier[], target: PendingTarget): number {
  return tierFor(tiers, target.country_code, target.geo_level)?.advertiser_monthly_price ?? 0;
}

/** What the member will be charged on submit — the sum of every target's own tier price, the
 *  same arithmetic VideoAdController does before touching the balance. Display-only; the server
 *  recomputes it and is the authority. */
export function totalMonthlyPrice(tiers: AdPricingTier[], targets: PendingTarget[]): number {
  return targets.reduce((sum, t) => sum + priceForTarget(tiers, t), 0);
}

export function sameTarget(a: PendingTarget, b: PendingTarget): boolean {
  return a.geo_level === b.geo_level
    && a.country_code === b.country_code
    && (a.state_name ?? "") === (b.state_name ?? "")
    && (a.city_name ?? "") === (b.city_name ?? "");
}

export function targetLabel(t: PendingTarget): string {
  if (t.geo_level === "city") return `${t.city_name}, ${t.state_name}, ${t.country_name}`;
  if (t.geo_level === "state") return `${t.state_name}, ${t.country_name}`;
  return t.country_name;
}

/**
 * Multipart, with upload progress — same XHR shape as uploadPhoto/uploadContestVideo.
 *
 * `targets` goes as ONE JSON string field: multipart can't carry nested arrays, and the backend
 * json_decodes this exact field. Don't let anything expand it into `targets[]`.
 *
 * `referral_code` is omitted entirely when blank, never sent as "" — the backend gates on
 * `$request->filled('referral_code')` and an empty string would fail the lookup.
 */
export function createVideoAd(args: {
  myUserId: number;
  targets: PendingTarget[];
  video: File;
  thumbnail: Blob;
  durationSeconds?: number | null;
  referralCode?: string;
  onProgress?: (fraction: number) => void;
}): Promise<void> {
  const form = new FormData();
  form.append("my_user_id", String(args.myUserId));
  form.append("targets", JSON.stringify(args.targets));
  form.append("video", args.video);
  form.append("thumbnail", new File([args.thumbnail], "thumb.jpg", { type: "image/jpeg" }));
  if (args.durationSeconds != null) form.append("video_duration_seconds", String(Math.round(args.durationSeconds)));
  const referral = (args.referralCode ?? "").trim();
  if (referral) form.append("referral_code", referral);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", API_BASE + "createVideoAd", true);
    // Never set Content-Type by hand — the browser has to add the multipart boundary.
    for (const [k, v] of Object.entries(currentAuthHeaders())) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && args.onProgress) args.onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body: { status?: boolean; message?: string } = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* fall through to the status-code message */ }
      if (xhr.status >= 200 && xhr.status < 300 && body.status) resolve();
      // The server's own message matters here — insufficient balance, a failed moderation
      // review and a bad referral code are all things the member can act on.
      else reject(new Error(uploadErrorMessage(xhr.status, body.message)));
    };
    xhr.onerror = () => reject(new Error("Network error while uploading your ad."));
    xhr.send(form);
  });
}
