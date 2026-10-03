// Tap games from the browser — same TapGameController endpoints and economy as the phones:
// 50-coin entry fee (agreed once, charged every game), the server derives coins earned from
// objects_caught × coin_value_at_play, then a voluntary "gift these coins to the host".
import { post } from "./api";

export interface TapGameType {
  id: number;
  /** Internal key, e.g. "fishing", "balloon_pop" — stable across renames of display_name. */
  key?: string;
  /** tbl_tap_game_types has display_name (+ catch_name, emoji); `name` is kept as a fallback. */
  display_name?: string;
  catch_name?: string;
  emoji?: string;
  name?: string;
  game_mode?: "catch" | "falling_lanes" | "puzzle" | "race" | string;
  /** "Water / Fishing", "Races", … — drives the painted scene when there is no uploaded art. */
  category?: string | null;
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

/** The first-time player's "AGREE" on the Attention popup.
 *
 *  This used to POST agreeToTapGamesEntryFee with a `tap_game_session_id` param. The phones
 *  abandoned both of those in Sept 2026: the hosting WAF blocks any request body carrying the
 *  literal substring "session_id" in a parameter NAME (a session-fixation signature
 *  false-positiving on this feature's own rows), so every field was renamed to
 *  tap_game_round_id and the charge was folded into startTapGameSession as a CONFIRM mode —
 *  sending tap_game_round_id is what selects it. The old route still exists server-side but is
 *  unused by the apps and still carries the triggering param name, so the web was the only
 *  client still taking the blocked path. */
export async function agreeToEntryFee(userId: number, sessionId: number): Promise<void> {
  const res = await post("startTapGameSession", { user_id: userId, tap_game_round_id: sessionId });
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

/** Spawn cadence and lifespan, matching TapGameActivity on the phones: a spawn attempt every
 *  300 ms while fewer than 10 are on screen, each object living a random 2–5 seconds.
 *
 *  `speed` was once host-chosen; the server stopped sending it (it returns null for every mode
 *  now) and the old switch therefore pinned EVERY game to its slowest branch — 500 ms apart and
 *  gone after 2.2 s, which is noticeably duller than the phones. It is still read so that an
 *  older room that somehow still carries a speed keeps behaving. */
export function speedProfile(speed?: string | null) {
  switch (speed) {
    case "insane": return { spawnMs: 200, lifeMs: 1200, lifeJitterMs: 800 };
    case "fast": return { spawnMs: 250, lifeMs: 1600, lifeJitterMs: 1400 };
    default: return { spawnMs: 300, lifeMs: 2000, lifeJitterMs: 3000 };
  }
}

export function gameTitle(g: TapGameType): string {
  const base = g.display_name || g.name || "Tap game";
  return g.emoji ? `${g.emoji} ${base}` : base;
}

/** The phones put the rate in the game's own header — Steve, 2026-09-10: "we need to add coins
 *  on top next to the game name to be transparent to everyone, for example 'Fishing, 2 Coins Per
 *  Catch'". Only meaningful for a game that came from fetchActiveTapGameForRoom, which rewrites
 *  coin_value to the host's actual pick for this activation. */
export function gameTitleWithRate(g: TapGameType): string {
  const n = Number(g.coin_value ?? 0);
  if (!(n > 0) || g.game_mode === "race" || g.game_mode === "puzzle") return gameTitle(g);
  const unit = g.game_mode === "falling_lanes" ? "Pop" : "Catch";
  return `${gameTitle(g)}, ${n % 1 === 0 ? n : n.toFixed(2)} Coin${n === 1 ? "" : "s"} Per ${unit}`;
}

// ---- Host side: choosing which game runs in the room -----------------------------------------
// Mirrors the phones' (G) games menu. The server is authoritative once a game is activated —
// it reads duration and coin value off the live row, not off each player's start request.

export const GAME_DURATIONS = [60, 120, 180, 240, 300] as const;
export const GAME_COIN_VALUES = [1, 2, 3, 4, 5] as const;

/** Game modes with no length to pick: a puzzle has no clock, a race ends at the finish line. */
export function needsDuration(g: TapGameType): boolean {
  return !["puzzle", "race"].includes(g.game_mode ?? "");
}

/** Only catch/pop games score per object, so only they take a host-chosen coin value. */
export function needsCoinValue(g: TapGameType): boolean {
  return ["catch", "falling_lanes"].includes(g.game_mode ?? "");
}

export async function fetchTapGameTypes(): Promise<TapGameType[]> {
  const res = await post<TapGameType[]>("fetchActiveTapGameTypes");
  return res.status ? (res.data ?? []) : [];
}

export async function setActiveTapGame(
  userId: number,
  roomName: string,
  game: TapGameType,
  opts: { durationSeconds?: number; coinValue?: number } = {},
): Promise<void> {
  const params: Record<string, unknown> = { user_id: userId, room_name: roomName, tap_game_type_id: game.id };
  if (needsDuration(game)) params.duration_seconds = opts.durationSeconds ?? 120;
  if (needsCoinValue(game)) params.coin_value = opts.coinValue ?? 1;
  const res = await post("setActiveTapGameForRoom", params);
  if (!res.status) throw new Error(res.message ?? "Couldn't start that game.");
}

/** Sending no game id is how the server turns the room's game off. */
export async function clearActiveTapGame(userId: number, roomName: string): Promise<void> {
  const res = await post("setActiveTapGameForRoom", { user_id: userId, room_name: roomName });
  if (!res.status) throw new Error(res.message ?? "Couldn't turn the game off.");
}

// ---- Look: what the play area shows -----------------------------------------------------------
// Only 1 of the 77 catalogued games has admin-uploaded art, so what almost every player actually
// sees is the fallback. It used to be one near-black radial gradient for every game, which is why
// the fishing games had no water. Each category now gets its own painted scene, so a game reads as
// its subject even before an admin uploads anything.

const SCENES: Record<string, string> = {
  // Underwater: bright surface up top, deep blue below, with a sandy bed.
  "Water / Fishing":
    "radial-gradient(ellipse 120% 40% at 50% 100%, #E8D9A8 0%, #E8D9A8 42%, transparent 43%)," +
    "radial-gradient(ellipse 60% 30% at 20% 0%, rgba(255,255,255,0.35), transparent 70%)," +
    "linear-gradient(#5FD3F0 0%, #1C9ED6 35%, #0B5E9E 75%, #063E6E 100%)",
  "Fishing & Hunting":
    "radial-gradient(ellipse 120% 40% at 50% 100%, #E8D9A8 0%, #E8D9A8 42%, transparent 43%)," +
    "radial-gradient(ellipse 60% 30% at 20% 0%, rgba(255,255,255,0.35), transparent 70%)," +
    "linear-gradient(#5FD3F0 0%, #1C9ED6 35%, #0B5E9E 75%, #063E6E 100%)",
  // Forest floor under a dusk sky.
  "Animals / Hunting":
    "radial-gradient(ellipse 90% 30% at 25% 100%, #1E5A2A 0%, #1E5A2A 60%, transparent 61%)," +
    "radial-gradient(ellipse 100% 26% at 80% 102%, #123D1C 0%, #123D1C 60%, transparent 61%)," +
    "linear-gradient(#F2B35E 0%, #7FA86A 45%, #2E6B3A 100%)",
  // Garden grass, close to the ground.
  "Bugs / Insects":
    "radial-gradient(ellipse 120% 45% at 50% 100%, #3E8E3E 0%, #3E8E3E 55%, transparent 56%)," +
    "linear-gradient(#BFE9A0 0%, #7CC55F 50%, #3E8E3E 100%)",
  // Orchard: warm sky over ripe green.
  "Food / Fruits":
    "radial-gradient(ellipse 110% 35% at 50% 100%, #C4772E 0%, #C4772E 55%, transparent 56%)," +
    "linear-gradient(#FFE0A3 0%, #FFB36B 40%, #D98B3A 100%)",
  // Night sky with a glow, for the silly/space games.
  "Fun / Silly":
    "radial-gradient(circle at 70% 25%, rgba(190,120,255,0.55), transparent 55%)," +
    "radial-gradient(circle at 20% 70%, rgba(80,200,255,0.35), transparent 55%)," +
    "linear-gradient(#1A0B33 0%, #2B1150 55%, #0B0418 100%)",
  // Cave with a gold shimmer.
  "Treasure / Objects":
    "radial-gradient(ellipse 100% 35% at 50% 100%, #6B4A1E 0%, #6B4A1E 55%, transparent 56%)," +
    "radial-gradient(circle at 50% 30%, rgba(255,205,90,0.35), transparent 60%)," +
    "linear-gradient(#3A2A12 0%, #241806 60%, #140D03 100%)",
  // Open sky above a track, for the race games.
  // The dashes are positioned and sized so they sit ON the track as a centre line. Left
  // unbounded, a repeating gradient tiles the whole box and paints stripes across the sky.
  "Races":
    "repeating-linear-gradient(90deg, rgba(255,255,255,0.65) 0 26px, transparent 26px 78px) 0 88%/100% 2.5% no-repeat," +
    "radial-gradient(ellipse 130% 34% at 50% 100%, #4A4A52 0%, #4A4A52 58%, transparent 59%)," +
    "linear-gradient(#8FD6FF 0%, #4FA8E0 45%, #2B6FA8 100%)",
  // Stadium pitch.
  // Mown stripes, kept to the lower half so they read as a pitch rather than as banding.
  "Sports":
    "repeating-linear-gradient(90deg, rgba(255,255,255,0.10) 0 56px, transparent 56px 112px) 0 100%/100% 55% no-repeat," +
    "radial-gradient(ellipse 120% 42% at 50% 100%, #2E8B45 0%, #2E8B45 58%, transparent 59%)," +
    "linear-gradient(#9BE2FF 0%, #55B06A 45%, #2E8B45 100%)",
};

// A category is the right grain for most games, but Sports covers a stadium pitch, an ice rink,
// a dojo and a dark bowling alley, and a grass gradient is simply wrong for most of those (Steve,
// 2026-10-03, adding 20 sports games: "add the sports games on the engines we already have").
// These are per-GAME overrides, checked before the category — the phones already paint every game
// from a per-key palette, so this is the web catching up for the games where it matters most.
const KEY_SCENES: Record<string, string> = {
  // Basketball hall: wooden floor, lit from the roof.
  hoops_tap:
    "radial-gradient(ellipse 130% 38% at 50% 100%, #A9762E 0%, #A9762E 56%, transparent 57%)," +
    "radial-gradient(ellipse 70% 30% at 50% 0%, rgba(255,235,180,0.30), transparent 70%)," +
    "linear-gradient(#2A2118 0%, #3E3022 55%, #6B4A1E 100%)",
  // Badminton hall: the green sprung court, not the wooden one, so it doesn't read as the
  // basketball scene with a different ball on it.
  badminton_smash:
    "radial-gradient(ellipse 130% 40% at 50% 100%, #2E7A5A 0%, #2E7A5A 57%, transparent 58%)," +
    "radial-gradient(ellipse 70% 28% at 50% 0%, rgba(255,235,180,0.28), transparent 70%)," +
    "linear-gradient(#20282E 0%, #2A3A3A 55%, #1E5A46 100%)",
  // Table tennis: blue table with its white centre line. The line layer comes FIRST so it paints
  // ON the table — later layers sit behind, and behind the table it would be invisible.
  table_tennis_rally:
    "linear-gradient(90deg, transparent 0 49.4%, rgba(255,255,255,0.80) 49.4% 50.6%, transparent 50.6%) 0 100%/100% 38% no-repeat," +
    "radial-gradient(ellipse 120% 40% at 50% 100%, #1E64A8 0%, #1E64A8 58%, transparent 59%)," +
    "linear-gradient(#1A2230 0%, #0E1620 55%, #0A1A2E 100%)",
  // Clay court: the orange surface takes the bottom half.
  tennis_rally:
    "radial-gradient(ellipse 130% 45% at 50% 100%, #C4633A 0%, #C4633A 58%, transparent 59%)," +
    "linear-gradient(#7FD0F0 0%, #4AA8D4 45%, #8A3E22 100%)",
  // Beach volleyball: sea sky over sand.
  volleyball_spike:
    "radial-gradient(ellipse 130% 40% at 50% 100%, #E8CF9A 0%, #E8CF9A 55%, transparent 56%)," +
    "linear-gradient(#6FD4F2 0%, #3AAEDC 45%, #C9A86A 100%)",
  // Ice: pale sheet below, cold arena dark above.
  hockey_slapshot:
    "radial-gradient(ellipse 140% 42% at 50% 100%, #EAF6FF 0%, #EAF6FF 58%, transparent 59%)," +
    "linear-gradient(#2E6A9E 0%, #4A8ABF 45%, #CFEAFF 100%)",
  // Bowling alley: one lit lane straight up the middle, neon either side. The lane is a BAND, not
  // an ellipse — an ellipse anchored at the bottom reads as a hill, not a lane running away.
  bowling_strike:
    "linear-gradient(90deg, transparent 0 36%, rgba(201,138,58,0.95) 36% 64%, transparent 64%) 0 100%/100% 62% no-repeat," +
    "radial-gradient(circle at 80% 20%, rgba(255,74,212,0.40), transparent 55%)," +
    "radial-gradient(circle at 18% 30%, rgba(90,200,255,0.35), transparent 55%)," +
    "linear-gradient(#2A2036 0%, #170F22 60%, #0E0818 100%)",
  // Boxing: a hot overhead spotlight on the canvas, everything else dark.
  boxing_round:
    "radial-gradient(ellipse 120% 40% at 50% 100%, #8A4A3A 0%, #8A4A3A 56%, transparent 57%)," +
    "radial-gradient(circle at 50% 10%, rgba(255,233,184,0.45), transparent 60%)," +
    "linear-gradient(#3A1414 0%, #1E0808 60%, #140606 100%)",
  // Dojo: paper screens above, tatami below with a single seam down the middle. Repeating stripes
  // were tried here and came out as blotches at this size — one clean seam reads as a floor.
  karate_strike:
    "linear-gradient(90deg, transparent 0 49.4%, rgba(0,0,0,0.22) 49.4% 50.6%, transparent 50.6%) 0 100%/100% 44% no-repeat," +
    "radial-gradient(ellipse 140% 44% at 50% 100%, #9A8A4E 0%, #9A8A4E 60%, transparent 61%)," +
    "linear-gradient(#F0E4C8 0%, #D4C09A 52%, #6A5A2E 100%)",
  // Darts corner: one lamp, a red glow off the board, dark everywhere else.
  dart_bullseye:
    "radial-gradient(circle at 50% 35%, rgba(255,74,74,0.30), transparent 50%)," +
    "radial-gradient(ellipse 100% 30% at 50% 100%, #2A1A12 0%, #2A1A12 58%, transparent 59%)," +
    "linear-gradient(#2E3A2E 0%, #141A14 60%, #0A0E0A 100%)",
  // Concrete skate bowl at sunset.
  skate_trick:
    "radial-gradient(ellipse 140% 44% at 50% 100%, #6A6A74 0%, #6A6A74 58%, transparent 59%)," +
    "linear-gradient(#F2845A 0%, #9A5A6A 45%, #3A2E4A 100%)",
  // Open ocean, bright at the surface.
  surf_the_wave:
    "radial-gradient(ellipse 150% 50% at 50% 100%, #06526E 0%, #06526E 60%, transparent 61%)," +
    "radial-gradient(ellipse 60% 24% at 25% 0%, rgba(255,255,255,0.35), transparent 70%)," +
    "linear-gradient(#8FE4FF 0%, #2EB4DC 40%, #0A4A5A 100%)",
  // Alpine snow under a pale winter sky.
  ski_slalom:
    "radial-gradient(ellipse 140% 48% at 50% 100%, #FFFFFF 0%, #FFFFFF 60%, transparent 61%)," +
    "linear-gradient(#CFEAFF 0%, #8AA8C4 50%, #6A8AB8 100%)",
};

/** Daylight sky over grass — Balloon Pop's own scene, and the safe default for anything new. */
const SKY_SCENE =
  "radial-gradient(ellipse 70% 22% at 20% 100%, #2E7A3A 0%, #2E7A3A 60%, transparent 61%)," +
  "radial-gradient(ellipse 80% 26% at 75% 102%, #164A1E 0%, #164A1E 60%, transparent 61%)," +
  "linear-gradient(#6FCBF2, #1E5AA0)";

/** The painted scene for a game that has no admin-uploaded background. */
export function sceneFor(game: TapGameType): string {
  const byKey = game.key && KEY_SCENES[game.key];
  if (byKey) return byKey;
  if (game.game_mode === "falling_lanes" || game.game_mode === "race") {
    return game.game_mode === "race" ? SCENES["Races"] : SKY_SCENE;
  }
  return (game.category && SCENES[game.category]) || SKY_SCENE;
}

/** Admin uploads one "background image" field, and for the Fishing game they uploaded an mp4.
 *  CSS url() renders nothing for a video, which is why that game came out pure black — the
 *  overlay has to mount a <video> instead, so the file extension has to be checked. */
export function isVideoUrl(url?: string | null): boolean {
  return !!url && /\.(mp4|webm|ogg|ogv|mov|m4v)(\?|#|$)/i.test(url);
}
