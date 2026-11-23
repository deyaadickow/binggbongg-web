// Bingg Bongg Banger (Steve, 2026-11-23: "Yes, build it as a live game, Call it Bingg Bongg Banger").
// Our OWN connect-the-line game: the host drags a line through 3+ touching pieces of the same kind
// (gold coin, Bingg Bongg mark, heart, star, crown, gem) to clear them; pieces fall, new ones drop in.
// The host's browser runs the board and sends the whole board after every move (pushBanger); the
// room watches it through the one games poll (lib/roomgames.ts, key `banger`). Viewers send boosters
// (+5 Moves, Shuffle, Bomb, Color Blast) — each an ordinary live gift to the host, priced on the
// server. Skill only: free to play, nothing won back.
//
// The rules below are the contract every platform follows (backend docs/banger_contract.md).
import { post } from "./api";
import { mulberry32 } from "./watersort";

export const COLS = 7;
export const ROWS = 8;
export const KINDS = 6;
export const CELLS = COLS * ROWS;
export const MOVES = 30;
export const LAST_CHANCE_MS = 5000;

export type BoosterKind = "moves" | "shuffle" | "bomb" | "blast";
export const BOOSTER_ICON: Record<BoosterKind, string> = { moves: "➕", shuffle: "🔀", bomb: "💣", blast: "🌈" };
export type WordKey = "nice" | "great" | "awesome" | "banger" | "mega" | "bomb" | "blast" | "shuffle" | "moves" | "reshuffle";

export type BangerBoosterRow = { id: number; kind: BoosterKind; user_id: number; name: string; image: string | null; applied: boolean };
export type BangerTop = { user_id: number; name: string; image: string | null; coins: number; boosters: number };
export type Banger = {
  banger_id: number; room_name: string; host_user_id: number; host_name: string;
  status: "active" | "over" | string; end_reason: string | null;
  limit_type: "moves" | "time"; moves_left: number; seconds_left: number | null;
  seed: number; board: string; seq: number; score: number; combo: number; best_chain: number;
  last_path: [number, number][]; last_word: WordKey | null;
  host_best: number; new_best: boolean;
  boosters: { kind: BoosterKind; bbs: number }[];
  extra_moves: number; extra_seconds: number;
  recent_boosters: BangerBoosterRow[]; pending_boosters: { id: number; kind: BoosterKind }[];
  top_boosters: BangerTop[]; boosters_total: number; coins_total: number | null;
  my_boosters_total: number; is_host: boolean; can_boost: boolean;
};

const num = (v: unknown, d = 0): number => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const bool = (v: unknown): boolean => v === true || v === 1 || v === "1" || v === "true";
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const KIND_SET = new Set(["moves", "shuffle", "bomb", "blast"]);

export function norm(raw: unknown): Banger | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const id = num(d.banger_id, 0);
  if (!id) return null;
  return {
    banger_id: id, room_name: String(d.room_name ?? ""), host_user_id: num(d.host_user_id), host_name: String(d.host_name ?? ""),
    status: String(d.status ?? "active"), end_reason: d.end_reason ? String(d.end_reason) : null,
    limit_type: d.limit_type === "time" ? "time" : "moves", moves_left: num(d.moves_left),
    seconds_left: d.seconds_left === null || d.seconds_left === undefined ? null : num(d.seconds_left),
    seed: num(d.seed, 1), board: /^[0-5]{56}$/.test(String(d.board ?? "")) ? String(d.board) : "",
    seq: num(d.seq), score: num(d.score), combo: num(d.combo), best_chain: num(d.best_chain),
    last_path: arr(d.last_path).map((p) => arr(p)).filter((p) => p.length >= 2).map((p) => [num(p[0]), num(p[1])] as [number, number]),
    last_word: d.last_word ? (String(d.last_word) as WordKey) : null,
    host_best: num(d.host_best), new_best: bool(d.new_best),
    boosters: arr(d.boosters).map(obj).filter((b) => KIND_SET.has(String(b.kind))).map((b) => ({ kind: String(b.kind) as BoosterKind, bbs: num(b.bbs, 1) })),
    extra_moves: num(d.extra_moves, 5), extra_seconds: num(d.extra_seconds, 10),
    recent_boosters: arr(d.recent_boosters).map(obj).filter((b) => KIND_SET.has(String(b.kind))).map((b) => ({
      id: num(b.id), kind: String(b.kind) as BoosterKind, user_id: num(b.user_id), name: String(b.name ?? ""),
      image: b.image ? String(b.image) : null, applied: bool(b.applied),
    })),
    pending_boosters: arr(d.pending_boosters).map(obj).filter((b) => KIND_SET.has(String(b.kind))).map((b) => ({ id: num(b.id), kind: String(b.kind) as BoosterKind })),
    top_boosters: arr(d.top_boosters).map(obj).map((t) => ({ user_id: num(t.user_id), name: String(t.name ?? ""), image: t.image ? String(t.image) : null, coins: num(t.coins), boosters: num(t.boosters) })),
    boosters_total: num(d.boosters_total), coins_total: d.coins_total === null || d.coins_total === undefined ? null : num(d.coins_total),
    my_boosters_total: num(d.my_boosters_total), is_host: bool(d.is_host),
    can_boost: d.can_boost === undefined ? !bool(d.is_host) : bool(d.can_boost),
  };
}

const stateOf = (res: Record<string, unknown>): Banger | null => {
  const d = res.data as Record<string, unknown> | undefined;
  return norm(d?.banger) ?? norm(d);
};

export const NOT_ENOUGH_COINS = "not_enough_coins";

export async function startBanger(userId: number, roomName: string, limitType: "moves" | "time") {
  const res = await post<Record<string, unknown>>("startBanger", { user_id: userId, room_name: roomName, limit_type: limitType });
  return { game: res.status ? stateOf(res) : null, message: res.status ? null : (res.message ?? null) };
}

export type PushBody = {
  board: number[]; score: number; movesLeft: number; combo: number; bestChain: number;
  lastPath: [number, number][]; lastWord: WordKey | null; applied: number[];
};

export async function pushBanger(userId: number, bangerId: number, b: PushBody) {
  const res = await post<Record<string, unknown>>("pushBanger", {
    user_id: userId, banger_id: bangerId, board: b.board.join(""), score: b.score, moves_left: b.movesLeft,
    combo: b.combo, best_chain: b.bestChain, last_path: JSON.stringify(b.lastPath), last_word: b.lastWord ?? "",
    applied: JSON.stringify(b.applied),
  });
  const code = (res as { code?: unknown }).code;
  return { game: stateOf(res), ok: !!res.status, code: code ? String(code) : null };
}

export type BoostResult = { game: Banger | null; ok: boolean; message: string | null };

export async function sendBangerBooster(userId: number, bangerId: number, kind: BoosterKind): Promise<BoostResult> {
  const res = await post<Record<string, unknown>>("sendBangerBooster", { user_id: userId, banger_id: bangerId, booster: kind });
  const code = (res as { code?: unknown }).code;
  const m = String(res.message ?? "");
  return {
    game: stateOf(res), ok: !!res.status,
    message: res.status ? null : code === NOT_ENOUGH_COINS || m === NOT_ENOUGH_COINS ? NOT_ENOUGH_COINS : m || "boost_failed",
  };
}

export async function endBanger(userId: number, bangerId: number, finished: boolean, score: number) {
  const res = await post<Record<string, unknown>>("endBanger", { user_id: userId, banger_id: bangerId, reason: finished ? "finished" : "host", score });
  return { game: stateOf(res), message: res.status ? null : (res.message ?? null) };
}

// ---- The game -----------------------------------------------------------------------------

export type Rng = () => number;
export const newRng = (seed: number): Rng => mulberry32(seed);
const pick = (rng: Rng) => Math.floor(rng() * KINDS);
export const idx = (r: number, c: number) => r * COLS + c;
export const rc = (i: number): [number, number] => [Math.floor(i / COLS), i % COLS];
export const parseBoard = (s: string): number[] => s.split("").map((ch) => Number(ch));

/** Two cells touch: 8 directions. */
export function touching(a: number, b: number): boolean {
  const [ra, ca] = rc(a); const [rb, cb] = rc(b);
  return a !== b && Math.abs(ra - rb) <= 1 && Math.abs(ca - cb) <= 1;
}

/** A line of 3+ exists somewhere = some same-kind group (8-connected) has 3+ pieces. */
export function hasMove(board: number[]): boolean {
  const seen = new Uint8Array(CELLS);
  for (let s = 0; s < CELLS; s++) {
    if (seen[s] || board[s] < 0) continue;
    let size = 0; const stack = [s]; seen[s] = 1;
    while (stack.length) {
      const i = stack.pop()!; size++;
      if (size >= 3) return true;
      const [r, c] = rc(i);
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr; const cc = c + dc;
        if ((dr || dc) && rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) {
          const j = idx(rr, cc);
          if (!seen[j] && board[j] === board[i]) { seen[j] = 1; stack.push(j); }
        }
      }
    }
  }
  return false;
}

/** Fisher-Yates with the game's rng until the board has a move. */
export function shuffle(board: number[], rng: Rng): number[] {
  const b = board.slice();
  for (let tries = 0; tries < 100; tries++) {
    for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
    if (hasMove(b)) return b;
  }
  return b;
}

export function newBoard(rng: Rng): number[] {
  const b = Array.from({ length: CELLS }, () => pick(rng));
  return hasMove(b) ? b : shuffle(b, rng);
}

/** Clear `cells`, let the rest fall, fill the top from the rng (column 0..6, bottom-most empty first).
 *  Returns the new board and how many rows each final cell fell (for the drop animation). */
export function clearAndFall(board: number[], cells: number[], rng: Rng): { board: number[]; drop: number[] } {
  const gone = new Set(cells);
  const out = new Array<number>(CELLS).fill(-1);
  const drop = new Array<number>(CELLS).fill(0);
  for (let c = 0; c < COLS; c++) {
    let write = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      const i = idx(r, c);
      if (gone.has(i)) continue;
      out[idx(write, c)] = board[i]; drop[idx(write, c)] = write - r; write--;
    }
    const empties = write + 1;
    for (let r = write; r >= 0; r--) { out[idx(r, c)] = pick(rng); drop[idx(r, c)] = empties; }
  }
  return { board: out, drop };
}

/** The same drop distances, worked out by a VIEWER from the new board and the cleared cells alone. */
export function dropFor(cells: number[]): number[] {
  const drop = new Array<number>(CELLS).fill(0);
  const gone = new Set(cells);
  for (let c = 0; c < COLS; c++) {
    const survivors: number[] = [];
    for (let r = 0; r < ROWS; r++) if (!gone.has(idx(r, c))) survivors.push(r);
    const k = ROWS - survivors.length;
    for (let r = 0; r < k; r++) drop[idx(r, c)] = k;
    survivors.forEach((s, i) => { drop[idx(k + i, c)] = k + i - s; });
  }
  return drop;
}

export function lineScore(n: number, combo: number): number {
  return Math.floor(n * n * 5 * (1 + 0.5 * Math.min(6, combo))) + (n >= 6 ? 100 * (n - 5) : 0);
}
export function wordFor(n: number): WordKey {
  return n >= 8 ? "mega" : n >= 6 ? "banger" : n === 5 ? "awesome" : n === 4 ? "great" : "nice";
}

/** Bomb: a random centre away from the edges, the 3x3 around it. */
export function bombCells(rng: Rng): number[] {
  const r = 1 + Math.floor(rng() * (ROWS - 2));
  const c = 1 + Math.floor(rng() * (COLS - 2));
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) out.push(idx(r + dr, c + dc));
  return out;
}

/** Color Blast: every piece of the kind with the most pieces (tie -> lower kind). */
export function blastCells(board: number[]): number[] {
  const counts = new Array(KINDS).fill(0);
  board.forEach((k) => { if (k >= 0) counts[k]++; });
  let best = 0;
  for (let k = 1; k < KINDS; k++) if (counts[k] > counts[best]) best = k;
  return board.map((k, i) => (k === best ? i : -1)).filter((i) => i >= 0);
}

export const toPath = (cells: number[]): [number, number][] => cells.map(rc);
