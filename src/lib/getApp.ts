// Getting people from the website into the app (Steve, 2026-11-01: "we need installs ... from the
// ad to either google play or the app store, and not to the website").
//
// 4,200 ad clicks brought no sign-ups. Nearly every visitor was on an Android phone inside
// Facebook's own browser, where Google refuses its sign-in ("disallowed_useragent") — and Google
// is the website's only way in. So on a phone the website's job is to hand people to the store.
// Store taps go through admin.binggbongg.com/go/... so the admin dashboard counts them
// (AdLinkController), with the ad they came from.

const GO = "https://admin.binggbongg.com/go/";
const SRC_KEY = "bb.adSrc";

export type PhoneOs = "android" | "ios";

export function phoneOs(): PhoneOs | null {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  // iPadOS reports itself as a Mac; a Mac with a touch screen is an iPad.
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return "ios";
  if (/Android/i.test(ua)) return "android";
  return null;
}

/** The browser built into Facebook, Messenger, Instagram, TikTok or another app (Google sign-in
 *  does not work there: "disallowed_useragent").
 *  TikTok (Steve, 2026-11-23: "TikTok signup still not working"): TikTok's own browser was not on
 *  this list, so the sign-up page showed it the Google button Google refuses there, and no way to
 *  the app or to Chrome. TikTok says musical_ly / trill_ / BytedanceWebview / ByteLocale in its
 *  user agent. Any Android WebView ("; wv)") is refused by Google too, so it counts as well. */
export function inAppBrowser(): boolean {
  const ua = navigator.userAgent || "";
  return /FBAN|FBAV|FB_IAB|FBIOS|FB4A|Messenger|Instagram/i.test(ua)
    || /musical_ly|trill_|BytedanceWebview|ByteLocale|TikTok/i.test(ua)
    || /Snapchat|Line\/|Twitter|LinkedInApp/i.test(ua)
    || /; wv\)/.test(ua);
}

/** The ad network behind a click id in the link (Facebook adds fbclid, TikTok adds ttclid). */
export function clickIdSource(q: URLSearchParams): string {
  if (q.get("fbclid")) return "facebook";
  if (q.get("ttclid")) return "tiktok";
  return "";
}

/** Remember which ad brought this visit, for the store links later in the visit. */
export function rememberAdSource(src: string) {
  try { if (src) sessionStorage.setItem(SRC_KEY, src); } catch { /* private mode */ }
}

/** The ad behind this visit. The link itself is read too: the bar draws before the visit's
 *  first effect has stored it. */
function adSource(): string {
  try {
    const stored = sessionStorage.getItem(SRC_KEY);
    if (stored) return stored;
  } catch { /* private mode */ }
  try {
    const q = new URLSearchParams(window.location.search);
    const src = (q.get("src") || q.get("utm_campaign") || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 60);
    return src || clickIdSource(q) || "web";
  } catch { return "web"; }
}

/** The right store for this phone, counted on the way. `from` says which button it was. */
export function storeUrl(from: string, os: PhoneOs | null = phoneOs()): string {
  const target = os === "ios" ? "appstore" : os === "android" ? "play" : "app";
  return `${GO}${target}?from=${encodeURIComponent(from)}&src=${encodeURIComponent(adSource())}`;
}

/** Android only: the same page, opened in Chrome instead of Facebook's browser. */
export function chromeUrl(): string {
  const here = window.location.href;
  const path = here.replace(/^https?:\/\//, "");
  return `intent://${path}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(here)};end`;
}
