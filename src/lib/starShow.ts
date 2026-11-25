// Star shows (Steve, 2026-11-25, spec v9): "Bingg Bongg's Most Beautiful Woman" (kind woman) and
// "The Best Looking Guy On Bingg Bongg" (kind man) — one engine. The host only presents; up to 8
// guests (18+, women only / men only, self-declared once) stand on a 9-tile stage; viewers tap a
// guest's gold VOTE, which opens the normal Gifts page aimed at her — the gift IS the vote and its
// BBs are the points. 5-minute rounds from 0, the leader in the big 2x2 tile, an 8 s break with
// the winner card between rounds, and (optional) the lowest score leaves for the next person
// waiting.
//
// Server contract: side-session-notes star-shows-contract.md (backend branch star-shows,
// StarShowController + StarShowService). Every write answers {status, reason?, message, data}
// where data is the show as the caller sees it (null = no show running).
import { post } from "./api";
import { tt, type StringKey } from "./i18n";

export type StarKind = "woman" | "man";
export type StarRefusal = "need_confirm" | "under_18" | "wrong_show" | "banned";

export interface StarPerson { user_id: number; name: string; username: string | null; profile_image: string | null }
export interface StarRow extends StarPerson { score: number; joined_order: number; rank: number }
export interface StarLastRound {
  round_no: number;
  winner: (StarPerson & { score: number }) | null;
  tie: boolean;
  podium: { user_id: number; name: string; score: number }[];
  left: StarPerson | null;
  joined: StarPerson[];
  next_round_in: number;
}
export interface StarShow {
  show_id: number;
  kind: StarKind;
  title: string;
  room_name: string;
  host_user_id: number;
  lowest_leaves: boolean;
  round_no: number;
  round_minutes: number;
  phase: "round" | "break";
  round_id: number | null;
  /** Seconds left in the round as the server measured it (ends_at - server_now when both came). */
  seconds_left: number;
  max_tiles: number;
  seats_left: number;
  leader_user_id: number | null;
  /** Guests only — never the host. */
  stage: StarRow[];
  waiting: StarPerson[];
  last_round: StarLastRound | null;
  /** fetchMyStarShow only (undefined from the public read). */
  my_refusal?: StarRefusal | null;
  /** The host only. Nobody else ever sees a percentage or a money line. */
  host_pay?: { percent: number; line: string; earned_bbs: number } | null;
}

const num = (v: unknown, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const truthy = (v: unknown) => v === true || v === 1 || v === "1" || v === "true";
const str = (v: unknown) => (v == null ? "" : String(v));
const strOrNull = (v: unknown) => (v == null || v === "" ? null : String(v));

function person(raw: unknown): StarPerson | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const id = num(p.user_id);
  if (id <= 0) return null;
  return { user_id: id, name: str(p.name ?? p.fullname ?? p.username), username: strOrNull(p.username), profile_image: strOrNull(p.profile_image) };
}

/** The wire's 0/1s and numeric strings made into what the screen expects; null = no show. */
export function normStarShow(raw: unknown): StarShow | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const id = num(d.show_id);
  if (id <= 0) return null;
  const stage = (Array.isArray(d.stage) ? d.stage : []).map((r, i): StarRow | null => {
    const p = person(r);
    if (!p) return null;
    const x = r as Record<string, unknown>;
    return { ...p, score: num(x.score), joined_order: num(x.joined_order, i), rank: num(x.rank, i + 1) };
  }).filter((r): r is StarRow => !!r);
  const lr = d.last_round && typeof d.last_round === "object" ? (d.last_round as Record<string, unknown>) : null;
  const winner = lr ? person(lr.winner) : null;
  // The clock: ends_at - server_now (so a slow reply does not shift it), else seconds_left.
  const endsAt = Date.parse(str(d.ends_at)), serverNow = Date.parse(str(d.server_now));
  const secondsLeft = Number.isFinite(endsAt) && Number.isFinite(serverNow) ? Math.max(0, Math.round((endsAt - serverNow) / 1000)) : Math.max(0, num(d.seconds_left));
  const refusal = str(d.my_refusal);
  const hp = d.host_pay && typeof d.host_pay === "object" ? (d.host_pay as Record<string, unknown>) : null;
  return {
    show_id: id,
    kind: d.kind === "man" ? "man" : "woman",
    title: str(d.title),
    room_name: str(d.room_name),
    host_user_id: num(d.host_user_id),
    lowest_leaves: truthy(d.lowest_leaves),
    round_no: Math.max(1, num(d.round_no, 1)),
    round_minutes: num(d.round_minutes, 5),
    phase: d.phase === "break" ? "break" : "round",
    round_id: d.round_id == null ? null : num(d.round_id),
    seconds_left: d.phase === "break" ? 0 : secondsLeft,
    max_tiles: num(d.max_tiles, 9),
    seats_left: Math.max(0, num(d.seats_left)),
    leader_user_id: d.leader_user_id == null ? null : num(d.leader_user_id) || null,
    stage,
    waiting: (Array.isArray(d.waiting) ? d.waiting : []).map(person).filter((p): p is StarPerson => !!p),
    last_round: lr ? {
      round_no: num(lr.round_no),
      winner: winner ? { ...winner, score: num((lr.winner as Record<string, unknown>).score) } : null,
      tie: truthy(lr.tie),
      podium: (Array.isArray(lr.podium) ? lr.podium : []).map((r: Record<string, unknown>) => ({ user_id: num(r.user_id), name: str(r.name), score: num(r.score) })),
      left: person(lr.left),
      joined: (Array.isArray(lr.joined) ? lr.joined : []).map(person).filter((p): p is StarPerson => !!p),
      next_round_in: Math.max(0, num(lr.next_round_in)),
    } : null,
    my_refusal: d.my_refusal === undefined ? undefined
      : (["need_confirm", "under_18", "wrong_show", "banned"] as const).find((r) => r === refusal) ?? null,
    host_pay: hp ? { percent: num(hp.percent), line: str(hp.line), earned_bbs: num(hp.earned_bbs) } : null,
  };
}

export interface StarResult { ok: boolean; reason: string | null; message: string | null; show: StarShow | null; removed: number[]; queued: boolean }

async function call(route: string, params: Record<string, unknown>): Promise<StarResult> {
  const res = await post<unknown>(route, params);
  const r = res as unknown as Record<string, unknown>;
  return {
    ok: !!res.status,
    reason: (r.reason as string) ?? null,
    message: (r.message as string) ?? null,
    show: normStarShow(r.data),
    removed: Array.isArray(r.removed_user_ids) ? r.removed_user_ids.map((x) => num(x)).filter((x) => x > 0) : [],
    queued: truthy(r.queued),
  };
}

/** Signed in: the show as this member sees it (my_refusal; host_pay for the host). */
export const fetchMyStarShow = (myUserId: number, roomName: string) => call("fetchMyStarShow", { my_user_id: myUserId, room_name: roomName });
/** Anyone (signed-out web viewers too): the public show. */
export const fetchStarShow = (roomName: string) => call("fetchStarShow", { room_name: roomName });

export const startStarShow = (myUserId: number, roomName: string, kind: StarKind, lowestLeaves: boolean) =>
  call("startStarShow", { my_user_id: myUserId, room_name: roomName, kind, lowest_leaves: lowestLeaves ? 1 : 0 });
export const updateStarShow = (myUserId: number, roomName: string, lowestLeaves: boolean) =>
  call("updateStarShow", { my_user_id: myUserId, room_name: roomName, lowest_leaves: lowestLeaves ? 1 : 0 });
export const nextStarShowRound = (myUserId: number, roomName: string) => call("nextStarShowRound", { my_user_id: myUserId, room_name: roomName });
export const endStarShow = (myUserId: number, roomName: string) => call("endStarShow", { my_user_id: myUserId, room_name: roomName });
export const removeStarShowGuest = (myUserId: number, roomName: string, targetUserId: number, ban: boolean) =>
  call("removeStarShowGuest", { my_user_id: myUserId, room_name: roomName, target_user_id: targetUserId, ban: ban ? 1 : 0 });
/** The once-only "I am a woman / man, 18 or older" + birthday (YYYY-MM-DD). */
export const confirmStarShowGuest = (myUserId: number, gender: StarKind, dateOfBirth: string) =>
  call("confirmStarShowGuest", { my_user_id: myUserId, gender, date_of_birth: dateOfBirth });

/** Reasons a guest cannot ask for a seat; anything else from requestToJoinLive is not ours. */
export const isStarRefusal = (r: string | null | undefined): r is StarRefusal => r === "need_confirm" || r === "under_18" || r === "wrong_show" || r === "banned";

/** A refusal in the member's language (the server's English otherwise). */
export function starReasonText(reason: string | null, message: string | null, kind: StarKind = "woman"): string {
  const k: Partial<Record<string, StringKey>> = {
    need_confirm: "sts_r_need_confirm",
    under_18: "sts_r_under_18",
    wrong_show: kind === "man" ? "sts_r_wrong_show_men" : "sts_r_wrong_show_women",
    banned: "sts_r_banned",
    full: "sts_r_full",
    queued: "sts_r_queued",
    not_enabled: "sts_r_not_enabled",
    no_show: "sts_r_no_show",
    host_need_birthday: "sts_r_host_need_birthday",
    host_under_18: "sts_r_host_under_18",
    battle_running: "sts_r_battle_running",
    too_many_guests: "sts_r_too_many_guests",
    bad_birthday: "sts_r_bad_birthday",
    already_confirmed: "sts_r_already_confirmed",
    not_a_guest: "sts_r_not_a_guest",
    host_only: "sts_r_host_only",
  };
  const key = reason ? k[reason] : undefined;
  return key ? tt(key) : message || tt("something_went_wrong");
}

/**
 * The show's report reasons. `en` is what the server files (it takes a guest off stage at once on
 * "under 18" — matched in English), the key is what the member reads.
 */
export const STAR_REPORT_REASONS: { en: string; key: StringKey }[] = [
  { en: "Looks under 18", key: "sts_rep_under_18" },
  { en: "Wrong show", key: "sts_rep_wrong_show" },
  { en: "Nudity / sexual", key: "sts_rep_nudity" },
  { en: "Harassment", key: "sts_rep_harassment" },
  { en: "Other", key: "sts_rep_other" },
];

/** reportUser with the room, so the server knows it is a show guest. */
export function reportStarGuest(userId: number, reasonEn: string, roomName: string) {
  return post("reportUser", { user_id: userId, reason: reasonEn, description: reasonEn, room_name: roomName });
}

/** The show's name in the member's language. */
export const starTitleKey = (kind: StarKind): StringKey => (kind === "man" ? "sts_title_man" : "sts_title_woman");
