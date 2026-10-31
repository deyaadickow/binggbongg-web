// Meta Pixel (Steve, 2026-10-31, after 1,503 ad clicks brought no sign-ups: "Do 1 and 2 and 3").
// Lets Ads Manager see what people did after tapping an ad: every page view, the landing page, and
// a tap on a store button. Loaded once, from the browser, only when PIXEL_ID is set.
//
// Standard events only, so Ads Manager's own columns pick them up: PageView on every route,
// ViewContent on the landing page, Lead when a store button is tapped there.

export const PIXEL_ID = "";

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown };

declare global {
  interface Window { fbq?: Fbq; _fbq?: Fbq }
}

let started = false;

function ensure(): Fbq | null {
  if (!PIXEL_ID || typeof window === "undefined") return null;
  if (!started) {
    started = true;
    if (!window.fbq) {
      // Meta's own loader, written out: a queue until fbevents.js arrives and takes over.
      const q: Fbq = function (...args: unknown[]) {
        if (q.callMethod) q.callMethod(...args); else q.queue!.push(args);
      } as Fbq;
      q.queue = [];
      q.loaded = true;
      q.version = "2.0";
      q.push = q;
      window.fbq = q;
      window._fbq = q;
      const s = document.createElement("script");
      s.async = true;
      s.src = "https://connect.facebook.net/en_US/fbevents.js";
      document.head.appendChild(s);
    }
    window.fbq!("init", PIXEL_ID);
  }
  return window.fbq ?? null;
}

export function pixelPageView() {
  ensure()?.("track", "PageView");
}

export function pixelEvent(name: "ViewContent" | "Lead", params?: Record<string, unknown>) {
  ensure()?.("track", name, params ?? {});
}
