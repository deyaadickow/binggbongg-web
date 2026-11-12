// Member page history (Steve, 2026-11-02: "When i click on any member that logged in any time, I
// want to know what pages they looked at. i want this information to be added to each member.").
//
// One row per page a SIGNED-IN member opens, sent in batches to logPageViews and shown on the
// member's admin page (viewUserDetails), kept 30 days. Guests record nothing.
//
// What a row holds: a fixed snake_case screen name, and — where it means something — what was on
// it (a member, a live room, a video, a feature). NEVER anything typed: no message text, no search
// text, no passwords or payment details. Chat records "chat" and who it was with, nothing else.
//
// How it is sent:
//  - The queue lives in localStorage, so views made just before a tab is closed or reloaded go
//    with the next flush instead of being lost. At most 200 rows; the oldest go first.
//  - Flushed every 30 s, when the page is hidden (tab switched, closed, phone locked) and as soon
//    as 20 are waiting. keepalive, so a flush started as the tab closes still arrives.
//  - Never blocks anything and never shows an error: a failed flush leaves the queue for the next.
//  - The queue belongs to ONE member. A different member signing in on this browser starts a new
//    one, and signing out clears it (session.tsx), so nobody's views are filed under someone else.
//
// Labels: the router records each page as it opens (see PageTracking in App.tsx). For the pages
// whose subject is only known once it loads — a profile's @username, a video's caption — that row
// is held back from flushes for a few seconds, and the page fills the label in with trackPage().
import { currentAuthHeaders, post } from "./api";

/** Set at build time in vite.config.ts: the build date and commit, e.g. "2026.11.03+c2eebb5". */
declare const __APP_BUILD__: string;
const APP_VERSION = typeof __APP_BUILD__ === "string" ? __APP_BUILD__ : "web";

const STORAGE_KEY = "bb.pageViews";
const MAX_QUEUE = 200;
const MAX_PER_CALL = 50; // the server's own cap
const FLUSH_AT = 20;
const FLUSH_EVERY_MS = 30_000;
const REPEAT_MS = 2_000; // the same screen + subject again within this is the same view
const LABEL_WAIT_MS = 8_000; // how long a row waits for its page to supply the label
const LABEL_MATCH_MS = 60_000;

export type RefType = "member" | "live" | "video" | "feature" | "business" | "contest" | "product" | "game";

interface Row {
  /** Local sequence number, so a flush removes exactly the rows it sent. Never sent. */
  k: number;
  screen: string;
  ref_type?: string;
  ref_id?: string;
  ref_label?: string;
  /** Device time of the view, unix ms. */
  at: number;
  /** Not sent before this time unless the page is closing: waiting for trackPage's label. */
  wait?: number;
}

interface Stored { u: string; q: Row[]; n: number }

let owner = "";
let queue: Row[] = [];
let seq = 0;
let loaded = false;
let started = false;
let sending = false;
/** When the last flush failed. Until the next 30 s tick, reaching 20 rows does not retry — a
 *  server that is down must not get one request per page the member opens. */
let failedAt = 0;
/** screen|ref_type|ref_id -> when it was last recorded, for the 2 s repeat rule. */
const recent = new Map<string, number>();
/** Rows the router recorded that went out before their page supplied the label (a slow load, or
 *  the tab hid first). The late trackPage() for one of these is not a second view. */
const sentUnlabelled = new Map<string, number>();

function signedInAs(): string {
  const h = currentAuthHeaders();
  return h.AUTHTOKEN && h.USERID ? h.USERID : "";
}

function clip(v: unknown, max: number): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : undefined;
}

function keyOf(screen: string, refType?: string, refId?: string): string {
  return `${screen}|${refType ?? ""}|${refId ?? ""}`;
}

function save() {
  try {
    if (!owner || queue.length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify({ u: owner, q: queue, n: seq } satisfies Stored));
  } catch { /* private mode or full: the queue still lives in memory */ }
}

/** Load the stored queue once, and make sure it belongs to whoever is signed in now. */
function sync(): string {
  const me = signedInAs();
  if (!loaded) {
    loaded = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const s = raw ? (JSON.parse(raw) as Stored) : null;
      if (s && typeof s.u === "string" && Array.isArray(s.q)) {
        owner = s.u;
        queue = s.q.filter((r) => r && typeof r.screen === "string" && typeof r.at === "number").slice(-MAX_QUEUE);
        seq = Math.max(Number(s.n) || 0, ...queue.map((r) => r.k || 0));
      }
    } catch { /* unreadable: start fresh */ }
  }
  if (owner !== me) {
    owner = me;
    queue = [];
    recent.clear();
    sentUnlabelled.clear();
    save();
  }
  return me;
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.setInterval(() => { failedAt = 0; void flush(); }, FLUSH_EVERY_MS);
  // "hidden" covers a tab switch, a minimised window, a locked phone and (on most browsers) a
  // closing tab; pagehide catches the closes and back-forward-cache navigations that skip it.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flush(true);
  });
  window.addEventListener("pagehide", () => { void flush(true); });
}

function add(row: Omit<Row, "k">) {
  queue.push({ ...row, k: ++seq });
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  recent.set(keyOf(row.screen, row.ref_type, row.ref_id), row.at);
  save();
  start();
  if (!failedAt && queue.filter((r) => !r.wait || r.wait <= Date.now()).length >= FLUSH_AT) void flush();
}

function repeated(key: string, now: number): boolean {
  const last = recent.get(key);
  return last !== undefined && now - last < REPEAT_MS;
}

/**
 * Record that the signed-in member opened `screen`, optionally about something.
 * Safe to call from anywhere and as often as you like: guests are ignored and a repeat of the
 * same screen + subject within 2 seconds is dropped.
 *
 * When the router has already recorded this page without its label (a profile, a video, a live
 * room, a chat), this fills the label into that row instead of adding a second one.
 */
export function trackPage(screen: string, refType?: RefType, refId?: string | number, refLabel?: string) {
  try {
    if (!sync()) return;
    const s = clip(screen, 40);
    if (!s || !/^[a-z0-9_]{1,40}$/.test(s)) return;
    const rt = clip(refType, 20);
    const rid = clip(refId, 40);
    const label = clip(refLabel, 80);
    const key = keyOf(s, rt, rid);
    const now = Date.now();

    // The router's row for this same page, still waiting here: give it the label and let it go.
    for (let i = queue.length - 1; i >= 0; i--) {
      const r = queue[i];
      if (now - r.at > LABEL_MATCH_MS) break;
      if (keyOf(r.screen, r.ref_type, r.ref_id) === key && !r.ref_label) {
        if (label) r.ref_label = label;
        delete r.wait;
        save();
        return;
      }
    }
    // The router's row for this page already went out without its label.
    const gone = sentUnlabelled.get(key);
    if (gone !== undefined) {
      sentUnlabelled.delete(key);
      if (now - gone < LABEL_MATCH_MS) return;
    }
    if (repeated(key, now)) return;

    add({ screen: s, ref_type: rt, ref_id: rid, ref_label: label, at: now });
  } catch { /* never let tracking break a page */ }
}

/**
 * The router's half: one row per route change. `awaitLabel` holds the row back from flushes for a
 * few seconds so the page can name its subject with trackPage() once it has loaded.
 */
export function trackRoute(screen: string, refType?: RefType, refId?: string | number, awaitLabel = false) {
  try {
    if (!sync()) return;
    const rt = clip(refType, 20);
    const rid = clip(refId, 40);
    const key = keyOf(screen, rt, rid);
    const now = Date.now();
    if (repeated(key, now)) return;
    add({ screen, ref_type: rt, ref_id: rid, at: now, ...(awaitLabel && rid ? { wait: now + LABEL_WAIT_MS } : {}) });
  } catch { /* never let tracking break a page */ }
}

/** How a member is named in the history: "@username", else their name. */
export function memberLabel(u?: { username?: string | null; fullname?: string | null } | null): string | undefined {
  const name = u?.username?.trim();
  return name ? "@" + name : u?.fullname?.trim() || undefined;
}

/**
 * Send what is waiting. `closing` (the page is being hidden) sends everything, including rows
 * still waiting for a label — better unlabelled than lost.
 */
export async function flush(closing = false): Promise<void> {
  if (sending) return;
  const me = sync();
  if (!me || queue.length === 0) return;
  const now = Date.now();
  const batch = queue.filter((r) => closing || !r.wait || r.wait <= now).slice(0, MAX_PER_CALL);
  if (batch.length === 0) return;
  sending = true;
  // Out of the stored queue BEFORE sending (Steve, 2026-11-12: "210 pages" in under a minute): a page that
  // reloads or closes never sees the reply, so the rows used to stay stored and were sent again by the
  // next page load - 1+2+...+20 = 210 rows for 20 pages. A failed send puts them back.
  const sent = new Set(batch.map((r) => r.k));
  queue = queue.filter((r) => !sent.has(r.k));
  save();
  try {
    const views = batch.map((r) => ({
      screen: r.screen,
      ...(r.ref_type ? { ref_type: r.ref_type } : {}),
      ...(r.ref_id ? { ref_id: r.ref_id } : {}),
      ...(r.ref_label ? { ref_label: r.ref_label } : {}),
      at: r.at,
    }));
    await post("logPageViews", { platform: "web", app_version: APP_VERSION, views: JSON.stringify(views) }, { keepalive: true });
    // The member may have signed out or switched while this was in flight; sync() already
    // emptied the queue then, and nothing must be resurrected into it.
    failedAt = 0;
    if (owner === me) {
      for (const r of batch) if (r.wait && !r.ref_label) sentUnlabelled.set(keyOf(r.screen, r.ref_type, r.ref_id), r.at);
    }
  } catch {
    /* offline, server error, not deployed yet: the rows go back for the next flush */
    if (owner === me) {
      queue = [...batch, ...queue].slice(-MAX_QUEUE);
      save();
    }
    failedAt = Date.now();
    return;
  } finally {
    sending = false;
  }
  // A backlog (a long offline spell) drains 50 at a time without waiting 30 s between batches.
  if (queue.filter((r) => closing || !r.wait || r.wait <= Date.now()).length >= (closing ? 1 : FLUSH_AT)) void flush(closing);
}

/**
 * Signing out: send what this member has waiting (their headers are still installed at this
 * point), then forget it, so the next person on this browser starts with nothing.
 */
export function signOutPageViews() {
  try {
    if (signedInAs() && queue.length > 0 && !sending) void flush(true);
  } catch { /* ignore */ }
  owner = "";
  queue = [];
  recent.clear();
  sentUnlabelled.clear();
  loaded = true;
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
