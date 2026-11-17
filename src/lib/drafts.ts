// Drafts (Steve, 2026-11-17: "All" — TikTok-style features). A video that is ready to post can be
// kept on THIS browser and posted later, exactly as it was set up: the final video file itself,
// its thumbnail, and every field of the upload page (caption, category, switches, the duet /
// stitch / sound it came from, the comment it replies to, the question it answers, stickers,
// subscribers-only / series / post later). Nothing goes to the server until Post is pressed.
//
// Stored in IndexedDB (a video is far too big for localStorage), one record per draft, scoped to
// the member who saved it so a shared computer never shows one member another member's drafts.
import type { StickerState } from "../components/StickerEditor";
import type { ReplyComment } from "./social";

const DB_NAME = "bb-drafts";
const STORE = "drafts";
const VERSION = 1;

export type DraftRemix =
  | { type: "duet" | "stitch"; postId: number; userName?: string; soundId?: number | null }
  | { type?: undefined; soundId: number; soundTitle?: string };

export interface DraftAnswer { id: number; question: string; asker_name: string }

/** Every field of the upload page, so posting the draft later sends the same upload. */
export interface DraftFields {
  catId: string;
  description: string;
  linkedUrl: string;
  country: string;
  state: string;
  canComment: boolean;
  canSave: boolean;
  allowRepost: boolean;
  canDuet: boolean;
  canStitch: boolean;
  autoCaptions: boolean;
  postKind: "video" | "text" | "slideshow" | "song";
  songId: number | null;
  remix: DraftRemix | null;
  replyComment: Pick<ReplyComment, "id" | "post_id" | "comment" | "user_name" | "fullname"> | null;
  joinAddYours: { id: number; prompt: string } | null;
  answerQuestion: DraftAnswer | null;
  stickers: StickerState;
  subsOnly: boolean;
  seriesId: string;
  later: boolean;
  laterAt: string;
}

export interface Draft {
  id: number;
  user_id: number;
  created_at: number;
  updated_at: number;
  video: Blob;
  video_name: string;
  video_type: string;
  duration: number | null;
  thumb: Blob | null;
  fields: DraftFields;
}

export function draftsSupported(): boolean {
  try { return typeof indexedDB !== "undefined" && !!indexedDB; } catch { return false; }
}

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (!draftsSupported()) { reject(new Error("no-indexeddb")); return; }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) {
        const s = d.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        s.createIndex("user_id", "user_id", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexeddb"));
    req.onblocked = () => reject(new Error("indexeddb-blocked"));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then((d) => new Promise<T>((resolve, reject) => {
    const tx = d.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    let result: T;
    req.onsuccess = () => { result = req.result; };
    req.onerror = () => reject(req.error ?? new Error("indexeddb"));
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error ?? new Error("indexeddb"));
    tx.onabort = () => reject(tx.error ?? new Error("indexeddb-abort"));
  }));
}

const listeners = new Set<() => void>();
/** Called whenever a draft is saved or deleted (the profile tile's count follows it). */
export function onDraftsChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
const changed = () => listeners.forEach((fn) => { try { fn(); } catch { /* one listener can't stop the rest */ } });

/** The member's drafts, newest first. */
export async function listDrafts(userId: number): Promise<Draft[]> {
  if (!userId || !draftsSupported()) return [];
  try {
    const rows = await run<Draft[]>("readonly", (s) => s.index("user_id").getAll(IDBKeyRange.only(userId)) as IDBRequest<Draft[]>);
    return (rows ?? []).sort((a, b) => b.updated_at - a.updated_at);
  } catch {
    return [];
  }
}

export async function countDrafts(userId: number): Promise<number> {
  if (!userId || !draftsSupported()) return 0;
  try {
    return await run<number>("readonly", (s) => s.index("user_id").count(IDBKeyRange.only(userId)));
  } catch {
    return 0;
  }
}

/** One draft — only the member's own. */
export async function getDraft(userId: number, id: number): Promise<Draft | null> {
  if (!userId || !id) return null;
  const d = await run<Draft | undefined>("readonly", (s) => s.get(id) as IDBRequest<Draft | undefined>);
  return d && d.user_id === userId ? d : null;
}

/** Save a new draft (no id) or overwrite one. Returns the draft's id. */
export async function saveDraft(input: Omit<Draft, "id" | "created_at" | "updated_at"> & { id?: number | null; created_at?: number }): Promise<number> {
  const now = Date.now();
  const { id, ...rest } = input;
  const row: Partial<Draft> = { ...rest, created_at: input.created_at ?? now, updated_at: now, ...(id ? { id } : {}) };
  const key = await run<IDBValidKey>("readwrite", (s) => s.put(row));
  changed();
  return Number(key);
}

export async function deleteDraft(userId: number, id: number): Promise<void> {
  const d = await getDraft(userId, id).catch(() => null);
  if (!d) return;
  await run("readwrite", (s) => s.delete(id));
  changed();
}
