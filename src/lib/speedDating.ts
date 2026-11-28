// Bingg Bongg Speed Dating (Steve, 2026-11-28: "Yes go ahead build it. 'Bingg Bongg Speed Dating'").
//
// A MODE of the normal live room (startLive live_mode=speed_dating, chosen on Go Live). 18+ only —
// the host and every guest who takes a seat; a member with no birthday gives it once
// (saveSpeedDatingBirthday). On each guest tile the HOST has a gold heart "Match" and "Pass":
//  - Match: everyone sees "It's a Match! 💛" over the guest's and the host's tiles, the host's app
//    writes "💛 <host> matched with <guest>" in the chat, and the two follow each other (server).
//  - Pass: the tile shows "Pass" for a moment, then the guest goes back to watching (the server
//    gives the seat back after pass_seconds). No chat line — kind.
// Gifts are the normal live's. Not a battle. Admin switch speed_dating_enabled (OFF by default).
//
// State: fetchLiveRoomMembers → data.multi_live.speed_dating (null = not a speed dating room).
import { useEffect, useState } from "react";
import { post } from "./api";
import { tt } from "./i18n";

export const SD_MODE = "speed_dating";

export interface SdEvent {
  id: string;
  type: "match" | "pass";
  host_user_id: number;
  guest_user_id: number;
  host_name?: string;
  guest_name?: string;
  /** How old the event was when the server answered. */
  age_ms: number;
}

export interface SpeedDating {
  title: string;
  host_user_id: number;
  matched_user_ids: number[];
  match_count: number;
  passing_user_ids: number[];
  events: SdEvent[];
  pass_seconds: number;
}

const num = (v: unknown, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const ids = (v: unknown) => (Array.isArray(v) ? v.map((x) => num(x)).filter((x) => x > 0) : []);

export function normSpeedDating(raw: unknown): SpeedDating | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.mode !== SD_MODE) return null;
  return {
    title: String(r.title ?? "BINGG BONGG SPEED DATING"),
    host_user_id: num(r.host_user_id),
    matched_user_ids: ids(r.matched_user_ids),
    match_count: num(r.match_count),
    passing_user_ids: ids(r.passing_user_ids),
    pass_seconds: num(r.pass_seconds, 2),
    events: (Array.isArray(r.events) ? r.events : []).map((e: Record<string, unknown>) => ({
      id: String(e.id ?? ""),
      type: e.type === "pass" ? "pass" as const : "match" as const,
      host_user_id: num(e.host_user_id),
      guest_user_id: num(e.guest_user_id),
      host_name: e.host_name ? String(e.host_name) : undefined,
      guest_name: e.guest_name ? String(e.guest_name) : undefined,
      age_ms: num(e.age_ms),
    })).filter((e) => e.id !== ""),
  };
}

// ---- server calls ----------------------------------------------------------------------------

let enabledCache: { v: boolean; at: number } | null = null;
export async function speedDatingEnabled(): Promise<boolean> {
  if (enabledCache && Date.now() - enabledCache.at < 60_000) return enabledCache.v;
  try {
    const r = await post<unknown>("fetchSpeedDatingEnabled", {});
    const v = !!(r as unknown as { enabled?: unknown }).enabled;
    enabledCache = { v, at: Date.now() };
    return v;
  } catch { return false; }
}

/** The Go Live choice and the directory tile: shown only while the switch is on. */
export function useSpeedDatingEnabled(): boolean {
  const [on, setOn] = useState(enabledCache?.v ?? false);
  useEffect(() => {
    let live = true;
    void speedDatingEnabled().then((v) => { if (live) setOn(v); });
    return () => { live = false; };
  }, []);
  return on;
}

export interface SdResult { ok: boolean; reason: string | null; message: string | null; state: SpeedDating | null }

async function write(route: string, body: Record<string, unknown>): Promise<SdResult> {
  const res = await post<unknown>(route, body);
  const r = res as unknown as Record<string, unknown>;
  return { ok: !!res.status, reason: (r.reason as string) ?? null, message: (r.message as string) ?? null, state: normSpeedDating(r.data) };
}

export const speedDatingMatch = (me: number, room: string, target: number) => write("speedDatingMatch", { my_user_id: me, room_name: room, target_user_id: target });
export const speedDatingPass = (me: number, room: string, target: number) => write("speedDatingPass", { my_user_id: me, room_name: room, target_user_id: target });
export const saveSpeedDatingBirthday = (me: number, dob: string) => write("saveSpeedDatingBirthday", { my_user_id: me, date_of_birth: dob });

/** A refusal in the member's language (the server's English otherwise). */
export function sdReasonText(reason: string | null, message: string | null): string {
  switch (reason) {
    case "need_birthday": return tt("sd_birthday_line");
    case "under_18": return tt("sd_under_18");
    case "not_enabled": return tt("sd_not_enabled");
    case "bad_birthday": return tt("sd_bad_birthday");
    default: return message || tt("something_went_wrong");
  }
}

export const isSdRefusal = (reason: string | null) => reason === "need_birthday" || reason === "under_18";

// ---- per-tile store (the same idea as TileGiftLayer's subscribeTileGifts) ----------------------
// The live page publishes the room's speed dating view here; each tile's SpeedDatingTileLayer
// reads its own member's part. No prop threading through the two grids.

export interface SdView {
  sd: SpeedDating | null;
  isHost: boolean;
  hostUserId: number;
  /** user_id -> the moment (Date.now()) its "It's a Match!" burst started. */
  bursts: Record<number, number>;
  /** Guests whose Pass the host just tapped (shown before the server answers). */
  localPass: number[];
  busy: number[];
  onMatch: (uid: number) => void;
  onPass: (uid: number) => void;
}

let view: SdView | null = null;
const listeners = new Set<() => void>();
export function publishSdView(v: SdView | null) { view = v; listeners.forEach((l) => l()); }
export function useSdView(): SdView | null {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return view;
}

export const BURST_MS = 2800;
