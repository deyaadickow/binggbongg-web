// "Pay with: FBBs | BBs" — one app-wide choice (Steve, 2026-11-10, BBs + FBBs spec).
//
// Every member gets 10,000 FBBs (free BBs) refilled automatically during the Pre-Launch Special,
// and the server spends FBBs FIRST. Without a choice, a member who bought BBs could never pay a
// streamer real money before launch — the FBBs never run out. So the member picks, once, and every
// API request carries `X-Pay-With: bb` while "BBs" is picked (Users::spendDeadCoinsFirst on the
// server reads it: bought BBs first, FBBs for any remainder). Anything else = today's order.
//
// Stored per browser (localStorage, wrapped: private windows throw), default FBBs. Kept outside
// React so lib/api.ts can read it synchronously on every request without importing React state.
import { useSyncExternalStore } from "react";

export type PayWith = "pbb" | "bb";
const KEY = "bb.payWith";

function read(): PayWith {
  try { return localStorage.getItem(KEY) === "bb" ? "bb" : "pbb"; } catch { return "pbb"; }
}

let current: PayWith = typeof window === "undefined" ? "pbb" : read();
const listeners = new Set<() => void>();

export function getPayWith(): PayWith { return current; }

export function setPayWith(v: PayWith) {
  current = v;
  try { localStorage.setItem(KEY, v); } catch { /* the choice still holds for this tab */ }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  // Another tab changed it: follow, so two tabs never pay two different ways.
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { current = read(); l(); } };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(l); window.removeEventListener("storage", onStorage); };
}

export function usePayWith(): [PayWith, (v: PayWith) => void] {
  const v = useSyncExternalStore(subscribe, getPayWith, () => "pbb" as PayWith);
  return [v, setPayWith];
}

/** The header every request to the Bingg Bongg API adds (lib/api.ts). Empty for FBBs. */
export function payWithHeaders(): Record<string, string> {
  return current === "bb" ? { "X-Pay-With": "bb" } : {};
}

export type PaidWith = "pbb" | "bb" | "mixed";

/** What a send-gift response says was actually spent: `paid_with` at the top or under `data`.
 *  null when the server does not say (not deployed yet) — then no label is shown at all. */
export function paidWithOf(res: unknown): PaidWith | null {
  if (!res || typeof res !== "object") return null;
  const r = res as Record<string, unknown>;
  const d = r.data && typeof r.data === "object" ? (r.data as Record<string, unknown>) : {};
  const v = String(r.paid_with ?? d.paid_with ?? "").toLowerCase();
  return v === "pbb" || v === "bb" || v === "mixed" ? v : null;
}

/** "FBBs gift" / "BBs gift" (mixed shows as a BBs gift — some real BBs went to the streamer). */
export function giftKindKey(p: PaidWith | null | undefined): "gift_pbbs" | "gift_bbs" | null {
  if (!p) return null;
  return p === "pbb" ? "gift_pbbs" : "gift_bbs";
}
