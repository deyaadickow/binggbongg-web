// Dog Race (Steve, 2026-11-16): "The host wants to start a dog race, he will ask his audience
// whoever want to play the dog race reserve your spot, the race will start in 2 minutes it's free.
// with this race even the host can give gifts, this will be way more interesting. Limit is 24
// players with 24 tiles on the screen, there is no dog name only the player's name, red Gift box
// and the race #s from 1st to 24th on the tile. no green race track only dog tiles."
//
// The wire contract is binggbongg-backend/docs/dog_race_contract.md and nothing more. The server
// is the authority for every rule (the lobby, who is in, the places, the winner); this file only
// reads its answers. The server was built alongside this, so every number is coerced and every
// field may be missing — a half-shaped answer must never take the live room down.
//
// Never send an empty POST body (the LiteSpeed WAF 403s it) — every call carries user_id.
import { post } from "./api";

export type DogRaceStatus = "lobby" | "racing" | "finished" | "cancelled";

export interface DogRaceGifter { user_id: number; username: string; fullname: string; profile: string; bbs: number }

export interface DogRacePlayer {
  slot: number;
  user_id: number;
  username: string;
  fullname: string;
  profile: string;
  dog: { id: number; video: string; poster: string };
  bbs: number;
  place: number;
  /** Finished only, most BBs first. */
  gifters: DogRaceGifter[];
}

/** One counted gift (race_state.recent_gifts, newest 20). Every viewer plays the effect in the
 *  tile for `slot` for each id higher than the last one they saw — how OTHER people's gifts show. */
export interface DogRaceGift {
  id: number; slot: number; to_user_id: number; from_user_id: number; from_username: string;
  gift_id: number; gift_name: string; icon_url: string; gif_url: string; bbs: number;
}

export interface DogRaceState {
  id: number;
  status: DogRaceStatus;
  minutes: number;
  /** Server clock minus ours, ms — add to Date.now() to read the server's time. */
  skewMs: number;
  lobby_ends_at: number | null;
  starts_at: number | null;
  ends_at: number | null;
  host: { user_id: number; username: string; fullname: string; profile: string } | null;
  max_players: number;
  player_count: number;
  players: DogRacePlayer[];
  me: { in_race: boolean; slot: number | null; can_reserve: boolean };
  winner: { user_id: number; username: string; bbs: number } | null;
  room_name: string;
  recent_gifts: DogRaceGift[];
}

type Raw = Record<string, unknown>;
const num = (v: unknown, d = 0): number => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const time = (v: unknown): number | null => { if (!v) return null; const t = Date.parse(String(v)); return Number.isFinite(t) ? t : null; };
const obj = (v: unknown): Raw | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : null);
const bool = (v: unknown): boolean => v === true || v === 1 || v === "1" || v === "true";

function gifterOf(g: unknown): DogRaceGifter | null {
  const o = obj(g);
  if (!o) return null;
  return { user_id: num(o.user_id), username: str(o.username), fullname: str(o.fullname), profile: str(o.profile ?? o.profile_image), bbs: num(o.bbs) };
}

function playerOf(p: unknown, i: number): DogRacePlayer | null {
  const o = obj(p);
  if (!o) return null;
  const dog = obj(o.dog) ?? {};
  const gifters = Array.isArray(o.gifters) ? o.gifters.map(gifterOf).filter((g): g is DogRaceGifter => !!g) : [];
  return {
    slot: num(o.slot, i + 1),
    user_id: num(o.user_id),
    username: str(o.username),
    fullname: str(o.fullname),
    profile: str(o.profile ?? o.profile_image),
    dog: { id: num(dog.id), video: str(dog.video), poster: str(dog.poster) },
    bbs: num(o.bbs),
    place: num(o.place),
    gifters: gifters.sort((a, b) => b.bbs - a.bbs),
  };
}

export function parseDogRace(raw: unknown): DogRaceState | null {
  const o = obj(raw);
  if (!o || !num(o.id)) return null;
  const status = str(o.status) as DogRaceStatus;
  if (!["lobby", "racing", "finished", "cancelled"].includes(status)) return null;
  const serverNow = time(o.server_now);
  const players = (Array.isArray(o.players) ? o.players : []).map(playerOf).filter((p): p is DogRacePlayer => !!p && p.user_id > 0);
  // Places: the server's, else rank by BBs (then slot) so a tile never shows "0th".
  const ranked = [...players].sort((a, b) => b.bbs - a.bbs || a.slot - b.slot);
  ranked.forEach((p, i) => { if (!p.place) p.place = i + 1; });
  const host = obj(o.host);
  const me = obj(o.me) ?? {};
  const winner = obj(o.winner);
  return {
    id: num(o.id),
    status,
    minutes: num(o.minutes, 5),
    skewMs: serverNow ? serverNow - Date.now() : 0,
    lobby_ends_at: time(o.lobby_ends_at),
    starts_at: time(o.starts_at),
    ends_at: time(o.ends_at),
    host: host ? { user_id: num(host.user_id), username: str(host.username), fullname: str(host.fullname), profile: str(host.profile ?? host.profile_image) } : null,
    max_players: num(o.max_players, 24) || 24,
    player_count: num(o.player_count, players.length),
    players: players.sort((a, b) => a.slot - b.slot),
    me: { in_race: bool(me.in_race), slot: me.slot == null ? null : num(me.slot), can_reserve: me.can_reserve === undefined ? true : bool(me.can_reserve) },
    winner: winner && num(winner.user_id) ? { user_id: num(winner.user_id), username: str(winner.username), bbs: num(winner.bbs) } : null,
    room_name: str(o.room_name),
    recent_gifts: (Array.isArray(o.recent_gifts) ? o.recent_gifts : []).map((g): DogRaceGift | null => {
      const x = obj(g);
      if (!x || !num(x.id)) return null;
      return {
        id: num(x.id), slot: num(x.slot), to_user_id: num(x.to_user_id), from_user_id: num(x.from_user_id),
        from_username: str(x.from_username), gift_id: num(x.gift_id), gift_name: str(x.gift_name),
        icon_url: str(x.icon_url), gif_url: str(x.gif_url), bbs: num(x.bbs),
      };
    }).filter((g): g is DogRaceGift => !!g).sort((a, b) => a.id - b.id),
  };
}

export type DogRaceResult = { ok: true; race: DogRaceState | null } | { ok: false; reason: string; message: string };

function fail(res: { message?: string } & Raw): DogRaceResult {
  const reason = typeof res.reason === "string" ? res.reason : typeof res.error === "string" ? res.error : "";
  return { ok: false, reason, message: typeof res.message === "string" ? res.message : "" };
}

/** The room's current race (lobby/racing, or finished within the last minute), or null. */
export async function fetchDogRace(userId: number, roomName: string): Promise<DogRaceResult> {
  const res = await post<unknown>("fetchDogRace", { user_id: userId, room_name: roomName });
  if (!res.status) return fail(res);
  return { ok: true, race: parseDogRace(res.data) };
}

export async function fetchDogRaceResults(userId: number, raceId: number): Promise<DogRaceState | null> {
  const res = await post<unknown>("fetchDogRaceResults", { user_id: userId, race_id: raceId }).catch(() => null);
  return res?.status ? parseDogRace(res.data) : null;
}

/** Host only, in their own room; minutes 3..10. */
export async function startDogRace(userId: number, roomName: string, minutes: number): Promise<DogRaceResult> {
  const res = await post<unknown>("startDogRace", { user_id: userId, room_name: roomName, minutes: Math.min(10, Math.max(3, Math.round(minutes))) });
  if (!res.status) return fail(res);
  return { ok: true, race: parseDogRace(res.data) };
}

export async function reserveDogRaceSpot(userId: number, raceId: number): Promise<DogRaceResult> {
  const res = await post<unknown>("reserveDogRaceSpot", { user_id: userId, race_id: raceId });
  if (!res.status) return fail(res);
  return { ok: true, race: parseDogRace(res.data) };
}

export async function leaveDogRace(userId: number, raceId: number): Promise<DogRaceResult> {
  const res = await post<unknown>("leaveDogRace", { user_id: userId, race_id: raceId });
  if (!res.status) return fail(res);
  return { ok: true, race: parseDogRace(res.data) };
}

/** A gift from a tile's red gift box: a normal gift TO THAT PLAYER, tagged with the race. The
 *  server prices it from gift_id (coins sent too, for a server that does not know dog_race_id). */
export async function sendDogRaceGift(input: { myId: number; toUserId: number; giftId: number; coins: number; roomName: string; raceId: number }) {
  return post("sendCoinsToUser", {
    my_user_id: input.myId,
    user_id: input.toUserId,
    gift_id: input.giftId,
    coins: input.coins,
    room_name: input.roomName,
    dog_race_id: input.raceId,
  });
}

/** Grid shape (columns x rows) for N tiles, from the contract: 2 1x2, ≤4 2x2, ≤6 2x3, ≤9 3x3,
 *  ≤12 3x4, ≤16 4x4, ≤20 4x5, ≤24 4x6. */
export function dogRaceGrid(n: number): { cols: number; rows: number } {
  if (n <= 1) return { cols: 1, rows: 1 };
  if (n <= 2) return { cols: 1, rows: 2 };
  if (n <= 4) return { cols: 2, rows: 2 };
  if (n <= 6) return { cols: 2, rows: 3 };
  if (n <= 9) return { cols: 3, rows: 3 };
  if (n <= 12) return { cols: 3, rows: 4 };
  if (n <= 16) return { cols: 4, rows: 4 };
  if (n <= 20) return { cols: 4, rows: 5 };
  return { cols: 4, rows: 6 };
}

/** "m:ss" for a countdown in ms. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
