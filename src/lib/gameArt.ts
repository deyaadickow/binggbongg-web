// Photoreal game art (Steve, 2026-11-02: "i want you to make all the games's images realistic and
// design it to look great, and remove the cartoon looking once we have now").
//
// Every picture comes from ONE manifest JSON on the CDN, so a later swap needs no deploy: a new
// file name is uploaded and the manifest repointed (URLs are never reused, so the browser cache
// is safe). The phones read the same manifest.
//
// The fallback rule, always: until the manifest has loaded, when a key is missing, or when the
// image fails to load, the caller draws exactly what it drew before (the emoji, the gradient,
// the decor). Nothing here ever blocks a render.
import { useEffect, useState, useSyncExternalStore } from "react";

export const GAME_ART_MANIFEST_URL = "https://d32kgcvh9dqf5h.cloudfront.net/uploads/game_art/manifest.json";

export interface GameArt {
  /** Game-show scene key (gameSceneData.ts) -> photo. */
  scenes: Record<string, string>;
  /** Battle-mode key (battleModes.ts `art`) -> icon. */
  battle_icons: Record<string, string>;
  /** Features-directory tile key (name key without "fname_") -> icon. */
  feature_icons: Record<string, string>;
}

const EMPTY: GameArt = { scenes: {}, battle_icons: {}, feature_icons: {} };

/** In development only, `?gameart=<url>` points the manifest at a local test server (and an
 *  unreachable URL shows the fallback). Production always reads the CDN. */
function manifestUrl(): string {
  if (import.meta.env.DEV && typeof window !== "undefined") {
    try {
      const override = new URLSearchParams(window.location.search).get("gameart");
      if (override) return override;
    } catch { /* fall through */ }
  }
  return GAME_ART_MANIFEST_URL;
}

/** Only absolute http(s) URLs survive; unknown keys and fields are simply carried or ignored. */
function urlMap(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [k, u] of Object.entries(v as Record<string, unknown>)) {
    if (typeof u === "string" && /^https?:\/\//i.test(u)) out[k] = u;
  }
  return out;
}

let art: GameArt = EMPTY;
let started = false;
const listeners = new Set<() => void>();

function load() {
  if (started || typeof window === "undefined") return;
  started = true;
  fetch(manifestUrl(), { credentials: "omit" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((j: Record<string, unknown>) => {
      art = { scenes: urlMap(j?.scenes), battle_icons: urlMap(j?.battle_icons), feature_icons: urlMap(j?.feature_icons) };
      listeners.forEach((l) => l());
    })
    // No manifest is not an error a member should see: everything keeps its drawn look.
    .catch(() => undefined);
}

function subscribe(l: () => void) {
  listeners.add(l);
  load();
  return () => { listeners.delete(l); };
}

/** The manifest, empty until it arrives. Fetched once per page load, in the background. */
export function useGameArt(): GameArt {
  return useSyncExternalStore(subscribe, () => art, () => EMPTY);
}

// Image readiness, shared across components so a remount (a new round, the next page) shows a
// photo that already loaded at once instead of flashing the drawing again.
const ready = new Set<string>();
const failed = new Set<string>();
const pending = new Map<string, Promise<boolean>>();

function preload(url: string): Promise<boolean> {
  let p = pending.get(url);
  if (!p) {
    p = new Promise<boolean>((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => { ready.add(url); resolve(true); };
      img.onerror = () => { failed.add(url); resolve(false); };
      img.src = url;
    });
    pending.set(url, p);
  }
  return p;
}

/** `url` once that image has actually loaded, otherwise null — so a caller shows its drawing
 *  while the photo loads and keeps the drawing for good if it fails. */
export function useLoadedImage(url: string | null | undefined): string | null {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!url || ready.has(url) || failed.has(url)) return;
    let live = true;
    preload(url).then(() => { if (live) bump((n) => n + 1); });
    return () => { live = false; };
  }, [url]);
  return url && ready.has(url) ? url : null;
}

/** The loaded photo for a scene / battle icon / feature tile, or null to draw the old look. */
export function useSceneArt(key: string | null | undefined): string | null {
  const a = useGameArt();
  return useLoadedImage(key ? a.scenes[key] : null);
}
export function useBattleIcon(key: string | null | undefined): string | null {
  const a = useGameArt();
  return useLoadedImage(key ? a.battle_icons[key] : null);
}
export function useFeatureIcon(key: string | null | undefined): string | null {
  const a = useGameArt();
  return useLoadedImage(key ? a.feature_icons[key] : null);
}
