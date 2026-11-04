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
import { countryBattlePath, noteServerNow } from "./countryBattle";
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

/** "upcoming" is Country Battle's only (the room is not open yet); a Chat Battle never sends it. */
export type ChbPhase = "upcoming" | "joining" | "battle" | "ended";

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
  /** Round 2: null unless I am the STARTER of a battle with bonus terms. `amount` is dollars —
   *  the running figure while it runs, the paid amount once `paid`. Never shown to anyone else. */
  starter_bonus?: ChbStarterBonus | null;
}

export interface ChbStarterBonus {
  amount: number;
  paid: boolean;
  percent: number;
  cap: number;
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
  /** null = NO LIMIT (Steve 2026-11-03/04). The server may quietly cap a battle, but it never says so here: only a join answers reason "full". */
  max_battlers: number | null;
  battler_count: number;
  live_count: number;
  /** null = NO LIMIT — show no "places left" / "full" line. */
  spaces_left: number | null;
  /** true when max_battlers is null (the server sends it; older answers may not). */
  unlimited?: boolean;
  can_join_now: boolean;
  /** Every battler, best score first. */
  battlers: ChbBattler[];
  /** User ids with a tile right now — shuffled by the server, order means nothing. */
  live: number[];
  winner: (ChbPerson & { score: number }) | null;
  tie: boolean;
  finished: boolean;
  me: ChbMe;
  /** Country Battle: a test day (testers only) — show the small banner. */
  is_test?: boolean;
  /** Country Battle: once finished, the podium (ties already broken by who reached it first). */
  top3?: (ChbPerson & { place: number; score: number })[];
  /** Country Battle: the lobby opens (room opens, joining opens). */
  opens_at?: string | null;
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
  /** Round 2, start only: "queued" = the starter's followers are being told now; "throttled" =
   *  already told within the hour; "off" = switched off in admin (or not deployed). */
  follower_alert?: { status: "queued" | "throttled" | "off" | string; next_allowed_at: string | null } | null;
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
  /** Non-null = that room is a Country Battle's shared room: open the Country Battle screen. */
  country_battle_day_id: number | null;
}

/** Where is this member live right now? */
export async function checkUserLiveRoom(userId: number): Promise<ChbLiveRoom | null> {
  const res = await post<ChbLiveRoom>("checkUserLiveRoom", { user_id: userId }).catch(() => null);
  if (!res?.status || !res.data) return null;
  return {
    ...res.data,
    chat_battle_contest_id: res.data.chat_battle_contest_id ? Number(res.data.chat_battle_contest_id) : null,
    country_battle_day_id: res.data.country_battle_day_id ? Number(res.data.country_battle_day_id) : null,
  };
}

/** The battle screen a live member is on (Chat Battle or Country Battle), with them as the home
 *  tile — or null when they are in an ordinary live room. */
export function battleScreenPath(r: ChbLiveRoom, home: number | null): string | null {
  if (r.chat_battle_contest_id) return chatBattlePath(r.chat_battle_contest_id, { home });
  if (r.country_battle_day_id) return countryBattlePath(r.country_battle_day_id, { home });
  return null;
}

/** Round 2: the "cb_gift" data message, exactly as the server hands it to the sender. */
export interface ChbGiftMsg {
  from: string;
  to: string;
  from_user_id: number;
  to_user_id: number;
  from_name?: string | null;
  to_name?: string | null;
  gift_id: number;
  gift_name?: string | null;
  icon_url?: string | null;
  coins?: number;
}

/** Round 2: what a confirmed tile gift answers (`chat_battle_gift`, absent before the deploy). */
export interface ChbGiftInfo {
  /** Chat Battle's id; a Country Battle gift carries day_id instead. */
  contest_id?: number;
  day_id?: number;
  gift_id: number;
  gift_name?: string | null;
  icon_url?: string | null;
  gif_url?: string | null;
  coins?: number;
  sender: ChbPerson;
  receiver: ChbPerson;
  cb_gift: ChbGiftMsg;
}

/** A cb_gift payload off the wire, checked — anything malformed is dropped. */
export function parseGiftMsg(payload: unknown): ChbGiftMsg | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const fromId = Number(p.from_user_id ?? String(p.from ?? "").replace(/^user_/, ""));
  const toId = Number(p.to_user_id ?? String(p.to ?? "").replace(/^user_/, ""));
  if (!fromId || !toId) return null;
  return {
    from: `user_${fromId}`, to: `user_${toId}`, from_user_id: fromId, to_user_id: toId,
    from_name: typeof p.from_name === "string" ? p.from_name : null,
    to_name: typeof p.to_name === "string" ? p.to_name : null,
    gift_id: Number(p.gift_id ?? 0),
    gift_name: typeof p.gift_name === "string" ? p.gift_name : null,
    icon_url: typeof p.icon_url === "string" ? p.icon_url : null,
    coins: Number(p.coins ?? 0) || undefined,
  };
}

/** A gift from a tile's gift box: priced from gift_id on the server (no coins sent), and refused
 *  unless the recipient is a battler of this Chat Battle. The answer carries `chat_battle_gift`. */
export async function sendChatBattleGift(input: { myId: number; toUserId: number; giftId: number; roomName: string; contestId: number }) {
  return post("sendCoinsToUser", {
    my_user_id: input.myId,
    user_id: input.toUserId,
    gift_id: input.giftId,
    room_name: input.roomName,
    chat_battle_contest_id: input.contestId,
  });
}

/** Round 2: is this member's Chat Battle alert muted? `null` = can't tell (not deployed yet,
 *  signed out, network) — hide the toggle. */
export async function fetchChatBattleAlertMute(userId: number, hostUserId: number): Promise<{ muted: boolean; is_following: boolean } | null> {
  const res = await post<{ muted?: boolean; is_following?: boolean }>("fetchChatBattleAlertMute", { user_id: userId, host_user_id: hostUserId }).catch(() => null);
  if (!res?.status || !res.data) return null;
  return { muted: !!res.data.muted, is_following: !!res.data.is_following };
}

/** Round 2: turn Chat Battle alerts from one member off (muted) or back on. user_id is always the
 *  caller — the server binds it from the session. */
export async function setChatBattleAlertMute(userId: number, hostUserId: number, muted: boolean): Promise<{ ok: boolean; muted: boolean; message: string }> {
  const res = await post<{ muted?: boolean }>("setChatBattleAlertMute", { user_id: userId, host_user_id: hostUserId, muted: muted ? 1 : 0 }).catch(() => null);
  if (!res?.status) return { ok: false, muted: !muted, message: res?.message ?? "" };
  return { ok: true, muted: res.data?.muted ?? muted, message: res.message ?? "" };
}

/** Dollars as the starter bonus shows them: "$0.80". */
export function bonusText(amount: number | null | undefined): string {
  return `$${(Number(amount) || 0).toFixed(2)}`;
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
