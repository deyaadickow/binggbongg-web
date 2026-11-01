// Country Battle home + the Country Battle Board (Steve, 2026-11-01).
//
// "The country battle will start first Monday of each month until sunday. only once a month for
// each country." Monday to Friday 3 rounds of 5 minutes at 8 PM Philippine time; the 12 with the
// most points battle Saturday; the top 6 have the showdown Sunday with 5 rounds of 5 minutes.
// "The entire battle for that week will be in a lifetime battle bord for Bragging Rites".
//
// /country-battle            this month's battle for the member's country
// /country-battle/board      every finished battle, newest first
// /country-battle/board/:id  one battle's full results
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { PageTitle } from "../components/PageTitle";
import { Loading, Notice } from "../components/Common";
import { CbPersonRow, CountryBattleParticipants, CountryBattleParticipantsModal, PlacePill, BullseyeIcon } from "../components/CountryBattleBits";
import { useSession } from "../lib/session";
import { useT, type StringKey } from "../lib/i18n";
import {
  cbText, clock, dayTimeline, fetchCountryBattleBoard, fetchCountryBattleStatus, flag, reasonText, roundsText,
  serverNow, stageText, useTick,
  type CbBattle, type CbBoardRow, type CbDay, type CbStatus,
} from "../lib/countryBattle";

/** Today's day, else the next one still to come, else the last. */
function focusDay(b: CbBattle, now: number): CbDay | null {
  if (b.today) return b.days.find((d) => d.id === b.today!.id) ?? b.today;
  return b.days.find((d) => Date.parse(d.ends_at) > now) ?? b.days[b.days.length - 1] ?? null;
}

const localTime = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
};
const localDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

/** The phase line under a day: "Starts in 4:10", "Round 2 of 3 · 3:12 left", "Next round in 0:45". */
export function usePhaseLine(day: CbDay | null, now: number, serverPhase?: CbDay["phase"] | null, roundEndsAt?: string | null) {
  const { t } = useT();
  if (!day) return { phase: null as CbDay["phase"] | null, line: "", sub: "", round: 0, clockText: "" };
  const tl = dayTimeline(day, now, serverPhase, roundEndsAt);
  const left = tl.target != null ? clock(tl.target - now) : "";
  switch (tl.phase) {
    case "upcoming":
      return { phase: tl.phase, line: cbText(t("cb_starts_in"), { time: left }), sub: cbText(t("cb_starts_at"), { time: localTime(day.starts_at) }), round: 0, clockText: left };
    case "lobby":
      return { phase: tl.phase, line: cbText(t("cb_starts_in"), { time: left }), sub: t("cb_lobby"), round: 0, clockText: left };
    case "round":
      return { phase: tl.phase, line: cbText(t("cb_time_left"), { time: left }), sub: cbText(t("cb_round"), { n: tl.round, total: day.rounds }), round: tl.round, clockText: left };
    case "break":
      return { phase: tl.phase, line: cbText(t("cb_next_round"), { time: left }), sub: t("cb_break"), round: tl.round, clockText: left };
    default:
      return { phase: tl.phase, line: t("cb_ended_today"), sub: "", round: tl.round, clockText: "" };
  }
}

export function TestBanner() {
  const { t } = useT();
  return <div className="cb-test">🧪 {t("cb_test")}</div>;
}

export function CountryBattlePage() {
  const { t } = useT();
  const { user, isLoggedIn } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const uid = user?.id ?? 0;
  const [status, setStatus] = useState<CbStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPeople, setShowPeople] = useState(false);
  const now = useTick();

  const load = useCallback(() => {
    fetchCountryBattleStatus(uid)
      .then((s) => { setStatus(s); setError(null); })
      .catch((e) => setError((e as Error).message));
  }, [uid]);
  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);

  const battle = status?.battle ?? null;
  const day = battle ? focusDay(battle, now) : null;
  const pl = usePhaseLine(day, now, day?.phase);
  // Refetch the moment the phase turns (lobby opens, a round ends) rather than up to 30 s late.
  const lastPhase = useRef<string | null>(null);
  useEffect(() => {
    const key = `${day?.id}:${pl.phase}`;
    if (lastPhase.current && lastPhase.current !== key) load();
    lastPhase.current = key;
  }, [day?.id, pl.phase, load]);

  if (error && !status) return <div className="page cb-page"><PageTitle>{t("cb_title")}</PageTitle><Notice error>{error}</Notice></div>;
  if (!status) return <div className="page cb-page"><PageTitle>{t("cb_title")}</PageTitle><Loading /></div>;

  if (!status.enabled || !battle) {
    return (
      <div className="page cb-page" style={{ maxWidth: 760 }}>
        <PageTitle>{t("cb_title")}</PageTitle>
        <div className="card pad" style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontSize: 40 }} aria-hidden>🌏</span>
          <b style={{ color: "var(--gold)" }}>{t("cb_none")}</b>
          {status.enabled && <span style={{ color: "rgba(255,255,255,.85)", fontSize: 14 }}>{t("cb_explain")}</span>}
          {status.enabled && <Link to="/country-battle/board" className="btn">{t("cb_board")}</Link>}
        </div>
      </div>
    );
  }

  const me = battle.me ?? null;
  const country = battle.country || status.country || "";
  const revealed = flag(battle.scores_revealed);
  const open = pl.phase === "lobby" || pl.phase === "round" || pl.phase === "break";
  const watchable = open && !!day;
  const joinReason = !isLoggedIn
    ? t("cb_signin")
    : me && !me.eligible
      ? reasonText(t, me.reason, country) || cbText(t("cb_not_country"), { country })
      : !open && pl.phase !== "ended" ? t("cb_not_open") : "";
  const canJoin = isLoggedIn && !!me?.eligible && open && !!day;
  const played = new Set(me?.played_days ?? []);
  const nowMs = serverNow();
  // The server says which day is today; failing that, the day whose start falls on today's date here.
  const todayId = battle.today?.id
    ?? battle.days.find((d) => new Date(d.starts_at).toDateString() === new Date(nowMs).toDateString())?.id;

  return (
    <div className="page cb-page" style={{ maxWidth: 760 }}>
      <PageTitle>{t("cb_title")}</PageTitle>
      {flag(battle.is_test) && <TestBanner />}

      <div className="card pad" style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: "var(--text-soft)", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>
          {country}{battle.month_label ? ` · ${battle.month_label}` : ""}
        </span>
        <b style={{ color: "#FFD84D", fontSize: 20 }}>{t("cb_tagline")}</b>
      </div>

      {day && (
        <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12, borderColor: "var(--gold)" }}>
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <b style={{ color: "var(--gold)", fontSize: 18 }}>{stageText(t, day)}</b>
              <span style={{ fontSize: 13, color: "var(--text-soft)" }}>{roundsText(t, day)} · {cbText(t("cb_starts_at"), { time: localTime(day.starts_at) })}</span>
            </div>
            <span className="spacer" />
            {day.live_count != null && open && <span className="pill live" style={{ whiteSpace: "nowrap", flex: "0 0 auto" }}>● {cbText(t("cb_live_count"), { n: day.live_count })}</span>}
          </div>
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            {pl.sub && <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{pl.sub}</div>}
            <div style={{ color: "var(--gold)", fontWeight: 800, fontSize: 26, fontVariantNumeric: "tabular-nums" }}>{pl.line}</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn gold" style={{ flex: "1 1 160px" }} disabled={isLoggedIn && !canJoin}
              onClick={() => {
                if (!isLoggedIn) { navigate("/login", { state: { from: location.pathname } }); return; }
                if (canJoin) navigate(`/country-battle/live/${day.id}?join=1`);
              }}>
              🔴 {t("cb_join")}
            </button>
            <button className="btn" style={{ flex: "1 1 160px" }} disabled={!watchable}
              onClick={() => navigate(`/country-battle/live/${day.id}`)}>
              👀 {t("cb_watch")}
            </button>
          </div>
          {joinReason && !canJoin && <div className="muted" style={{ textAlign: "center", fontSize: 13 }}>{joinReason}</div>}
        </div>
      )}

      {me && (
        <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12, textAlign: "center" }}>
          <b style={{ color: "var(--gold)" }}>{cbText(t("cb_my_today"), { n: (me.today_score ?? 0).toLocaleString() })}</b>
          <span>{cbText(t("cb_my_week"), { n: (me.week_total ?? 0).toLocaleString() })}</span>
          {me.saturday_score != null && <span>{t("cb_sat")}: <b style={{ color: "var(--gold)" }}>{me.saturday_score.toLocaleString()}</b></span>}
          {me.sunday_score != null && <span>{t("cb_sun")}: <b style={{ color: "var(--gold)" }}>{me.sunday_score.toLocaleString()}</b></span>}
          {me.place ? <span style={{ marginTop: 4 }}><PlacePill place={me.place} /></span> : null}
        </div>
      )}

      {!revealed && <div className="notice" style={{ textAlign: "center", marginBottom: 12 }}>🤫 {t("cb_secret")}</div>}

      <div className="card pad" style={{ marginBottom: 12 }}>
        <b style={{ color: "var(--gold)", display: "block", marginBottom: 10 }}>{t("cb_this_week")}</b>
        <div className="cb-week">
          {battle.days.map((d) => {
            const isToday = d.id === todayId;
            const done = Date.parse(d.ends_at) < nowMs;
            return (
              <div key={d.id} className={`cb-day${isToday ? " today" : ""}${done ? " done" : ""}`}>
                <span className="cb-dname">{t(`cb_d${d.day_index}` as StringKey)}<br />
                  <span style={{ fontSize: 11, color: "var(--text-soft)", fontWeight: 500 }}>{localDate(d.starts_at)}</span></span>
                <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <span className="cb-dstage">{stageText(t, d)}</span>
                  <span className="cb-drounds">{roundsText(t, d)} · {localTime(d.starts_at)}</span>
                </span>
                <span style={{ color: "var(--gold)", fontWeight: 800 }}>
                  {played.has(d.day_index) ? <span title={t("cb_played")}>✓</span> : isToday ? t("today") : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {revealed && (battle.champions?.length ?? 0) > 0 && (
        <div className="card pad" style={{ marginBottom: 12 }}>
          <b style={{ color: "var(--gold)", display: "block", marginBottom: 10 }}>🏆 {t("cb_champions")}</b>
          <div className="cb-people">
            {[...battle.champions!].sort((a, b) => a.place - b.place).map((c) => <CbPersonRow key={c.user_id} p={c} place={c.place} num={c.sunday_score} />)}
          </div>
        </div>
      )}
      {revealed && (battle.sunday_6?.length ?? 0) > 0 && (
        <div className="card pad" style={{ marginBottom: 12 }}>
          <b style={{ color: "var(--gold)", display: "block", marginBottom: 10 }}>{t("cb_top6")}</b>
          <div className="cb-people">
            {battle.sunday_6!.map((p, i) => <CbPersonRow key={p.user_id} p={p} place={i + 1} num={p.saturday_score} />)}
          </div>
        </div>
      )}
      {revealed && (battle.saturday_12?.length ?? 0) > 0 && (
        <div className="card pad" style={{ marginBottom: 12 }}>
          <b style={{ color: "var(--gold)", display: "block", marginBottom: 10 }}>{t("cb_top12")}</b>
          <div className="cb-people">
            {battle.saturday_12!.map((p, i) => <CbPersonRow key={p.user_id} p={p} place={i + 1} num={p.week_total} />)}
          </div>
        </div>
      )}

      <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        <span style={{ color: "rgba(255,255,255,.88)", fontSize: 14 }}>{t("cb_explain")}</span>
        <b style={{ color: "var(--gold)", fontSize: 14 }}>{t("cb_how_score")}</b>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn" style={{ flex: "1 1 200px" }} onClick={() => setShowPeople(true)}>
          <BullseyeIcon /> {t("cb_participants")}
        </button>
        <Link to="/country-battle/board" className="btn" style={{ flex: "1 1 200px" }}>🥇 {t("cb_board")}</Link>
      </div>
      {showPeople && (
        <CountryBattleParticipantsModal battleId={battle.id} profileUserId={uid || undefined}
          title={`${country}${battle.month_label ? ` · ${battle.month_label}` : ""}`} onClose={() => setShowPeople(false)} />
      )}
    </div>
  );
}

export function CountryBattleBoardPage() {
  const { t } = useT();
  const { user } = useSession();
  const [rows, setRows] = useState<CbBoardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetchCountryBattleBoard(user?.id ?? 0)
      .then((r) => { if (live) setRows(r); })
      .catch((e) => { if (live) setError((e as Error).message); });
    return () => { live = false; };
  }, [user?.id]);
  return (
    <div className="page cb-page" style={{ maxWidth: 760 }}>
      <PageTitle>{t("cb_board")}</PageTitle>
      {error && <Notice error>{error}</Notice>}
      {!rows && !error && <Loading />}
      {rows && rows.length === 0 && <div className="card pad" style={{ textAlign: "center" }}><span className="muted">{t("cb_board_empty")}</span></div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows?.map((r) => (
          <Link key={r.battle_id} to={`/country-battle/board/${r.battle_id}`} state={{ row: r }} className="card pad"
            style={{ color: "inherit", display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="row">
              <b style={{ color: "var(--gold)", fontSize: 16 }}>{r.country}{r.month_label ? ` · ${r.month_label}` : ""}</b>
              <span className="spacer" />
              {r.participants != null && <span className="pill">{cbText(t("cb_participants_count"), { n: r.participants })}</span>}
            </div>
            <div className="cb-people">
              {[...(r.champions ?? [])].sort((a, b) => a.place - b.place).slice(0, 3).map((c) => (
                <div key={c.user_id} className="cb-person">
                  <PlacePill place={c.place} />
                  <b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name || c.username}</b>
                  {c.sunday_score != null && <span className="cb-num">{c.sunday_score.toLocaleString()}</span>}
                </div>
              ))}
            </div>
            <span style={{ color: "var(--gold)", fontSize: 13, textAlign: "right" }}>›</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function CountryBattleResultsPage() {
  const { t } = useT();
  const { id } = useParams();
  const location = useLocation();
  const { user } = useSession();
  const battleId = Number(id);
  const [row, setRow] = useState<CbBoardRow | null>((location.state as { row?: CbBoardRow } | null)?.row ?? null);
  useEffect(() => {
    if (row && row.battle_id === battleId) return;
    let live = true;
    fetchCountryBattleBoard(user?.id ?? 0)
      .then((rows) => { if (live) setRow(rows.find((r) => r.battle_id === battleId) ?? null); })
      .catch(() => undefined);
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleId, user?.id]);
  return (
    <div className="page cb-page" style={{ maxWidth: 760 }}>
      <PageTitle>{row ? `${row.country}${row.month_label ? ` · ${row.month_label}` : ""}` : t("cb_board")}</PageTitle>
      {row && (row.champions?.length ?? 0) > 0 && (
        <div className="card pad" style={{ marginBottom: 12 }}>
          <b style={{ color: "var(--gold)", display: "block", marginBottom: 10 }}>🏆 {t("cb_champions")}</b>
          <div className="cb-people">
            {[...row.champions!].sort((a, b) => a.place - b.place).map((c) => <CbPersonRow key={c.user_id} p={c} place={c.place} num={c.sunday_score} />)}
          </div>
        </div>
      )}
      {row && (row.sunday_6?.length ?? 0) > 0 && (
        <div className="card pad" style={{ marginBottom: 12 }}>
          <b style={{ color: "var(--gold)", display: "block", marginBottom: 10 }}>{t("cb_top6")}</b>
          <div className="cb-people">{row.sunday_6!.map((p, i) => <CbPersonRow key={p.user_id} p={p} place={i + 1} num={p.saturday_score} />)}</div>
        </div>
      )}
      {row && (row.saturday_12?.length ?? 0) > 0 && (
        <div className="card pad" style={{ marginBottom: 12 }}>
          <b style={{ color: "var(--gold)", display: "block", marginBottom: 10 }}>{t("cb_top12")}</b>
          <div className="cb-people">{row.saturday_12!.map((p, i) => <CbPersonRow key={p.user_id} p={p} place={i + 1} num={p.week_total} />)}</div>
        </div>
      )}
      <div className="card pad">
        <b style={{ color: "var(--gold)", display: "block", marginBottom: 10 }}>{t("cb_participants")}</b>
        {Number.isFinite(battleId) && battleId > 0 ? <CountryBattleParticipants battleId={battleId} /> : <Loading />}
      </div>
    </div>
  );
}
