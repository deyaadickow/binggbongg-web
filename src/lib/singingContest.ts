// Monthly Singing Contest (Steve, 2026-11-26: "Singing contest starts every 1st of the month at midnight and ends
// the end of the month at midnight. Members has to go live for this singing contest and bingg bongg will record
// them for a limit of 5 minutes." / "Each member can only create one singing video so make it a good one.").
//
// The member API (all POST, checkHeader + authorizeUser, my_user_id = the caller). Shapes follow the contract
// word for word. While tbl_settings.singing_contest_enabled is 0 every call answers enabled:false and the web
// shows nothing: no directory tile, the page says it is not on.
//
// Never show the base / total payout numbers anywhere. The only percentages the UI may say are the top-3
// EXTRAS (+15 % / +10 % / +5 %), and they come from rules.extras.
//
// DEV ONLY: ?scdemo=1 (the page) / ?scdemo=upcoming / ?scdemo=rec (the REC pill) answers from fixture data
// (singingContestDemo.ts) without the server. The import is dead code in a production build.
import { useEffect, useState } from "react";
import { post } from "./api";

export type ScRoundStatus = "upcoming" | "active" | "ended" | "finalized";
export type ScRecStatus = "pending" | "recording" | "processing" | "done" | "failed" | "cancelled";
export type ScReason = "not_enabled" | "not_started" | "ended" | "already_entered" | "recording_in_progress" | "not_eligible" | "blocked" | "not_your_live";

export interface ScUser {
  user_id: number; username?: string; fullname?: string; profile_image?: string | null;
  is_verified?: number; country?: string | null;
}
export interface ScEntry {
  entry_id: number; round_id: number; rank: number; votes: number; is_mine: boolean;
  post_id: number; video_url?: string | null; thumbnail_url?: string | null; duration_s?: number;
  created_at?: string; user: ScUser;
}
export interface ScRecording {
  recording_id: number; round_id: number; room_name: string; status: ScRecStatus;
  reason?: string | null; reason_text?: string | null; max_seconds: number; seconds_left: number;
  started_at?: string | null; entry_id?: number | null;
}
export interface ScRound {
  id: number; month: string; label: string; status: ScRoundStatus; starts_at: string; ends_at: string;
  seconds_left: number; seconds_to_start: number; entries_count: number; votes_total: number;
}
export interface ScContest {
  status: boolean; enabled: boolean; message?: string;
  round?: ScRound | null;
  rules?: { max_seconds: number; one_per_month: boolean; extras: { place: number; extra_percent: number }[] };
  video?: { url: string | null; poster: string | null; language?: string } | null;
  me?: { can_record: boolean; reason: ScReason | null; reason_text: string | null; entry: ScEntry | null; recording: ScRecording | null };
  entries?: ScEntry[];
  has_more?: boolean;
  last_winners?: { round_id: number; label: string; winners: { place: number; extra_percent: number; entry: ScEntry }[] } | null;
}
export type ScResult<T> = { status: boolean; message?: string; code?: string } & T;

/** The demo mode this tab is in ("1", "upcoming", "rec"), or null. Always null in a production build. */
export function scDemo(): string | null {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  try {
    const v = new URLSearchParams(window.location.search).get("scdemo");
    if (v !== null) sessionStorage.setItem("scdemo", v || "1");
    return sessionStorage.getItem("scdemo");
  } catch { return new URLSearchParams(window.location.search).get("scdemo"); }
}
const demoMod = () => import("./singingContestDemo");

async function call<T>(endpoint: string, params: Record<string, unknown>): Promise<ScResult<T>> {
  if (import.meta.env.DEV && scDemo()) return (await (await demoMod()).demoCall(endpoint, params, scDemo()!)) as ScResult<T>;
  const r = await post<unknown>(endpoint, params);
  return r as unknown as ScResult<T>;
}

export function fetchSingingContest(myUserId: number, roundId?: number) {
  return call<ScContest>("fetchSingingContest", { my_user_id: myUserId, round_id: roundId }) as Promise<ScContest>;
}
export function fetchSingingContestEntries(myUserId: number, start = 0, count = 20, roundId?: number) {
  return call<{ round_id: number; entries: ScEntry[]; has_more: boolean }>("fetchSingingContestEntries", { my_user_id: myUserId, round_id: roundId, start, count });
}
export function startSingingContestRecording(myUserId: number, roomName: string) {
  return call<{ recording?: ScRecording }>("startSingingContestRecording", { my_user_id: myUserId, room_name: roomName });
}
export function stopSingingContestRecording(myUserId: number, recordingId: number) {
  return call<{ recording?: ScRecording }>("stopSingingContestRecording", { my_user_id: myUserId, recording_id: recordingId });
}
export function fetchSingingContestRecording(myUserId: number, recordingId: number) {
  return call<{ recording?: ScRecording }>("fetchSingingContestRecording", { my_user_id: myUserId, recording_id: recordingId });
}
export function deleteSingingContestEntry(myUserId: number, entryId: number) {
  return call<Record<string, never>>("deleteSingingContestEntry", { my_user_id: myUserId, entry_id: entryId });
}

let enabledRequest: Promise<boolean> | null = null;
/** enabled off fetchSingingContest, once per page load; a failure is "off" (retried next time). */
export function singingContestEnabled(myUserId: number | null | undefined): Promise<boolean> {
  if (!myUserId && !(import.meta.env.DEV && scDemo())) return Promise.resolve(false);
  enabledRequest ??= fetchSingingContest(myUserId ?? 0)
    .then((r) => !!r.status && r.enabled === true)
    .catch(() => { enabledRequest = null; return false; });
  return enabledRequest;
}

/** false until the server says the contest is on — the directory tile never flashes in and out. */
export function useSingingContestEnabled(myUserId: number | null | undefined): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    singingContestEnabled(myUserId).then((v) => { if (live) setOn(v); });
    return () => { live = false; };
  }, [myUserId]);
  return on;
}

/** A recording that still blocks guests (and a second start). */
export const recBlocking = (r: ScRecording | null | undefined) => !!r && (r.status === "pending" || r.status === "recording");

/** m:ss */
export function mss(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "12d 4h" / "3h 5m" / "4m 10s" — the contest countdown. */
export function dhm(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}
