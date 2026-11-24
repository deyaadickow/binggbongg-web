// All Country Battles (Steve, 2026-11-16): "Next to for you page add 'All Country Battles' when i
// click on it, it will link me to a page where all the country battles are there with search on top
// incase there is 100 battles. and anyone can click on any battle from any country to watch and
// support anyone."
//
// One call, fetchAllCountryBattles {search}. Never an empty POST body (the host WAF 403s it), so
// `search` is always sent, "" when the box is empty.
import { useCallback, useEffect, useRef, useState } from "react";
import { post } from "./api";
import { flag, noteServerNow, rivalOf, type CbRival, type CbRivalCard } from "./countryBattle";
import { flagOf } from "./countryChallenges";

export type AcbPhase = "battle" | "joining" | "upcoming" | "scheduled" | "ended";

export interface AcbPerson { user_id: number; name: string; username: string; profile_image: string; score: number }

export interface AcbBattle {
  /** "rival" = a Rival Battle card ("Philippines vs Indonesia"), with `rival`. */
  kind: "country" | "rival";
  rival: CbRival | null;
  day_id: number | null;
  country: string;
  is_test: boolean;
  phase: AcbPhase;
  opens_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  phase_ends_at: string | null;
  start_time: string | null;
  timezone: string | null;
  duration_minutes: number;
  live_count: number;
  room_open: boolean;
  can_watch: boolean;
  can_battle: boolean;
  is_my_country: boolean;
  leader: AcbPerson | null;
  winner: AcbPerson | null;
  next_starts_at: string | null;
}

export interface AcbList { enabled: boolean; server_now: string; battles: AcbBattle[] }

const PHASES: AcbPhase[] = ["battle", "joining", "upcoming", "scheduled", "ended"];
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

function person(v: unknown): AcbPerson | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Record<string, unknown>;
  const id = Number(p.user_id) || 0;
  if (!id && !p.name && !p.username) return null;
  return {
    user_id: id,
    name: String(p.name ?? "") || String(p.username ?? ""),
    username: String(p.username ?? ""),
    profile_image: String(p.profile_image ?? ""),
    score: Number(p.score) || 0,
  };
}

export function parseAcbBattle(v: Record<string, unknown>): AcbBattle {
  const phase = PHASES.includes(v.phase as AcbPhase) ? (v.phase as AcbPhase) : "scheduled";
  const rival = rivalOf(v.rival);
  return {
    kind: v.kind === "rival" && rival ? "rival" : "country",
    rival,
    day_id: Number(v.day_id) > 0 ? Number(v.day_id) : null,
    country: String(v.country ?? ""),
    is_test: flag(v.is_test),
    phase,
    opens_at: str(v.opens_at),
    starts_at: str(v.starts_at),
    ends_at: str(v.ends_at),
    phase_ends_at: str(v.phase_ends_at),
    start_time: str(v.start_time),
    timezone: str(v.timezone),
    duration_minutes: Number(v.duration_minutes) || 10,
    live_count: Number(v.live_count) || 0,
    room_open: flag(v.room_open),
    can_watch: v.can_watch === undefined ? true : flag(v.can_watch),
    can_battle: flag(v.can_battle),
    is_my_country: flag(v.is_my_country),
    leader: person(v.leader),
    // `winner` may be a person or just a name.
    winner: typeof v.winner === "string" && v.winner
      ? { user_id: 0, name: v.winner, username: "", profile_image: "", score: 0 }
      : person(v.winner),
    next_starts_at: str(v.next_starts_at),
  };
}

/** Which cards: everything (rival cards come first), only Country VS Country, or only single countries. */
export type AcbKind = "rival" | "country";

export async function fetchAllCountryBattles(search: string, kind?: AcbKind): Promise<AcbList> {
  const res = await post<{ enabled?: unknown; server_now?: string; battles?: unknown[] }>("fetchAllCountryBattles", { search: search.trim(), ...(kind ? { kind } : {}) });
  const d = res.status && res.data ? res.data : null;
  if (!d) throw new Error(res.message || "");
  noteServerNow(d.server_now);
  return {
    enabled: d.enabled === undefined ? true : flag(d.enabled),
    server_now: d.server_now ?? "",
    battles: (Array.isArray(d.battles) ? d.battles : [])
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .map(parseAcbBattle),
  };
}

/** A country page's rival card (fetchCountryBattleDaily.rival_battles) as an All Country Battles card. */
export function acbFromRivalCard(c: CbRivalCard): AcbBattle {
  return {
    kind: "rival", rival: c.rival, day_id: c.day_id, country: c.country, is_test: false, phase: c.phase,
    opens_at: c.opens_at, starts_at: c.starts_at, ends_at: c.ends_at, phase_ends_at: c.phase_ends_at,
    start_time: null, timezone: null, duration_minutes: 10, live_count: c.live_count, room_open: c.room_open,
    can_watch: c.can_watch, can_battle: c.can_battle, is_my_country: false, leader: null, winner: null, next_starts_at: null,
  };
}

/** The list, searched (~300 ms after the last keystroke) and refreshed every 20 s while the tab is in view. */
export function useAllCountryBattles(query: string, kind: AcbKind | undefined, userId: number | undefined, emptyText: string) {
  const [search, setSearch] = useState("");
  const [battles, setBattles] = useState<AcbBattle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    const h = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(h);
  }, [query]);
  const load = useCallback(() => {
    const mine = ++seq.current;
    fetchAllCountryBattles(search, kind)
      .then((d) => { if (mine === seq.current) { setBattles(d.battles); setError(null); } })
      .catch((e) => { if (mine === seq.current) setError((e as Error).message || emptyText); });
  }, [search, kind, emptyText]);
  // A new filter shows the loader instead of the other filter's cards.
  useEffect(() => { setBattles(null); }, [kind]);
  useEffect(() => {
    load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") load(); }, 20000);
    const vis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", vis); };
  }, [load, userId]);
  return { battles, error, search };
}

// ---- the red "Live" button on the chips ---------------------------------------------------
// Steve, 2026-11-24: "When there is a battle under way please add a "Live" button with red background and a
// blinking white border and text on any one of those buttons above, when you click the live button, it will
// show you all the battles that are under way one after another."
// Every battle under way right now (phase "battle"), Country VS Country first, then single countries — the
// order fetchAllCountryBattles already gives. Asked on mount, every 20 s while the tab is in view, and when the
// tab comes back. A failed call keeps the last list.
export function useRunningBattles(): AcbBattle[] {
  const [list, setList] = useState<AcbBattle[]>([]);
  useEffect(() => {
    let alive = true;
    const ask = () => {
      if (document.visibilityState !== "visible") return;
      fetchAllCountryBattles("")
        .then((d) => { if (alive) setList(d.battles.filter((b) => b.phase === "battle" && !!b.day_id)); })
        .catch(() => { /* keep the last list */ });
    };
    ask();
    const timer = setInterval(ask, 20000);
    document.addEventListener("visibilitychange", ask);
    return () => { alive = false; clearInterval(timer); document.removeEventListener("visibilitychange", ask); };
  }, []);
  return list;
}

// ---- the flag from a country NAME -----------------------------------------------------------
// The battles carry "Philippines", not "PH". The browser already knows every region's English
// name, so the reverse map is built from it once — no list to maintain.
let nameToCode: Map<string, string> | null = null;
const ALIASES: Record<string, string> = {
  "usa": "US", "united states of america": "US", "uk": "GB", "great britain": "GB", "england": "GB",
  "south korea": "KR", "korea": "KR", "russia": "RU", "vietnam": "VN", "viet nam": "VN",
  "czech republic": "CZ", "ivory coast": "CI", "turkey": "TR", "türkiye": "TR", "uae": "AE",
};

export function countryFlag(name: string): string {
  const key = name.trim().toLowerCase();
  if (!key) return "";
  if (key.length === 2) return flagOf(key);
  if (!nameToCode) {
    nameToCode = new Map();
    try {
      const dn = new Intl.DisplayNames(["en"], { type: "region" });
      for (let a = 65; a <= 90; a++) {
        for (let b = 65; b <= 90; b++) {
          const code = String.fromCharCode(a, b);
          const n = dn.of(code);
          // First code wins: "United Kingdom" is GB, not the reserved UK that comes later (no flag).
          if (n && n !== code && !nameToCode.has(n.toLowerCase())) nameToCode.set(n.toLowerCase(), code);
        }
      }
    } catch { /* no Intl.DisplayNames: aliases only */ }
  }
  return flagOf(ALIASES[key] ?? nameToCode.get(key) ?? "");
}

// ---- the red dot on the "All Country Battles" chip ------------------------------------------
// Steve, 2026-11-16: "When any battle is in progress please add a red dot in the button. means
// atleat one live is going on." Asked on mount, when the tab comes back, and every 60 s while it
// is in view. A failed call keeps the last answer for at most 2 minutes, then the dot goes.
export async function fetchCountryBattlesLive(): Promise<{ live: boolean; live_count: number }> {
  const res = await post<{ live?: unknown; live_count?: unknown }>("fetchCountryBattlesLive", { any: 1 });
  if (!res.status || !res.data) throw new Error(res.message || "");
  const live_count = Number(res.data.live_count) || 0;
  return { live: flag(res.data.live) || live_count > 0, live_count };
}

export function useAnyCountryBattleLive(): boolean {
  const [live, setLive] = useState(false);
  useEffect(() => {
    let alive = true;
    let lastOk = 0;
    const ask = () => {
      if (document.visibilityState !== "visible") return;
      fetchCountryBattlesLive()
        .then((r) => { if (alive) { lastOk = Date.now(); setLive(r.live); } })
        .catch(() => { if (alive && Date.now() - lastOk > 120000) setLive(false); });
    };
    ask();
    const timer = setInterval(ask, 60000);
    document.addEventListener("visibilitychange", ask);
    return () => { alive = false; clearInterval(timer); document.removeEventListener("visibilitychange", ask); };
  }, []);
  return live;
}
