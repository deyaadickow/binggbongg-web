// Referral Program (Steve, 2026-10-28) — ReferralProgramController. A referrer earns 5% of what each
// member they referred earns from battles, games and videos, paid by Bingg Bongg, up to $25 per
// referred member. The referral code is the member's username. Country pages carry the description
// in their language and the flyers; the member's code is drawn into each flyer's code box here.
import { post } from "./api";

export type CodeBox = { x: number; y: number; w: number; h: number; color?: string };
export type ReferralCountry = {
  country_code: string; name: string; flag: string; language: string; description: string;
  flyer_phone: string | null; flyer_letter: string | null; phone_code_box: CodeBox | null; letter_code_box: CodeBox | null;
};
export type ReferredMember = { user_id: number; name: string; username: string | null; image: string | null; bonus_paid: number; joined: string | null;
  /** Steve, 2026-10-29: $100 for a member brought in while VIP, else the normal cap. */
  bonus_cap?: number };
/** VIP Referral Members (Steve, 2026-10-29): anyone who applies is approved by the server about two
 *  hours later (always within 24), and then earns the same 5% up to vip_cap per new member. */
export type VipStatus = "none" | "pending" | "approved" | "revoked";
export type VipInfo = { status: VipStatus; is_vip: boolean; platforms: string | null; applied_at: string | null; approved_at: string | null };
export type ReferralProgram = {
  enabled: boolean; percent: number; cap: number; code_days: number; big_flyer_url: string; countries: ReferralCountry[];
  vip_enabled?: boolean; vip_cap?: number;
  me: null | { vip?: VipInfo; code: string; country: string; referred_count: number; bonus_earned: number; bonus_possible: number;
    referred: ReferredMember[]; referred_by: null | { user_id: number; name: string; username: string | null }; can_enter_code: boolean };
};

export async function fetchReferralProgram(userId: number | null): Promise<ReferralProgram | null> {
  const res = userId
    ? await post<ReferralProgram>("fetchMyReferralProgram", { user_id: userId })
    : await post<ReferralProgram>("fetchReferralProgram", { lang: "en" });
  return res.status && res.data ? res.data : null;
}

export async function enterReferralCode(userId: number, code: string) {
  const res = await post<ReferralProgram>("enterReferralCode", { user_id: userId, code });
  return { ok: !!res.status, message: res.message ?? null, program: res.status ? res.data ?? null : null };
}

/** Apply to be a VIP Referral Member. The server binds user_id to the caller; `agree` is the
 *  no-spam / no-income-promises / say-#ad checkbox, which the page will not send unticked. */
export async function applyVipReferrer(userId: number, platforms: string[]) {
  try {
    const res = await post<ReferralProgram>("applyVipReferrer", { user_id: userId, agree: 1, platforms: platforms.join(", ") });
    return { ok: !!res.status, message: res.message ?? null, program: res.status ? res.data ?? null : null };
  } catch {
    return { ok: false, message: null, program: null };
  }
}

/** is_vip_referrer arrives as 0/1, "0"/"1" or a boolean depending on the payload — read them all. */
export function isVipReferrer(v: unknown): boolean {
  return v === true || v === 1 || v === "1" || v === "true";
}

/** The flyer with `code` written into its code box, as a PNG blob — or null if it can't be drawn. */
export async function flyerWithCode(url: string, box: CodeBox | null, code: string | null): Promise<Blob | null> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = url;
  try { await image.decode(); } catch { return null; }
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0);
  if (box && code) {
    let size = Math.round(box.h * 0.55);
    const font = (s: number) => `900 ${s}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    ctx.font = font(size);
    while (ctx.measureText(code).width > box.w * 0.9 && size > 10) { size -= 2; ctx.font = font(size); }
    ctx.fillStyle = box.color || "#111111";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(code, box.x + box.w / 2, box.y + box.h / 2 + size * 0.04);
  }
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}
