// Bingg Bongg Podcast (Steve, 2026-11-10: "I wanna do what people want. Podcast with audio and
// video. 'Bingg Bongg Podcast'. If it's going to make us money, let's do it.").
//
// The web half of the podcast API contract (backend 4da66be). Everything here FAILS CLOSED: the
// switch is off, the backend is not deployed yet, or a call errors -> the feature is simply not
// there (no tile, no Start a Podcast entry, no profile row). Nothing in this file throws to a page
// that did not ask for an error.
import { useEffect, useState } from "react";
import { API_BASE, currentAuthHeaders, post } from "./api";

export type PodcastKind = "audio" | "video";
export type PodcastTab = "live" | "latest" | "following" | "top";

export interface PodcastHost {
  user_id: number;
  username?: string | null;
  fullname?: string | null;
  profile_image?: string | null;
  is_verified?: number | boolean | null;
}

export interface PodcastEpisode {
  episode_id: number;
  podcast_id: number;
  title: string;
  description?: string | null;
  kind: PodcastKind;
  chosen_kind?: PodcastKind | null;
  /** The cover, or the host's photo — always shown while audio plays. */
  cover_url?: string | null;
  duration_s?: number | null;
  plays?: number | null;
  plays_30d?: number | null;
  gift_coins?: number | null;
  gift_count?: number | null;
  live_gift_coins?: number | null;
  started_at?: string | null;
  published_at?: string | null;
  expires_at?: string | null;
  host: PodcastHost;
  guests?: { user_id: number; username?: string | null; fullname?: string | null }[];
}

export interface PodcastEpisodeDetail extends PodcastEpisode {
  media_url: string;
  poster_url?: string | null;
  file_size?: number | null;
  resume_at?: number | null;
  is_mine?: boolean | number;
  is_hidden?: boolean | number;
  is_following_show?: boolean | number;
  show_followers?: number;
  preroll_enabled?: boolean | number;
}

export interface LivePodcast {
  podcast_id: number;
  room_name: string;
  title: string;
  description?: string | null;
  kind: PodcastKind;
  cover_url?: string | null;
  started_at?: string | null;
  live_seconds?: number | null;
  host: PodcastHost;
}

export interface PodcastPreroll {
  id: number;
  advertiser_name?: string | null;
  video_url: string;
  thumb_url?: string | null;
  click_url?: string | null;
  skip_after_s?: number | null;
}

export interface UserPodcasts {
  host: PodcastHost;
  is_mine?: boolean | number;
  is_following_show?: boolean | number;
  show_followers?: number;
  live: LivePodcast | null;
  episodes: PodcastEpisode[];
  has_more?: boolean;
}

/** A 0/1, "0"/"1" or boolean flag off the wire. */
export const yes = (v: unknown): boolean => v === true || v === 1 || v === "1" || v === "true";

/** mm:ss under an hour, h:mm:ss over it. */
export function formatDuration(seconds?: number | null): string {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function hostName(h?: Partial<PodcastHost> | null): string {
  return (h?.fullname && h.fullname.trim()) || (h?.username && h.username.trim()) || "Member";
}

// ---- The switch -------------------------------------------------------------------------------

let enabledRequest: Promise<boolean> | null = null;

/** podcast_enabled off fetchSettings, once per page load. A failure is "off" (and retried later). */
export function podcastEnabled(): Promise<boolean> {
  enabledRequest ??= post<{ podcast_enabled?: unknown }>("fetchSettings", { x: 1 })
    .then((r) => yes(r.data?.podcast_enabled))
    .catch(() => { enabledRequest = null; return false; });
  return enabledRequest;
}

/** false until the server says the podcast is on — so a tile never flashes in and out. */
export function usePodcastEnabled(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    podcastEnabled().then((v) => { if (live) setOn(v); });
    return () => { live = false; };
  }, []);
  return on;
}

// ---- Endpoints (all POST, my_user_id = the caller) --------------------------------------------

export interface StartPodcastResult {
  status: boolean;
  message?: string;
  code?: string;
  room_name?: string;
  podcast_id?: number;
  kind?: PodcastKind;
}

/** startPodcast — multipart, because the cover is an optional file. */
export async function startPodcast(input: { myUserId: number; title: string; description: string; kind: PodcastKind; cover?: File | null }): Promise<StartPodcastResult> {
  const form = new FormData();
  form.append("my_user_id", String(input.myUserId));
  form.append("title", input.title);
  if (input.description) form.append("description", input.description);
  form.append("kind", input.kind);
  if (input.cover) form.append("cover", input.cover);
  try {
    const res = await fetch(API_BASE + "startPodcast", { method: "POST", headers: currentAuthHeaders(), body: form });
    if (!res.ok) return { status: false, code: "try_again" };
    return (await res.json()) as StartPodcastResult;
  } catch {
    return { status: false, code: "try_again" };
  }
}

export async function endPodcast(myUserId: number, podcastId: number) {
  return post<unknown>("endPodcast", { my_user_id: myUserId, podcast_id: podcastId })
    .catch(() => ({ status: false } as { status: boolean; message?: string }));
}

export async function fetchPodcasts(myUserId: number, tab: PodcastTab, start = 0, count = 20): Promise<{ enabled: boolean; data: (PodcastEpisode | LivePodcast)[]; hasMore: boolean }> {
  try {
    const res = await post<(PodcastEpisode | LivePodcast)[]>("fetchPodcasts", { my_user_id: myUserId, tab, start, count });
    const enabled = res.enabled === undefined ? !!res.status : yes(res.enabled);
    return { enabled: enabled && !!res.status, data: Array.isArray(res.data) ? res.data : [], hasMore: yes(res.has_more) };
  } catch {
    return { enabled: false, data: [], hasMore: false };
  }
}

export async function fetchPodcastEpisode(myUserId: number, episodeId: number): Promise<{ data: PodcastEpisodeDetail | null; code?: string }> {
  try {
    const res = await post<PodcastEpisodeDetail>("fetchPodcastEpisode", { my_user_id: myUserId, episode_id: episodeId });
    if (!res.status || !res.data) return { data: null, code: typeof res.code === "string" ? res.code : "not_found" };
    return { data: res.data };
  } catch {
    return { data: null, code: "try_again" };
  }
}

export async function fetchUserPodcasts(myUserId: number, userId: number, start = 0, count = 50): Promise<UserPodcasts | null> {
  try {
    const res = await post<UserPodcasts>("fetchUserPodcasts", { my_user_id: myUserId, user_id: userId, start, count });
    if (!res.status || !yes(res.enabled ?? true) || !res.data) return null;
    return { ...res.data, episodes: res.data.episodes ?? [], live: res.data.live ?? null };
  } catch {
    return null;
  }
}

export function savePodcastProgress(myUserId: number, episodeId: number, positionS: number, keepalive = false) {
  return post("savePodcastProgress", { my_user_id: myUserId, episode_id: episodeId, position_s: Math.floor(positionS) }, { keepalive })
    .catch(() => undefined);
}

export function recordPodcastPlay(myUserId: number, episodeId: number) {
  return post("recordPodcastPlay", { my_user_id: myUserId, episode_id: episodeId }).catch(() => undefined);
}

export async function followPodcast(myUserId: number, hostUserId: number, on: boolean): Promise<{ ok: boolean; following: boolean; followers?: number; message?: string }> {
  try {
    const res = await post("followPodcast", { my_user_id: myUserId, user_id: hostUserId, on: on ? 1 : 0 });
    if (!res.status) return { ok: false, following: !on, message: res.message };
    return { ok: true, following: yes(res.following), followers: Number(res.show_followers ?? NaN) };
  } catch {
    return { ok: false, following: !on };
  }
}

export async function deletePodcastEpisode(myUserId: number, episodeId: number): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await post("deletePodcastEpisode", { my_user_id: myUserId, episode_id: episodeId });
    return { ok: !!res.status, message: res.message };
  } catch {
    return { ok: false };
  }
}

export async function fetchPodcastPreroll(myUserId: number): Promise<PodcastPreroll | null> {
  try {
    const res = await post<PodcastPreroll | null>("fetchPodcastPreroll", { my_user_id: myUserId, client: "web" });
    return res.status && res.data && res.data.video_url ? res.data : null;
  } catch {
    return null;
  }
}

/** A gift on an episode: the normal sendCoinsToUser, tagged with the episode. */
export async function giftPodcastEpisode(myUserId: number, hostUserId: number, coins: number, giftId: number, episodeId: number) {
  const res = await post("sendCoinsToUser", { my_user_id: myUserId, user_id: hostUserId, coins, gift_id: giftId, podcast_episode_id: episodeId });
  const ep = (res as { podcast_episode?: { gift_coins?: number; gift_count?: number } }).podcast_episode;
  return { status: !!res.status, message: res.message ?? null, episode: ep ?? null };
}
