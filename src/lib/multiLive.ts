// Multi-live 24 (Steve, 2026-11-05): "I would like to add up to 24 members online at the same
// time. But. I only want 4 members to have their speaker on at the same time including the host.
// If anyone wants to speak they can click the muted speaker I-con and the speaker I-con will turn
// into a yellow hand ... The host will have to mute one of the members first to be able to unmute
// who ever he wants. All the members that are able to speek will be on top row one next to the
// other. The host can also start a battle with all 24 members. All members will have a gift box
// on their screen."
//
// Server contract: binggbongg-backend docs/multi_live_24_contract.md. The server is the authority
// for everything — who is on camera, who has sound, the hands queue, the order, the battle. Every
// write answers the whole room state and the screen is drawn from that.
import { post } from "./api";
import { tt, type StringKey } from "./i18n";

/** Today's room. Rooms of this size or smaller keep today's 4-tile layout. */
export const ML_DEFAULT_SIZE = 4;
export const ML_MIN_SIZE = 2;
export const ML_MAX_SIZE = 24;

export interface MlMember {
  user_id: number;
  name?: string | null;
  username?: string | null;
  profile_image?: string | null;
  is_host: boolean;
  is_speaker: boolean;
  hand_raised: boolean;
  hand_order: number | null;
  row: "top" | "grid";
  position: number;
}

export interface RoomBattleRow { user_id: number; name?: string | null; username?: string | null; profile_image?: string | null; score: number; rank: number; on_camera?: boolean }

export interface RoomBattle {
  battle_id: number;
  room_name: string;
  phase: "battle" | "ended";
  finished: boolean;
  ended_early?: boolean;
  seconds_left: number;
  minutes: number;
  leaderboard: RoomBattleRow[];
  winner: RoomBattleRow | null;
  tie: boolean;
  no_gifts: boolean;
  // Bingg Bongg Battle (Steve, 2026-11-06): "Double and triple points will appear at random ...
  // Bombs will be giving out to any member of their choice, A small bomb will show in a corner of
  // the tile for anyone that receives it for 40 seconds." The leaderboard's score is battle points.
  /** The battle's random double/triple windows (server times). */
  boosts: RoomBattleBoost[];
  /** The window running right now, or null. */
  boost_now: { multiplier: number; ends_at: string | null; seconds_left: number } | null;
  /** Battlers with a bomb on them right now. */
  bombs: { user_id: number; ends_at: string | null; seconds_left: number }[];
}

export interface RoomBattleBoost { starts_at: string | null; ends_at: string | null; multiplier: number }

export interface MlState {
  room_name: string;
  state_version: number;
  host_user_id: number;
  max_members: number;
  effective_max_members: number;
  global_max_members: number;
  member_count: number;
  seats_left: number;
  max_speakers: number;
  speaker_count: number;
  speaker_slots_left: number;
  speakers: number[];
  hands: number[];
  order: number[];
  members: MlMember[];
  room_battle: RoomBattle | null;
}

const truthy = (v: unknown) => v === true || v === 1 || v === "1" || v === "true";
const num = (v: unknown, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

/** The wire's 0/1s and numeric strings, made into what the screen expects. */
export function normalizeMl(raw: unknown): MlState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.state_version == null) return null;
  const members = (Array.isArray(r.members) ? r.members : []).map((m: Record<string, unknown>) => ({
    user_id: num(m.user_id),
    name: (m.name as string) ?? null,
    username: (m.username as string) ?? null,
    profile_image: (m.profile_image as string) ?? null,
    is_host: truthy(m.is_host),
    is_speaker: truthy(m.is_speaker),
    hand_raised: truthy(m.hand_raised),
    hand_order: m.hand_order == null ? null : num(m.hand_order),
    row: m.row === "top" ? "top" as const : "grid" as const,
    position: num(m.position),
  })).filter((m) => m.user_id > 0);
  const ids = (v: unknown) => (Array.isArray(v) ? v.map((x) => num(x)).filter((x) => x > 0) : []);
  return {
    room_name: String(r.room_name ?? ""),
    state_version: num(r.state_version),
    host_user_id: num(r.host_user_id),
    max_members: num(r.max_members, ML_DEFAULT_SIZE),
    effective_max_members: num(r.effective_max_members ?? r.max_members, ML_DEFAULT_SIZE),
    global_max_members: Math.min(ML_MAX_SIZE, Math.max(ML_DEFAULT_SIZE, num(r.global_max_members, ML_MAX_SIZE))),
    member_count: num(r.member_count, members.length || 1),
    seats_left: num(r.seats_left),
    max_speakers: num(r.max_speakers, 4),
    speaker_count: num(r.speaker_count),
    speaker_slots_left: num(r.speaker_slots_left),
    speakers: ids(r.speakers),
    hands: ids(r.hands),
    order: ids(r.order),
    members,
    room_battle: normalizeBattle(r.room_battle),
  };
}

export function normalizeBattle(raw: unknown): RoomBattle | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (b.battle_id == null) return null;
  const row = (x: Record<string, unknown>): RoomBattleRow => ({
    user_id: num(x.user_id), name: (x.name as string) ?? null, username: (x.username as string) ?? null,
    profile_image: (x.profile_image as string) ?? null, score: num(x.score), rank: num(x.rank), on_camera: truthy(x.on_camera),
  });
  return {
    battle_id: num(b.battle_id),
    room_name: String(b.room_name ?? ""),
    phase: b.phase === "ended" ? "ended" : "battle",
    finished: truthy(b.finished),
    ended_early: truthy(b.ended_early),
    seconds_left: Math.max(0, num(b.seconds_left)),
    minutes: num(b.minutes, 5),
    leaderboard: (Array.isArray(b.leaderboard) ? b.leaderboard : []).map(row),
    winner: b.winner && typeof b.winner === "object" ? row(b.winner as Record<string, unknown>) : null,
    tie: truthy(b.tie),
    no_gifts: truthy(b.no_gifts),
    boosts: (Array.isArray(b.boosts) ? b.boosts : []).map((x: Record<string, unknown>) => ({
      starts_at: (x.starts_at as string) ?? null, ends_at: (x.ends_at as string) ?? null, multiplier: num(x.multiplier, 2),
    })),
    boost_now: b.boost_now && typeof b.boost_now === "object" ? (() => {
      const x = b.boost_now as Record<string, unknown>;
      return { multiplier: num(x.multiplier, 2), ends_at: (x.ends_at as string) ?? null, seconds_left: Math.max(0, num(x.seconds_left)) };
    })() : null,
    bombs: (Array.isArray(b.bombs) ? b.bombs : []).map((x: Record<string, unknown>) => ({
      user_id: num(x.user_id), ends_at: (x.ends_at as string) ?? null, seconds_left: Math.max(0, num(x.seconds_left)),
    })).filter((x) => x.user_id > 0 && x.seconds_left > 0),
  };
}

export const mlName = (m: { name?: string | null; username?: string | null } | null | undefined) => m?.name || m?.username || "";

/** Is this a big room (the 24-tile grid, muted joins, the 5 s poll)? */
export const mlIsBig = (s: MlState | null | undefined) => !!s && s.effective_max_members > ML_DEFAULT_SIZE;

export interface MlWriteResult { ok: boolean; message: string | null; reason: string | null; state: MlState | null; battle: RoomBattle | null; memberCount: number | null }

/** One write: {my_user_id, room_name, ...} -> {status, message, reason?, data: state}. */
export async function mlWrite(route: string, myUserId: number, roomName: string, extra: Record<string, unknown> = {}): Promise<MlWriteResult> {
  const res = await post<unknown>(route, { my_user_id: myUserId, room_name: roomName, ...extra });
  const r = res as unknown as Record<string, unknown>;
  const data = r.data as Record<string, unknown> | null | undefined;
  const state = normalizeMl(data);
  const battle = normalizeBattle(data?.battle) ?? (state ? null : normalizeBattle(data));
  return {
    ok: !!res.status,
    message: (r.message as string) ?? null,
    reason: (r.reason as string) ?? null,
    state,
    battle,
    memberCount: r.member_count != null ? num(r.member_count) : data?.member_count != null ? num(data.member_count) : null,
  };
}

/** Bingg Bongg Battle (Steve, 2026-11-06): "Bombs will be giving out to any member of their
 *  choice". POST dropRoomBattleBomb -> {status, message, bombs_count, battle, data} or
 *  {status:false, reason: no_battle|not_in_battle|bomb_running|no_bombs, message}. */
export async function dropRoomBattleBomb(myUserId: number, roomName: string, targetUserId: number): Promise<MlWriteResult & { bombsCount: number | null }> {
  const res = await post<unknown>("dropRoomBattleBomb", { my_user_id: myUserId, room_name: roomName, target_user_id: targetUserId });
  const r = res as unknown as Record<string, unknown>;
  const data = r.data as Record<string, unknown> | null | undefined;
  const state = normalizeMl(data);
  return {
    ok: !!res.status,
    message: (r.message as string) ?? null,
    reason: (r.reason as string) ?? null,
    state,
    battle: normalizeBattle(r.battle) ?? normalizeBattle(data?.battle) ?? state?.room_battle ?? null,
    memberCount: null,
    bombsCount: r.bombs_count != null ? num(r.bombs_count) : null,
  };
}

/** A refusal in the member's language (the server's English message otherwise). */
export function mlReasonText(reason: string | null, message: string | null, memberCount?: number | null): string {
  const k: Partial<Record<string, StringKey>> = {
    speakers_full: "ml_speakers_full",
    not_enough_members: "ml_battle_needs",
    battle_running: "ml_battle_running",
    not_ready: "ml_not_ready",
    full: "ml_room_full",
    no_battle: "bbb_no_battle",
    not_in_battle: "bbb_not_in_battle",
    bomb_running: "bbb_bomb_running",
    no_bombs: "bbb_no_bombs",
  };
  if (reason === "below_current") return tt("ml_size_below", memberCount ?? "");
  const key = reason ? k[reason] : undefined;
  return key ? tt(key) : message || tt("something_went_wrong");
}

const SIZE_KEY = "bb.ml.size";
/** The host's last chosen room size (a per-browser convenience, like the phones' saved size). */
export function savedRoomSize(): number {
  try { const n = Number(localStorage.getItem(SIZE_KEY)); if (n >= ML_MIN_SIZE && n <= ML_MAX_SIZE) return n; } catch { /* private mode */ }
  return ML_DEFAULT_SIZE;
}
export function saveRoomSize(n: number) { try { localStorage.setItem(SIZE_KEY, String(n)); } catch { /* private mode */ } }

/** m:ss from a number of seconds. */
export const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;
