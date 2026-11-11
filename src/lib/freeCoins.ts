// Free Coins page (Steve, 2026-11-10): "These are free coins to give away / New signup ——— 5 Coins
// / Upload a video ——— 1 Coin / Upload a photo ——— 1 Coin / Follow any member ——— 1 Coin / Refer a
// new member ——— 1 Coin / This is money you earn / Go live and battle anyone as a host & earn extra
// —— 5% Bonus / Share & Earn ——— 10% Bonus".
//
// The server decides every number (backend fetchFreeCoins, checkHeader only, so guests see it too;
// it returns no member's data). The web only lists what it is told: a row whose coins/percent is 0,
// or whose key this build does not know, is left out. A failure is a failure (the page shows Retry)
// and never a crash; an EMPTY answer hides the directory tile and the Wallet row.
import { useEffect, useState } from "react";
import { post } from "./api";

export type GiveKey = "signup" | "video_upload" | "photo_upload" | "follow" | "referral";
export type EarnKey = "battle_host_bonus" | "share_earn";

export interface GiveRow { key: GiveKey; coins: number; perDay: number | null }
export interface EarnRow { key: EarnKey; percent: number }
export interface FreeCoins { give: GiveRow[]; earn: EarnRow[] }

const GIVE_KEYS: GiveKey[] = ["signup", "video_upload", "photo_upload", "follow", "referral"];
const EARN_KEYS: EarnKey[] = ["battle_host_bonus", "share_earn"];

const int = (v: unknown): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : 0;
};

function parse(d: unknown): FreeCoins {
  const o = (d && typeof d === "object" ? d : {}) as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v : []).filter((x) => x && typeof x === "object") as Record<string, unknown>[];
  // Sign-up Bonus BBs are switched off (Steve, 2026-11-11: the only sign-up gift is 100 FBBs),
  // so a "signup" row is never listed as BBs even if the server still sends one: the page shows
  // the FBBs a new member gets instead.
  const give = list(o.give)
    .filter((r) => r.key !== "signup" && GIVE_KEYS.includes(r.key as GiveKey) && int(r.coins) > 0)
    .map((r) => ({ key: r.key as GiveKey, coins: int(r.coins), perDay: int(r.per_day) > 0 ? int(r.per_day) : null }));
  const earn = list(o.earn)
    .filter((r) => EARN_KEYS.includes(r.key as EarnKey) && int(r.percent) > 0 && r.enabled !== false && r.enabled !== 0)
    .map((r) => ({ key: r.key as EarnKey, percent: int(r.percent) }));
  return { give, earn };
}

/** The last good answer, so the tile, the Wallet row and the page share one request. A failure is
 *  never cached: Retry asks again. */
let cached: FreeCoins | null = null;
let inflight: Promise<FreeCoins> | null = null;

/** Throws on any failure (endpoint not deployed, offline, status false). */
export function fetchFreeCoins(force = false): Promise<FreeCoins> {
  if (cached && !force) return Promise.resolve(cached);
  if (inflight) return inflight;
  inflight = post<unknown>("fetchFreeCoins", {})
    .then((r) => {
      if (!r.status) throw new Error(r.message ?? "fetchFreeCoins failed");
      cached = parse(r.data);
      return cached;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

export const isEmpty = (f: FreeCoins) => f.give.length === 0 && f.earn.length === 0;

/** For the directory tile and the Wallet row: shown unless the server ANSWERED with nothing to
 *  list. Loading or failing still shows the entry; the page itself says "try again". */
export function useFreeCoinsListed(): boolean {
  const [listed, setListed] = useState(() => !cached || !isEmpty(cached));
  useEffect(() => {
    let live = true;
    fetchFreeCoins().then((f) => { if (live) setListed(!isEmpty(f)); }).catch(() => { /* keep showing */ });
    return () => { live = false; };
  }, []);
  return listed;
}
