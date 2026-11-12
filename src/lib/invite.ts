// Invite / Referral link (Steve, 2026-11-12): "a special link where every one of our members can send to any of
// their friends or followers, to any platform, sms or email. This link will have our video ad in their language
// with this member's referral code on it ... a copy symbol so they can just copy their referral code. And a smart
// link that knows if it's an iPhone it will link them to our app on the Apple store, if it's Android to Google Play."
//
//   https://www.binggbongg.com/invite/<username>   — InvitePage (signed out is fine)
//   POST fetchInvite { code, language } — checkHeader
//     -> { member{username, full_name, profile}, referral_code, invite_url, video{...}|null, smart_url, play_url, app_store_url }
//
// The code is remembered on this browser so the web sign-up can fill it in (Google Play gets it as the install
// referrer for Android; on iPhone the member's friend pastes it after the Copy button).
import { post } from "./api";

export const INVITE_BASE = "https://www.binggbongg.com/invite/";

export interface Invite {
  member: { username: string; full_name: string; profile: string | null };
  referral_code: string;
  invite_url: string;
  video: { id: number; language: string; video_url: string; poster_url: string | null; ends_with_code_line: boolean } | null;
  smart_url: string;
  play_url: string;
  app_store_url: string;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Usernames are letters, digits, dot and underscore (the server drops anything else the same way). */
export function cleanCode(code: string | null | undefined): string {
  return (code ?? "").trim().replace(/^@+/, "").replace(/[^A-Za-z0-9._]/g, "").slice(0, 40);
}

export function inviteUrlFor(username: string | null | undefined): string | null {
  const c = cleanCode(username);
  return c ? INVITE_BASE + encodeURIComponent(c) : null;
}

export async function fetchInvite(code: string, language: string): Promise<Invite | null> {
  const res = await post<unknown>("fetchInvite", { code: cleanCode(code), language });
  if (!res.status || !res.data || typeof res.data !== "object") return null;
  const o = res.data as Record<string, unknown>;
  const m = (o.member ?? {}) as Record<string, unknown>;
  const v = o.video as Record<string, unknown> | null | undefined;
  const code2 = str(o.referral_code);
  if (!code2) return null;
  return {
    member: { username: str(m.username) ?? code2, full_name: str(m.full_name) ?? "", profile: str(m.profile) },
    referral_code: code2,
    invite_url: str(o.invite_url) ?? INVITE_BASE + encodeURIComponent(code2),
    video: v && str(v.video_url) ? {
      id: Number(v.id) || 0, language: str(v.language) ?? "en", video_url: str(v.video_url)!, poster_url: str(v.poster_url),
      ends_with_code_line: v.ends_with_code_line === true,
    } : null,
    smart_url: str(o.smart_url) ?? "",
    play_url: str(o.play_url) ?? "",
    app_store_url: str(o.app_store_url) ?? "",
  };
}

const KEY = "bb_invite_code";

/** The code of the member whose invite page this browser opened (for the web sign-up form). */
export function rememberInviteCode(code: string) {
  const c = cleanCode(code);
  try { if (c) localStorage.setItem(KEY, c); } catch { /* private mode */ }
}

export function rememberedInviteCode(): string {
  try { return cleanCode(localStorage.getItem(KEY)); } catch { return ""; }
}

export function forgetInviteCode() {
  try { localStorage.removeItem(KEY); } catch { /* private mode */ }
}

/** Copies text; true when it worked. Falls back to a hidden textarea for old in-app browsers. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** The phone's own share sheet (SMS, email, Messenger, WhatsApp ...) or, without one, the clipboard. */
export async function shareInvite(url: string, text: string): Promise<"shared" | "copied" | "failed" | "cancelled"> {
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (typeof nav.share === "function") {
    try {
      await nav.share({ text, url });
      return "shared";
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return "cancelled";
    }
  }
  return (await copyText(`${text} ${url}`)) ? "copied" : "failed";
}
