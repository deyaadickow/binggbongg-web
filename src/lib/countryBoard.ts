// Country Board + Country Battle Recap (Steve, 2026-11-11: "Yes, plan it and build it for both on
// all three platforms, I want to launch the philippines first"). "Make every country fight for its
// pride": a world board of COUNTRIES with "your country is losing to X by N points", and a one-tap
// share card after every daily Country Battle.
//
// The wire contract is the spec's (viral-country-board-spec.md §1 + §2) and nothing more. The
// server computes every number (1 point per BB or FBB sent by a member of the country, +100 per
// new member) and writes the share sentence, so the three platforms can never say different things.
//
// Demo mode (the backend was built at the same time): ?demo=1 on /country-board, ?demo=leader, ?demo=tie,
// ?demo=out (signed out), ?demo=empty, ?demo=error — sample numbers, no server call, and a share
// card drawn on a canvas so the share sheet can be tried for real.
import { post } from "./api";

export type CountryPeriod = "today" | "week" | "all";
export const COUNTRY_PERIODS: CountryPeriod[] = ["today", "week", "all"];

export interface CountryRow { rank: number; country: string; flag: string; points: number; members: number; new_members: number }

export interface CountryBoard {
  period: CountryPeriod;
  updated_at: string | null;
  countries: CountryRow[];
  me: {
    country: string; flag: string; rank: number; points: number;
    next: { country: string; flag: string; points: number; gap: number } | null;
    is_leader: boolean;
  } | null;
  share: { card_url: string; page_url: string; text: string } | null;
}

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const flagOf = (v: unknown): string => (typeof v === "string" && v.trim() ? v : "🌍");
const isTrue = (v: unknown): boolean => v === true || v === 1 || v === "1" || v === "true";

function clean(d: CountryBoard, period: CountryPeriod): CountryBoard {
  const countries = (Array.isArray(d.countries) ? d.countries : []).map((c) => ({
    rank: num(c.rank), country: String(c.country ?? ""), flag: flagOf(c.flag), points: num(c.points), members: num(c.members), new_members: num(c.new_members),
  })).filter((c) => c.country);
  const m = d.me;
  return {
    period: (COUNTRY_PERIODS as string[]).includes(d.period) ? d.period : period,
    updated_at: d.updated_at ?? null,
    countries,
    me: m && m.country ? {
      country: m.country, flag: flagOf(m.flag), rank: num(m.rank), points: num(m.points), is_leader: isTrue(m.is_leader),
      next: m.next && !isTrue(m.is_leader) ? { country: m.next.country, flag: flagOf(m.next.flag), points: num(m.next.points), gap: num(m.next.gap) } : null,
    } : null,
    // share is null whenever me is null (signed out / no country): no Invite or Share then.
    share: m && m.country && d.share && d.share.card_url ? d.share : null,
  };
}

/** POST fetchCountryBoard — caller from the AUTHTOKEN/USERID headers (optional). Throws on no answer. */
export async function fetchCountryBoard(period: CountryPeriod): Promise<CountryBoard> {
  const res = await post<CountryBoard>("fetchCountryBoard", { period });
  if (!res.status || !res.data) throw new Error(res.message || "fetchCountryBoard");
  return clean(res.data, period);
}

// ---- §2 the Country Battle recap --------------------------------------------------------------

export interface CbRecap {
  day_id: number; date: string; country: string; flag: string;
  rank: number; of: number; points: number;
  top: { rank: number; user_id: number; name: string; username: string; profile_image: string | null; points: number }[];
  user: { user_id: number; name: string; username: string; profile_image: string | null };
  card_url: string; page_url: string; share_text: string;
  /** Added by the backend (2026-11-11): a tester's test day, and the battle's start ("8 PM"). */
  is_test?: boolean; start_time_label?: string;
}

export type RecapResult = { ok: true; data: CbRecap } | { ok: false; reason: string; message: string };

/** POST fetchCountryBattleRecap — reasons not_found / not_finished / not_participant / signin. */
export async function fetchCountryBattleRecap(dayId: number, userId?: number): Promise<RecapResult> {
  const res = await post<CbRecap>("fetchCountryBattleRecap", { day_id: dayId, ...(userId ? { user_id: userId } : {}) });
  if (!res.status || !res.data?.card_url) {
    return { ok: false, reason: typeof res.reason === "string" ? res.reason : "", message: res.message ?? "" };
  }
  const d = res.data;
  return { ok: true, data: { ...d, flag: flagOf(d.flag), rank: num(d.rank), of: num(d.of), points: num(d.points), top: Array.isArray(d.top) ? d.top : [], is_test: isTrue(d.is_test) } };
}

// ---- sharing ---------------------------------------------------------------------------------

export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";

const cardCache = new Map<string, Promise<Blob | null>>();

/** Fetch the card picture ahead of the tap: a phone's share sheet must open straight from the
 *  click (Safari refuses navigator.share after a slow await), so the picture is already here. */
export function prefetchCard(url: string | null | undefined): void {
  if (url && !cardCache.has(url)) cardCache.set(url, cardBlob(url));
}

async function cardBlob(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return blob.type.startsWith("image/") ? blob : null;
  } catch {
    return null;
  }
}

/** The card PNG as a File, or null (CORS, offline, not deployed). A demo card is a blob: URL. */
async function cardFile(url: string, name: string): Promise<File | null> {
  prefetchCard(url);
  const blob = await cardCache.get(url)!;
  if (!blob) { cardCache.delete(url); return null; }
  return new File([blob], name, { type: blob.type || "image/png" });
}

/** Share the card picture + sentence + link with the phone's share sheet (files when the browser
 *  can share files), else the text and link, else copy them for pasting (a desktop browser). */
export async function shareCard(input: { cardUrl?: string | null; text: string; pageUrl: string; fileName: string }): Promise<ShareOutcome> {
  const text = [input.text, input.pageUrl].filter(Boolean).join("\n");
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  try {
    if (nav.share) {
      const file = input.cardUrl ? await cardFile(input.cardUrl, input.fileName) : null;
      if (file && nav.canShare?.({ files: [file] })) await nav.share({ files: [file], text });
      else await nav.share({ text, url: input.pageUrl || undefined });
      return "shared";
    }
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return "cancelled";
    // NotAllowedError (the await on the picture used up the click) etc.: fall through to copying.
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}

/** The invite: the referral share (code = username, already inside the server's sentence). */
export function shareInvite(text: string, pageUrl: string): Promise<ShareOutcome> {
  return shareCard({ text, pageUrl, fileName: "" });
}

// ---- demo ------------------------------------------------------------------------------------

const DEMO_COUNTRIES: [string, string, number, number][] = [
  ["United States", "🇺🇸", 18450, 1682], ["Saudi Arabia", "🇸🇦", 9020, 292], ["United Kingdom", "🇬🇧", 5430, 340],
  ["Philippines", "🇵🇭", 3120, 313], ["Germany", "🇩🇪", 2210, 118], ["India", "🇮🇳", 1180, 36],
  ["Iraq", "🇮🇶", 960, 43], ["Indonesia", "🇮🇩", 720, 29], ["Canada", "🇨🇦", 540, 21], ["Mexico", "🇲🇽", 300, 14],
];

export type DemoKind = "lose" | "leader" | "tie" | "out" | "empty" | "error";
export function demoKind(v: string | null): DemoKind | null {
  if (!v) return null;
  return (["leader", "tie", "out", "empty", "error"] as string[]).includes(v) ? (v as DemoKind) : "lose";
}

/** The sample board: the Philippines #4, losing to the United Kingdom (or #1 for `leader`). */
export async function demoCountryBoard(kind: DemoKind, period: CountryPeriod): Promise<CountryBoard> {
  await new Promise((r) => setTimeout(r, 350));
  if (kind === "error") throw new Error("demo");
  const scale = period === "today" ? 1 : period === "week" ? 6.5 : 21;
  let rows = DEMO_COUNTRIES.map(([country, flag, pts, members], i) => ({
    rank: i + 1, country, flag, points: Math.round(pts * scale), members, new_members: Math.max(0, 12 - i * 2),
  }));
  if (kind === "leader") {
    const ph = rows.find((r) => r.country === "Philippines")!;
    ph.points = rows[0].points + 1250;
    rows = [...rows].sort((a, b) => b.points - a.points).map((r, i) => ({ ...r, rank: i + 1 }));
  }
  if (kind === "tie") rows[3].points = rows[2].points;
  if (kind === "empty") rows = [];
  const mine = rows.find((r) => r.country === "Philippines");
  const ahead = mine && mine.rank > 1 ? rows[mine.rank - 2] : null;
  const me = kind === "out" || !mine ? null : {
    country: mine.country, flag: mine.flag, rank: mine.rank, points: mine.points, is_leader: mine.rank === 1,
    next: ahead ? { country: ahead.country, flag: ahead.flag, points: ahead.points, gap: ahead.points - mine.points } : null,
  };
  const text = !me ? "" : me.is_leader
    ? `🇵🇭 Philippines is #1 on Bingg Bongg! Help us stay on top — join with my code mae`
    : `🇵🇭 Philippines is #${me.rank} on Bingg Bongg! Help us beat ${me.next!.flag} ${me.next!.country} — join with my code mae`;
  return {
    period, updated_at: new Date().toISOString(), countries: rows, me,
    share: me ? {
      card_url: await demoCard([
        { t: "COUNTRY BOARD", s: 46 }, { t: me.flag, s: 220 }, { t: me.country, s: 84 },
        { t: `#${me.rank} in the world`, s: 72 }, { t: `${me.points.toLocaleString()} points`, s: 60 },
        { t: me.is_leader ? "#1 in the world!" : `Losing to ${me.next!.country} by ${me.next!.gap.toLocaleString()}`, s: 46 },
      ]),
      page_url: "https://admin.binggbongg.com/country/philippines?ref=mae",
      text,
    } : null,
  };
}

/** A sample recap. ?demo=not_finished / not_participant / not_found answer that reason instead. */
export async function demoRecap(dayId: number, reason?: string | null): Promise<RecapResult> {
  await new Promise((r) => setTimeout(r, 450));
  if (reason && ["not_found", "not_finished", "not_participant", "signin"].includes(reason)) return { ok: false, reason, message: "" };
  const top = [
    { rank: 1, user_id: 1001, name: "maria santos", username: "mariasantos", profile_image: null, points: 9000 },
    { rank: 2, user_id: 1002, name: "juan dela cruz", username: "juandelacruz", profile_image: null, points: 7350 },
    { rank: 3, user_id: 1003, name: "angel reyes", username: "angelreyes", profile_image: null, points: 6100 },
  ];
  return {
    ok: true, data: {
      day_id: dayId || 12, date: "2026-12-01", country: "Philippines", flag: "🇵🇭", rank: 7, of: 52, points: 4200, top,
      user: { user_id: 4551, name: "Mae", username: "mae", profile_image: null },
      card_url: await demoCard([
        { t: "TONIGHT'S COUNTRY BATTLE", s: 46 }, { t: "🇵🇭", s: 180 }, { t: "Philippines · Dec 1, 2026", s: 52 },
        { t: "Mae", s: 72 }, { t: "#7 of 52", s: 130 }, { t: "4,200 points", s: 60 },
        { t: top.map((p) => `#${p.rank} ${p.name}`).join("   "), s: 34 }, { t: "Battle me tomorrow 8 PM", s: 50 },
      ]),
      page_url: "https://admin.binggbongg.com/battle/country/12/4551?ref=mae",
      share_text: "I finished #7 of 52 in tonight's 🇵🇭 Philippines Country Battle on Bingg Bongg! Battle me tomorrow at 8 PM — join with my code mae",
    },
  };
}

/** A 1080x1350 black + gold stand-in for the server's card PNG, as a blob: URL. */
async function demoCard(lines: { t: string; s: number }[]): Promise<string> {
  const c = document.createElement("canvas");
  c.width = 1080; c.height = 1350;
  const g = c.getContext("2d");
  if (!g) return "";
  g.fillStyle = "#000"; g.fillRect(0, 0, 1080, 1350);
  g.strokeStyle = "#D4AF37"; g.lineWidth = 10; g.strokeRect(30, 30, 1020, 1290);
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = "#F0C420"; g.font = "900 64px system-ui, sans-serif";
  g.fillText("Bingg Bongg", 540, 120);
  const gap = (1080 - 260) / lines.length;
  lines.forEach((l, i) => {
    g.fillStyle = i === 0 ? "#FFDD55" : "#F0C420";
    g.font = `800 ${l.s}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    g.fillText(l.t, 540, 230 + gap * i + gap / 2, 980);
  });
  g.font = "800 44px system-ui, sans-serif"; g.fillStyle = "#F0C420";
  g.fillText("WWW.BinggBongg.COM", 540, 1250);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
  return blob ? URL.createObjectURL(blob) : "";
}
