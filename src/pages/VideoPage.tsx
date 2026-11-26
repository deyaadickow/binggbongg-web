import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReportDialog } from "../components/ReportDialog";
import { CommentsPanel } from "../components/CommentsPanel";
import { rememberCopiedLink, videoShareUrl } from "../lib/copiedLink";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { displayName, mediaUrl, post, ratePost, remixAllowed, type Gift, type LiveStream, type Post } from "../lib/api";
import { useSession } from "../lib/session";
import { memberLabel, trackPage } from "../lib/pageTracker";
import { Avatar, Loading, Notice } from "../components/Common";
import { GiftFlash, PostGiftButton } from "../components/GiftSheet";
import { appendToFeed, fetchMoreFeed, getFeed, insertIntoFeed, removeFromFeed } from "../lib/feed";
import { HashtagList, HashtagText } from "../components/HashtagText";
import { SearchTopicBar } from "../components/SearchTopicBar";
import { findingUserId, interested, notInterested, postHashtags, splitHashtags, undoNotInterested } from "../lib/finding";
import { tt, useT  } from "../lib/i18n";
import { showGoldAlert } from "../components/GoldToast";
import { AutoCaptionOverlay, CcButton, EditCaptionsDialog } from "../components/AutoCaptions";
import { HEART_RED, HeartRatingPanel, ratingLine } from "../components/HeartRating";
import { parseCaptions, setPostAutoCaptions, shownCaptions, updatePostAutoCaptions, type CaptionLine } from "../lib/autoCaptions";
import { decoratePost, fetchPostByIdSocial, repostPost, socialUser, type SocialPost } from "../lib/social";
import { VideoStickers } from "../components/SocialStickers";
import { EpisodeChip, LockedCard } from "../components/Creators";
import { devCreatorDecorate } from "../lib/creators";
import { setFeed as saveFeedQueue } from "../lib/feed";
import { rollGoldNow } from "../lib/goldDigger";
import { PostPlaylistBar } from "../components/PostPlaylistBar";
import { MemberBullseye } from "../components/MemberBullseye";

const AUTO_KEY = "bb.autoplayNext";

/** One video, with the For You feed as the queue: ▲/▼ buttons, arrow keys, the scroll wheel and
 *  auto-advance when a video ends — the web version of the app's vertical swipe (Steve, 2026-09-24). */
export function VideoPage() {
  const { t } = useT();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoggedIn } = useSession();
  const [item, setItem] = useState<SocialPost | null>(null);
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
  // Gold Digger (2026-11-17): "Watch a video to the end you might find a couple of grams of gold."
  // Once per video shown: the player loops unless auto-next is on, so "ended" alone never fires.
  const goldRolledFor = useRef<number | null>(null);
  const rollGoldAtEnd = useCallback((postId: number, v: HTMLVideoElement | null, ended = false) => {
    if (!v || goldRolledFor.current === postId) return;
    const d = v.duration;
    if (!ended && !(Number.isFinite(d) && d > 0 && v.currentTime >= d - 0.35)) return;
    goldRolledFor.current = postId;
    rollGoldNow("video_end", postId);
  }, []);
  const watchReported = useRef(false);
  const wheelLock = useRef(0);
  // Steve, 2026-10-19: "Hold the screen for 2 seconds and a popup will appear, Pause that video
  // that is playing in case they want to copy it." The controls that sat on the video are rows
  // in this menu now.
  const [menuOpen, setMenuOpen] = useState(false);
  // Who is live right now, for the LIVE tag on the creator's avatar. One fetch per page visit,
  // refreshed every minute; a battle runs inside a live room, so battlers are in this list too.
  const [liveHosts, setLiveHosts] = useState<LiveStream[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => post<LiveStream[]>("fetchActiveLiveStreams", { user_id: 0, connections_only: false })
      .then((r) => { if (alive && r.status) setLiveHosts(r.data ?? []); })
      .catch(() => {});
    load();
    const timer = window.setInterval(load, 60000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const holdTimer = useRef(0);
  const holdFired = useRef(false);

  // Creators and money (2026-11-17): bumped after a purchase / subscribe to reload this post unlocked.
  const [reloadKey, setReloadKey] = useState(0);
  const index = feed.findIndex((p) => String(p.id) === String(id));
  const prev = index > 0 ? feed[index - 1] : null;
  const next = index >= 0 && index < feed.length - 1 ? feed[index + 1] : null;

  // Load the video itself. If we came from the feed, show it instantly from the queue and just
  // refresh like state; a deep link fetches it and puts it at the head of a fresh queue.
  useEffect(() => {
    const fromFeed = feed.find((p) => String(p.id) === String(id));
    if (fromFeed) {
      setItem(fromFeed); setLiked(!!fromFeed.is_post_liked);
      // Polls / Add Yours / links / comment replies (on the dev server, the mock's).
      void decoratePost(fromFeed).then((d) => setItem((cur) => (cur && cur.id === d.id ? { ...d, ...cur, ...pickSocial(d) } : cur)));
    }
    (async () => {
      try {
        const res = await fetchPostByIdSocial(id ?? "", user ? { my_user_id: user.id, user_id: user.id } : {});
        const raw0 = Array.isArray(res.data) ? res.data[0] : res.data;
        // Restricted Mode (2026-11-17): the server says why in its own words — the gold popup.
        if (!res.status && res.code === "restricted_mode") { showGoldAlert(String(res.message || tt("that_video_isn_t_available"))); }
        if (!res.status || !raw0) throw new Error(res.message ?? tt("that_video_isn_t_available"));
        const [raw] = await devCreatorDecorate([raw0]);
        const data = await decoratePost(raw);
        setItem(data);
        setLiked(!!data.is_post_liked);
        if (!fromFeed) setFeedState(appendToFeed([data]));
        else if (!!fromFeed.locked !== !!data.locked) {
          // Unlocked (or locked) since the feed loaded it: the queue gets the fresh copy.
          const next = feed.map((p) => (p.id === data.id ? data : p));
          saveFeedQueue(next);
          setFeedState(next);
        }
      } catch (e) {
        if (!fromFeed) setError((e as Error).message);
      }
    })();
    // The member's ID, not the object: the session replaces the object on every balance
    // refresh, and reloading the post for that unmounted whatever was open over the video.
  }, [id, user?.id, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Page history: which video this was — its caption's start, else whose it is. The router already
  // recorded the visit; this only names it. Checked against the URL so the previous video, still
  // on screen for a moment after a swipe, is never filed under the next one's id.
  useEffect(() => {
    if (!item || !id || String(item.id) !== String(id)) return;
    const caption = (item.description ?? "").replace(/\s+/g, " ").trim();
    const owner = memberLabel(item.user);
    trackPage("video", "video", id, caption ? caption.slice(0, 60) : owner ? `${owner}'s video` : undefined);
  }, [item?.id, id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the queue topped up: when we're within 2 of the end, fetch another batch.
  useEffect(() => {
    if (index < 0 || loadingMore || feed.length - index > 2) return;
    setLoadingMore(true);
    fetchMoreFeed(user?.id ?? null).then(setFeedState).catch(() => undefined).finally(() => setLoadingMore(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, feed.length, loadingMore, user?.id]);

  // A comment reply's bubble opens the original video at its comments (Steve, 2026-11-17).
  const openComments = new URLSearchParams(location.search).get("comments") === "1";
  useEffect(() => {
    if (!openComments || !item || String(item.id) !== String(id)) return;
    const timer = window.setTimeout(() => document.getElementById("video-comments")?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
    return () => window.clearTimeout(timer);
  }, [openComments, item?.id, id]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = useCallback((p: Post | null) => { if (p) navigate(`/video/${p.id}`); }, [navigate]);
  const goNext = useCallback(() => go(next), [go, next]);
  // Auto-advance skips past locked videos (subscriber-only / unbought series episodes).
  const nextPlayable = index >= 0 ? feed.slice(index + 1).find((p) => !p.locked) ?? null : null;
  const goNextPlayable = useCallback(() => go(nextPlayable ?? next), [go, nextPlayable, next]);
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

  // ---- 1-10 heart rating (Steve, 2026-11-16) ----------------------------------------------
  // Liking opens the row of ten numbered hearts; a long press (or right-click) on the red heart
  // reopens it to change the rating. Unliking drops the rating, as the server does.
  const [ratingOpen, setRatingOpen] = useState(false);
  const heartRef = useRef<HTMLButtonElement>(null);
  const heartHoldTimer = useRef(0);
  const heartHoldFired = useRef(false);
  const myRating = Math.round(Number(item?.my_rating ?? 0) || 0);
  // The video moved on (arrows, wheel, auto-next, a link): the row belongs to the old one.
  useEffect(() => { setRatingOpen(false); }, [item?.id]);

  async function toggleLike() {
    if (!item || !user) return;
    const endpoint = liked ? "dislikePost" : "likePost";
    const wasLiked = liked;
    setLiked(!wasLiked);
    if (!wasLiked) setRatingOpen(true);
    else {
      setRatingOpen(false);
      // dislikePost deletes this member's rating, so take it out of the average shown too.
      setItem((cur) => {
        if (!cur || cur.id !== item.id) return cur;
        const mine = Math.round(Number(cur.my_rating ?? 0) || 0);
        if (!mine) return cur;
        const c = Math.round(Number(cur.rating_count ?? 0) || 0);
        const a = Number(cur.rating_avg ?? 0) || 0;
        return c > 1 ? { ...cur, my_rating: 0, rating_count: c - 1, rating_avg: (a * c - mine) / (c - 1) }
                     : { ...cur, my_rating: 0, rating_count: 0, rating_avg: 0 };
      });
    }
    try { await post(endpoint, { user_id: user.id, post_id: item.id }); } catch { setLiked(wasLiked); }
  }

  function rate(n: number) {
    if (!item || !user) return;
    const postId = item.id;
    setItem((cur) => (cur && cur.id === postId ? { ...cur, my_rating: n } : cur));
    // Silent on failure: until the backend is deployed this route does not exist, and the like
    // already went through on its own.
    void ratePost(user.id, postId, n).then((r) => {
      if (!r) return;
      setItem((cur) => (cur && cur.id === postId ? { ...cur, my_rating: r.my_rating, rating_avg: r.rating_avg, rating_count: r.rating_count } : cur));
    });
  }

  function goSignIn() { navigate("/login", { state: { from: location.pathname + location.search } }); }

  /** Long press / right-click: like if not yet liked (which opens the row), else reopen it. */
  function openRating() {
    if (!isLoggedIn) { goSignIn(); return; }
    if (!liked) { void toggleLike(); return; }
    setRatingOpen(true);
  }

  function heartDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    window.clearTimeout(heartHoldTimer.current);
    heartHoldFired.current = false;
    heartHoldTimer.current = window.setTimeout(() => {
      heartHoldTimer.current = 0;
      heartHoldFired.current = true;
      openRating();
    }, 500);
  }

  function heartUp() {
    if (heartHoldTimer.current) { window.clearTimeout(heartHoldTimer.current); heartHoldTimer.current = 0; }
  }
  useEffect(() => () => window.clearTimeout(heartHoldTimer.current), []);

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
  // Steve, 2026-10-25: "please add what country that video was uploaded from. So country and
  // local time." Under the menu's title: the post's country, then the poster's clock, worked
  // out here from their IANA zone and written in the viewer's own format.
  const authorLive = item ? liveHosts.find((s) => Number(s.host_user_id) === Number(item.user_id)) ?? null : null;
  const originLines: string[] = [];
  {
    const shown = item ?? (index >= 0 ? feed[index] : null);
    let country = (shown?.country ?? "").trim();
    if (country.length === 2) {
      try { country = new Intl.DisplayNames([navigator.language], { type: "region" }).of(country.toUpperCase()) ?? country; } catch { /* keep the code */ }
    }
    const zone = shown?.user?.local_timezone?.trim();
    // Steve, 2026-11-07: "On every video uploaded please include the date and time that was
    // uploaded." In the poster's own time zone when known, else this browser's.
    let uploaded = "";
    const raw = String((shown as { created_at?: string } | null)?.created_at ?? "").trim();
    if (raw.length >= 19) {
      const d = new Date(raw.slice(0, 19).replace(" ", "T") + "Z");
      if (!isNaN(d.getTime())) {
        const opts: Intl.DateTimeFormatOptions = { month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" };
        try { uploaded = new Intl.DateTimeFormat(navigator.language, { ...opts, timeZone: zone || undefined }).format(d); }
        catch { uploaded = new Intl.DateTimeFormat(navigator.language, opts).format(d); }
      }
    }
    const hasCountry = !!country && country.toLowerCase() !== "null";
    // Steve: the date and time on the next line, under "Uploaded from …".
    if (hasCountry && uploaded) originLines.push(t("video_uploaded_from", country), uploaded);
    else if (hasCountry) originLines.push(t("video_uploaded_from", country));
    else if (uploaded) originLines.push(t("video_uploaded_on", uploaded));
    if (zone) {
      try {
        const time = new Intl.DateTimeFormat(navigator.language, { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: zone }).format(new Date());
        const uname = shown?.user?.username?.trim();
        originLines.push(t("member_local_time", uname ? "@" + uname : (shown?.user?.fullname ?? ""), time));
      } catch { /* unknown zone: leave the line out */ }
    }
  }

  function startHold() {
    cancelHold();
    holdFired.current = false;
    holdTimer.current = window.setTimeout(() => {
      holdFired.current = true;
      videoRef.current?.pause();
      setMenuOpen(true);
      // Steve, 2026-10-25: the popup took 3-5 seconds and should "appear within 2 seconds".
      // One second, the same as both phones now.
    }, 1000);
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

  // Automatic captions (Steve, 2026-11-16): the spoken words under the video, the viewer's CC
  // switch, and for the creator "Edit captions" / "Captions on/off" in the hold menu.
  const captionLines = useMemo(() => shownCaptions(item),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [item?.id, item?.auto_captions, item?.auto_captions_status, item?.auto_captions_on]);
  const [editCaptions, setEditCaptions] = useState<CaptionLine[] | null>(null);
  const [captionBusy, setCaptionBusy] = useState(false);
  const mergeCaptions = useCallback((data: Partial<Post>) => {
    setItem((cur) => (cur && cur.id === data.id ? { ...cur, ...data } : cur));
  }, []);

  // ---- Not interested (Steve, 2026-11-16: Finding videos) ------------------------------------
  // The video leaves the queue and the next one plays; a gold bar offers Undo for 4 seconds.
  const meId = findingUserId(user?.id);
  const socialMe = socialUser(user);
  const [gotIt, setGotIt] = useState<{ post: Post; at: number } | null>(null);
  const gotItTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(gotItTimer.current), []);

  function markNotInterested() {
    if (!item) return;
    closeMenu(false);
    if (!meId) { goSignIn(); return; }
    const gone = item;
    const at = Math.max(0, feed.findIndex((p) => p.id === gone.id));
    const after = feed[at + 1] ?? null;
    setFeedState(removeFromFeed(gone.id));
    window.clearTimeout(gotItTimer.current);
    setGotIt({ post: gone, at });
    gotItTimer.current = window.setTimeout(() => setGotIt(null), 4000);
    if (after) navigate(`/video/${after.id}`, { replace: true });
    else navigate("/", { replace: true });
    notInterested(meId, gone.id).catch((e) => {
      // Not saved: put it back so the member is not told something that did not happen.
      window.clearTimeout(gotItTimer.current);
      setGotIt(null);
      setFeedState(insertIntoFeed(gone, at));
      showGoldAlert((e as Error).message || tt("something_went_wrong"));
    });
  }

  // "Interested" (Steve, 2026-11-25): the opposite — the server brings more of this creator's
  // videos. The video carries on playing.
  function markInterested() {
    if (!item) return;
    closeMenu();
    if (!meId) { goSignIn(); return; }
    showGoldAlert(tt("fnd_interested_done"));
    interested(meId, item.id).catch((e) => showGoldAlert((e as Error).message || tt("something_went_wrong")));
  }

  function undoGotIt() {
    if (!gotIt || !meId) return;
    const { post: back, at } = gotIt;
    window.clearTimeout(gotItTimer.current);
    setGotIt(null);
    setFeedState(insertIntoFeed(back, at));
    navigate(`/video/${back.id}`, { replace: true });
    undoNotInterested(meId, back.id).catch((e) => showGoldAlert((e as Error).message || tt("something_went_wrong")));
  }

  const gotItBar = gotIt ? (
    <div className="fnd-gotit" role="status">
      <span>{t("fnd_got_it")}</span>
      <span aria-hidden>·</span>
      <button type="button" onClick={undoGotIt}>{t("fnd_undo")}</button>
      <span aria-hidden>·</span>
      <button type="button" onClick={() => { window.clearTimeout(gotItTimer.current); setGotIt(null); navigate("/settings/filter-keywords"); }}>{t("fnd_filter_keywords")}</button>
    </div>
  ) : null;

  if (error) return <div className="page"><Notice error>{error}</Notice></div>;
  if (!item) return <div className="page"><Loading /></div>;

  // The rows of the hold-to-open menu, in the order Steve listed them. Each one does what the
  // control it replaced did; Auto Scroll is a switch, so it keeps the card up and its word
  // changes in place.
  // Steve, 2026-11-25: "Please put these tabs next to each other" — rows sharing a `pair` sit
  // side by side: Duet | Stitch, Analytics | Repost, Interested | Not interested, Report | Support.
  const menuRows: { label: string; trailing?: string; pair?: string; onPick: () => void }[] = [
    {
      label: t("auto_scroll"),
      trailing: auto ? t("switch_on") : t("switch_off"),
      onPick: () => toggleAuto(),
    },
    // The turning record opens the sound page (2026-11-16; it used to search for a field that
    // never existed, so it always searched for nothing). No sound, no row.
    ...(item.sound?.id ? [{
      label: t("the_turning_record"),
      onPick: () => { closeMenu(false); navigate(`/sound/${item.sound!.id}`); },
    }] : []),
    // Duet / Stitch (Steve, 2026-11-16). Hidden when the creator turned it off.
    ...(["duet", "stitch"] as const).filter((k) => remixAllowed(item, k)).map((k) => ({
      label: k === "duet" ? "Duet" : "Stitch",
      pair: "remix",
      onPick: () => {
        closeMenu(false);
        if (!isLoggedIn || !user) { navigate("/login", { state: { from: location.pathname } }); return; }
        navigate(`/record/${k}/${item.id}`);
      },
    })),
    { label: t("copy_this_video"), onPick: () => { void copyLink(); closeMenu(); } },
    // The creator's own video: fix the automatic captions, or switch them off. Only once the
    // server sends the fields (a post from before the deploy has none) and only on real videos.
    ...(user && Number(item.user_id) === Number(user.id) && item.auto_captions_status !== undefined && (item.post_kind ?? "video") === "video" ? [
      {
        label: t("ac_edit_captions"),
        onPick: () => {
          const lines = parseCaptions(item.auto_captions);
          const st = item.auto_captions_status;
          if (st === "queued" || st === "working") { showGoldAlert(tt("ac_being_written")); return; }
          if (!lines.length) { showGoldAlert(st === "failed" ? tt("ac_failed") : st === "off" ? tt("ac_turn_on_first") : tt("ac_no_words")); return; }
          closeMenu(false);
          setEditCaptions(lines);
        },
      },
      {
        label: t("ac_captions"),
        trailing: Number(item.auto_captions_on ?? 0) === 1 ? t("switch_on") : t("switch_off"),
        onPick: () => {
          if (captionBusy) return;
          const on = Number(item.auto_captions_on ?? 0) !== 1;
          setCaptionBusy(true);
          setPostAutoCaptions(user.id, item.id, on)
            .then((data) => {
              mergeCaptions(data);
              if (on && (data.auto_captions_status === "queued" || data.auto_captions_status === "working")) showGoldAlert(tt("ac_being_written"));
            })
            .catch((e) => showGoldAlert((e as Error).message))
            .finally(() => setCaptionBusy(false));
        },
      },
    ] : []),
    // Steve, 2026-11-13: "please add a analytics button, when they click it they will see all
    // the analytics for this video."
    { label: t("va_menu_row"), pair: "stats", onPick: () => { closeMenu(false); navigate(`/video/${item.id}/analytics`); } },
    // Repost (Steve, 2026-11-17): hidden when the creator turned reposting off, and on your own
    // video (the server refuses both). On the dev server it goes to the mock, never the live server.
    ...(Number(item.allow_repost ?? 1) !== 0 && (!socialMe || Number(item.user_id) !== Number(socialMe.id)) ? [{
      label: t("repost"),
      pair: "stats",
      onPick: () => {
        closeMenu(false);
        if (!socialMe) { navigate("/login", { state: { from: location.pathname } }); return; }
        void repostPost(socialMe.id, item.id)
          .then((m) => showGoldAlert(m || tt("done")))
          .catch((e) => showGoldAlert((e as Error).message || tt("something_went_wrong")));
      },
    }] : []),
    // Interested | Not interested (Steve, 2026-11-16 / 2026-11-25) — never on your own video.
    ...(!meId || Number(item.user_id) !== Number(meId) ? [
      { label: t("fnd_interested"), pair: "interest", onPick: markInterested },
      { label: t("fnd_not_interested"), pair: "interest", onPick: markNotInterested },
    ] : []),
    {
      label: t("report"),
      pair: "help",
      onPick: () => {
        closeMenu(false);
        if (!isLoggedIn || !user) { navigate("/login", { state: { from: location.pathname } }); return; }
        navigate(`/settings/support?reason=${encodeURIComponent(tt("report"))}&about=${encodeURIComponent(videoShareUrl(item))}`);
      },
    },
    { label: t("support"), pair: "help", onPick: () => { closeMenu(false); navigate("/settings/support"); } },
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
        {/* A locked post arrives with video "" — never put that on a <video>; the locked card instead. */}
        {item.locked || !item.video ? (
          item.locked ? <LockedCard key={`lock-${item.id}`} post={item} onUnlocked={() => setReloadKey((k) => k + 1)} /> : <div className="player" />
        ) : (
        <video key={item.id} ref={videoRef} className="player" src={mediaUrl(item.video)} poster={mediaUrl(item.thumbnail)} controls autoPlay playsInline
          loop={!auto}
          onPlay={() => { if (watchStartedAt.current === 0) watchStartedAt.current = Date.now(); }}
          onPause={watchClockStop}
          onTimeUpdate={(e) => rollGoldAtEnd(item.id, e.currentTarget)}
          onEnded={(e) => {
            rollGoldAtEnd(item.id, e.currentTarget, true);
            completedPlays.current += 1; watchClockStop();
            if (!auto) return;
            if (sentGift || giftSheetOpen) { advanceAfterGift.current = true; return; }
            goNextPlayable();
          }} />
        )}
        {sentGift && <GiftFlash gift={sentGift} onDone={clearSentGift} />}
        {/* Poll, Add Yours, link and comment-reply stickers (Steve, 2026-11-17). */}
        <VideoStickers post={item} hidden={chromeHidden} />
        {captionLines.length > 0 && <AutoCaptionOverlay key={item.id} lines={captionLines} videoRef={videoRef} />}
        {captionLines.length > 0 && !chromeHidden && <CcButton style={{ position: "absolute", top: 12, right: 12, zIndex: 3 }} />}

        {menuOpen && (
          // Steve, 2026-10-19: "Also add the Bingg Bongg logo on top of this popup." The same
          // black-and-gold card the rest of the site uses.
          // Steve, 2026-10-20: the new rectangle logo is itself a black plaque in a gold
          // frame, so the pill the thin wordmark sat on is now a border around a border.
          <div
            onClick={() => closeMenu()}
            style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.75)",
                     display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ width: "100%", maxWidth: 360, background: "#000",
                       border: "1.5px solid var(--gold-border)", borderRadius: 16, padding: 16 }}>
              <div style={{ textAlign: "center", marginBottom: 12 }}>
                <img src="/logo_horizontal.png" alt="Bingg Bongg" style={{ height: 62, maxWidth: "100%" }} />
              </div>
              <div style={{ fontWeight: 800, fontSize: 17, color: "var(--gold)", textAlign: "center", marginBottom: 12 }}>
                {t("this_video")}
              </div>
              {originLines.length > 0 && (
                // Steve, 2026-11-16: "Please make the uploaded date and time larger / more visible".
                <div style={{ color: "#FFDD55", textAlign: "center", fontSize: 17, fontWeight: 700, marginTop: -4, marginBottom: 12, lineHeight: 1.45 }}>
                  {originLines.map((line) => <div key={line}>{line}</div>)}
                </div>
              )}
              {(() => {
                // Steve, 2026-11-16: the video's average rating, a plain label — not a button.
                const line = ratingLine(t, item.rating_avg, item.rating_count);
                return line ? (
                  <div style={{ color: "var(--gold)", textAlign: "center", fontSize: 15, fontWeight: 800, marginTop: -4, marginBottom: 12 }}>
                    {line}
                  </div>
                ) : null;
              })()}
              {(() => {
                // Consecutive rows with the same `pair` share a line; a pair with one row left
                // (Repost hidden on your own video) stays full width.
                const lines: (typeof menuRows)[] = [];
                for (let i = 0; i < menuRows.length; i++) {
                  const r = menuRows[i], n = menuRows[i + 1];
                  if (r.pair && n && n.pair === r.pair) { lines.push([r, n]); i++; } else lines.push([r]);
                }
                return lines.map((line) => (
                  <div key={line.map((r) => r.label).join("|")} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    {line.map((r) => {
                      const half = line.length === 2;
                      // Long words (German "veröffentlichen") get smaller; the rest wraps to 2 lines.
                      const longest = Math.max(...r.label.split(" ").map((w) => w.length));
                      const size = !half ? 15 : longest > 17 ? 12 : longest > 13 ? 13.5 : 15;
                      return (
                        <button
                          key={r.label}
                          onClick={r.onPick}
                          style={{ display: "flex", alignItems: "center", gap: half ? 4 : 10, flex: 1, minWidth: 0, cursor: "pointer",
                                   padding: half ? "11px 8px" : "13px 14px", borderRadius: 10, background: "#101010",
                                   color: "var(--gold)", border: "1.5px solid var(--gold-border)", fontSize: size }}>
                          <span style={{ flex: 1, minWidth: 0, textAlign: "center", lineHeight: 1.2, overflowWrap: "break-word",
                                         display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.label}</span>
                          <span style={{ fontWeight: 800 }}>{r.trailing ?? "\u203A"}</span>
                        </button>
                      );
                    })}
                  </div>
                ));
              })()}
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
          {/* Steve, 2026-10-20. The web had no way to report a VIDEO at all — only a profile —
              so a member who saw something wrong here had to go to the uploader's page and
              report the person instead, which told an admin nothing about which clip. This
              files a post report, the same kind both phones file from the feed. */}
          <button
            className="btn small"
            title="Report this video"
            onClick={() => {
              if (!isLoggedIn) { navigate("/login", { state: { from: location.pathname + location.search } }); return; }
              setShowReport(true);
            }}
            style={{ background: "#000", color: "var(--gold)", borderColor: "var(--gold)" }}>
            Report</button>
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
      {/* Steve, 2026-11-20: "Search · <what they are talking about>" right under the video, one click to search it. */}
      <SearchTopicBar post={item} style={{ marginTop: 8 }} />
      <div className="row" style={{ marginTop: 14, alignItems: "flex-start" }}>
        {authorLive ? (
          // Steve, 2026-10-25: a creator who is live or battling gets a LIVE tag above their
          // avatar, red blinking to black inside a gold border, and the avatar opens the live.
          <Link to={`/live/${encodeURIComponent(authorLive.room_name)}`} className="live-avatar">
            <span className="live-tag">{t("live_badge")}</span>
            <Avatar user={item.user} />
          </Link>
        ) : (
          <Link to={`/profile/${item.user_id}`}><Avatar user={item.user} /></Link>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <Link to={`/profile/${item.user_id}`} style={{ fontWeight: 800, color: "var(--text)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName(item.user)}</Link>
            {/* Steve, 2026-11-20: the gold bullseye beside the name opens their badges page. */}
            <MemberBullseye userId={item.user_id ?? item.user?.id} />
          </div>
          <div className="soft" style={{ wordBreak: "break-word" }}><HashtagText text={item.description} /></div>
          {/* Steve, 2026-11-16: "Duet with @name" / "Stitched from @name" opens the original. */}
          {item.remix_of && (
            <Link to={`/video/${item.remix_of.id}`} style={{ display: "block", color: "var(--gold)", fontWeight: 700, fontSize: 13, marginTop: 4,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {item.remix_of.type === "duet" ? "Duet with" : "Stitched from"} @{item.remix_of.user_name ?? ""}
            </Link>
          )}
          {/* Creators and money (2026-11-17): "Ep N" on a series episode opens the series. */}
          {item.series_info && !item.locked && <EpisodeChip post={item} style={{ marginTop: 6 }} />}
          {/* Playlists + numbered-series folders (2026-11-20): the phones' playlist bar. */}
          <PostPlaylistBar post={item} />
          {/* Steve, 2026-11-16 ("Show the sound line"): the sound, one line, opens its page. */}
          {item.sound?.id && item.sound.title?.trim() && (
            <Link to={`/sound/${item.sound.id}`} style={{ display: "block", color: "var(--gold)", fontSize: 13, marginTop: 4, maxWidth: "100%",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              ♪ {item.sound.title.trim()}
            </Link>
          )}
          {/* Finding videos (2026-11-16): each hashtag opens its page. Tags already shown as
              #words in the description are not repeated. */}
          <HashtagList style={{ marginTop: 4 }} tags={postHashtags(item).filter((h) => !splitHashtags(item.description ?? "").some((x) => x.tag?.toLowerCase() === h.toLowerCase()))} />
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{index >= 0 ? `${t("n_of_m", index + 1, feed.length)}${loadingMore ? t("dot_loading_more") : ""}` : ""} · {auto ? t("auto_plays_the_next_video") : t("repeats_this_video")} · {t("arrow_keys_or_scroll_to_move")}</div>
        </div>
        <button ref={heartRef} className="btn small" title={isLoggedIn ? (liked ? t("hr_rate_this_video") : "") : "Sign in to like"}
          onPointerDown={heartDown}
          onPointerUp={heartUp}
          onPointerLeave={heartUp}
          onPointerCancel={heartUp}
          onContextMenu={(e) => {
            // Desktop right-click, or the touch long-press menu: the same as holding the heart.
            e.preventDefault();
            heartUp();
            if (heartHoldFired.current || ratingOpen) return;
            heartHoldFired.current = true;
            openRating();
          }}
          onClick={() => {
            // The click that ends a long press must not unlike what the press just rated.
            if (heartHoldFired.current) { heartHoldFired.current = false; return; }
            // Same as the gift button: signed out goes to Sign in and comes straight back.
            if (!isLoggedIn) { goSignIn(); return; }
            toggleLike();
          }}
          style={{ touchAction: "manipulation", WebkitTouchCallout: "none", userSelect: "none" }}>
          <span style={{ color: liked ? HEART_RED : undefined }}>{liked ? "♥" : "♡"}</span> {likes}
        </button>
        {ratingOpen && (
          <HeartRatingPanel anchorRef={heartRef} current={myRating} onRate={rate} onClose={() => setRatingOpen(false)} />
        )}
        <PostGiftButton post={item} onSent={setSentGift} onOpenChange={onGiftSheetOpenChange} />
      </div>
      {/* Steve, 2026-10-21: "Yes add the web too." The web had no comments at all until now —
          see CommentsPanel. Keyed on the post so moving down the feed resets the list rather
          than showing the previous video's comments under the new one. */}
      <div id="video-comments" style={{ scrollMarginTop: 70 }}>
        <CommentsPanel key={item.id} postId={item.id} totalComments={item.total_comments} postOwnerId={item.user_id} />
      </div>
      {editCaptions && user && (
        <EditCaptionsDialog
          lines={editCaptions}
          onClose={() => setEditCaptions(null)}
          onSave={async (lines) => {
            const data = await updatePostAutoCaptions(user.id, item.id, lines);
            mergeCaptions(data);
            setEditCaptions(null);
            showGoldAlert(tt("ac_saved"));
          }}
        />
      )}
      {gotItBar}
      {showReport && (
        <ReportDialog
          postId={item.id}
          reportedName={displayName(item.user)}
          onClose={() => setShowReport(false)}
          onDone={(message) => showGoldAlert(message)}
        />
      )}
    </div>
  );
}

/** The sticker fields of a decorated post, laid over a feed copy that has none. */
function pickSocial(p: SocialPost): Partial<SocialPost> {
  const out: Partial<SocialPost> = {};
  if (p.poll !== undefined) out.poll = p.poll;
  if (p.add_yours !== undefined) out.add_yours = p.add_yours;
  if (p.link_sticker !== undefined) out.link_sticker = p.link_sticker;
  if (p.reply_comment !== undefined) out.reply_comment = p.reply_comment;
  if (p.qa_question !== undefined) out.qa_question = p.qa_question;
  return out;
}
