// Pre-Launch Special (Steve, 2026-11-10): "Every member will receive 10,000 PBBs with unlimited top
// ups so they can Play games, Battle and give gifts to anyone. Every score will count with PBBs but
// no money will go into any wallet." / "Yes everything will be zero at launch day."
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
}

/** The spec's one seeded window: ends 2026-11-29 16:00 UTC (= midnight ending Nov 29, Philippine
 *  time), launch 2026-11-30 16:00 UTC (= 00:00 Tuesday, December 1 in the Philippines). */
export const PRELAUNCH_DEFAULTS: Prelaunch = {
  active: false,
  startsAt: null,
  endsAt: Date.parse("2026-11-29T16:00:00Z"),
  launchAt: Date.parse("2026-11-30T16:00:00Z"),
  grantAmount: 10000,
  refillBelow: 100,
  newMemberPbbs: 1000,
  referralBonusCap: 25,
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

function parse(d: unknown): Prelaunch {
  const o = (d && typeof d === "object" ? d : {}) as Record<string, unknown>;
  const D = PRELAUNCH_DEFAULTS;
  return {
    active: o.active === true || o.active === 1 || o.active === "1" || o.active === "true",
    startsAt: utc(o.starts_at),
    endsAt: utc(o.ends_at) ?? D.endsAt,
    launchAt: utc(o.launch_at) ?? D.launchAt,
    grantAmount: num(o.grant_amount, D.grantAmount),
    refillBelow: num(o.refill_below, D.refillBelow),
    newMemberPbbs: num(o.new_member_pbbs, D.newMemberPbbs),
    referralBonusCap: num(o.referral_bonus_cap, D.referralBonusCap),
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

/** The window is shown in Philippine time — the launch market and the spec's dates ("until
 *  Nov 29", "Tuesday, December 1"). ends_at is the midnight that ENDS the last day, so the last
 *  day is the second before it. */
const ZONE = "Asia/Manila";

function fmt(lang: string, t: number, opts: Intl.DateTimeFormatOptions): string {
  const loc = lang === "tl" ? "fil" : lang;
  try { return new Intl.DateTimeFormat(loc, { ...opts, timeZone: ZONE }).format(t); }
  catch { return new Intl.DateTimeFormat("en", { ...opts, timeZone: ZONE }).format(t); }
}

export function prelaunchTexts(p: Prelaunch, lang: string) {
  const loc = lang === "tl" ? "fil" : lang;
  let amount: string;
  try { amount = p.grantAmount.toLocaleString(loc); } catch { amount = p.grantAmount.toLocaleString("en"); }
  return {
    amount,
    until: fmt(lang, p.endsAt - 1000, { month: "short", day: "numeric" }),
    launchDay: fmt(lang, p.launchAt, { weekday: "long", month: "long", day: "numeric" }),
    cap: String(p.referralBonusCap),
  };
}
