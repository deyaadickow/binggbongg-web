// Ads Analytics (Steve, 2026-10-31: "should we add the analytics to our ads on bingg bongg?" ->
// "Go ahead, build all four please"). One of the member's own ads, opened from the Advertise page:
// views and clicks for Today / a month / a year in their own time zone, people reached and how
// often each saw it, what it cost, and the countries the viewers were in.
// Backend: AdAnalyticsController::fetchVideoAdAnalytics (user_id is rebound to the caller by
// AuthorizeUser and the ad must be theirs). Android and iOS show the same page.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { mediaUrl, post } from "../lib/api";
import { useSession } from "../lib/session";
import { Loading, Notice } from "../components/Common";
import { useT, type StringKey } from "../lib/i18n";
import { BarChart, Comparison, longDate } from "./MyAnalyticsPage";

type Range = "today" | "month" | "year";
interface PeriodParams { range: Range; day?: string; month?: string; year?: number | string }
type CardFormat = "number" | "decimal" | "percent" | "money";
interface Card { key: string; value: number; prev: number | null; format: CardFormat }
interface Country { country_code: string | null; country_name: string; views: number; clicks: number; reach: number; share: number }
interface AdAnalytics {
  ad: { id: number; company_name?: string | null; thumb_path?: string | null; status?: string | null };
  period: { range: Range; label: string; prev_label: "day" | "month" | "year"; buckets: string[]; prev: PeriodParams | null; next: PeriodParams | null };
  hourly: boolean;
  cards: Card[];
  charts: { views: number[]; clicks: number[] };
  countries: Country[];
  totals: { views: number; clicks: number; reach: number };
  counting_since: { views?: string | null; reach?: string | null };
}

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const FORMATS: CardFormat[] = ["number", "decimal", "percent", "money"];

/** Every number coerced once, here — some arrive as strings from raw rows. */
function normalise(raw: AdAnalytics): AdAnalytics {
  return {
    ad: raw.ad ?? { id: 0 },
    period: { ...raw.period, buckets: (raw.period?.buckets ?? []).map(String) },
    hourly: raw.hourly !== false,
    cards: (raw.cards ?? []).map((c) => ({
      key: String(c.key),
      value: num(c.value),
      prev: c.prev === null || c.prev === undefined ? null : num(c.prev),
      format: (FORMATS.includes(c.format) ? c.format : "number") as CardFormat,
    })),
    charts: { views: (raw.charts?.views ?? []).map(num), clicks: (raw.charts?.clicks ?? []).map(num) },
    countries: (raw.countries ?? []).map((c) => ({
      country_code: c.country_code ? String(c.country_code).toUpperCase() : null,
      country_name: String(c.country_name ?? ""),
      views: num(c.views), clicks: num(c.clicks), reach: num(c.reach), share: num(c.share),
    })),
    totals: { views: num(raw.totals?.views), clicks: num(raw.totals?.clicks), reach: num(raw.totals?.reach) },
    counting_since: raw.counting_since ?? {},
  };
}

/** $ with cents; below a cent "0.42¢" — "$0.00 per view" tells an advertiser nothing. */
function money(v: number): string {
  if (v > 0 && v < 0.01) return `${(v * 100).toFixed(2)}¢`;
  return "$" + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatValue(c: Card): string {
  // A cost per view/click with nothing to divide by is "no figure", not "$0.00".
  if ((c.key === "cost_per_view" || c.key === "cost_per_click") && c.value <= 0) return "—";
  if (c.format === "money") return money(c.value);
  if (c.format === "percent") return `${c.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
  if (c.format === "decimal") return c.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return c.value.toLocaleString();
}

const CARD_LABELS: Record<string, StringKey> = {
  views: "aa_card_views", reach: "aa_card_reach", frequency: "aa_card_frequency", clicks: "aa_card_clicks",
  click_rate: "aa_card_click_rate", spend: "aa_card_spend", cost_per_view: "aa_card_cost_per_view", cost_per_click: "aa_card_cost_per_click",
};
// Spending more is neither good nor bad on its own; a dearer view or click is worse.
const LOWER_IS_BETTER = new Set(["cost_per_view", "cost_per_click"]);
const NEUTRAL = new Set(["spend", "frequency"]);

/** "PH" -> 🇵🇭 */
function flag(code: string | null): string {
  if (!code || !/^[A-Z]{2}$/.test(code)) return "🌐";
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** The country in the page's language where the browser knows it, else the server's English. */
function countryName(c: Country, lang: string, unknown: string): string {
  if (!c.country_code) return unknown;
  try {
    const n = new Intl.DisplayNames([lang], { type: "region" }).of(c.country_code);
    if (n && n !== c.country_code) return n;
  } catch { /* old browser */ }
  return c.country_name || c.country_code;
}

export function AdAnalyticsPage() {
  const { t, lang } = useT();
  const { id } = useParams();
  const adId = Number(id);
  const { user, isLoggedIn } = useSession();
  const userId = user?.id ?? null;
  const [params, setParams] = useState<PeriodParams>({ range: "month" });
  const [data, setData] = useState<AdAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [chart, setChart] = useState<"views" | "clicks">("views");

  const paramsKey = JSON.stringify(params);
  // Keyed on the id, never the user object: the session replaces the object on every refresh.
  useEffect(() => {
    if (!userId || !adId) return;
    let live = true;
    setLoading(true);
    setError(null);
    let tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { /* old browser */ }
    post<AdAnalytics>("fetchVideoAdAnalytics", { ...params, user_id: userId, video_ad_id: adId, tz: tz || undefined, lang })
      .then((r) => {
        if (!live) return;
        if (r.status && r.data) setData(normalise(r.data));
        else setError(r.message || t("aa_load_error"));
      })
      .catch(() => { if (live) setError(t("aa_load_error")); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, adId, paramsKey, lang, reload]);

  if (!isLoggedIn || !user) {
    return <div className="page"><Notice><Link to="/login">{t("sign_in")}</Link></Notice></div>;
  }

  const tabs: { range: Range; label: StringKey }[] = [
    { range: "today", label: "ma_today" }, { range: "month", label: "ma_this_month" }, { range: "year", label: "ma_this_year" },
  ];
  const period = data?.period;
  const ad = data?.ad;

  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <div className="row" style={{ gap: 12, marginBottom: 12 }}>
        <Link to="/settings/advertise" className="btn small ma-arrow" aria-label={t("ma_previous")}>‹</Link>
        {ad?.thumb_path ? (
          <img src={mediaUrl(ad.thumb_path)} alt="" width={44} height={44} style={{ borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
        ) : null}
        <div style={{ minWidth: 0 }}>
          <h1 className="page-title" style={{ margin: 0 }}>{t("aa_title")}</h1>
          {ad && (
            <div className="muted" style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {ad.company_name || `Ad #${ad.id}`}{ad.status ? ` · ${ad.status}` : ""}
            </div>
          )}
        </div>
      </div>

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
            {t("aa_lifetime", data.totals.views.toLocaleString(), data.totals.clicks.toLocaleString(), data.totals.reach.toLocaleString())}
          </div>

          <div className="ma-cards">
            {data.cards.map((c) => (
              <div key={c.key} className="card ma-card">
                <div className="ma-value">{formatValue(c)}</div>
                <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>{CARD_LABELS[c.key] ? t(CARD_LABELS[c.key]) : c.key}</div>
                {!NEUTRAL.has(c.key) && (
                  <Comparison value={c.value} prev={c.prev} prevLabel={data.period.prev_label} lowerIsBetter={LOWER_IS_BETTER.has(c.key)} />
                )}
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: 14, margin: "16px 0", background: "#000" }}>
            <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              {(["views", "clicks"] as const).map((k) => (
                <button key={k} type="button" className="btn small" onClick={() => setChart(k)}
                  style={chart === k ? { background: "var(--gold)", color: "#000" } : { background: "transparent", color: "var(--gold)" }}>
                  {t(k === "views" ? "aa_chart_views" : "aa_chart_clicks")}
                </button>
              ))}
            </div>
            {data.hourly ? (
              <BarChart buckets={data.period.buckets} values={data.charts[chart]} isMoney={false} />
            ) : (
              <p className="muted" style={{ margin: "30px 0", textAlign: "center" }}>
                {t("aa_no_hours", longDate(data.counting_since.reach ?? undefined, lang))}
              </p>
            )}
          </div>

          <h2 className="ma-h2">{t("aa_countries")}</h2>
          {data.countries.length === 0 ? <p className="muted">{t("aa_no_countries")}</p> : (
            <div style={{ display: "grid", gap: 8 }}>
              {data.countries.map((c) => (
                <div key={c.country_code ?? "unknown"} className="card" style={{ padding: "10px 12px" }}>
                  <div className="row" style={{ gap: 10 }}>
                    <span style={{ fontSize: 22, lineHeight: 1 }} aria-hidden>{flag(c.country_code)}</span>
                    <div style={{ flex: 1, minWidth: 0, fontWeight: 800 }}>{countryName(c, lang, t("aa_unknown_country"))}</div>
                    <div style={{ fontWeight: 900, color: "var(--gold)" }}>{c.share.toLocaleString(undefined, { maximumFractionDigits: 1 })}%</div>
                  </div>
                  <div style={{ height: 6, background: "rgba(255,255,255,.08)", borderRadius: 3, margin: "8px 0 6px" }}>
                    <div style={{ width: `${Math.min(100, Math.max(0, c.share))}%`, height: "100%", background: "var(--gold)", borderRadius: 3 }} />
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {t("aa_country_line", c.views.toLocaleString(), c.clicks.toLocaleString(), c.reach.toLocaleString())}
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="card muted" style={{ fontSize: 12, marginTop: 18, padding: "10px 14px", textAlign: "center" }}>
            {data.counting_since.reach
              ? t("aa_footnote", longDate(data.counting_since.views ?? "2026-10-04", lang), longDate(data.counting_since.reach, lang))
              : t("aa_footnote_new", longDate(data.counting_since.views ?? "2026-10-04", lang))}
          </p>
        </div>
      )}
    </div>
  );
}
