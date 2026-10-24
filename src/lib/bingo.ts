// Bingg Bongg Bingo Battle (Steve, 2026-10-11) — battle engine #11, web side.
//
// What makes this engine unlike the ten before it: every other battle counts coins and
// compares totals, so its UI is a scoreboard. This one does not care about totals at all,
// only about WHICH squares were bought — so its UI is the card itself, and the card is also
// the gift picker. Steve: "To give any of the number as a gift, all they have to do is double
// tap that number."
//
// Nothing in here sends a price. A square's cost lives on the game row and sendCoinsToUser
// resolves it there — this client sends only which card and which square, which is what stops
// a modified client buying squares for a coin.
import { post } from "./api";
import { tt } from "./i18n";

/** Steve, 2026-10-11: "Give the host the ability to change the coin cost settings for each
 *  square. Minimum 50 coins."
 *
 *  MIN mirrors BingoBattleController::MIN_COINS_PER_SQUARE deliberately and is NOT the guard —
 *  it only bounds the picker. The server clamps whatever arrives, so the two drifting apart is
 *  harmless: the server always wins. Never move the enforcement here; on the web especially, a
 *  number in a bundle is a suggestion anyone can edit in a console. */
export const BINGO_MIN = 50;
export const BINGO_MAX = 1_000_000;
export const BINGO_STEP = 25;
export const BINGO_FALLBACK = 100;
/** 25 squares, centre free — so 24 are payable. The free centre is printed into the artwork. */
export const BINGO_PAYABLE_SQUARES = 24;
export const BINGO_QUICK_CHOICES = [50, 100, 250, 500, 1000];

export const BINGO_COLUMNS = ["B", "I", "N", "G", "O"] as const;

/** Centres as a fraction of the artwork's width and height, shared byte for byte with
 *  Android and iOS. Do NOT re-derive them by detecting the coloured boxes: the fifth column
 *  reads SHORT that way, because its purple fades towards the card's right edge, which pulls
 *  its centre about 8px off. The pitch comes from columns 1-4 and is carried across. */
export const BINGO_COL_X = [0.1519, 0.3266, 0.5013, 0.6760, 0.8507];
export const BINGO_ROW_Y = [0.2429, 0.3446, 0.4463, 0.5481, 0.6498];
export const BINGO_CELL_W = 0.1652;
export const BINGO_CELL_H = 0.0948;
export const BINGO_ASPECT = 1392 / 1696;

export function bingoClamp(value: number): number {
  if (!Number.isFinite(value)) return BINGO_FALLBACK;
  return Math.min(BINGO_MAX, Math.max(BINGO_MIN, Math.round(value)));
}

export function bingoFormat(coins: number): string {
  return coins.toLocaleString("en-US");
}

// A number that may arrive as a string. A raw Eloquent row can hand a decimal or an integer
// back as text depending on the driver; unlike the phones the web would not throw the whole
// response away over it, but "250" where 250 was meant quietly breaks arithmetic and
// comparisons instead, which is worse because it looks like it worked.
function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export type BingoCovered = {
  cell: string;
  col: number;
  row: number;
  gifter_user_id: number | null;
  gifter_name: string | null;
};

export type BingoCard = {
  bingo_card_id: number;
  card_no: number;
  user_id: number;
  player_name: string;
  player_image: string | null;
  /** Column-major: numbers[col][row]. The centre is null. */
  numbers: (number | null)[][];
  covered: BingoCovered[];
};

export type BingoWin = {
  user_id: number | null;
  name: string | null;
  pattern: string;
  pattern_detail: string | null;
};

export type BingoGame = {
  bingo_game_id: number;
  game_no: number;
  room_name: string;
  host_user_id: number;
  coins_per_square: number;
  status: string;
  winner_user_id: number | null;
  cards: BingoCard[];
  wins: BingoWin[];
};

/** "4 CORNERS" rather than "corners" — what a member should read. */
export function winLabel(pattern: string): string {
  switch (pattern) {
    case "vertical": return "VERTICAL";
    case "horizontal": return "HORIZONTAL";
    case "diagonal": return "DIAGONAL";
    case "corners": return "4 CORNERS";
    case "x": return "X";
    case "whole_card": return "WHOLE CARD";
    default: return pattern.toUpperCase();
  }
}

function normaliseGame(raw: Record<string, unknown> | null | undefined): BingoGame | null {
  if (!raw) return null;
  const cards = Array.isArray(raw.cards) ? raw.cards : [];
  return {
    bingo_game_id: num(raw.bingo_game_id) ?? 0,
    game_no: num(raw.game_no) ?? 0,
    room_name: String(raw.room_name ?? ""),
    host_user_id: num(raw.host_user_id) ?? 0,
    coins_per_square: num(raw.coins_per_square) ?? BINGO_FALLBACK,
    status: String(raw.status ?? ""),
    winner_user_id: num(raw.winner_user_id),
    cards: cards.map((c) => {
      const card = c as Record<string, unknown>;
      const covered = Array.isArray(card.covered) ? card.covered : [];
      const numbers = Array.isArray(card.numbers) ? card.numbers : [];
      return {
        bingo_card_id: num(card.bingo_card_id) ?? 0,
        card_no: num(card.card_no) ?? 0,
        user_id: num(card.user_id) ?? 0,
        player_name: String(card.player_name ?? "A member"),
        player_image: (card.player_image as string | null) ?? null,
        numbers: (numbers as unknown[]).map((col) =>
          (Array.isArray(col) ? col : []).map((n) => num(n))),
        covered: (covered as unknown[]).map((s) => {
          const sq = s as Record<string, unknown>;
          return {
            cell: String(sq.cell ?? ""),
            col: num(sq.col) ?? -1,
            row: num(sq.row) ?? -1,
            gifter_user_id: num(sq.gifter_user_id),
            gifter_name: (sq.gifter_name as string | null) ?? null,
          };
        }),
      };
    }),
    wins: (Array.isArray(raw.wins) ? raw.wins : []).map((w) => {
      const win = w as Record<string, unknown>;
      return {
        user_id: num(win.user_id),
        name: (win.name as string | null) ?? null,
        pattern: String(win.pattern ?? ""),
        pattern_detail: (win.pattern_detail as string | null) ?? null,
      };
    }),
  };
}

export async function fetchBingoGame(roomName: string): Promise<BingoGame | null> {
  const res = await post<Record<string, unknown>>("fetchBingoGame", { room_name: roomName });
  return res.status ? normaliseGame(res.data) : null;
}

/** Starting a game needs no invites and nothing to accept, unlike every other battle here:
 *  nobody given a card is charged anything — the VIEWERS pay — so there is nothing for a
 *  player to consent to. An empty [otherPlayerIds] is a solo game, which is real. */
export async function startBingoBattle(
  userId: number, roomName: string, otherPlayerIds: number[], coinsPerSquare: number,
): Promise<{ game: BingoGame | null; message?: string }> {
  const players = Array.from(new Set([userId, ...otherPlayerIds]));
  const res = await post<Record<string, unknown>>("startBingoBattle", {
    user_id: userId,
    room_name: roomName,
    player_user_ids: players.join(","),
    // A REQUEST, not the price: the server clamps it to its own floor and snapshots the
    // result onto the game. Read the real price back off the response.
    coins_per_square: coinsPerSquare,
  });
  return { game: res.status ? normaliseGame(res.data) : null, message: res.message };
}

export async function cancelBingoBattle(userId: number, bingoGameId: number): Promise<string | null> {
  const res = await post("cancelBingoBattle", { user_id: userId, bingo_game_id: bingoGameId });
  return res.status ? null : (res.message ?? "Couldn't end the game.");
}

/** Buying a square goes through the SAME sendCoinsToUser every other gift uses, so it gets the
 *  same wallet, dead-coin, contest-rate and share-and-earn treatment as a rose. It carries a
 *  card and a square instead of a gift id, and no price at all. */
export async function buyBingoSquare(
  myUserId: number, ownerUserId: number, bingoCardId: number, cell: string, roomName: string,
): Promise<string | null> {
  const res = await post("sendCoinsToUser", {
    my_user_id: myUserId,
    user_id: ownerUserId,
    bingo_card_id: bingoCardId,
    cell,
    room_name: roomName,
  });
  return res.status ? null : (res.message ?? "Couldn't gift that square.");
}

// ---- The lifetime board -----------------------------------------------------------------

export type BingoBoardRow = {
  bingo_game_id: number;
  game_no: number;
  status: string;
  played_at: string | null;
  winner_name: string | null;
  wins_count: number;
};

export type BingoBoard = {
  total_games: number;
  total_wins: number;
  total_members: number;
  games: BingoBoardRow[];
};

export type BingoWinners = {
  game_no: number;
  played_at: string | null;
  players: number;
  squares_gifted: number;
  winners: BingoWin[];
};

export async function fetchBingoBoard(): Promise<BingoBoard> {
  const res = await post<Record<string, unknown>>("fetchBingoBoard", { start: 0, count: 50 });
  if (!res.status) throw new Error(res.message ?? tt("cvc_load_failed"));
  const d = (res.data ?? {}) as Record<string, unknown>;
  return {
    total_games: num(d.total_games) ?? 0,
    total_wins: num(d.total_wins) ?? 0,
    total_members: num(d.total_members) ?? 0,
    games: (Array.isArray(d.games) ? d.games : []).map((g) => {
      const row = g as Record<string, unknown>;
      return {
        bingo_game_id: num(row.bingo_game_id) ?? 0,
        game_no: num(row.game_no) ?? 0,
        status: String(row.status ?? ""),
        played_at: (row.played_at as string | null) ?? null,
        winner_name: (row.winner_name as string | null) ?? null,
        wins_count: num(row.wins_count) ?? 0,
      };
    }),
  };
}

export async function fetchBingoGameWinners(bingoGameId: number): Promise<BingoWinners> {
  const res = await post<Record<string, unknown>>("fetchBingoGameWinners", { bingo_game_id: bingoGameId });
  if (!res.status) throw new Error(res.message ?? tt("couldn_t_load_that_game"));
  const d = (res.data ?? {}) as Record<string, unknown>;
  return {
    game_no: num(d.game_no) ?? 0,
    played_at: (d.played_at as string | null) ?? null,
    players: num(d.players) ?? 0,
    squares_gifted: num(d.squares_gifted) ?? 0,
    winners: (Array.isArray(d.winners) ? d.winners : []).map((w) => {
      const win = w as Record<string, unknown>;
      return {
        user_id: num(win.user_id),
        name: (win.name as string | null) ?? null,
        pattern: String(win.pattern ?? ""),
        pattern_detail: (win.pattern_detail as string | null) ?? null,
      };
    }),
  };
}

/** "12 Oct 2026" from the server's ISO string, or "" when there is none. */
export function bingoPlayedOn(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
