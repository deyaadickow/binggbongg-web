// Tap games from the browser — same TapGameController endpoints and economy as the phones:
// 50-coin entry fee (agreed once, charged every game), the server derives coins earned from
// objects_caught × coin_value_at_play, then a voluntary "gift these coins to the host".
import { post } from "./api";

export interface TapGameType {
  id: number;
  name?: string;
  game_mode?: "catch" | "falling_lanes" | "puzzle" | "race" | string;
  coin_value?: number;
  activation_id?: number | null;
  background_image_url?: string | null;
  character_image_url?: string | null;
  sound_file_url?: string | null;
  description?: string | null;
}

export interface TapGameStart {
  session_id: number;
  coin_value_at_play: number;
  needs_attention_popup: boolean;
  entry_fee_coins: number;
  duration_seconds: number;
  speed?: "slow" | "fast" | "insane" | string | null;
}

export interface TapGameResult {
  coins_earned: number;
  objects_caught: number;
  game_name?: string;
  host_name?: string | null;
  gifted?: boolean;
}

export async function fetchActiveTapGame(roomName: string): Promise<TapGameType | null> {
  const res = await post<TapGameType>("fetchActiveTapGameForRoom", { room_name: roomName }).catch(() => null);
  return res?.status ? (res.data ?? null) : null;
}

export async function startTapGame(userId: number, gameTypeId: number, roomName: string): Promise<TapGameStart> {
  const res = await post<TapGameStart>("startTapGameSession", { user_id: userId, tap_game_type_id: gameTypeId, room_name: roomName, duration_seconds: 120 });
  if (!res.status || !res.data) throw new Error(res.message ?? "Couldn't start the game.");
  return res.data;
}

export async function agreeToEntryFee(userId: number, sessionId: number): Promise<void> {
  const res = await post("agreeToTapGamesEntryFee", { user_id: userId, tap_game_session_id: sessionId });
  if (!res.status) throw new Error(res.message ?? "Couldn't charge the entry fee.");
}

export async function endTapGame(sessionId: number, objectsCaught: number, elapsedSeconds?: number): Promise<TapGameResult> {
  const res = await post<TapGameResult>("endTapGameSession", { tap_game_round_id: sessionId, objects_caught: objectsCaught, ...(elapsedSeconds !== undefined ? { elapsed_seconds: elapsedSeconds } : {}) });
  if (!res.status || !res.data) throw new Error(res.message ?? "Couldn't finish the game.");
  return res.data;
}

export async function giftTapGameScore(userId: number, sessionId: number): Promise<string> {
  const res = await post("giftTapGameScore", { user_id: userId, tap_game_round_id: sessionId });
  if (!res.status) throw new Error(res.message ?? "Couldn't gift those coins.");
  return res.message ?? "Gifted — thank you!";
}

/** Spawn cadence and how long a target stays on screen, by the host's chosen speed. */
export function speedProfile(speed?: string | null) {
  switch (speed) {
    case "insane": return { spawnMs: 250, lifeMs: 900 };
    case "fast": return { spawnMs: 350, lifeMs: 1400 };
    default: return { spawnMs: 500, lifeMs: 2200 };
  }
}
