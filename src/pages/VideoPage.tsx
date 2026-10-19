import { useCallback, useEffect, useRef, useState } from "react";
import { rememberCopiedLink, videoShareUrl } from "../lib/copiedLink";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { displayName, mediaUrl, post, type Gift, type Post } from "../lib/api";
import { useSession } from "../lib/session";
import { Avatar, Loading, Notice } from "../components/Common";
import { GiftFlash, PostGiftButton } from "../components/GiftSheet";
import { appendToFeed, fetchMoreFeed, getFeed } from "../lib/feed";
import { tt, useT  } from "../lib/i18n";
import { showGoldAlert } from "../components/GoldToast";

const AUTO_KEY = "bb.autoplayNext";

/** One video, with the For You feed as the queue: ▲/▼ buttons, arrow keys, the scroll wheel and
 *  auto-advance when a video ends — the web version of the app's vertical swipe (Steve, 2026-09-24). */
export function VideoPage() {
  const { t } = useT();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
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
  // Steve, 2026-10-19: "Hold the screen for 2 seconds and a popup will appear, Pause that video
  // that is playing in case they want to copy it." The controls that sat on the video are rows
  // in this menu now.
  const [menuOpen, setMenuOpen] = useState(false);
  const [chromeHidden, setChromeHidden] = useState(false);
  const holdTimer = useRef(0);
  const holdFired = useRef(false);

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
        if (!res.status || !data) throw new Error(res.message ?? tt("that_video_isn_t_available"));
        setItem(data);
        setLiked(!!data.is_post_liked);
        if (!fromFeed) setFeedState(appendToFeed([data]));
      } catch (e) {
        if (!fromFeed) setError((e as Error).message);
      }
    })();
    // The member's ID, not the object: the session replaces the object on every balance
    // refresh, and reloading the post for that unmounted whatever was open over the video.
  }, [id, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the queue topped up: when we're within 2 of the end, fetch another batch.
  useEffect(() => {
    if (index < 0 || loadingMore || feed.length - index > 2) return;
    setLoadingMore(true);
    fetchMoreFeed(user?.id ?? null).then(setFeedState).catch(() => undefined).finally(() => setLoadingMore(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, feed.length, loadingMore, user?.id]);

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
  // Steve, 2026-10-15, on his phone: "I'm giving a gift but I don't see the gift and the video
  // I'm watching switches to another video right away." The video kept playing under the gift
  // sheet; with auto-play-next on it reached its end while he was choosing, onEnded jumped to
  // the next video, and that jump rebuilt the stage the gift was about to show on. So: the
  // video pauses while the sheet is open, and if it ends while a gift is playing the jump
  // waits until the gift is done.
  const [giftSheetOpen, setGiftSheetOpen] = useState(false);
  const advanceAfterGift = useRef(false);
  const onGiftSheetOpenChange = useCallback((open: boolean) => {
    setGiftSheetOpen(open);
    const v = videoRef.current;
    if (!v) return;
    if (open) v.pause();
    else if (!v.ended) v.play().catch(() => undefined);
  }, []);
  const clearSentGift = useCallback(() => {
    setSentGift(null);
    if (advanceAfterGift.current) { advanceAfterGift.current = false; goNext(); }
  }, [goNext]);

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
  // Falls back to building the URL from the id: share_url only arrives from a deployed
  // backend, and the link is the same either way.
  // ---- hold-to-open menu (Steve, 2026-10-19) ---------------------------------------------
  //
  // Two seconds exactly, matched to the phones, and cancelled by a pointer that leaves or
  // lifts first. A hold is not a click, so the browser's own context menu on a long press is
  // suppressed for that gesture only.
  function startHold() {
    cancelHold();
    holdFired.current = false;
    holdTimer.current = window.setTimeout(() => {
      holdFired.current = true;
      videoRef.current?.pause();
      setMenuOpen(true);
    }, 2000);
  }

  function cancelHold() {
    if (holdTimer.current) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = 0;
    }
  }

  function closeMenu(resume = true) {
    setMenuOpen(false);
    holdFired.current = false;
    if (resume) void videoRef.current?.play().catch(() => undefined);
  }

  async function copyLink() {
    if (!item) return;
    const url = videoShareUrl(item);
    // Remembered either way, clipboard or not: this is what pre-fills the paste box on the
    // upload page, and it is the half of (C) that cannot fail.
    rememberCopiedLink(url);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard is blocked without a secure context or a user gesture the browser trusts.
      // Showing the URL is better than a button that silently does nothing.
      window.prompt("Copy this video's link:", url);
      return;
    }
    showGoldAlert(tt("copied"));
  }

  if (error) return <div className="page"><Notice error>{error}</Notice></div>;
  if (!item) return <div className="page"><Loading /></div>;

  // The rows of the hold-to-open menu, in the order Steve listed them. Each one does what the
  // control it replaced did; Auto Scroll is a switch, so it keeps the card up and its word
  // changes in place.
  const menuRows: { label: string; trailing?: string; onPick: () => void }[] = [
    {
      label: t("auto_scroll"),
      trailing: auto ? t("switch_on") : t("switch_off"),
      onPick: () => toggleAuto(),
    },
    {
      label: t("the_turning_record"),
      onPick: () => { closeMenu(false); navigate(`/search?q=${encodeURIComponent(item.sound?.sound_title ?? "")}`); },
    },
    { label: t("copy_this_video"), onPick: () => { void copyLink(); closeMenu(); } },
    {
      label: t("repost"),
      onPick: () => {
        closeMenu(false);
        if (!isLoggedIn || !user) { navigate("/login", { state: { from: location.pathname } }); return; }
        void post("repostUserPost", { user_id: user.id, post_id: item.id })
          .then((r) => showGoldAlert(r.message ?? tt("done")))
          .catch(() => showGoldAlert(tt("something_went_wrong")));
      },
    },
    {
      label: t("report"),
      onPick: () => {
        closeMenu(false);
        if (!isLoggedIn || !user) { navigate("/login", { state: { from: location.pathname } }); return; }
        navigate(`/settings/support?reason=${encodeURIComponent(tt("report"))}&about=${encodeURIComponent(videoShareUrl(item))}`);
      },
    },
    { label: t("support"), onPick: () => { closeMenu(false); navigate("/settings/support"); } },
  ];
  const likes = (item.likes ?? 0) + (liked && !item.is_post_liked ? 1 : 0) - (!liked && item.is_post_liked ? 1 : 0);

  return (
    <div className="page video-page">
      <div
        className="video-stage"
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
        onContextMenu={(e) => { if (holdFired.current) e.preventDefault(); }}>
        <video key={item.id} ref={videoRef} className="player" src={mediaUrl(item.video)} poster={mediaUrl(item.thumbnail)} controls autoPlay playsInline
          loop={!auto}
          onPlay={() => { if (watchStartedAt.current === 0) watchStartedAt.current = Date.now(); }}
          onPause={watchClockStop}
          onEnded={() => {
            completedPlays.current += 1; watchClockStop();
            if (!auto) return;
            if (sentGift || giftSheetOpen) { advanceAfterGift.current = true; return; }
            goNext();
          }} />
        {sentGift && <GiftFlash gift={sentGift} onDone={clearSentGift} />}

        {menuOpen && (
          // Steve, 2026-10-19: "Also add the Bingg Bongg logo on top of this popup." The same
          // black-and-gold card the rest of the site uses, with the wordmark on the pill the
          // apps put it on.
          <div
            onClick={() => closeMenu()}
            style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.75)",
                     display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ width: "100%", maxWidth: 360, background: "#000",
                       border: "1.5px solid var(--gold-border)", borderRadius: 16, padding: 16 }}>
              <div style={{ textAlign: "center", marginBottom: 12 }}>
                <img src="/logo_horizontal.png" alt="Bingg Bongg" style={{ height: 26, maxWidth: "100%",
                     padding: "10px 20px", borderRadius: 999, border: "1.5px solid var(--gold-border)",
                     background: "#000", boxSizing: "content-box" }} />
              </div>
              <div style={{ fontWeight: 800, fontSize: 17, color: "var(--gold)", textAlign: "center", marginBottom: 12 }}>
                {t("this_video")}
              </div>
              {menuRows.map((r) => (
                <button
                  key={r.label}
                  onClick={r.onPick}
                  style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", cursor: "pointer",
                           padding: "13px 14px", marginBottom: 8, borderRadius: 10, background: "#101010",
                           color: "var(--gold)", border: "1.5px solid var(--gold-border)", fontSize: 15 }}>
                  <span style={{ flex: 1, textAlign: "center" }}>{r.label}</span>
                  <span style={{ fontWeight: 800 }}>{r.trailing ?? "\u203A"}</span>
                </button>
              ))}
              <button className="btn ghost" style={{ width: "100%", marginTop: 4 }} onClick={() => closeMenu()}>
                {t("close")}
              </button>
            </div>
          </div>
        )}
        {/* Steve, 2026-10-13: "(C) ... for any member to click and copy that video", and a
            "Link" tab top-left for a video whose poster pasted a copied link.

            Steve, 2026-10-19: "Remove all these links from main page and add them to this
            popup." The (C) is a row in the hold-to-open menu now; the Link tab stays, because
            it is part of the video rather than a control. "Clear the screen" hides what is
            left. */}
        <div style={{ position: "absolute", top: 12, left: 12, display: chromeHidden ? "none" : "flex", flexDirection: "column", gap: 8, zIndex: 3 }}>
          {item.linked_video && (
            <button
              className="btn small"
              onClick={() => navigate(`/video/${item.linked_video!.id}`)}
              style={{ background: "#000", color: "var(--gold)", borderColor: "var(--gold)" }}>
              {t("link")}</button>
          )}
        </div>
        {/* Steve, 2026-10-19: "add a small Bullseye on main page right under the share icon in
            the corner." Same job the Clear the screen row had, and deliberately NOT hidden with
            everything else — something has to stay on screen to bring it all back. */}
        <button
          onClick={() => setChromeHidden((v) => !v)}
          title={t("clear_the_screen")}
          style={{ position: "absolute", right: 14, bottom: 14, zIndex: 4, width: 30, height: 30,
                   padding: 0, borderRadius: "50%", border: "none", background: "transparent",
                   cursor: "pointer", lineHeight: 0 }}>
          <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden>
            <circle cx="12" cy="12" r="9" fill="none" stroke="#fff" strokeWidth="1.8" />
            <circle cx="12" cy="12" r="5.2" fill="none" stroke="#fff" strokeWidth="1.5" />
            <circle cx="12" cy="12" r="2.6" fill="#F0C420" />
          </svg>
        </button>
        <div className="video-arrows" style={chromeHidden ? { display: "none" } : undefined}>
          <button className="arrow" onClick={goPrev} disabled={!prev} title={t("previous")}>▲</button>
          <button className="arrow" onClick={goNext} disabled={!next} title={t("next")}>▼</button>
          <button className={`arrow auto${auto ? " on" : ""}`} onClick={toggleAuto} title={auto ? "Auto-play next: on" : "Auto-play next: off"}>{auto ? "⏭" : "⟳"}</button>
        </div>
      </div>
      <div className="row" style={{ marginTop: 14, alignItems: "flex-start" }}>
        <Link to={`/profile/${item.user_id}`}><Avatar user={item.user} /></Link>
        <div style={{ flex: 1 }}>
          <Link to={`/profile/${item.user_id}`} style={{ fontWeight: 800, color: "var(--text)" }}>{displayName(item.user)}</Link>
          <div className="soft">{item.description}</div>
          {item.hashtags && <div className="muted" style={{ fontSize: 13 }}>{item.hashtags}</div>}
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{index >= 0 ? `${t("n_of_m", index + 1, feed.length)}${loadingMore ? t("dot_loading_more") : ""}` : ""} · {auto ? t("auto_plays_the_next_video") : t("repeats_this_video")} · {t("arrow_keys_or_scroll_to_move")}</div>
        </div>
        <button className="btn small" title={isLoggedIn ? "" : "Sign in to like"}
          onClick={() => {
            // Same as the gift button: signed out goes to Sign in and comes straight back.
            if (!isLoggedIn) { navigate("/login", { state: { from: location.pathname + location.search } }); return; }
            toggleLike();
          }}>
          {liked ? "♥" : "♡"} {likes}
        </button>
        <PostGiftButton post={item} onSent={setSentGift} onOpenChange={onGiftSheetOpenChange} />
      </div>
    </div>
  );
}
