// Bingg Bongg Bonus (Steve, 2026-11-07): "every time a member receives 500 gift coins in
// lives/battles, Bingg Bongg sends them a 5% bonus" shown as "50 Bingg Bongg Gloves floating all
// over the screen for 10 seconds" and "a Bullet banner ... 'Bingg Bongg Bonus' with Black
// background and gold border and text."
//
// The server decides: sendCoinsToUser answers `bingg_bonus` (null unless the RECIPIENT just
// crossed a bonus). The sender then:
//   1. posts a line into the RECIPIENT's live chat channel — the same Firestore envelope the gift
//      line uses (liveChat/{room}__{recipient}/messages: senderUserId, senderName, message,
//      sentAt, senderProfileImage). The collection's security rules whitelist those fields, so
//      the payload rides in `message` as JSON: {"type":"bingg_bonus", user_id, username,
//      full_name, times, bonus_coins, gloves, seconds, banner, sender_id} — plus "style" right
//      after "type" (2026-11-07, admin picks how the gloves appear). senderUserId is 0
//      (a system line), never negative, so nothing mistakes it for a gift.
//   2. plays it locally at once — it skips its own echo by sender_id.
// Every screen that reads a room's chat runs it through makeBinggBonusWatcher, which plays new
// bonus lines and drops them from the visible chat. <BinggBonusOverlay /> does the showing.
import type { ChatMessage } from "./firebase";

export const BINGG_BONUS_TYPE = "bingg_bonus";
const CHAT_MAX_CHARS = 500;
const EVENT = "bb-bingg-bonus";

/** How the gloves appear — admin's pick (backend 61650b4), the same burst effects a gift can have.
 *  "waves" is the overlay's own pop-in waves; every other one plays TapTapBurst. */
export const BINGG_BONUS_STYLES = ["waves", "taptap", "rainfall", "left_hander", "right_hander", "surprise", "universal", "spot"] as const;
export type BinggBonusStyle = (typeof BINGG_BONUS_STYLES)[number];

export interface BinggBonus {
  /** Missing or unknown -> "waves". */
  style: BinggBonusStyle;
  user_id: number;
  username: string;
  full_name: string;
  times: number;
  bonus_coins: number;
  gloves: number;
  seconds: number;
  banner: string;
  /** Admin's uploaded bonus image (backend 207b180): a full https URL, or null = the built-in
   *  gloves logo (/img/bb_gloves_logo.png). */
  image: string | null;
  /** The gift sender's user id (who published it). */
  sender_id: number;
}

const num = (v: unknown, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

/** The server's `bingg_bonus` (or a chat payload) -> a BinggBonus, or null when it is not one. */
export function normalizeBinggBonus(raw: unknown, senderId?: number): BinggBonus | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const userId = num(r.user_id);
  if (userId <= 0) return null;
  const style = String(r.style ?? "").toLowerCase();
  return {
    style: (BINGG_BONUS_STYLES as readonly string[]).includes(style) ? (style as BinggBonusStyle) : "waves",
    user_id: userId,
    username: String(r.username ?? ""),
    full_name: String(r.full_name ?? ""),
    times: Math.max(1, num(r.times, 1)),
    bonus_coins: Math.max(0, num(r.bonus_coins)),
    gloves: Math.min(300, Math.max(1, num(r.gloves, 50))),
    seconds: Math.min(30, Math.max(3, num(r.seconds, 10))),
    banner: String(r.banner || "Bingg Bongg Bonus"),
    image: typeof r.image === "string" && /^https:\/\//i.test(r.image.trim()) ? r.image.trim() : null,
    sender_id: num(r.sender_id ?? senderId),
  };
}

/** A chat line's bonus, or null for every ordinary line. */
export function parseBinggBonusLine(m: Pick<ChatMessage, "message">): BinggBonus | null {
  const s = m.message;
  if (!s || s[0] !== "{" || !s.includes(BINGG_BONUS_TYPE)) return null;
  try {
    const j = JSON.parse(s) as Record<string, unknown>;
    return j && j.type === BINGG_BONUS_TYPE ? normalizeBinggBonus(j) : null;
  } catch {
    return null;
  }
}

/** Show a bonus on this screen (BinggBonusOverlay queues and plays it). */
export function playBinggBonus(b: BinggBonus) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<BinggBonus>(EVENT, { detail: b }));
}

/** BinggBonusOverlay's subscription. */
export function onBinggBonus(fn: (b: BinggBonus) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<BinggBonus>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

/**
 * Called by api.post for every successful sendCoinsToUser that carries `bingg_bonus` — so every
 * gift path (live gifts, battles, game power-ups bought as gifts, Chat/Country Battle) is covered.
 * Plays it here at once, then posts it into the recipient's chat channel for everyone else.
 */
export async function publishBinggBonus(raw: unknown, params: Record<string, unknown>) {
  const senderId = num(params.my_user_id);
  const b = normalizeBinggBonus(raw, senderId);
  if (!b) return;
  b.sender_id = senderId;
  playBinggBonus(b);
  const roomName = typeof params.room_name === "string" ? params.room_name : "";
  if (!roomName) return;
  try {
    const { chatChannel, sendChat } = await import("./firebase");
    const payload = {
      type: BINGG_BONUS_TYPE,
      style: b.style,
      user_id: b.user_id, username: b.username, full_name: b.full_name, times: b.times,
      bonus_coins: b.bonus_coins, gloves: b.gloves, seconds: b.seconds, banner: b.banner, sender_id: b.sender_id,
    };
    // The chat's message limit is 500 characters: a long image URL is left out (receivers then
    // fly the built-in logo) rather than the whole line being refused.
    let line = JSON.stringify(b.image ? { ...payload, image: b.image } : payload);
    if (line.length > CHAT_MAX_CHARS) line = JSON.stringify(payload);
    await sendChat(chatChannel(roomName, b.user_id), 0, "Bingg Bongg", line, "");
  } catch { /* the sender has already seen it; the room just misses this one */ }
}

/**
 * Wraps a room chat's snapshot callback: bonus lines that arrive AFTER the first snapshot (the
 * history) are played — except my own, which played when I sent it — and every bonus line is
 * dropped from what the chat shows. One watcher per subscription.
 */
export function makeBinggBonusWatcher(getMyId: () => number | null | undefined) {
  let seen: Set<string> | null = null;
  return (all: ChatMessage[]): ChatMessage[] => {
    const first = seen === null;
    if (!seen) seen = new Set();
    const shown: ChatMessage[] = [];
    for (const m of all) {
      const b = parseBinggBonusLine(m);
      if (!b) { shown.push(m); continue; }
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      if (first) continue;
      if (b.sender_id && b.sender_id === getMyId()) continue;
      if (m.sentAt && Math.abs(Date.now() - m.sentAt) > 120_000) continue; // a reconnect, not news
      playBinggBonus(b);
    }
    return shown;
  };
}
