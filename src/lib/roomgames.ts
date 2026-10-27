// ONE poll for all of a room's games (Steve, 2026-10-27: "combine the checks into one request").
// The server is RoomGamesController: Bingo, Pyramid, board games, Trivia and the audience card in
// one reply, plus next_poll_ms — 1.5s while a board game or Trivia runs, 3s for Bingo / Pyramid /
// an audience card, 10s when nothing is running. Signed-in viewers use fetchMyRoomGames, which adds
// only their own Trivia answer / 50/50 and audience picks.
import { post } from "./api";
import { normaliseGame as normBingo, type BingoGame } from "./bingo";
import { normalise as normPyramid, type PyramidGame } from "./pyramid";
import { normalise as normBoard, type BoardGame } from "./boardgame";
import { norm as normTrivia, type TriviaGame } from "./trivia";
import { norm as normAudience, type AudienceRound } from "./audience";
import { norm as normGuess, type GuessGame } from "./guess";

export type RoomGames = {
  bingo: BingoGame | null; pyramid: PyramidGame | null; board: BoardGame | null;
  trivia: TriviaGame | null; audience: AudienceRound | null; guess: GuessGame | null; nextPollMs: number;
};

export async function fetchRoomGames(roomName: string, myUserId: number | null): Promise<RoomGames | null> {
  const res = myUserId
    ? await post<Record<string, unknown>>("fetchMyRoomGames", { user_id: myUserId, room_name: roomName })
    : await post<Record<string, unknown>>("fetchRoomGames", { room_name: roomName });
  if (!res.status || !res.data) return null;
  const d = res.data;
  return {
    bingo: normBingo(d.bingo as Record<string, unknown> | null),
    pyramid: normPyramid(d.pyramid),
    board: normBoard(d.board),
    trivia: normTrivia(d.trivia),
    audience: normAudience(d.audience),
    guess: normGuess(d.guess),
    nextPollMs: Math.max(1000, Number(d.next_poll_ms) || 10000),
  };
}
