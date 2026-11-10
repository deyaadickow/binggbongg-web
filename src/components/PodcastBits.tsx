// Bingg Bongg Podcast pieces shared by several pages (Steve, 2026-11-10): the Live Now badge, the
// episode / live cards, the persistent mini player bar and the profile "🎙 Podcast" section.
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { mediaUrl, type LiveStream } from "../lib/api";
import { useT } from "../lib/i18n";
import { useSession } from "../lib/session";
import {
  fetchUserPodcasts, followPodcast, formatDuration, hostName, usePodcastEnabled, yes,
  type LivePodcast, type PodcastEpisode, type PodcastHost, type UserPodcasts,
} from "../lib/podcast";
import { usePodcastPlayer } from "../lib/podcastPlayer";
import { showGoldAlert } from "./GoldToast";

export const isPodcastRoom = (s: LiveStream) => yes(s.is_podcast);

/** "🎙 PODCAST" on a Live Now card (title on hover). */
export function PodcastBadge({ title }: { title?: string | null }) {
  const { t } = useT();
  return (
    <span className="pill" title={title ?? undefined} style={{ background: "#000", borderColor: "var(--gold)", color: "var(--gold)" }}>
      {t("pod_live_badge")}
    </span>
  );
}

/** The square cover — the episode's own picture, else the host's photo, else a gold mic. */
export function PodcastCover({ url, host, size, radius = 12 }: { url?: string | null; host?: Partial<PodcastHost> | null; size: number | string; radius?: number }) {
  const [broken, setBroken] = useState(false);
  const src = mediaUrl(url || host?.profile_image || "");
  return (
    <div style={{
      width: size, height: size, aspectRatio: "1 / 1", borderRadius: radius, overflow: "hidden", flexShrink: 0,
      border: "1.5px solid var(--gold-border)", background: "linear-gradient(160deg,#2A2205,#000)",
      display: "grid", placeItems: "center",
    }}>
      {src && !broken
        ? <img src={src} alt="" onError={() => setBroken(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        : <span style={{ fontSize: typeof size === "number" ? size * 0.45 : 64 }} aria-hidden>🎙</span>}
    </div>
  );
}

/** One line of numbers under an episode: duration · plays · gifts. */
function EpisodeStats({ e }: { e: PodcastEpisode }) {
  const { t } = useT();
  const plays = Number(e.plays_30d ?? e.plays ?? 0);
  const gifts = Number(e.gift_coins ?? 0) + Number(e.live_gift_coins ?? 0);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", fontSize: 12, color: "var(--gold)", opacity: 0.9 }}>
      <span>⏱ {formatDuration(e.duration_s)}</span>
      <span>▶ {t("pod_plays", plays.toLocaleString())}</span>
      <span>{t("pod_gifts", gifts.toLocaleString())}</span>
    </div>
  );
}

export function EpisodeCard({ e }: { e: PodcastEpisode }) {
  return (
    <Link to={`/podcasts/episode/${e.episode_id}`} className="card row" style={{ padding: 10, gap: 12, color: "inherit", alignItems: "center" }}>
      <PodcastCover url={e.cover_url} host={e.host} size={84} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <b style={{ color: "var(--gold)", fontSize: 15, lineHeight: 1.25, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{e.title}</b>
        <span style={{ fontSize: 13, color: "rgba(255,255,255,.85)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{hostName(e.host)}</span>
        <EpisodeStats e={e} />
      </div>
    </Link>
  );
}

export function LivePodcastCard({ p }: { p: LivePodcast }) {
  const { t } = useT();
  return (
    <Link to={`/live/${encodeURIComponent(p.room_name)}`} className="card row" style={{ padding: 10, gap: 12, color: "inherit", alignItems: "center" }}>
      <div style={{ position: "relative" }}>
        <PodcastCover url={p.cover_url} host={p.host} size={84} />
        <span className="pill live" style={{ position: "absolute", left: 4, bottom: 4, fontSize: 10, padding: "1px 6px" }}>● LIVE</span>
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <b style={{ color: "var(--gold)", fontSize: 15, lineHeight: 1.25, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.title}</b>
        <span style={{ fontSize: 13, color: "rgba(255,255,255,.85)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{hostName(p.host)}</span>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <PodcastBadge title={p.title} />
          <span className="pill">{p.kind === "audio" ? "🎧" : "🎥"} {p.live_seconds ? formatDuration(p.live_seconds) : ""}</span>
        </div>
      </div>
      <span className="btn small">{t("pod_listen")}</span>
    </Link>
  );
}

/**
 * The small bar that keeps the episode going while the member browses (above the get-app bar,
 * hidden on the episode's own page where the full player is).
 */
export function PodcastMiniBar() {
  const { t } = useT();
  const { pathname } = useLocation();
  const { isLoggedIn } = useSession();
  const p = usePodcastPlayer();
  if (!p.episode) return null;
  if (pathname === `/podcasts/episode/${p.episode.episode_id}`) return null;
  if (pathname.startsWith("/live/")) return null; // a live room has its own sound
  const pct = p.duration > 0 ? Math.min(100, (p.position / p.duration) * 100) : 0;
  const btn: React.CSSProperties = {
    width: 40, height: 40, borderRadius: "50%", border: "1.5px solid var(--gold-border)", background: "#000",
    color: "var(--gold)", fontWeight: 800, fontSize: 13, cursor: "pointer", flexShrink: 0, display: "grid", placeItems: "center",
  };
  return (
    <>
      <div aria-hidden style={{ height: 76 }} />
      <div role="region" aria-label={t("pod_now_playing")} style={{
        position: "fixed", left: 8, right: 8, zIndex: 85, maxWidth: 640, margin: "0 auto",
        bottom: `calc(${isLoggedIn ? 8 : 92}px + env(safe-area-inset-bottom))`,
        background: "rgba(0,0,0,.96)", border: "1.5px solid var(--gold-border)", borderRadius: 16, overflow: "hidden",
        boxShadow: "0 6px 24px rgba(0,0,0,.6)",
      }}>
        <div style={{ height: 3, background: "#222" }}><div style={{ height: 3, width: `${pct}%`, background: "var(--gold)" }} /></div>
        <div className="row" style={{ padding: "8px 10px", gap: 10, alignItems: "center" }}>
          <Link to={`/podcasts/episode/${p.episode.episode_id}`} className="row" style={{ flex: 1, minWidth: 0, gap: 10, color: "inherit", alignItems: "center" }}>
            <PodcastCover url={p.episode.cover_url} host={p.episode.host} size={44} radius={8} />
            <div style={{ minWidth: 0 }}>
              <div style={{ color: "var(--gold)", fontWeight: 800, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.episode.title}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.8)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {hostName(p.episode.host)} · {formatDuration(p.position)} / {formatDuration(p.duration)}
              </div>
            </div>
          </Link>
          <button type="button" style={btn} onClick={() => p.skip(-15)} aria-label={t("pod_back15_aria")}>-15</button>
          <button type="button" style={{ ...btn, background: "var(--gold)", color: "#000", fontSize: 16 }} onClick={p.toggle}
            aria-label={p.playing ? t("pod_pause") : t("pod_play")}>{p.playing ? "❚❚" : "▶"}</button>
          <button type="button" style={{ ...btn, border: 0, width: 28 }} onClick={p.close} aria-label={t("close")}>✕</button>
        </div>
      </div>
    </>
  );
}

/** The profile's "🎙 Podcast" section — hidden entirely when off, failing, or empty. */
export function PodcastProfileSection({ profileId }: { profileId: number }) {
  const { t } = useT();
  const { user } = useSession();
  const enabled = usePodcastEnabled();
  const myId = user?.id ?? 0;
  const [data, setData] = useState<UserPodcasts | null>(null);
  const [following, setFollowing] = useState(false);
  const [followers, setFollowers] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!enabled || !profileId) return;
    let live = true;
    fetchUserPodcasts(myId, profileId).then((d) => {
      if (!live) return;
      setData(d);
      setFollowing(yes(d?.is_following_show));
      setFollowers(Number(d?.show_followers ?? 0));
    });
    return () => { live = false; };
  }, [enabled, profileId, myId]);

  if (!enabled || !data) return null;
  const mine = yes(data.is_mine) || myId === profileId;
  if (!data.live && data.episodes.length === 0 && !mine) return null;
  const episodes = showAll ? data.episodes : data.episodes.slice(0, 3);

  async function toggleFollow() {
    if (!myId) { showGoldAlert(t("pod_sign_in_listen")); return; }
    setBusy(true);
    const r = await followPodcast(myId, profileId, !following);
    setBusy(false);
    if (!r.ok) { showGoldAlert(r.message || t("dm_couldnt_save")); return; }
    setFollowing(r.following);
    if (Number.isFinite(r.followers)) setFollowers(r.followers as number);
  }

  return (
    <div className="card pad" style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <b style={{ color: "var(--gold)", fontSize: 16 }}>{t("pod_on_profile")}</b>
        {followers > 0 && <span className="muted" style={{ fontSize: 12 }}>{t("pod_followers", followers.toLocaleString())}</span>}
        <span className="spacer" style={{ flex: 1 }} />
        {!mine && (
          <button className={following ? "btn small" : "btn small gold"} disabled={busy} onClick={() => void toggleFollow()}>
            {following ? t("pod_following_show") : t("pod_follow_show")}</button>
        )}
        {mine && <Link to="/podcasts/start" className="btn small gold">{t("pod_start")}</Link>}
      </div>
      {data.live && <LivePodcastCard p={data.live} />}
      {episodes.map((e) => <EpisodeCard key={e.episode_id} e={{ ...e, host: e.host ?? data.host }} />)}
      {mine && !data.live && data.episodes.length === 0 && <span className="muted" style={{ fontSize: 13 }}>{t("pod_none_mine")}</span>}
      {data.episodes.length > 3 && (
        <button className="btn small ghost" onClick={() => setShowAll((v) => !v)}>{showAll ? t("pod_show_less") : t("pod_show_all", data.episodes.length)}</button>
      )}
    </div>
  );
}
