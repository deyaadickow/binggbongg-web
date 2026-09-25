import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { displayName, mediaUrl, post, type Post, type UserSummary } from "../lib/api";
import { useSession } from "../lib/session";
import { Avatar, Loading, Notice } from "../components/Common";

interface ProfileUser extends UserSummary {
  refer_code?: string;
  is_verified?: number;
  profile_category?: { id?: number; name?: string } | null;
  fb_url?: string;
  insta_url?: string;
  youtube_url?: string;
  post_counts?: number;
  friends_count?: number;
  liked_videos_counts?: number;
  reposted_counts?: number;
  saved_posts_count?: number;
  watch_history_count?: number;
  is_following_each_other?: number;
  is_blocked?: number;
}

interface ProfilePost extends Post {
  user_video_number?: number;
  lifetime_votes?: number;
  this_month_votes?: number;
}

interface Playlist {
  id: number;
  name?: string;
  thumbnail?: string;
  video_count?: number;
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

type TabKey = "videos" | "likes" | "reposted" | "saved" | "history" | "following" | "followers" | "friends";

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

function ProfileThumb({ p, isMe, onClick }: { p: ProfilePost; isMe: boolean; onClick: () => void }) {
  const thumb = mediaUrl(p.thumbnail);
  return (
    <div className="p-thumb" onClick={onClick}>
      {thumb ? <img src={thumb} alt="" loading="lazy" /> : (
        <div style={{ width: "100%", height: "100%", background: "#111", display: "flex", alignItems: "center", justifyContent: "center", color: "#333", fontSize: 28 }}>▶</div>
      )}
      {(p.views ?? 0) > 0 && <span className="p-views">{fmt(p.views)}</span>}
      {(p.lifetime_votes ?? 0) > 0 && <span className="p-votes">★ {fmt(p.lifetime_votes)}</span>}
      {p.user_video_number != null && <span className="p-num">#{p.user_video_number}</span>}
      {isMe && <span className="p-ad">⚡</span>}
    </div>
  );
}

function UserCard({ user, myId, isLoggedIn }: { user: UserSummary; myId?: number; isLoggedIn: boolean }) {
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
      </div>
      {isLoggedIn && myId !== user.id && (
        <button className={`btn small${following ? " ghost" : ""}`} onClick={toggle} style={{ flexShrink: 0 }}>
          {following ? "Following" : "Follow"}
        </button>
      )}
    </div>
  );
}

function BattleBoardModal({ userId, onClose }: { userId: number; onClose: () => void }) {
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
        <h3>⚔️ Lifetime Battle Board</h3>
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
                {career!.total_games} total battle{career!.total_games !== 1 ? "s" : ""}
              </div>
            )}
            {(career?.opponents?.length ?? 0) > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 800, color: "var(--gold)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                  Recent Opponents
                </div>
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
        <button className="btn small ghost" style={{ marginTop: 16, width: "100%" }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function CreatePlaylistDialog({ userId, onClose, onCreated }: { userId: number; onClose: () => void; onCreated: (pl: Playlist) => void }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!name.trim()) { setErr("Enter a playlist name"); return; }
    setSaving(true);
    setErr("");
    try {
      const r = await post<Playlist>("createPlaylist", { user_id: userId, name: name.trim() });
      if (!r.status) throw new Error(r.message ?? "Failed to create");
      onCreated(r.data ?? { id: Date.now(), name: name.trim() });
      onClose();
    } catch (e) {
      setErr((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h3>Create Playlist</h3>
        <input
          style={{ width: "100%", background: "#0a0a0a", border: "1.5px solid var(--gold-border)", borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 15, marginBottom: 8, outline: "none", boxSizing: "border-box" }}
          placeholder="Playlist name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          autoFocus
        />
        {err && <div style={{ color: "#f84", fontSize: 12, marginBottom: 8 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" style={{ flex: 1 }} onClick={save} disabled={saving}>
            {saving ? "Creating…" : "Create"}
          </button>
          <button className="btn ghost small" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export function ProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: me, isLoggedIn } = useSession();
  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [tab, setTab] = useState<TabKey>("videos");
  const [tabVideos, setTabVideos] = useState<ProfilePost[]>([]);
  const [tabUsers, setTabUsers] = useState<UserSummary[]>([]);
  const [tabLoading, setTabLoading] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [showBattleBoard, setShowBattleBoard] = useState(false);
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [copiedRefer, setCopiedRefer] = useState(false);
  const loadedTabs = useRef(new Set<TabKey>());
  const profileId = Number(id);

  useEffect(() => {
    if (!id) return;
    setProfile(null);
    setError(null);
    loadedTabs.current = new Set();
    setTab("videos");
    setTabVideos([]);
    setTabUsers([]);

    (async () => {
      try {
        const res = await post<ProfileUser>("fetchUserDetails", {
          user_id: id,
          ...(me ? { my_user_id: me.id } : {}),
        });
        if (!res.status || !res.data) throw new Error(res.message ?? "Member not found.");
        setProfile(res.data);
        setFollowing(!!res.data.is_following);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [id, me?.id]);

  useEffect(() => {
    if (!profile || !id) return;
    if (loadedTabs.current.has(tab)) return;
    loadedTabs.current.add(tab);
    setTabLoading(true);
    setTabVideos([]);
    setTabUsers([]);

    const base = { start: 0, count: 30, ...(me ? { my_user_id: me.id } : {}) };

    const endpointMap: Record<TabKey, [string, Record<string, unknown>]> = {
      videos: ["fetchUserPosts", { user_id: id, ...base }],
      likes: ["fetchUserPostsWithLikes", { user_id: id, ...base }],
      reposted: ["fetchRepostVideos", { user_id: id, ...base }],
      saved: ["fetchUserSavedPosts", { user_id: me?.id ?? id, ...base }],
      history: ["fetchUserWatchHistory", { user_id: me?.id ?? id, ...base }],
      following: ["fetchFollowingList", { user_id: id, ...base }],
      followers: ["fetchFollowersList", { user_id: id, ...base }],
      friends: ["fetchFriendsList", { user_id: id, ...base }],
    };

    const [endpoint, params] = endpointMap[tab];
    post(endpoint, params)
      .then((r) => {
        const items = (r.data ?? r.list ?? []) as unknown[];
        if (USER_TABS.includes(tab)) {
          setTabUsers(items as UserSummary[]);
        } else {
          setTabVideos(items as ProfilePost[]);
        }
      })
      .catch(() => {})
      .finally(() => setTabLoading(false));
  }, [tab, profile]);

  useEffect(() => {
    if (!profile || !id) return;
    post<Playlist[]>("fetchUserPlaylists", { user_id: id })
      .then((r) => setPlaylists(r.data ?? []))
      .catch(() => {});
  }, [profile?.id]);

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

  async function handleBlock() {
    if (!me || !profile) return;
    setShowOptions(false);
    if (!confirm(`Block ${displayName(profile)}?`)) return;
    await post("blockUser", { user_id: me.id, to_user_id: profile.id }).catch(() => {});
    navigate(-1);
  }

  async function handleReport() {
    if (!me || !profile) return;
    setShowOptions(false);
    await post("reportUser", { user_id: me.id, to_user_id: profile.id, reason: "Reported from web" }).catch(() => {});
    alert("Report submitted. Thank you.");
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

  function switchTab(t: TabKey) {
    if (t === tab) return;
    if (!loadedTabs.current.has(t)) {
      // will be fetched by effect
    }
    setTab(t);
  }

  if (error) return <div className="page"><Notice error>{error}</Notice></div>;
  if (!profile) return <div className="page"><Loading /></div>;

  const isMe = me?.id === profile.id;
  const isMutualFollow = !isMe && profile.is_following_each_other === 1;

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "videos", label: "Videos", count: profile.post_counts },
    { key: "following", label: "Following", count: profile.total_followings },
    { key: "followers", label: "Followers", count: profile.total_followers },
    { key: "friends", label: "Friends", count: profile.friends_count },
    { key: "likes", label: "Likes", count: profile.liked_videos_counts },
    { key: "reposted", label: "Reposted", count: profile.reposted_counts },
    ...(isMe ? [
      { key: "saved" as TabKey, label: "Saved" },
      { key: "history" as TabKey, label: "History" },
    ] : []),
  ];

  return (
    <div className="page" style={{ maxWidth: 600, margin: "0 auto" }}>
      {/* Header card */}
      <div style={{ padding: "16px 0 0" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 12 }}>
          <Avatar user={profile} size="lg" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <h1 style={{ fontSize: 20, color: "var(--gold)", fontWeight: 800, margin: 0 }}>
                {displayName(profile)}
              </h1>
              {profile.is_verified === 2 && (
                <span title="Verified" style={{ color: "#4af", fontSize: 16 }}>✓</span>
              )}
              {profile.profile_category?.name && (
                <span className="pill" style={{ fontSize: 11 }}>{profile.profile_category.name}</span>
              )}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              @{profile.username}{profile.country ? ` · ${profile.country}` : ""}
            </div>
            {profile.bio && (
              <p className="soft" style={{ marginTop: 6, fontSize: 13, lineHeight: 1.4 }}>{profile.bio}</p>
            )}
            {/* Social links */}
            {(isValidUrl(profile.fb_url) || isValidUrl(profile.insta_url) || isValidUrl(profile.youtube_url)) && (
              <div className="social-links">
                {isValidUrl(profile.fb_url) && (
                  <a href={profile.fb_url!} target="_blank" rel="noopener noreferrer" className="social-link">
                    <span>f</span> Facebook
                  </a>
                )}
                {isValidUrl(profile.insta_url) && (
                  <a href={profile.insta_url!} target="_blank" rel="noopener noreferrer" className="social-link">
                    <span>◉</span> Instagram
                  </a>
                )}
                {isValidUrl(profile.youtube_url) && (
                  <a href={profile.youtube_url!} target="_blank" rel="noopener noreferrer" className="social-link">
                    <span>▶</span> YouTube
                  </a>
                )}
              </div>
            )}
          </div>
          {/* Options menu for other profiles */}
          {!isMe && isLoggedIn && (
            <div style={{ position: "relative", flexShrink: 0 }}>
              <button
                className="btn ghost small"
                onClick={() => setShowOptions((v) => !v)}
                style={{ padding: "4px 8px", fontSize: 18 }}
                title="Options"
              >⋮</button>
              {showOptions && (
                <div style={{ position: "absolute", right: 0, top: "100%", background: "var(--panel)", border: "1.5px solid var(--gold-border)", borderRadius: 10, minWidth: 140, zIndex: 20, padding: 4 }}>
                  <button className="btn ghost small" style={{ width: "100%", textAlign: "left", borderRadius: 6 }}
                    onClick={() => { navigator.share?.({ url: `${window.location.origin}/profile/${profile.id}`, title: displayName(profile) }).catch(() => {}); setShowOptions(false); }}>
                    Share Profile
                  </button>
                  <button className="btn ghost small" style={{ width: "100%", textAlign: "left", borderRadius: 6 }} onClick={handleReport}>
                    Report
                  </button>
                  <button className="btn ghost small" style={{ width: "100%", textAlign: "left", borderRadius: 6, color: "#f84" }} onClick={handleBlock}>
                    Block
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Stat bullets */}
        <div style={{ display: "flex", overflowX: "auto", scrollbarWidth: "none", gap: 0, borderBottom: "1px solid var(--line)", borderTop: "1px solid var(--line)", margin: "0 -16px", padding: "0 4px" }}>
          {[
            { label: "Videos", val: profile.post_counts, tab: "videos" as TabKey },
            { label: "Following", val: profile.total_followings, tab: "following" as TabKey },
            { label: "Followers", val: profile.total_followers, tab: "followers" as TabKey },
            { label: "Friends", val: profile.friends_count, tab: "friends" as TabKey },
            { label: "Likes", val: profile.total_likes, tab: "likes" as TabKey },
            { label: "Reposted", val: profile.reposted_counts, tab: "reposted" as TabKey },
          ].map(({ label, val, tab: t }) => (
            <button
              key={label}
              className="stat-bullet"
              style={{ background: "none", border: "none", cursor: "pointer", padding: "10px 8px", minWidth: 60, flex: 1 }}
              onClick={() => switchTab(t)}
            >
              <b style={{ fontSize: 16, color: "var(--gold)", fontWeight: 800 }}>{fmt(val)}</b>
              <span style={{ fontSize: 10, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 2 }}>{label}</span>
            </button>
          ))}
        </div>

        {/* Referral code (own profile) */}
        {isMe && profile.refer_code && (
          <div className="refer-row">
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginRight: 4 }}>Referral Code</div>
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
          {isMutualFollow && (
            <Link to={`/chat?user=${profile.id}`} className="btn ghost" style={{ flex: 1, textAlign: "center" }}>
              Chat
            </Link>
          )}
          <button className="btn ghost small" onClick={() => setShowBattleBoard(true)}>
            ⚔️ Battle Board
          </button>
          <button className="btn ghost small" onClick={() => navigate("/settings/find-a-battle")}>
            🔍 Find Battle
          </button>
          {isMe && (
            <button className="btn ghost small" onClick={() => setShowCreatePlaylist(true)}>
              + Playlist
            </button>
          )}
        </div>

        {/* Playlists (own profile) */}
        {isMe && playlists.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--gold)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
              Playlists
            </div>
            <div className="playlist-scroll">
              {playlists.map((pl) => (
                <div key={pl.id} className="playlist-item">
                  <div className="playlist-item-thumb">
                    {pl.thumbnail ? <img src={mediaUrl(pl.thumbnail)} alt={pl.name} /> : "🎵"}
                  </div>
                  <div className="playlist-item-name">{pl.name || "Playlist"}</div>
                  {pl.video_count != null && (
                    <div style={{ fontSize: 10, color: "var(--text-dim)", textAlign: "center" }}>{pl.video_count} videos</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

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
        ) : USER_TABS.includes(tab) ? (
          tabUsers.length === 0 ? (
            <p className="muted" style={{ padding: "24px 0", textAlign: "center" }}>No members yet.</p>
          ) : (
            <div className="profile-user-list">
              {tabUsers.map((u) => (
                <UserCard key={u.id} user={u} myId={me?.id} isLoggedIn={isLoggedIn} />
              ))}
            </div>
          )
        ) : (
          tabVideos.length === 0 ? (
            <p className="muted" style={{ padding: "24px 0", textAlign: "center" }}>No videos yet.</p>
          ) : (
            <div className="profile-vid-grid">
              {tabVideos.map((p) => (
                <ProfileThumb
                  key={p.id}
                  p={p}
                  isMe={isMe}
                  onClick={() => navigate(`/video/${p.id}`)}
                />
              ))}
            </div>
          )
        )}
      </div>

      {/* Modals */}
      {showBattleBoard && (
        <BattleBoardModal userId={profileId} onClose={() => setShowBattleBoard(false)} />
      )}
      {showCreatePlaylist && me && (
        <CreatePlaylistDialog
          userId={me.id}
          onClose={() => setShowCreatePlaylist(false)}
          onCreated={(pl) => setPlaylists((prev) => [pl, ...prev])}
        />
      )}
    </div>
  );
}
