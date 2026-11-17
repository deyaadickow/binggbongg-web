// Bingg Bongg Song (Steve, 2026-11-16: "Build Bingg Bongg Song, 299 BBs, 3 free previews").
//
// A member answers a few questions about someone; the server writes lyrics with that person's
// name and memories (free), sings a free 30-second preview (3 per song), and sings the whole song
// for 299 BOUGHT BBs. The finished song gets a share page (/song/<code>), and the member can turn
// it into a video with their photos and the lyrics on screen.
//
// Everything is polled: songPreview and songBuy answer at once and the work happens after, so
// the screens ask fetchSong every couple of seconds until the status moves on.
//
// SAFETY: songPreview and songBuy cost real money at Google. While building or testing on the
// local dev server, use the mock (`?songmock=1` on any page sets it for this browser) — the mock
// module is only ever loaded under `import.meta.env.DEV`, so it is not in the production build.
import { post, type ApiResponse } from "./api";

export type SongStatus = "draft" | "previewing" | "preview_ready" | "making" | "done" | "failed";
export interface SongLine { s: number; e: number; t: string }

export interface Song {
  id: number;
  status: SongStatus;
  title: string;
  lyrics: string;
  recipient_name: string;
  relationship?: string | null;
  occasion?: string | null;
  memories?: string | null;
  style?: string | null;
  voice?: string | null;
  language?: string | null;
  previews_used: number;
  free_previews_left: number;
  preview_url?: string | null;
  preview_lines: SongLine[];
  song_url?: string | null;
  song_lines: SongLine[];
  duration?: number | null;
  price_bbs: number;
  coins_charged?: number;
  refunded?: boolean;
  failure_reason?: string | null;
  share_url?: string | null;
  post_id?: number | null;
  made_with_ai?: boolean;
  created_at?: string | null;
}

export interface SongOptions {
  price_bbs: number;
  free_previews: number;
  styles: { key: string; label: string }[];
  occasions: string[];
  voices: string[];
  languages: { code: string; name: string }[];
}

export interface SharedSong {
  title: string;
  recipient_name: string;
  occasion?: string | null;
  song_url: string;
  song_lines: SongLine[];
  duration?: number | null;
  lyrics?: string | null;
  from?: { id: number; fullname?: string; username?: string; user_profile?: string } | null;
  made_with_ai?: boolean;
}

/** The server's own lists (SongController, e5af018), so the form works before the server is
 *  deployed and if songOptions ever fails. songOptions replaces them when it answers. */
export const DEFAULT_SONG_OPTIONS: SongOptions = {
  price_bbs: 299,
  free_previews: 3,
  styles: [
    { key: "love_ballad", label: "Love ballad" }, { key: "pop", label: "Pop" }, { key: "opm", label: "OPM ballad" },
    { key: "acoustic", label: "Acoustic" }, { key: "country", label: "Country" }, { key: "rnb", label: "R&B" },
    { key: "rock", label: "Rock" }, { key: "party", label: "Birthday party" }, { key: "gospel", label: "Gospel" },
    { key: "kids", label: "For kids" }, { key: "hiphop", label: "Hip hop" }, { key: "lullaby", label: "Lullaby" },
  ],
  occasions: ["birthday", "anniversary", "love", "thank_you", "sorry", "wedding", "mothers_day", "fathers_day", "friendship", "get_well", "graduation", "just_because"],
  voices: ["female", "male"],
  languages: [
    { code: "en", name: "English" }, { code: "fil", name: "Filipino (Tagalog)" }, { code: "id", name: "Indonesian" },
    { code: "es", name: "Spanish" }, { code: "pt", name: "Portuguese" }, { code: "fr", name: "French" },
    { code: "de", name: "German" }, { code: "it", name: "Italian" }, { code: "ar", name: "Arabic" },
    { code: "hi", name: "Hindi" }, { code: "ja", name: "Japanese" }, { code: "ko", name: "Korean" },
    { code: "zh", name: "Chinese (Simplified)" }, { code: "vi", name: "Vietnamese" }, { code: "th", name: "Thai" },
    { code: "ms", name: "Malay" }, { code: "tr", name: "Turkish" }, { code: "ru", name: "Russian" },
    { code: "nl", name: "Dutch" }, { code: "pl", name: "Polish" },
  ],
};

// ---- The dev-only mock ---------------------------------------------------------------------------

const MOCK_KEY = "bb.songMock";

/** "" (off), or the mock's mode: "1" normal, "nobbs" (buying says not enough BBs), "fail" (the
 *  full song fails and is refunded). Dev server only; always "" in the production build. */
export function songMockMode(): string {
  if (!import.meta.env.DEV) return "";
  try {
    const q = new URLSearchParams(window.location.search).get("songmock");
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
    const mode = songMockMode();
    if (mode) {
      const m = await import("./songMock");
      return m.mockSongCall<T>(endpoint, params, mode);
    }
  }
  return post<T>(endpoint, params);
}

// ---- Shapes --------------------------------------------------------------------------------------

function lines(raw: unknown): SongLine[] {
  let rows: unknown = raw;
  if (typeof raw === "string") { try { rows = JSON.parse(raw); } catch { return []; } }
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => ({ s: Number((r as SongLine)?.s), e: Number((r as SongLine)?.e), t: String((r as SongLine)?.t ?? "").trim() }))
    .filter((r) => Number.isFinite(r.s) && Number.isFinite(r.e) && r.e > r.s && r.t)
    .sort((a, b) => a.s - b.s);
}

export function normaliseSong(raw: Partial<Song> & Record<string, unknown>): Song {
  return {
    ...(raw as Song),
    id: Number(raw.id),
    status: (raw.status ?? "draft") as SongStatus,
    title: String(raw.title ?? ""),
    lyrics: String(raw.lyrics ?? ""),
    recipient_name: String(raw.recipient_name ?? ""),
    previews_used: Number(raw.previews_used ?? 0) || 0,
    free_previews_left: Number(raw.free_previews_left ?? 0) || 0,
    preview_lines: lines(raw.preview_lines),
    song_lines: lines(raw.song_lines),
    price_bbs: Number(raw.price_bbs ?? 299) || 299,
    refunded: [true, 1, "1"].includes(raw.refunded as unknown as boolean | number | string),
  };
}

/** The line under way at `t` seconds, or -1. */
export function lineIndexAt(rows: SongLine[], t: number): number {
  for (let i = 0; i < rows.length; i++) if (rows[i].s <= t && t < rows[i].e) return i;
  return -1;
}

/** A failure that carries the server's sentence and its reason code (no_free_previews, not_enough_coins). */
export class SongError extends Error {
  code: string;
  data: Record<string, unknown> | null;
  constructor(code: string, message: string, data: Record<string, unknown> | null = null) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

function songOrThrow(r: ApiResponse<Record<string, unknown>>, fallback: string): Song {
  if (!r.status || !r.data) {
    const code = r.message ?? "";
    const text = typeof r.data?.text === "string" ? r.data.text : "";
    throw new SongError(code, text || (code && !/^[a-z_]+$/.test(code) ? code : fallback), r.data ?? null);
  }
  return normaliseSong(r.data as Partial<Song> & Record<string, unknown>);
}

// ---- Calls ---------------------------------------------------------------------------------------

export async function fetchSongOptions(): Promise<SongOptions> {
  try {
    const r = await call<Partial<SongOptions>>("songOptions", {});
    if (!r.status || !r.data) return DEFAULT_SONG_OPTIONS;
    const d = r.data;
    return {
      price_bbs: Number(d.price_bbs) || DEFAULT_SONG_OPTIONS.price_bbs,
      free_previews: Number(d.free_previews) || DEFAULT_SONG_OPTIONS.free_previews,
      styles: d.styles?.length ? d.styles : DEFAULT_SONG_OPTIONS.styles,
      occasions: d.occasions?.length ? d.occasions : DEFAULT_SONG_OPTIONS.occasions,
      voices: d.voices?.length ? d.voices : DEFAULT_SONG_OPTIONS.voices,
      languages: d.languages?.length ? d.languages : DEFAULT_SONG_OPTIONS.languages,
    };
  } catch {
    return DEFAULT_SONG_OPTIONS; // not deployed yet (404), or offline
  }
}

export interface SongAnswers {
  recipient_name: string;
  relationship: string;
  occasion: string;
  memories: string;
  style: string;
  voice: string;
  language: string;
}

export async function songWrite(myId: number, a: SongAnswers, songId?: number): Promise<Song> {
  const r = await call<Record<string, unknown>>("songWrite", { my_user_id: myId, ...a, ...(songId ? { song_id: songId } : {}) });
  return songOrThrow(r, "We could not write the song just now. Please try again.");
}

export async function songSaveLyrics(myId: number, songId: number, title: string, lyrics: string): Promise<Song> {
  const r = await call<Record<string, unknown>>("songSaveLyrics", { my_user_id: myId, song_id: songId, title, lyrics });
  return songOrThrow(r, "Couldn't save the words. Please try again.");
}

/** Throws SongError("no_free_previews") with the server's sentence when all three are used. */
export async function songPreview(myId: number, songId: number): Promise<Song> {
  const r = await call<Record<string, unknown>>("songPreview", { my_user_id: myId, song_id: songId });
  return songOrThrow(r, "The preview couldn't start. Please try again.");
}

/** Throws SongError("not_enough_coins") with the server's sentence when the member is short. */
export async function songBuy(myId: number, songId: number): Promise<Song> {
  const r = await call<Record<string, unknown>>("songBuy", { my_user_id: myId, song_id: songId });
  return songOrThrow(r, "The song couldn't be started. Please try again.");
}

export async function fetchSong(myId: number, songId: number): Promise<Song> {
  const r = await call<Record<string, unknown>>("fetchSong", { my_user_id: myId, song_id: songId });
  return songOrThrow(r, "Song not found.");
}

export async function fetchMySongs(myId: number): Promise<Song[]> {
  const r = await call<Record<string, unknown>[]>("fetchMySongs", { my_user_id: myId });
  if (!r.status) throw new Error(r.message || "Couldn't load your songs.");
  return (r.data ?? []).map((s) => normaliseSong(s as Partial<Song> & Record<string, unknown>));
}

export async function deleteSong(myId: number, songId: number): Promise<void> {
  const r = await call("deleteSong", { my_user_id: myId, song_id: songId });
  if (!r.status) throw new Error(r.message || "Couldn't delete that song.");
}

export async function songAttachPost(myId: number, songId: number, postId: number): Promise<void> {
  const r = await call("songAttachPost", { my_user_id: myId, song_id: songId, post_id: postId });
  if (!r.status) throw new Error(r.message || "Couldn't link the video to the song.");
}

export async function fetchSharedSong(code: string): Promise<SharedSong> {
  const r = await call<Record<string, unknown>>("fetchSharedSong", { code });
  if (!r.status || !r.data) throw new Error(r.message || "This song is not available.");
  const d = r.data;
  return {
    ...(d as unknown as SharedSong),
    title: String(d.title ?? ""),
    recipient_name: String(d.recipient_name ?? ""),
    song_url: String(d.song_url ?? ""),
    song_lines: lines(d.song_lines),
  };
}

/** A whole file saved to the device: fetched as a blob first, because a cross-origin
 *  `<a download>` is ignored by browsers and would just open the file. */
export async function downloadUrl(url: string, filename: string): Promise<void> {
  let href = url;
  let made = false;
  try {
    const res = await fetch(url, { mode: "cors", cache: "no-store" });
    if (res.ok) { href = URL.createObjectURL(await res.blob()); made = true; }
  } catch { /* falls back to opening the file */ }
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener";
  if (!made) a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (made) window.setTimeout(() => URL.revokeObjectURL(href), 30_000);
}

export function safeFileName(s: string): string {
  return (s || "bingg-bongg-song").replace(/[^\p{L}\p{N} _-]+/gu, "").trim().replace(/\s+/g, "-").slice(0, 60) || "bingg-bongg-song";
}

/** The language the questions start in: the app's own, Tagalog = "fil". */
export function songLanguageFor(appLang: string, options: SongOptions): string {
  const l = appLang === "tl" ? "fil" : appLang.split("-")[0];
  return options.languages.some((x) => x.code === l) ? l : "en";
}
