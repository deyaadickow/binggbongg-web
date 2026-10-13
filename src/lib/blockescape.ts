// "Block Escape" (Steve, 2026-10-12) — the boards for the sixth tap-game engine, and its rules.
//
// Drag a block and it slides until something stops it. Reach a gate of your own colour and it
// leaves the board. Clear them all.
//
// The rules live here, beside the fetch, rather than inside the overlay that draws them. They
// have to agree exactly with the solver that proved every board clearable — if the two drift, a
// board verified as solvable silently stops being so and the player meets an impossible level
// that merely looks hard. Keeping them free of React is what lets them be checked on their own.
import { post } from "./api";

export type BlockEscapePiece = { x: number; y: number; w: number; h: number; c: string };
export type BlockEscapeGate = { edge: string; lo: number; hi: number; c: string };
export type BlockEscapeLevel = {
  level_no: number;
  name: string;
  cols: number;
  rows: number;
  par_moves: number;
  pieces: BlockEscapePiece[];
  gates: BlockEscapeGate[];
};

/** A block in play — the level's piece plus whether it has left. */
export type BEBlock = BlockEscapePiece & { gone: boolean };

// A number that may arrive as a string. The web would not throw the whole response away over it
// the way a phone's strict decoder does, which is worse rather than better: "3" where 3 was meant
// quietly breaks the arithmetic while looking like it worked.
function num(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return fallback;
}

export async function fetchBlockEscapeLevels(): Promise<BlockEscapeLevel[]> {
  const res = await post<unknown[]>("fetchBlockEscapeLevels", { x: 1 });
  if (!res.status) throw new Error(res.message ?? "Couldn't load the boards.");
  const rows: unknown[] = Array.isArray(res.data) ? res.data : [];
  return rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      level_no: num(row.level_no),
      name: String(row.name ?? "Board"),
      cols: Math.max(1, num(row.cols, 1)),
      rows: Math.max(1, num(row.rows, 1)),
      par_moves: num(row.par_moves),
      pieces: (Array.isArray(row.pieces) ? row.pieces : []).map((p) => {
        const o = p as Record<string, unknown>;
        return { x: num(o.x), y: num(o.y), w: Math.max(1, num(o.w, 1)), h: Math.max(1, num(o.h, 1)), c: String(o.c ?? "red") };
      }),
      gates: (Array.isArray(row.gates) ? row.gates : []).map((g) => {
        const o = g as Record<string, unknown>;
        return { edge: String(o.edge ?? "left"), lo: num(o.lo), hi: num(o.hi), c: String(o.c ?? "red") };
      }),
    };
  });
}

// ---- the rules ------------------------------------------------------------------------------

/** A block left the board through its gate. */
export const EXITED = -1;

export function occupied(blocks: BEBlock[], skip: number, cx: number, cy: number): boolean {
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (i === skip || b.gone) continue;
    if (cx >= b.x && cx < b.x + b.w && cy >= b.y && cy < b.y + b.h) return true;
  }
  return false;
}

/** Does a gate of this block's colour span its whole cross-section on that edge? */
export function gateAccepts(gates: BlockEscapeGate[], b: BEBlock, edge: string): boolean {
  for (const g of gates) {
    if (g.edge !== edge || g.c !== b.c) continue;
    if (edge === "left" || edge === "right") {
      if (b.y >= g.lo && b.y + b.h - 1 <= g.hi) return true;
    } else {
      if (b.x >= g.lo && b.x + b.w - 1 <= g.hi) return true;
    }
  }
  return false;
}

/**
 * Slides one block as far as it goes, mutating its position.
 * Returns cells travelled, 0 if it could not move, or EXITED if it left the board.
 */
export function slide(
  blocks: BEBlock[], gates: BlockEscapeGate[], cols: number, rows: number,
  index: number, dx: number, dy: number,
): number {
  const b = blocks[index];
  let travelled = 0;
  for (;;) {
    const nx = b.x + dx, ny = b.y + dy;
    if (nx < 0 || ny < 0 || nx + b.w > cols || ny + b.h > rows) {
      const edge = dx < 0 ? "left" : dx > 0 ? "right" : dy < 0 ? "top" : "bottom";
      if (gateAccepts(gates, b, edge)) return EXITED;
      break;
    }
    let blocked = false;
    for (let i = 0; i < b.w && !blocked; i++) {
      for (let j = 0; j < b.h && !blocked; j++) {
        if (occupied(blocks, index, nx + i, ny + j)) blocked = true;
      }
    }
    if (blocked) break;
    b.x = nx;
    b.y = ny;
    travelled++;
  }
  return travelled;
}

export function remaining(blocks: BEBlock[]): number {
  return blocks.filter((b) => !b.gone).length;
}

/** Six colours a player can tell apart at a glance. In a game that is entirely "match this block
 *  to that gate", two colours someone can confuse is not cosmetic, it is an unfair board. */
export function blockColour(name: string): string {
  switch (name) {
    case "blue": return "#3D9BFF";
    case "green": return "#49D86B";
    case "yellow": return "#F5D33D";
    case "purple": return "#B46BFF";
    case "orange": return "#FF9A3D";
    default: return "#FF4D4D";
  }
}
