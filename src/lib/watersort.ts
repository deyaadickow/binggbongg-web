// "Water Sort" (Steve, 2026-10-27: "Do it now") — the rules and the levels, free of React.
//
// Glass bottles of coloured water: pour the top colour of one bottle onto the same colour (or into
// an empty bottle) until every bottle holds one colour. Android and iOS build the SAME levels from
// the same seed, so level n is the same puzzle on every phone and in every browser. That only holds
// while this file and the Android and iOS ports agree to the letter — the PRNG, the
// shuffle, the deal, the reject rule and the solver's move order. Change one, change all three.
//
// No imports on purpose: this file runs as-is under Node to print levels for the cross-platform
// comparison.

/** Units of water a bottle holds. */
export const CAPACITY = 4;
/** Colours in this order on every platform; a level with C colours uses the first C. */
export const WATER_COLOURS = [
  "#E53935", "#1E88E5", "#43A047", "#FDD835", "#FB8C00", "#8E24AA",
  "#EC407A", "#00ACC1", "#6D4C41", "#C0CA33", "#283593", "#ECEFF1",
] as const;
export const WATER_COLOUR_NAMES = ["red", "blue", "green", "yellow", "orange", "purple", "pink", "cyan", "brown", "lime", "navy", "white"] as const;
/** How many states the level check may visit before it calls a deal unsolvable. */
export const SOLVER_NODE_LIMIT = 60_000;

/** A bottle, bottom first: [0] is the unit resting on the glass. Values are colour indexes. */
export type Bottle = number[];

/** Level n's colour count: 3 for levels 1-2, 4 for 3-4, ... 12 from level 19 on. */
export function coloursForLevel(n: number): number {
  return Math.min(3 + Math.floor((Math.max(1, n) - 1) / 2), 12);
}

/** mulberry32 — the 32-bit PRNG every platform reproduces bit for bit. Returns [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const isComplete = (b: Bottle) => b.length === CAPACITY && b.every((c) => c === b[0]);
export const isSolved = (bs: Bottle[]) => bs.every((b) => b.length === 0 || isComplete(b));
const top = (b: Bottle) => b[b.length - 1];

/** How many units of the top colour sit together at the top of `b`. */
export function topRun(b: Bottle): number {
  if (b.length === 0) return 0;
  const c = top(b);
  let n = 0;
  for (let i = b.length - 1; i >= 0 && b[i] === c; i--) n++;
  return n;
}

/** Units a pour from `from` into `to` would move: 0 means the pour is not allowed. A complete
 *  bottle is corked and cannot be poured from. */
export function pourAmount(from: Bottle, to: Bottle): number {
  if (from.length === 0 || isComplete(from) || from === to) return 0;
  const free = CAPACITY - to.length;
  if (free <= 0) return 0;
  if (to.length > 0 && top(to) !== top(from)) return 0;
  return Math.min(topRun(from), free);
}

/** The bottles after pouring i -> j (new arrays; the input is untouched), or null if illegal. */
export function pour(bs: Bottle[], i: number, j: number): Bottle[] | null {
  if (i === j) return null;
  const n = pourAmount(bs[i], bs[j]);
  if (n === 0) return null;
  const next = bs.map((b) => b.slice());
  const moved = next[i].splice(next[i].length - n, n);
  next[j].push(...moved);
  return next;
}

const keyOf = (bs: Bottle[]) => bs.map((b) => b.join(",")).sort().join("|");

/** Depth-first search for any solution. Moves are tried source 0..n-1, then target 0..n-1
 *  (skipping the source itself), every legal pour, no other pruning; a state already seen (as a
 *  SORTED tuple of bottles) is not entered again. `nodes` counts distinct states entered,
 *  including the start; past SOLVER_NODE_LIMIT the deal is treated as unsolvable.
 *  Written as an explicit stack rather than recursion — a browser's call stack is shallower than
 *  a long search path — but it visits states in exactly the order the recursive version would. */
export function solvable(start: Bottle[], limit = SOLVER_NODE_LIMIT): { ok: boolean; nodes: number } {
  if (isSolved(start)) return { ok: true, nodes: 1 };
  const seen = new Set<string>([keyOf(start)]);
  let nodes = 1;
  const n = start.length;
  // Each frame: the state and the next move (flattened source*n + target) still to try from it.
  const stack: { s: Bottle[]; m: number }[] = [{ s: start, m: 0 }];
  while (stack.length) {
    const f = stack[stack.length - 1];
    if (f.m >= n * n) { stack.pop(); continue; }
    const i = Math.floor(f.m / n), j = f.m % n;
    f.m++;
    const next = pour(f.s, i, j);
    if (!next) continue;
    const k = keyOf(next);
    if (seen.has(k)) continue;
    seen.add(k);
    nodes++;
    if (isSolved(next)) return { ok: true, nodes };
    if (nodes >= limit) return { ok: false, nodes };
    stack.push({ s: next, m: 0 });
  }
  return { ok: false, nodes };
}

export type WaterLevel = { n: number; colours: number; bottles: Bottle[]; attempts: number; nodes: number };

/** Level n, identical on every platform:
 *  1. rand = mulberry32(n * 7919 + 13); C = coloursForLevel(n).
 *  2. list = [0,0,0,0, 1,1,1,1, ... C-1 x4] — filled ONCE.
 *  3. Fisher-Yates the list IN PLACE: for i = len-1 down to 1, j = floor(rand() * (i+1)), swap.
 *  4. Deal: bottle k = list[4k..4k+3], index 0 = bottom; then 2 empty bottles.
 *  5. If any dealt bottle is already complete, or solvable() says no, go back to 3 — shuffling
 *     the SAME (already shuffled) list again, the PRNG carrying on where it was. */
export function generateLevel(n: number): WaterLevel {
  const level = Math.max(1, Math.floor(n));
  const rand = mulberry32(level * 7919 + 13);
  const colours = coloursForLevel(level);
  const list: number[] = [];
  for (let c = 0; c < colours; c++) for (let k = 0; k < CAPACITY; k++) list.push(c);
  for (let attempt = 1; ; attempt++) {
    for (let i = list.length - 1; i >= 1; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = list[i]; list[i] = list[j]; list[j] = t;
    }
    const bottles: Bottle[] = [];
    for (let k = 0; k < colours; k++) bottles.push(list.slice(k * CAPACITY, k * CAPACITY + CAPACITY));
    bottles.push([], []);
    if (bottles.some(isComplete)) continue;
    const check = solvable(bottles);
    if (check.ok) return { n: level, colours, bottles, attempts: attempt, nodes: check.nodes };
    // A safety valve no real level reaches (levels 1-200 were checked when this was written):
    // never spin forever on a seed, hand back the deal and let Restart do its job.
    if (attempt >= 50) return { n: level, colours, bottles, attempts: attempt, nodes: check.nodes };
  }
}

/** One line per bottle, bottom -> top, by colour name — the cross-platform comparison format. */
export function describeLevel(l: WaterLevel): string {
  const rows = l.bottles.map((b, k) => `  bottle ${k + 1}: ${b.length ? b.map((c) => WATER_COLOUR_NAMES[c]).join(", ") : "(empty)"}`);
  return `Level ${l.n} — ${l.colours} colours, ${l.bottles.length} bottles (deal attempt ${l.attempts}, solver visited ${l.nodes} states)\n` +
    `  as indexes, bottom->top: ${JSON.stringify(l.bottles)}\n${rows.join("\n")}`;
}
