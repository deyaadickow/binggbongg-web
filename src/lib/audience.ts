// The audience layer on head-to-head battles (Steve, 2026-10-27) — BattleAudienceController.
// Predict the winner, join a team + cheer, vote the loser's forfeit. All free: no coins.
import { post } from "./api";

export type AudienceSide = { key: string; label: string; user_ids: number[]; predictions: number | null; team_members: number; cheer: number };
export type AudienceRound = {
  round_id: number; battle_kind: string; status: "open" | "settled" | "void"; hide_scores: boolean;
  predict_open: boolean; predict_ms_left: number; sides: AudienceSide[];
  punishments: { text: string; votes: number }[]; winner_key: string | null; punishment_result: string | null;
  is_player: boolean; my_prediction: string | null; my_prediction_correct: boolean | null; my_team: string | null;
  my_punishment_vote: number | null; my_streak: number; my_best_streak: number;
};
export type PredictorRow = { rank: number; user_id: number; name: string; image?: string | null; predictions: number; correct: number; streak: number; best_streak: number };

const norm = (raw: unknown): AudienceRound | null => (raw && typeof raw === "object" && Array.isArray((raw as AudienceRound).sides) ? raw as AudienceRound : null);

export async function fetchAudience(roomName: string, myUserId: number | null) {
  const res = myUserId
    ? await post<Record<string, unknown>>("fetchMyBattleAudience", { user_id: myUserId, room_name: roomName })
    : await post<Record<string, unknown>>("fetchBattleAudience", { room_name: roomName });
  return res.status ? norm(res.data) : null;
}

async function act(endpoint: string, params: Record<string, unknown>) {
  const res = await post<Record<string, unknown>>(endpoint, params);
  return { round: norm(res.data), message: res.status ? null : (res.message ?? "That didn't go through.") };
}

export const predictBattle = (userId: number, roundId: number, side: string) => act("predictBattle", { user_id: userId, round_id: roundId, side });
export const joinBattleTeam = (userId: number, roundId: number, side: string) => act("joinBattleTeam", { user_id: userId, round_id: roundId, side });
export const cheerBattle = (userId: number, roundId: number, taps: number) => act("cheerBattle", { user_id: userId, round_id: roundId, taps });
export const votePunishment = (userId: number, roundId: number, choice: number) => act("votePunishment", { user_id: userId, round_id: roundId, choice });

export async function fetchPredictionLeaderboard(): Promise<PredictorRow[]> {
  const res = await post<PredictorRow[]>("fetchPredictionLeaderboard", {});
  return res.status && Array.isArray(res.data) ? res.data : [];
}
