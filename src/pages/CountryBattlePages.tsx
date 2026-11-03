// The Country Battle page + the lifetime Bragging Rights board, v2 (Steve, 2026-11-03): "one 10
// minutes country battle once a day every day seven days a week, in Philippines it will be 8 pm.
// We will have a lifetime Bragging rights battle board, for every day, and we will show the top 100
// with the most score daily."
//
// /country-battle               today's battle (or the next) for the member's country
// /country-battle/board         every finished day, newest first
// /country-battle/board/:dayId  one day's top 100, with your own rank
//
// Every time comes from the server (fetchCountryBattleDaily) — nothing is scheduled here.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { PageTitle } from "../components/PageTitle";
import { Loading, Notice } from "../components/Common";
import { TestBanner } from "../components/BattleGrid";
import { CbPersonRow, CountryBattleReminderToggle, PlacePill } from "../components/CountryBattleBits";
import { useSession } from "../lib/session";
import { fetchFeatureVideos } from "../lib/featureVideos";
import { FeatureVideoPlayer } from "../components/FeatureVideoPlayer";
import { translate, useT } from "../lib/i18n";
import {
  badgeCountsText, cbReasonText, cbText, clock, countryBattlePath, fetchCountryBattleDaily, fetchCountryBattleDays,
  fetchCountryBattleDayTop, localTime, useTick,
  type CbBoardDay, type CbDaily, type CbDayState, type CbDayTop, type CbTopRow,
} from "../lib/countryBattle";

type T = ReturnType<typeof useT>["t"];

/** "Today at 8:00 PM your time", or "Wed, Nov 4 at 8:00 PM your time". */
function whenText(t: T, iso: string, now: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.toDateString() === new Date(now).toDateString()
    ? t("today")
    : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return cbText(t("cb2_when_your_time"), { day, time: localTime(iso) });
}

/** The big countdown on the page for each phase. */
function pagePhase(t: T, b: CbDayState, now: number): { sub: string; line: string } {
  const at = (iso: string | null) => (iso ? clock(Date.parse(iso) - now) : "");
  switch (b.phase) {
    case "upcoming": return { sub: cbText(t("cb2_room_opens_at"), { time: localTime(b.opens_at) }), line: cbText(t("cb_starts_in"), { time: at(b.starts_at) }) };
    case "joining": return { sub: t("cb2_go_live_join"), line: cbText(t("cb_starts_in"), { time: at(b.starts_at) }) };
    case "battle": return { sub: t("chb_battle_on"), line: cbText(t("cb_time_left"), { time: at(b.ends_at) }) };
    default: return { sub: "", line: t("cb_ended_today") };
  }
}

function TopThree({ rows }: { rows: CbTopRow[] }) {
  return (
    <div className="cb-people">
      {[...rows].sort((a, b) => a.place - b.place).map((r) => <CbPersonRow key={r.user_id} p={r} place={r.place} num={r.score} />)}
    </div>
  );
}

export function CountryBattlePage() {
  const { t } = useT();
  const { user, isLoggedIn } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const uid = user?.id ?? 0;
  const [daily, setDaily] = useState<CbDaily | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = useTick();

  const load = useCallback(() => {
    fetchCountryBattleDaily(uid)
      .then((d) => { setDaily(d); setError(null); })
      .catch((e) => setError((e as Error).message));
  }, [uid]);
  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);

  const battle = daily?.battle ?? null;
  // Refetch the moment the phase turns (the room opens, the battle starts or ends) rather than up
  // to 30 s late.
  const turnAt = battle?.phase_ends_at ? Date.parse(battle.phase_ends_at) : NaN;
  const turned = !Number.isNaN(turnAt) && now >= turnAt + 500;
  const lastTurn = useRef<number | null>(null);
  useEffect(() => {
    if (turned && lastTurn.current !== turnAt) { lastTurn.current = turnAt; load(); }
  }, [turned, turnAt, load]);

  // The directory tile shows to everyone while the switch is off (Steve, 2026-11-01: "we will
  // announce it with one of the feature with a video"), so OFF — or no answer at all — is the
  // explainer, not an error.
  if (error && !daily) return <CountryBattleExplainer note={t("cb_coming_soon")} />;
  if (!daily) return <div className="page cb-page"><PageTitle>{t("cb_title")}</PageTitle><Loading /></div>;
  if (!daily.enabled) return <CountryBattleExplainer note={t("cb_coming_soon")} />;

  const me = battle?.me;
  const country = battle?.country || daily.country || "";
  const pl = battle ? pagePhase(t, battle, now) : null;
  const rejoin = !!me?.is_battler && (me.left || !me.is_live);
  const reason = me && !me.can_join && me.join_reason !== "already_in" && battle?.phase !== "ended"
    ? battle?.phase === "upcoming" && me.join_reason === "not_open" ? "" : cbReasonText(t, me.join_reason, null, country)
    : "";
  const join = () => {
    if (!isLoggedIn) { navigate("/login", { state: { from: location.pathname } }); return; }
    if (battle && me?.can_join) navigate(countryBattlePath(battle.day_id, { join: true }));
  };
  const showNext = battle?.phase === "ended" && daily.next_starts_at && Date.parse(daily.next_starts_at) > now;
  const badgeText = badgeCountsText(daily.me?.badges);

  return (
    <div className="page cb-page" style={{ maxWidth: 760 }}>
      <PageTitle>{t("cb_title")}</PageTitle>
      {battle?.is_test && <TestBanner />}

      <div className="card pad" style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: "var(--text-soft)", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>{country}</span>
        <b style={{ color: "#FFD84D", fontSize: 20 }}>{t("cb2_tagline")}</b>
      </div>

      {battle && pl ? (
        <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12, borderColor: "var(--gold)" }}>
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <b style={{ color: "var(--gold)", fontSize: 18 }}>{battle.date_label}</b>
              <span style={{ fontSize: 13, color: "#fff" }}>🕗 {whenText(t, battle.starts_at, now)}</span>
              <span style={{ fontSize: 12, color: "var(--text-soft)" }}>{cbText(t("cb2_minutes"), { n: battle.duration_minutes ?? 10 })}</span>
            </div>
            <span className="spacer" />
            {battle.room_open && battle.phase !== "ended" && (
              <span className="pill live" style={{ whiteSpace: "nowrap", flex: "0 0 auto" }}>● {cbText(t("cb_live_count"), { n: battle.live_count })}</span>
            )}
          </div>
          <div style={{ textAlign: "center", padding: "6px 0" }}>
            {pl.sub && <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{pl.sub}</div>}
            <div style={{ color: "var(--gold)", fontWeight: 800, fontSize: 26, fontVariantNumeric: "tabular-nums" }}>{pl.line}</div>
            {showNext && <div className="muted" style={{ fontSize: 13 }}>{cbText(t("cb2_next_in"), { time: clock(Date.parse(daily.next_starts_at!) - now) })}</div>}
            {battle.room_open && (battle.phase === "joining" || battle.phase === "battle") && (
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{cbText(t("cb2_places_left"), { n: battle.spaces_left, total: battle.max_battlers })}</div>
            )}
          </div>
          {battle.phase !== "ended" && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(!isLoggedIn || me?.can_join) && (
                <button className="btn gold" style={{ flex: "1 1 160px" }} onClick={join}>🔴 {rejoin ? t("chb_rejoin") : t("cb_join")}</button>
              )}
              <button className="btn" style={{ flex: "1 1 160px" }} disabled={!battle.room_open}
                onClick={() => navigate(countryBattlePath(battle.day_id))}>
                👀 {t("cb_watch")}
              </button>
            </div>
          )}
          {battle.phase === "ended" && battle.finished && battle.top3.length > 0 && <TopThree rows={battle.top3} />}
          {reason && <div className="muted" style={{ textAlign: "center", fontSize: 13 }}>{reason}</div>}
        </div>
      ) : (
        <div className="notice" style={{ textAlign: "center", marginBottom: 12 }}>
          {t("cb2_none")}
          {daily.next_starts_at && <div style={{ marginTop: 4 }}>{cbText(t("cb2_next_in"), { time: clock(Date.parse(daily.next_starts_at) - now) })}</div>}
        </div>
      )}

      {me && me.is_battler && (
        <div className="card pad" style={{ textAlign: "center", marginBottom: 12 }}>
          <b style={{ color: "var(--gold)" }}>{cbText(t("cb_my_today"), { n: (me.score ?? 0).toLocaleString() })}</b>
          {me.rank ? <span className="muted"> · #{me.rank}</span> : null}
        </div>
      )}
      {badgeText && (
        <div className="card pad row" style={{ marginBottom: 12 }}>
          <b style={{ color: "var(--gold)", flex: 1 }}>{t("cb2_badges")}</b>
          <span style={{ fontSize: 16 }}>{badgeText}</span>
        </div>
      )}

      {daily.last && daily.last.day_id !== battle?.day_id && daily.last.top3.length > 0 && (
        <Link to={`/country-battle/board/${daily.last.day_id}`} className="card pad" style={{ display: "block", color: "inherit", marginBottom: 12 }}>
          <div className="row" style={{ marginBottom: 10 }}>
            <b style={{ color: "var(--gold)", flex: 1 }}>🏆 {cbText(t("cb2_last_battle"), { date: daily.last.date_label })}</b>
            <span className="pill">{cbText(t("cb_participants_count"), { n: daily.last.participants })}</span>
          </div>
          <TopThree rows={daily.last.top3} />
        </Link>
      )}

      {isLoggedIn && <CountryBattleReminderToggle initial={daily.me?.reminders_on ?? null} />}

      <Rules t={t} max={battle?.max_battlers} />

      <Link to="/country-battle/board" className="btn" style={{ display: "flex", justifyContent: "center" }}>🥇 {t("cb2_board")}</Link>
    </div>
  );
}

/** The new rules, in one card (also the explainer's). */
function Rules({ t, max }: { t: T; max?: number }) {
  return (
    <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
      <span style={{ color: "rgba(255,255,255,.88)", fontSize: 14 }}>{cbText(t("cb2_explain"), { n: max || 50 })}</span>
      <b style={{ color: "var(--gold)", fontSize: 14 }}>{t("cb2_how_score")}</b>
    </div>
  );
}

/** What Country Battle is, for while it is switched off: the announcement page. No Join or Watch —
 *  there is nothing to join. */
function CountryBattleExplainer({ note }: { note: string }) {
  const { t, lang } = useT();
  const [video, setVideo] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    let live = true;
    fetchFeatureVideos(lang).then((v) => { if (live) setVideo(v.country_battle ?? null); });
    return () => { live = false; };
  }, [lang]);
  // 8 PM in the Philippines (Asia/Manila is UTC+8 all year, no daylight saving) = 12:00 UTC, shown in
  // the member's own clock too. The server sends the real schedule once the switch is on.
  const d = new Date();
  const phUtc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0)).toISOString();
  return (
    <div className="page cb-page" style={{ maxWidth: 760 }}>
      <PageTitle>{t("cb_title")}</PageTitle>
      <div className="card pad" style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 40 }} aria-hidden>🌏</span>
        <b style={{ color: "#FFD84D", fontSize: 20 }}>{t("cb2_tagline")}</b>
        {video && (
          <button className="btn" style={{ alignSelf: "center" }} onClick={() => setPlaying(true)}>▶ {t("watch_video")}</button>
        )}
      </div>

      <div className="notice" style={{ textAlign: "center", marginBottom: 12, color: "var(--gold)", fontWeight: 700, borderColor: "var(--gold)" }}>
        {note}
      </div>

      <div className="card pad row" style={{ marginBottom: 12, gap: 10 }}>
        <span style={{ fontSize: 22 }} aria-hidden>🕗</span>
        <span style={{ color: "#fff", fontSize: 14 }}>{cbText(t("cb2_daily_ph"), { time: localTime(phUtc) })}</span>
      </div>

      <Rules t={t} />

      <Link to="/country-battle/board" className="btn" style={{ display: "flex", justifyContent: "center" }}>🥇 {t("cb2_board")}</Link>
      {playing && video && <FeatureVideoPlayer items={[{ url: video, title: t("cb_title"), trackKey: "country_battle", trackLabel: translate("en", "cb_title") }]} onClose={() => setPlaying(false)} />}
    </div>
  );
}

// ---- the lifetime Bragging Rights board -------------------------------------------------------

export function CountryBattleBoardPage() {
  const { t } = useT();
  const { user } = useSession();
  const uid = user?.id ?? 0;
  const [days, setDays] = useState<CbBoardDay[] | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadPage = useCallback((p: number) => {
    setBusy(true);
    fetchCountryBattleDays(uid, p)
      .then((r) => {
        setCountry(r.country);
        setDays((cur) => (p === 1 ? r.days : [...(cur ?? []), ...r.days.filter((d) => !(cur ?? []).some((c) => c.day_id === d.day_id))]));
        setHasMore(r.has_more);
        setPage(p);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setBusy(false));
  }, [uid]);
  useEffect(() => { loadPage(1); }, [loadPage]);
  return (
    <div className="page cb-page" style={{ maxWidth: 760 }}>
      <PageTitle>{t("cb2_board")}</PageTitle>
      <p className="muted" style={{ textAlign: "center", margin: "0 0 12px", fontSize: 13 }}>
        {country ? `${country} · ` : ""}{t("cb2_board_sub")}
      </p>
      {error && <Notice error>{error}</Notice>}
      {!days && !error && <Loading />}
      {days && days.length === 0 && <div className="card pad" style={{ textAlign: "center" }}><span className="muted">{t("cb_board_empty")}</span></div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {days?.map((d) => (
          <Link key={d.day_id} to={`/country-battle/board/${d.day_id}`} className="card pad"
            style={{ color: "inherit", display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
              <b style={{ color: "var(--gold)", fontSize: 16, flex: 1, minWidth: 0 }}>{d.date_label}</b>
              {d.is_test && <span className="pill">🧪</span>}
              <span className="pill">{cbText(t("cb_participants_count"), { n: d.participants })}</span>
            </div>
            {d.top3.length > 0 && (
              <div className="cb-people">
                {[...d.top3].sort((a, b) => a.place - b.place).map((c) => (
                  <div key={c.user_id} className="cb-person">
                    <PlacePill place={c.place} />
                    <b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name || c.username}</b>
                    <span className="cb-num">{c.score.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
            <span style={{ color: "var(--gold)", fontSize: 13, textAlign: "right" }}>{t("cb2_top100")} ›</span>
          </Link>
        ))}
      </div>
      {hasMore && (
        <button className="btn" style={{ display: "flex", margin: "12px auto 0" }} disabled={busy} onClick={() => loadPage(page + 1)}>
          {busy ? "…" : t("cb2_more_days")}
        </button>
      )}
    </div>
  );
}

export function CountryBattleDayPage() {
  const { t } = useT();
  const { id } = useParams();
  const { user } = useSession();
  const uid = user?.id ?? 0;
  const dayId = Number(id);
  const [top, setTop] = useState<CbDayTop | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setTop(null);
    setError(null);
    fetchCountryBattleDayTop(uid, dayId)
      .then((r) => { if (!live) return; if (r.ok) setTop(r.data); else setError(cbReasonText(t, r.reason, r.message)); })
      .catch((e) => { if (live) setError((e as Error).message); });
    return () => { live = false; };
  }, [uid, dayId, t]);
  const mineInList = !!top?.rows.some((r) => r.user_id === uid);
  return (
    <div className="page cb-page" style={{ maxWidth: 760 }}>
      <PageTitle>{top ? `${top.day.country} · ${top.day.date_label}` : t("cb2_board")}</PageTitle>
      {top?.day.is_test && <TestBanner />}
      {error && <Notice error>{error}</Notice>}
      {!top && !error && <Loading />}
      {top && (
        <>
          <div className="row" style={{ justifyContent: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <span className="pill">{cbText(t("cb_participants_count"), { n: top.day.participants })}</span>
            {!top.day.finished && <span className="pill live">● {t("cb2_running")}</span>}
          </div>
          {top.me && (
            <div className="card pad row" style={{ marginBottom: 12, borderColor: "var(--gold)" }}>
              <b style={{ color: "var(--gold)", flex: 1 }}>{cbText(t("cb2_your_rank"), { n: top.me.rank })}</b>
              <b style={{ color: "var(--gold)", fontVariantNumeric: "tabular-nums" }}>{top.me.score.toLocaleString()}</b>
            </div>
          )}
          <div className="card pad">
            <b style={{ color: "var(--gold)", display: "block", marginBottom: 10 }}>🏆 {t("cb2_top100")}</b>
            {top.rows.length === 0
              ? <span className="muted">{t("no_one_has_scored_yet")}</span>
              : (
                <div className="cb-people">
                  {top.rows.map((r) => (
                    <CbPersonRow key={r.user_id} p={r} place={r.rank} num={r.score} me={r.user_id === uid} />
                  ))}
                </div>
              )}
            {top.me && !mineInList && top.rows.length > 0 && (
              <p className="muted" style={{ fontSize: 12, margin: "10px 0 0", textAlign: "center" }}>{cbText(t("cb2_outside_top"), { n: top.me.rank })}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
