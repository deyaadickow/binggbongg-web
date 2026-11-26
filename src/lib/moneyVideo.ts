// "How to make money on Bingg Bongg" (Steve, 2026-11-26: "Please add a link right bellow the tabs on
// top that says... 'How to make money on Bingg Bongg' ... Show each video in each country with their
// own language. same three languages."). The server picks the video by the member's COUNTRY
// (PH -> fil, ID -> id, else en) and says show=false when none is live.
import { post, mediaUrl } from "./api";

export interface MoneyVideo { show: boolean; country_code?: string; language?: string; label?: string; video?: string; poster?: string }

let cached: Promise<MoneyVideo | null> | null = null;
let cachedFor: number | null = null;

/** Dev only: ?mmdemo=en|fil|id fakes show=true with an existing feature video, so the pill can be
 *  seen before the backend's fetchMoneyVideo is deployed. Never in a production build. */
async function demo(): Promise<MoneyVideo | null> {
  if (!import.meta.env.DEV) return null;
  const lang = new URLSearchParams(window.location.search).get("mmdemo");
  if (!lang || !["en", "fil", "id"].includes(lang)) return null;
  const { fetchFeatureVideos } = await import("./featureVideos");
  const videos = await fetchFeatureVideos(lang);
  const url = videos.country_battle ?? Object.values(videos)[0];
  if (!url) return null;
  return { show: true, country_code: lang === "fil" ? "PH" : lang === "id" ? "ID" : "US", language: lang, video: url };
}

/** Once per session (per signed-in member). Null on any failure — the pill then stays hidden. */
export function fetchMoneyVideo(userId?: number | null): Promise<MoneyVideo | null> {
  const who = userId ?? 0;
  if (cached && cachedFor === who) return cached;
  cachedFor = who;
  cached = (async () => {
    const fake = await demo();
    if (fake) return fake;
    try {
      // "platform" keeps the body non-empty for guests — the host's firewall 403s an empty-body POST.
      const res = await post<MoneyVideo>("fetchMoneyVideo", { platform: "web", my_user_id: userId || undefined });
      const d = res.status ? res.data : null;
      if (!d?.show || !d.video) return null;
      return { ...d, video: mediaUrl(d.video), poster: d.poster ? mediaUrl(d.poster) : undefined };
    } catch {
      return null;
    }
  })();
  return cached;
}
