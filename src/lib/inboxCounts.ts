// Inbox tab counts (Steve, 2026-11-10): "Here please add a # of notification in it's box, # of
// Messages in it's box etc  Notification (3)  Messages (5)  Admin (2)".
//
// Server side (fetchInboxCounts / markInboxSeen, checkHeader + authorizeUser, my_user_id bound to
// the caller) keeps one "seen at" time per tab on tbl_users and answers
//   {"status":true,"data":{"notifications":3,"admin":2,"announcements":1}}
// each count an int capped at 100. Until those endpoints are deployed (or whenever they fail)
// the calls throw / return null and the tabs simply show their plain labels.
//
// The web inbox has no Admin tab (Notifications / Messages / Announcements), so `admin` is kept
// in the shape but not drawn. Messages are counted on the client from Firestore — see dm.ts.
import { post } from "./api";

export type InboxSeenTab = "notifications" | "admin" | "announcements";

export interface InboxCounts {
  notifications: number;
  admin: number;
  announcements: number;
}

const toCount = (v: unknown): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

function parse(data: unknown): InboxCounts | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  return { notifications: toCount(d.notifications), admin: toCount(d.admin), announcements: toCount(d.announcements) };
}

/** The caller's unread counts, or null when the server can't say (not deployed yet, offline…). */
export async function fetchInboxCounts(myId: number): Promise<InboxCounts | null> {
  try {
    const res = await post<unknown>("fetchInboxCounts", { my_user_id: myId });
    return res.status === false ? null : parse(res.data);
  } catch {
    return null;
  }
}

/** Marks one tab seen now; answers the new counts (same shape), or null on any failure. */
export async function markInboxSeen(myId: number, tab: InboxSeenTab): Promise<InboxCounts | null> {
  try {
    const res = await post<unknown>("markInboxSeen", { my_user_id: myId, tab });
    return res.status === false ? null : parse(res.data);
  } catch {
    return null;
  }
}

/** "Notifications (3)" / "(99+)" above 99 / nothing at all for 0. */
export function countSuffix(n: number | null | undefined): string {
  if (!n || n <= 0) return "";
  return n > 99 ? "(99+)" : `(${n})`;
}

// ---------------------------------------------------------------------------------------------
// One shared copy of the counts (2026-11-10, Steve: "Also please add the total messages on the
// bottom 'Inbox (5)'"), so the Inbox tabs and the header's Inbox pill always show the same
// numbers. <InboxCountsSync/> (mounted once in App) loads them; the tabs mark one seen.

interface Snapshot {
  /** From fetchInboxCounts / markInboxSeen; null while unknown or when the server can't say. */
  server: InboxCounts | null;
  /** Conversations with `newMsg: true` in the member's Firestore inbox; null while unknown. */
  unreadThreads: number | null;
}

let snap: Snapshot = { server: null, unreadThreads: null };
const listeners = new Set<() => void>();
/** Tabs zeroed on this screen whose markInboxSeen has not answered yet. A fetch that lands in
 *  the meantime must not bring their old number back. */
const pendingSeen = new Set<InboxSeenTab>();
/** Bumped whenever a markInboxSeen answers — a fetch started before that is stale. */
let epoch = 0;

function emit(next: Partial<Snapshot>) {
  snap = { ...snap, ...next };
  listeners.forEach((l) => l());
}

function withPending(c: InboxCounts | null): InboxCounts | null {
  if (!c) return c;
  const out = { ...c };
  pendingSeen.forEach((t) => { out[t] = 0; });
  return out;
}

export function subscribeInboxCounts(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
export const inboxCountsSnapshot = (): Snapshot => snap;

/** Reload the server counts (Inbox opened, page load, tab back in front). */
export async function refreshInboxCounts(myId: number): Promise<void> {
  const started = epoch;
  const c = await fetchInboxCounts(myId);
  if (started !== epoch) return; // a mark answered meanwhile; its counts are newer
  emit({ server: withPending(c) });
}

/** The member opened this tab: 0 straight away, then the server's own answer. */
export function markTabSeen(myId: number, tab: InboxSeenTab): void {
  pendingSeen.add(tab);
  if (snap.server) emit({ server: { ...snap.server, [tab]: 0 } });
  void markInboxSeen(myId, tab).then((c) => {
    if (!c) return; // not deployed / failed: keep it at 0 locally for this visit
    pendingSeen.delete(tab);
    epoch++;
    emit({ server: withPending(c) });
  });
}

export function setUnreadThreads(n: number | null): void {
  if (snap.unreadThreads !== n) emit({ unreadThreads: n });
}

export function resetInboxCounts(): void {
  pendingSeen.clear();
  epoch++;
  emit({ server: null, unreadThreads: null });
}

/** The header's "Inbox (N)": the same numbers the web's Inbox tabs show (Notifications +
 *  Messages + Announcements). The web inbox has no Admin tab, so `admin` is left out — a number
 *  there could never be cleared from the web. Server down: Messages alone. */
export function inboxTotal(s: Snapshot): number {
  const server = s.server ? s.server.notifications + s.server.announcements : 0;
  return server + (s.unreadThreads ?? 0);
}
