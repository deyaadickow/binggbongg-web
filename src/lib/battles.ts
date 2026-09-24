// The four multi-player battle engines from the browser — Best Out Of (series), 2v2,
// No Time Limit (marathon) and 5-5-5. Same endpoints and the same poll-by-room discovery the
// phones use. Power-ups (bombs, time, gloves) are not on the web yet.
import { useCallback, useEffect, useRef, useState } from "react";
import { post } from "./api";
import { parseServerDate } from "./battle";

const STATUS_POLL_MS = 3000;
const INVITE_POLL_MS = 4000;

export type EngineStatus = "pending_invites" | "active" | "completed" | "cancelled" | string;

export interface Participant {
  user_id: number;
  fullname?: string | null;
  username?: string | null;
  profile_image?: string | null;
  invite_status: "accepted" | "pending" | "declined" | string;
}

// ---- Best Out Of ------------------------------------------------------------------------
export interface SeriesParticipant extends Participant { rounds_won: number; current_round_score: number }
export interface SeriesData {
  series_id: number;
  room_name: string;
  host_user_id: number;
  length: number;
  rounds_needed_to_win: number;
  status: EngineStatus;
  current_round_number: number | null;
  current_round_id: number | null;
  current_round_ends_at?: string | null;
  winner_user_id: number | null;
  participants: SeriesParticipant[];
}
export interface SeriesInvite { series_id: number; length: number; host_user_id: number; host_fullname?: string; host_username?: string; host_profile_image?: string }

// ---- 2v2 ------------------------------------------------------------------------------
export interface TeamParticipant extends Participant { team: "A" | "B"; current_score: number }
export interface Battle2v2Data {
  battle_id: number;
  room_name: string;
  initiator_user_id: number;
  status: EngineStatus;
  participants: TeamParticipant[];
  team_a_score: number;
  team_b_score: number;
  winning_team: "A" | "B" | null;
  started_at?: string | null;
  ends_at?: string | null;
}
export interface Invite2v2 {
  battle_id: number;
  initiator_user_id: number; initiator_fullname?: string; initiator_username?: string;
  my_team: "A" | "B";
  my_teammate_user_id?: number; my_teammate_fullname?: string; my_teammate_username?: string;
  opponent1_user_id?: number; opponent1_fullname?: string; opponent1_username?: string;
  opponent2_user_id?: number; opponent2_fullname?: string; opponent2_username?: string;
}

// ---- No Time Limit --------------------------------------------------------------------
export interface MarathonParticipant extends Participant { current_score: number; cancel_vote: boolean }
export interface MarathonData {
  marathon_id: number;
  room_name: string;
  host_user_id: number;
  target_points: number;
  status: EngineStatus;
  winner_user_id: number | null;
  accepted_count: number;
  cancel_vote_count: number;
  cancel_unanimous_pending: boolean;
  participants: MarathonParticipant[];
}
export interface MarathonInvite { marathon_id: number; target_points: number; host_user_id: number; host_fullname?: string; host_username?: string }

// ---- 5-5-5 ------------------------------------------------------------------------------
export interface B555Participant extends Participant {
  games_completed: number;
  current_game_no: number | null;
  current_game_coins: number;
  seconds_left: number | null;
  finished_at?: string | null;
  finish_seconds?: number | null;
  total_coins: number;
}
export interface B555Data {
  battle_555_id: number;
  room_name: string;
  host_user_id: number;
  games_to_win: number;
  coins_per_game: number;
  seconds_per_game: number;
  status: EngineStatus;
  winner_user_id: number | null;
  accepted_count: number;
  participants: B555Participant[];
}
export interface B555Invite { battle_555_id: number; games_to_win: number; coins_per_game: number; seconds_per_game: number; host_user_id: number; host_fullname?: string; host_username?: string }

export interface EngineConfig<TData, TInvite> {
  key: "series" | "2v2" | "marathon" | "555";
  statusEndpoint: string;
  /** Param name the status endpoint takes to look a battle up by id. */
  statusIdParam: string;
  pendingEndpoint: string;
  respondEndpoint: string;
  /** Param name respond takes for the id. */
  respondIdParam: string;
  idOf: (d: TData) => number;
  inviteIdOf: (i: TInvite) => number;
}

export const SERIES: EngineConfig<SeriesData, SeriesInvite> = {
  key: "series", statusEndpoint: "fetchSeriesStatus", statusIdParam: "series_id", pendingEndpoint: "fetchPendingSeriesInvites",
  respondEndpoint: "respondToSeriesInvite", respondIdParam: "series_id", idOf: (d) => d.series_id, inviteIdOf: (i) => i.series_id,
};
export const TWO_V_TWO: EngineConfig<Battle2v2Data, Invite2v2> = {
  key: "2v2", statusEndpoint: "fetch2v2BattleStatus", statusIdParam: "battle_id", pendingEndpoint: "fetchPending2v2Invites",
  respondEndpoint: "respond2v2Invite", respondIdParam: "battle_id", idOf: (d) => d.battle_id, inviteIdOf: (i) => i.battle_id,
};
export const MARATHON: EngineConfig<MarathonData, MarathonInvite> = {
  key: "marathon", statusEndpoint: "fetchMarathonBattleStatus", statusIdParam: "marathon_id", pendingEndpoint: "fetchPendingMarathonInvites",
  respondEndpoint: "respondMarathonInvite", respondIdParam: "marathon_id", idOf: (d) => d.marathon_id, inviteIdOf: (i) => i.marathon_id,
};
export const FIVE_FIVE_FIVE: EngineConfig<B555Data, B555Invite> = {
  key: "555", statusEndpoint: "fetch555BattleStatus", statusIdParam: "battle_555_id", pendingEndpoint: "fetchPending555Invites",
  respondEndpoint: "respond555Invite", respondIdParam: "battle_555_id", idOf: (d) => d.battle_555_id, inviteIdOf: (i) => i.battle_555_id,
};

export const isOpen = (s?: EngineStatus | null) => s === "pending_invites" || s === "active";

/**
 * One engine's live state for this room. Everyone polls status by room; publishers also poll
 * invites addressed to them. The room query only returns open battles, so when it goes quiet
 * after we knew an id we fetch that id once more to catch the final (completed/cancelled) row
 * and fire `onFinished` exactly once.
 */
export function useEngine<TData extends { status: EngineStatus }, TInvite>(
  cfg: EngineConfig<TData, TInvite>,
  roomName: string,
  myUserId: number | null,
  isPublisher: boolean,
  enabled: boolean,
  onFinished: (d: TData) => void,
) {
  const [data, setData] = useState<TData | null>(null);
  const [invite, setInvite] = useState<TInvite | null>(null);
  const [now, setNow] = useState(Date.now());
  const lastOpenId = useRef<number | null>(null);
  const finishedIds = useRef(new Set<number>());
  const shownInviteIds = useRef(new Set<number>());

  const absorb = useCallback((d: TData | null) => {
    if (d && !isOpen(d.status)) {
      const id = cfg.idOf(d);
      if (!finishedIds.current.has(id)) { finishedIds.current.add(id); onFinished(d); }
      lastOpenId.current = null;
      setData(null);
      return;
    }
    if (d) lastOpenId.current = cfg.idOf(d);
    setData(d);
  }, [cfg, onFinished]);

  useEffect(() => {
    if (!enabled || !roomName) return;
    let alive = true;
    async function tick() {
      const res = await post<TData | null>(cfg.statusEndpoint, { room_name: roomName }).catch(() => null);
      if (!alive || !res) return;
      let d = res.status ? (res.data ?? null) : null;
      if (d && lastOpenId.current !== null && cfg.idOf(d) !== lastOpenId.current) {
        // A newer battle replaced the one we were tracking: fetch the old one for its result.
        const old = await post<TData | null>(cfg.statusEndpoint, { [cfg.statusIdParam]: lastOpenId.current }).catch(() => null);
        if (alive && old?.status && old.data) absorb(old.data);
      }
      if (!d && lastOpenId.current !== null) {
        const fin = await post<TData | null>(cfg.statusEndpoint, { [cfg.statusIdParam]: lastOpenId.current }).catch(() => null);
        if (!alive) return;
        d = fin?.status ? (fin.data ?? null) : null;
        if (d && isOpen(d.status)) d = null; // shouldn't happen; treat as gone
        if (!d) { lastOpenId.current = null; setData(null); return; }
      }
      absorb(d);
    }
    tick();
    const t = setInterval(tick, STATUS_POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [cfg, roomName, enabled, absorb]);

  // Invites addressed to me. A pending battle must NOT suppress this (the invitee's status poll
  // sees the pending row before they've answered) — only an active battle does.
  const activeNow = data?.status === "active";
  useEffect(() => {
    if (!enabled || !roomName || !isPublisher || !myUserId || activeNow) return;
    let alive = true;
    async function tick() {
      const res = await post<TInvite[]>(cfg.pendingEndpoint, { user_id: myUserId, room_name: roomName }).catch(() => null);
      if (!alive || !res?.status) return;
      const list = res.data ?? [];
      const fresh = list.find((i) => !shownInviteIds.current.has(cfg.inviteIdOf(i)));
      if (fresh) { shownInviteIds.current.add(cfg.inviteIdOf(fresh)); setInvite(fresh); }
      // The invite we're showing was withdrawn/cancelled: drop it.
      setInvite((cur) => (cur && !list.some((i) => cfg.inviteIdOf(i) === cfg.inviteIdOf(cur)) ? null : cur));
    }
    tick();
    const t = setInterval(tick, INVITE_POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [cfg, roomName, myUserId, isPublisher, enabled, activeNow]);

  useEffect(() => {
    if (!activeNow) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [activeNow]);

  const respond = useCallback(async (id: number, approve: boolean) => {
    if (!myUserId) return;
    setInvite(null);
    const res = await post<TData>(cfg.respondEndpoint, { user_id: myUserId, [cfg.respondIdParam]: id, approve });
    if (!res.status) throw new Error(res.message ?? "Couldn't answer that invite.");
    if (res.data && typeof res.data === "object" && "status" in res.data) absorb(res.data);
  }, [cfg, myUserId, absorb]);

  return { data, invite, now, respond, absorb, dismissInvite: () => setInvite(null) };
}

export function secondsUntil(iso: string | null | undefined, now: number): number | null {
  const t = parseServerDate(iso);
  return t === null ? null : Math.max(0, Math.round((t - now) / 1000));
}

export function clock(seconds: number | null): string {
  if (seconds === null) return "";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// ---- creators ---------------------------------------------------------------------------
async function must(endpoint: string, params: Record<string, unknown>, fallback: string) {
  const res = await post(endpoint, params);
  if (!res.status) throw new Error(res.message ?? fallback);
  return res;
}

export const createSeries = (myUserId: number, roomName: string, length: number, inviteeIds: number[]) =>
  must("createBattleSeries", { my_user_id: myUserId, room_name: roomName, length, invitee_user_ids: inviteeIds }, "Couldn't start the Best Out Of battle.");

export const invite2v2 = (myUserId: number, roomName: string, teammateId: number, opponent1Id: number, opponent2Id: number) =>
  must("invite2v2Battle", { initiator_user_id: myUserId, room_name: roomName, teammate_user_id: teammateId, opponent1_user_id: opponent1Id, opponent2_user_id: opponent2Id }, "Couldn't send the 2v2 invites.");

export const inviteMarathon = (myUserId: number, roomName: string, inviteeIds: number[]) =>
  must("inviteMarathonBattle", { my_user_id: myUserId, room_name: roomName, invitee_user_ids: inviteeIds }, "Couldn't send the No Time Limit invites.");

export const invite555 = (myUserId: number, roomName: string, inviteeIds: number[]) =>
  must("invite555Battle", { my_user_id: myUserId, room_name: roomName, invitee_user_ids: inviteeIds }, "Couldn't send the 5-5-5 invites.");

export const cancel555 = (myUserId: number, id: number) =>
  must("cancel555Battle", { my_user_id: myUserId, battle_555_id: id }, "Couldn't cancel that battle.");

export const voteMarathonCancel = (myUserId: number, id: number, approve: boolean) =>
  must("voteMarathonCancel", { user_id: myUserId, marathon_id: id, approve }, "Couldn't record your vote.");

export const finalizeSeriesRound = (roundId: number) => post<unknown>("finalizeSeriesRound", { round_id: roundId });
export const finalize2v2 = (battleId: number) => post<Battle2v2Data>("finalize2v2Battle", { battle_id: battleId });
