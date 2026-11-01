// Country Battle (Steve, 2026-11-01): "This is the whole country Battles 3/5 minutes battle a day
// 5 days a week, Monday through Friday. [12] Members with the most score will battle 3/5 minutes
// battle on saturday, [6] Members with the most score will have the showdown on sunday with 5/5
// minutes battle. The entire battle for that week will be in a lifetime battle bord for Bragging
// Rites for all the leaders."
//
// The server is the authority for every rule (who may go live, the cap, the score, the reveal,
// the qualifiers). This file is the wire contract and nothing more: the shapes, the seven calls,
// and two helpers every screen needs — the server clock, and the {n}-style placeholders the
// shared cb_ strings use.
//
// Never send an empty POST body (the LiteSpeed WAF 403s it) — every call carries user_id.
import { useEffect, useState } from "react";
import { post } from "./api";
import { useSession } from "./session";
import type { StringKey } from "./i18n";

export type CbStage = "weekday" | "saturday" | "sunday";
export type CbPhase = "upcoming" | "lobby" | "round" | "break" | "ended";

export interface CbPerson {
  user_id: number;
  name?: string | null;
  username?: string | null;
  profile_image?: string | null;
}

export interface CbDay {
  id: number;
  date: string;
  /** 1 = Monday ... 7 = Sunday. */
  day_index: number;
  stage: CbStage;
  rounds: number;
  round_minutes: number;
  /** Not in the contract; a test day may use a shorter break. Defaults to 60. */
  break_seconds?: number;
  /** ISO 8601 UTC. */
  starts_at: string;
  ends_at: string;
  phase: CbPhase;
  current_round?: number | null;
  room_name?: string | null;
  live_count?: number;
  cap?: number;
}

export interface CbMe {
  eligible: boolean;
  reason?: string | null;
  is_live?: boolean;
  played_days?: number[];
  today_score?: number | null;
  week_total?: number | null;
  saturday_score?: number | null;
  sunday_score?: number | null;
  qualified_saturday?: boolean;
  qualified_sunday?: boolean;
  place?: number | null;
}

export interface CbBattle {
  id: number;
  country: string;
  year?: number;
  month?: number;
  month_label?: string;
  week_start?: string;
  timezone?: string;
  start_time?: string;
  scores_revealed?: boolean;
  /** Test battles (admin "Start a test battle") are only ever sent to testers. */
  is_test?: boolean | number;
  stage_today?: CbStage | null;
  days: CbDay[];
  today?: CbDay | null;
  server_now?: string;
  me?: CbMe | null;
  saturday_12?: (CbPerson & { week_total?: number })[];
  sunday_6?: (CbPerson & { saturday_score?: number })[];
  champions?: (CbPerson & { place: number; sunday_score?: number })[];
}

export interface CbStatus {
  enabled: boolean;
  country?: string | null;
  battle: CbBattle | null;
}

export interface CbHeartbeat {
  phase: CbPhase;
  current_round?: number | null;
  round_ends_at?: string | null;
  live: CbPerson[];
  live_count?: number;
  my_today_score?: number | null;
}

export interface CbParticipantRow extends CbPerson {
  days_played?: number[];
  daily?: (number | null)[] | null;
  week_total?: number | null;
  saturday_score?: number | null;
  sunday_score?: number | null;
  place?: number | null;
}

export interface CbBoardRow {
  battle_id: number;
  country: string;
  month_label?: string;
  week_start?: string;
  participants?: number;
  champions?: (CbPerson & { place: number; sunday_score?: number })[];
  sunday_6?: (CbPerson & { saturday_score?: number })[];
  saturday_12?: (CbPerson & { week_total?: number })[];
}

export interface CbBadge {
  place: number;
  country?: string;
  month_label?: string;
  battle_id?: number;
}

/** A 0/1, "0"/"1" or boolean flag off the wire. */
export const flag = (v: unknown): boolean => v === true || v === 1 || v === "1" || v === "true";

// ---- the server clock ---------------------------------------------------------------------
// Every countdown runs off the SERVER's clock: a phone whose clock is two minutes out would
// otherwise show "Starts in 0:00" while the room is still shut. The offset is measured from
// server_now on each status fetch and shared by every screen.
let clockOffset = 0;
export function noteServerNow(serverNow?: string | null) {
  if (!serverNow) return;
  const t = Date.parse(serverNow);
  if (!Number.isNaN(t)) clockOffset = t - Date.now();
}
export const serverNow = (): number => Date.now() + clockOffset;

/** Re-render once a second (countdowns). */
export function useTick(ms = 1000): number {
  const [n, setN] = useState(() => serverNow());
  useEffect(() => {
    const t = setInterval(() => setN(serverNow()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return n;
}

/** 75 s -> "1:15", 3725 s -> "1:02:05". */
export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** The cb_ strings carry {n} {total} {time} {country} {date} tokens (shared with the phones). */
export function cbText(raw: string, vars: Record<string, string | number> = {}): string {
  return raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Where a day is right now, worked out from its schedule on the server's clock. Rounds of
 *  round_minutes with a 1-minute break between them; the lobby opens 10 minutes before. */
export function dayTimeline(day: CbDay, now: number, serverPhase?: CbPhase | null, roundEndsAt?: string | null): {
  phase: CbPhase; round: number; target: number | null;
} {
  const start = Date.parse(day.starts_at);
  const L = Math.max(1, day.round_minutes || 5) * 60_000;
  const B = (day.break_seconds ?? 60) * 1000;
  const R = Math.max(1, day.rounds || 3);
  if (serverPhase === "ended" || day.phase === "ended") return { phase: "ended", round: R, target: null };
  if (Number.isNaN(start)) return { phase: serverPhase ?? day.phase, round: day.current_round ?? 0, target: null };
  if (now < start - 10 * 60_000) return { phase: "upcoming", round: 0, target: start };
  if (now < start) return { phase: "lobby", round: 0, target: start };
  for (let r = 1; r <= R; r++) {
    const rs = start + (r - 1) * (L + B);
    const re = rs + L;
    if (now < re) {
      const serverEnd = roundEndsAt ? Date.parse(roundEndsAt) : NaN;
      return { phase: "round", round: r, target: !Number.isNaN(serverEnd) && serverEnd > now ? serverEnd : re };
    }
    if (r < R && now < re + B) return { phase: "break", round: r, target: re + B };
  }
  return { phase: "ended", round: R, target: null };
}

export function stageText(t: (k: StringKey) => string, day: Pick<CbDay, "stage" | "day_index">): string {
  if (day.stage === "saturday") return t("cb_stage_saturday");
  if (day.stage === "sunday") return t("cb_stage_sunday");
  return cbText(t("cb_stage_weekday"), { n: Math.min(5, Math.max(1, day.day_index || 1)) });
}

export function roundsText(t: (k: StringKey) => string, day: Pick<CbDay, "rounds" | "round_minutes">): string {
  if (day.round_minutes === 5 && day.rounds === 3) return t("cb_rounds_3");
  if (day.round_minutes === 5 && day.rounds === 5) return t("cb_rounds_5");
  return cbText(t("cb_rounds_n"), { n: day.rounds, total: day.round_minutes });
}

/** The grid for a stage: Mon–Fri 24 tiles 4 across, Saturday 12 4 across, Sunday 6 2 across. */
export function gridShape(stage: CbStage): { cap: number; cols: number } {
  if (stage === "sunday") return { cap: 6, cols: 2 };
  if (stage === "saturday") return { cap: 12, cols: 4 };
  return { cap: 24, cols: 4 };
}

/** Why the member cannot join, in their language. The server's `reason` is matched as a code
 *  first; anything else is shown as the server wrote it. */
export function reasonText(t: (k: StringKey) => string, reason: string | null | undefined, country: string): string {
  const r = (reason ?? "").toLowerCase();
  if (!r) return "";
  if (r.includes("sign")) return t("cb_signin");
  if (r === "full") return t("cb_full");
  if (r === "ended") return t("cb_ended_today");
  if (r === "off") return t("cb_off");
  if (r === "not_set_up") return t("cb_not_set_up");
  if (r === "not_country" || r.includes("country")) return cbText(t("cb_not_country"), { country });
  if (r === "only_12" || r.includes("12") || r.includes("saturday")) return t("cb_only_12");
  if (r === "only_6" || r.includes("sunday") || r === "6") return t("cb_only_6");
  if (r === "not_open" || r.includes("open") || r.includes("lobby")) return t("cb_not_open");
  if (r.includes("live")) return t("cb_not_live_eligible");
  return reason ?? "";
}

// ---- the calls ------------------------------------------------------------------------------

export async function fetchCountryBattleStatus(userId: number, country?: string): Promise<CbStatus> {
  const res = await post<CbStatus & Partial<CbBattle>>("fetchCountryBattleStatus", {
    user_id: userId,
    ...(country ? { country } : {}),
  });
  const d = (res.data ?? { enabled: false, battle: null }) as CbStatus & Record<string, unknown>;
  // today / server_now / me / the revealed lists may come inside battle or beside it — accept both.
  const battle = d.battle ? { ...d.battle } : null;
  if (battle) {
    for (const k of ["today", "server_now", "me", "saturday_12", "sunday_6", "champions"] as const) {
      if (battle[k] === undefined && d[k] !== undefined) (battle as Record<string, unknown>)[k] = d[k];
    }
    battle.days = Array.isArray(battle.days) ? battle.days : [];
    noteServerNow(battle.server_now);
  } else {
    noteServerNow(d.server_now as string | undefined);
  }
  return { enabled: flag(d.enabled), country: d.country ?? null, battle };
}

export type JoinResult = { ok: true; roomName: string; role: string } | { ok: false; full: boolean; message: string };

export async function joinCountryBattle(userId: number, dayId: number): Promise<JoinResult> {
  const res = await post<{ room_name: string; role: string }>("joinCountryBattle", { user_id: userId, day_id: dayId });
  if (res.status && res.data?.room_name) return { ok: true, roomName: res.data.room_name, role: res.data.role ?? "guest" };
  return { ok: false, full: flag(res.full), message: res.message ?? "" };
}

export async function countryBattleHeartbeat(userId: number, dayId: number, live: boolean): Promise<CbHeartbeat | null> {
  const res = await post<CbHeartbeat>("countryBattleHeartbeat", { user_id: userId, day_id: dayId, live: live ? 1 : 0 });
  if (!res.status || !res.data) return null;
  return { ...res.data, live: Array.isArray(res.data.live) ? res.data.live : [] };
}

export async function leaveCountryBattle(userId: number, dayId: number) {
  return post("leaveCountryBattle", { user_id: userId, day_id: dayId });
}

export async function fetchCountryBattleParticipants(viewerId: number, battleId: number, profileUserId?: number) {
  const res = await post<{ scores_revealed?: boolean; rows?: CbParticipantRow[] }>("fetchCountryBattleParticipants", {
    user_id: viewerId,
    battle_id: battleId,
    ...(profileUserId ? { profile_user_id: profileUserId } : {}),
  });
  return { revealed: flag(res.data?.scores_revealed), rows: res.data?.rows ?? [] };
}

export async function fetchCountryBattleBoard(userId: number, country?: string): Promise<CbBoardRow[]> {
  const res = await post<CbBoardRow[]>("fetchCountryBattleBoard", { user_id: userId, ...(country ? { country } : {}) });
  return Array.isArray(res.data) ? res.data : [];
}

/** A gift inside the battle: the normal sendCoinsToUser, tagged with the day so it scores. */
export async function sendCountryBattleGift(input: {
  myId: number; toUserId: number; coins: number; giftId: number; roomName: string; dayId: number;
}) {
  return post("sendCoinsToUser", {
    my_user_id: input.myId,
    user_id: input.toUserId,
    coins: input.coins,
    gift_id: input.giftId,
    room_name: input.roomName,
    country_battle_day_id: input.dayId,
  });
}

// ---- is the directory tile shown? -----------------------------------------------------------
// Steve: "Add on/off switch because we will not start this battle until we have a few thousand
// members." Shown when tbl_settings.country_battle_enabled is 1, or for a tester (the signed-in
// member's own row carries country_battle_tester; if it does not, the status call answers
// enabled=true for a tester even with the switch off).
let switchRequest: Promise<boolean> | null = null;
const testerRequests = new Map<number, Promise<boolean>>();

export function useCountryBattleVisible(): boolean {
  const { user } = useSession();
  const uid = user?.id ?? 0;
  const tester = flag((user as { country_battle_tester?: unknown } | null)?.country_battle_tester);
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    switchRequest ??= post<{ country_battle_enabled?: number | string }>("fetchSettings", { x: 1 })
      .then((r) => flag(Number(r.data?.country_battle_enabled ?? 0)))
      .catch(() => { switchRequest = null; return false; });
    switchRequest.then(async (enabled) => {
      if (enabled || tester) { if (live) setOn(true); return; }
      if (!uid) { if (live) setOn(false); return; }
      let req = testerRequests.get(uid);
      if (!req) {
        req = fetchCountryBattleStatus(uid).then((s) => s.enabled).catch(() => false);
        testerRequests.set(uid, req);
      }
      const v = await req;
      if (live) setOn(v);
    });
    return () => { live = false; };
  }, [uid, tester]);
  return on;
}
