// Catch the Fish (Steve, 2026-11-07): "A 5 seconds realistic looking fish will appear swimming on
// any part of the screen when members are live streaming and battling, One fish every 30 seconds
// that is worth 100 coins. It will be on every member's screen watching the live. A small banner
// will appear that will say 'Catch the fish to give the live streamer a gift that's worth 100
// coins'. 'It will be greatly appreciated' Give the streamer a toggle switch to be able to shut it
// off. It will be on by default." The VIEWER pays (a normal gift to the streamer). "Also show the
// creator everyone that caught the fish so he can thank them."
//
// Server (backend 947db52 + 00912d3):
//   fetchLiveFish     { user_id: streamer }                         -> enabled, streamer_on, coins, every_seconds, seconds
//   setLiveFish       { my_user_id, enabled 1|0 }                   -> the streamer's own switch (on by default)
//   sendCoinsToUser   { my_user_id, user_id, room_name, fish: 1 }   -> the server sets the price; never battle ids
//   fetchFishCatchers { my_user_id, room_name }                     -> the caller's own room's catchers
// <LiveFishOverlay /> swims the fish for viewers; <FishHostControls /> is the streamer's side.
import { post } from "./api";

export interface LiveFishStatus {
  enabled: boolean;
  streamer_on: boolean;
  coins: number;
  every_seconds: number;
  seconds: number;
}

export interface FishCatcher {
  user_id: number;
  username: string;
  fullname: string;
  profile_image: string | null;
  catches: number;
  coins: number;
  last_at: string;
}

export interface FishCatchers {
  total_catches: number;
  total_coins: number;
  catchers: FishCatcher[];
}

/** The three sprite sheets: 16 frames side by side, the fish facing RIGHT (frame = 360 px wide). */
export const FISH_SPRITES = [
  { src: "/img/bb_fish_a.webp", ratio: 266 / 360 },
  { src: "/img/bb_fish_b.webp", ratio: 219 / 360 },
  { src: "/img/bb_fish_c.webp", ratio: 236 / 360 },
] as const;

/** Every catch posts this ordinary chat line (English on every platform, so the streamer's
 *  screen can spot it whatever language the catcher reads the app in). */
export const FISH_LINE_PREFIX = "🐟 @";
export const fishChatLine = (username: string, coins: number) => `${FISH_LINE_PREFIX}${username} caught the fish! (${coins} coins)`;
export const isFishChatLine = (message: string | null | undefined) => !!message && message.startsWith(FISH_LINE_PREFIX);

const num = (v: unknown, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

function normalizeStatus(raw: unknown): LiveFishStatus | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return {
    enabled: r.enabled === true || r.enabled === 1 || r.enabled === "1",
    streamer_on: !(r.streamer_on === false || r.streamer_on === 0 || r.streamer_on === "0"),
    coins: Math.max(1, num(r.coins, 100)),
    every_seconds: Math.max(10, num(r.every_seconds, 30)),
    seconds: Math.min(20, Math.max(2, num(r.seconds, 5))),
  };
}

/** The streamer's fish state. null on any failure (an old server) = no fish: fail closed. */
export async function fetchLiveFish(streamerId: number, myId?: number | null): Promise<LiveFishStatus | null> {
  if (!streamerId) return null;
  try {
    const res = await post<unknown>("fetchLiveFish", { user_id: streamerId, my_user_id: myId || streamerId });
    return res.status ? normalizeStatus(res.data) : null;
  } catch {
    return null;
  }
}

/** The streamer's own switch. Returns the new state, or null when the server refused. */
export async function setLiveFish(myId: number, enabled: boolean): Promise<LiveFishStatus | null> {
  try {
    const res = await post<unknown>("setLiveFish", { my_user_id: myId, enabled: enabled ? 1 : 0 });
    return res.status ? normalizeStatus(res.data) : null;
  } catch {
    return null;
  }
}

export type CatchResult = { ok: true } | { ok: false; code: "fish_low_balance" | "fish_off" | "fish_already" | null; message: string };

/** Catch it: a plain room gift to the streamer, priced by the server. */
export async function catchFish(myId: number, streamerId: number, roomName: string): Promise<CatchResult> {
  try {
    const res = await post("sendCoinsToUser", { my_user_id: myId, user_id: streamerId, room_name: roomName, fish: 1 });
    if (res.status) return { ok: true };
    const code = String(res.code ?? "");
    return {
      ok: false,
      code: code === "fish_low_balance" || code === "fish_off" || code === "fish_already" ? code : null,
      message: res.message ?? "",
    };
  } catch (e) {
    return { ok: false, code: null, message: (e as Error).message || "" };
  }
}

/** Who caught the fish in MY room (the server only answers the caller's own catches). */
export async function fetchFishCatchers(myId: number, roomName: string): Promise<FishCatchers | null> {
  try {
    const res = await post<Record<string, unknown>>("fetchFishCatchers", { my_user_id: myId, room_name: roomName });
    if (!res.status || !res.data) return null;
    const d = res.data;
    const list = Array.isArray(d.catchers) ? (d.catchers as Record<string, unknown>[]) : [];
    const catchers: FishCatcher[] = list.map((c) => ({
      user_id: num(c.user_id),
      username: String(c.username ?? ""),
      fullname: String(c.fullname ?? ""),
      profile_image: typeof c.profile_image === "string" && c.profile_image ? c.profile_image : null,
      catches: num(c.catches),
      coins: num(c.coins),
      last_at: String(c.last_at ?? ""),
    })).filter((c) => c.user_id > 0);
    catchers.sort((a, b) => (a.last_at < b.last_at ? 1 : a.last_at > b.last_at ? -1 : 0));
    return {
      total_catches: num(d.total_catches, catchers.reduce((s, c) => s + c.catches, 0)),
      total_coins: num(d.total_coins, catchers.reduce((s, c) => s + c.coins, 0)),
      catchers,
    };
  } catch {
    return null;
  }
}
