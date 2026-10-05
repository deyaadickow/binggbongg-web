import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { displayName, mediaUrl, post, type Gift, type Post } from "../lib/api";
import { useSession } from "../lib/session";
import { Avatar, Loading, Notice } from "../components/Common";
import { GiftFlash, PostGiftButton } from "../components/GiftSheet";
import { appendToFeed, fetchMoreFeed, getFeed } from "../lib/feed";

const AUTO_KEY = "bb.autoplayNext";

/** One video, with the For You feed as the queue: ▲/▼ buttons, arrow keys, the scroll wheel and
 *  auto-advance when a video ends — the web version of the app's vertical swipe (Steve, 2026-09-24). */
export function VideoPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isLoggedIn } = useSession();
  const [item, setItem] = useState<Post | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [feed, setFeedState] = useState<Post[]>(() => getFeed());
  const [auto, setAuto] = useState<boolean>(() => { try { return localStorage.getItem(AUTO_KEY) !== "0"; } catch { return true; } });
  const [loadingMore, setLoadingMore] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  // ---- watch measurement (Steve, 2026-10-03) -------------------------------------------------
  // How long this video actually held the viewer, reported once when they leave it.
  //
  // Measured on the clock while playing rather than from currentTime, because currentTime says
  // nothing about a video watched round twice and jumps about when someone drags the scrubber.
  // Accumulated across pauses: someone who pauses to read the caption and plays on had ONE
  // viewing, and splitting it would make a video that holds attention look like one that does not.
  const watchStartedAt = useRef(0);
  const watchAccumulatedMs = useRef(0);
  const completedPlays = useRef(0);
  const watchReported = useRef(false);
  const wheelLock = useRef(0);

  const index = feed.findIndex((p) => String(p.id) === String(id));
  const prev = index > 0 ? feed[index - 1] : null;
  const next = index >= 0 && index < feed.length - 1 ? feed[index + 1] : null;

  // Load the video itself. If we came from the feed, show it instantly from the queue and just
  // refresh like state; a deep link fetches it and puts it at the head of a fresh queue.
  useEffect(() => {
    const fromFeed = feed.find((p) => String(p.id) === String(id));
    if (fromFeed) { setItem(fromFeed); setLiked(!!fromFeed.is_post_liked); }
    (async () => {
      try {
        const res = await post<Post | Post[]>("fetchPostById", { post_id: id, ...(user ? { my_user_id: user.id, user_id: user.id } : {}) });
        const data = Array.isArray(res.data) ? res.data[0] : res.data;
        if (!res.status || !data) throw new Error(res.message ?? "That video isn't available.");
        setItem(data);
        setLiked(!!data.is_post_liked);
        if (!fromFeed) setFeedState(appendToFeed([data]));
      } catch (e) {
        if (!fromFeed) setError((e as Error).message);
      }
    })();
  }, [id, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the queue topped up: when we're within 2 of the end, fetch another batch.
  useEffect(() => {
    if (index < 0 || loadingMore || feed.length - index > 2) return;
    setLoadingMore(true);
    fetchMoreFeed(user?.id ?? null).then(setFeedState).catch(() => undefined).finally(() => setLoadingMore(false));
  }, [index, feed.length, loadingMore, user]);

  const go = useCallback((p: Post | null) => { if (p) navigate(`/video/${p.id}`); }, [navigate]);
  const goNext = useCallback(() => go(next), [go, next]);
  const goPrev = useCallback(() => go(prev), [go, prev]);

  // Arrow keys + scroll wheel, like flicking on the phone.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === "j") { e.preventDefault(); goNext(); }
      if (e.key === "ArrowUp" || e.key === "PageUp" || e.key === "k") { e.preventDefault(); goPrev(); }
    };
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 30) return;
      const now = Date.now();
      if (now - wheelLock.current < 700) return;
      wheelLock.current = now;
      if (e.deltaY > 0) goNext(); else goPrev();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("wheel", onWheel); };
  }, [goNext, goPrev]);

  function toggleAuto() {
    const v = !auto; setAuto(v);
    try { localStorage.setItem(AUTO_KEY, v ? "1" : "0"); } catch { /* ignore */ }
  }

  const [sentGift, setSentGift] = useState<Gift | null>(null);
  const clearSentGift = useCallback(() => setSentGift(null), []);

  async function toggleLike() {
    if (!item || !user) return;
    const endpoint = liked ? "dislikePost" : "likePost";
    setLiked(!liked);
    try { await post(endpoint, { user_id: user.id, post_id: item.id }); } catch { setLiked(liked); }
  }

  const watchClockStop = useCallback(() => {
    if (watchStartedAt.current === 0) return;
    watchAccumulatedMs.current += Date.now() - watchStartedAt.current;
    watchStartedAt.current = 0;
  }, []);

  const reportWatch = useCallback(() => {
    watchClockStop();
    if (watchReported.current || watchAccumulatedMs.current < 300) return;
    const durationMs = Math.round((videoRef.current?.duration ?? 0) * 1000);
    // No length means nothing to compare against, so there is no completion to measure.
    if (!Number.isFinite(durationMs) || durationMs <= 0) return;
    watchReported.current = true;
    void post("reportPostWatch", {
      post_id: item?.id ?? 0,
      watched_ms: watchAccumulatedMs.current,
      duration_ms: durationMs,
      // Reaching the end twice means it was watched round again — the strongest signal there is.
      loops: Math.max(0, completedPlays.current - 1),
      user_id: user?.id ?? "",
    }).catch(() => {
      // Deliberately silent: a failed report is a lost data point, not a broken page.
    });
  }, [item?.id, user?.id, watchClockStop]);

  // A fresh viewing whenever the video changes, and a report for the one being left behind —
  // including when the tab is closed, which fires no unmount.
  useEffect(() => {
    watchStartedAt.current = 0;
    watchAccumulatedMs.current = 0;
    completedPlays.current = 0;
    watchReported.current = false;
    const flush = () => reportWatch();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [item?.id, reportWatch]);

  // Steve, 2026-10-05: "When i click on any video on the web the whole app goes blank black."
  //
  // These guards used to sit ABOVE the watch-reporting hooks below. The first render has no post
  // yet, so it returned here and never reached them; the render after the post arrived did, and
  // React saw more hooks than last time and threw ("Rendered more hooks than during the previous
  // render") — a blank black page on every video. Every hook now runs before any return.
  if (error) return <div className="page"><Notice error>{error}</Notice></div>;
  if (!item) return <div className="page"><Loading /></div>;
  const likes = (item.likes ?? 0) + (liked && !item.is_post_liked ? 1 : 0) - (!liked && item.is_post_liked ? 1 : 0);

  return (
    <div className="page video-page">
      <div className="video-stage">
        <video key={item.id} ref={videoRef} className="player" src={mediaUrl(item.video)} poster={mediaUrl(item.thumbnail)} controls autoPlay playsInline
          loop={!auto}
          onPlay={() => { if (watchStartedAt.current === 0) watchStartedAt.current = Date.now(); }}
          onPause={watchClockStop}
          onEnded={() => { completedPlays.current += 1; watchClockStop(); if (auto) goNext(); }} />
        {sentGift && <GiftFlash gift={sentGift} onDone={clearSentGift} />}
        <div className="video-arrows">
          <button className="arrow" onClick={goPrev} disabled={!prev} title="Previous (↑)">▲</button>
          <button className="arrow" onClick={goNext} disabled={!next} title="Next (↓)">▼</button>
          <button className={`arrow auto${auto ? " on" : ""}`} onClick={toggleAuto} title={auto ? "Auto-play next: on" : "Auto-play next: off"}>{auto ? "⏭" : "⟳"}</button>
        </div>
      </div>
      <div className="row" style={{ marginTop: 14, alignItems: "flex-start" }}>
        <Link to={`/profile/${item.user_id}`}><Avatar user={item.user} /></Link>
        <div style={{ flex: 1 }}>
          <Link to={`/profile/${item.user_id}`} style={{ fontWeight: 800, color: "var(--text)" }}>{displayName(item.user)}</Link>
          <div className="soft">{item.description}</div>
          {item.hashtags && <div className="muted" style={{ fontSize: 13 }}>{item.hashtags}</div>}
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{index >= 0 ? `${index + 1} of ${feed.length}${loadingMore ? " · loading more…" : ""}` : ""} · {auto ? "Auto-plays the next video" : "Repeats this video"} · ↑ ↓ keys or scroll to move</div>
        </div>
        <button className="btn small" onClick={toggleLike} disabled={!isLoggedIn} title={isLoggedIn ? "" : "Sign in to like"}>
          {liked ? "♥" : "♡"} {likes}
        </button>
        <PostGiftButton post={item} onSent={setSentGift} />
      </div>
    </div>
  );
}
