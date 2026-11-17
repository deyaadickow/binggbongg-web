// DEV-ONLY stand-in for the Safety and wellbeing server (binggbongg-backend 8280090, not deployed
// yet). Loaded only through lib/wellbeing.ts under `import.meta.env.DEV`, so it is never in the
// production build, and on the dev server no limit, passcode, pairing or Restricted Mode switch ever
// reaches the live server. Everything lives in sessionStorage; the starting state comes from
// `?wbmock=` (see wbMockMode in lib/wellbeing.ts).
import type { ApiResponse, UserSummary } from "./api";

const STORE = "bb.wbMock.state";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ok = <T,>(data: T): ApiResponse<T> => ({ status: true, data });
const fail = <T,>(message: string, code = ""): ApiResponse<T> => ({ status: false, message, ...(code ? { code } : {}) });
const utc = (t: number) => new Date(t).toISOString().slice(0, 19).replace("T", " ");

const LIMITS = [0, 30, 45, 60, 90, 120];
const BREAKS = [0, 10, 20, 30, 60];
const EXTRAS = [15, 30, 60];
const AUDIENCES = ["everyone", "friends", "nobody"];

interface Settings {
  daily_limit_minutes: number;
  break_every_minutes: number;
  passcode: string | null;
  restricted_mode: boolean;
  who_can_message: string;
  who_can_comment: string;
}
interface Usage { day: string; seconds: number; extra: number }
interface Teen { user: UserSummary; linked_at: string; unlink_requested: boolean; settings: Settings; usage: Usage }
interface State {
  mode: string;
  role: "none" | "parent" | "teen";
  me: Settings;
  usage: Usage;
  parent: UserSummary | null;
  unlink_requested: boolean;
  teens: Teen[];
  code: { code: string; expires: number } | null;
  wrong: number[];
  tries: number[];
}

const DEMO_PARENT: UserSummary = { id: 910001, fullname: "Maria Santos", username: "maria_parent", profile_image: "", is_verified: 0 };
const DEMO_TEENS: UserSummary[] = [
  { id: 910101, fullname: "Joshua Santos", username: "joshua_s", profile_image: "", is_verified: 0 },
  { id: 910102, fullname: "Bea Santos", username: "bea.santos", profile_image: "", is_verified: 0 },
];

function dayOf(tzName: string): string {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: tzName || "UTC" }).format(new Date()); } catch { return new Date().toISOString().slice(0, 10); }
}

const blank = (): Settings => ({ daily_limit_minutes: 0, break_every_minutes: 0, passcode: null, restricted_mode: false, who_can_message: "everyone", who_can_comment: "everyone" });

function fresh(mode: string, day: string): State {
  const m = mode.split(",").map((s) => s.trim());
  const s: State = { mode, role: "none", me: blank(), usage: { day, seconds: 0, extra: 0 }, parent: null, unlink_requested: false, teens: [], code: null, wrong: [], tries: [] };
  if (m.includes("limit")) s.me = { ...s.me, daily_limit_minutes: 30, break_every_minutes: 10, passcode: "1234" };
  if (m.includes("teen")) {
    s.role = "teen"; s.parent = DEMO_PARENT;
    s.me = { daily_limit_minutes: 60, break_every_minutes: 20, passcode: "1234", restricted_mode: true, who_can_message: "friends", who_can_comment: "friends" };
  }
  if (m.includes("parent")) {
    s.role = "parent";
    s.teens = DEMO_TEENS.map((u, i) => ({
      user: u, linked_at: utc(Date.now() - (i + 2) * 86400_000), unlink_requested: i === 1,
      settings: { daily_limit_minutes: i === 0 ? 60 : 0, break_every_minutes: i === 0 ? 20 : 0, passcode: i === 0 ? "1234" : null, restricted_mode: true, who_can_message: "friends", who_can_comment: "everyone" },
      usage: { day, seconds: i === 0 ? 47 * 60 : 12 * 60, extra: 0 },
    }));
  }
  if (m.includes("over") && s.me.daily_limit_minutes) s.usage.seconds = s.me.daily_limit_minutes * 60;
  return s;
}

function load(mode: string, day: string): State {
  try {
    const s = JSON.parse(sessionStorage.getItem(STORE) || "null") as State | null;
    if (s && s.mode === mode) {
      if (s.usage.day !== day) s.usage = { day, seconds: 0, extra: 0 };
      return s;
    }
  } catch { /* fresh */ }
  return fresh(mode, day);
}
function save(s: State) { try { sessionStorage.setItem(STORE, JSON.stringify(s)); } catch { /* fine */ } }

function today(set: Settings, u: Usage, managed: boolean) {
  const mins = Math.floor(u.seconds / 60);
  const allowed = set.daily_limit_minutes ? set.daily_limit_minutes + u.extra : 0;
  return {
    day: u.day, today_minutes: mins, extra_minutes_today: u.extra,
    minutes_left: set.daily_limit_minutes ? Math.max(0, allowed - mins) : null,
    over_limit: !!set.daily_limit_minutes && mins >= allowed,
    daily_limit_minutes: set.daily_limit_minutes, break_every_minutes: set.break_every_minutes, managed_by_parent: managed,
  };
}

function wellbeing(s: State) {
  const managed = s.role === "teen";
  return {
    ...today(s.me, s.usage, managed),
    has_passcode: !!s.me.passcode, restricted_mode: s.me.restricted_mode,
    who_can_message: s.me.who_can_message, who_can_comment: s.me.who_can_comment,
    parent: managed ? s.parent : null,
    limit_options: LIMITS, break_options: BREAKS, extra_options: EXTRAS, audiences: AUDIENCES,
  };
}

function teenCard(t: Teen) {
  const { passcode, ...rest } = t.settings;
  const d = today(t.settings, t.usage, true);
  return {
    user: t.user, linked_at: t.linked_at, unlink_requested: t.unlink_requested,
    settings: { ...rest, has_passcode: !!passcode },
    day: d.day, today_minutes: d.today_minutes, extra_minutes_today: d.extra_minutes_today, minutes_left: d.minutes_left, over_limit: d.over_limit,
  };
}

const MANAGED = "Your parent manages this through Family Pairing.";
const WRONG = "That passcode isn't right.";

function wrongPasscode<T>(s: State): ApiResponse<T> {
  const now = Date.now();
  s.wrong = s.wrong.filter((t) => now - t < 15 * 60_000);
  s.wrong.push(now);
  save(s);
  if (s.wrong.length >= 5) return fail("Too many wrong passcodes. Try again in 15 minutes.", "wrong_passcode");
  return fail(WRONG, "wrong_passcode");
}
const locked = (s: State) => s.wrong.filter((t) => Date.now() - t < 15 * 60_000).length >= 5;
const validPass = (p: unknown) => typeof p === "string" && /^\d{4}$/.test(p);

export async function mockWellbeingCall<T>(endpoint: string, params: Record<string, unknown>, mode: string): Promise<ApiResponse<T>> {
  await wait(endpoint === "screenTimePing" ? 30 : 220);
  if (mode.split(",").includes("notready")) return fail("Coming soon.", "not_ready");
  const day = dayOf(String(params.tz ?? ""));
  const s = load(mode, day);
  const managed = s.role === "teen";
  const r = <X,>(x: X) => { save(s); return ok(x) as unknown as ApiResponse<T>; };

  switch (endpoint) {
    case "fetchWellbeing":
      return r(wellbeing(s));

    case "screenTimePing": {
      const sec = Math.max(0, Math.min(300, Number(params.seconds) || 0));
      s.usage.seconds += sec;
      return r(today(s.me, s.usage, managed));
    }

    case "saveScreenTime": {
      if (managed) return fail(MANAGED, "managed_by_parent");
      const limit = Number(params.daily_limit_minutes) || 0;
      const brk = Number(params.break_every_minutes) || 0;
      if (!LIMITS.includes(limit) || !BREAKS.includes(brk)) return fail("Pick one of the options.");
      const newPass = params.passcode;
      const cur = params.current_passcode;
      const raising = !!s.me.daily_limit_minutes && (limit === 0 || limit > s.me.daily_limit_minutes);
      const changingPass = newPass !== undefined && !!s.me.passcode;
      if (s.me.passcode && (raising || changingPass)) {
        if (locked(s)) return fail("Too many wrong passcodes. Try again in 15 minutes.", "wrong_passcode");
        if (cur !== s.me.passcode) return cur === undefined ? fail("Type your passcode to change this.", "wrong_passcode") : wrongPasscode(s);
      }
      if (newPass !== undefined && !validPass(newPass)) return fail("The passcode must be 4 numbers.");
      if (limit && !s.me.passcode && newPass === undefined) return fail("Choose a 4-number passcode.", "passcode_needed");
      if (newPass !== undefined) s.me.passcode = String(newPass);
      s.me.daily_limit_minutes = limit;
      s.me.break_every_minutes = brk;
      return r(wellbeing(s));
    }

    case "screenTimeUnlock": {
      const mins = Number(params.minutes);
      if (!EXTRAS.includes(mins)) return fail("Pick 15, 30 or 60 minutes.");
      if (locked(s)) return fail("Too many wrong passcodes. Try again in 15 minutes.", "wrong_passcode");
      if (!s.me.passcode || params.passcode !== s.me.passcode) return wrongPasscode(s);
      s.usage.extra += mins;
      return r(today(s.me, s.usage, managed));
    }

    case "setRestrictedMode": {
      if (managed) return fail(MANAGED, "managed_by_parent");
      const on = Number(params.on) === 1;
      if (!on && s.me.passcode) {
        if (locked(s)) return fail("Too many wrong passcodes. Try again in 15 minutes.", "wrong_passcode");
        if (params.passcode !== s.me.passcode) return params.passcode === undefined ? fail("Type your passcode to turn this off.", "wrong_passcode") : wrongPasscode(s);
      }
      s.me.restricted_mode = on;
      return r(wellbeing(s));
    }

    case "familyStatus": {
      const code = s.code && s.code.expires > Date.now() ? { code: s.code.code, qr_text: `BBFAMILY:${s.code.code}`, expires_at: utc(s.code.expires) } : null;
      return r({
        role: s.role, parent: s.role === "teen" ? s.parent : null, unlink_requested: s.role === "teen" && s.unlink_requested,
        teens: s.role === "parent" ? s.teens.map(teenCard) : [],
        my_settings: s.role === "teen" ? wellbeing(s) : null,
        active_code: s.role === "teen" ? null : code,
      });
    }

    case "familyCreateCode": {
      if (s.role === "teen") return fail("You're linked as a teen, so you can't link a teen.", "is_teen");
      if (s.teens.length >= 10) return fail("You can link up to 10 teens.", "too_many");
      const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const code = Array.from({ length: 6 }, () => letters[Math.floor(Math.random() * letters.length)]).join("");
      // 15 minutes like the server; `fast` makes it 40 s so the new-code-at-zero can be watched.
      s.code = { code, expires: Date.now() + (mode.includes("fast") ? 40_000 : 15 * 60_000) };
      return r({ code, qr_text: `BBFAMILY:${code}`, expires_at: utc(s.code.expires) });
    }

    case "familyJoin": {
      const now = Date.now();
      s.tries = s.tries.filter((t) => now - t < 15 * 60_000);
      if (s.tries.length >= 10) return fail("Too many tries. Wait 15 minutes and try again.", "too_many_tries");
      const code = String(params.code ?? "").trim().toUpperCase().replace(/^BBFAMILY:/, "");
      if (s.role === "teen") return fail("You're already linked to a parent.", "already_linked");
      if (s.role === "parent") return fail("You're a parent in Family Pairing, so you can't link as a teen.", "is_parent");
      if (s.code && s.code.code === code) return fail("That's your own code. Type it on your teen's phone.", "own_code");
      // Any well-formed code links to the demo parent, except AAAAAA (= a code that doesn't exist).
      if (!/^[A-Z0-9]{6}$/.test(code) || code === "AAAAAA") { s.tries.push(now); save(s); return fail("That code doesn't work. Check it and try again.", "bad_code"); }
      s.role = "teen"; s.parent = DEMO_PARENT; s.unlink_requested = false;
      s.me = { ...s.me, restricted_mode: true };
      return r({ parent: DEMO_PARENT });
    }

    case "familySetTeenSettings": {
      if (s.role !== "parent") return fail("Only a linked parent can do that.");
      const t = s.teens.find((x) => x.user.id === Number(params.teen_id));
      if (!t) return fail("That teen isn't linked to you.");
      const p = params;
      if (p.passcode !== undefined) {
        if (!validPass(p.passcode)) return fail("The passcode must be 4 numbers.");
        t.settings.passcode = String(p.passcode);
      }
      if (p.daily_limit_minutes !== undefined) {
        const lim = Number(p.daily_limit_minutes) || 0;
        if (!LIMITS.includes(lim)) return fail("Pick one of the options.");
        if (lim && !t.settings.passcode) return fail("Choose a 4-number passcode. Your teen will need it to keep watching after the limit.", "passcode_needed");
        t.settings.daily_limit_minutes = lim;
      }
      if (p.break_every_minutes !== undefined) t.settings.break_every_minutes = Number(p.break_every_minutes) || 0;
      if (p.restricted_mode !== undefined) t.settings.restricted_mode = Number(p.restricted_mode) === 1;
      if (p.who_can_message !== undefined) t.settings.who_can_message = String(p.who_can_message);
      if (p.who_can_comment !== undefined) t.settings.who_can_comment = String(p.who_can_comment);
      if (p.extra_minutes_today !== undefined) {
        const x = Number(p.extra_minutes_today);
        if (!EXTRAS.includes(x)) return fail("Pick 15, 30 or 60 minutes.");
        t.usage.extra += x;
      }
      return r(teenCard(t));
    }

    case "familyRequestUnlink":
      if (s.role !== "teen") return fail("You're not linked to a parent.");
      s.unlink_requested = true;
      return r({});

    case "familyUnlink": {
      if (s.role !== "parent") return fail("Only a linked parent can do that.");
      const t = s.teens.find((x) => x.user.id === Number(params.teen_id));
      if (!t) return fail("That teen isn't linked to you.");
      if (Number(params.keep) === 1) t.unlink_requested = false;
      else s.teens = s.teens.filter((x) => x !== t);
      return r({});
    }
  }
  return fail("Unknown endpoint.");
}
