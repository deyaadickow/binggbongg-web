// Feature Videos (Steve, 2026-10-24): "make a video for each feature we have and add each video to
// that feature on the same tab", then "We will create these video in every language/country that
// we launch in." One row per directory tile, keyed by the tile's fname_* string key — the same key
// on Android and iOS — in the member's language, or English when that tile has none in it yet.
import { post, mediaUrl } from "./api";

interface FeatureVideoRow { feature_key: string; video: string; language?: string; label?: string | null }

/** Button labels of EXTRA videos on a tile, keyed "<tile>__<x>" (Steve, 2026-10-25: the ads on #1). */
export const featureVideoLabels: Record<string, string> = {};

/** tile key -> full video URL. Never throws: the videos are an extra on tiles that already work. */
export async function fetchFeatureVideos(language: string): Promise<Record<string, string>> {
  try {
    // "platform" also keeps the body non-empty — the host's firewall 403s an empty-body POST.
    const res = await post<FeatureVideoRow[]>("fetchFeatureVideos", { platform: "web", language });
    const out: Record<string, string> = {};
    for (const r of res.status ? res.data ?? [] : []) {
      if (r.feature_key && r.video) out[r.feature_key] = r.video.startsWith("http") ? r.video : mediaUrl(r.video);
      if (r.feature_key && r.label) featureVideoLabels[r.feature_key] = r.label;
    }
    return out;
  } catch {
    return {};
  }
}
