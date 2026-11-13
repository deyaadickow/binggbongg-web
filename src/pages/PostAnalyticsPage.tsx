// Video Analytics (Steve, 2026-11-13: "When you hold any video for 2 seconds and get the popup
// please add a analytics button, when they click it they will see all the analytics for this
// video."). Opened from the "Analytics" row of the video page's hold menu, and linkable at
// /video/:id/analytics. Anyone can open it, signed in or not — the numbers are the same ones a
// viewer sees on the video (views, likes, ...), plus watch time and where the viewers are.
// Backend: PostAnalyticsController::fetchPostAnalytics.
import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { mediaUrl, post } from "../lib/api";
import { Avatar, Loading, Notice } from "../components/Common";
import { useSession } from "../lib/session";
import { useT, type StringKey } from "../lib/i18n";
import { BarChart, Comparison, longDate } from "./MyAnalyticsPage";

type Range = "today" | "month" | "year";
interface PeriodParams { range: Range; day?: string; month?: string; year?: number | string }
type CardFormat = "number" | "duration";
interface Card { key: string; value: number; prev: number | null; format: CardFormat }
interface Owner { user_id: number; username?: string | null; fullname?: string | null; profile_image?: string | null }
interface Lifetime {
  views: number; likes: number; comments: number; saves: number; shares: number; reposts: number; votes: number;
  watch_time_seconds: number; avg_watch_seconds: number; completion_rate: number | null; rewatches: number; duration_seconds: number | null;
}
interface PostAnalytics {
  post: { post_id: number; thumbnail?: string | null; description?: string | null; created_at?: string | null; owner: Owner | null };
  lifetime: Lifetime;
  period: { range: Range; label: string; prev_label: "day" | "month" | "year"; buckets: string[]; prev: PeriodParams | null; next: PeriodParams | null };
  cards: Card[];
  charts: { views: number[] };
  countries: { country: string; views: number; percent: number }[];
  counting_since: { watch?: string | null };
}

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const numOrNull = (v: unknown) => (v === null || v === undefined || v === "" ? null : num(v));

/** The server sends some numbers as strings (raw rows); coerce everything once, here. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalise(raw: any): PostAnalytics {
  const p = raw?.post ?? {};
  const o = p.owner ?? null;
  const l = raw?.lifetime ?? {};
  return {
    post: {
      post_id: num(p.post_id), thumbnail: p.thumbnail ?? null, description: p.description ?? null, created_at: p.created_at ?? null,
      owner: o ? { user_id: num(o.user_id), username: o.username ?? null, fullname: o.fullname ?? null, profile_image: o.profile_image ?? null } : null,
    },
    lifetime: {
      views: num(l.views), likes: num(l.likes), comments: num(l.comments), saves: num(l.saves), shares: num(l.shares),
      reposts: num(l.reposts), votes: num(l.votes), watch_time_seconds: num(l.watch_time_seconds),
      avg_watch_seconds: num(l.avg_watch_seconds), completion_rate: numOrNull(l.completion_rate),
      rewatches: num(l.rewatches), duration_seconds: numOrNull(l.duration_seconds),
    },
    period: { ...raw?.period, buckets: (raw?.period?.buckets ?? []).map(String) },
    cards: (raw?.cards ?? []).map((c: Card) => ({
      key: String(c.key),
      value: num(c.value),
      prev: c.prev === null || c.prev === undefined ? null : num(c.prev),
      format: (c.format === "duration" ? "duration" : "number") as CardFormat,
    })),
    charts: { views: Array.isArray(raw?.charts?.views) ? raw.charts.views.map(num) : [] },
    countries: (raw?.countries ?? []).map((c: { country?: unknown; views?: unknown; percent?: unknown }) => ({
      country: String(c.country ?? ""), views: num(c.views), percent: num(c.percent),
    })),
    counting_since: raw?.counting_since ?? {},
  };
}

type T = (key: StringKey, ...args: (string | number)[]) => string;

/** Seconds for one video: "1.6 s", "45 s", "3 min 05 s", then the My Analytics style for hours. */
function seconds(v: number, t: T): string {
  const s = Math.max(0, v);
  if (s === 0) return "0";
  if (s < 10) return t("va_n_s", s.toLocaleString(undefined, { maximumFractionDigits: 1 }));
  if (s < 60) return t("va_n_s", Math.round(s));
  const total = Math.round(s);
  const mins = Math.floor(total / 60);
  if (mins < 60) return t("va_n_min_n_s", mins, String(total % 60).padStart(2, "0"));
  const h = Math.floor(mins / 60);
  if (h >= 100) return t("ma_n_h", h.toLocaleString());
  return t("ma_n_h_n_min", h, String(mins % 60).padStart(2, "0"));
}

const CARD_LABELS: Record<string, StringKey> = {
  views: "va_views", watch_time: "ma_card_watch_time", likes: "va_likes", comments: "va_comments",
  saves: "va_saves", reposts: "va_reposts", shares: "va_shares", votes: "va_votes",
};

export function PostAnalyticsPage() {
  const { t, lang } = useT();
  const { id } = useParams();
  const navigate = useNavigate();
  const postId = Number(id);
  const [params, setParams] = useState<PeriodParams>({ range: "month" });
  const [data, setData] = useState<PostAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  // Steve, 2026-11-13: "When they click on views inside analytics, let them get a pop-up of who
  // viewed that video." Only the video's owner (the server refuses anyone else too).
  const { user } = useSession();
  const [viewersOpen, setViewersOpen] = useState(false);

  const paramsKey = JSON.stringify(params);
  useEffect(() => {
    if (!postId) { setLoading(false); setError(t("va_load_error")); return; }
    let live = true;
    setLoading(true);
    setError(null);
    let tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { /* old browser */ }
    // post_id always goes first and is never empty: this host's WAF refuses an empty-body POST.
    post<unknown>("fetchPostAnalytics", { post_id: postId, ...params, tz: tz || undefined, lang })
      .then((r) => {
        if (!live) return;
        if (r.status && r.data) setData(normalise(r.data));
        else setError(r.message || t("va_load_error"));
      })
      .catch(() => { if (live) setError(t("va_load_error")); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, paramsKey, lang, reload]);

  const tabs: { range: Range; label: StringKey }[] = [
    { range: "today", label: "ma_today" }, { range: "month", label: "ma_this_month" }, { range: "year", label: "ma_this_year" },
  ];
  const period = data?.period;
  const p = data?.post;
  const owner = p?.owner;
  const life = data?.lifetime;

  const back = () => {
    // history.state.idx 0 = opened from a shared link: go to the video instead of off the site.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1); else navigate(`/video/${postId}`);
  };

  const isOwner = !!user && !!owner && Number(user.id) === Number(owner.user_id);
  const openViewers = isOwner ? () => setViewersOpen(true) : undefined;

  const lifetimeTiles: { label: StringKey; value: string }[] = life ? [
    { label: "va_views", value: life.views.toLocaleString() },
    { label: "va_likes", value: life.likes.toLocaleString() },
    { label: "va_comments", value: life.comments.toLocaleString() },
    { label: "va_saves", value: life.saves.toLocaleString() },
    { label: "va_shares", value: life.shares.toLocaleString() },
    { label: "va_reposts", value: life.reposts.toLocaleString() },
    { label: "va_votes", value: life.votes.toLocaleString() },
    ...(life.duration_seconds !== null && life.duration_seconds > 0 ? [{ label: "va_duration" as StringKey, value: seconds(life.duration_seconds, t) }] : []),
    { label: "va_watch_time", value: seconds(life.watch_time_seconds, t) },
    { label: "va_avg_watch", value: seconds(life.avg_watch_seconds, t) },
    ...(life.completion_rate !== null ? [{ label: "va_completion" as StringKey, value: `${life.completion_rate.toLocaleString(undefined, { maximumFractionDigits: 1 })}%` }] : []),
    { label: "va_rewatches", value: life.rewatches.toLocaleString() },
  ] : [];

  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <div className="row" style={{ gap: 12, marginBottom: 12, alignItems: "center" }}>
        <button type="button" onClick={back} className="back-circle" aria-label={t("back")}>‹</button>
        <h1 className="page-title" style={{ margin: 0 }}>{t("va_title")}</h1>
      </div>

      {p && (
        <Link to={`/video/${p.post_id || postId}`} className="card row" style={{ padding: 10, marginBottom: 14, color: "inherit", gap: 12 }}>
          <div className="ma-thumb">{p.thumbnail ? <img src={mediaUrl(p.thumbnail)} alt="" loading="lazy" /> : null}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {owner && (
              <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                <Avatar user={{ id: owner.user_id, fullname: owner.fullname ?? undefined, username: owner.username ?? undefined, profile_image: owner.profile_image ?? undefined }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, color: "var(--gold)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{owner.username ?? ""}</div>
                  {owner.fullname ? <div className="muted" style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{owner.fullname}</div> : null}
                </div>
              </div>
            )}
            <div className="ma-desc">{p.description?.trim() || t("ma_video")}</div>
          </div>
        </Link>
      )}

      {loading && !data ? <Loading /> : error && !data ? (
        <div style={{ textAlign: "center" }}>
          <Notice error>{error}</Notice>
          <button type="button" className="btn small" style={{ marginTop: 10 }} onClick={() => setReload((n) => n + 1)}>{t("ma_retry")}</button>
        </div>
      ) : data && (
        <div style={{ opacity: loading ? 0.55 : 1, transition: "opacity .15s" }}>
          <h2 className="ma-h2">{t("va_all_time")}</h2>
          <div className="ma-cards" style={{ marginBottom: 18 }}>
            {lifetimeTiles.map((tile) => (
              <Tile key={tile.label} onTap={tile.label === "va_views" ? openViewers : undefined} hint={t("va_who_watched")}>
                <div className="ma-value" style={tile.label === "va_views" && openViewers ? TAPPABLE : undefined}>{tile.value}{tile.label === "va_views" && openViewers ? " ›" : ""}</div>
                <div className="muted" style={{ fontSize: 13 }}>{t(tile.label)}</div>
              </Tile>
            ))}
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

          {error && <Notice error>{error}</Notice>}

          <div className="ma-cards">
            {data.cards.map((c) => (
              <Tile key={c.key} onTap={c.key === "views" ? openViewers : undefined} hint={t("va_who_watched")}>
                <div className="ma-value" style={c.key === "views" && openViewers ? TAPPABLE : undefined}>
                  {c.format === "duration" ? seconds(c.value, t) : c.value.toLocaleString()}{c.key === "views" && openViewers ? " ›" : ""}
                </div>
                <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>{CARD_LABELS[c.key] ? t(CARD_LABELS[c.key]) : c.key}</div>
                <Comparison value={c.value} prev={c.prev} prevLabel={data.period.prev_label} />
              </Tile>
            ))}
          </div>

          <div className="card" style={{ padding: 14, margin: "16px 0", background: "#000" }}>
            <div style={{ fontWeight: 800, color: "var(--gold)", marginBottom: 10 }}>{t("va_views")}</div>
            <BarChart buckets={data.period.buckets} values={data.charts.views} isMoney={false} />
          </div>

          <h2 className="ma-h2">{t("va_countries")}</h2>
          {data.countries.length === 0 ? <p className="muted">{t("va_no_countries")}</p> : (
            <div style={{ display: "grid", gap: 8 }}>
              {data.countries.map((c) => (
                <div key={c.country || "unknown"} className="card" style={{ padding: "10px 12px" }}>
                  <div className="row" style={{ gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0, fontWeight: 800 }}>{c.country || t("aa_unknown_country")}</div>
                    <div style={{ fontWeight: 900, color: "var(--gold)" }}>{c.percent.toLocaleString(undefined, { maximumFractionDigits: 1 })}%</div>
                  </div>
                  <div style={{ height: 6, background: "rgba(255,255,255,.08)", borderRadius: 3, margin: "8px 0 6px" }}>
                    <div style={{ width: `${Math.min(100, Math.max(0, c.percent))}%`, height: "100%", background: "var(--gold)", borderRadius: 3 }} />
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>{t("ma_n_views", c.views.toLocaleString())}</div>
                </div>
              ))}
            </div>
          )}

          <p className="card muted" style={{ fontSize: 12, marginTop: 18, padding: "10px 14px", textAlign: "center" }}>
            {t("va_footnote", longDate(data.counting_since.watch ?? "2026-10-04", lang))}
          </p>
        </div>
      )}
      {viewersOpen && isOwner && user && (
        <ViewersModal postId={p?.post_id || postId} userId={Number(user.id)} onClose={() => setViewersOpen(false)} />
      )}
    </div>
  );
}

const TAPPABLE = { textDecoration: "underline", textDecorationColor: "var(--gold)", textUnderlineOffset: 4, textDecorationThickness: 2 } as const;

/** A stat card; a button when it opens something (the owner's Views), a plain card otherwise. */
function Tile({ onTap, hint, children }: { onTap?: () => void; hint: string; children: ReactNode }) {
  if (!onTap) return <div className="card ma-card">{children}</div>;
  return (
    <button type="button" className="card ma-card" onClick={onTap} title={hint} aria-label={hint}
      style={{ textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit", width: "100%" }}>
      {children}
    </button>
  );
}

interface Viewer {
  user_id: number; username: string | null; fullname: string | null; profile_image: string | null;
  is_verified: number; times: number; last_viewed_at: string | null;
}

/** "2026-11-09 14:27:57" (UTC) -> "4 days ago" in the page's language. */
function ago(utc: string | null, lang: string): string {
  if (!utc) return "";
  const d = new Date(utc.slice(0, 19).replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return "";
  const secs = Math.round((d.getTime() - Date.now()) / 1000);
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [["second", 60], ["minute", 60], ["hour", 24], ["day", 7], ["week", 4.35], ["month", 12], ["year", Infinity]];
  let v = secs;
  for (const [unit, size] of steps) {
    if (Math.abs(v) < size) {
      try { return new Intl.RelativeTimeFormat(lang, { numeric: "auto" }).format(Math.round(v), unit); }
      catch { return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(Math.round(v), unit); }
    }
    v /= size;
  }
  return "";
}

const PAGE = 50;

/** "Who watched": the signed-in members who viewed this video, for its owner only. */
function ViewersModal({ postId, userId, onClose }: { postId: number; userId: number; onClose: () => void }) {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [start, setStart] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [signedOut, setSignedOut] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    post<{ viewers?: unknown[]; signed_out_views?: unknown; has_more?: unknown }>("fetchPostViewers", { user_id: userId, post_id: postId, start, count: PAGE })
      .then((r) => {
        if (!live) return;
        if (!r.status || !r.data) { setError(r.message || t("va_viewers_error")); return; }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows: Viewer[] = (r.data.viewers ?? []).map((v: any) => ({
          user_id: num(v.user_id), username: v.username ?? null, fullname: v.fullname ?? null,
          profile_image: v.profile_image ?? null, is_verified: num(v.is_verified), times: num(v.times),
          last_viewed_at: v.last_viewed_at ?? null,
        }));
        setViewers((cur) => (start === 0 ? rows : [...cur, ...rows]));
        setSignedOut(num(r.data.signed_out_views));
        setHasMore(r.data.has_more === true || r.data.has_more === 1 || r.data.has_more === "1" || r.data.has_more === "true");
      })
      .catch((e: Error) => { if (live) setError(e?.message || t("va_viewers_error")); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, userId, start]);

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t("va_who_watched")}
        style={{ width: "100%", maxWidth: 420, maxHeight: "85vh", display: "flex", flexDirection: "column", background: "#000",
                 border: "1.5px solid var(--gold-border)", borderRadius: 16, padding: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: "var(--gold)", textAlign: "center", marginBottom: 12 }}>{t("va_who_watched")}</div>
        <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
          {viewers.length === 0 && loading ? <Loading /> : error && viewers.length === 0 ? <Notice error>{error}</Notice> : (
            <>
              {viewers.length === 0 && <p className="muted" style={{ textAlign: "center" }}>{t("va_no_viewers")}</p>}
              <div style={{ display: "grid", gap: 8 }}>
                {viewers.map((v) => (
                  <button key={v.user_id} type="button" className="card row"
                    onClick={() => { onClose(); navigate(`/profile/${v.user_id}`); }}
                    style={{ padding: 10, gap: 10, width: "100%", textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" }}>
                    <Avatar user={{ id: v.user_id, fullname: v.fullname ?? undefined, username: v.username ?? undefined, profile_image: v.profile_image ?? undefined }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, color: "var(--gold)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {v.fullname || v.username || ""}
                        {v.is_verified === 2 && <span title={t("verified")} style={{ color: "#4af", marginLeft: 4 }}>✓</span>}
                      </div>
                      {v.username ? <div className="muted" style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{v.username}</div> : null}
                      <div className="muted" style={{ fontSize: 12 }}>
                        {[v.times > 1 ? t("va_watched_n_times", v.times.toLocaleString()) : "", ago(v.last_viewed_at, lang)].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              {error && viewers.length > 0 && <Notice error>{error}</Notice>}
              {hasMore && (
                <button type="button" className="btn small" disabled={loading} style={{ width: "100%", marginTop: 10 }}
                  onClick={() => setStart((n) => n + PAGE)}>{loading ? "…" : t("va_load_more")}</button>
              )}
              {signedOut > 0 && (
                <p className="muted" style={{ fontSize: 12, textAlign: "center", marginTop: 12 }}>{t("va_signed_out_views", signedOut.toLocaleString())}</p>
              )}
            </>
          )}
        </div>
        <button type="button" className="btn ghost" style={{ width: "100%", marginTop: 12 }} onClick={onClose}>{t("close")}</button>
      </div>
    </div>
  );
}
