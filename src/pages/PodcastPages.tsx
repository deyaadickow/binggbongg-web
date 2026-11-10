// Bingg Bongg Podcast on the web (Steve, 2026-11-10: "I wanna do what people want. Podcast with
// audio and video. 'Bingg Bongg Podcast'. If it's going to make us money, let's do it.").
//
//   /podcasts                 tabs Live now / Latest / Following / Top
//   /podcasts/episode/:id     the episode player (pre-roll ad first, when there is one)
//   /podcasts/start           Start a Podcast: title, description, Video/Audio, optional cover
//
// The episode keeps playing in the site-wide player (lib/podcastPlayer) when the member leaves
// the page; the mini bar carries it. Fail-safe throughout: switched off or a failed call shows a
// gold notice, never a crash.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { mediaUrl, post, type Gift } from "../lib/api";
import { useSession } from "../lib/session";
import { useT, type StringKey } from "../lib/i18n";
import { Avatar, Loading, Notice } from "../components/Common";
import { PageTitle } from "../components/PageTitle";
import { GiftFlash, GiftSheet } from "../components/GiftSheet";
import { ReportDialog } from "../components/ReportDialog";
import { showGoldAlert, showGoldConfirm } from "../components/GoldToast";
import { EpisodeCard, LivePodcastCard, PodcastCover } from "../components/PodcastBits";
import { requireVerified } from "../lib/verifyEmail";
import {
  deletePodcastEpisode, fetchPodcastEpisode, fetchPodcastPreroll, fetchPodcasts, followPodcast, formatDuration,
  giftPodcastEpisode, hostName, startPodcast, usePodcastEnabled, yes,
  type LivePodcast, type PodcastEpisode, type PodcastEpisodeDetail, type PodcastKind, type PodcastPreroll, type PodcastTab,
} from "../lib/podcast";
import { PODCAST_RATES, usePodcastPlayer } from "../lib/podcastPlayer";

const TABS: { tab: PodcastTab; label: StringKey; empty: StringKey }[] = [
  { tab: "live", label: "pod_tab_live", empty: "pod_none_live" },
  { tab: "latest", label: "pod_tab_latest", empty: "pod_none_latest" },
  { tab: "following", label: "pod_tab_following", empty: "pod_none_following" },
  { tab: "top", label: "pod_tab_top", empty: "pod_none_top" },
];

// ---- /podcasts --------------------------------------------------------------------------------

export function PodcastsPage() {
  const { t } = useT();
  const { user, isLoggedIn } = useSession();
  const myId = user?.id ?? 0;
  const [search, setSearch] = useSearchParams();
  const tab = (TABS.find((x) => x.tab === search.get("tab"))?.tab ?? "latest") as PodcastTab;
  const [rows, setRows] = useState<(PodcastEpisode | LivePodcast)[] | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let live = true;
    setRows(null);
    fetchPodcasts(myId, tab, 0).then((r) => {
      if (!live) return;
      setEnabled(r.enabled);
      setRows(r.data);
      setHasMore(r.hasMore);
    });
    return () => { live = false; };
  }, [myId, tab]);

  async function more() {
    if (!rows) return;
    setLoadingMore(true);
    const r = await fetchPodcasts(myId, tab, rows.length);
    setLoadingMore(false);
    setRows([...rows, ...r.data]);
    setHasMore(r.hasMore);
  }

  const empty = TABS.find((x) => x.tab === tab)!.empty;
  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <PageTitle right={enabled && isLoggedIn ? <Link to="/podcasts/start" className="btn small gold">{t("pod_start")}</Link> : undefined}>
        {t("pod_title")}</PageTitle>
      {/* The podcast API is members-only: a signed-out visitor gets a way in, not "not available". */}
      {!isLoggedIn ? (
        <div className="card pad" style={{ textAlign: "center", background: "rgba(0,0,0,.88)" }}>
          <p style={{ margin: "0 0 12px" }}>{t("pod_sign_in_listen")}</p>
          <Link to="/login" state={{ from: "/podcasts" }} className="btn gold">{t("sign_in")}</Link>
        </div>
      ) : !enabled ? <Notice>{t("pod_off")}</Notice> : (
        <>
          <div className="tabs">
            {TABS.map((x) => (
              <button key={x.tab} className={x.tab === tab ? "active" : ""} onClick={() => setSearch({ tab: x.tab }, { replace: true })}>
                {t(x.label)}</button>
            ))}
          </div>
          {rows === null ? <Loading /> : rows.length === 0 ? (
            <Notice>{tab === "following" && !isLoggedIn ? t("pod_sign_in_listen") : t(empty)}</Notice>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {tab === "live"
                ? (rows as LivePodcast[]).map((p) => <LivePodcastCard key={p.podcast_id} p={p} />)
                : (rows as PodcastEpisode[]).map((e) => <EpisodeCard key={e.episode_id} e={e} />)}
              {hasMore && <button className="btn ghost" disabled={loadingMore} onClick={() => void more()}>{t("pod_load_more")}</button>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---- Pre-roll ---------------------------------------------------------------------------------

/**
 * The sponsor's video before an episode: full screen, "Skip in 5…" then "Skip ›", "Sponsored ·
 * {advertiser}", Visit website. Rendered (hidden) as soon as the ad is known, so the tap on Play
 * can start it inside the same gesture and the browser lets it play WITH sound.
 */
function PrerollOverlay({ ad, open, myId, videoRef, onDone }: {
  ad: PodcastPreroll; open: boolean; myId: number;
  videoRef: React.RefObject<HTMLVideoElement | null>; onDone: () => void;
}) {
  const { t } = useT();
  const skipAfter = Math.max(0, Number(ad.skip_after_s ?? 5));
  const [left, setLeft] = useState(skipAfter);
  const counted = useRef(false);
  const started = useRef(false);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => {
      if (started.current) setLeft((n) => Math.max(0, n - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [open]);

  const visit = () => {
    if (!ad.click_url) return;
    post("recordVideoAdClick", { my_user_id: myId, video_ad_id: ad.id }).catch(() => undefined);
    window.open(ad.click_url, "_blank", "noopener,noreferrer");
  };
  const chip: React.CSSProperties = {
    background: "rgba(0,0,0,.85)", color: "var(--gold)", border: "1.5px solid var(--gold)", borderRadius: 999,
    padding: "6px 14px", fontWeight: 800, fontSize: 14,
  };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 120, background: "#000", display: open ? "grid" : "none", placeItems: "center" }}
      role="dialog" aria-label={t("pa_sponsored")}>
      <video ref={videoRef} src={mediaUrl(ad.video_url)} poster={ad.thumb_url ? mediaUrl(ad.thumb_url) : undefined} playsInline preload="auto"
        style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
        onPlaying={() => {
          started.current = true;
          if (!counted.current) {
            counted.current = true;
            post("recordVideoAdImpression", { my_user_id: myId, video_ad_id: ad.id }).catch(() => undefined);
          }
        }}
        onEnded={onDone} onError={onDone} />
      <span style={{ ...chip, position: "absolute", top: "calc(14px + env(safe-area-inset-top))", left: 14 }}>
        {ad.advertiser_name ? t("pod_sponsored_by", ad.advertiser_name) : t("pa_sponsored")}</span>
      {ad.click_url && (
        <button type="button" className="btn gold" onClick={visit}
          style={{ position: "absolute", left: 14, bottom: "calc(18px + env(safe-area-inset-bottom))" }}>{t("pa_visit")}</button>
      )}
      <button type="button" disabled={left > 0} onClick={onDone}
        style={{ ...chip, position: "absolute", right: 14, bottom: "calc(18px + env(safe-area-inset-bottom))", cursor: left > 0 ? "default" : "pointer", opacity: left > 0 ? 0.85 : 1 }}>
        {left > 0 ? t("pod_skip_in", left) : t("pod_skip")}</button>
    </div>
  );
}

// ---- /podcasts/episode/:id --------------------------------------------------------------------

export function PodcastEpisodePage() {
  const { t } = useT();
  const { id } = useParams();
  const episodeId = Number(id ?? 0);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoggedIn } = useSession();
  const myId = user?.id ?? 0;
  const player = usePodcastPlayer();
  const [ep, setEp] = useState<PodcastEpisodeDetail | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing" | "off" | "error">("loading");
  const [following, setFollowing] = useState(false);
  const [followers, setFollowers] = useState(0);
  const [followBusy, setFollowBusy] = useState(false);
  const [gifts, setGifts] = useState({ coins: 0, count: 0 });
  const [giftOpen, setGiftOpen] = useState(false);
  const [flash, setFlash] = useState<Gift | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [preroll, setPreroll] = useState<PodcastPreroll | null>(null);
  const [prerollOpen, setPrerollOpen] = useState(false);
  const prerollDone = useRef(false);
  const prerollVideo = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!episodeId) { setState("missing"); return; }
    let live = true;
    setState("loading");
    fetchPodcastEpisode(myId, episodeId).then((r) => {
      if (!live) return;
      if (!r.data) { setState(r.code === "podcast_off" ? "off" : r.code === "not_found" ? "missing" : "error"); return; }
      setEp(r.data);
      setFollowing(yes(r.data.is_following_show));
      setFollowers(Number(r.data.show_followers ?? 0));
      setGifts({ coins: Number(r.data.gift_coins ?? 0), count: Number(r.data.gift_count ?? 0) });
      setState("ok");
    });
    return () => { live = false; };
  }, [episodeId, myId]);

  const isCurrent = !!ep && player.episode?.episode_id === ep.episode_id;

  // The picture of a playing video episode: the site-wide player's element is moved into this box, and back
  // out of sight when the page closes (the sound carries on in the mini bar).
  const attachVideo = player.attachVideo;
  const videoBox = useCallback((box: HTMLDivElement | null) => { attachVideo(box); }, [attachVideo]);
  useEffect(() => () => attachVideo(null), [attachVideo]);

  // The sponsor's video, fetched ahead so the tap on Play can start it straight away.
  useEffect(() => {
    if (!ep || !yes(ep.preroll_enabled) || isCurrent || prerollDone.current) return;
    let live = true;
    fetchPodcastPreroll(myId).then((ad) => { if (live) setPreroll(ad); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ep?.episode_id, myId]);

  const startEpisode = () => {
    if (!ep) return;
    prerollDone.current = true;
    setPrerollOpen(false);
    prerollVideo.current?.pause();
    player.load(ep, myId);
  };

  const play = () => {
    if (!ep) return;
    if (!isLoggedIn) { navigate("/login", { state: { from: location.pathname } }); return; }
    if (isCurrent) { player.toggle(); return; }
    if (preroll && !prerollDone.current && prerollVideo.current) {
      setPrerollOpen(true);
      const v = prerollVideo.current;
      v.muted = false;
      v.currentTime = 0;
      v.play().catch(() => { v.muted = true; v.play().catch(() => startEpisode()); });
      return;
    }
    startEpisode();
  };

  async function toggleFollow() {
    if (!ep) return;
    if (!isLoggedIn) { navigate("/login", { state: { from: location.pathname } }); return; }
    setFollowBusy(true);
    const r = await followPodcast(myId, ep.host.user_id, !following);
    setFollowBusy(false);
    if (!r.ok) { showGoldAlert(r.message || t("dm_couldnt_save")); return; }
    setFollowing(r.following);
    if (Number.isFinite(r.followers)) setFollowers(r.followers as number);
  }

  async function remove() {
    setMenuOpen(false);
    if (!ep) return;
    const ok = await showGoldConfirm({ message: t("pod_delete_confirm"), confirmLabel: t("delete"), cancelLabel: t("cancel"), danger: true });
    if (!ok) return;
    const r = await deletePodcastEpisode(myId, ep.episode_id);
    if (!r.ok) { showGoldAlert(r.message || t("pod_err_try_again")); return; }
    if (isCurrent) player.close();
    showGoldAlert(t("pod_deleted"));
    navigate("/podcasts", { replace: true });
  }

  if (state === "loading") return <div className="page"><Loading /></div>;
  if (state !== "ok" || !ep) {
    return (
      <div className="page" style={{ maxWidth: 560 }}>
        <PageTitle backTo="/podcasts">{t("pod_title")}</PageTitle>
        {!isLoggedIn ? (
          <div className="card pad" style={{ textAlign: "center", background: "rgba(0,0,0,.88)" }}>
            <p style={{ margin: "0 0 12px" }}>{t("pod_sign_in_listen")}</p>
            <Link to="/login" state={{ from: location.pathname }} className="btn gold">{t("sign_in")}</Link>
          </div>
        ) : <Notice>{t(state === "off" ? "pod_off" : state === "missing" ? "pod_not_found" : "pod_couldnt_load")}</Notice>}
      </div>
    );
  }

  const mine = yes(ep.is_mine) || myId === ep.host.user_id;
  const position = isCurrent ? player.position : Number(ep.resume_at ?? 0);
  const duration = isCurrent && player.duration > 0 ? player.duration : Number(ep.duration_s ?? 0);
  const playing = isCurrent && player.playing;
  const round: React.CSSProperties = {
    width: 56, height: 56, borderRadius: "50%", border: "1.5px solid var(--gold-border)", background: "#000",
    color: "var(--gold)", fontWeight: 800, fontSize: 15, cursor: "pointer", display: "grid", placeItems: "center",
  };
  const guests = (ep.guests ?? []).map((g) => g.fullname || g.username).filter(Boolean).join(", ");

  return (
    <div className="page" style={{ maxWidth: 560 }}>
      <PageTitle backTo="/podcasts" right={
        <div style={{ position: "relative" }}>
          <button className="back-circle" aria-label={t("pod_more")} onClick={() => setMenuOpen((v) => !v)} style={{ fontSize: 22 }}>⋮</button>
          {menuOpen && (
            <div className="card" style={{ position: "absolute", right: 0, top: 48, zIndex: 30, minWidth: 190, background: "#000", display: "flex", flexDirection: "column" }}>
              {!mine && (
                <button className="btn ghost" style={{ borderRadius: 0, border: 0, justifyContent: "flex-start" }}
                  onClick={() => { setMenuOpen(false); if (!isLoggedIn) { navigate("/login", { state: { from: location.pathname } }); return; } setReportOpen(true); }}>
                  🚩 {t("report")}</button>
              )}
              {mine && (
                <button className="btn ghost" style={{ borderRadius: 0, border: 0, justifyContent: "flex-start", color: "var(--red)" }} onClick={() => void remove()}>
                  🗑 {t("pod_delete")}</button>
              )}
            </div>
          )}
        </div>
      }>{t("pod_title")}</PageTitle>

      {/* A video episode that is playing shows its picture; otherwise the cover is ALWAYS on screen while
          audio plays (the contract's rule). */}
      {ep.kind === "video" && isCurrent ? (
        <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", margin: "0 auto", borderRadius: 18, overflow: "hidden", background: "#000", border: "1.5px solid var(--gold-border)" }}>
          <div ref={videoBox} style={{ position: "absolute", inset: 0 }} onClick={() => player.toggle()} />
          {flash && <GiftFlash gift={flash} onDone={() => setFlash(null)} />}
        </div>
      ) : (
        <div style={{ position: "relative", width: "min(100%, 340px)", margin: "0 auto" }}>
          <PodcastCover url={ep.cover_url || ep.poster_url} host={ep.host} size="100%" radius={18} />
          {flash && <GiftFlash gift={flash} onDone={() => setFlash(null)} />}
        </div>
      )}

      {/* On a black plate: the cosmic backdrop behind the page made bare gold text hard to read. */}
      <div className="card pad" style={{ marginTop: 14, textAlign: "center", background: "rgba(0,0,0,.88)" }}>
        <h2 style={{ color: "var(--gold)", fontSize: 20, fontWeight: 800, margin: 0 }}>{ep.title}</h2>
        {guests && <div style={{ fontSize: 13, marginTop: 4, color: "rgba(255,255,255,.85)" }}>{t("pod_with_guests", guests)}</div>}
      </div>

      <div className="card row" style={{ padding: 10, gap: 10, marginTop: 12, alignItems: "center" }}>
        <Link to={`/profile/${ep.host.user_id}`} className="row" style={{ flex: 1, minWidth: 0, gap: 10, color: "inherit", alignItems: "center" }}>
          <Avatar user={{ id: ep.host.user_id, fullname: ep.host.fullname ?? undefined, username: ep.host.username ?? undefined, profile_image: ep.host.profile_image ?? undefined }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, color: "var(--gold)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {hostName(ep.host)}{yes(ep.host.is_verified) ? " ✔" : ""}</div>
            <div className="muted" style={{ fontSize: 12 }}>{t("pod_followers", followers.toLocaleString())}</div>
          </div>
        </Link>
        {!mine && (
          <button className={following ? "btn small" : "btn small gold"} disabled={followBusy} onClick={() => void toggleFollow()}>
            {following ? t("pod_following_show") : t("pod_follow_show")}</button>
        )}
        {!mine && (
          <button className="btn small" onClick={() => {
            if (!isLoggedIn) { navigate("/login", { state: { from: location.pathname } }); return; }
            setGiftOpen(true);
          }}>{t("gift")}</button>
        )}
      </div>

      {/* Progress */}
      <div style={{ marginTop: 18 }}>
        <input type="range" min={0} max={Math.max(1, Math.floor(duration))} step={1} value={Math.min(Math.floor(position), Math.max(1, Math.floor(duration)))}
          aria-label={t("pod_progress")} disabled={!isCurrent}
          onChange={(e) => player.seekTo(Number(e.target.value))}
          style={{ width: "100%", accentColor: "#F0C420" }} />
        <div className="row" style={{ fontSize: 12, color: "var(--gold)", fontVariantNumeric: "tabular-nums" }}>
          <span>{formatDuration(position)}</span><span style={{ flex: 1 }} /><span>-{formatDuration(Math.max(0, duration - position))}</span>
        </div>
        {!isCurrent && Number(ep.resume_at ?? 0) > 5 && (
          <div className="center muted" style={{ fontSize: 12, marginTop: 2 }}>{t("pod_resume_from", formatDuration(ep.resume_at))}</div>
        )}
      </div>

      {/* -15 / play-pause / +30 */}
      <div className="row" style={{ justifyContent: "center", gap: 22, marginTop: 10 }}>
        <button type="button" style={round} disabled={!isCurrent} onClick={() => player.skip(-15)} aria-label={t("pod_back15_aria")}>-15</button>
        <button type="button" onClick={play} aria-label={playing ? t("pod_pause") : t("pod_play")}
          style={{ ...round, width: 78, height: 78, fontSize: 28, background: "linear-gradient(180deg,#FFDD55,#D4AF37)", color: "#000", border: 0, boxShadow: "0 4px 22px rgba(240,196,32,.45)" }}>
          {playing ? "❚❚" : "▶"}</button>
        <button type="button" style={round} disabled={!isCurrent} onClick={() => player.skip(30)} aria-label={t("pod_fwd30_aria")}>+30</button>
      </div>
      {isCurrent && player.error && <div style={{ marginTop: 10 }}><Notice error>{t("pod_audio_error")}</Notice></div>}

      {/* Speed */}
      <div className="row" style={{ justifyContent: "center", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <span className="muted" style={{ fontSize: 13 }}>{t("pod_speed")}</span>
        {PODCAST_RATES.map((r) => {
          const on = (player.rate || 1) === r;
          return (
            <button key={r} type="button" className={on ? "btn small gold" : "btn small"} onClick={() => player.setRate(r)}>{r}×</button>
          );
        })}
      </div>

      <div className="row" style={{ justifyContent: "center", gap: 14, marginTop: 16, fontSize: 13, color: "var(--gold)", flexWrap: "wrap" }}>
        <span>▶ {t("pod_plays", Number(ep.plays ?? 0).toLocaleString())}</span>
        <span>{t("pod_gifts", (gifts.coins + Number(ep.live_gift_coins ?? 0)).toLocaleString())}</span>
        <span>⏱ {formatDuration(ep.duration_s)}</span>
      </div>
      {ep.description && <p style={{ marginTop: 14, whiteSpace: "pre-line", color: "rgba(255,255,255,.9)" }} className="card pad">{ep.description}</p>}

      {preroll && <PrerollOverlay ad={preroll} open={prerollOpen} myId={myId} videoRef={prerollVideo} onDone={startEpisode} />}
      {giftOpen && (
        <GiftSheet onClose={() => setGiftOpen(false)} onSent={(g) => setFlash(g)}
          sendOverride={async (coins, gift) => {
            const r = await giftPodcastEpisode(myId, ep.host.user_id, coins, gift.id, ep.episode_id);
            if (r.status && r.episode) setGifts({ coins: Number(r.episode.gift_coins ?? 0), count: Number(r.episode.gift_count ?? 0) });
            return { status: r.status, message: r.message };
          }} />
      )}
      {reportOpen && (
        <ReportDialog reportedUserId={ep.host.user_id} reportedName={hostName(ep.host)} podcastEpisodeId={ep.episode_id}
          onClose={() => setReportOpen(false)} onDone={(m) => showGoldAlert(m)} />
      )}
    </div>
  );
}

// ---- /podcasts/start --------------------------------------------------------------------------

const START_ERRORS: Record<string, StringKey> = {
  not_eligible: "pod_err_not_eligible",
  prohibited_word: "pod_err_prohibited_word",
  cover_rejected: "pod_err_cover_rejected",
  try_again: "pod_err_try_again",
  podcast_off: "pod_off",
};

export function StartPodcastPage() {
  const { t, tn } = useT();
  const { user, isLoggedIn } = useSession();
  const navigate = useNavigate();
  const enabled = usePodcastEnabled();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<PodcastKind>("video");
  const [cover, setCover] = useState<File | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (coverUrl) URL.revokeObjectURL(coverUrl); }, [coverUrl]);

  if (!isLoggedIn) return <div className="page"><Notice>{tn("pod_sign_in_start", <Link to="/login">{t("sign_in")}</Link>)}</Notice></div>;

  function pick(f: File | null) {
    if (coverUrl) URL.revokeObjectURL(coverUrl);
    setCover(f);
    setCoverUrl(f ? URL.createObjectURL(f) : null);
  }

  async function submit() {
    if (!user || busy) return;
    if (!title.trim()) { setError(t("pod_need_title")); return; }
    if (!requireVerified()) return;
    setBusy(true);
    setError(null);
    const r = await startPodcast({ myUserId: user.id, title: title.trim(), description: description.trim(), kind, cover });
    if (!r.status || !r.room_name || !r.podcast_id) {
      setBusy(false);
      const key = r.code ? START_ERRORS[r.code] : undefined;
      setError(key ? t(key) : r.message || t("pod_err_try_again"));
      return;
    }
    const k = r.kind ?? kind;
    navigate(`/live/${encodeURIComponent(r.room_name)}?host=1&podcast=${r.podcast_id}&pk=${k}&pt=${encodeURIComponent(title.trim())}`, { replace: true });
  }

  const label: React.CSSProperties = { color: "var(--gold)", fontWeight: 800, fontSize: 14, display: "block", marginBottom: 6 };
  const pill = (on: boolean): React.CSSProperties => ({
    flex: 1, minHeight: 48, borderRadius: 12, cursor: "pointer", fontWeight: 800, fontSize: 15,
    border: on ? "2px solid var(--gold-bright)" : "1.5px solid var(--gold-border)",
    background: on ? "var(--gold-border)" : "#000", color: on ? "#000" : "var(--gold)",
  });

  return (
    <div className="page" style={{ maxWidth: 560 }}>
      <PageTitle>{t("pod_start")}</PageTitle>
      {!enabled ? <Notice>{t("pod_off")}</Notice> : (
        <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 16, borderWidth: 2 }}>
          <p style={{ margin: 0, color: "rgba(255,255,255,.9)", fontSize: 14 }}>{t("pod_form_intro")}</p>

          <div>
            <label style={label} htmlFor="pod-title">{t("pod_field_title")}</label>
            <input id="pod-title" className="input" value={title} maxLength={80} placeholder={t("pod_field_title_ph")}
              onChange={(e) => { setTitle(e.target.value); setError(null); }} />
            <div style={{ fontSize: 12, color: "var(--gold)", opacity: 0.7, textAlign: "right", marginTop: 4 }}>{title.length}/80</div>
          </div>

          <div>
            <label style={label} htmlFor="pod-desc">{t("pod_field_desc")}</label>
            <textarea id="pod-desc" className="input" value={description} maxLength={300} rows={3}
              onChange={(e) => setDescription(e.target.value)} style={{ paddingTop: 10, paddingBottom: 10, resize: "vertical" }} />
            <div style={{ fontSize: 12, color: "var(--gold)", opacity: 0.7, textAlign: "right", marginTop: 4 }}>{description.length}/300</div>
          </div>

          <div>
            <span style={label}>{t("pod_kind")}</span>
            <div className="row" style={{ gap: 10 }} role="radiogroup" aria-label={t("pod_kind")}>
              <button type="button" role="radio" aria-checked={kind === "video"} style={pill(kind === "video")} onClick={() => setKind("video")}>{t("pod_kind_video")}</button>
              <button type="button" role="radio" aria-checked={kind === "audio"} style={pill(kind === "audio")} onClick={() => setKind("audio")}>{t("pod_kind_audio")}</button>
            </div>
            {kind === "audio" && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{t("pod_kind_audio_note")}</div>}
          </div>

          <div>
            <span style={label}>{t("pod_cover")}</span>
            <div className="row" style={{ gap: 12, alignItems: "center" }}>
              <PodcastCover url={coverUrl} host={user} size={84} />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button type="button" className="btn small" onClick={() => fileRef.current?.click()}>{cover ? t("pod_cover_change") : t("pod_cover_pick")}</button>
                {cover && <button type="button" className="btn small ghost" onClick={() => pick(null)}>{t("pod_cover_remove")}</button>}
              </div>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }}
                onChange={(e) => { pick(e.target.files?.[0] ?? null); e.target.value = ""; }} />
            </div>
          </div>

          {error && <Notice error>{error}</Notice>}
          <button className="btn gold block" style={{ minHeight: 52, fontSize: 17 }} disabled={busy} onClick={() => void submit()}>
            {busy ? t("pod_starting") : t("pod_go")}</button>
        </div>
      )}
    </div>
  );
}

/** Used by GoLivePage and the sidebar: the "🎙 Start a Podcast" entry, only while switched on. */
export function StartPodcastLink({ className = "btn block" }: { className?: string }) {
  const { t } = useT();
  const enabled = usePodcastEnabled();
  if (!enabled) return null;
  return <Link to="/podcasts/start" className={className} style={{ marginTop: 10, minHeight: 48 }}>{t("pod_start")}</Link>;
}
