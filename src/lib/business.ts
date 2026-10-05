import { currentAuthHeaders, post, type UserSummary } from "./api";
import { API_BASE, uploadErrorMessage } from "./upload";

// Bingg Bongg Business (Steve, 2026-10-01) — mirrors BusinessController.php. Paid business
// pages: "$1.99/day Payments every 90 days ... cancel anytime no refund", searched by country /
// state / city / category, each with a banner, details, hours, photos and videos.

export interface BusinessCategory { id: number; name: string }

export interface BusinessMediaFolder { id: number; name: string }

export interface BusinessMedia {
  id: number;
  business_id: number;
  folder_id?: number | null;
  type: "photo" | "video";
  file_url: string;
  thumb_url?: string | null;
}

export interface Business {
  id: number;
  user_id: number;
  name: string;
  category_id?: number | null;
  description?: string | null;
  banner_url?: string | null;
  is_online: boolean;
  address_line?: string | null;
  city?: string | null;
  state_name?: string | null;
  state_code?: string | null;
  country_name?: string | null;
  country_code?: string | null;
  /** Where a maps app should be sent: the owner's pin when set, the address otherwise. */
  map_query?: string | null;
  has_pin?: boolean;
  /** Steve, 2026-10-05: a dropped pin only shows while the shop is open. */
  pin_visible?: boolean;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  hours_map?: Record<string, string> | unknown[];
  status: "active" | "expired" | "archived" | "suspended";
  paid_until?: string | null;
  days_left: number;
  views: number;
  is_verified: boolean;
  is_live: boolean;
  category?: BusinessCategory | null;
  owner?: Partial<UserSummary> | null;
  media?: BusinessMedia[];
  folders?: BusinessMediaFolder[];
}

export interface BusinessPricing { price_per_day: number; term_days: number; term_price: number; referral_fee: number; enabled: boolean }

export interface Near { country?: string | null; state?: string | null; city?: string | null }

export const DAYS: [string, string][] = [["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"]];

export function hoursOf(b: Business): Record<string, string> {
  const h = b.hours_map;
  return h && !Array.isArray(h) ? (h as Record<string, string>) : {};
}

export function placeLine(b: Business): string {
  const parts = [b.city, b.state_name].filter(Boolean) as string[];
  const place = parts.length ? parts.join(", ") : (b.country_name ?? "");
  if (b.is_online) return place ? `${place} · Online` : "Online";
  return place;
}

export function fullAddress(b: Business): string {
  return [b.address_line, b.city, b.state_name, b.country_name].filter(Boolean).join(", ");
}

export function nearLabel(n?: Near | null): string {
  return n ? [n.city, n.state, n.country].filter(Boolean).join(", ") : "";
}

export function statusText(b: Business): string {
  if (b.is_live) return `Live · ${b.days_left} day${b.days_left === 1 ? "" : "s"} left`;
  if (b.status === "suspended") return "Suspended by Bingg Bongg";
  if (b.status === "archived") return "Taken down — renew to bring it back";
  return "Expired — renew to bring it back";
}

export const usd = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function fetchBusinessCategories(): Promise<BusinessCategory[]> {
  const r = await post<BusinessCategory[]>("fetchBusinessCategories", { x: 1 });
  return (r.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchBusinessPricing(): Promise<BusinessPricing | null> {
  const r = await post<BusinessPricing>("fetchBusinessPricing", { x: 1 });
  return r.data ?? null;
}

export interface BusinessFilters { country_code?: string; state_code?: string; city?: string; category_id?: number; q?: string; my_user_id?: number; user_id?: number }

export async function fetchBusinesses(filters: BusinessFilters): Promise<{ data: Business[]; near: Near | null }> {
  const r = await post<Business[]>("fetchBusinesses", { ...filters, limit: 100 });
  if (!r.status) throw new Error(r.message ?? "Couldn't load businesses.");
  return { data: r.data ?? [], near: ((r as unknown as { near?: Near | null }).near) ?? null };
}

export async function fetchBusinessDetail(businessId: number, myUserId?: number): Promise<Business> {
  const r = await post<Business>("fetchBusinessDetail", { business_id: businessId, my_user_id: myUserId });
  if (!r.status || !r.data) throw new Error(r.message ?? "This business page is no longer available.");
  return r.data;
}

export interface MyBusinesses {
  data: Business[];
  pricing: BusinessPricing;
  cash_balance: number;
  referral_code?: string | null;
  referral_fee: number;
  referral_earned: number;
  referral_count: number;
}

export async function fetchMyBusinesses(myUserId: number): Promise<MyBusinesses> {
  const r = await post<Business[]>("fetchMyBusinesses", { my_user_id: myUserId });
  if (!r.status) throw new Error(r.message ?? "Couldn't load your businesses.");
  const extra = r as unknown as Omit<MyBusinesses, "data">;
  return { data: r.data ?? [], pricing: extra.pricing, cash_balance: extra.cash_balance ?? 0, referral_code: extra.referral_code, referral_fee: extra.referral_fee ?? 0, referral_earned: extra.referral_earned ?? 0, referral_count: extra.referral_count ?? 0 };
}

export async function renewBusiness(myUserId: number, businessId: number): Promise<string> {
  const r = await post("renewBusiness", { my_user_id: myUserId, business_id: businessId });
  if (!r.status) throw new Error(r.message ?? "Couldn't renew.");
  return r.message ?? "Renewed.";
}

export async function cancelBusiness(myUserId: number, businessId: number): Promise<string> {
  const r = await post("cancelBusiness", { my_user_id: myUserId, business_id: businessId });
  if (!r.status) throw new Error(r.message ?? "Couldn't do that.");
  return r.message ?? "Taken down.";
}

export async function deleteBusinessMedia(myUserId: number, mediaId: number): Promise<void> {
  const r = await post("deleteBusinessMedia", { my_user_id: myUserId, media_id: mediaId });
  if (!r.status) throw new Error(r.message ?? "Couldn't delete.");
}

/** Multipart POST — the create/update/media endpoints take real files, like uploadPhoto. */
function multipart<T>(endpoint: string, form: FormData, onProgress?: (f: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", API_BASE + endpoint, true);
    for (const [k, v] of Object.entries(currentAuthHeaders())) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      let body: { status?: boolean; message?: string; data?: T } = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* status check below */ }
      if (xhr.status >= 200 && xhr.status < 300 && body.status) resolve(body.data as T);
      else reject(new Error(body.message ?? uploadErrorMessage(xhr.status, body.message)));
    };
    xhr.onerror = () => reject(new Error(uploadErrorMessage(0)));
    xhr.send(form);
  });
}

export interface BusinessForm {
  name: string;
  category_id: number;
  description: string;
  is_online: boolean;
  country_code: string;
  /** A pasted map link or "lat,lng" — the server pulls the coordinates out. */
  pin?: string;
  state_code: string;
  city: string;
  address_line: string;
  phone: string;
  email: string;
  website: string;
  hours: Record<string, string>;
  referral_code?: string;
}

function formData(myUserId: number, f: BusinessForm, banner: File | null): FormData {
  const form = new FormData();
  form.append("my_user_id", String(myUserId));
  form.append("name", f.name);
  form.append("category_id", String(f.category_id));
  form.append("description", f.description);
  form.append("is_online", f.is_online ? "1" : "0");
  form.append("country_code", f.country_code);
  form.append("state_code", f.state_code);
  form.append("city", f.city);
  form.append("address_line", f.address_line);
  form.append("phone", f.phone);
  form.append("email", f.email);
  form.append("website", f.website);
  form.append("hours", JSON.stringify(f.hours));
  if (f.referral_code) form.append("referral_code", f.referral_code);
  if (banner) form.append("banner", banner);
  return form;
}

export function createBusiness(myUserId: number, f: BusinessForm, banner: File, onProgress?: (n: number) => void): Promise<Business> {
  return multipart<Business>("createBusiness", formData(myUserId, f, banner), onProgress);
}

export function updateBusiness(myUserId: number, businessId: number, f: BusinessForm, banner: File | null, onProgress?: (n: number) => void): Promise<Business> {
  const form = formData(myUserId, f, banner);
  form.append("business_id", String(businessId));
  return multipart<Business>("updateBusiness", form, onProgress);
}

export function uploadBusinessMedia(myUserId: number, businessId: number, type: "photo" | "video", file: File, thumbnail: Blob | null, folderId: number | null, onProgress?: (n: number) => void): Promise<BusinessMedia> {
  const form = new FormData();
  form.append("my_user_id", String(myUserId));
  form.append("business_id", String(businessId));
  form.append("type", type);
  // Uploads land in whichever tab is open — no second picker to get wrong.
  if (folderId) form.append("folder_id", String(folderId));
  form.append("file", file);
  if (thumbnail) form.append("thumbnail", thumbnail, "thumb.jpg");
  return multipart<BusinessMedia>("uploadBusinessMedia", form, onProgress);
}

/** countryStates.json rows, via fetchSettings — the same source the ad targeting picker uses. */
export interface CountryRow { name?: string | null; iso2?: string | null; states?: { name?: string | null; state_code?: string | null }[] }
let countriesCache: Promise<CountryRow[]> | null = null;
export function loadCountries(): Promise<CountryRow[]> {
  if (!countriesCache) {
    countriesCache = post<{ countryStates?: { data?: CountryRow[] } }>("fetchSettings", { x: 1 })
      .then((r) => (r.data?.countryStates?.data ?? []).filter((c) => c.iso2 && c.name))
      .catch((e) => { countriesCache = null; throw e; });
  }
  return countriesCache;
}

export async function fetchCities(countryCode: string, stateCode: string): Promise<string[]> {
  const r = await post<string[]>("fetchCitiesForState", { country_code: countryCode, state_code: stateCode });
  return r.data ?? [];
}

// ---- Member-made folders (Steve, 2026-10-01: "give members the ability to add folders") -------

export async function createBusinessFolder(myUserId: number, businessId: number, name: string): Promise<number> {
  const r = await post<BusinessMediaFolder>("createBusinessFolder", { my_user_id: myUserId, business_id: businessId, name });
  if (!r.status || !r.data) throw new Error(r.message ?? "Couldn't add that folder.");
  return r.data.id;
}

export async function renameBusinessFolder(myUserId: number, folderId: number, name: string): Promise<void> {
  const r = await post("renameBusinessFolder", { my_user_id: myUserId, folder_id: folderId, name });
  if (!r.status) throw new Error(r.message ?? "Couldn't rename that folder.");
}

export async function deleteBusinessFolder(myUserId: number, folderId: number): Promise<string> {
  const r = await post("deleteBusinessFolder", { my_user_id: myUserId, folder_id: folderId });
  if (!r.status) throw new Error(r.message ?? "Couldn't delete that folder.");
  return r.message ?? "Folder deleted.";
}


// ---------------------------------------------------------------- flyers on a business page

/**
 * Steve, 2026-10-05: a flyer made in Create Your Own Ads, put on a business page so a visitor
 * sees the still page and clicks a clip to watch it full screen — which a saved MP4 or PNG can
 * never do, because a saved file is one flat picture.
 */
export interface BusinessFlyerClip {
  id: number;
  video_url?: string | null;
  /** Fractions of the page, from its top-left corner. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BusinessFlyer {
  id: number;
  image_url?: string | null;
  clips?: BusinessFlyerClip[] | null;
}

export async function fetchBusinessFlyers(businessId: number): Promise<BusinessFlyer[]> {
  const r = await post<BusinessFlyer[]>("fetchBusinessFlyers", { business_id: businessId });
  if (!r.status) return [];
  return r.data ?? [];
}

/** One file at a time: several sixty-second clips in a single request is a large upload. */
export async function uploadFlyerAsset(myUserId: number, businessId: number, type: "image" | "video", file: Blob, name: string, onProgress?: (n: number) => void): Promise<string> {
  const form = new FormData();
  form.append("my_user_id", String(myUserId));
  form.append("business_id", String(businessId));
  form.append("type", type);
  form.append("file", file, name);
  const r = await multipart<unknown>("uploadFlyerAsset", form, onProgress);
  const path = (r as unknown as { path?: string } | null)?.path;
  if (!path) throw new Error("Couldn't upload that file.");
  return path;
}

export interface FlyerClipUpload { video_path: string; x: number; y: number; w: number; h: number }

export async function saveBusinessFlyer(myUserId: number, businessId: number, imagePath: string, clips: FlyerClipUpload[]): Promise<string> {
  const r = await post("saveBusinessFlyer", { my_user_id: myUserId, business_id: businessId, image_path: imagePath, clips: JSON.stringify(clips) });
  if (!r.status) throw new Error(r.message ?? "Couldn't save the flyer.");
  return r.message ?? "On your business page.";
}

export async function deleteBusinessFlyer(myUserId: number, flyerId: number): Promise<string> {
  const r = await post("deleteBusinessFlyer", { my_user_id: myUserId, flyer_id: flyerId });
  if (!r.status) throw new Error(r.message ?? "Couldn't remove that flyer.");
  return r.message ?? "Flyer removed.";
}
