// Bingg Bongg Puzzle (Steve, 2026-11-28). 1,000 numbered items; puzzle pieces pop up at random on
// ANY page (like Golden Nuggets) and the member taps one before it flies away (~8 s). The SERVER
// decides everything — whether a piece drops, which item it is, whether it is new — and only
// reveals the item on the claim. Free FBB milestones: 10 @ 100, 25 @ 250, 50 @ 500, 100 @ 750,
// 1,000 @ 1,000. A spare can be sent to a friend who is missing it. Admin switch puzzle_enabled.
//
//   fetchPuzzleEnabled     checkHeader   — { enabled, switch_on }
//   fetchPuzzle            checkHeader   — the member's page: 1,000 items with got / copies
//   fetchPuzzleLeaders     checkHeader   — Top Puzzle Finders
//   puzzleRoll             authorizeUser — { context } -> maybe a drop { token, seconds, color }
//   puzzleClaim            authorizeUser — { token, language } -> the item + lines, or { reason }
//   fetchPuzzleSendTargets authorizeUser — { item_no, q } -> friends missing it
//   puzzleSendPiece        authorizeUser — { item_no, to_user_id }
import { useEffect, useState } from "react";
import { post } from "./api";

export interface PzItem {
  no: number;
  name: string;
  plain_name: string;
  emoji: string;
  image: string | null;
  thumb: string | null;
  link: string | null;
  sponsored: boolean;
  got?: boolean;
  copies?: number;
  from?: string | null;
}

export interface PzMilestone { at: number; fbbs: number; done: boolean }

export interface PzPage {
  enabled: boolean;
  switch_on: boolean;
  total: number;
  found: number;
  left: number;
  catches: number;
  spares: number;
  rank: number;
  today: number;
  daily_cap: number;
  new_member: boolean;
  piece_seconds: number;
  milestones: PzMilestone[];
  video_play_id: number;
  items: PzItem[];
}

/** An animated carrier the piece rides on (a horse, a parrot, a rocket…): a transparent WebP strip of `frames`
 *  frames (fw x fh px each) at `fps`; anchors[i] = [x, y, size, angle] where the piece is held in frame i (fractions
 *  of the frame); `h` = drawn height in px; `motion` = the path it takes across the screen. */
export interface PzCarrier {
  id: string; file: string; frames: number; fps: number; fw: number; fh: number; h: number;
  motion: "ground" | "fly" | "leap" | "float" | string; anchors: ([number, number, number, number] | null)[];
}
export interface PzDrop { token: string; seconds: number; color: string; carrier?: PzCarrier | null }
export interface PzRoll { enabled: boolean; next_in: number; drop: PzDrop | null; capped?: boolean; preload?: string }

export interface PzCatch {
  item: PzItem;
  is_new: boolean;
  copies: number;
  spares: number;
  found: number;
  total: number;
  left: number;
  headline: string;
  left_line: string;
  milestone: { at: number; fbbs: number; line: string } | null;
  next_milestone: { at: number; fbbs: number; to_go: number } | null;
  completed: boolean;
  video_play_id: number;
}

export interface PzUser { id: number; fullname?: string; username?: string; profile_image?: string | null; country?: string; is_verified?: number }
export interface PzLeader { rank: number; found: number; catches: number; completed: boolean; user: PzUser }
export interface PzBoard { total: number; finders: number; leaders: PzLeader[]; me: PzLeader | null }

export const PZ_TOTAL = 1000;

/** The puzzle-piece colours the server picks from. */
export const PZ_COLORS: Record<string, [string, string, string]> = {
  gold: ["#FFF3A6", "#F0C420", "#9A6A00"],
  pink: ["#FFD1EC", "#FF4FB0", "#9C1460"],
  teal: ["#C8FFF6", "#1ED8C0", "#0A6E62"],
  purple: ["#E6D4FF", "#9B5CFF", "#4B1F99"],
  orange: ["#FFE0C2", "#FF8A1E", "#9C4300"],
  blue: ["#D2E8FF", "#2E8CFF", "#0E4596"],
};

let enabledCache: { v: boolean; at: number } | null = null;
export async function puzzleEnabled(force = false): Promise<boolean> {
  if (!force && enabledCache && Date.now() - enabledCache.at < 60_000) return enabledCache.v;
  try {
    const r = await post<unknown>("fetchPuzzleEnabled", {});
    const v = !!(r as unknown as { enabled?: unknown }).enabled;
    enabledCache = { v, at: Date.now() };
    return v;
  } catch { return false; }
}

/** The directory tile shows only while the puzzle is on (for this member). */
export function usePuzzleEnabled(): boolean {
  const [on, setOn] = useState(enabledCache?.v ?? false);
  useEffect(() => {
    let live = true;
    void puzzleEnabled().then((v) => { if (live) setOn(v); });
    return () => { live = false; };
  }, []);
  return on;
}

export async function fetchPuzzle(userId: number | null, language: string): Promise<PzPage | null> {
  const r = await post<PzPage>("fetchPuzzle", { ...(userId ? { user_id: userId } : {}), language });
  return r.status && r.data ? r.data : null;
}

export async function fetchPuzzleLeaders(userId: number | null): Promise<PzBoard | null> {
  const r = await post<PzBoard>("fetchPuzzleLeaders", userId ? { user_id: userId } : {});
  return r.status && r.data ? r.data : null;
}

export async function puzzleRoll(userId: number, context: string): Promise<PzRoll | null> {
  const r = await post<PzRoll>("puzzleRoll", { user_id: userId, context });
  return r.status && r.data ? r.data : null;
}

export type PzClaimResult = { ok: true; data: PzCatch } | { ok: false; message: string; reason: string };

export async function puzzleClaim(userId: number, token: string, language: string): Promise<PzClaimResult> {
  try {
    const r = await post<PzCatch & { reason?: string }>("puzzleClaim", { user_id: userId, token, language });
    if (r.status && r.data) return { ok: true, data: r.data };
    return { ok: false, message: typeof r.message === "string" ? r.message : "", reason: String((r.data as { reason?: string } | undefined)?.reason ?? "") };
  } catch {
    return { ok: false, message: "", reason: "network" };
  }
}

export async function fetchSendTargets(userId: number, itemNo: number, q = ""): Promise<{ spares: number; friends: PzUser[] }> {
  try {
    const r = await post<{ spares: number; friends: PzUser[] }>("fetchPuzzleSendTargets", { user_id: userId, item_no: itemNo, q });
    return r.status && r.data ? r.data : { spares: 0, friends: [] };
  } catch { return { spares: 0, friends: [] }; }
}

export async function sendPiece(userId: number, itemNo: number, toUserId: number, language: string): Promise<{ ok: boolean; message: string }> {
  try {
    const r = await post<unknown>("puzzleSendPiece", { user_id: userId, item_no: itemNo, to_user_id: toUserId, language });
    return { ok: !!r.status, message: typeof r.message === "string" ? r.message : "" };
  } catch { return { ok: false, message: "" }; }
}

/** Where the explainer opens. */
export function puzzleVideoPath(playId: number): string | null {
  return playId > 0 ? `/feature-videos?play=${playId}` : null;
}

// The app-wide manager (components/Puzzle.tsx) listens for "a catch happened" so an open puzzle
// page refreshes itself.
type Listener = () => void;
const listeners = new Set<Listener>();
export function onPuzzleCatch(fn: Listener) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function emitPuzzleCatch() { listeners.forEach((f) => f()); }

/** Which context a route is (for the server's stats only). */
export function puzzleContext(pathname: string): string {
  if (/^\/live\/[^/]+/.test(pathname)) return "live";
  if (/^\/(chat-battle\/|country-battle\/live\/|cvc\/[^/]+)/.test(pathname)) return "battle";
  return "browse";
}
