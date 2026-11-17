// Safety and wellbeing (Steve, 2026-11-17): the app-wide screen-time tracker and its two full-screen
// pages (Time's up / Take a break), the passcode popup, the chips, the "Managed by @parent" banner
// and the QR of a Family Pairing code. Black and gold, the app's gold popups.
//
// The tracker counts only while this tab is VISIBLE (Page Visibility API): a tab left open in the
// background is not screen time. It pings the server about once a minute with the seconds since the
// last ping, sends one more on going to the background, and keeps a local continuous-use counter for
// the break reminder (reset after 10 minutes away). Neither page shows while the member is HOSTING a
// live (/live/<room>?host=1) — they wait until the live ends.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Link, useLocation } from "react-router-dom";
import { tt, useT, type StringKey } from "../lib/i18n";
import { useSession } from "../lib/session";
import { socialUser } from "../lib/social";
import { qrMatrix } from "../lib/qr";
import { showGoldAlert } from "./GoldToast";
import {
  WellbeingError, getTodayStatus, publishTodayStatus, screenTimePing, screenTimeUnlock, subscribeTodayStatus, wbMockMode,
  type Audience, type TodayStatus,
} from "../lib/wellbeing";

/** The member these features act for (on the dev server also the Social mock's pretend member). */
export function useWbMe() {
  const { user } = useSession();
  return socialUser(user);
}

// ---- Passcode popup ------------------------------------------------------------------------------

/** The gold popup with a 4-number field (and a second "type it again" field when `confirm`).
 *  Resolves the passcode, or null when cancelled. */
export function askPasscode(opts: { message: string; confirm?: boolean }): Promise<string | null> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const close = (v: string | null) => { root.unmount(); host.remove(); resolve(v); };

    function Card() {
      const [a, setA] = useState("");
      const [b, setB] = useState("");
      const [err, setErr] = useState("");
      const clean = (v: string) => v.replace(/\D/g, "").slice(0, 4);
      const submit = () => {
        if (!/^\d{4}$/.test(a)) { setErr(tt("wb_passcode_4_numbers")); return; }
        if (opts.confirm && a !== b) { setErr(tt("wb_passcodes_dont_match")); return; }
        close(a);
      };
      return (
        <div className="wb-popup-back" style={{ zIndex: 99995 }}>
          <form className="card pad wb-popup" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <p className="wb-popup-text">{opts.message}</p>
            <input className="input wb-pin" type="password" inputMode="numeric" autoComplete="off" autoFocus maxLength={4}
              aria-label={tt("wb_passcode")} placeholder="••••" value={a} onChange={(e) => { setA(clean(e.target.value)); setErr(""); }} />
            {opts.confirm && (
              <>
                <div className="muted" style={{ fontSize: 13, margin: "10px 0 6px" }}>{tt("wb_type_it_again")}</div>
                <input className="input wb-pin" type="password" inputMode="numeric" autoComplete="off" maxLength={4}
                  aria-label={tt("wb_type_it_again")} placeholder="••••" value={b} onChange={(e) => { setB(clean(e.target.value)); setErr(""); }} />
              </>
            )}
            {err && <div className="wb-err">{err}</div>}
            <div className="wb-popup-btns">
              <button type="button" className="btn" onClick={() => close(null)}>{tt("cancel")}</button>
              <button type="submit" className="btn gold">{tt("ok")}</button>
            </div>
          </form>
        </div>
      );
    }
    root.render(<Card />);
  });
}

/**
 * Runs a save that may need a passcode. `passcode_needed` asks for a NEW one (twice) and sends it as
 * `newKey`; `wrong_passcode` with none sent yet asks for the CURRENT one and sends it as `currentKey`.
 * Any other refusal is the gold popup with the server's own sentence. Resolves null when it did not
 * go through.
 */
export async function withPasscode<R>(
  fn: (extra: Record<string, string>) => Promise<R>,
  keys: { newKey?: string; currentKey?: string; newMessage?: string; currentMessage?: string } = {},
  start: Record<string, string> = {},
): Promise<R | null> {
  const extra: Record<string, string> = { ...start };
  for (let i = 0; i < 4; i++) {
    try {
      return await fn(extra);
    } catch (e) {
      const err = e as WellbeingError;
      if (err.code === "passcode_needed" && keys.newKey && !extra[keys.newKey]) {
        const p = await askPasscode({ message: keys.newMessage ?? tt("wb_choose_passcode"), confirm: true });
        if (!p) return null;
        extra[keys.newKey] = p;
        continue;
      }
      if (err.code === "wrong_passcode" && keys.currentKey && !extra[keys.currentKey]) {
        const p = await askPasscode({ message: keys.currentMessage ?? tt("wb_type_current_passcode") });
        if (!p) return null;
        extra[keys.currentKey] = p;
        continue;
      }
      showGoldAlert(err.code === "not_ready" ? tt("wb_coming_soon") : err.message || tt("couldn_t_save"));
      return null;
    }
  }
  return null;
}

// ---- Small pieces ------------------------------------------------------------------------------

export function minutesLabel(t: (k: StringKey, ...a: (string | number)[]) => string, m: number): string {
  return m === 0 ? t("wb_off") : t("wb_n_min", m);
}

export function WbChips({ options, value, onPick, disabled, label }: { options: number[]; value: number; onPick: (v: number) => void; disabled?: boolean; label?: (v: number) => string }) {
  const { t } = useT();
  return (
    <div className="cm-chips wb-chips">
      {options.map((o) => (
        <button key={o} type="button" className={`cm-chip${value === o ? " active" : ""}`} disabled={disabled} aria-pressed={value === o}
          onClick={() => value !== o && onPick(o)}>
          {label ? label(o) : minutesLabel(t, o)}
        </button>
      ))}
    </div>
  );
}

export function AudienceChips({ value, onPick, disabled }: { value: Audience; onPick: (v: Audience) => void; disabled?: boolean }) {
  const { t } = useT();
  const opts: [Audience, StringKey][] = [["everyone", "wb_everyone"], ["friends", "wb_friends"], ["nobody", "wb_nobody"]];
  return (
    <div className="cm-chips wb-chips">
      {opts.map(([v, k]) => (
        <button key={v} type="button" className={`cm-chip${value === v ? " active" : ""}`} disabled={disabled} aria-pressed={value === v}
          onClick={() => value !== v && onPick(v)}>{t(k)}</button>
      ))}
    </div>
  );
}

export function ManagedBanner({ username }: { username?: string | null }) {
  const { t } = useT();
  return (
    <Link to="/settings/family-pairing" className="wb-banner">
      🔒 {t("wb_managed_by", username ? `@${username}` : t("wb_your_parent"))}
    </Link>
  );
}

export function WbSection({ title, children, help }: { title: string; children: ReactNode; help?: string }) {
  return (
    <div className="card pad wb-section">
      <div className="cm-label">{title}</div>
      {children}
      {help && <div className="muted wb-help">{help}</div>}
    </div>
  );
}

/** The pairing code as a QR, drawn on the page (never sent to an image service). */
export function QrCode({ text, size = 200 }: { text: string; size?: number }) {
  const m = useMemo(() => qrMatrix(text), [text]);
  if (!m) return null;
  const n = m.length + 8;
  const path: string[] = [];
  m.forEach((row, y) => row.forEach((dark, x) => { if (dark) path.push(`M${x + 4} ${y + 4}h1v1h-1z`); }));
  return (
    <svg className="wb-qr" width={size} height={size} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" role="img" aria-label={text} data-qr={text}>
      <rect width={n} height={n} fill="#000" />
      <path d={path.join("")} fill="#F0C420" />
    </svg>
  );
}

// ---- App-wide tracker + full-screen pages --------------------------------------------------------

const CONT_KEY = "bb.wb.continuous";
const AWAY_RESET_MS = 10 * 60_000;

function pauseAllMedia() {
  document.querySelectorAll("video, audio").forEach((el) => { try { (el as HTMLMediaElement).pause(); } catch { /* fine */ } });
}

/** While a full-screen page is up, nothing behind it plays and the page under it does not scroll. */
function useHoldPage(active: boolean) {
  useEffect(() => {
    if (!active) return;
    pauseAllMedia();
    const onPlay = (e: Event) => {
      const el = e.target as HTMLMediaElement;
      if (!el.closest?.(".wb-full")) el.pause();
    };
    document.addEventListener("play", onPlay, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("play", onPlay, true); document.body.style.overflow = prev; };
  }, [active]);
}

export function WellbeingGate() {
  const me = useWbMe();
  const myId = me?.id ?? null;
  const loc = useLocation();
  const hosting = loc.pathname.startsWith("/live/") && new URLSearchParams(loc.search).get("host") === "1";
  const [status, setStatus] = useState<TodayStatus | null>(getTodayStatus());
  const [breakDue, setBreakDue] = useState<number | null>(null);

  const statusRef = useRef(status);
  const hostingRef = useRef(hosting);
  const breakOpenRef = useRef(false);
  const contRef = useRef(0);
  const nextBreakRef = useRef(0);
  useEffect(() => {
    statusRef.current = status;
    hostingRef.current = hosting;
    breakOpenRef.current = breakDue !== null;
  });

  useEffect(() => subscribeTodayStatus(setStatus), []);

  // A new break setting starts the reminder from its own length.
  const breakEvery = status?.break_every_minutes ?? 0;
  useEffect(() => { nextBreakRef.current = breakEvery * 60; }, [breakEvery]);

  useEffect(() => {
    if (!myId) { publishTodayStatus(null); return; }
    let stopped = false;
    const fast = wbMockMode().includes("fast");
    const PING_MS = fast ? 5_000 : 60_000;
    const SPEED = fast ? 60 : 1; // dev only: the break counter runs a minute per second
    let acc = 0;
    let last = Date.now();
    let lastPing = Date.now();
    let hiddenAt: number | null = null;
    try {
      const saved = JSON.parse(sessionStorage.getItem(CONT_KEY) || "null") as { sec: number; at: number } | null;
      contRef.current = saved && Date.now() - saved.at < AWAY_RESET_MS ? saved.sec : 0;
    } catch { contRef.current = 0; }
    const saveCont = () => { try { sessionStorage.setItem(CONT_KEY, JSON.stringify({ sec: contRef.current, at: Date.now() })); } catch { /* fine */ } };

    const ping = async (keepalive = false) => {
      if (stopped) return;
      const sec = Math.min(300, Math.floor(acc));
      acc -= sec;
      lastPing = Date.now();
      try {
        const st = await screenTimePing(sec, { keepalive });
        if (!stopped) publishTodayStatus(st);
      } catch (e) {
        if ((e as WellbeingError).code === "not_ready") { stopped = true; publishTodayStatus(null); return; }
        acc = Math.min(300, acc + sec); // try again with the next ping
      }
    };

    const count = () => {
      const now = Date.now();
      const dt = Math.min(5, Math.max(0, (now - last) / 1000));
      last = now;
      return dt;
    };

    const tick = () => {
      if (stopped) return;
      const dt = count();
      if (document.visibilityState !== "visible") return;
      acc += dt;
      contRef.current += dt * SPEED;
      saveCont();
      const st = statusRef.current;
      const every = st?.break_every_minutes ?? 0;
      if (every > 0 && !breakOpenRef.current && !hostingRef.current && !st?.over_limit && nextBreakRef.current > 0 && contRef.current >= nextBreakRef.current) {
        setBreakDue(Math.max(1, Math.floor(contRef.current / 60)));
      }
      if (Date.now() - lastPing >= PING_MS) void ping();
    };

    const onVis = () => {
      if (document.visibilityState === "hidden") {
        acc += count();
        hiddenAt = Date.now();
        saveCont();
        void ping(true);
      } else {
        if (hiddenAt && Date.now() - hiddenAt >= AWAY_RESET_MS) { contRef.current = 0; nextBreakRef.current = (statusRef.current?.break_every_minutes ?? 0) * 60; }
        hiddenAt = null;
        last = Date.now();
      }
    };

    void ping(); // once at start
    const iv = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", onVis);
    return () => { stopped = true; window.clearInterval(iv); document.removeEventListener("visibilitychange", onVis); };
  }, [myId]);

  const timesUp = !!myId && !!status?.over_limit && !hosting;
  const showBreak = !!myId && !timesUp && breakDue !== null && !hosting;
  useHoldPage(timesUp || showBreak);

  if (timesUp && status) return <TimesUpPage status={status} />;
  if (showBreak && breakDue !== null) {
    return (
      <TakeABreakPage minutes={breakDue}
        onOk={() => { contRef.current = 0; nextBreakRef.current = (status?.break_every_minutes ?? 0) * 60; setBreakDue(null); }}
        onLater={() => { nextBreakRef.current = contRef.current + 10 * 60; setBreakDue(null); }} />
    );
  }
  return null;
}

function Logo() {
  return <img src="/logo_round.png" alt="Bingg Bongg" width={84} height={84} className="wb-logo" />;
}

function TimesUpPage({ status }: { status: TodayStatus }) {
  const { t } = useT();
  const [pin, setPin] = useState("");
  const [mins, setMins] = useState(15);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(false);
  const teen = status.managed_by_parent;

  async function keepWatching() {
    if (!/^\d{4}$/.test(pin)) { setMsg(t("wb_passcode_4_numbers")); return; }
    setBusy(true);
    try {
      const st = await screenTimeUnlock(pin, mins);
      setPin("");
      publishTodayStatus(st);
    } catch (e) {
      setMsg((e as Error).message || t("wb_passcode_wrong"));
      setPin("");
    } finally { setBusy(false); }
  }

  return (
    <div className="wb-full" role="alertdialog" aria-modal="true" aria-labelledby="wb-timesup-title">
      <div className="wb-full-body">
        <Logo />
        <h1 id="wb-timesup-title" className="wb-full-title">{t("wb_times_up")}</h1>
        <p className="wb-full-text">{t("wb_used_n_minutes", status.today_minutes)}</p>
        {done ? (
          <>
            <p className="wb-full-text cm-gold" style={{ fontWeight: 800 }}>{t("wb_see_you_tomorrow")}</p>
            <button className="btn ghost" onClick={() => setDone(false)}>{t("wb_i_have_the_passcode")}</button>
          </>
        ) : (
          <form className="wb-unlock" onSubmit={(e) => { e.preventDefault(); void keepWatching(); }}>
            <div className="muted" style={{ fontSize: 14 }}>{teen ? t("wb_ask_parent_passcode") : t("wb_type_passcode_more_time")}</div>
            <input className="input wb-pin" type="password" inputMode="numeric" autoComplete="off" maxLength={4} placeholder="••••"
              aria-label={t("wb_passcode")} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} />
            <WbChips options={[15, 30, 60]} value={mins} onPick={setMins} label={(m) => t("wb_n_min", m)} />
            <button type="submit" className="btn gold block" disabled={busy}>{t("wb_keep_watching")}</button>
            <button type="button" className="btn ghost block" onClick={() => { setDone(true); pauseAllMedia(); }}>{t("wb_ok_im_done")}</button>
          </form>
        )}
      </div>
      {msg && (
        <div className="wb-popup-back" style={{ zIndex: 99996 }}>
          <div className="card pad wb-popup">
            <p className="wb-popup-text">{msg}</p>
            <div className="wb-popup-btns"><button className="btn gold" autoFocus onClick={() => setMsg("")}>{t("ok")}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function TakeABreakPage({ minutes, onOk, onLater }: { minutes: number; onOk: () => void; onLater: () => void }) {
  const { t } = useT();
  return (
    <div className="wb-full" role="alertdialog" aria-modal="true" aria-labelledby="wb-break-title">
      <div className="wb-full-body">
        <Logo />
        <h1 id="wb-break-title" className="wb-full-title">{t("wb_time_for_a_break")}</h1>
        <p className="wb-full-text">{t("wb_scrolling_for_n", minutes)}</p>
        <button className="btn gold block" autoFocus onClick={onOk}>{t("ok")}</button>
        <button className="btn ghost block" onClick={onLater}>{t("wb_remind_me_10")}</button>
      </div>
    </div>
  );
}
