// Pyramid battle (Steve, 2026-10-27) — the server is PyramidBattleController. A Flower is bought
// through sendCoinsToUser with pyramid_game_id + flowers; the PRICE is read off the game there.
import { post } from "./api";

export type PyramidTiers = { bags: number; puppies: number; fires: number; hearts: number; flowers: number };
export type PyramidPlayer = { user_id: number; position: number; name: string; image?: string | null; flowers_total: number; coins: number; tiers: PyramidTiers };
export type PyramidGame = {
  pyramid_game_id: number; game_no: number; host_user_id: number; coins_per_flower: number; duration_minutes: number;
  status: string; winner_user_id: number | null; reached_top: boolean; seconds_left: number; players: PyramidPlayer[];
};

const num = (v: unknown) => Number(v ?? 0) || 0;

export function normalise(raw: unknown): PyramidGame | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  return {
    pyramid_game_id: num(g.pyramid_game_id), game_no: num(g.game_no), host_user_id: num(g.host_user_id),
    coins_per_flower: num(g.coins_per_flower) || 1, duration_minutes: num(g.duration_minutes) || 5,
    status: String(g.status ?? ""), winner_user_id: g.winner_user_id == null ? null : num(g.winner_user_id),
    reached_top: !!g.reached_top, seconds_left: num(g.seconds_left),
    players: (Array.isArray(g.players) ? g.players : []).map((p: Record<string, unknown>) => {
      const t = (p.tiers ?? {}) as Record<string, unknown>;
      return {
        user_id: num(p.user_id), position: num(p.position), name: String(p.name ?? "Player"), image: (p.image as string) ?? null,
        flowers_total: num(p.flowers_total), coins: num(p.coins),
        tiers: { bags: num(t.bags), puppies: num(t.puppies), fires: num(t.fires), hearts: num(t.hearts), flowers: num(t.flowers) },
      };
    }),
  };
}

export async function fetchPyramidGame(roomName: string): Promise<PyramidGame | null> {
  const res = await post<Record<string, unknown>>("fetchPyramidGame", { room_name: roomName });
  return res.status ? normalise(res.data) : null;
}

export async function startPyramidBattle(userId: number, roomName: string, others: number[], coinsPerFlower: number, minutes: number) {
  const res = await post<Record<string, unknown>>("startPyramidBattle", {
    user_id: userId, room_name: roomName, player_user_ids: Array.from(new Set([userId, ...others])).join(","),
    coins_per_flower: coinsPerFlower, duration_minutes: minutes,
  });
  return { game: res.status ? normalise(res.data) : null, message: res.message };
}

export async function cancelPyramidBattle(userId: number, gameId: number): Promise<string | null> {
  const res = await post("cancelPyramidBattle", { user_id: userId, pyramid_game_id: gameId });
  return res.status ? null : (res.message ?? "Couldn't end the game.");
}

export async function sendPyramidFlowers(myUserId: number, playerId: number, gameId: number, flowers: number, roomName: string): Promise<string | null> {
  const res = await post("sendCoinsToUser", { my_user_id: myUserId, user_id: playerId, pyramid_game_id: gameId, flowers, room_name: roomName });
  return res.status ? null : (res.message ?? "Couldn't send that Flower.");
}
