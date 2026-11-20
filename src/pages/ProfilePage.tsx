import { useEffect, useRef, useState, type MouseEvent } from "react";
import { rememberCopiedLink, videoShareUrl } from "../lib/copiedLink";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { displayName, mediaUrl, post, type Post, type UserSummary } from "../lib/api";
import { VipBadge, VipBadgePopup } from "../components/VipBadge";
import { isVipReferrer } from "../lib/referral";
import { GoldDiggerBadge } from "../components/GoldDigger";
import type { GdBadge } from "../lib/goldDigger";
import { BattleBadge, BattleInfoPopup, BattleStreak, battleBadgeExplainer, battleStreakExplainer } from "../components/BattleBadge";
import { HousesPill } from "./HousesPage";
import { useSession } from "../lib/session";
import { memberLabel, trackPage } from "../lib/pageTracker";
import { ReportDialog } from "../components/ReportDialog";
import { Avatar, Loading, Notice } from "../components/Common";
import { fetchUserPhotos, type Photo } from "../lib/photos";
import { ProfileFolders, pickFolder } from "../components/ProfileFolders";
import { setPostFolder, announceFoldersChanged } from "../lib/folders";
import { MemberBusinessesPanel, MyBusinessesPanel } from "./BusinessPages";
import { ScheduleSection } from "../components/ScheduleSection";
import { PodcastProfileSection } from "../components/PodcastBits";
import { showGoldAlert, showGoldConfirm } from "../components/GoldToast";
import { fetchDmStatus, setDmBlock } from "../lib/dm";
import { CountryBattleBadges } from "../components/CountryBattleBits";
import { tt, useT  } from "../lib/i18n";
import { fetchChatBattleAlertMute, setChatBattleAlertMute } from "../lib/chatBattle";
import { cbText } from "../lib/countryBattle";
import { StoryRingAvatar } from "../components/Stories";
import { PlaylistsPanel } from "../components/Playlists";
import { QaPanel } from "../components/QaPanel";
import { countDrafts, onDraftsChanged } from "../lib/drafts";
import { playlistsFor, socialCall, socialUser, type PlaylistRow } from "../lib/social";
import { LockBadge, SubscribeButton } from "../components/Creators";
import { SeriesGrid } from "./CreatorPages";
import { devCreatorDecorate, fetchUserSeries, type Series } from "../lib/creators";

interface ProfileUser extends UserSummary {
  /** Gold Digger (2026-11-17): every month this member finished in the top 3, newest first.
   *  Absent on older servers — read as none. */
  gold_digger_badges?: GdBadge[];
  refer_code?: string;
  is_verified?: number;
  profile_category?: { id?: number; name?: string } | null;
  fb_url?: string;
  insta_url?: string;
  youtube_url?: string;
  // fetchUserDetails attaches these five as camelCase properties on the user object
  // ($user->postCounts = ... in UsersController), NOT as snake_case columns. Reading
  // post_counts/friends_count/etc. silently gave undefined, so every one of these tabs
  // rendered with no number while Following/Followers — which ARE snake_case columns on
  // tbl_users — showed theirs. Verified against the controller, 2026-09-26.
  postCounts?: number;
  friendsCount?: number;
  likedVideosCounts?: number;
  repostedCounts?: number;
  memberSpecialContestsCount?: number;
  saved_posts?: string;
  watch_history?: string;
  is_following_each_other?: number;
  is_blocked?: number;
  /** user_playlists rows (fetchUserDetails eager-loads them). */
  playlists?: PlaylistRow[];
}

interface ProfilePost extends Post {
  /** Set while the owner has it pinned on top of their profile (max 3, 2026-11-20). */
  pinned_at?: string | null;
  /** Profile video folders (2026-11-20): the folder this video is in, if any. */
  folder_id?: number | null;
  user_video_number?: number;
  lifetime_votes?: number;
  this_month_votes?: number;
}

interface BattleOpponent {
  user_id?: number;
  fullname?: string;
  username?: string;
  profile_image?: string;
}

interface BattleCareer {
  total_games?: number;
  wins?: number;
  losses?: number;
  lifetime_score?: number;
  opponents?: BattleOpponent[];
}

type TabKey = "videos" | "photos" | "qa" | "likes" | "reposted" | "playlists" | "series" | "saved" | "history" | "following" | "followers" | "friends" | "business";
const TAB_KEYS: TabKey[] = ["videos", "photos", "qa", "likes", "reposted", "playlists", "series", "saved", "history", "following", "followers", "friends", "business"];

const USER_TABS: TabKey[] = ["following", "followers", "friends"];

function fmt(n?: number | null): string {
  const v = Number(n ?? 0);
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(v);
}

function isValidUrl(url?: string | null): boolean {
  return !!url && /^https?:\/\/.+/.test(url);
}

/** Pinned on top of the profile (2026-11-20): a small gold pin in a black disc. */
function PinGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ transform: "rotate(45deg)" }}>
      <path fill="currentColor" d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z" />
    </svg>
  );
}

function ProfileThumb({ p, isMe, onClick, onMenu }: { p: ProfilePost; isMe: boolean; onClick: () => void; onMenu?: () => void }) {
  const { t } = useT();
  const thumb = mediaUrl(p.thumbnail);
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  // Hold (Steve, 2026-11-20): on your own grid, holding a tile ~0.7 s — or right-clicking it —
  // opens the gold menu with Pin / Unpin and Delete. The click that ends a hold does not open
  // the video.
  const holdTimer = useRef<number | null>(null);
  const held = useRef(false);
  const cancelHold = () => { if (holdTimer.current) { window.clearTimeout(holdTimer.current); holdTimer.current = null; } };
  const holdHandlers = onMenu ? {
    onPointerDown: () => {
      held.current = false;
      cancelHold();
      holdTimer.current = window.setTimeout(() => { held.current = true; holdTimer.current = null; onMenu(); }, 700);
    },
    onPointerUp: cancelHold,
    onPointerLeave: cancelHold,
    onPointerCancel: cancelHold,
    onContextMenu: (e: MouseEvent) => { e.preventDefault(); cancelHold(); onMenu(); },
  } : {};

  // Steve, 2026-10-13: "Add it on the tiles too." Same (C) as the video page, so a member can
  // copy a link straight off a grid without opening the video first.
  async function copyLink(e: MouseEvent) {
    e.stopPropagation();      // the tile underneath opens the video
    const url = videoShareUrl(p);
    rememberCopiedLink(url);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copy this video's link:", url);
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className="p-thumb" {...holdHandlers}
      onClick={() => { if (held.current) { held.current = false; return; } onClick(); }}>
      {thumb ? <img src={thumb} alt="" loading="lazy" /> : (
        <div style={{ width: "100%", height: "100%", background: "#111", display: "flex", alignItems: "center", justifyContent: "center", color: "#333", fontSize: 28 }}>▶</div>
      )}
      {(p.views ?? 0) > 0 && <span className="p-views">{fmt(p.views)}</span>}
      {p.pinned_at && <span className="p-pin" title={t("pin_badge")}><PinGlyph /></span>}
      {/* Creators and money (2026-11-17): subscriber-only / unbought series episode. */}
      <LockBadge lock={p.locked} />
      {(p.lifetime_votes ?? 0) > 0 && <span className="p-votes">★ {fmt(p.lifetime_votes)}</span>}
      {p.user_video_number != null && <span className="p-num">#{p.user_video_number}</span>}
      {/* Steve, 2026-10-05: "This is not working." It was a plain span with no click on it at
          all — decoration sitting on a thumbnail that opens the video. It is a real button now,
          and the click stops here instead of opening the video underneath. */}
      {/* Both bottom-right actions share one row — every other corner of the tile already
          carries a badge (views, votes, video number), and two absolutely-positioned buttons
          at the same corner would sit on top of each other. */}
      <div className="p-actions" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        {isMe && onMenu && (
          <button className="p-copy" title={t("pin_to_top")} aria-label={t("pin_to_top")}
            onClick={(e) => { e.stopPropagation(); onMenu(); }}>⋯</button>
        )}
        {isMe && (
          <button
            className="p-ad"
            title={t("advertise_this_video")}
            onClick={(e) => {
              e.stopPropagation();
              // The video goes with it, so the ad page doesn't ask for a file he already uploaded.
              navigate("/settings/advertise/new", { state: { videoUrl: mediaUrl(p.video) } });
            }}
          >
            ⚡
          </button>
        )}
        <button
          className="p-copy"
          title={t("copy_this_video_s_link")}
          onClick={(e) => void copyLink(e)}
        >
          {copied ? "✓" : "C"}
        </button>
      </div>
    </div>
  );
}

/** "Follower since 11/07/2026" / "Following since …" — the viewer's own date format. */
function followSinceLine(t: (k: "follower_since" | "following_since" | "friends_since", ...a: string[]) => string, tab: string, raw?: string): string | undefined {
  if (tab !== "followers" && tab !== "following" && tab !== "friends") return undefined;
  const r = (raw ?? "").trim();
  if (r.length < 19) return undefined;
  const d = new Date(r.slice(0, 19).replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return undefined;
  const date = new Intl.DateTimeFormat(navigator.language, { month: "2-digit", day: "2-digit", year: "numeric" }).format(d);
  return t(tab === "followers" ? "follower_since" : tab === "friends" ? "friends_since" : "following_since", date);
}

function UserCard({ user, myId, isLoggedIn, since }: { user: UserSummary; myId?: number; isLoggedIn: boolean; since?: string }) {
  const [following, setFollowing] = useState(!!user.is_following);
  async function toggle() {
    if (!myId) return;
    const next = !following;
    setFollowing(next);
    try {
      await post(next ? "followUser" : "unfollowUser", { user_id: myId, to_user_id: user.id });
    } catch {
      setFollowing(!next);
    }
  }
  return (
    <div className="p-ucard">
      <Link to={`/profile/${user.id}`} style={{ flexShrink: 0 }}>
        <Avatar user={user} />
      </Link>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <Link to={`/profile/${user.id}`} style={{ color: "inherit", textDecoration: "none" }}>
            {displayName(user)}
          </Link>
        </div>
        {user.username && <div className="muted" style={{ fontSize: 12 }}>@{user.username}</div>}
        {since && <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>{since}</div>}
      </div>
      {isLoggedIn && myId !== user.id && (
        <button className={`btn small${following ? " ghost" : ""}`} onClick={toggle} style={{ flexShrink: 0 }}>
          {following ? "Following" : "Follow"}
        </button>
      )}
    </div>
  );
}

/** Chat Battle round 2 (Steve, 2026-11-03): "Give all members the ability to shutoff the
 *  notification from each member that they don't want to receive the notification from." The
 *  web sends no pushes, but a web member's phones get them — this is their switch for one host.
 *  Shown while you follow them (only followers are alerted) or while they are muted (so it can be
 *  turned back on); hidden when the server can't answer (not deployed yet). */
function ChatBattleAlertToggle({ myId, host, following }: { myId: number; host: UserSummary; following: boolean }) {
  const { t } = useT();
  const [muted, setMuted] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    setMuted(null);
    fetchChatBattleAlertMute(myId, host.id).then((r) => { if (alive && r) setMuted(r.muted); });
    return () => { alive = false; };
  }, [myId, host.id]);
  if (muted === null || (!following && !muted)) return null;
  const handle = host.username || displayName(host);
  async function toggle() {
    if (busy || muted === null) return;
    const next = !muted;
    setBusy(true);
    setMuted(next);
    const r = await setChatBattleAlertMute(myId, host.id, next);
    setBusy(false);
    if (!r.ok) { setMuted(!next); if (r.message) showGoldAlert(r.message); return; }
    setMuted(r.muted);
    showGoldAlert(cbText(t(r.muted ? "chb_alerts_off_done" : "chb_alerts_on_done"), { name: handle }));
  }
  return (
    <label className="chb-alert-toggle">
      <span aria-hidden>{muted ? "🔕" : "🔔"}</span>
      <span className="chb-alert-label">{cbText(t("chb_alerts_from"), { name: handle })}</span>
      <input type="checkbox" className="switch" checked={!muted} disabled={busy} onChange={toggle} />
    </label>
  );
}

function BattleBoardModal({ userId, onClose }: { userId: number; onClose: () => void }) {
  const { t } = useT();
  const [career, setCareer] = useState<BattleCareer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    post("fetchHeadToHeadRecord", { user_id: userId })
      .then((r) => {
        const d = ((r.data ?? r) as Record<string, unknown>);
        setCareer({
          total_games: Number(d.total_games ?? d.totalGames ?? 0),
          wins: Number(d.wins ?? 0),
          losses: Number(d.losses ?? 0),
          lifetime_score: Number(d.lifetime_score ?? d.lifetimeScore ?? 0),
          opponents: Array.isArray(d.opponents) ? (d.opponents as BattleOpponent[]) : [],
        });
      })
      .catch(() => setCareer({ total_games: 0, wins: 0, losses: 0, lifetime_score: 0, opponents: [] }))
      .finally(() => setLoading(false));
  }, [userId]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h3>{t("lifetime_battle_board")}</h3>
        {loading ? <Loading /> : (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {[
                { label: "WINS", val: career?.wins ?? 0, color: "#4f8", bg: "rgba(0,200,80,0.08)", border: "1.5px solid #2a5" },
                { label: "LOSSES", val: career?.losses ?? 0, color: "#f84", bg: "rgba(200,80,0,0.08)", border: "1.5px solid #a42" },
                { label: "SCORE", val: fmt(career?.lifetime_score), color: "var(--gold)", bg: "rgba(240,196,32,0.07)", border: "1.5px solid var(--gold-border)" },
              ].map(({ label, val, color, bg, border }) => (
                <div key={label} style={{ flex: 1, textAlign: "center", padding: "12px 4px", background: bg, borderRadius: 10, border }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color }}>{val}</div>
                  <div style={{ fontSize: 10, color: "var(--text-dim)", letterSpacing: "0.05em" }}>{label}</div>
                </div>
              ))}
            </div>
            {(career?.total_games ?? 0) > 0 && (
              <div style={{ textAlign: "center", color: "var(--text-dim)", fontSize: 12, marginBottom: 14 }}>
                {t(career!.total_games === 1 ? "one_total_battle" : "n_total_battles", career!.total_games ?? 0)}
              </div>
            )}
            {(career?.opponents?.length ?? 0) > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 800, color: "var(--gold)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                  {t("recent_opponents")}</div>
                <div className="profile-user-list">
                  {career!.opponents!.slice(0, 10).map((op, i) => (
                    <div className="p-ucard" key={op.user_id ?? i}>
                      <Link to={op.user_id ? `/profile/${op.user_id}` : "#"} style={{ flexShrink: 0 }}>
                        <Avatar user={{ id: op.user_id ?? 0, fullname: op.fullname, username: op.username, profile_image: op.profile_image }} />
                      </Link>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700 }}>{op.fullname || op.username || "Player"}</div>
                        {op.username && <div className="muted" style={{ fontSize: 12 }}>@{op.username}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
        <button className="btn small ghost" style={{ marginTop: 16, width: "100%" }} onClick={onClose}>{t("close")}</button>
      </div>
    </div>
  );
}

export function ProfilePage() {
  const { t } = useT();
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: me, isLoggedIn } = useSession();
  // Stories and playlists act for the member — on the dev server also the Social mock's pretend one.
  const socialMe = socialUser(me);
  const [searchParams, setSearchParams] = useSearchParams();
  // My Information (Steve, 2026-11-18): "?info=1" shows the My Information view, so the
  // browser's Back closes it like the phones' back arrow does.
  const showInfo = searchParams.get("info") === "1";
  const infoOpenedHere = useRef(false);
  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [tab, setTab] = useState<TabKey>("videos");
  // Steve, 2026-10-05: "Make all popup into our design black and gold" — the badge and streak
  // explainers open the app's own popup instead of the browser's white alert box.
  const [battleInfo, setBattleInfo] = useState<{ title: string; body: string; flames?: number } | null>(null);
  const [vipInfo, setVipInfo] = useState(false);
  const [tabVideos, setTabVideos] = useState<ProfilePost[]>([]);
  /** The own-video gold hold menu (Pin / Unpin, Delete — Steve, 2026-11-20). */
  const [menuFor, setMenuFor] = useState<ProfilePost | null>(null);
  /** Profile video folders (2026-11-20): the open folder on the Videos tab, 0 = All videos. */
  const [folderSel, setFolderSel] = useState(0);
  const [tabUsers, setTabUsers] = useState<UserSummary[]>([]);
  // Photos are neither posts nor members, so they get their own bucket rather than being
  // squeezed through tabVideos (different fields, different click target).
  const [tabPhotos, setTabPhotos] = useState<Photo[]>([]);
  const [photoCount, setPhotoCount] = useState<number | null>(null);
  const [viewingPhoto, setViewingPhoto] = useState<Photo | null>(null);
  const [tabLoading, setTabLoading] = useState(false);
  const [tabError, setTabError] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<PlaylistRow[]>([]);
  const [playlistCreate, setPlaylistCreate] = useState(0);
  const [series, setSeries] = useState<Series[] | null>(null);
  // Q&A (2026-11-17): how many questions, once the tab has loaded them.
  const [qaCount, setQaCount] = useState<number | null>(null);
  // Drafts (2026-11-17): saved on this browser; a "Drafts (N)" tile leads your own videos.
  const [draftCount, setDraftCount] = useState(0);
  const [showBattleBoard, setShowBattleBoard] = useState(false);
  /** Open by default: the point of the card is that people SEE what is scheduled. */
  const [showSchedule, setShowSchedule] = useState(true);
  const [showOptions, setShowOptions] = useState(false);
  const [showReport, setShowReport] = useState(false);
  /** Have I stopped messages from this member? Decides "Stop" vs "Allow" in the ⋮ menu. */
  const [iStoppedThem, setIStoppedThem] = useState(false);
  const [copiedRefer, setCopiedRefer] = useState(false);
  const loadedTabs = useRef(new Set<TabKey>());
  const profileId = Number(id);

  useEffect(() => {
    if (!id) return;
    setProfile(null);
    setError(null);
    loadedTabs.current = new Set();
    // ?tab=playlists (the directory's Playlists tile) opens that tab.
    const wanted = searchParams.get("tab") as TabKey | null;
    setTab(wanted && TAB_KEYS.includes(wanted) ? wanted : "videos");
    setTabVideos([]);
    setTabUsers([]);
    setTabPhotos([]);
    setFolderSel(0);
    setPhotoCount(null);
    setSeries(null);
    setQaCount(null);

    (async () => {
      try {
        const res = await socialCall<ProfileUser>("fetchUserDetails", {
          user_id: id,
          ...(me ? { my_user_id: me.id } : {}),
        });
        if (!res.status || !res.data) throw new Error(res.message ?? tt("member_not_found"));
        setProfile(res.data);
        setFollowing(!!res.data.is_following);
        setPlaylists(await playlistsFor(res.data.id, res.data.playlists));
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [id, me?.id]);

  // Page history: name whose profile this was (the router already recorded the visit). Your own
  // profile is profile_self, with nobody to name. Checked against the URL: going from one profile
  // to another, the previous member is still in state for a render.
  useEffect(() => {
    if (!profile || !id || String(profile.id) !== String(id) || String(profile.id) === String(me?.id)) return;
    trackPage("profile", "member", id, memberLabel(profile));
  }, [profile?.id, id, me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // A different folder is a different list: let the Videos tab load again.
  const lastFolder = useRef(0);
  if (lastFolder.current !== folderSel) {
    lastFolder.current = folderSel;
    loadedTabs.current.delete("videos");
  }

  useEffect(() => {
    if (!profile || !id) return;
    if (loadedTabs.current.has(tab)) return;
    loadedTabs.current.add(tab);
    setTabLoading(true);
    setTabVideos([]);
    setTabUsers([]);

    // Steve, 2026-10-01: "Add a 'Business' tab in the personal profile page." The panel fetches
    // and renders its own data (fetchMyBusinesses), so there is nothing for this effect to load.
    if (tab === "series") {
      // Creators and money (2026-11-17): the member's paid video series.
      setSeries(null);
      fetchUserSeries(Number(id)).then(setSeries).catch(() => setSeries([])).finally(() => setTabLoading(false));
      return;
    }
    if (tab === "business" || tab === "playlists" || tab === "qa") {
      setTabLoading(false);
      return;
    }

    if (tab === "photos") {
      // Its own call: fetchUserPhotos returns {user, photos, photo_count}, not the flat list
      // every other tab here returns, and it needs my_user_id AND user_id (see lib/photos.ts).
      // fetchUserPhotos needs a signed-in caller (my_user_id + authorizeUser), so a signed-out
      // visitor gets a 401 — which must NOT be rendered as "no photos yet", since that blames
      // the member for something that's really "you aren't signed in".
      if (!me) {
        setTabPhotos([]);
        setPhotoCount(null);
        setTabLoading(false);
        return;
      }
      fetchUserPhotos(me.id, Number(id))
        .then(({ photos, count }) => { setTabPhotos(photos); setPhotoCount(count); })
        // 2026-09-27: a failed call (expired session, network) used to read as "No photos yet",
        // which blames the member for something that is really a load error — leave the count
        // unknown so the tab says the load failed instead.
        .catch(() => { setTabPhotos([]); setPhotoCount(null); setTabError("Couldn't load photos. Sign in again and retry."); })
        .finally(() => setTabLoading(false));
      return;
    }

    const base = { start: 0, count: 30, ...(me ? { my_user_id: me.id } : {}) };

    // Excludes "photos" deliberately: that tab returned above, because its endpoint's response
    // shape doesn't match the flat list every tab in this map produces. Exclude<> rather than
    // Partial<> so a NEW tab still has to be added here or fail the build.
    // Every name and parameter below was checked against routes/api.php and the controller's
    // own validator on 2026-09-26. Three of these used to name routes that DO NOT EXIST —
    // fetchRepostVideos, fetchFriendsList and fetchUserWatchHistory — so those tabs 404'd and
    // rendered empty forever. A guessed endpoint name fails exactly like a missing feature.
    const endpointMap: Record<Exclude<TabKey, "photos" | "business" | "playlists" | "series" | "qa">, [string, Record<string, unknown>]> = {
      videos: ["fetchUserPosts", { user_id: id, ...base, ...(folderSel > 0 ? { folder_id: folderSel } : {}) }],
      // NOT fetchUserPostsWithLikes: that returns THIS member's own posts that have received
      // likes, whereas the "Likes" count beside the tab is likedVideosCounts — the videos they
      // liked. fetchUserLikedPosts is the one that matches the number.
      likes: ["fetchUserLikedPosts", { user_id: id, ...base }],
      reposted: ["fetchUserRepostedPosts", { user_id: id, ...base }],
      saved: ["fetchUserSavedPosts", { user_id: me?.id ?? id, ...base }],
      history: ["fetchUserWatchHistoryPosts", { my_user_id: me?.id ?? id, ...base }],
      following: ["fetchFollowingList", { user_id: id, ...base }],
      followers: ["fetchFollowersList", { user_id: id, ...base }],
      friends: ["fetchUserFriends", { user_id: id, ...base }],
    };

    const [endpoint, params] = endpointMap[tab];
    // Start every tab from empty: a failed fetch used to leave the PREVIOUS tab's list on
    // screen under the new tab's name (Steve's 2026-09-26 screenshots had Likes showing
    // Reposted's four videos).
    setTabUsers([]);
    setTabVideos([]);
    setTabError(null);
    socialCall(endpoint, params)
      .then((r) => {
        const items = (r.data ?? r.list ?? []) as Record<string, unknown>[];
        if (USER_TABS.includes(tab)) {
          // These three come back as tbl_followers ROWS with the member nested inside, not as
          // a flat member list. Laravel serialises the relation names in snake_case —
          // `to_user` / `from_user`, NOT the `toUser` / `fromUser` the controller code reads —
          // which is why every one of these tabs said "No members yet." on 2026-09-26 while
          // the API was returning 30 rows. Following -> to_user, Followers -> from_user.
          // Friends rows carry BOTH (a self-join on tbl_followers whose duplicate column names
          // make "which side is the friend" depend on MySQL's column order), so for that tab
          // the friend is simply whichever nested member is not the profile's owner.
          const pick = (row: Record<string, unknown>): UserSummary | null => {
            const to = (row.to_user ?? row.toUser) as UserSummary | undefined;
            const from = (row.from_user ?? row.fromUser) as UserSummary | undefined;
            if (tab === "following") return to ?? null;
            if (tab === "followers") return from ?? null;
            return [from, to].find((u) => u && u.id !== profileId) ?? null;
          };
          // Steve, 2026-11-07: the date each follow began, from the follow row's own created_at.
          setTabUsers(items.map((row): UserSummary | null => {
            const u = pick(row);
            // Friends: the server's friends_since — when the follow became mutual.
            return u ? ({ ...u, follow_since: String((tab === "friends" ? row.friends_since : row.created_at) ?? "") } as UserSummary) : u;
          }).filter((u): u is UserSummary => !!u));
        } else {
          // Reposted and Likes are join rows carrying the post under `post`; Videos/Saved/History
          // are already posts. `?? row` keeps both shapes working through one path.
          const vids = items.map((row) => (row.post ?? row) as ProfilePost).filter(Boolean);
          setTabVideos(vids);
          // Dev server: the Creators mock's locks over the real list.
          if (import.meta.env.DEV) void devCreatorDecorate(vids).then(setTabVideos);
        }
      })
      .catch((e: unknown) => {
        // Friends and Reposted are members-only on the server (authorizeUser); signed out they
        // answer 401. Say so instead of pretending the member has none.
        const status = (e as { status?: number })?.status;
        setTabError(status === 401 && !me ? "Sign in to see this." : "Couldn't load this tab.");
      })
      .finally(() => setTabLoading(false));
  }, [tab, profile, folderSel]);

  /** After a playlist is made, edited or deleted: the profile's rows again. */
  async function reloadPlaylists() {
    if (!id) return;
    const res = await socialCall<ProfileUser>("fetchUserDetails", { user_id: id, ...(me ? { my_user_id: me.id } : {}) }).catch(() => null);
    setPlaylists(await playlistsFor(Number(id), res?.data?.playlists));
  }

  async function toggleFollow() {
    if (!me || !profile) return;
    const next = !following;
    setFollowing(next);
    try {
      await post(next ? "followUser" : "unfollowUser", { user_id: me.id, to_user_id: profile.id });
    } catch {
      setFollowing(!next);
    }
  }

  // Message limits (Steve, 2026-11-09). Only i_blocked_them is used here; the server's failure
  // (not deployed yet) reads as "not stopped".
  useEffect(() => {
    setIStoppedThem(false);
    if (!me || !profile || me.id === profile.id) return;
    let alive = true;
    void fetchDmStatus(me.id, profile.id).then((s) => { if (alive) setIStoppedThem(s.i_blocked_them); });
    return () => { alive = false; };
  }, [me?.id, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleStopMessages() {
    if (!me || !profile) return;
    setShowOptions(false);
    const handle = profile.username || displayName(profile);
    const stop = !iStoppedThem;
    if (stop) {
      const ok = await showGoldConfirm({
        message: t("dm_stop_confirm", handle),
        confirmLabel: t("dm_stop_button"),
        cancelLabel: t("cancel"),
      });
      if (!ok) return;
    }
    const r = await setDmBlock(me.id, profile.id, stop);
    if (!r) { showGoldAlert(t("dm_couldnt_save")); return; }
    setIStoppedThem(r.i_blocked_them);
    showGoldAlert(t(r.i_blocked_them ? "dm_stopped_done" : "dm_allowed_done", handle));
  }

  async function handleBlock() {
    if (!me || !profile) return;
    setShowOptions(false);
    if (!confirm(`Block ${displayName(profile)}?`)) return;
    await post("blockUser", { user_id: me.id, to_user_id: profile.id }).catch(() => {});
    navigate(-1);
  }

  // Steve, 2026-10-20: "Please add explanation so they can explain exactly what is wrong."
  //
  // This was one click that sent reason "Reported from web", no description, and the SIGNED-IN
  // member's id as user_id — which the endpoint reads as the person being reported. So a web
  // report named the reporter, carried no explanation, was rejected by the server for the
  // missing description, and thanked the member anyway. Nothing was ever filed.
  function handleReport() {
    if (!me || !profile) return;
    setShowOptions(false);
    setShowReport(true);
  }

  async function copyReferCode() {
    if (!profile?.refer_code) return;
    try {
      await navigator.clipboard.writeText(profile.refer_code);
      setCopiedRefer(true);
      setTimeout(() => setCopiedRefer(false), 2000);
    } catch {
      // fallback
    }
  }

  const socialMeId = socialMe?.id ?? 0;
  useEffect(() => {
    if (!socialMeId || socialMeId !== Number(id)) { setDraftCount(0); return; }
    const refresh = () => { void countDrafts(socialMeId).then(setDraftCount); };
    refresh();
    return onDraftsChanged(refresh);
  }, [socialMeId, id]);

  function switchTab(t: TabKey) {
    if (t === tab) return;
    if (!loadedTabs.current.has(t)) {
      // will be fetched by effect
    }
    setTab(t);
  }

  if (error) return <div className="page"><Notice error>{error}</Notice></div>;
  if (!profile) return <div className="page"><Loading /></div>;

  const isMe = !!socialMe && socialMe.id === profile.id;

  function openInfo() {
    infoOpenedHere.current = true;
    const next = new URLSearchParams(searchParams);
    next.set("info", "1");
    setSearchParams(next);
    window.scrollTo(0, 0);
  }
  function closeInfo() {
    if (!showInfo) return;
    // Opened with the button: Back is the same as the browser's. Opened from a link: drop the flag.
    if (infoOpenedHere.current) { infoOpenedHere.current = false; navigate(-1); return; }
    const next = new URLSearchParams(searchParams);
    next.delete("info");
    setSearchParams(next, { replace: true });
  }

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "videos", label: "Videos", count: profile.postCounts },
    // Steve, 2026-09-26: "next to videos we need to add photos". Count is only known once the
    // tab has been opened, so it stays absent until then rather than showing a wrong 0.
    { key: "photos", label: "Photos", count: photoCount ?? undefined },
    // Steve, 2026-10-01: "Add a business tab in the public profile page for everyone to see his
    // business. and add a tab in their personal profile page is where they add/edit their
    // business." One tab on every profile; the panel below decides which form to show.
    { key: "business" as TabKey, label: "Business" },
    // Q&A (Steve, 2026-11-17): ask this member a question; they answer with a video.
    { key: "qa" as TabKey, label: t("qa_tab"), count: qaCount ?? undefined },
    { key: "following", label: "Following", count: profile.total_followings },
    { key: "followers", label: "Followers", count: profile.total_followers },
    { key: "friends", label: "Friends", count: profile.friendsCount },
    { key: "likes", label: "Likes", count: profile.likedVideosCounts },
    { key: "reposted", label: t("soc_reposts"), count: profile.repostedCounts },
    // Steve, 2026-11-17: "Playlists on a profile" — everyone's, with the owner's create/edit/delete.
    { key: "playlists", label: t("fname_playlists"), count: playlists.length },
    // Creators and money (Steve, 2026-11-17): paid video series.
    { key: "series", label: t("cm_series_tab"), count: series ? series.length : undefined },
    ...(isMe ? [
      { key: "saved" as TabKey, label: "Saved" },
      { key: "history" as TabKey, label: "History" },
    ] : []),
  ];

  return (
    <div className="page" style={{ maxWidth: 600, margin: "0 auto" }}>
      {/* Header card. My Information (Steve, 2026-11-18: "Right under the image, Please add a
          \"My Information\" button ... Click on \"My Information\" button and add all the
          information on this page to that page. Video, Photos, Business, Following, etc this line
          will stay on this page."): the profile keeps the avatar, the button and the tab row; the
          name, badges, bio, counts and every button are on the My Information view. "Information"
          on someone else's profile — it is theirs, not mine. */}
      {showInfo ? (
        <div className="profile-info-page">
          <div className="cosmic-head">
            <button className="back-circle" onClick={closeInfo} aria-label={t("back")}>‹</button>
            <h1 className="page-title" style={{ margin: 0 }}>{t(isMe ? "pi_my_information" : "pi_information")}</h1>
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <h1 style={{ fontSize: 20, color: "var(--gold)", fontWeight: 800, margin: 0 }}>
                  {displayName(profile)}
                </h1>
                {/* Steve, 2026-10-05: the Bingg Bongg Battle Badge beside their name. */}
                <BattleBadge
                  badge={profile.battle_badge}
                  onClick={() => setBattleInfo({
                    title: "Bingg Bongg Battle Badge",
                    body: battleBadgeExplainer(displayName(profile), profile.battle_badge ?? 0),
                  })}
                />
                {/* Steve, 2026-10-05: the streak beside it — one flame per 30 days kept, and a
                    flame is one free day. */}
                <BattleStreak
                  streak={profile.battle_streak}
                  flames={profile.battle_flames}
                  onClick={() => setBattleInfo({
                    title: "Battle Streak",
                    body: battleStreakExplainer(displayName(profile), profile.battle_streak ?? 0, profile.battle_flames ?? 0),
                    flames: profile.battle_flames ?? 0,
                  })}
                />
                {/* Steve, 2026-10-29: a VIP Referral Member's gold pill; tapping it says what it is. */}
                {isVipReferrer(profile.is_vip_referrer) && <VipBadge onClick={() => setVipInfo(true)} />}
                {/* Build Your Houses (Steve, 2026-11-05): "🏠 N houses" opens their house page. */}
                <HousesPill userId={profile.id} />
                {/* Gold Digger (2026-11-17): "⛏️ Gold Digger 🥇 October 2026" — opens the board. */}
                <GoldDiggerBadge badges={profile.gold_digger_badges} />
                {profile.is_verified === 2 && (
                  <span title={t("verified")} style={{ color: "#4af", fontSize: 16 }}>✓</span>
                )}
                {profile.profile_category?.name && (
                  <span className="pill" style={{ fontSize: 11 }}>{profile.profile_category.name}</span>
                )}
              </div>
              {/* Steve, 2026-10-11: "For this entire page put black borders around all the text
                  and make all the text in gold colour." The handle and bio were grey text
                  straight on the page. */}
              <div className="gold-plate" style={{ fontSize: 12, marginTop: 4 }}>
                @{profile.username}{profile.country ? ` · ${profile.country}` : ""}
              </div>
              {/* Country Battle v2 daily badges — 1st gold, 2nd silver, 3rd bronze, newest first, each
                  opening that day's top 100; the lifetime counts beside them. */}
              <CountryBattleBadges badges={profile.country_battle_badges} counts={profile.country_battle_badge_counts} />
              {profile.bio && (
                <p className="gold-plate" style={{ marginTop: 6, fontSize: 13, lineHeight: 1.4 }}>{profile.bio}</p>
              )}
              {/* Social links */}
              {(isValidUrl(profile.fb_url) || isValidUrl(profile.insta_url) || isValidUrl(profile.youtube_url)) && (
                <div className="social-links">
                  {isValidUrl(profile.fb_url) && (
                    <a href={profile.fb_url!} target="_blank" rel="noopener noreferrer" className="social-link">
                      {/* i18n-exempt: brand names. */}
                      <span>f</span> Facebook
                    </a>
                  )}
                  {isValidUrl(profile.insta_url) && (
                    <a href={profile.insta_url!} target="_blank" rel="noopener noreferrer" className="social-link">
                      {/* i18n-exempt: brand names. */}
                      <span>◉</span> Instagram
                    </a>
                  )}
                  {isValidUrl(profile.youtube_url) && (
                    <a href={profile.youtube_url!} target="_blank" rel="noopener noreferrer" className="social-link">
                      {/* i18n-exempt: brand names. */}
                      <span>▶</span> YouTube
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        {/* Stat bullets */}
        <div style={{ display: "flex", overflowX: "auto", scrollbarWidth: "none", gap: 0, borderBottom: "1px solid var(--line)", borderTop: "1px solid var(--line)", margin: "0 -16px", padding: "0 4px" }}>
          {[
            { label: "Videos", val: profile.postCounts, tab: "videos" as TabKey },
            { label: "Following", val: profile.total_followings, tab: "following" as TabKey },
            { label: "Followers", val: profile.total_followers, tab: "followers" as TabKey },
            { label: "Friends", val: profile.friendsCount, tab: "friends" as TabKey },
            { label: "Likes", val: profile.total_likes, tab: "likes" as TabKey },
            { label: t("soc_reposts"), val: profile.repostedCounts, tab: "reposted" as TabKey },
          ].map(({ label, val, tab: t }) => (
            <button
              key={label}
              className="stat-bullet"
              style={{ background: "none", border: "none", cursor: "pointer", padding: "10px 8px", minWidth: 60, flex: 1 }}
              onClick={() => { switchTab(t); closeInfo(); }}
            >
              <b style={{ fontSize: 16, color: "var(--gold)", fontWeight: 800 }}>{fmt(val)}</b>
              <span style={{ fontSize: 10, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 2 }}>{label}</span>
            </button>
          ))}
        </div>

        {/* Referral code (own profile) */}
        {isMe && profile.refer_code && (
          <div className="refer-row">
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginRight: 4 }}>{t("referral_code")}</div>
            <div className="refer-code">{profile.refer_code}</div>
            <button className="btn small" onClick={copyReferCode} style={{ flexShrink: 0 }}>
              {copiedRefer ? "Copied!" : "Copy"}
            </button>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {!isMe && isLoggedIn && (
            <button className={`btn${following ? " ghost" : ""}`} style={{ flex: 1 }} onClick={toggleFollow}>
              {following ? "Following" : "Follow"}
            </button>
          )}
          {/* Creators and money (2026-11-17): "Subscribe · 199 BBs/month" when they offer one. */}
          {!isMe && <SubscribeButton creatorId={profile.id} creatorName={displayName(profile)} />}
          {/* Steve, 2026-11-09: "Please add send a message to members public profile page." This
              was the Chat button, shown only on a mutual follow; now every signed-in member gets
              it, and the one-message-until-they-reply limit is enforced in the thread itself. */}
          {!isMe && isLoggedIn && (
            <Link to={`/messages/${profile.id}`} className="btn" style={{ flex: 1, textAlign: "center", whiteSpace: "nowrap" }}>
              ✉️ {t("dm_message")}</Link>
          )}
          <button className="btn ghost small" onClick={() => setShowBattleBoard(true)}>
            {t("battle_board")}</button>
          <button className="btn ghost small" onClick={() => navigate("/settings/find-a-battle")}>
            {t("find_battle")}</button>
          {/* Steve, 2026-10-07: "My account is the good judge and i don't see it there" — it used
              to sit below the playlists, far down the page. Next to Battle Board / Find Battle it
              is where someone actually looks for it. */}
          <button className="btn ghost small" onClick={() => setShowSchedule((v) => !v)}>
            🗓 {showSchedule ? "Hide Schedule" : "My Live/Battle Schedule"}
          </button>
          {isMe && (
            // Steve, 2026-09-26: "On each personal profile page please add a link called
            // 'Support' but inside the link page call it, 'Who Supported Me'." Own profile only —
            // it lists the gifts sent to the signed-in member.
            <button className="btn ghost small" onClick={() => navigate("/support")}>
              {t("support_2")}</button>
          )}
          {isMe && (
            <button className="btn ghost small" onClick={() => { switchTab("playlists"); setPlaylistCreate((n) => n + 1); closeInfo(); }}>
              {t("playlist")}</button>
          )}
          {/* Creators and money (2026-11-17). */}
          {isMe && <button className="btn ghost small" onClick={() => navigate("/subscriptions")}>💎 {t("cm_my_subscription")}</button>}
          {isMe && <button className="btn ghost small" onClick={() => navigate("/scheduled")}>🗓 {t("cm_scheduled_posts")}</button>}
        </div>

        {!isMe && isLoggedIn && me && <ChatBattleAlertToggle myId={me.id} host={profile} following={following} />}

        {/* Bingg Bongg Podcast (Steve, 2026-11-10): the host's live podcast + episodes + Follow show.
            Renders nothing while switched off, on a failed call, or for a member with no podcasts. */}
        <PodcastProfileSection profileId={profile.id} />

        {showSchedule && <ScheduleSection profileId={profileId} myId={me?.id} />}

        </div>
      ) : (
      <div style={{ padding: "16px 0 0" }}>
        <div className="profile-avatar-row">
          {/* Stories (2026-11-17): a gold ring while they have live stories; tap opens them. */}
          <StoryRingAvatar profile={profile}><Avatar user={profile} size="lg" /></StoryRingAvatar>
          {/* Options menu for other profiles */}
          {!isMe && isLoggedIn && (
            <div style={{ position: "relative", flexShrink: 0 }}>
              <button
                className="btn ghost small"
                onClick={() => setShowOptions((v) => !v)}
                style={{ padding: "4px 8px", fontSize: 18 }}
                title={t("options")}
              >⋮</button>
              {showOptions && (
                <div style={{ position: "absolute", right: 0, top: "100%", background: "var(--panel)", border: "1.5px solid var(--gold-border)", borderRadius: 10, minWidth: 140, zIndex: 20, padding: 4 }}>
                  <button className="btn ghost small" style={{ width: "100%", textAlign: "left", borderRadius: 6 }}
                    onClick={() => { navigator.share?.({ url: `${window.location.origin}/profile/${profile.id}`, title: displayName(profile) }).catch(() => {}); setShowOptions(false); }}>
                    {t("share_profile_2")}</button>
                  <button className="btn ghost small" style={{ width: "100%", textAlign: "left", borderRadius: 6 }} onClick={() => void toggleStopMessages()}>
                    {t(iStoppedThem ? "dm_allow_from" : "dm_stop_from", profile.username || displayName(profile))}</button>
                  <button className="btn ghost small" style={{ width: "100%", textAlign: "left", borderRadius: 6 }} onClick={handleReport}>
                    {t("report")}</button>
                  <button className="btn ghost small" style={{ width: "100%", textAlign: "left", borderRadius: 6, color: "#f84" }} onClick={handleBlock}>
                    {t("block")}</button>
                </div>
              )}
            </div>
          )}
        </div>
        <button className="profile-info-btn" onClick={openInfo}>{t(isMe ? "pi_my_information" : "pi_information")}</button>
      </div>
      )}

      {!showInfo && (<>
      {/* Tab chips */}
      <div className="profile-tabs-wrap" style={{ margin: "0 -16px", padding: "0 12px" }}>
        <div className="profile-tabs">
          {tabs.map(({ key, label, count }) => (
            <button
              key={key}
              className={`profile-tab${tab === key ? " active" : ""}`}
              onClick={() => switchTab(key)}
            >
              {label}{count != null ? ` ${fmt(count)}` : ""}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ marginTop: 4 }}>
        {tabLoading ? (
          <div style={{ padding: "32px 0" }}><Loading /></div>
        ) : tabError && tab !== "playlists" && tab !== "business" && tab !== "series" && tab !== "qa" ? (
          <p className="muted" style={{ padding: "24px 0", textAlign: "center" }}>{tabError}</p>
        ) : tab === "qa" ? (
          <QaPanel creatorId={profile.id} creatorName={profile.username ? `@${profile.username}` : displayName(profile)}
            isMe={isMe} myId={socialMe?.id ?? null} onCount={setQaCount} />
        ) : tab === "playlists" ? (
          <PlaylistsPanel ownerId={profile.id} isMe={isMe} myId={me?.id} playlists={playlists}
            onChanged={() => void reloadPlaylists()} createRequest={playlistCreate} />
        ) : tab === "series" ? (
          <div>
            {isMe && <button className="btn gold" style={{ width: "100%", margin: "8px 0 12px" }} onClick={() => navigate("/series/new")}>{t("cm_new_series")}</button>}
            {series === null ? <Loading /> : <SeriesGrid series={series} />}
          </div>
        ) : tab === "business" ? (
          isMe ? <MyBusinessesPanel /> : <MemberBusinessesPanel userId={profile.id} />
        ) : tab === "photos" ? (
          tabPhotos.length === 0 ? (
            <p className="muted" style={{ padding: "24px 0", textAlign: "center" }}>
              {me ? "No photos yet." : "Sign in to see photos."}
            </p>
          ) : (
            <div className="profile-vid-grid">
              {tabPhotos.map((ph) => (
                <button key={ph.id} onClick={() => setViewingPhoto(ph)}
                  style={{ padding: 0, border: "none", background: "transparent", cursor: "pointer", display: "block", width: "100%" }}>
                  <img src={ph.thumb_url || ph.photo_url || mediaUrl(ph.thumb_path || ph.photo_path)} alt="" loading="lazy"
                    style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block", borderRadius: 4 }} />
                </button>
              ))}
            </div>
          )
        ) : USER_TABS.includes(tab) ? (
          tabUsers.length === 0 ? (
            <p className="muted" style={{ padding: "24px 0", textAlign: "center" }}>{t("no_members_yet")}</p>
          ) : (
            <div className="profile-user-list">
              {tabUsers.map((u) => (
                <UserCard key={u.id} user={u} myId={me?.id} isLoggedIn={isLoggedIn}
                  since={followSinceLine(t, tab, (u as UserSummary & { follow_since?: string }).follow_since)} />
              ))}
            </div>
          )
        ) : (<>
          {/* Profile video folders (Steve, 2026-11-20): All videos + each folder, gold chips. */}
          {tab === "videos" && (
            <ProfileFolders profileId={profile.id} isMe={isMe} myId={socialMe?.id ?? me?.id} selected={folderSel} onSelect={setFolderSel} />
          )}
          {tabVideos.length === 0 && !(isMe && tab === "videos" && draftCount > 0 && folderSel === 0) ? (
            <p className="muted" style={{ padding: "24px 0", textAlign: "center" }}>{t(tab === "videos" && folderSel > 0 ? "fld_empty" : "no_videos_yet")}</p>
          ) : (
            <div className="profile-vid-grid">
              {/* Drafts (Steve, 2026-11-17): first in your own videos, only when there are some. */}
              {isMe && tab === "videos" && draftCount > 0 && folderSel === 0 && (
                <button type="button" className="drafts-tile" onClick={() => navigate("/drafts")}>
                  <span style={{ fontSize: 26 }}>🗂️</span>
                  <span>{t("dft_drafts_n", draftCount)}</span>
                </button>
              )}
              {tabVideos.map((p) => (
                <ProfileThumb
                  key={p.id}
                  p={p}
                  isMe={isMe}
                  onClick={() => navigate(`/video/${p.id}`)}
                  onMenu={isMe && tab === "videos" ? () => setMenuFor(p) : undefined}
                />
              ))}
            </div>
          )}
        </>)}
      </div>
      </>)}

      {menuFor && socialMe && (
        <OwnVideoMenu
          post={menuFor}
          onClose={() => setMenuFor(null)}
          onMove={async () => {
            const target = menuFor;
            setMenuFor(null);
            const to = await pickFolder(socialMe.id, target.folder_id ?? 0);
            if (to === null || to === (target.folder_id ?? 0)) return;
            try {
              const r = await setPostFolder(socialMe.id, target.id, to);
              if (!r.status) { showGoldAlert(r.message || "Something went wrong. Please try again."); return; }
              setTabVideos((list) => folderSel > 0 && to !== folderSel
                ? list.filter((x) => x.id !== target.id)
                : list.map((x) => (x.id === target.id ? { ...x, folder_id: to || null } : x)));
              announceFoldersChanged();
            } catch {
              showGoldAlert("Something went wrong. Please try again.");
            }
          }}
          onPin={async () => {
            const target = menuFor;
            setMenuFor(null);
            const pin = !target.pinned_at;
            try {
              const r = await socialCall<unknown>("pinPost", { user_id: socialMe.id, post_id: target.id, pin: pin ? 1 : 0 });
              const ids = Array.isArray(r.pinned_ids) ? (r.pinned_ids as unknown[]).map(Number) : null;
              if (ids) {
                // Same order the server lists them: pinned (most recently pinned first), then newest.
                setTabVideos((list) => {
                  const marked: ProfilePost[] = list.map((x) => ({ ...x, pinned_at: ids.includes(x.id) ? (x.pinned_at || "pinned") : null }));
                  const pinned = ids.map((id) => marked.find((x) => x.id === id)).filter((x): x is ProfilePost => !!x);
                  const rest = marked.filter((x) => !ids.includes(x.id)).sort((a, b) => b.id - a.id);
                  return [...pinned, ...rest];
                });
              }
              if (r.status) showGoldAlert(t(pin ? "pin_done" : "pin_undone"));
              else if (r.limit_reached) showGoldAlert(t("pin_limit"));
              else showGoldAlert(r.message || "Something went wrong. Please try again.");
            } catch {
              showGoldAlert("Something went wrong. Please try again.");
            }
          }}
          onDelete={async () => {
            const target = menuFor;
            setMenuFor(null);
            const yes = await showGoldConfirm({ message: t("pin_delete_ask"), confirmLabel: t("delete"), cancelLabel: t("cancel"), danger: true });
            if (!yes) return;
            try {
              const r = await socialCall<unknown>("deletePost", { user_id: socialMe.id, post_id: target.id });
              if (r.status) setTabVideos((list) => list.filter((x) => x.id !== target.id));
              else showGoldAlert(r.message || "Something went wrong. Please try again.");
            } catch {
              showGoldAlert("Something went wrong. Please try again.");
            }
          }}
        />
      )}

      {viewingPhoto && (
        <div onClick={() => setViewingPhoto(null)}
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.85)", display: "grid", placeItems: "center", padding: 16 }}>
          <img src={viewingPhoto.photo_url || viewingPhoto.thumb_url || mediaUrl(viewingPhoto.photo_path || viewingPhoto.thumb_path)} alt=""
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "min(760px, 100%)", maxHeight: "86vh", objectFit: "contain", borderRadius: 10, display: "block" }} />
        </div>
      )}

      {/* Modals */}
      {showBattleBoard && (
        <BattleBoardModal userId={profileId} onClose={() => setShowBattleBoard(false)} />
      )}
      {vipInfo && (
        <VipBadgePopup viewerIsVip={isVipReferrer(isMe ? profile.is_vip_referrer : me?.is_vip_referrer)} onClose={() => setVipInfo(false)} />
      )}
      {battleInfo && (
        <BattleInfoPopup title={battleInfo.title} body={battleInfo.body} flames={battleInfo.flames} onClose={() => setBattleInfo(null)} />
      )}
      {showReport && profile && (
        <ReportDialog
          reportedUserId={profile.id}
          reportedName={displayName(profile)}
          onClose={() => setShowReport(false)}
          onDone={(message) => showGoldAlert(message)}
        />
      )}
    </div>
  );
}

/** The gold hold menu on your own video tile (Steve, 2026-11-20: "redesign it to our design ...
 *  add Pin") — black card, gold border, gold title, one gold-outlined row per action. */
function OwnVideoMenu({ post: p, onPin, onMove, onDelete, onClose }: { post: ProfilePost; onPin: () => void; onMove: () => void; onDelete: () => void; onClose: () => void }) {
  const { t } = useT();
  const row: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "12px 14px", background: "transparent", color: "#fff", border: "1px solid var(--gold-border)", borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: "pointer" };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true"
        style={{ width: 300, maxWidth: "100%", background: "#000", border: "2px solid var(--gold-border)", borderRadius: 10, padding: "16px 16px 14px", textAlign: "center" }}>
        <div style={{ color: "var(--gold)", fontWeight: 800, fontSize: 18, letterSpacing: ".04em" }}>✦ #{p.user_video_number ?? p.id} ✦</div>
        <div style={{ height: 2, margin: "10px -8px 12px", background: "linear-gradient(90deg, transparent, var(--gold-border), transparent)" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button style={row} onClick={onPin}><span style={{ color: "var(--gold)", display: "inline-flex" }}><PinGlyph size={14} /></span>{t(p.pinned_at ? "pin_unpin" : "pin_to_top")}</button>
          {/* Profile video folders (2026-11-20). */}
          <button style={row} onClick={onMove}><span style={{ color: "var(--gold)" }}>📁</span>{t("fld_move")}</button>
          <button style={row} onClick={onDelete}>{t("delete")}</button>
        </div>
        <button onClick={onClose} style={{ marginTop: 14, padding: "8px 28px", background: "#000", color: "var(--gold)", border: "1px solid var(--gold-border)", borderRadius: 999, fontWeight: 800, fontSize: 13, letterSpacing: ".05em", cursor: "pointer" }}>
          {t("close").toUpperCase()}
        </button>
      </div>
    </div>
  );
}
