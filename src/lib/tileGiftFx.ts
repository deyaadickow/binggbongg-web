// Gifts inside the tiles (Steve, 2026-11-23: "Steve gives eddie a 100 roses gift, it is only
// suppose to show on steve's screen because he gave the gift and also on eddie's screen because he
// is the receiver of the gift. it is not suppose to show on the entire phone screen.")
//
// In a room with two or more people on camera a gift plays inside the RECEIVER's tile and the
// GIVER's tile (when the giver is on camera) — never over the whole stage. Every tile on every
// grid mounts a <TileGiftLayer uid=…>; this module is the little bus between whoever learns of a
// gift (the giver's send, a `bb_gift_fx` / `cb_gift` data message, the Firestore gift line) and
// those layers. Same design as Android's TileGiftEffect, so the three platforms interoperate.
import type { Gift } from "./api";

/** The LiveKit data topic, byte for byte the phones' (Android LiveStreamManager.TOPIC_GIFT_FX). */
export const GIFT_FX_TOPIC = "bb_gift_fx";

export interface GiftFxMsg { from_user_id: number; to_user_id: number; gift_id: number }

export function parseGiftFx(payload: Uint8Array): GiftFxMsg | null {
  try {
    const j = JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>;
    const from = Number(j.from_user_id), to = Number(j.to_user_id), gift = Number(j.gift_id);
    if (!from || !to || !gift) return null;
    return { from_user_id: from, to_user_id: to, gift_id: gift };
  } catch { return null; }
}

export interface TileGiftPlay {
  key: string;
  gift: Gift;
  /** Only ONE copy of a gift video is heard per screen: the receiver's tile, or the giver's when
   *  the receiver is not on this screen. */
  audible: boolean;
  /** A gift from Bingg Bongg (the admin's free BBs, 2026-11-24 round 2): who it is from and how many
   *  BBs it brought, shown on the tile under the gift. */
  from?: { name: string; amount: number };
}

type Listener = (p: TileGiftPlay) => void;
const listeners = new Map<number, Set<Listener>>();
let seq = 0;

/** A tile's layer subscribing to the gifts for its member. */
export function subscribeTileGifts(uid: number, l: Listener): () => void {
  let set = listeners.get(uid);
  if (!set) { set = new Set(); listeners.set(uid, set); }
  set.add(l);
  return () => {
    const s = listeners.get(uid);
    if (!s) return;
    s.delete(l);
    if (s.size === 0) listeners.delete(uid);
  };
}

/** Is this member's tile on this screen right now? */
export function tileOnScreen(uid: number | null | undefined): boolean {
  return !!uid && (listeners.get(uid)?.size ?? 0) > 0;
}

// Recently played (to, gift) pairs, so the Firestore gift line (the backstop for givers on older
// apps that send no bb_gift_fx) never plays a gift a second time.
const RECENT_CAP = 60;
const recent: { to: number; giftId: number; at: number }[] = [];

function record(to: number, giftId: number) {
  recent.push({ to, giftId, at: Date.now() });
  if (recent.length > RECENT_CAP) recent.splice(0, recent.length - RECENT_CAP);
}

/** Was this gift to this member already played (or sent) here within ±windowMs of now? */
export function playedRecently(to: number, giftId: number, windowMs = 8000): boolean {
  const now = Date.now();
  return recent.some((r) => r.to === to && r.giftId === giftId && Math.abs(now - r.at) <= windowMs);
}

/** Play a gift in the receiver's tile and the giver's tile (whichever are on this screen), and
 *  remember it. `fromUid` null = the giver is unknown (the Firestore backstop): receiver only. */
export function playGiftInTiles(gift: Gift, toUid: number, fromUid: number | null) {
  record(toUid, Number(gift.id));
  const toOn = tileOnScreen(toUid);
  const emit = (uid: number, audible: boolean) => {
    const set = listeners.get(uid);
    if (!set) return;
    const play = { key: `g${++seq}`, gift, audible };
    set.forEach((l) => l(play));
  };
  if (toOn) emit(toUid, true);
  if (fromUid && fromUid !== toUid) emit(fromUid, !toOn);
}

/** The name the admin's free BBs come from on the tiles. */
export const FREE_GIFT_FROM = "Bingg Bongg";

/**
 * Steve, 2026-11-24 (round 2): "When admin gives gifts we need the gifts to show so everyone can see
 * and enjoy them with sound effect and all." A tile's free BBs went up by `amount`: play `gift` in
 * that tile, the same effect a real gift plays, labelled from Bingg Bongg with the amount. Not
 * recorded for the Firestore backstop (that is for real gifts only). `uid` may be a side's empty
 * box (freeSideUid). Returns whether a tile here showed it.
 */
export function playFreeGiftInTile(gift: Gift, uid: number, amount: number, audible: boolean): boolean {
  const set = listeners.get(uid);
  if (!set || set.size === 0) return false;
  const play: TileGiftPlay = { key: `f${++seq}`, gift, audible, from: { name: FREE_GIFT_FROM, amount } };
  set.forEach((l) => l(play));
  return true;
}

/** The empty Country VS Country side's box listens on this id (no member has a negative id). */
export const freeSideUid = (side: "a" | "b") => (side === "a" ? -1 : -2);

/** The gift to show for `amount` free BBs: the dearest one costing no more than the amount (with a
 *  picture or video to show), else the cheapest. */
export function giftForAmount(gifts: Gift[], amount: number): Gift | null {
  const price = (g: Gift) => Number(g.coin_price ?? g.votes ?? 0);
  const shown = gifts.filter((g) => (g.image || g.video) && price(g) > 0);
  if (!shown.length) return null;
  const fit = shown.filter((g) => price(g) <= amount).sort((a, b) => price(b) - price(a));
  return fit[0] ?? shown.slice().sort((a, b) => price(a) - price(b))[0];
}
