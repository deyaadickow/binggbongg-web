import { Link } from "react-router-dom";
import { displayName, mediaUrl, type Post } from "../lib/api";
import { Avatar } from "./Common";
import { PostGiftButton } from "./GiftSheet";

export function PostCard({ post }: { post: Post }) {
  return (
    <div className="card post-card">
      <Link to={`/video/${post.id}`} className="thumb" style={{ display: "block" }}>
        {post.thumbnail ? <img src={mediaUrl(post.thumbnail)} alt="" loading="lazy" /> : <video src={mediaUrl(post.video)} muted preload="metadata" />}
        <div className="meta">
          <span>♥ {post.likes ?? 0}</span>
          <span style={{ marginLeft: 10 }}>👁 {post.views ?? 0}</span>
        </div>
      </Link>
      <div className="body">
        <Link to={`/profile/${post.user_id}`} className="row" style={{ color: "inherit", minWidth: 0, flex: 1 }}>
          <Avatar user={post.user} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayName(post.user)}</div>
            <div className="muted" style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{post.description || post.hashtags || ""}</div>
          </div>
        </Link>
        {/* Steve, 2026-10-01: "add gift boxes on all video on for you page on the web." */}
        <PostGiftButton post={post} />
      </div>
    </div>
  );
}
