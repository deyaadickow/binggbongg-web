// Creators and money (Steve, 2026-11-17): "Paid subscriptions to a creator. Paid video series.
// Scheduling posts ahead of time."
//   /subscriptions        My Subscription (the creator's offer) · My subscriptions · My subscribers
//   /series               my series + New series
//   /series/new, /series/:id/edit   create / edit a series
//   /series/:id           a series: buy it or its episodes, play the episodes in order
//   /scheduled            my scheduled videos: change the time or cancel
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { displayName, mediaUrl, type Post } from "../lib/api";
import { setFeed } from "../lib/feed";
import { useT } from "../lib/i18n";
import { PageTitle } from "../components/PageTitle";
import { Avatar, Loading, Notice } from "../components/Common";
import { showGoldAlert, showGoldConfirm } from "../components/GoldToast";
import { PriceChips, SubscribeSheet, showCreatorError, useCreatorMe } from "../components/Creators";
import { socialPut, socialUploadUrls } from "../lib/social";
import {
  PERK_KEYS, buySeries, cancelScheduledPost, cancelSubscription, createSeries, deleteSeries, devRememberFile, editSeries,
  fetchCreatorOptions, fetchCreatorPlan, fetchMyScheduledPosts, fetchMySubscribers, fetchMySubscriptions, fetchSeries,
  fetchUserSeries, localDate, localDateTime, localInputToUnix, parseUtc, rescheduleScheduledPost, saveCreatorPlan,
  scheduleProblem, subscribeToCreator, toLocalInput, truthy, type CreatorOptions, type Perks, type Pricing, type ScheduledPost,
  type Series, type SubscriberRow, type SubscriberTotals, type SubscriptionRow,
} from "../lib/creators";

type T = ReturnType<typeof useT>["t"];

function SignInCard({ from }: { from: string }) {
  const { t } = useT();
  return (
    <div className="card pad center">
      <p className="cm-gold">{t("cm_sign_in_first")}</p>
      <Link to="/login" state={{ from }} className="btn gold">{t("fnd_sign_in")}</Link>
    </div>
  );
}

export function seriesPriceLabel(t: T, s: Pick<Series, "pricing" | "series_price_bbs" | "episode_price_bbs">): string {
  if (s.pricing === "free") return t("cm_free");
  if (s.pricing === "series") return `${s.series_price_bbs ?? 0} BBs`;
  if (s.pricing === "episode") return t("cm_per_episode", s.episode_price_bbs ?? 0);
  return `${s.series_price_bbs ?? 0} BBs · ${t("cm_per_episode", s.episode_price_bbs ?? 0)}`;
}

/** A grid of series cards (profile Series tab, /series). */
export function SeriesGrid({ series }: { series: Series[] }) {
  const { t } = useT();
  if (!series.length) return <p className="muted center" style={{ padding: "24px 0" }}>{t("cm_no_series")}</p>;
  return (
    <div className="playlist-grid">
      {series.map((s) => {
        const cover = s.cover || s.first_thumbnail;
        return (
          <Link key={s.id} to={`/series/${s.id}`} className="playlist-card" style={{ color: "inherit" }}>
            <span className="playlist-cover">
              {cover ? <img src={mediaUrl(cover)} alt="" loading="lazy" /> : <span>🎬</span>}
              <span className="cm-series-price">{truthy(s.owned) ? t("cm_owned") : seriesPriceLabel(t, s)}</span>
            </span>
            <div className="playlist-title">{s.title}</div>
            <div className="muted" style={{ fontSize: 12, textAlign: "center" }}>{t("cm_n_episodes", s.episodes_count ?? 0)}</div>
          </Link>
        );
      })}
    </div>
  );
}

// ---- /subscriptions ------------------------------------------------------------------------------

type SubTab = "settings" | "mine" | "subscribers";

export function SubscriptionsPage() {
  const { t } = useT();
  const me = useCreatorMe();
  const [params, setParams] = useSearchParams();
  const wanted = params.get("tab");
  const tab: SubTab = wanted === "mine" || wanted === "subscribers" ? wanted : "settings";
  const go = (k: SubTab) => setParams(k === "settings" ? {} : { tab: k }, { replace: true });
  return (
    <div className="page" style={{ maxWidth: 680 }}>
      <PageTitle>{t("cm_subscriptions")}</PageTitle>
      <div className="cm-tabs" role="tablist">
        {([["settings", "cm_my_subscription"], ["mine", "cm_my_subscriptions"], ["subscribers", "cm_my_subscribers"]] as const).map(([k, key]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "active" : ""} onClick={() => go(k)}>{t(key)}</button>
        ))}
      </div>
      {!me ? <SignInCard from="/subscriptions" /> : tab === "settings" ? <CreatorSettings myId={me.id} onSubscribers={() => go("subscribers")} />
        : tab === "mine" ? <MySubscriptions myId={me.id} /> : <MySubscribers myId={me.id} />}
    </div>
  );
}

function CreatorSettings({ myId, onSubscribers }: { myId: number; onSubscribers: () => void }) {
  const { t } = useT();
  const navigate = useNavigate();
  const [opts, setOpts] = useState<CreatorOptions | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [price, setPrice] = useState<number | null>(null);
  const [perks, setPerks] = useState<Perks>({ videos: 1, series: 0, badge: 1, lives: 0 });
  const [extra, setExtra] = useState<string[]>([]);
  const [welcome, setWelcome] = useState("");
  const [active, setActive] = useState(true);
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchCreatorOptions(), fetchCreatorPlan(myId).catch(() => null)]).then(([o, info]) => {
      if (!alive) return;
      setOpts(o);
      const p = info?.plan;
      if (p) {
        setPrice(p.price_bbs); setPerks(p.perks); setExtra(p.extra_perks); setWelcome(p.welcome_message ?? "");
        setActive(!!p.is_active); setCount(p.subscribers_count ?? 0);
      } else {
        setPrice(o.sub_prices[1] ?? o.sub_prices[0] ?? null);
      }
      setLoaded(true);
    });
    return () => { alive = false; };
  }, [myId]);

  async function save() {
    if (busy || !price) return;
    if (!PERK_KEYS.some((k) => perks[k]) && !extra.some((x) => x.trim())) { showGoldAlert(t("cm_need_a_perk")); return; }
    setBusy(true);
    try {
      const plan = await saveCreatorPlan(myId, { price, perks, extra, welcome, active });
      setCount(plan.subscribers_count ?? count);
      setExtra(plan.extra_perks);
      showGoldAlert(t("cm_saved"));
    } catch (e) {
      await showCreatorError(e, navigate);
    } finally {
      setBusy(false);
    }
  }

  if (!loaded || !opts) return <Loading />;
  return (
    <div>
      <div className="card pad cm-gold" style={{ marginBottom: 12, textAlign: "center" }}>{t("cm_settings_explain")}</div>
      {count !== null && (
        <button className="card pad cm-row-btn" onClick={onSubscribers}>
          <span>{t("cm_n_subscribers", count)}</span><span>{t("cm_my_subscribers")} ›</span>
        </button>
      )}
      <div className="card pad" style={{ marginBottom: 12 }}>
        <div className="cm-label">{t("cm_monthly_price")}</div>
        <PriceChips prices={opts.sub_prices} value={price} onChange={setPrice} perMonth />
      </div>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="cm-label" style={{ padding: "12px 14px 0" }}>{t("cm_what_subscribers_get")}</div>
        {opts.perks.map((p) => (
          <label key={p.key} className="row cm-switch-row">
            <div style={{ flex: 1 }}>{p.label}</div>
            <input type="checkbox" className="switch" checked={!!perks[p.key]} onChange={(e) => setPerks({ ...perks, [p.key]: e.target.checked ? 1 : 0 })} />
          </label>
        ))}
      </div>
      <div className="card pad" style={{ marginBottom: 12 }}>
        <div className="cm-label">{t("cm_your_own_perks")}</div>
        {extra.map((line, i) => (
          <div key={i} className="row" style={{ gap: 8, marginBottom: 8 }}>
            <input className="input" style={{ flex: 1 }} maxLength={80} value={line} placeholder={t("cm_perk_placeholder")}
              onChange={(e) => setExtra(extra.map((x, j) => (j === i ? e.target.value : x)))} />
            <button className="btn small" aria-label={t("cm_remove")} onClick={() => setExtra(extra.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        {extra.length < opts.max_extra_perks && (
          <button className="btn small" onClick={() => setExtra([...extra, ""])}>{t("cm_add_a_perk")}</button>
        )}
      </div>
      <div className="card pad" style={{ marginBottom: 12 }}>
        <div className="cm-label">{t("cm_welcome_message")}</div>
        <textarea className="input" rows={3} maxLength={300} value={welcome} placeholder={t("cm_welcome_placeholder")}
          onChange={(e) => setWelcome(e.target.value)} style={{ width: "100%" }} />
        <div className="muted" style={{ fontSize: 12, textAlign: "right" }}>{welcome.length}/300</div>
      </div>
      <div className="card" style={{ marginBottom: 12 }}>
        <label className="row cm-switch-row">
          <div style={{ flex: 1 }}>{t("cm_subscriptions_on")}</div>
          <input type="checkbox" className="switch" checked={active} onChange={(e) => setActive(e.target.checked)} />
        </label>
      </div>
      <button className="btn gold block" disabled={busy || !price} onClick={() => void save()}>{busy ? "…" : t("soc_save")}</button>
    </div>
  );
}

function MySubscriptions({ myId }: { myId: number }) {
  const { t } = useT();
  const navigate = useNavigate();
  const [rows, setRows] = useState<SubscriptionRow[] | null>(null);
  const [error, setError] = useState("");
  const load = () => fetchMySubscriptions(myId).then(setRows).catch((e) => { setError((e as Error).message); setRows([]); });
  useEffect(() => { void load(); }, [myId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function cancel(r: SubscriptionRow) {
    const yes = await showGoldConfirm({ message: t("cm_cancel_q", localDate(r.current_period_end)), confirmLabel: t("cm_cancel_subscription"), cancelLabel: t("cm_keep_it"), danger: true });
    if (!yes) return;
    try { showGoldAlert(await cancelSubscription(myId, r.creator.id) || t("cm_cancelled")); void load(); } catch (e) { await showCreatorError(e, navigate); }
  }
  async function renew(r: SubscriptionRow) {
    try { const res = await subscribeToCreator(myId, r.creator.id); showGoldAlert(res.message || t("cm_subscribed")); void load(); } catch (e) { await showCreatorError(e, navigate); }
  }

  if (rows === null) return <Loading />;
  if (error) return <Notice error>{error}</Notice>;
  if (!rows.length) return (
    <div className="card pad center">
      <p className="cm-gold">{t("cm_no_subscriptions")}</p>
      <Link to="/" className="btn gold">{t("cm_find_creators")}</Link>
    </div>
  );
  return (
    <div className="cm-list">
      {rows.map((r) => {
        const paid = truthy(r.is_paid_up) && r.status !== "expired";
        return (
          <div key={r.creator.id} className="card cm-person">
            <Link to={`/profile/${r.creator.id}`}><Avatar user={r.creator} /></Link>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Link to={`/profile/${r.creator.id}`} className="cm-name">{displayName(r.creator)}</Link>
              <div className="cm-sub-line">{t("cm_price_month", r.price_bbs)}</div>
              <div className="cm-sub-line">{!paid ? t("cm_expired") : truthy(r.renews) ? t("cm_renews_on", localDate(r.current_period_end)) : t("cm_ends_on", localDate(r.current_period_end))}</div>
            </div>
            {paid && truthy(r.renews)
              ? <button className="btn small" onClick={() => void cancel(r)}>{t("cancel")}</button>
              : <button className="btn small gold" onClick={() => void renew(r)}>{t("cm_renew")}</button>}
          </div>
        );
      })}
    </div>
  );
}

function MySubscribers({ myId }: { myId: number }) {
  const { t } = useT();
  const [data, setData] = useState<{ rows: SubscriberRow[]; totals: SubscriberTotals } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { fetchMySubscribers(myId).then(setData).catch((e) => { setError((e as Error).message); }); }, [myId]);
  if (error) return <Notice error>{error}</Notice>;
  if (!data) return <Loading />;
  return (
    <div>
      <div className="cm-totals">
        <div className="card pad"><b>{data.totals.subscribers}</b><span>{t("cm_subscribers")}</span></div>
        <div className="card pad"><b>{t("cm_n_bbs", data.totals.bbs_this_month)}</b><span>{t("cm_this_month")}</span></div>
        <div className="card pad"><b>{t("cm_n_bbs", data.totals.bbs_all_time)}</b><span>{t("cm_all_time")}</span></div>
      </div>
      {(data.totals.subscription_bbs_this_month || data.totals.series_bbs_this_month) ? (
        <p className="cm-gold center" style={{ fontSize: 13 }}>
          {t("cm_split_line", data.totals.subscription_bbs_this_month ?? 0, data.totals.series_bbs_this_month ?? 0)}
        </p>
      ) : null}
      {!data.rows.length ? (
        <div className="card pad center">
          <p className="cm-gold">{t("cm_no_subscribers")}</p>
          <Link to="/subscriptions" className="btn gold">{t("cm_my_subscription")}</Link>
        </div>
      ) : (
        <div className="cm-list">
          {data.rows.map((r) => (
            <Link key={r.subscriber.id} to={`/profile/${r.subscriber.id}`} className="card cm-person" style={{ color: "inherit" }}>
              <Avatar user={r.subscriber} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="cm-name">{displayName(r.subscriber)}</div>
                <div className="cm-sub-line">{t("cm_since", localDate(r.started_at))} · {t("cm_price_month", r.price_bbs)}</div>
              </div>
              <span className="pill">{r.status === "active" ? t("cm_active") : r.status === "cancelled" ? t("cm_cancelled_short") : t("cm_expired")}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- /series -------------------------------------------------------------------------------------

export function MySeriesPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const me = useCreatorMe();
  const [rows, setRows] = useState<Series[] | null>(null);
  useEffect(() => { if (me) fetchUserSeries(me.id).then(setRows).catch(() => setRows([])); }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <PageTitle>{t("cm_my_series")}</PageTitle>
      {!me ? <SignInCard from="/series" /> : (
        <>
          <div className="card pad cm-gold" style={{ marginBottom: 12, textAlign: "center" }}>{t("cm_series_explain")}</div>
          <button className="btn gold block" style={{ marginBottom: 12 }} onClick={() => navigate("/series/new")}>{t("cm_new_series")}</button>
          {rows === null ? <Loading /> : <SeriesGrid series={rows} />}
        </>
      )}
    </div>
  );
}

export function SeriesPage() {
  const { t } = useT();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const me = useCreatorMe();
  const [s, setS] = useState<Series | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(false);

  const load = () => fetchSeries(Number(id)).then(setS).catch((e) => { setError((e as Error).message); setS(null); });
  useEffect(() => { setS(undefined); void load(); }, [id, me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isOwner = !!me && !!s && me.id === Number(s.creator_id);
  const eps = s?.episodes ?? [];

  async function buy(postId?: number) {
    if (!s) return;
    if (!me) { navigate("/login", { state: { from: location.pathname } }); return; }
    const price = postId ? s.episode_price_bbs : s.series_price_bbs;
    const ep = postId ? eps.findIndex((p) => p.id === postId) + 1 : 0;
    const yes = await showGoldConfirm({
      message: postId ? t("cm_unlock_episode_q", ep, price ?? 0) : t("cm_buy_series_q", s.title, price ?? 0),
      confirmLabel: postId ? t("cm_unlock_episode") : t("cm_buy_series"), cancelLabel: t("cancel"),
    });
    if (!yes) return;
    setBusy(true);
    try {
      const r = await buySeries(me.id, s.id, postId);
      showGoldAlert(r.message || t("cm_unlocked"));
      await load();
    } catch (e) {
      await showCreatorError(e, navigate);
    } finally {
      setBusy(false);
    }
  }

  function play(p: Post) {
    setFeed(eps); // the normal player steps through the episodes in order
    navigate(`/video/${p.id}`);
  }

  async function remove() {
    if (!s || !me) return;
    const yes = await showGoldConfirm({ message: t("cm_delete_series_q", s.title), confirmLabel: t("soc_delete"), cancelLabel: t("cancel"), danger: true });
    if (!yes) return;
    try { showGoldAlert(await deleteSeries(me.id, s.id) || t("cm_deleted")); navigate("/series"); } catch (e) { await showCreatorError(e, navigate); }
  }

  if (s === undefined) return <div className="page"><Loading /></div>;
  if (!s) return <div className="page"><PageTitle>{t("cm_series")}</PageTitle><Notice error>{error || t("soc_not_found")}</Notice></div>;
  const owned = truthy(s.owned);
  const canSeries = !owned && !isOwner && (s.pricing === "series" || s.pricing === "both") && !!s.series_price_bbs;
  const canEpisode = !owned && !isOwner && (s.pricing === "episode" || s.pricing === "both") && !!s.episode_price_bbs;
  const cover = s.cover || s.first_thumbnail;
  const firstPlayable = eps.find((p) => !p.locked);
  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <PageTitle>{t("cm_series")}</PageTitle>
      <div className="card cm-series-head">
        {cover ? <img src={mediaUrl(cover)} alt="" /> : <div className="cm-series-cover-empty">🎬</div>}
        <div style={{ padding: 14 }}>
          <h2 className="cm-series-title">{s.title}</h2>
          {s.creator && (
            <Link to={`/profile/${s.creator_id}`} className="row" style={{ gap: 8, color: "var(--gold)", marginBottom: 8 }}>
              <Avatar user={s.creator} /> <b>{displayName(s.creator)}</b>
            </Link>
          )}
          {s.description && <p className="cm-gold" style={{ whiteSpace: "pre-wrap", margin: "0 0 10px" }}>{s.description}</p>}
          <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <span className="pill">{t("cm_n_episodes", eps.length)}</span>
            <span className="pill">{owned ? t("cm_owned") : seriesPriceLabel(t, s)}</span>
            {!!s.first_episode_free && s.pricing !== "free" && <span className="pill">{t("cm_first_free_pill")}</span>}
            {!!s.free_for_subscribers && <span className="pill">{t("cm_free_for_subscribers")}</span>}
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {firstPlayable && <button className="btn gold" onClick={() => play(firstPlayable)}>▶ {t("cm_play")}</button>}
            {canSeries && <button className="btn gold" disabled={busy} onClick={() => void buy()}>{t("cm_buy_series")} · {s.series_price_bbs} BBs</button>}
            {!owned && !isOwner && !!s.free_for_subscribers && !truthy(s.is_subscribed) && (
              <button className="btn" onClick={() => setSheet(true)}>{t("cm_subscribe")}</button>
            )}
            {isOwner && (
              <>
                <button className="btn gold" onClick={() => navigate("/upload", { state: { seriesId: s.id } })}>{t("cm_add_episode")}</button>
                <button className="btn" onClick={() => navigate(`/series/${s.id}/edit`)}>{t("soc_edit")}</button>
                <button className="btn" onClick={() => void remove()}>{t("soc_delete")}</button>
              </>
            )}
          </div>
        </div>
      </div>
      {!eps.length ? (
        <p className="muted center" style={{ padding: "24px 0" }}>{t("cm_no_episodes")}</p>
      ) : (
        <div className="cm-list" style={{ marginTop: 12 }}>
          {eps.map((p, i) => {
            const locked = !!p.locked;
            const ownedEp = (s.owned_episode_ids ?? []).includes(p.id);
            return (
              <div key={p.id} className={`card cm-episode${locked ? " locked" : ""}`} role="button" tabIndex={0}
                onClick={() => (locked ? undefined : play(p))} onKeyDown={(e) => { if (e.key === "Enter" && !locked) play(p); }}>
                <div className="cm-episode-thumb">
                  {p.thumbnail ? <img src={mediaUrl(p.thumbnail)} alt="" loading="lazy" /> : <span>🎬</span>}
                  {locked ? <span className="cm-lock-badge">🔒</span> : <span className="cm-episode-play">▶</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="cm-name">{t("cm_episode_n", i + 1)}</div>
                  {p.description && <div className="cm-sub-line" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.description}</div>}
                  <div className="cm-sub-line">{locked ? t("cm_locked") : ownedEp ? t("cm_owned") : i === 0 && s.first_episode_free ? t("cm_free") : ""}</div>
                </div>
                {locked && canEpisode && (
                  <button className="btn small gold" disabled={busy} onClick={(e) => { e.stopPropagation(); void buy(p.id); }}>
                    {t("cm_unlock")} · {s.episode_price_bbs} BBs</button>
                )}
                {locked && !canEpisode && canSeries && (
                  <button className="btn small" disabled={busy} onClick={(e) => { e.stopPropagation(); void buy(); }}>{t("cm_buy_series")}</button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {sheet && <SubscribeSheet creatorId={s.creator_id} creatorName={s.creator ? displayName(s.creator) : undefined}
        onClose={() => setSheet(false)} onChanged={() => void load()} />}
    </div>
  );
}

const PRICINGS: { key: Pricing; label: "cm_sold_series" | "cm_sold_episode" | "cm_sold_both" | "cm_sold_free" }[] = [
  { key: "series", label: "cm_sold_series" }, { key: "episode", label: "cm_sold_episode" },
  { key: "both", label: "cm_sold_both" }, { key: "free", label: "cm_sold_free" },
];

export function SeriesEditPage() {
  const { t } = useT();
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const location = useLocation();
  const back = (location.state as { back?: string } | null)?.back;
  const me = useCreatorMe();
  const [opts, setOpts] = useState<CreatorOptions | null>(null);
  const [loaded, setLoaded] = useState(!editing);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pricing, setPricing] = useState<Pricing>("series");
  const [seriesPrice, setSeriesPrice] = useState<number | null>(null);
  const [episodePrice, setEpisodePrice] = useState<number | null>(null);
  const [firstFree, setFirstFree] = useState(true);
  const [freeSubs, setFreeSubs] = useState(false);
  const [cover, setCover] = useState<File | null>(null);
  const [coverShown, setCoverShown] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchCreatorOptions().then((o) => {
      setOpts(o);
      setSeriesPrice((v) => v ?? o.series_prices[1] ?? o.series_prices[0] ?? null);
      setEpisodePrice((v) => v ?? o.episode_prices[1] ?? o.episode_prices[0] ?? null);
    });
    if (editing) {
      fetchSeries(Number(id)).then((s) => {
        setTitle(s.title); setDescription(s.description ?? ""); setPricing(s.pricing);
        if (s.series_price_bbs) setSeriesPrice(s.series_price_bbs);
        if (s.episode_price_bbs) setEpisodePrice(s.episode_price_bbs);
        setFirstFree(!!s.first_episode_free); setFreeSubs(!!s.free_for_subscribers);
        setCoverShown(s.cover ? mediaUrl(s.cover) : "");
        setLoaded(true);
      }).catch((e) => { showGoldAlert((e as Error).message); navigate("/series"); });
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const coverPreview = useMemo(() => (cover ? URL.createObjectURL(cover) : coverShown), [cover, coverShown]);

  async function save() {
    if (!me || busy) return;
    if (!title.trim()) { showGoldAlert(t("cm_title_needed")); return; }
    setBusy(true);
    try {
      let coverKey: string | null = null;
      if (cover) {
        const safe = cover.name.replace(/[^A-Za-z0-9._-]/g, "_") || "cover.jpg";
        // Dev server: the cover never goes to S3 either (the mock keeps it in this page's memory).
        const [slot] = await socialUploadUrls(me.id, [{ file_name: safe, content_type: cover.type || "image/jpeg" }], import.meta.env.DEV);
        if (!slot) throw new Error(t("couldn_t_prepare_the_upload_please_try_a"));
        await socialPut(slot, cover);
        await devRememberFile(slot.key, cover);
        coverKey = slot.key;
      }
      const input = { title, description, cover: coverKey, pricing, seriesPrice, episodePrice, firstFree, freeForSubscribers: freeSubs };
      const s = editing ? await editSeries(me.id, Number(id), input) : await createSeries(me.id, input);
      if (back === "upload") navigate("/upload", { state: { seriesId: s.id } });
      else navigate(`/series/${s.id}`, { replace: true });
    } catch (e) {
      await showCreatorError(e, navigate);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 680 }}>
      <PageTitle>{editing ? t("cm_edit_series") : t("cm_new_series")}</PageTitle>
      {!me ? <SignInCard from={location.pathname} /> : !loaded || !opts ? <Loading /> : (
        <>
          <div className="card pad" style={{ marginBottom: 12 }}>
            <div className="cm-label">{t("cm_title")}</div>
            <input className="input" style={{ width: "100%", marginBottom: 10 }} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("cm_title_placeholder")} />
            <div className="cm-label">{t("_description")}</div>
            <textarea className="input" rows={3} maxLength={500} style={{ width: "100%", marginBottom: 10 }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("cm_description_placeholder")} />
            <div className="cm-label">{t("cm_cover")}</div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) setCover(f); }} />
            <div className="row" style={{ gap: 12, alignItems: "center" }}>
              <button type="button" className="cm-cover-pick" onClick={() => fileRef.current?.click()}>
                {coverPreview ? <img src={coverPreview} alt="" /> : <span>🖼️</span>}
              </button>
              <button className="btn small" onClick={() => fileRef.current?.click()}>{coverPreview ? t("change") : t("cm_choose_cover")}</button>
            </div>
          </div>
          <div className="card pad" style={{ marginBottom: 12 }}>
            <div className="cm-label">{t("cm_how_sold")}</div>
            <div className="cm-chips">
              {PRICINGS.map((p) => (
                <button key={p.key} type="button" className={`cm-chip${pricing === p.key ? " active" : ""}`} onClick={() => setPricing(p.key)}>{t(p.label)}</button>
              ))}
            </div>
            {(pricing === "series" || pricing === "both") && (
              <>
                <div className="cm-label" style={{ marginTop: 12 }}>{t("cm_whole_series_price")}</div>
                <PriceChips prices={opts.series_prices} value={seriesPrice} onChange={setSeriesPrice} />
              </>
            )}
            {(pricing === "episode" || pricing === "both") && (
              <>
                <div className="cm-label" style={{ marginTop: 12 }}>{t("cm_episode_price")}</div>
                <PriceChips prices={opts.episode_prices} value={episodePrice} onChange={setEpisodePrice} />
              </>
            )}
          </div>
          <div className="card" style={{ marginBottom: 12 }}>
            <label className="row cm-switch-row">
              <div style={{ flex: 1 }}>{t("cm_first_episode_free")}</div>
              <input type="checkbox" className="switch" checked={firstFree} onChange={(e) => setFirstFree(e.target.checked)} />
            </label>
            <label className="row cm-switch-row">
              <div style={{ flex: 1 }}>{t("cm_free_for_my_subscribers")}</div>
              <input type="checkbox" className="switch" checked={freeSubs} onChange={(e) => setFreeSubs(e.target.checked)} />
            </label>
          </div>
          <button className="btn gold block" disabled={busy} onClick={() => void save()}>{busy ? "…" : editing ? t("soc_save") : t("cm_create_series")}</button>
        </>
      )}
    </div>
  );
}

// ---- /scheduled ----------------------------------------------------------------------------------

export function ScheduledPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const me = useCreatorMe();
  const [rows, setRows] = useState<ScheduledPost[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ id: number; value: string } | null>(null);
  const [opts, setOpts] = useState<CreatorOptions | null>(null);
  const load = () => { if (me) fetchMyScheduledPosts(me.id).then(setRows).catch((e) => { setError((e as Error).message); setRows([]); }); };
  useEffect(() => { load(); fetchCreatorOptions().then(setOpts); }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveTime() {
    if (!me || !editing || !opts) return;
    const unix = localInputToUnix(editing.value);
    const why = scheduleProblem(unix, opts);
    if (why) { showGoldAlert(why === "soon" ? t("cm_too_soon", opts.schedule_min_minutes) : t("cm_too_far", opts.schedule_max_days)); return; }
    try { showGoldAlert(await rescheduleScheduledPost(me.id, editing.id, unix) || t("cm_time_changed")); setEditing(null); load(); } catch (e) { await showCreatorError(e, navigate); }
  }
  async function cancel(r: ScheduledPost) {
    if (!me) return;
    const yes = await showGoldConfirm({ message: t("cm_cancel_scheduled_q"), confirmLabel: t("cm_cancel_post"), cancelLabel: t("cm_keep_it"), danger: true });
    if (!yes) return;
    try { showGoldAlert(await cancelScheduledPost(me.id, r.id) || t("cm_cancelled")); load(); } catch (e) { await showCreatorError(e, navigate); }
  }

  const minInput = toLocalInput(new Date(Date.now() + ((opts?.schedule_min_minutes ?? 5) + 1) * 60_000));
  const maxInput = toLocalInput(new Date(Date.now() + (opts?.schedule_max_days ?? 60) * 86400_000));
  return (
    <div className="page" style={{ maxWidth: 680 }}>
      <PageTitle>{t("cm_scheduled_posts")}</PageTitle>
      {!me ? <SignInCard from="/scheduled" /> : (
        <>
          <button className="btn gold block" style={{ marginBottom: 12 }} onClick={() => navigate("/upload")}>{t("cm_schedule_a_video")}</button>
          {rows === null ? <Loading /> : error ? <Notice error>{error}</Notice> : !rows.length ? (
            <p className="muted center" style={{ padding: "24px 0" }}>{t("cm_no_scheduled")}</p>
          ) : (
            <div className="cm-list">
              {rows.map((r) => {
                const thumb = r.thumbnail_url || r.thumbnail;
                const isEditing = editing?.id === r.id;
                return (
                  <div key={r.id} className="card cm-sched">
                    <div className="cm-episode-thumb">{thumb ? <img src={mediaUrl(thumb)} alt="" /> : <span>🎬</span>}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="cm-name" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.description || t("cm_no_description")}</div>
                      <div className="cm-sub-line">🗓 {localDateTime(r.publish_at)}</div>
                      <span className={`pill${r.status === "failed" ? " cm-failed" : ""}`} style={{ marginTop: 4 }}>
                        {r.status === "failed" ? t("cm_status_failed") : r.status === "publishing" ? t("cm_status_publishing") : t("cm_status_pending")}
                      </span>
                      {r.status === "failed" && r.error && <div className="cm-error">{r.error}</div>}
                      {isEditing ? (
                        <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                          <input type="datetime-local" className="input cm-datetime" min={minInput} max={maxInput} value={editing.value}
                            onChange={(e) => setEditing({ id: r.id, value: e.target.value })} />
                          <button className="btn small gold" onClick={() => void saveTime()}>{t("soc_save")}</button>
                          <button className="btn small ghost" onClick={() => setEditing(null)}>{t("cancel")}</button>
                        </div>
                      ) : r.status !== "publishing" && (
                        <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                          <button className="btn small" onClick={() => {
                            const d = parseUtc(r.publish_at);
                            const start = d && d.getTime() > Date.now() + 6 * 60_000 ? d : new Date(Date.now() + 3600_000);
                            setEditing({ id: r.id, value: toLocalInput(start) });
                          }}>{t("cm_change_time")}</button>
                          <button className="btn small" onClick={() => void cancel(r)}>{t("cancel")}</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
