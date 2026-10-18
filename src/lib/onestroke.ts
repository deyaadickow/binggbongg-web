// "One Stroke" (Steve, 2026-10-12) — the shapes for the fifth tap-game engine.
//
// Coordinates are FRACTIONS of the board (0..1), so one level fits any screen. An edge may bow
// through `via` points; that only shapes the drawn line and never changes which two nodes it
// joins — to the puzzle logic a curved edge is just an edge.
import { post } from "./api";
import { tt } from "./i18n";

export type OneStrokeEdge = { a: number; b: number; via?: number[][] };
export type OneStrokeLevel = {
  level_no: number;
  name: string;
  nodes: number[][];
  edges: OneStrokeEdge[];
};

// A number that may arrive as a string. The web would not throw the whole response away over
// it the way a phone's strict decoder does, which is worse rather than better: "0.5" where 0.5
// was meant quietly breaks the arithmetic while looking like it worked.
function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return 0;
}

export async function fetchOneStrokeLevels(): Promise<OneStrokeLevel[]> {
  const res = await post<unknown[]>("fetchOneStrokeLevels", { x: 1 });
  if (!res.status) throw new Error(res.message ?? tt("couldn_t_load_the_shapes"));
  const rows: unknown[] = Array.isArray(res.data) ? res.data : [];
  return rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      level_no: num(row.level_no),
      name: String(row.name ?? "Shape"),
      nodes: (Array.isArray(row.nodes) ? row.nodes : []).map((n) =>
        (Array.isArray(n) ? n : []).map(num)),
      edges: (Array.isArray(row.edges) ? row.edges : []).map((e) => {
        const edge = e as Record<string, unknown>;
        const out: OneStrokeEdge = { a: num(edge.a), b: num(edge.b) };
        if (Array.isArray(edge.via)) {
          out.via = edge.via.map((p) => (Array.isArray(p) ? p : []).map(num));
        }
        return out;
      }),
    };
  });
}
