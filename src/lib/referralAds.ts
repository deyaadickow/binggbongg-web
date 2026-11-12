// Ads for Referrals (Steve, 2026-11-11): "When you click on Bingg Bongg Features add another
// feature called Ads for Referrals. In that page we will add all the downloadable video ads so all
// members can download them to their phone and upload them to their social media accounts." The
// referral bonus went from $25 to $100 the same day: 5% of what every friend you sign up earns,
// until you reach $100 — for every friend. A short offer video explains it, and every member sees
// it ONCE (new members right after signing up, everyone else on their next visit to For You).
//
// Wire contract (fbbs1000-referral100-spec.md §A.7 + §A.8):
//   POST fetchReferralAds { language? }  — checkHeader; the caller (optional) from AUTHTOKEN/USERID
//     -> { offer_video, ads[], referral_code, percent, cap, offer_seen }
//   POST markReferralOfferSeen { user_id } — authorizeUser, own row.
//
// Demo mode (the backend was being built at the same time): /ads-for-referrals?demo=1 (also
// demo=out signed out, demo=empty, demo=error) and /?demo=1 for the offer popup on For You. Sample
// videos are the landing page's two public clips; nothing is sent to the server in demo mode.
import { post } from "./api";

export interface ReferralVideo {
  id: number; title: string; language: string; video_url: string; poster_url: string | null; duration: number;
  /** Only on ads: the server route that sends the file with Content-Disposition: attachment. */
  download_url?: string | null;
}

export interface ReferralAds {
  offer_video: ReferralVideo | null;
  ads: ReferralVideo[];
  referral_code: string | null;
  invite_url: string | null;
  percent: number;
  cap: number;
  offer_seen: boolean;
}

const num = (v: unknown, d: number): number => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);
const isTrue = (v: unknown): boolean => v === true || v === 1 || v === "1" || v === "true";
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function video(v: unknown): ReferralVideo | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const url = str(o.video_url);
  if (!url) return null;
  return {
    id: num(o.id, 0), title: str(o.title) ?? "", language: str(o.language) ?? "en", video_url: url,
    poster_url: str(o.poster_url), duration: num(o.duration ?? o.duration_seconds, 0), download_url: str(o.download_url),
  };
}

function clean(d: unknown): ReferralAds {
  const o = (d && typeof d === "object" ? d : {}) as Record<string, unknown>;
  return {
    offer_video: video(o.offer_video),
    ads: (Array.isArray(o.ads) ? o.ads : []).map(video).filter((v): v is ReferralVideo => !!v),
    referral_code: str(o.referral_code),
    invite_url: str(o.invite_url),
    percent: num(o.percent, 5),
    cap: num(o.cap, 100),
    offer_seen: isTrue(o.offer_seen),
  };
}

/** The server picks fil for fil/tl and en for everything else; send the app's language as is. */
export async function fetchReferralAds(lang: string): Promise<ReferralAds> {
  const res = await post<unknown>("fetchReferralAds", { language: lang });
  if (!res.status || !res.data) throw new Error(res.message || "fetchReferralAds");
  return clean(res.data);
}

// ---- the offer popup: once per member ---------------------------------------------------------

const SEEN_KEY = (userId: number) => `bb.referralOfferSeen.${userId}`;

/** The local half of "once": kept even when markReferralOfferSeen never reached the server. */
export function offerSeenLocally(userId: number): boolean {
  try { return localStorage.getItem(SEEN_KEY(userId)) === "1"; } catch { return false; }
}

/** Local only — the server already knows (offer_seen came back true). */
export function rememberOfferSeen(userId: number): void {
  try { localStorage.setItem(SEEN_KEY(userId), "1"); } catch { /* private mode: the server flag still holds */ }
}

export function markReferralOfferSeen(userId: number): void {
  rememberOfferSeen(userId);
  post("markReferralOfferSeen", { user_id: userId }).catch(() => undefined);
}

// ---- download + share -------------------------------------------------------------------------

export function adFileName(v: ReferralVideo): string {
  const title = v.title.replace(/[\\/:*?"<>|]+/g, " ").trim() || `ad ${v.id}`;
  return `Bingg Bongg ad - ${title}.mp4`;
}

/** The file, with progress (0..100, or -1 when the size is unknown). Throws when it cannot be read
 *  from here (no CORS on the file, offline) — the caller then hands the link to the browser. */
export async function fetchAdFile(url: string, onProgress: (pct: number) => void): Promise<Blob> {
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok || !res.body) throw new Error(`download ${res.status}`);
  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body.getReader();
  const parts: BlobPart[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    onProgress(total ? Math.min(99, Math.floor((got / total) * 100)) : -1);
  }
  onProgress(100);
  return new Blob(parts, { type: res.headers.get("content-type") || "video/mp4" });
}

export function saveBlob(blob: Blob, fileName: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** The fallback: let the browser fetch the server's attachment route itself. */
export function openDownloadLink(url: string, fileName: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.target = "_blank";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";

/** The file itself when it is already downloaded and the browser can share files, else the text
 *  and the video's link, else copy them. */
export async function shareAd(input: { blob?: Blob | null; fileName: string; text: string; url: string }): Promise<ShareOutcome> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (input.blob && nav.share) {
    const file = new File([input.blob], input.fileName, { type: input.blob.type || "video/mp4" });
    if (nav.canShare?.({ files: [file] })) {
      try { await nav.share({ files: [file], text: input.text }); return "shared"; }
      catch (e) { if ((e as Error).name === "AbortError") return "cancelled"; }
    }
  }
  if (nav.share) {
    try { await nav.share({ text: input.text, url: input.url }); return "shared"; }
    catch (e) { if ((e as Error).name === "AbortError") return "cancelled"; }
  }
  try { await navigator.clipboard.writeText(`${input.text}\n${input.url}`); return "copied"; }
  catch { return "failed"; }
}

/** 62 -> "1:02" */
export function duration(s: number): string {
  if (!s || s < 0) return "";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

// ---- demo ------------------------------------------------------------------------------------

export type AdsDemo = "on" | "out" | "empty" | "error";
export function adsDemoKind(v: string | null): AdsDemo | null {
  if (!v) return null;
  return (["out", "empty", "error"] as string[]).includes(v) ? (v as AdsDemo) : "on";
}

const S3 = "https://binggbongg.s3.amazonaws.com/uploads/landing";
const EN = { video_url: `${S3}/social-app-en-v1.mp4`, poster_url: `${S3}/social-app-en-v1.jpg` };
const TL = { video_url: `${S3}/social-app-tl-v1.mp4`, poster_url: `${S3}/social-app-tl-v1.jpg` };

export async function demoReferralAds(kind: AdsDemo, lang: string): Promise<ReferralAds> {
  await new Promise((r) => setTimeout(r, 300));
  if (kind === "error") throw new Error("demo");
  const fil = lang === "fil" || lang === "tl";
  const ads: ReferralVideo[] = kind === "empty" ? [] : [
    { id: 2, title: "Battle live", language: "en", ...EN, duration: 40 },
    { id: 3, title: "Battle live (Tagalog)", language: "fil", ...TL, duration: 40 },
    { id: 4, title: "Play games with friends", language: "en", ...EN, duration: 30 },
    { id: 5, title: "Maglaro kasama ang barkada", language: "fil", ...TL, duration: 30 },
    { id: 6, title: "Go live, get gifts", language: "en", ...EN, duration: 35 },
    { id: 7, title: "Mag-live, makatanggap ng regalo", language: "fil", ...TL, duration: 35 },
  ].map((a) => ({ ...a, download_url: a.video_url }));
  // The caller's language first, as the server does.
  ads.sort((a, b) => Number(b.language === (fil ? "fil" : "en")) - Number(a.language === (fil ? "fil" : "en")));
  return {
    offer_video: { id: 1, title: fil ? "Ang alok" : "The offer", language: fil ? "fil" : "en", ...(fil ? TL : EN), duration: 62 },
    ads,
    referral_code: kind === "out" ? null : "MaeSings",
    invite_url: kind === "out" ? null : "https://www.binggbongg.com/invite/MaeSings",
    percent: 5,
    cap: 100,
    offer_seen: false,
  };
}
