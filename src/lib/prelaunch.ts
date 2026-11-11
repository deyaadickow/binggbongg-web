// Pre-Launch Special (Steve, 2026-11-10): "Every member will receive 10,000 PBBs with unlimited top
// ups so they can Play games, Battle and give gifts to anyone. Every score will count with PBBs but
// no money will go into any wallet." / "Yes everything will be zero at launch day."
//
// Changed 2026-11-11 (Steve: "Forget about the unlimited FBBs until November 29th. We will give
// everyone 1000 FBBs from day one, and every new member."), then the same day "1000 free BBs is
// too much, make it 100 Free BBs": every member has exactly 100 FBBs, they do NOT refill and are
// NOT wiped any more; new members in every country get 100 once.
// Launch is still Tuesday, December 1, when every score starts from zero. The referral bonus is
// 5% of what each friend earns, until $100 (was $25). fetchPrelaunch says refills: false,
// fbbs_expire: false, new_member_fbbs, referral_bonus_cap and referral_bonus_percent.
//
// The server decides everything (backend fetchPrelaunch, checkHeader only, so guests see it too):
// whether a window is active, its dates (UTC) and amounts. The web shows the banner only while
// `active` is true. The page itself always renders — with the server's numbers when it answers,
// with the owner-approved defaults (below) when the endpoint is not deployed yet.
import { useEffect, useState } from "react";
import { post } from "./api";

export interface Prelaunch {
  active: boolean;
  startsAt: number | null;
  endsAt: number;
  launchAt: number;
  grantAmount: number;
  refillBelow: number;
  newMemberPbbs: number;
  referralBonusCap: number;
  /** 2026-11-11: false — FBBs no longer refill. */
  refills: boolean;
  /** 2026-11-11: false — FBBs are no longer wiped at the end of the window or at launch. */
  fbbsExpire: boolean;
  referralBonusPercent: number;
}

/** The spec's one seeded window: ends 2026-11-29 16:00 UTC (= midnight ending Nov 29, Philippine
 *  time), launch 2026-11-30 16:00 UTC (= 00:00 Tuesday, December 1 in the Philippines). */
export const PRELAUNCH_DEFAULTS: Prelaunch = {
  active: false,
  startsAt: null,
  endsAt: Date.parse("2026-11-29T16:00:00Z"),
  launchAt: Date.parse("2026-11-30T16:00:00Z"),
  grantAmount: 100,
  refillBelow: 0,
  newMemberPbbs: 100,
  referralBonusCap: 100,
  refills: false,
  fbbsExpire: false,
  referralBonusPercent: 5,
};

/** The server's datetimes are UTC; Laravel may send "2026-11-29 16:00:00" with no zone. */
function utc(v: unknown): number | null {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s.replace(" ", "T") : s.replace(" ", "T") + "Z";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}
const num = (v: unknown, d: number) => {
  const n = Number(v);
  return v != null && v !== "" && Number.isFinite(n) ? n : d;
};

const truthy = (v: unknown) => v === true || v === 1 || v === "1" || v === "true";

function parse(d: unknown): Prelaunch {
  const o = (d && typeof d === "object" ? d : {}) as Record<string, unknown>;
  const D = PRELAUNCH_DEFAULTS;
  // A server from before 2026-11-11 sends no `refills` field and still says grant 10000 / cap 25.
  // Its amounts would contradict the new copy ("100 FBBs, no refill", "until $100"), so they
  // are ignored until the new backend answers; its dates and `active` are still used.
  const oldServer = o.refills === undefined;
  return {
    active: truthy(o.active),
    startsAt: utc(o.starts_at),
    endsAt: utc(o.ends_at) ?? D.endsAt,
    launchAt: utc(o.launch_at) ?? D.launchAt,
    grantAmount: oldServer ? D.grantAmount : num(o.grant_amount, D.grantAmount),
    refillBelow: oldServer ? D.refillBelow : num(o.refill_below, D.refillBelow),
    newMemberPbbs: oldServer ? D.newMemberPbbs : num(o.new_member_fbbs ?? o.new_member_pbbs, D.newMemberPbbs),
    referralBonusCap: oldServer ? D.referralBonusCap : num(o.referral_bonus_cap, D.referralBonusCap),
    refills: o.refills === undefined ? D.refills : truthy(o.refills),
    fbbsExpire: o.fbbs_expire === undefined ? D.fbbsExpire : truthy(o.fbbs_expire),
    referralBonusPercent: num(o.referral_bonus_percent, D.referralBonusPercent),
  };
}

let cached: Prelaunch | null = null;
let inflight: Promise<Prelaunch> | null = null;

/** Throws on any failure (endpoint missing, offline, status false); a failure is never cached. */
export function fetchPrelaunch(): Promise<Prelaunch> {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;
  // A dummy field: the host's WAF refuses a POST with an empty body (binggbongg-empty-body-waf-fix).
  inflight = post<unknown>("fetchPrelaunch", { platform: "web" })
    .then((r) => {
      if (!r.status) throw new Error(r.message ?? "fetchPrelaunch failed");
      // The fields may sit at the top level or under data.
      const src = r.data && typeof r.data === "object" ? r.data : r;
      cached = parse(src);
      return cached;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

/** undefined while loading, null when the server could not say. */
export function usePrelaunch(): Prelaunch | null | undefined {
  const [p, setP] = useState<Prelaunch | null | undefined>(cached ?? undefined);
  useEffect(() => {
    let live = true;
    fetchPrelaunch().then((v) => { if (live) setP(v); }).catch(() => { if (live) setP(null); });
    return () => { live = false; };
  }, []);
  return p;
}

/** Dates are shown in Philippine time — the launch market ("Tuesday, December 1"). ends_at is the
 *  midnight that ENDS the last day, so the last day is the second before it (no longer shown since
 *  2026-11-11: FBBs have no end date). */
const ZONE = "Asia/Manila";

function fmt(lang: string, t: number, opts: Intl.DateTimeFormatOptions): string {
  const loc = lang === "tl" ? "fil" : lang;
  try { return new Intl.DateTimeFormat(loc, { ...opts, timeZone: ZONE }).format(t); }
  catch { return new Intl.DateTimeFormat("en", { ...opts, timeZone: ZONE }).format(t); }
}

export function prelaunchTexts(p: Prelaunch, lang: string) {
  const loc = lang === "tl" ? "fil" : lang;
  const n = (v: number) => { try { return v.toLocaleString(loc); } catch { return v.toLocaleString("en"); } };
  return {
    amount: n(p.grantAmount),
    newMember: n(p.newMemberPbbs),
    percent: String(p.referralBonusPercent),
    until: fmt(lang, p.endsAt - 1000, { month: "short", day: "numeric" }),
    launchDay: fmt(lang, p.launchAt, { weekday: "long", month: "long", day: "numeric" }),
    cap: String(p.referralBonusCap),
  };
}
