// Safety and wellbeing (Steve, 2026-11-17): "Screen-time limits and reminders. Family Pairing:
// parents link to a teen's account and set limits. Restricted Mode to filter mature content."
//   /settings/screen-time                 today's minutes, daily limit, break reminders, passcode
//   /settings/restricted-mode             the switch
//   /settings/family-pairing              I'm a parent / I'm a teen; the parent's code + linked teens; the teen's linked view
//   /settings/family-pairing/teen/:id     a parent's controls for one teen
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useT, type StringKey } from "../lib/i18n";
import { PageTitle } from "../components/PageTitle";
import { Avatar, Loading, Notice } from "../components/Common";
import { showGoldAlert, showGoldConfirm } from "../components/GoldToast";
import { AudienceChips, ManagedBanner, QrCode, WbChips, WbSection, askPasscode, minutesLabel, useWbMe, withPasscode } from "../components/Wellbeing";
import { setFeed } from "../lib/feed";
import { displayName, type UserSummary } from "../lib/api";
import {
  WellbeingError, familyCreateCode, familyJoin, familyRequestUnlink, familySetTeenSettings, familyStatus, familyUnlink,
  fetchWellbeing, parseUtc, publishTodayStatus, saveScreenTime, setRestrictedMode, subscribeTodayStatus,
  type Audience, type FamilyCode, type FamilyStatus, type TeenCard, type Wellbeing,
} from "../lib/wellbeing";

type T = ReturnType<typeof useT>["t"];

function Shell({ titleKey, children }: { titleKey: StringKey; children: React.ReactNode }) {
  const { t } = useT();
  return (
    <div className="page wb-page" style={{ maxWidth: 680 }}>
      <PageTitle>{t(titleKey)}</PageTitle>
      {children}
    </div>
  );
}

function SignInCard({ from }: { from: string }) {
  const { t } = useT();
  return (
    <div className="card pad center">
      <p className="cm-gold">{t("cm_sign_in_first")}</p>
      <Link to="/login" state={{ from }} className="btn gold">{t("fnd_sign_in")}</Link>
    </div>
  );
}

function ComingSoon() {
  const { t } = useT();
  return <div className="card pad center"><p className="cm-gold" style={{ margin: 0, fontWeight: 700 }}>{t("wb_coming_soon")}</p></div>;
}

/** Loads something that may answer "not ready": null = loading, "soon" = not ready yet. */
function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "soon" | "error">("loading");
  const [err, setErr] = useState("");
  const reload = useCallback(async () => {
    try {
      const d = await fn();
      setData(d); setState("ok");
    } catch (e) {
      const we = e as WellbeingError;
      if (we.code === "not_ready") setState("soon");
      else { setErr(we.message); setState("error"); }
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void reload(); }, [reload]);
  return { data, setData, state, err, reload };
}

function todayFrom(w: Wellbeing) {
  return {
    day: w.day, today_minutes: w.today_minutes, extra_minutes_today: w.extra_minutes_today, minutes_left: w.minutes_left,
    over_limit: w.over_limit, daily_limit_minutes: w.daily_limit_minutes, break_every_minutes: w.break_every_minutes, managed_by_parent: w.managed_by_parent,
  };
}

function TodayCard({ minutes, left, limit }: { minutes: number; left: number | null; limit: number }) {
  const { t } = useT();
  return (
    <div className="card pad wb-today">
      <div className="wb-today-num">{t("wb_n_min_today", minutes)}</div>
      {limit > 0 && left !== null && <div className="wb-today-left">{t("wb_n_min_left", left)}</div>}
      {limit === 0 && <div className="muted" style={{ fontSize: 13 }}>{t("wb_no_daily_limit")}</div>}
    </div>
  );
}

// ---- /settings/screen-time -----------------------------------------------------------------------

export function ScreenTimePage() {
  const { t } = useT();
  const me = useWbMe();
  const { data: wb, setData: setWb, state, err } = useLoad(fetchWellbeing, [me?.id]);
  const [busy, setBusy] = useState(false);

  // The tracker's pings keep the minutes here current.
  useEffect(() => subscribeTodayStatus((s) => {
    if (s) setWb((w) => (w ? { ...w, ...s } : w));
  }), [setWb]);

  if (!me) return <Shell titleKey="wb_screen_time"><SignInCard from="/settings/screen-time" /></Shell>;
  if (state === "loading") return <Shell titleKey="wb_screen_time"><Loading /></Shell>;
  if (state === "soon") return <Shell titleKey="wb_screen_time"><ComingSoon /></Shell>;
  if (state === "error" || !wb) return <Shell titleKey="wb_screen_time"><Notice error>{err}</Notice></Shell>;

  const managed = wb.managed_by_parent;

  async function save(limit: number, brk: number, start: Record<string, string> = {}) {
    if (!wb) return;
    setBusy(true);
    const r = await withPasscode((extra) => saveScreenTime({ daily_limit_minutes: limit, break_every_minutes: brk, ...extra }),
      { newKey: "passcode", currentKey: "current_passcode" }, start);
    setBusy(false);
    if (r) { setWb(r); publishTodayStatus(todayFrom(r)); }
    return r;
  }

  async function changePasscode() {
    if (!wb) return;
    const start: Record<string, string> = {};
    if (wb.has_passcode) {
      const cur = await askPasscode({ message: t("wb_type_current_passcode") });
      if (!cur) return;
      start.current_passcode = cur;
    }
    const next = await askPasscode({ message: t("wb_choose_new_passcode"), confirm: true });
    if (!next) return;
    start.passcode = next;
    const r = await save(wb.daily_limit_minutes, wb.break_every_minutes, start);
    if (r) showGoldAlert(t("wb_passcode_saved"));
  }

  return (
    <Shell titleKey="wb_screen_time">
      {managed && <ManagedBanner username={wb.parent?.username} />}
      <TodayCard minutes={wb.today_minutes} left={wb.minutes_left} limit={wb.daily_limit_minutes} />
      <WbSection title={t("wb_daily_limit")} help={t("wb_daily_limit_help")}>
        <WbChips options={wb.limit_options} value={wb.daily_limit_minutes} disabled={managed || busy}
          onPick={(v) => void save(v, wb.break_every_minutes)} />
      </WbSection>
      <WbSection title={t("wb_break_reminders")} help={t("wb_break_help")}>
        <WbChips options={wb.break_options} value={wb.break_every_minutes} disabled={managed || busy}
          onPick={(v) => void save(wb.daily_limit_minutes, v)} />
      </WbSection>
      {!managed && (
        <button className="card pad cm-row-btn wb-row-btn" onClick={() => void changePasscode()} disabled={busy}>
          <span>🔑 {wb.has_passcode ? t("wb_change_passcode") : t("wb_set_passcode")}</span><span aria-hidden>›</span>
        </button>
      )}
      <Link to="/settings/restricted-mode" className="card pad cm-row-btn wb-row-btn">
        <span>🛡️ {t("wb_restricted_mode")} · {wb.restricted_mode ? t("wb_on") : t("wb_off")}</span><span aria-hidden>›</span>
      </Link>
      <Link to="/settings/family-pairing" className="card pad cm-row-btn wb-row-btn">
        <span>👨‍👧 {t("wb_family_pairing")}</span><span aria-hidden>›</span>
      </Link>
    </Shell>
  );
}

// ---- /settings/restricted-mode -------------------------------------------------------------------

export function RestrictedModePage() {
  const { t } = useT();
  const me = useWbMe();
  const { data: wb, setData: setWb, state, err } = useLoad(fetchWellbeing, [me?.id]);
  const [busy, setBusy] = useState(false);

  if (!me) return <Shell titleKey="wb_restricted_mode"><SignInCard from="/settings/restricted-mode" /></Shell>;
  if (state === "loading") return <Shell titleKey="wb_restricted_mode"><Loading /></Shell>;
  if (state === "soon") return <Shell titleKey="wb_restricted_mode"><ComingSoon /></Shell>;
  if (state === "error" || !wb) return <Shell titleKey="wb_restricted_mode"><Notice error>{err}</Notice></Shell>;
  const managed = wb.managed_by_parent;

  async function toggle(on: boolean) {
    setBusy(true);
    const r = await withPasscode((extra) => setRestrictedMode(on, extra.passcode), { currentKey: "passcode", currentMessage: t("wb_passcode_to_turn_off") });
    setBusy(false);
    if (r) {
      setWb(r);
      // The server filters every feed; the queue the video page steps through is dropped so the
      // next feed loaded is the filtered (or unfiltered) one.
      setFeed([]);
    }
  }

  return (
    <Shell titleKey="wb_restricted_mode">
      {managed && <ManagedBanner username={wb.parent?.username} />}
      <div className="card">
        <label className="row cm-switch-row" style={{ cursor: managed ? "default" : "pointer" }}>
          <div style={{ flex: 1 }}>
            <div>🛡️ {t("wb_restricted_mode")}</div>
            <div className="muted" style={{ fontSize: 13, fontWeight: 400, marginTop: 4 }}>{t("wb_restricted_line")}</div>
          </div>
          <input type="checkbox" className="switch" checked={wb.restricted_mode} disabled={managed || busy}
            aria-label={t("wb_restricted_mode")} onChange={(e) => void toggle(e.target.checked)} />
        </label>
      </div>
      {wb.has_passcode && !managed && <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>{t("wb_restricted_passcode_note")}</p>}
    </Shell>
  );
}

// ---- /settings/family-pairing --------------------------------------------------------------------

export function FamilyPairingPage() {
  const me = useWbMe();
  const { data, state, err, reload } = useLoad(familyStatus, [me?.id]);
  const [pick, setPick] = useState<"parent" | "teen" | null>(null);

  // Refresh on coming back to the tab (the web's "pull to refresh").
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") void reload(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [reload]);

  if (!me) return <Shell titleKey="wb_family_pairing"><SignInCard from="/settings/family-pairing" /></Shell>;
  if (state === "loading") return <Shell titleKey="wb_family_pairing"><Loading /></Shell>;
  if (state === "soon") return <Shell titleKey="wb_family_pairing"><ComingSoon /></Shell>;
  if (state === "error" || !data) return <Shell titleKey="wb_family_pairing"><Notice error>{err}</Notice></Shell>;

  const role = data.role === "none" ? pick ?? "none" : data.role;
  return (
    <Shell titleKey="wb_family_pairing">
      {role === "none" && <RolePicker onPick={setPick} />}
      {role === "parent" && <ParentView status={data} reload={reload} onBack={data.role === "none" ? () => setPick(null) : undefined} />}
      {role === "teen" && data.role === "none" && <TeenJoin onLinked={reload} onBack={() => setPick(null)} />}
      {role === "teen" && data.role === "teen" && <TeenLinked status={data} reload={reload} />}
    </Shell>
  );
}

function RolePicker({ onPick }: { onPick: (r: "parent" | "teen") => void }) {
  const { t } = useT();
  return (
    <>
      <p className="soft wb-intro">{t("wb_family_intro_1")}</p>
      <p className="muted wb-intro" style={{ fontSize: 14 }}>{t("wb_family_intro_2")}</p>
      <div className="wb-roles">
        <button className="wb-role" onClick={() => onPick("parent")}>
          <span className="wb-role-icon" aria-hidden>👨‍👩‍👧</span>
          <span className="wb-role-title">{t("wb_im_a_parent")}</span>
          <span className="wb-role-text">{t("wb_im_a_parent_text")}</span>
        </button>
        <button className="wb-role" onClick={() => onPick("teen")}>
          <span className="wb-role-icon" aria-hidden>🧑</span>
          <span className="wb-role-title">{t("wb_im_a_teen")}</span>
          <span className="wb-role-text">{t("wb_im_a_teen_text")}</span>
        </button>
      </div>
    </>
  );
}

function useCountdown(expiresAt: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const iv = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(iv);
  }, [expiresAt]);
  return expiresAt ? Math.max(0, Math.floor((parseUtc(expiresAt) - now) / 1000)) : 0;
}

function CodeCard({ code, onExpired }: { code: FamilyCode; onExpired: () => void }) {
  const { t } = useT();
  const left = useCountdown(code.expires_at);
  useEffect(() => { if (left === 0) onExpired(); }, [left === 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  return (
    <div className="card pad wb-code-card">
      <div className="wb-code" aria-label={code.code.split("").join(" ")}>{code.code}</div>
      <QrCode text={code.qr_text} size={200} />
      <div className="wb-countdown">{t("wb_ends_in", `${mm}:${ss}`)}</div>
      <p className="soft" style={{ fontSize: 14, margin: "6px 0 0" }}>{t("wb_on_teens_phone")}</p>
    </div>
  );
}

function teenLine(t: T, c: Pick<TeenCard, "today_minutes" | "settings">): string {
  return c.settings.daily_limit_minutes
    ? t("wb_n_of_limit", c.today_minutes, c.settings.daily_limit_minutes)
    : `${t("wb_n_min_today", c.today_minutes)} · ${t("wb_no_limit")}`;
}

function ParentView({ status, reload, onBack }: { status: FamilyStatus; reload: () => Promise<void>; onBack?: () => void }) {
  const { t } = useT();
  const [code, setCode] = useState<FamilyCode | null>(status.active_code);
  const [busy, setBusy] = useState(false);

  async function newCode() {
    setBusy(true);
    try { setCode(await familyCreateCode()); }
    catch (e) { setCode(null); showGoldAlert((e as WellbeingError).code === "not_ready" ? t("wb_coming_soon") : (e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <>
      {code ? <CodeCard code={code} onExpired={() => void newCode()} /> : (
        <div className="card pad center wb-section">
          <p className="soft" style={{ marginTop: 0 }}>{t("wb_link_a_teen_text")}</p>
          <button className="btn gold" disabled={busy} onClick={() => void newCode()}>{t("wb_link_a_teen")}</button>
        </div>
      )}
      <div className="cm-label" style={{ marginTop: 18 }}>{t("wb_linked_teens")}</div>
      {status.teens.length === 0 ? <p className="muted">{t("wb_no_teens_yet")}</p> : (
        <div className="cm-list">
          {status.teens.map((c) => (
            <Link key={c.user.id} to={`/settings/family-pairing/teen/${c.user.id}`} className="card cm-person wb-teen-row" style={{ color: "inherit" }}>
              <Avatar user={c.user} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="cm-name">@{c.user.username || displayName(c.user)}</div>
                <div className="muted" style={{ fontSize: 13 }}>{teenLine(t, c)}</div>
                {c.unlink_requested && <div className="wb-tag">{t("wb_asks_to_unlink")}</div>}
              </div>
              <span className="cm-gold" aria-hidden>›</span>
            </Link>
          ))}
        </div>
      )}
      <div className="wb-actions">
        <button className="btn ghost small" onClick={() => void reload()}>↻ {t("wb_refresh")}</button>
        {onBack && <button className="btn ghost small" onClick={onBack}>{t("back")}</button>}
      </div>
    </>
  );
}

function TeenJoin({ onLinked, onBack }: { onLinked: () => Promise<void>; onBack: () => void }) {
  const { t } = useT();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const clean = (v: string) => v.toUpperCase().replace(/^BBFAMILY:/, "").replace(/[^A-Z0-9]/g, "").slice(0, 6);

  async function link() {
    if (code.length !== 6) { showGoldAlert(t("wb_code_6")); return; }
    setBusy(true);
    try {
      const parent = await familyJoin(code);
      showGoldAlert(t("wb_linked_to", parent?.username ? `@${parent.username}` : displayName(parent)));
      setFeed([]); // Restricted Mode is switched on at linking
      await onLinked();
    } catch (e) {
      showGoldAlert((e as WellbeingError).code === "not_ready" ? t("wb_coming_soon") : (e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <div className="card pad wb-section">
      <div className="cm-label">{t("wb_type_parents_code")}</div>
      <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>{t("wb_teen_join_help")}</p>
      <form onSubmit={(e) => { e.preventDefault(); void link(); }}>
        <input className="input wb-code-input" value={code} onChange={(e) => setCode(clean(e.target.value))} placeholder="K7M2QX"
          autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={15} aria-label={t("wb_type_parents_code")} />
        <div className="wb-actions">
          <button type="button" className="btn ghost" onClick={onBack}>{t("back")}</button>
          <button type="submit" className="btn gold" disabled={busy}>{t("wb_link")}</button>
        </div>
      </form>
    </div>
  );
}

function audienceLabel(t: T, a: Audience): string {
  return a === "friends" ? t("wb_friends") : a === "nobody" ? t("wb_nobody") : t("wb_everyone");
}

function TeenLinked({ status, reload }: { status: FamilyStatus; reload: () => Promise<void> }) {
  const { t } = useT();
  const s = status.my_settings;
  const [busy, setBusy] = useState(false);
  const p = status.parent;

  async function ask() {
    const yes = await showGoldConfirm({ message: t("wb_ask_unlink_confirm"), confirmLabel: t("wb_ask_to_unlink"), cancelLabel: t("cancel") });
    if (!yes) return;
    setBusy(true);
    try { await familyRequestUnlink(); await reload(); }
    catch (e) { showGoldAlert((e as Error).message); }
    finally { setBusy(false); }
  }

  const rows: [string, string][] = s ? [
    [t("wb_daily_limit"), minutesLabel(t, s.daily_limit_minutes)],
    [t("wb_break_reminders"), minutesLabel(t, s.break_every_minutes)],
    [t("wb_restricted_mode"), s.restricted_mode ? t("wb_on") : t("wb_off")],
    [t("wb_who_can_message"), audienceLabel(t, s.who_can_message)],
    [t("wb_who_can_comment"), audienceLabel(t, s.who_can_comment)],
  ] : [];

  return (
    <>
      <div className="card pad wb-linked">
        <Avatar user={p} size="lg" />
        <div>
          <div className="wb-linked-title">{t("wb_linked_to", p?.username ? `@${p.username}` : displayName(p))}</div>
          <div className="muted" style={{ fontSize: 13 }}>{t("wb_parent_sets_these")}</div>
        </div>
      </div>
      {s && <TodayCard minutes={s.today_minutes} left={s.minutes_left} limit={s.daily_limit_minutes} />}
      <div className="card wb-readonly">
        {rows.map(([k, v]) => (
          <div key={k} className="wb-ro-row"><span>{k}</span><b>{v}</b></div>
        ))}
      </div>
      {status.unlink_requested
        ? <div className="wb-banner" role="status">⏳ {t("wb_waiting_for_parent")}</div>
        : <button className="btn block" style={{ marginTop: 14 }} disabled={busy} onClick={() => void ask()}>{t("wb_ask_to_unlink")}</button>}
    </>
  );
}

// ---- /settings/family-pairing/teen/:id -----------------------------------------------------------

export function FamilyTeenPage() {
  const { t } = useT();
  const { id } = useParams();
  const navigate = useNavigate();
  const me = useWbMe();
  const teenId = Number(id);
  const { data, setData, state, err, reload } = useLoad(familyStatus, [me?.id]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") void reload(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [reload]);

  if (!me) return <Shell titleKey="wb_family_pairing"><SignInCard from={`/settings/family-pairing/teen/${id}`} /></Shell>;
  if (state === "loading") return <Shell titleKey="wb_family_pairing"><Loading /></Shell>;
  if (state === "soon") return <Shell titleKey="wb_family_pairing"><ComingSoon /></Shell>;
  if (state === "error" || !data) return <Shell titleKey="wb_family_pairing"><Notice error>{err}</Notice></Shell>;
  const card = data.teens.find((c) => c.user.id === teenId);
  if (!card) {
    return (
      <Shell titleKey="wb_family_pairing">
        <div className="card pad center"><p className="cm-gold">{t("wb_teen_not_linked")}</p><Link className="btn gold" to="/settings/family-pairing">{t("wb_family_pairing")}</Link></div>
      </Shell>
    );
  }
  const s = card.settings;

  const put = (c: TeenCard) => setData((d) => (d ? { ...d, teens: d.teens.map((x) => (x.user.id === c.user.id ? c : x)) } : d));

  async function change(changes: Record<string, unknown>, start: Record<string, string> = {}) {
    setBusy(true);
    const r = await withPasscode((extra) => familySetTeenSettings(teenId, { ...changes, ...extra }),
      { newKey: "passcode", newMessage: t("wb_choose_parent_passcode") }, start);
    setBusy(false);
    if (r) put(r);
    return r;
  }

  async function setPass() {
    const p = await askPasscode({ message: t("wb_choose_parent_passcode"), confirm: true });
    if (!p) return;
    const r = await change({}, { passcode: p });
    if (r) showGoldAlert(t("wb_passcode_saved"));
  }

  async function moreTime(m: number) {
    const r = await change({ extra_minutes_today: m });
    if (r) showGoldAlert(t("wb_added_n_min", m));
  }

  async function unlink() {
    const yes = await showGoldConfirm({ message: t("wb_unlink_confirm", `@${card?.user.username ?? ""}`), confirmLabel: t("wb_unlink"), cancelLabel: t("cancel"), danger: true });
    if (!yes) return;
    setBusy(true);
    try { await familyUnlink(teenId); navigate("/settings/family-pairing", { replace: true }); }
    catch (e) { showGoldAlert((e as Error).message); }
    finally { setBusy(false); }
  }

  async function keep() {
    setBusy(true);
    try { await familyUnlink(teenId, true); await reload(); }
    catch (e) { showGoldAlert((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <Shell titleKey="wb_family_pairing">
      <div className="card pad wb-linked">
        <Avatar user={card.user} size="lg" />
        <div>
          <div className="wb-linked-title">@{card.user.username || displayName(card.user as UserSummary)}</div>
          <div className="muted" style={{ fontSize: 13 }}>{displayName(card.user)}</div>
        </div>
      </div>
      {card.unlink_requested && (
        <div className="wb-banner wb-banner-actions" role="status">
          <div>{t("wb_teen_asks_unlink", `@${card.user.username ?? ""}`)}</div>
          <div className="wb-actions">
            <button className="btn small" disabled={busy} onClick={() => void unlink()}>{t("wb_unlink")}</button>
            <button className="btn gold small" disabled={busy} onClick={() => void keep()}>{t("wb_keep")}</button>
          </div>
        </div>
      )}
      <TodayCard minutes={card.today_minutes} left={card.minutes_left} limit={s.daily_limit_minutes} />
      <WbSection title={t("wb_daily_limit")} help={t("wb_teen_limit_help")}>
        <WbChips options={[0, 30, 45, 60, 90, 120]} value={s.daily_limit_minutes} disabled={busy} onPick={(v) => void change({ daily_limit_minutes: v })} />
      </WbSection>
      <WbSection title={t("wb_break_reminders")}>
        <WbChips options={[0, 10, 20, 30, 60]} value={s.break_every_minutes} disabled={busy} onPick={(v) => void change({ break_every_minutes: v })} />
      </WbSection>
      <button className="card pad cm-row-btn wb-row-btn" disabled={busy} onClick={() => void setPass()}>
        <span>🔑 {s.has_passcode ? t("wb_change_passcode") : t("wb_set_passcode")}</span><span aria-hidden>›</span>
      </button>
      <div className="card" style={{ marginBottom: 12 }}>
        <label className="row cm-switch-row">
          <div style={{ flex: 1 }}>
            <div>🛡️ {t("wb_restricted_mode")}</div>
            <div className="muted" style={{ fontSize: 13, fontWeight: 400, marginTop: 4 }}>{t("wb_restricted_line")}</div>
          </div>
          <input type="checkbox" className="switch" checked={s.restricted_mode} disabled={busy} aria-label={t("wb_restricted_mode")}
            onChange={(e) => void change({ restricted_mode: e.target.checked ? 1 : 0 })} />
        </label>
      </div>
      <WbSection title={t("wb_who_can_message")}>
        <AudienceChips value={s.who_can_message} disabled={busy} onPick={(v) => void change({ who_can_message: v })} />
      </WbSection>
      <WbSection title={t("wb_who_can_comment")}>
        <AudienceChips value={s.who_can_comment} disabled={busy} onPick={(v) => void change({ who_can_comment: v })} />
      </WbSection>
      <WbSection title={t("wb_give_more_time")} help={t("wb_give_more_time_help")}>
        <div className="cm-chips wb-chips">
          {[15, 30, 60].map((m) => <button key={m} className="cm-chip" disabled={busy} onClick={() => void moreTime(m)}>+{t("wb_n_min", m)}</button>)}
        </div>
      </WbSection>
      <div className="wb-actions">
        <button className="btn ghost small" onClick={() => void reload()}>↻ {t("wb_refresh")}</button>
      </div>
      <button className="btn block wb-unlink" disabled={busy} onClick={() => void unlink()}>{t("wb_unlink")}</button>
    </Shell>
  );
}
