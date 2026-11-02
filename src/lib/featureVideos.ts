// Feature Videos (Steve, 2026-10-24): "make a video for each feature we have and add each video to
// that feature on the same tab", then "We will create these video in every language/country that
// we launch in." One row per directory tile, keyed by the tile's fname_* string key — the same key
// on Android and iOS — in the member's language, or English when that tile has none in it yet.
import { post, mediaUrl } from "./api";

/** The player's language switch (Steve, 2026-11-02: "we should do this with all three languages.
 *  English, Tagalog and Indonesia. on our Bingg Bongg Features. and will show each country with their
 *  language by default."), in the order it shows them. Names are not translated. */
export type VideoLang = "en" | "fil" | "id";
export const VIDEO_LANGS: { code: VideoLang; label: string }[] = [
  { code: "en", label: "English" }, { code: "fil", label: "Tagalog" }, { code: "id", label: "Indonesia" },
];
/** language -> full URL, for one video. */
export type VideoSources = Partial<Record<VideoLang, string>>;

interface FeatureVideoRow { feature_key: string; video: string; language?: string; label?: string | null; videos?: Record<string, string> }

/** Button labels of EXTRA videos on a tile, keyed "<tile>__<x>" (Steve, 2026-10-25: the ads on #1). */
export const featureVideoLabels: Record<string, string> = {};
/** Every language a tile's video is in, keyed like the videos (filled by fetchFeatureVideos). */
export const featureVideoSources: Record<string, VideoSources> = {};

const fullUrl = (p: string) => (p.startsWith("http") ? p : mediaUrl(p));

/** The server's {en, fil, id} raw paths as full URLs; empty on an older server. */
export function videoSources(raw?: Record<string, string> | null): VideoSources {
  const out: VideoSources = {};
  for (const { code } of VIDEO_LANGS) if (raw?.[code]) out[code] = fullUrl(raw[code]);
  return out;
}

const PICK_KEY = "bb.featureVideoLang";

/** The language the switch opens on: the one the member last picked, else their country's
 *  (Philippines -> Tagalog, Indonesia -> Indonesian, from the profile and then the device's time
 *  zone), else English. */
export function defaultVideoLang(country?: string | null): VideoLang {
  try {
    const picked = localStorage.getItem(PICK_KEY);
    if (picked === "en" || picked === "fil" || picked === "id") return picked;
  } catch { /* private mode */ }
  const c = (country ?? "").trim().toLowerCase();
  if (c === "philippines" || c === "ph") return "fil";
  if (c === "indonesia" || c === "id") return "id";
  let tz = "";
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { /* old browser */ }
  if (tz === "Asia/Manila") return "fil";
  if (["Asia/Jakarta", "Asia/Pontianak", "Asia/Makassar", "Asia/Jayapura"].includes(tz)) return "id";
  return "en";
}

export function rememberVideoLang(lang: VideoLang) {
  try { localStorage.setItem(PICK_KEY, lang); } catch { /* private mode */ }
}

/** tile key -> full video URL. Never throws: the videos are an extra on tiles that already work. */
export async function fetchFeatureVideos(language: string): Promise<Record<string, string>> {
  try {
    // "platform" also keeps the body non-empty — the host's firewall 403s an empty-body POST.
    const res = await post<FeatureVideoRow[]>("fetchFeatureVideos", { platform: "web", language });
    const out: Record<string, string> = {};
    for (const r of res.status ? res.data ?? [] : []) {
      if (r.feature_key && r.video) out[r.feature_key] = fullUrl(r.video);
      if (r.feature_key && r.label) featureVideoLabels[r.feature_key] = r.label;
      if (r.feature_key) featureVideoSources[r.feature_key] = videoSources(r.videos);
    }
    return out;
  } catch {
    return {};
  }
}
