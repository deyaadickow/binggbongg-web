// Bingg Bongg Partnership Program (Steve, 2026-11-27: "I wanna bring about 100 people to go live and battle on
// Bingg Bongg the only requirement is they will have to bring at least 1 to 3 members to battle with them.").
//
// Client side of the backend contract (~/bb-wt/partners/partnership-contract.md, backend branch `partnership`).
// All four routes are POST, checkHeader + authorizeUser; my_user_id is ALWAYS the signed-in member (the server
// rebinds it). Never send user_id: another member is named by `username` (add) or `member_user_id` (remove).
//
// Money copy: the % and the days come only from the server (payout_percent / default_days). Never hard-code
// them, never show $ amounts or the normal rate. Dates are plain America/Detroit calendar days, shown as dates,
// never converted to the browser's timezone.
import { useEffect, useState } from "react";
import { post } from "./api";
import { translate, type Lang, type StringKey } from "./i18n";

export type PartnerStatus = "none" | "pending" | "approved" | "declined" | "member";
export type PartnerPhase = "upcoming" | "active" | "ended";
export type PartnerPlatform = "tiktok" | "instagram" | "snapchat" | "youtube" | "facebook";

/** The five form rows, in the contract's order. Brand names, never translated. */
export const PARTNER_PLATFORMS: { key: PartnerPlatform; label: string; host: string }[] = [
  { key: "tiktok", label: "TikTok", host: "tiktok.com/@" },
  { key: "instagram", label: "Instagram", host: "instagram.com/" },
  { key: "snapchat", label: "Snapchat", host: "snapchat.com/add/" },
  { key: "youtube", label: "YouTube", host: "youtube.com/@" },
  { key: "facebook", label: "Facebook", host: "facebook.com/" },
];

export interface PartnerPerson {
  user_id: number; username?: string; fullname?: string; profile_image?: string | null;
  start_date?: string | null; end_date?: string | null; days_left?: number | null; phase?: PartnerPhase | null;
}
export interface PartnerApplication {
  id: number; status: "pending" | "approved" | "declined";
  accounts: { platform: PartnerPlatform; label: string; url: string; followers: number }[];
  note?: string | null; created_at?: string; reviewed_at?: string | null;
  full_name?: string | null; email?: string | null; phone_number?: string | null;
  country?: string | null; city?: string | null; date_of_birth?: string | null;
}
/** Who the applicant is (Steve, 2026-11-27: "how are we going to know who they are?"). The exact
 *  applyPartnerProgram params; fetchMyPartnership's data.prefill has the same keys, any of them null. */
export const PARTNER_IDENTITY = ["full_name", "email", "phone_number", "country", "city", "date_of_birth"] as const;
export type PartnerIdentityField = (typeof PARTNER_IDENTITY)[number];
export type PartnerPrefill = Partial<Record<PartnerIdentityField, string | null>>;
export interface MyPartnership {
  program_enabled: boolean;
  status: PartnerStatus;
  role: "partner" | "member" | null;
  phase: PartnerPhase | null;
  start_date: string | null;
  end_date: string | null;
  days_left: number | null;
  is_bb_partner: boolean;
  timezone?: string;
  payout_percent: number;
  min_followers: number;
  default_days: number;
  max_people: number;
  can_apply: boolean;
  application: PartnerApplication | null;
  partner: { user_id: number; username?: string; fullname?: string; profile_image?: string | null } | null;
  people: PartnerPerson[];
  can_add_people: boolean;
  prefill: PartnerPrefill;
  copy?: Record<string, string>;
}
export type PartnerFailure = { status: false; code?: string; message?: string; platform?: PartnerPlatform; field?: string; min_followers?: number };
export type ApplyResult = { status: true; message?: string; application?: PartnerApplication } | PartnerFailure;
export type PeopleResult = { status: true; message?: string; data?: MyPartnership } | PartnerFailure;

/** Missing/odd shapes read as "off": an older server answers without the route at all. */
function normalise(d: Partial<MyPartnership> | undefined | null): MyPartnership | null {
  if (!d || typeof d !== "object") return null;
  return {
    program_enabled: d.program_enabled === true,
    status: (d.status ?? "none") as PartnerStatus,
    role: d.role ?? null,
    phase: d.phase ?? null,
    start_date: d.start_date ?? null,
    end_date: d.end_date ?? null,
    days_left: typeof d.days_left === "number" ? d.days_left : null,
    is_bb_partner: d.is_bb_partner === true,
    timezone: d.timezone,
    payout_percent: Number(d.payout_percent ?? 0),
    min_followers: Number(d.min_followers ?? 0),
    default_days: Number(d.default_days ?? 0),
    max_people: Number(d.max_people ?? 3),
    can_apply: d.can_apply === true,
    application: d.application ?? null,
    partner: d.partner ?? null,
    people: Array.isArray(d.people) ? d.people : [],
    can_add_people: d.can_add_people === true,
    prefill: d.prefill && typeof d.prefill === "object" ? d.prefill : {},
    copy: d.copy,
  };
}

export async function fetchMyPartnership(myUserId: number): Promise<MyPartnership | null> {
  const r = await post<MyPartnership>("fetchMyPartnership", { my_user_id: myUserId });
  if (!r.status) return null;
  return normalise(r.data);
}

export async function applyPartnerProgram(myUserId: number, fields: Record<string, string>): Promise<ApplyResult> {
  const r = await post<unknown>("applyPartnerProgram", { ...fields, my_user_id: myUserId });
  return r as unknown as ApplyResult;
}

export async function addPartnerMember(myUserId: number, username: string): Promise<PeopleResult> {
  const r = await post<MyPartnership>("addPartnerMember", { my_user_id: myUserId, username: username.trim().replace(/^@+/, "") });
  return (r.status ? { ...r, data: normalise(r.data) ?? undefined } : r) as unknown as PeopleResult;
}

export async function removePartnerMember(myUserId: number, memberUserId: number): Promise<PeopleResult> {
  const r = await post<MyPartnership>("removePartnerMember", { my_user_id: myUserId, member_user_id: memberUserId });
  return (r.status ? { ...r, data: normalise(r.data) ?? undefined } : r) as unknown as PeopleResult;
}

// ---- the program switch, for the entry points ------------------------------------------------------------

let cached: { uid: number; p: Promise<MyPartnership | null> } | null = null;
/** fetchMyPartnership once per page load per member; a failure is "off" and is retried next time. */
export function myPartnershipOnce(myUserId: number): Promise<MyPartnership | null> {
  if (cached && cached.uid === myUserId) return cached.p;
  const p = fetchMyPartnership(myUserId).catch(() => { if (cached?.p === p) cached = null; return null; });
  cached = { uid: myUserId, p };
  return p;
}
/** After an apply / add / remove the cached answer is stale. */
export function forgetMyPartnership() { cached = null; }

/** null until the server answers — the entry points never flash in and out. Keyed on the id, never the user
 *  object (binggbongg-web-session-user-identity-trap). */
export function useMyPartnership(myUserId: number | null | undefined): MyPartnership | null {
  const [d, setD] = useState<MyPartnership | null>(null);
  useEffect(() => {
    if (!myUserId) { setD(null); return; }
    let live = true;
    myPartnershipOnce(myUserId).then((v) => { if (live) setD(v); });
    return () => { live = false; };
  }, [myUserId]);
  return d;
}

/** Show an entry point: the switch is on, or the member is already in the program (they keep their page). */
export function partnerEntryVisible(d: MyPartnership | null): boolean {
  return !!d && d.program_enabled;
}

/** `is_bb_partner` off a profile payload. Older servers don't send it: missing is false. */
export function isBbPartner(v: unknown): boolean {
  return v === true || v === 1 || v === "1" || v === "true";
}

// ---- dates and copy --------------------------------------------------------------------------------------

const LOCALE: Record<string, string> = { fil: "fil-PH", tl: "fil-PH", id: "id-ID", es: "es", ar: "ar", en: "en-US" };

/** "2026-12-05" -> "Dec 5, 2026" in the page language. Built at UTC midnight and formatted in UTC, so the
 *  calendar day the server sent is the day shown, whatever the browser's timezone. */
export function partnerDate(ymd: string | null | undefined, lang: Lang): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd ?? "");
  if (!m) return ymd ?? "";
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  try {
    return new Intl.DateTimeFormat(LOCALE[lang] ?? lang, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(ms);
  } catch {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(ms);
  }
}

/** 100000 -> "100,000" in the page language. */
export function partnerNumber(n: number, lang: Lang): string {
  try { return new Intl.NumberFormat(LOCALE[lang] ?? lang).format(n); } catch { return String(n); }
}

/** "150,000", "150.000", "150k", "1.2M" -> digits (the server accepts these too; digits are what we send).
 *  Anything else is passed through unchanged so the server's bad_followers answer names the row. */
export function parseFollowers(raw: string): string {
  const s = raw.trim().replace(/\s+/g, "");
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return s.replace(/[.,]/g, "");
  const m = /^(\d+(?:[.,]\d+)?)([kKmM])?$/.exec(s);
  if (!m) return raw.trim();
  const n = parseFloat(m[1].replace(",", ".")) * (m[2] ? (m[2].toLowerCase() === "k" ? 1_000 : 1_000_000) : 1);
  return String(Math.round(n));
}

/** The localised status line for the My Partnership page, numbers and dates from the server. */
export function partnerStatusLine(d: MyPartnership, lang: Lang): string {
  const t = (k: StringKey, ...a: (string | number)[]) => translate(lang, k, ...a);
  const pct = d.payout_percent;
  const start = partnerDate(d.start_date, lang);
  const end = partnerDate(d.end_date, lang);
  if (d.phase === "ended") return t("pt_status_ended", end);
  if (d.phase === "upcoming") return t("pt_status_upcoming", pct, start);
  if (d.status === "approved") return t("pt_status_approved", pct, start, end);
  if (d.status === "member") return t("pt_status_member", d.partner?.username ?? "", pct, start, end);
  // The server's own words after Submit (2026-11-27): the team reviews it, then approves.
  if (d.status === "pending") return t("pt_sent");
  if (d.status === "declined") return t("pt_status_declined");
  return "";
}

/** "12 days left" / "Last day today" (days_left is 0 on the last day). */
export function partnerDaysLeft(daysLeft: number | null | undefined, phase: PartnerPhase | null | undefined, lang: Lang): string {
  if (phase !== "active" || daysLeft == null) return "";
  return daysLeft <= 0 ? translate(lang, "pt_last_day") : translate(lang, daysLeft === 1 ? "pt_day_left" : "pt_days_left", daysLeft);
}

/** The localised error for an apply / add / remove failure; the server's English message when we have no key. */
export function partnerError(f: PartnerFailure, d: MyPartnership | null, lang: Lang): string {
  const t = (k: StringKey, ...a: (string | number)[]) => translate(lang, k, ...a);
  const label = PARTNER_PLATFORMS.find((p) => p.key === f.platform)?.label ?? "";
  const min = partnerNumber(Number(f.min_followers ?? d?.min_followers ?? 0), lang);
  switch (f.code) {
    case "not_enabled": return t("pt_program_off");
    case "already_partner": return t("pt_err_already_partner");
    case "already_member": return t("pt_err_already_member");
    case "pending": return t("pt_status_pending");
    case "bad_link": return t("pt_err_bad_link", label);
    case "missing_link": return t("pt_err_missing_link", label);
    case "bad_followers": return t("pt_err_bad_followers", label);
    case "not_enough_followers": return t("pt_err_not_enough", min);
    case "not_partner": return t("pt_err_not_partner");
    case "ended": return t("pt_err_ended");
    case "full": return t("pt_people_full", d?.max_people ?? 3);
    case "not_found": return t("pt_err_not_found");
    case "self": return t("pt_err_self");
    case "blocked": return t("pt_err_blocked");
    case "in_program": return t("pt_err_in_program");
    case "missing_name": return t("pt_err_missing_name");
    case "bad_email": return t("pt_err_bad_email");
    case "bad_phone": return t("pt_err_bad_phone");
    case "missing_country": return t("pt_err_missing_country");
    case "bad_birthdate": return t("pt_err_bad_birthdate");
    case "too_young": return t("pt_err_too_young");
    default: return f.message || t("try_again");
  }
}

// ---- the one-time card after sign-up ---------------------------------------------------------------------

const CARD = "bb.partnerCard.";
/** Only shortly after the sign-up: a member who joined while the program was off isn't shown it months later. */
const CARD_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** LoginPage calls this on a brand-new registration; the card shows once, while the program is on. */
export function rememberPartnerCard(uid: number) {
  try { if (!localStorage.getItem(CARD + uid)) localStorage.setItem(CARD + uid, `due:${Date.now()}`); } catch { /* private mode */ }
}
export function partnerCardDue(uid: number): boolean {
  try {
    const v = localStorage.getItem(CARD + uid) ?? "";
    const at = Number(v.startsWith("due:") ? v.slice(4) : NaN);
    return Number.isFinite(at) && Date.now() - at < CARD_WINDOW_MS;
  } catch { return false; }
}
export function partnerCardSeen(uid: number) {
  try { localStorage.setItem(CARD + uid, "seen"); } catch { /* private mode */ }
}
