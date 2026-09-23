import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { displayName, mediaUrl, post, type Post } from "../lib/api";
import { useSession } from "../lib/session";
import { Avatar, Loading, Notice } from "../components/Common";

export function VideoPage() {
  const { id } = useParams();
  const { user, isLoggedIn } = useSession();
  const [item, setItem] = useState<Post | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await post<Post | Post[]>("fetchPostById", { post_id: id, ...(user ? { my_user_id: user.id, user_id: user.id } : {}) });
        const data = Array.isArray(res.data) ? res.data[0] : res.data;
        if (!res.status || !data) throw new Error(res.message ?? "That video isn't available.");
        setItem(data);
        setLiked(!!data.is_post_liked);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [id, user]);

  async function toggleLike() {
    if (!item || !user) return;
    const endpoint = liked ? "dislikePost" : "likePost";
    setLiked(!liked);
    try {
      await post(endpoint, { user_id: user.id, post_id: item.id });
    } catch {
      setLiked(liked);
    }
  }

  if (error) return <div className="page"><Notice error>{error}</Notice></div>;
  if (!item) return <div className="page"><Loading /></div>;
  const likes = (item.likes ?? 0) + (liked && !item.is_post_liked ? 1 : 0) - (!liked && item.is_post_liked ? 1 : 0);

  return (
    <div className="page">
      <video className="player" src={mediaUrl(item.video)} poster={mediaUrl(item.thumbnail)} controls autoPlay playsInline />
      <div className="row" style={{ marginTop: 14, alignItems: "flex-start" }}>
        <Link to={`/profile/${item.user_id}`}><Avatar user={item.user} /></Link>
        <div style={{ flex: 1 }}>
          <Link to={`/profile/${item.user_id}`} style={{ fontWeight: 800, color: "var(--text)" }}>{displayName(item.user)}</Link>
          <div className="soft">{item.description}</div>
          {item.hashtags && <div className="muted" style={{ fontSize: 13 }}>{item.hashtags}</div>}
        </div>
        <button className="btn small" onClick={toggleLike} disabled={!isLoggedIn} title={isLoggedIn ? "" : "Sign in to like"}>
          {liked ? "♥" : "♡"} {likes}
        </button>
      </div>
    </div>
  );
}
