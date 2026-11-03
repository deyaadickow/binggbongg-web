// Chat Battle (#9, was "Solo Battle With Unlimited Players"; Steve, 2026-11-03): "I want it to be
// the same as country battle with up to 24 tiles changing on the host's screen, Every one that is
// battling will have a host screen exactly the same as country battle."
//
// The wire contract and nothing more (scratchpad chat_battle_api.md). The server is the authority
// for every rule — the join window, the places, the score, the winner. Internal names stay on
// purpose: the endpoints startSoloBattle / joinSoloBattle / fetchActiveSoloBattleForHost, kind
// 'solo', the solo_* string keys. Only what members READ says "Chat Battle".
//
// Never send an empty POST body (the LiteSpeed WAF 403s it) — every call carries user_id.
import { post } from "./api";
import { noteServerNow } from "./countryBattle";
import type { StringKey } from "./i18n";

export interface ChbPerson {
  user_id: number;
  name?: string | null;
  username?: string | null;
  profile_image?: string | null;
}

export interface ChbBattler extends ChbPerson {
  score: number;
  rank: number;
  is_live: boolean;
  left: boolean;
  is_starter: boolean;
  home_room_name: string | null;
  /** The chat thread for this battler's strip: their home room, else the shared room. */
  chat_room_name: string | null;
}

export type ChbPhase = "joining" | "battle" | "ended";

export interface ChbMe {
  user_id: number;
  is_battler: boolean;
  is_live: boolean;
  left: boolean;
  score: number | null;
  rank: number | null;
  home_room_name: string | null;
  can_join: boolean;
  join_reason: string | null;
}

export interface ChbState {
  contest_id: number;
  name: string;
  shared: boolean;
  phase: ChbPhase;
  server_now: string;
  created_at: string;
  /** Join window ends = gifts START counting. */
  starts_at: string;
  ends_at: string;
  phase_ends_at: string | null;
  room_name: string | null;
  room_open: boolean;
  starter: ChbPerson | null;
  max_battlers: number;
  battler_count: number;
  live_count: number;
  spaces_left: number;
  can_join_now: boolean;
  /** Every battler, best score first. */
  battlers: ChbBattler[];
  /** User ids with a tile right now — shuffled by the server, order means nothing. */
  live: number[];
  winner: (ChbPerson & { score: number }) | null;
  tie: boolean;
  finished: boolean;
  me: ChbMe;
}

/** What start/join answer: the contest summary plus, for a Chat Battle, where to go. */
export interface ChbEntry {
  id: number;
  name?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  shared: boolean;
  chat_battle_contest_id: number | null;
  room_name: string | null;
  role?: string | null;
  rejoined?: boolean;
  home_room_name?: string | null;
  chat_battle?: ChbState | null;
}

export type ChbResult<T> = { ok: true; data: T } | { ok: false; reason: string; message: string; full: boolean };

function fail(res: { message?: string } & Record<string, unknown>, fallback: string): { ok: false; reason: string; message: string; full: boolean } {
  return {
    ok: false,
    reason: typeof res.reason === "string" ? res.reason : "",
    message: res.message || fallback,
    full: res.full === true || res.reason === "full" || res.reason === "too_many",
  };
}

/** The 5-second state poll. `live` = 1 only while CONNECTED AND PUBLISHING to the room. */
export async function chatBattleHeartbeat(userId: number, contestId: number, live: boolean): Promise<ChbResult<ChbState>> {
  const res = await post<ChbState>("chatBattleHeartbeat", { user_id: userId, contest_id: contestId, live: live ? 1 : 0 });
  if (!res.status || !res.data) return fail(res, "");
  noteServerNow(res.data.server_now);
  const d = res.data;
  return {
    ok: true,
    data: { ...d, battlers: Array.isArray(d.battlers) ? d.battlers : [], live: Array.isArray(d.live) ? d.live.map(Number) : [] },
  };
}

/** Start one from your own live room. shared_room=1 asks for a Chat Battle; the server answers
 *  shared:false (the old own-room flow) when the switch is off — branch on the answer. */
export async function startChatBattle(hostUserId: number): Promise<ChbResult<ChbEntry>> {
  const res = await post<ChbEntry>("startSoloBattle", { host_user_id: hostUserId, user_id: hostUserId, shared_room: 1 });
  if (!res.status || !res.data) return fail(res, "");
  return { ok: true, data: res.data };
}

/** Join during the window, or rejoin any time before the end (a battler who dropped or left). */
export async function joinChatBattle(userId: number, contestId: number): Promise<ChbResult<ChbEntry>> {
  const res = await post<ChbEntry>("joinSoloBattle", { contest_id: contestId, user_id: userId });
  if (!res.status || !res.data) return fail(res, "");
  return { ok: true, data: res.data };
}

/** Idempotent. Your tile goes, your score stays, the battle goes on. */
export async function leaveChatBattle(userId: number, contestId: number) {
  return post<{ home_room_name?: string | null }>("leaveChatBattle", { user_id: userId, contest_id: contestId });
}

export interface ChbLiveRoom {
  is_live: boolean;
  room_name: string | null;
  broadcaster_user_id: number;
  broadcaster_name?: string | null;
  broadcaster_image?: string | null;
  /** Non-null = that room is a Chat Battle's shared room: open the Chat Battle screen instead. */
  chat_battle_contest_id: number | null;
}

/** Where is this member live right now? */
export async function checkUserLiveRoom(userId: number): Promise<ChbLiveRoom | null> {
  const res = await post<ChbLiveRoom>("checkUserLiveRoom", { user_id: userId }).catch(() => null);
  if (!res?.status || !res.data) return null;
  return { ...res.data, chat_battle_contest_id: res.data.chat_battle_contest_id ? Number(res.data.chat_battle_contest_id) : null };
}

/** A gift from a tile's gift box: priced from gift_id on the server (no coins sent), and refused
 *  unless the recipient is a battler of this Chat Battle. */
export async function sendChatBattleGift(input: { myId: number; toUserId: number; giftId: number; roomName: string; contestId: number }) {
  return post("sendCoinsToUser", {
    my_user_id: input.myId,
    user_id: input.toUserId,
    gift_id: input.giftId,
    room_name: input.roomName,
    chat_battle_contest_id: input.contestId,
  });
}

/** The URL of the Chat Battle screen. `home` pins the battler a viewer followed in; `battler`
 *  says this browser is already a battler (it just started or joined) and should publish. */
export function chatBattlePath(contestId: number, opts: { home?: number | null; battler?: boolean } = {}): string {
  const q = new URLSearchParams();
  if (opts.home) q.set("home", String(opts.home));
  if (opts.battler) q.set("battler", "1");
  const s = q.toString();
  return `/chat-battle/${contestId}${s ? `?${s}` : ""}`;
}

/** The firebase chat channel of a room is `${room}__${roomHostId}` (lib/firebase chatChannel). */
export function roomHostId(roomName: string | null | undefined): number {
  return Number(roomName?.match(/^bb-(?:live|priv)-(\d+)-\d+$/)?.[1] ?? 0);
}

/** The grid: ≤6 live → 6 tiles (2 across), ≤12 → 12 (4 across), more → 24 — the three Country
 *  Battle layouts, picked by how many are live instead of by the day. */
export function chatBattleStage(liveCount: number): "sunday" | "saturday" | "weekday" {
  return liveCount <= 6 ? "sunday" : liveCount <= 12 ? "saturday" : "weekday";
}

/** Why a start/join/me.can_join was refused, in the member's language. The server's `reason` is
 *  matched as a code; anything else shows the server's own message. */
export function chatReasonText(t: (k: StringKey) => string, reason: string | null | undefined, message?: string | null): string {
  switch (reason) {
    case "full": return t("chb_full");
    case "too_many": return t("chb_too_many");
    case "already_running": return t("chb_already_running");
    case "started": return t("chb_started");
    case "ended": return t("chb_over");
    case "busy": return t("chb_busy");
    case "not_live_eligible": return t("cb_not_live_eligible");
    case "not_set_up": return t("chb_not_set_up");
    case "not_found": return t("chb_over");
    case "signin": return t("cb_signin");
    default: return message || t("couldn_t_join_that_solo_battle_with_unli");
  }
}
