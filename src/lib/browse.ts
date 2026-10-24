// The eight ways of browsing the feed that the phones have always had and the web never did.
//
// Steve, 2026-10-20, on the eight Bingg Bongg Features tiles that opened nothing here: "Make all
// 8 tiles open the same as the phones. each tile will link to the same page as on the phones."
//
// Nothing new on the server — every endpoint below already serves Android and iOS. What was
// missing was the web half. The phones reach these as chips on the home feed
// (HomeFragment.CHIP_CATEGORIES and friends); the web has no chip row, so each one is its own
// route under /browse.
//
// Two things to know about these endpoints before changing anything here:
//
//  1. NONE OF THEM PAGINATE. fetchPostsByLanguage, fetchPostsByCountryState and
//     fetchPostsByContestCategory each do `inRandomOrder()->limit(10)`, exactly like fetchPosts.
//     "Show more" therefore means calling again and merging by id, the same trick lib/feed.ts
//     uses for the main feed — not passing an offset, which the server would ignore.
//  2. THE PARAMETER NAMES DO NOT MATCH THE TILE NAMES. Category is `contest_cat_id`, language is
//     `lang`, location is `country` (+ optional `state`), and age is min_age/max_age on plain
//     fetchPosts. Taken from the controllers, not guessed.
import { post, type Post } from "./api";

/** Merge a fresh random batch into what is already on screen, dropping repeats. */
export function mergePosts(current: Post[], incoming: Post[]): Post[] {
  const seen = new Set(current.map((p) => p.id));
  return [...current, ...incoming.filter((p) => !seen.has(p.id))];
}

async function posts(endpoint: string, params: Record<string, unknown>): Promise<Post[]> {
  const res = await post<Post[]>(endpoint, params);
  // A filter with nothing in it answers status:false with a message rather than an empty list,
  // which is a legitimate empty result here, not a failure worth showing as an error.
  return res.data ?? [];
}

export const postsByCategory = (catId: number, myId: number | null) =>
  posts("fetchPostsByContestCategory", { contest_cat_id: catId, ...(myId ? { my_user_id: myId } : {}) });

export const postsByLanguage = (lang: string, myId: number | null) =>
  posts("fetchPostsByLanguage", { lang, ...(myId ? { my_user_id: myId } : {}) });

export const postsByCountry = (country: string, state: string | null, myId: number | null) =>
  posts("fetchPostsByCountryState", { country, ...(state ? { state } : {}), ...(myId ? { my_user_id: myId } : {}) });

export const postsByAge = (minAge: number, maxAge: number, myId: number | null) =>
  posts("fetchPosts", { min_age: minAge, max_age: maxAge, ...(myId ? { my_user_id: myId } : {}) });

/** The categories a video can be filed under — the same contestCats the upload page offers. */
export interface ContestCat { id: number; name?: string; image?: string }

let catsCache: Promise<ContestCat[]> | null = null;
export function fetchCategories(): Promise<ContestCat[]> {
  if (!catsCache) {
    catsCache = post<{ contestCats?: ContestCat[] }>("fetchSettings", { x: 1 })
      .then((r) => (r.data?.contestCats ?? []).slice().sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")))
      .catch(() => { catsCache = null; return []; });
  }
  return catsCache;
}

/** A VIP voter badge: the mark shown beside somebody who has backed you with enough coins. */
export interface VipBadge { id?: number; name?: string; image?: string; votes?: number }

export function fetchVipBadges(): Promise<VipBadge[]> {
  return post<{ vipVoterSticker?: VipBadge[] }>("fetchSettings", { x: 1 })
    // Steve, 2026-09-03 on the phones: "Badge 20, 1000, and 16 are in the wrong place." The
    // server returns these in insertion order, not level order. votes is the coin threshold and
    // rises with the level, so sorting on it always gives the right grid — same fix as Android's
    // VIPVoterBadgesViewModel.
    .then((r) => (r.data?.vipVoterSticker ?? []).slice().sort((a, b) => (a.votes ?? 0) - (b.votes ?? 0)))
    .catch(() => []);
}

/** A paid advert currently running. device_type 1 is the Android inventory, which is the full set. */
export interface RunningAd {
  id?: number;
  ads_title?: string;
  brand_name?: string;
  brand_logo?: string;
  description?: string;
  horizontal_image?: string;
  video?: string;
  android_link?: string;
  ios_link?: string;
  end_date?: string;
}

export function fetchRunningAds(): Promise<RunningAd[]> {
  return post<RunningAd[]>("fetchAds", { device_type: 1 }).then((r) => r.data ?? []).catch(() => []);
}

/** A private room somebody has open and is taking bookings for. */
export interface PrivateRoomSummary {
  id: number;
  host_user_id?: number;
  host_fullname?: string | null;
  host_username?: string | null;
  host_profile_image?: string | null;
  room_name?: string | null;
  max_guests?: number;
  price_model?: string | null;
  price_coins?: number;
  duration_minutes?: number;
  scheduled_at?: string | null;
  active_bookings?: number | null;
}

export function fetchPrivateRooms(myId: number): Promise<PrivateRoomSummary[]> {
  return post<PrivateRoomSummary[]>("fetchPrivateRooms", { user_id: myId }).then((r) => r.data ?? []);
}

/** The languages a video can be tagged with — what fetchPostsByLanguage filters on.
 *
 *  Steve, 2026-10-20, seeing this screen offer 35: "I thought it was 53 Languages." He was right
 *  about the app — it is translated into 53 — but this was a different, shorter list, so twenty-
 *  one languages a member could read the whole app in could not be used to label their own
 *  video. "Yes add all 53 to the upload picker." It is now the union of the two: 56, keeping
 *  Cebuano, Javanese, Khmer and Burmese, which were only ever on this side and already label
 *  real videos.
 *
 *  Each name is already in its own language, so nothing here goes through the dictionary. The
 *  same list is Global.getLanguages() on Android and postLanguages in PostLanguageModel.swift on
 *  iOS — change one and change all three, or this screen offers a language nothing is tagged
 *  with. */
export const POST_LANGUAGES: { code: string; native: string }[] = [
  { code: "en", native: "English" },
  { code: "af", native: "Afrikaans" },
  { code: "am", native: "አማርኛ" },
  { code: "ar", native: "العربية" },
  { code: "bg", native: "Български" },
  { code: "bn-IN", native: "বাঙ্গালি (ভারত)" },
  { code: "ca", native: "Català" },
  { code: "ceb", native: "Cebuano (Pilipinas)" },
  { code: "cs-CZ", native: "Čeština (Česká republika)" },
  { code: "da", native: "Dansk" },
  { code: "de", native: "Deutsch" },
  { code: "el-GR", native: "Ελληνικά (Ελλάδα)" },
  { code: "es", native: "Español" },
  { code: "et", native: "Eesti" },
  { code: "eu", native: "Euskara" },
  { code: "fi-FI", native: "Suomi (Suomi)" },
  { code: "fil", native: "Filipino (Pilipinas)" },
  { code: "fr", native: "Français" },
  { code: "gl", native: "Galego" },
  { code: "gu", native: "ગુજરાતી" },
  { code: "he-IL", native: "עברית (ישראל)" },
  { code: "hi", native: "हिंदी" },
  { code: "hu-HU", native: "Magyar (Magyarország)" },
  { code: "id", native: "Bahasa Indonesia (Indonesia)" },
  { code: "is", native: "Íslenska" },
  { code: "it-IT", native: "Italiano (Italia)" },
  { code: "ja-JP", native: "日本語（日本）" },
  { code: "jv", native: "Basa Jawa (Indonesia)" },
  { code: "km-KH", native: "ខ្មែរ (កម្ពុជា)" },
  { code: "kn", native: "ಕನ್ನಡ" },
  { code: "ko-KR", native: "한국어 (대한민국)" },
  { code: "lt", native: "Lietuvių" },
  { code: "lv", native: "Latviešu" },
  { code: "ml", native: "മലയാളം" },
  { code: "mr", native: "मराठी" },
  { code: "ms", native: "Bahasa Melayu (Malaysia)" },
  { code: "my", native: "မြန်မာ" },
  { code: "nb", native: "Norsk bokmål" },
  { code: "nl-NL", native: "Nederlands (Nederland)" },
  { code: "pa", native: "ਪੰਜਾਬੀ" },
  { code: "pl-PL", native: "Polski (Polska)" },
  { code: "pt-BR", native: "Português (Brasil)" },
  { code: "ro-RO", native: "Română (Romania)" },
  { code: "ru-RU", native: "Русский (Россия)" },
  { code: "sk", native: "Slovenčina" },
  { code: "sr", native: "Српски" },
  { code: "sv-SE", native: "Svenska (Sverige)" },
  { code: "ta", native: "தமிழ்" },
  { code: "te", native: "తెలుగు" },
  { code: "th", native: "ไทย" },
  { code: "tr-TR", native: "Türkçe (Türkiye)" },
  { code: "uk-UA", native: "Українська (Україна)" },
  { code: "ur", native: "اردو" },
  { code: "vi-VN", native: "Tiếng Việt (Việt Nam)" },
  { code: "zh-CN", native: "简体中文" },
  { code: "zh-TW", native: "繁體中文" },
];

/** The age bands, matching Global.getAgeGroups() on Android one for one. maxAge 0 means "and over",
 *  which the server reads as no upper bound. */
export const AGE_GROUPS: { id: number; minAge: number; maxAge: number }[] = [
  { id: 0, minAge: 18, maxAge: 80 },
  { id: 1, minAge: 18, maxAge: 20 },
  { id: 2, minAge: 21, maxAge: 24 },
  { id: 3, minAge: 25, maxAge: 27 },
  { id: 4, minAge: 28, maxAge: 30 },
  { id: 5, minAge: 31, maxAge: 35 },
  { id: 6, minAge: 36, maxAge: 40 },
  { id: 7, minAge: 41, maxAge: 50 },
  { id: 8, minAge: 51, maxAge: 60 },
  { id: 9, minAge: 61, maxAge: 70 },
  { id: 10, minAge: 71, maxAge: 80 },
  { id: 11, minAge: 81, maxAge: 0 },
];
