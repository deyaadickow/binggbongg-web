// Bingg Bongg Video Ad (Steve, 2026-11-17: "Just like Bingg Bongg Song I want to be able to create a
// 60 seconds video ads for members for 500 BBs ... view it and edit up to 3 times, alway important
// to mention their referral code at the end of the ad. Minus 500 BBs from their account before you
// start the video ad.")
//
// Code name AdMaker (the older "video ads" = paid feed ads in lib/videoads.ts is a different thing).
// The member answers a few questions (the notes), may add their own photos/clips, pays 500 BBs, and
// the server makes a <=60 s ad that always ends with their referral code. Three free changes.
// Making is polled: adMakerMake / adMakerEdit answer at once and the work happens after.
//
// SAFETY: while building or testing on the local dev server, use the mock (`?mockVideoAd=1` on any
// page turns it on for this browser, `?mockVideoAd=0` off). The mock module is only ever loaded under
// `import.meta.env.DEV`, so it is not in the production build.
import { API_BASE, currentAuthHeaders, post, type ApiResponse } from "./api";

export type AdStatus = "draft" | "making" | "done" | "remaking" | "failed";
export interface AdMedia { type: "image" | "video"; key: string; url: string }
export interface AdScriptLine { say: string; show?: string }

export interface AdMakerAd {
  id: number;
  status: AdStatus;
  mention: string;
  notes: string;
  parts: string[];
  media: AdMedia[];
  tone: string;
  voice: string;
  language: string;
  change_request?: string | null;
  title: string;
  script: AdScriptLine[];
  referral_code?: string | null;
  video_url?: string | null;
  thumbnail?: string | null;
  duration?: number | null;
  price_bbs: number;
  coins_charged?: number;
  edits_used: number;
  edits_left: number;
  refunded?: boolean;
  failure_reason?: string | null;
  share_url?: string | null;
  post_id?: number | null;
  made_with_ai?: boolean;
  created_at?: string | null;
}

export interface AdMakerOptions {
  price_bbs: number;
  free_edits: number;
  max_seconds: number;
  max_media: number;
  parts: { key: string; label: string; about?: string }[];
  tones: { key: string; label: string }[];
  voices: string[];
  languages: { code: string; name: string }[];
  example: { video_url: string | null; thumbnail: string | null; choices: string[] } | null;
}

export interface SharedAd {
  title: string;
  video_url: string;
  thumbnail?: string | null;
  duration?: number | null;
  referral_code: string;
  from?: { id: number; fullname?: string; username?: string; profile_image?: string | null } | null;
  made_with_ai?: boolean;
}

/** The server's own lists (AdMakerController + its migration, backend 0013c70), so the form works
 *  before the server is deployed and if adMakerOptions ever fails. adMakerOptions replaces them. */
export const DEFAULT_AD_OPTIONS: AdMakerOptions = {
  price_bbs: 500,
  free_edits: 3,
  max_seconds: 60,
  max_media: 8,
  parts: [
    { key: "go_live", label: "Going live" }, { key: "multi_live", label: "Multi-live 24" },
    { key: "battles", label: "Battles" }, { key: "country_battle", label: "Country Battle" },
    { key: "chat_battle", label: "Chat Battle" }, { key: "games", label: "Games" },
    { key: "gifts", label: "Gifts and BBs" }, { key: "translation", label: "Live translation" },
    { key: "six_platforms", label: "Live on 6 platforms" }, { key: "watch_6", label: "Watch 6 lives" },
    { key: "videos", label: "Videos" }, { key: "photos", label: "Fun photos" },
    { key: "shop", label: "Bingg Bongg Shop" }, { key: "business", label: "Business pages" },
    { key: "referral", label: "Referral program" },
  ],
  tones: [
    { key: "excited", label: "Excited" }, { key: "friendly", label: "Friendly" },
    { key: "professional", label: "Professional" }, { key: "funny", label: "Funny" },
  ],
  voices: ["female", "male"],
  languages: [
    { code: "en", name: "English" }, { code: "fil", name: "Tagalog" },
    { code: "id", name: "Indonesian" }, { code: "es", name: "Spanish" },
  ],
  example: null,
};

// ---- The dev-only mock ---------------------------------------------------------------------------

const MOCK_KEY = "bb.videoAdMock";

/** "" (off), or the mock's mode: "1" normal, "nobbs" (making says not enough BBs), "fail" (making
 *  fails and is refunded), "noexample" (no example ad yet). Dev server only; "" in production. */
export function adMockMode(): string {
  if (!import.meta.env.DEV) return "";
  try {
    const q = new URLSearchParams(window.location.search).get("mockVideoAd");
    if (q !== null) {
      if (q === "0" || q === "") localStorage.removeItem(MOCK_KEY);
      else localStorage.setItem(MOCK_KEY, q);
    }
    return localStorage.getItem(MOCK_KEY) ?? "";
  } catch {
    return "";
  }
}

async function call<T>(endpoint: string, params: Record<string, unknown>): Promise<ApiResponse<T>> {
  if (import.meta.env.DEV) {
    const mode = adMockMode();
    if (mode) {
      const m = await import("./adMakerMock");
      return m.mockAdCall<T>(endpoint, params, mode);
    }
  }
  return post<T>(endpoint, params);
}

// ---- Shapes --------------------------------------------------------------------------------------

function arr<T>(raw: unknown): T[] {
  let v: unknown = raw;
  if (typeof raw === "string") { try { v = JSON.parse(raw); } catch { return []; } }
  return Array.isArray(v) ? (v as T[]) : [];
}

export function normaliseAd(raw: Partial<AdMakerAd> & Record<string, unknown>): AdMakerAd {
  return {
    ...(raw as AdMakerAd),
    id: Number(raw.id),
    status: (raw.status ?? "draft") as AdStatus,
    mention: String(raw.mention ?? ""),
    notes: String(raw.notes ?? ""),
    parts: arr<string>(raw.parts).map(String),
    media: arr<AdMedia>(raw.media).filter((m) => m && m.key).map((m) => ({ type: m.type === "video" ? "video" : "image", key: String(m.key), url: String(m.url ?? "") })),
    tone: String(raw.tone ?? "excited"),
    voice: String(raw.voice ?? "female"),
    language: String(raw.language ?? "en"),
    title: String(raw.title ?? ""),
    script: arr<AdScriptLine>(raw.script).filter((l) => l && String(l.say ?? "").trim()).map((l) => ({ say: String(l.say).trim(), show: l.show ? String(l.show) : undefined })),
    price_bbs: Number(raw.price_bbs ?? 500) || 500,
    edits_used: Number(raw.edits_used ?? 0) || 0,
    edits_left: Number(raw.edits_left ?? 0) || 0,
    duration: raw.duration == null ? null : Number(raw.duration),
    refunded: [true, 1, "1"].includes(raw.refunded as unknown as boolean | number | string),
  };
}

/** A failure that carries the server's sentence and its reason code (not_enough_coins, no_edits_left). */
export class AdMakerError extends Error {
  code: string;
  data: Record<string, unknown> | null;
  constructor(code: string, message: string, data: Record<string, unknown> | null = null) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

function adOrThrow(r: ApiResponse<Record<string, unknown>>, fallback: string): AdMakerAd {
  if (!r.status || !r.data) {
    const code = r.message ?? "";
    const text = typeof r.data?.text === "string" ? r.data.text : "";
    throw new AdMakerError(code, text || (code && !/^[a-z_]+$/.test(code) ? code : fallback), r.data ?? null);
  }
  return normaliseAd(r.data as Partial<AdMakerAd> & Record<string, unknown>);
}

// ---- Calls ---------------------------------------------------------------------------------------

export async function fetchAdMakerOptions(): Promise<AdMakerOptions> {
  try {
    const r = await call<Partial<AdMakerOptions>>("adMakerOptions", {});
    if (!r.status || !r.data) return DEFAULT_AD_OPTIONS;
    const d = r.data;
    const ex = d.example && typeof d.example === "object" ? d.example : null;
    return {
      price_bbs: Number(d.price_bbs) || DEFAULT_AD_OPTIONS.price_bbs,
      free_edits: Number(d.free_edits) || DEFAULT_AD_OPTIONS.free_edits,
      max_seconds: Number(d.max_seconds) || DEFAULT_AD_OPTIONS.max_seconds,
      max_media: Number(d.max_media) || DEFAULT_AD_OPTIONS.max_media,
      parts: d.parts?.length ? d.parts : DEFAULT_AD_OPTIONS.parts,
      tones: d.tones?.length ? d.tones : DEFAULT_AD_OPTIONS.tones,
      voices: d.voices?.length ? d.voices : DEFAULT_AD_OPTIONS.voices,
      languages: d.languages?.length ? d.languages : DEFAULT_AD_OPTIONS.languages,
      example: ex && ex.video_url ? { video_url: ex.video_url, thumbnail: ex.thumbnail ?? null, choices: arr<string>(ex.choices).map(String) } : null,
    };
  } catch {
    return DEFAULT_AD_OPTIONS; // not deployed yet (404), or offline
  }
}

export interface AdAnswers {
  mention: string;
  notes: string;
  parts: string[];
  media: { type: string; key: string }[];
  tone: string;
  voice: string;
  language: string;
}

const wire = (a: AdAnswers) => ({ ...a, parts: JSON.stringify(a.parts), media: JSON.stringify(a.media.map((m) => ({ type: m.type, key: m.key }))) });

/** Creates the draft (no adId) or updates it. Free. */
export async function adMakerSave(myId: number, a: AdAnswers, adId?: number): Promise<AdMakerAd> {
  const r = await call<Record<string, unknown>>("adMakerSave", { my_user_id: myId, ...wire(a), ...(adId ? { ad_id: adId } : {}) });
  return adOrThrow(r, "We could not save your answers. Please try again.");
}

/** 500 BBs come off, then the ad is made. Throws AdMakerError("not_enough_coins") when short. */
export async function adMakerMake(myId: number, adId: number): Promise<AdMakerAd> {
  const r = await call<Record<string, unknown>>("adMakerMake", { my_user_id: myId, ad_id: adId });
  return adOrThrow(r, "Your ad couldn't be started. Please try again.");
}

/** One of the free changes. Throws AdMakerError("no_edits_left") when they are used up. */
export async function adMakerEdit(myId: number, adId: number, change: string, a?: AdAnswers): Promise<AdMakerAd> {
  const r = await call<Record<string, unknown>>("adMakerEdit", { my_user_id: myId, ad_id: adId, change_request: change, ...(a ? wire(a) : {}) });
  return adOrThrow(r, "Your changes couldn't be started. Please try again.");
}

export async function fetchAdMakerAd(myId: number, adId: number): Promise<AdMakerAd> {
  const r = await call<Record<string, unknown>>("fetchAdMakerAd", { my_user_id: myId, ad_id: adId });
  return adOrThrow(r, "Ad not found.");
}

export async function fetchMyAdMakerAds(myId: number): Promise<AdMakerAd[]> {
  const r = await call<Record<string, unknown>[]>("fetchMyAdMakerAds", { my_user_id: myId });
  if (!r.status) throw new Error(r.message || "Couldn't load your video ads.");
  return (r.data ?? []).map((a) => normaliseAd(a as Partial<AdMakerAd> & Record<string, unknown>));
}

export async function deleteAdMakerAd(myId: number, adId: number): Promise<void> {
  const r = await call("deleteAdMakerAd", { my_user_id: myId, ad_id: adId });
  if (!r.status) throw new Error(r.message || "Couldn't delete that ad.");
}

export async function adMakerAttachPost(myId: number, adId: number, postId: number): Promise<void> {
  const r = await call("adMakerAttachPost", { my_user_id: myId, ad_id: adId, post_id: postId });
  if (!r.status) throw new Error(r.message || "Couldn't link the video to the ad.");
}

export async function fetchSharedAdMakerAd(code: string): Promise<SharedAd> {
  const r = await call<Record<string, unknown>>("fetchSharedAdMakerAd", { code });
  if (!r.status || !r.data) throw new Error(r.message || "This ad is not available.");
  const d = r.data;
  return {
    ...(d as unknown as SharedAd),
    title: String(d.title ?? ""),
    video_url: String(d.video_url ?? ""),
    referral_code: String(d.referral_code ?? ""),
  };
}

/** One photo or clip of the member's own, multipart `file`. Returns {type, key, url}. */
export async function adMakerUploadMedia(myId: number, file: File): Promise<AdMedia> {
  if (import.meta.env.DEV && adMockMode()) {
    const m = await import("./adMakerMock");
    return m.mockUpload(file);
  }
  const form = new FormData();
  form.append("my_user_id", String(myId));
  form.append("file", file);
  const res = await fetch(API_BASE + "adMakerUploadMedia", { method: "POST", headers: currentAuthHeaders(), body: form });
  if (res.status === 413) throw new Error("That file is too big. A shorter clip is best.");
  if (!res.ok) throw new Error(`Upload failed (${res.status}).`);
  const j = (await res.json()) as ApiResponse<AdMedia>;
  if (!j.status || !j.data?.key) throw new Error(j.message || "Upload failed. Please try again.");
  return { type: j.data.type === "video" ? "video" : "image", key: j.data.key, url: j.data.url };
}

/** The language the questions start in: the app's own (Tagalog = "fil"), else English. */
export function adLanguageFor(appLang: string, options: AdMakerOptions): string {
  const l = appLang === "tl" ? "fil" : appLang.split("-")[0];
  return options.languages.some((x) => x.code === l) ? l : "en";
}
