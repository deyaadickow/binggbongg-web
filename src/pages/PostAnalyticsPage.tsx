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
type CardFormat = "number" | "duration" | "bbs";
interface Card { key: string; value: number; prev: number | null; format: CardFormat }
interface Owner { user_id: number; username?: string | null; fullname?: string | null; profile_image?: string | null }
interface Lifetime {
  views: number; likes: number; comments: number; saves: number; shares: number; reposts: number; gifts: number;
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
      reposts: num(l.reposts), gifts: num(l.gifts), watch_time_seconds: num(l.watch_time_seconds),
      avg_watch_seconds: num(l.avg_watch_seconds), completion_rate: numOrNull(l.completion_rate),
      rewatches: num(l.rewatches), duration_seconds: numOrNull(l.duration_seconds),
    },
    period: { ...raw?.period, buckets: (raw?.period?.buckets ?? []).map(String) },
    cards: (raw?.cards ?? []).map((c: Card) => ({
      key: String(c.key),
      value: num(c.value),
      prev: c.prev === null || c.prev === undefined ? null : num(c.prev),
      format: (c.format === "duration" || c.format === "bbs" ? c.format : "number") as CardFormat,
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
  saves: "va_saves", reposts: "va_reposts", shares: "va_shares", gifts: "va_gifts",
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
  // Steve, 2026-11-13: "Please do the same for the rest... likes, comments, rewatches, saves,
  // gifts, Watched to the end, reposts, shares." One modal, opened with the kind of list.
  const [peopleKind, setPeopleKind] = useState<PeopleKind | null>(null);

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
  const opener = (kind: PeopleKind | undefined) => (isOwner && kind ? () => setPeopleKind(kind) : undefined);

  // Steve, 2026-11-13: "Please remove the votes and add Gifts."
  const lifetimeTiles: { label: StringKey; value: string; kind?: PeopleKind }[] = life ? [
    { label: "va_views", value: life.views.toLocaleString(), kind: "views" },
    { label: "va_likes", value: life.likes.toLocaleString(), kind: "likes" },
    { label: "va_comments", value: life.comments.toLocaleString(), kind: "comments" },
    { label: "va_saves", value: life.saves.toLocaleString(), kind: "saves" },
    { label: "va_shares", value: life.shares.toLocaleString(), kind: "shares" },
    { label: "va_reposts", value: life.reposts.toLocaleString(), kind: "reposts" },
    { label: "va_gifts", value: t("ma_n_coins", life.gifts.toLocaleString()), kind: "gifts" },
    ...(life.duration_seconds !== null && life.duration_seconds > 0 ? [{ label: "va_duration" as StringKey, value: seconds(life.duration_seconds, t) }] : []),
    { label: "va_watch_time", value: seconds(life.watch_time_seconds, t) },
    { label: "va_avg_watch", value: seconds(life.avg_watch_seconds, t) },
    ...(life.completion_rate !== null ? [{ label: "va_completion" as StringKey, value: `${life.completion_rate.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`, kind: "completed" as PeopleKind }] : []),
    { label: "va_rewatches", value: life.rewatches.toLocaleString(), kind: "rewatches" },
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
            {lifetimeTiles.map((tile) => {
              const tap = opener(tile.kind);
              return (
                <Tile key={tile.label} onTap={tap} hint={tile.kind ? t(PEOPLE[tile.kind].title) : ""}>
                  <div className="ma-value" style={tap ? TAPPABLE : undefined}>{tile.value}{tap ? " ›" : ""}</div>
                  <div className="muted" style={{ fontSize: 13 }}>{t(tile.label)}</div>
                </Tile>
              );
            })}
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
            {data.cards.map((c) => {
              // The period cards open the same lifetime list.
              const kind = PERIOD_KINDS[c.key];
              const tap = opener(kind);
              return (
                <Tile key={c.key} onTap={tap} hint={kind ? t(PEOPLE[kind].title) : ""}>
                  <div className="ma-value" style={tap ? TAPPABLE : undefined}>
                    {c.format === "duration" ? seconds(c.value, t) : c.format === "bbs" ? t("ma_n_coins", c.value.toLocaleString()) : c.value.toLocaleString()}{tap ? " ›" : ""}
                  </div>
                  <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>{CARD_LABELS[c.key] ? t(CARD_LABELS[c.key]) : c.key}</div>
                  <Comparison value={c.value} prev={c.prev} prevLabel={data.period.prev_label} />
                </Tile>
              );
            })}
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
      {peopleKind && isOwner && user && (
        <PeopleModal kind={peopleKind} postId={p?.post_id || postId} userId={Number(user.id)} onClose={() => setPeopleKind(null)} />
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

type PeopleKind = "views" | "likes" | "comments" | "saves" | "shares" | "reposts" | "gifts" | "rewatches" | "completed";

/** Per list: its title, the summary line's head (plural / exactly one) and the empty text. */
const PEOPLE: Record<PeopleKind, { title: StringKey; head: StringKey; headOne: StringKey; empty: StringKey }> = {
  views: { title: "va_who_watched", head: "va_bd_total", headOne: "va_bd_total_one", empty: "va_no_viewers" },
  likes: { title: "va_who_liked", head: "va_bd_likes", headOne: "va_bd_likes_one", empty: "va_nobody_yet" },
  comments: { title: "va_who_commented", head: "va_bd_comments", headOne: "va_bd_comments_one", empty: "va_nobody_yet" },
  saves: { title: "va_who_saved", head: "va_bd_saves", headOne: "va_bd_saves_one", empty: "va_nobody_yet" },
  shares: { title: "va_who_shared", head: "va_bd_shares", headOne: "va_bd_shares_one", empty: "va_nobody_yet" },
  reposts: { title: "va_who_reposted", head: "va_bd_reposts", headOne: "va_bd_reposts_one", empty: "va_nobody_yet" },
  gifts: { title: "va_who_sent_gifts", head: "va_bd_gifts", headOne: "va_bd_gifts", empty: "va_nobody_yet" },
  rewatches: { title: "va_who_rewatched", head: "va_bd_rewatches", headOne: "va_bd_rewatches_one", empty: "va_nobody_yet" },
  completed: { title: "va_who_completed", head: "va_bd_completed", headOne: "va_bd_completed", empty: "va_nobody_yet" },
};
const PERIOD_KINDS: Record<string, PeopleKind> = { views: "views", likes: "likes", comments: "comments", saves: "saves", reposts: "reposts", gifts: "gifts" };

interface PersonRow {
  user_id: number; username: string | null; fullname: string | null; profile_image: string | null;
  is_verified: number; amount: number; last_at: string | null; comment: string | null;
}
/** fetchPostViewers' breakdown and fetchPostEngagers' breakdown, in one shape. */
interface Breakdown { total: number; listed: number; members: number; signed_out: number; yours: number; not_recorded: number }

/** "14 views: 9 from 5 members below · 3 not signed in · 2 before Oct 4 or not recorded" —
 *  only the parts above zero; "" when there is nothing to say. Gifts are counted in BBs. */
function breakdownLine(kind: PeopleKind, b: Breakdown, since: string | null, bbs: boolean, t: T, lang: string): string {
  const n = (v: number) => (bbs ? t("ma_n_coins", v.toLocaleString()) : v.toLocaleString());
  const parts: string[] = [];
  if (b.listed > 0) parts.push(b.members === 1 ? t("va_bd_members_one", n(b.listed)) : t("va_bd_members", n(b.listed), b.members.toLocaleString()));
  if (b.signed_out > 0) parts.push(t("va_bd_signed_out", n(b.signed_out)));
  if (b.yours > 0) parts.push(t("va_bd_yours", n(b.yours)));
  if (b.not_recorded > 0) {
    // Views always have a start date (Oct 4); for the others the server says, or sends null.
    const from = since ?? (kind === "views" ? "2026-10-04" : null);
    const m = from ? /^(\d{4})-(\d{2})-(\d{2})/.exec(from) : null;
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      let day = from!;
      try { day = d.toLocaleDateString(lang, { month: "short", day: "numeric" }); } catch { /* keep */ }
      parts.push(t(kind === "shares" ? "va_bd_before_not_recorded" : "va_bd_not_recorded", n(b.not_recorded), day));
    } else {
      parts.push(t("va_bd_not_recorded_plain", n(b.not_recorded)));
    }
  }
  if (b.total <= 0 && parts.length === 0) return "";
  const head = !bbs && b.total === 1 ? t(PEOPLE[kind].headOne, "1") : t(PEOPLE[kind].head, n(b.total));
  return parts.length ? `${head} ${parts.join(" · ")}` : head;
}

const truthy = (v: unknown) => v === true || v === 1 || v === "1" || v === "true";

/** "Who watched" / "Who liked" / ...: the signed-in members behind one number, for the video's
 *  owner only (the server refuses anyone else). Views come from fetchPostViewers, everything
 *  else from fetchPostEngagers with a kind. */
function PeopleModal({ kind, postId, userId, onClose }: { kind: PeopleKind; postId: number; userId: number; onClose: () => void }) {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const [rows, setRows] = useState<PersonRow[]>([]);
  const [start, setStart] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [since, setSince] = useState<string | null>(null);
  const [bbs, setBbs] = useState(kind === "gifts");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const meta = PEOPLE[kind];

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    const isViews = kind === "views";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    post<any>(isViews ? "fetchPostViewers" : "fetchPostEngagers",
      isViews ? { user_id: userId, post_id: postId, start, count: PAGE } : { user_id: userId, post_id: postId, kind, start, count: PAGE })
      .then((r) => {
        if (!live) return;
        if (!r.status || !r.data) { setError(r.message || t("va_viewers_error")); return; }
        const d = r.data;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const list: PersonRow[] = ((isViews ? d.viewers : d.rows) ?? []).map((v: any) => ({
          user_id: num(v.user_id), username: v.username ?? null, fullname: v.fullname ?? null,
          profile_image: v.profile_image ?? null, is_verified: num(v.is_verified),
          amount: num(isViews ? v.times : v.amount), last_at: (isViews ? v.last_viewed_at : v.last_at) ?? null,
          comment: typeof v.comment === "string" ? v.comment : null,
        }));
        setRows((cur) => (start === 0 ? list : [...cur, ...list]));
        // An older server sends no breakdown; then the line is simply not shown.
        const b = d.breakdown;
        setBreakdown(b && typeof b === "object" ? (isViews ? {
          total: num(b.total_views), listed: num(b.member_views), members: num(b.members),
          signed_out: num(b.signed_out_views), yours: num(b.your_views), not_recorded: num(b.not_recorded),
        } : {
          total: num(b.total), listed: num(b.listed), members: num(b.members),
          signed_out: num(b.signed_out), yours: num(b.yours), not_recorded: num(b.not_recorded),
        }) : null);
        setSince(typeof d.counting_since === "string" ? d.counting_since : null);
        if (!isViews && d.unit) setBbs(d.unit === "bbs");
        setHasMore(truthy(d.has_more));
      })
      .catch((e: Error) => { if (live) setError(e?.message || t("va_viewers_error")); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, postId, userId, start]);

  /** The line under the name, per list. */
  function subtitle(v: PersonRow): ReactNode {
    const amount = v.amount.toLocaleString();
    switch (kind) {
      case "views": return [v.amount > 1 ? t("va_watched_n_times", amount) : "", ago(v.last_at, lang)].filter(Boolean).join(" · ");
      case "comments": return (
        <>
          {v.comment ? <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere", color: "var(--text)" }}>{v.comment}</span> : null}
          {v.amount > 1 ? <span>{t("va_n_comments", amount)}</span> : null}
        </>
      );
      case "gifts": return t("ma_n_coins", amount);
      case "rewatches": return t("va_rewatched_n_times", amount);
      case "completed":
      case "shares": return v.amount > 1 ? t("va_n_times", amount) : "";
      default: return ago(v.last_at, lang);
    }
  }

  const line = breakdown ? breakdownLine(kind, breakdown, since, bbs, t, lang) : "";

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t(meta.title)}
        style={{ width: "100%", maxWidth: 420, maxHeight: "85vh", display: "flex", flexDirection: "column", background: "#000",
                 border: "1.5px solid var(--gold-border)", borderRadius: 16, padding: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: "var(--gold)", textAlign: "center", marginBottom: 12 }}>{t(meta.title)}</div>
        {line && (
          <div style={{ border: "1.5px solid var(--gold-border)", borderRadius: 10, padding: "8px 12px", marginBottom: 12,
                        color: "var(--gold)", fontSize: 13, fontWeight: 700, textAlign: "center", lineHeight: 1.45 }}>
            {line}
          </div>
        )}
        <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
          {rows.length === 0 && loading ? <Loading /> : error && rows.length === 0 ? <Notice error>{error}</Notice> : (
            <>
              {rows.length === 0 && <p className="muted" style={{ textAlign: "center" }}>{t(meta.empty)}</p>}
              <div style={{ display: "grid", gap: 8 }}>
                {rows.map((v, i) => {
                  const sub = subtitle(v);
                  return (
                    <button key={`${v.user_id}-${i}`} type="button" className="card row"
                      onClick={() => { onClose(); navigate(`/profile/${v.user_id}`); }}
                      style={{ padding: 10, gap: 10, width: "100%", textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" }}>
                      <Avatar user={{ id: v.user_id, fullname: v.fullname ?? undefined, username: v.username ?? undefined, profile_image: v.profile_image ?? undefined }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, color: "var(--gold)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {v.fullname || v.username || ""}
                          {v.is_verified === 2 && <span title={t("verified")} style={{ color: "#4af", marginLeft: 4 }}>✓</span>}
                        </div>
                        {v.username ? <div className="muted" style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{v.username}</div> : null}
                        {sub ? <div className="muted" style={{ fontSize: 12, display: "grid", gap: 2 }}>{sub}</div> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
              {error && rows.length > 0 && <Notice error>{error}</Notice>}
              {hasMore && (
                <button type="button" className="btn small" disabled={loading} style={{ width: "100%", marginTop: 10 }}
                  onClick={() => setStart((n) => n + PAGE)}>{loading ? "…" : t("va_load_more")}</button>
              )}
            </>
          )}
        </div>
        <button type="button" className="btn ghost" style={{ width: "100%", marginTop: 12 }} onClick={onClose}>{t("close")}</button>
      </div>
    </div>
  );
}
