import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { displayName, mediaUrl, post, type Post } from "../lib/api";
import { useSession } from "../lib/session";
import { Avatar, Loading, Notice } from "../components/Common";
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

  async function toggleLike() {
    if (!item || !user) return;
    const endpoint = liked ? "dislikePost" : "likePost";
    setLiked(!liked);
    try { await post(endpoint, { user_id: user.id, post_id: item.id }); } catch { setLiked(liked); }
  }

  if (error) return <div className="page"><Notice error>{error}</Notice></div>;
  if (!item) return <div className="page"><Loading /></div>;
  const likes = (item.likes ?? 0) + (liked && !item.is_post_liked ? 1 : 0) - (!liked && item.is_post_liked ? 1 : 0);

  return (
    <div className="page video-page">
      <div className="video-stage">
        <video key={item.id} ref={videoRef} className="player" src={mediaUrl(item.video)} poster={mediaUrl(item.thumbnail)} controls autoPlay playsInline
          loop={!auto} onEnded={() => { if (auto) goNext(); }} />
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
      </div>
    </div>
  );
}
