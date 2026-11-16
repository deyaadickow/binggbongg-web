// Automatic captions (Steve, 2026-11-16: "Build all three on all 3 platforms" — the editor,
// automatic captions, text posts + slideshows). The server writes timed lines of the spoken words
// about a minute after an upload; the players show the line under way, and the creator can fix
// the words or switch them off. Nothing here is the creator's own typed coloured `captions`.
import { post, type Post } from "./api";

export interface CaptionLine { s: number; e: number; t: string }

/** The lines of a post, or [] — the field is a JSON string, and may be missing, null or junk. */
export function parseCaptions(raw: unknown): CaptionLine[] {
  if (!raw) return [];
  let rows: unknown = raw;
  if (typeof raw === "string") {
    try { rows = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => ({ s: Number((r as CaptionLine)?.s), e: Number((r as CaptionLine)?.e), t: String((r as CaptionLine)?.t ?? "").trim() }))
    .filter((r) => Number.isFinite(r.s) && Number.isFinite(r.e) && r.e > r.s && r.t)
    .sort((a, b) => a.s - b.s);
}

/** Captions to show for this post: written, switched on, and at least one line. */
export function shownCaptions(p: Post | null | undefined): CaptionLine[] {
  if (!p || p.auto_captions_status !== "done" || Number(p.auto_captions_on ?? 0) !== 1) return [];
  return parseCaptions(p.auto_captions);
}

export function captionAt(lines: CaptionLine[], t: number): string {
  for (const l of lines) if (l.s <= t && t < l.e) return l.t;
  return "";
}

// ---- The viewer's CC switch: one choice for every video, kept on this device (default ON) ----
const CC_KEY = "bb.autoCaptionsCC";
const listeners = new Set<() => void>();

export function readCcOn(): boolean {
  try { return localStorage.getItem(CC_KEY) !== "0"; } catch { return true; }
}
export function writeCcOn(on: boolean) {
  try { localStorage.setItem(CC_KEY, on ? "1" : "0"); } catch { /* private mode: this page only */ }
  listeners.forEach((l) => l());
}
export function subscribeCc(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

// ---- The creator's two calls (owner only; the session's auth headers go with post()) ----
type CaptionData = Pick<Post, "id" | "auto_captions" | "auto_captions_status" | "auto_captions_on" | "auto_captions_lang">;

export async function setPostAutoCaptions(userId: number, postId: number, on: boolean): Promise<CaptionData> {
  const r = await post<CaptionData>("setPostAutoCaptions", { user_id: userId, post_id: postId, on: on ? 1 : 0 });
  if (!r.status || !r.data) throw new Error(r.message || "Couldn't change the captions. Please try again.");
  return r.data;
}

export async function updatePostAutoCaptions(userId: number, postId: number, lines: CaptionLine[]): Promise<CaptionData> {
  const r = await post<CaptionData>("updatePostAutoCaptions", {
    user_id: userId,
    post_id: postId,
    auto_captions: JSON.stringify(lines.map((l) => ({ s: l.s, e: l.e, t: l.t }))),
  });
  if (!r.status || !r.data) throw new Error(r.message || "Couldn't save the captions. Please try again.");
  return r.data;
}
