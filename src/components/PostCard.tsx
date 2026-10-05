import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { displayName, mediaUrl, type Gift, type Post } from "../lib/api";
import { Avatar } from "./Common";
import { BattleBadge, battleBadgeExplainer } from "./BattleBadge";
import { GiftFlash, PostGiftButton } from "./GiftSheet";

export function PostCard({ post }: { post: Post }) {
  const [sent, setSent] = useState<Gift | null>(null);
  const clearSent = useCallback(() => setSent(null), []);
  return (
    <div className="card post-card">
      <Link to={`/video/${post.id}`} className="thumb" style={{ display: "block" }}>
        {post.thumbnail ? <img src={mediaUrl(post.thumbnail)} alt="" loading="lazy" /> : <video src={mediaUrl(post.video)} muted preload="metadata" />}
        <div className="meta">
          <span>♥ {post.likes ?? 0}</span>
          <span style={{ marginLeft: 10 }}>👁 {post.views ?? 0}</span>
        </div>
        {sent && <GiftFlash gift={sent} onDone={clearSent} />}
      </Link>
      <div className="body">
        <Link to={`/profile/${post.user_id}`} className="row" style={{ color: "inherit", minWidth: 0, flex: 1 }}>
          <Avatar user={post.user} />
          <div style={{ minWidth: 0 }}>
            {/* Steve, 2026-10-05: the Bingg Bongg Battle Badge beside their name, and clicking
                it explains what the number is. */}
            <div className="row" style={{ gap: 6, minWidth: 0 }}>
              <span style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayName(post.user)}</span>
              <BattleBadge
                badge={post.user?.battle_badge}
                size={26}
                onClick={() => {
                  window.alert(battleBadgeExplainer(displayName(post.user), post.user?.battle_badge ?? 0));
                }}
              />
            </div>
            <div className="muted" style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{post.description || post.hashtags || ""}</div>
          </div>
        </Link>
        {/* Steve, 2026-10-01: "add gift boxes on all video on for you page on the web." */}
        <PostGiftButton post={post} onSent={setSent} />
      </div>
    </div>
  );
}
