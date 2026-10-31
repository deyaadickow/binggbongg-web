// My Analytics (Steve, 2026-10-31: "Can we add analytics for all members?" -> "In the app, for each
// member"). Every member's own numbers, like creator stats: 15 cards for Today / a month / a year,
// each compared with the period before, one bar chart, top videos and top supporters.
// Backend: MyAnalyticsController::fetchMyAnalytics (user_id is rebound to the caller by
// AuthorizeUser, so a member can only ever read their own). Android and iOS show the same page.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { mediaUrl, post } from "../lib/api";
import { useSession } from "../lib/session";
import { Avatar, Loading, Notice } from "../components/Common";
import { useT, type StringKey } from "../lib/i18n";

type Range = "today" | "month" | "year";
interface PeriodParams { range: Range; day?: string; month?: string; year?: number | string }
type CardFormat = "number" | "money" | "duration";
interface Card { key: string; value: number; prev: number | null; format: CardFormat }
interface Analytics {
  period: { range: Range; label: string; prev_label: "day" | "month" | "year"; buckets: string[]; prev: PeriodParams | null; next: PeriodParams | null };
  cards: Card[];
  charts: Record<ChartKey, number[]>;
  totals: { followers: number; likes: number; earned_lifetime: number };
  top_videos: { post_id: number; thumbnail?: string | null; description?: string | null; views: number }[];
  top_supporters: { user_id: number; fullname?: string | null; username?: string | null; profile_image?: string | null; coins: number }[];
  counting_since: { views?: string; time_on_app?: string };
}
type ChartKey = "views" | "followers" | "gift_coins" | "earned";

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** The server sends some numbers as strings (raw rows); coerce everything once, here. */
function normalise(raw: Analytics): Analytics {
  const charts = (raw.charts ?? {}) as Partial<Record<ChartKey, unknown[]>>;
  const chart = (k: ChartKey) => (Array.isArray(charts[k]) ? charts[k]!.map(num) : []);
  return {
    period: { ...raw.period, buckets: (raw.period?.buckets ?? []).map(String) },
    cards: (raw.cards ?? []).map((c) => ({
      key: String(c.key),
      value: num(c.value),
      prev: c.prev === null || c.prev === undefined ? null : num(c.prev),
      format: (c.format === "money" || c.format === "duration" ? c.format : "number") as CardFormat,
    })),
    charts: { views: chart("views"), followers: chart("followers"), gift_coins: chart("gift_coins"), earned: chart("earned") },
    totals: { followers: num(raw.totals?.followers), likes: num(raw.totals?.likes), earned_lifetime: num(raw.totals?.earned_lifetime) },
    top_videos: (raw.top_videos ?? []).map((v) => ({ ...v, post_id: num(v.post_id), views: num(v.views) })),
    top_supporters: (raw.top_supporters ?? []).map((s) => ({ ...s, user_id: num(s.user_id), coins: num(s.coins) })),
    counting_since: raw.counting_since ?? {},
  };
}

const money = (v: number) => "$" + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type T = (key: StringKey, ...args: (string | number)[]) => string;

/** Seconds -> "0", "under 1 min", "14 min", "2 h 05 min", and from 100 hours just "123 h". */
function duration(seconds: number, t: T): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s === 0) return "0";
  if (s < 60) return t("ma_under_1_min");
  const mins = Math.floor(s / 60);
  if (mins < 60) return t("ma_n_min", mins);
  const h = Math.floor(mins / 60);
  if (h >= 100) return t("ma_n_h", h.toLocaleString());
  return t("ma_n_h_n_min", h, String(mins % 60).padStart(2, "0"));
}

function formatValue(v: number, f: CardFormat, t: T): string {
  if (f === "money") return money(v);
  if (f === "duration") return duration(v, t);
  return v.toLocaleString();
}

const CARD_LABELS: Record<string, StringKey> = {
  views: "ma_card_views", watch_time: "ma_card_watch_time", likes: "ma_card_likes", comments: "ma_card_comments",
  new_followers: "ma_card_new_followers", videos_posted: "ma_card_videos_posted", lives: "ma_card_lives",
  time_live: "ma_card_time_live", live_viewers: "ma_card_live_viewers", gift_coins_received: "ma_card_gift_coins_received",
  money_earned: "ma_card_money_earned", gift_coins_sent: "ma_card_gift_coins_sent", battles: "ma_card_battles",
  battle_wins: "ma_card_battle_wins", time_on_app: "ma_card_time_on_app",
};

const VS: Record<string, StringKey> = { day: "ma_vs_yesterday", month: "ma_vs_last_month", year: "ma_vs_last_year" };

/** prev null -> nothing; both 0 -> "—"; prev 0 -> "new"; else "▲ 12% vs last month" / "▼ 8% ...".
 *  lowerIsBetter (Ads Analytics' cost cards): a rise is shown red and a fall green. */
export function Comparison({ value, prev, prevLabel, lowerIsBetter = false }: { value: number; prev: number | null; prevLabel: string; lowerIsBetter?: boolean }) {
  const { t } = useT();
  if (prev === null) return null;
  const style = { fontSize: 12, fontWeight: 700 } as const;
  if (prev === 0 && value === 0) return <div className="muted" style={style}>—</div>;
  if (prev === 0) return <div style={{ ...style, color: "#34d399" }}>{t("ma_new")}</div>;
  const pct = Math.round(((value - prev) / Math.abs(prev)) * 100);
  const vs = VS[prevLabel] ?? "ma_vs_last_month";
  if (pct === 0) return <div className="muted" style={style}>{t(vs, "0%")}</div>;
  const up = pct > 0;
  const good = lowerIsBetter ? !up : up;
  return (
    <div style={{ ...style, color: good ? "#34d399" : "#f87171" }}>
      {t(vs, `${up ? "▲" : "▼"} ${Math.abs(pct).toLocaleString()}%`)}
    </div>
  );
}

const CHARTS: { key: ChartKey; label: StringKey }[] = [
  { key: "views", label: "ma_chart_views" },
  { key: "followers", label: "ma_chart_followers" },
  { key: "gift_coins", label: "ma_chart_gift_coins" },
  { key: "earned", label: "ma_chart_earned" },
];

export function BarChart({ buckets, values, isMoney }: { buckets: string[]; values: number[]; isMoney: boolean }) {
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => setActive(null), [buckets, values]);
  const max = Math.max(0, ...values);
  const fmt = (v: number) => (isMoney ? money(v) : v.toLocaleString());
  // Sparse x labels: about eight across, whatever the period (31 days, 24 hours, 12 months).
  const every = Math.max(1, Math.ceil(buckets.length / 8));
  const shown = active !== null ? active : null;
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", minHeight: 22, marginBottom: 6, fontSize: 13 }}>
        <span className="muted">{max > 0 ? fmt(max) : ""}</span>
        {shown !== null && (
          <span style={{ color: "var(--gold)", fontWeight: 800 }}>{buckets[shown]}: {fmt(values[shown] ?? 0)}</span>
        )}
      </div>
      <div className="ma-bars" onMouseLeave={() => setActive(null)}>
        {buckets.map((b, i) => {
          const v = values[i] ?? 0;
          const h = max > 0 ? Math.max(v > 0 ? 3 : 0, (v / max) * 100) : 0;
          return (
            <button key={i} type="button" className={`ma-bar${active === i ? " on" : ""}`}
              aria-label={`${b}: ${fmt(v)}`}
              onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)}
              onClick={() => setActive((cur) => (cur === i ? null : i))}>
              <span style={{ height: `${h}%` }} />
            </button>
          );
        })}
      </div>
      <div className="ma-xlabels">
        {buckets.map((b, i) => <span key={i}>{i % every === 0 ? b : ""}</span>)}
      </div>
    </div>
  );
}

/** "2026-10-04" -> "October 4, 2026" in the page's language, read as a local date. */
export function longDate(ymd: string | undefined, lang: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? "");
  if (!m) return ymd ?? "";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  try { return d.toLocaleDateString(lang, { month: "long", day: "numeric", year: "numeric" }); }
  catch { return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }); }
}

export function MyAnalyticsPage() {
  const { t, tn, lang } = useT();
  const { user, isLoggedIn } = useSession();
  const userId = user?.id ?? null;
  const [params, setParams] = useState<PeriodParams>({ range: "month" });
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [chart, setChart] = useState<ChartKey>("views");

  const paramsKey = JSON.stringify(params);
  // Keyed on the id, never the user object: the session replaces the object on every refresh.
  useEffect(() => {
    if (!userId) return;
    let live = true;
    setLoading(true);
    setError(null);
    let tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { /* old browser */ }
    post<Analytics>("fetchMyAnalytics", { ...params, user_id: userId, tz: tz || undefined, lang })
      .then((r) => {
        if (!live) return;
        if (r.status && r.data) setData(normalise(r.data));
        else setError(r.message || t("ma_load_error"));
      })
      .catch(() => { if (live) setError(t("ma_load_error")); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, paramsKey, lang, reload]);

  if (!isLoggedIn || !user) {
    return <div className="page"><Notice>{tn("ma_sign_in", <Link to="/login">{t("sign_in")}</Link>)}</Notice></div>;
  }

  const tabs: { range: Range; label: StringKey }[] = [
    { range: "today", label: "ma_today" }, { range: "month", label: "ma_this_month" }, { range: "year", label: "ma_this_year" },
  ];
  const period = data?.period;

  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <h1 className="page-title">{t("ma_title")}</h1>

      <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {tabs.map((tab) => (
          <button key={tab.range} type="button" className="btn small" onClick={() => setParams({ range: tab.range })}
            style={params.range === tab.range ? { background: "var(--gold)", color: "#000" } : { background: "transparent", color: "var(--gold)" }}>
            {t(tab.label)}
          </button>
        ))}
      </div>

      <div className="row" style={{ justifyContent: "center", gap: 12, marginBottom: 12 }}>
        <button type="button" className="btn small ma-arrow" aria-label={t("ma_previous")}
          disabled={!period?.prev || loading} onClick={() => period?.prev && setParams(period.prev)}>‹</button>
        <div style={{ fontWeight: 800, fontSize: 18, color: "var(--gold)", minWidth: 150, textAlign: "center" }}>
          {period?.label ?? "…"}
        </div>
        <button type="button" className="btn small ma-arrow" aria-label={t("ma_next")}
          disabled={!period?.next || loading} onClick={() => period?.next && setParams(period.next)}>›</button>
      </div>

      {loading && !data ? <Loading /> : error ? (
        <div style={{ textAlign: "center" }}>
          <Notice error>{error}</Notice>
          <button type="button" className="btn small" style={{ marginTop: 10 }} onClick={() => setReload((n) => n + 1)}>{t("ma_retry")}</button>
        </div>
      ) : data && (
        <div style={{ opacity: loading ? 0.55 : 1, transition: "opacity .15s" }}>
          <div className="card" style={{ padding: "10px 14px", marginBottom: 14, textAlign: "center", fontWeight: 700, color: "var(--text-soft)" }}>
            {t("ma_all_time", data.totals.followers.toLocaleString(), data.totals.likes.toLocaleString(), money(data.totals.earned_lifetime))}
          </div>

          <div className="ma-cards">
            {data.cards.map((c) => (
              <div key={c.key} className="card ma-card">
                <div className="ma-value">{formatValue(c.value, c.format, t)}</div>
                <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>{CARD_LABELS[c.key] ? t(CARD_LABELS[c.key]) : c.key}</div>
                <Comparison value={c.value} prev={c.prev} prevLabel={data.period.prev_label} />
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: 14, margin: "16px 0", background: "#000" }}>
            <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              {CHARTS.map((c) => (
                <button key={c.key} type="button" className="btn small" onClick={() => setChart(c.key)}
                  style={chart === c.key ? { background: "var(--gold)", color: "#000" } : { background: "transparent", color: "var(--gold)" }}>
                  {t(c.label)}
                </button>
              ))}
            </div>
            <BarChart buckets={data.period.buckets} values={data.charts[chart]} isMoney={chart === "earned"} />
          </div>

          <div className="ma-lists">
            <section>
              <h2 className="ma-h2">{t("ma_top_videos")}</h2>
              {data.top_videos.length === 0 ? <p className="muted">{t("ma_no_videos")}</p> : (
                <div style={{ display: "grid", gap: 8 }}>
                  {data.top_videos.map((v) => (
                    <Link key={v.post_id} to={`/video/${v.post_id}`} className="card row" style={{ padding: 8, color: "inherit" }}>
                      <div className="ma-thumb">{v.thumbnail ? <img src={mediaUrl(v.thumbnail)} alt="" loading="lazy" /> : null}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="ma-desc">{v.description?.trim() || t("ma_video")}</div>
                        <div style={{ color: "var(--gold)", fontWeight: 800, fontSize: 13 }}>{t("ma_n_views", v.views.toLocaleString())}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
            <section>
              <h2 className="ma-h2">{t("ma_top_supporters")}</h2>
              {data.top_supporters.length === 0 ? <p className="muted">{t("ma_no_supporters")}</p> : (
                <div style={{ display: "grid", gap: 8 }}>
                  {data.top_supporters.map((s) => (
                    <Link key={s.user_id} to={`/profile/${s.user_id}`} className="card row" style={{ padding: 10, color: "inherit" }}>
                      <Avatar user={{ id: s.user_id, fullname: s.fullname ?? undefined, username: s.username ?? undefined, profile_image: s.profile_image ?? undefined }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, color: "var(--gold)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.fullname || s.username || ""}</div>
                        <div style={{ fontSize: 13, color: "var(--gold)", opacity: 0.75, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{s.username ?? ""}</div>
                      </div>
                      <div style={{ fontWeight: 800, flexShrink: 0 }}>{t("ma_n_coins", s.coins.toLocaleString())}</div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>

          <p className="muted" style={{ fontSize: 12, marginTop: 18, textAlign: "center" }}>
            {t("ma_footnote", longDate(data.counting_since.views ?? "2026-10-04", lang), longDate(data.counting_since.time_on_app ?? "2026-10-29", lang))}
          </p>
        </div>
      )}
    </div>
  );
}
