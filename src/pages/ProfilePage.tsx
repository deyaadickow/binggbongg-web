import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { displayName, post, type Post, type UserSummary } from "../lib/api";
import { useSession } from "../lib/session";
import { Avatar, Loading, Notice } from "../components/Common";
import { PostCard } from "../components/PostCard";

export function ProfilePage() {
  const { id } = useParams();
  const { user: me, isLoggedIn } = useSession();
  const [profile, setProfile] = useState<UserSummary | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await post<UserSummary>("fetchUserDetails", { user_id: id, ...(me ? { my_user_id: me.id } : {}) });
        if (!res.status || !res.data) throw new Error(res.message ?? "Member not found.");
        setProfile(res.data);
        setFollowing(!!res.data.is_following);
        const p = await post<Post[]>("fetchUserPosts", { user_id: id, start: 0, count: 30, ...(me ? { my_user_id: me.id } : {}) });
        setPosts(p.data ?? []);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [id, me]);

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

  if (error) return <div className="page"><Notice error>{error}</Notice></div>;
  if (!profile) return <div className="page"><Loading /></div>;
  const isMe = me?.id === profile.id;

  return (
    <div className="page">
      <div className="card pad" style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
        <Avatar user={profile} size="lg" />
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ fontSize: 22, color: "var(--gold)" }}>{displayName(profile)}</h1>
          <div className="muted">@{profile.username} {profile.country ? `· ${profile.country}` : ""}</div>
          {profile.bio && <p className="soft" style={{ marginTop: 6 }}>{profile.bio}</p>}
        </div>
        <div className="row">
          <div className="stat"><b>{profile.total_followers ?? 0}</b><span>Followers</span></div>
          <div className="stat"><b>{profile.total_followings ?? 0}</b><span>Following</span></div>
          <div className="stat"><b>{profile.total_likes ?? 0}</b><span>Likes</span></div>
        </div>
        {!isMe && isLoggedIn && (
          <button className="btn" onClick={toggleFollow}>{following ? "Following" : "Follow"}</button>
        )}
      </div>
      <h2 className="page-title" style={{ marginTop: 20, fontSize: 18 }}>Videos</h2>
      {posts.length === 0 ? <p className="muted">No videos yet.</p> : (
        <div className="grid">{posts.map((p) => <PostCard key={p.id} post={{ ...p, user: p.user ?? profile }} />)}</div>
      )}
    </div>
  );
}
