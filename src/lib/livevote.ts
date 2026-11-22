// Live Vote (Steve, 2026-11-22: "Voting game Feature. Only when live streaming for now..."). The
// host asks a question, adds as many answer buttons as they like and picks the BBs one vote costs
// (1-10 or their own number). Every tap is one vote and a gift to the host through the server's
// normal gift path (LiveVoteController -> sendCoinsToUser + live_vote_id). The host chooses whether
// the counts show on the buttons; when hidden only the host sees them.
//
// The vote reaches the page through the room's one combined poll (lib/roomgames.ts, key `vote`),
// 1.5s while it is open, and the voter's own tap answers with the fresh counts at once.
import { post } from "./api";

export type LiveVoteOption = { index: number; text: string; votes: number | null; percent: number | null; my_votes: number };
export type LiveVote = {
  vote_id: number; room_name: string; host_user_id: number; question: string;
  status: "open" | "closed" | string; end_reason: string | null;
  bbs_per_vote: number; show_counts: boolean; options: LiveVoteOption[];
  /** null when the counts are hidden from this viewer. */
  votes_total: number | null;
  /** Only the host gets it. */
  coins_total: number | null;
  my_votes_total: number; is_host: boolean; can_vote: boolean;
};

const num = (v: unknown, d = 0): number => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : num(v));
const bool = (v: unknown): boolean => v === true || v === 1 || v === "1" || v === "true";

export function norm(raw: unknown): LiveVote | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const id = num(d.vote_id ?? d.id, 0);
  if (!id) return null;
  const options = (Array.isArray(d.options) ? d.options : []).map((o, i): LiveVoteOption => {
    const x = (o && typeof o === "object" ? o : { text: String(o) }) as Record<string, unknown>;
    return { index: num(x.index, i), text: String(x.text ?? ""), votes: numOrNull(x.votes), percent: numOrNull(x.percent), my_votes: num(x.my_votes, 0) };
  });
  return {
    vote_id: id, room_name: String(d.room_name ?? ""), host_user_id: num(d.host_user_id, 0),
    question: String(d.question ?? ""), status: String(d.status ?? "open"), end_reason: d.end_reason ? String(d.end_reason) : null,
    bbs_per_vote: Math.max(1, num(d.bbs_per_vote, 1)), show_counts: bool(d.show_counts), options,
    votes_total: numOrNull(d.votes_total), coins_total: numOrNull(d.coins_total),
    my_votes_total: num(d.my_votes_total, 0), is_host: bool(d.is_host),
    can_vote: d.can_vote === undefined ? !bool(d.is_host) : bool(d.can_vote),
  };
}

const stateOf = (res: Record<string, unknown>): LiveVote | null => {
  const d = res.data as Record<string, unknown> | undefined;
  return norm(d?.vote) ?? norm(d) ?? norm(res.vote);
};

export const NOT_ENOUGH_COINS = "not_enough_coins";

export async function startLiveVote(userId: number, roomName: string, s: { question: string; options: string[]; bbsPerVote: number; showCounts: boolean }) {
  const res = await post<Record<string, unknown>>("startLiveVote", {
    user_id: userId, room_name: roomName, question: s.question, options: JSON.stringify(s.options),
    bbs_per_vote: s.bbsPerVote, show_counts: s.showCounts ? 1 : 0,
  });
  return { vote: res.status ? stateOf(res) : null, message: res.status ? null : (res.message ?? null) };
}

export type CastResult = { vote: LiveVote | null; ok: boolean; coinsLeft: number | null; message: string | null };

/** One tap = one vote = bbs_per_vote BBs, a gift to the host. */
export async function castLiveVote(userId: number, vote: LiveVote, option: number): Promise<CastResult> {
  const res = await post<Record<string, unknown>>("castLiveVote", { user_id: userId, vote_id: vote.vote_id, option });
  const d = (res.data && typeof res.data === "object" ? res.data : {}) as Record<string, unknown>;
  const m = String(res.message ?? "");
  const code = (res as { code?: unknown }).code;
  return {
    vote: stateOf(res), ok: !!res.status,
    coinsLeft: d.coins_left === undefined || d.coins_left === null ? null : num(d.coins_left),
    message: res.status ? null : code === NOT_ENOUGH_COINS || m === NOT_ENOUGH_COINS ? NOT_ENOUGH_COINS : m || "vote_failed",
  };
}

export async function setLiveVoteShowCounts(userId: number, vote: LiveVote, show: boolean) {
  const res = await post<Record<string, unknown>>("updateLiveVote", { user_id: userId, vote_id: vote.vote_id, show_counts: show ? 1 : 0 });
  return { vote: stateOf(res), message: res.status ? null : (res.message ?? null) };
}

export async function endLiveVote(userId: number, vote: LiveVote) {
  const res = await post<Record<string, unknown>>("endLiveVote", { user_id: userId, vote_id: vote.vote_id });
  return { vote: stateOf(res), message: res.status ? null : (res.message ?? null) };
}
