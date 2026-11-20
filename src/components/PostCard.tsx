import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { displayName, mediaUrl, type Gift, type Post } from "../lib/api";
import { Avatar } from "./Common";
import { MemberBullseye } from "./MemberBullseye";
import { GiftFlash, PostGiftButton } from "./GiftSheet";
import { HashtagText } from "./HashtagText";
import { SearchTopicBar } from "./SearchTopicBar";
import { EpisodeChip } from "./Creators";
import { useT } from "../lib/i18n";

export function PostCard({ post }: { post: Post }) {
  const { t } = useT();
  const [sent, setSent] = useState<Gift | null>(null);
  const clearSent = useCallback(() => setSent(null), []);
  return (
    <div className="card post-card">
      <Link to={`/video/${post.id}`} className="thumb" style={{ display: "block" }}>
        {/* A locked post (Creators and money, 2026-11-17) has video "": never an empty <video> src. */}
        {post.thumbnail ? <img src={mediaUrl(post.thumbnail)} alt="" loading="lazy" className={post.locked ? "cm-blur" : undefined} />
          : post.video ? <video src={mediaUrl(post.video)} muted preload="metadata" /> : <span className="cm-thumb-empty" />}
        {post.locked && (
          <span className="cm-card-lock">
            <span className="cm-locked-icon" style={{ fontSize: 30 }}>🔒</span>
            <span>{post.locked.reason === "subscribers" ? t("cm_subscribers_only") : `${post.locked.series.title} · ${t("cm_episode_n", post.locked.episode_no ?? 0)}`}</span>
          </span>
        )}
        {!post.locked && post.series_info && <EpisodeChip post={post} style={{ position: "absolute", top: 8, left: 8 }} />}
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
            {/* Steve, 2026-11-20: "I wanna clean the screen" — the Battle Badge circle and the
                streak pill left the name; the gold bullseye opens all of them on /badges/<id>. */}
            <div className="row" style={{ gap: 6, minWidth: 0 }}>
              <span style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayName(post.user)}</span>
              <MemberBullseye userId={post.user_id ?? post.user?.id} />
            </div>
            <div className="muted" style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}><HashtagText inLink text={post.description || (post.hashtags ? post.hashtags.split(",").filter(Boolean).map((h) => "#" + h.replace(/^#/, "")).join(" ") : "")} /></div>
          </div>
        </Link>
        {/* Steve, 2026-10-01: "add gift boxes on all video on for you page on the web." */}
        <PostGiftButton post={post} onSent={setSent} />
      </div>
      {/* Steve, 2026-11-20: "Search · <topic>" under every video, one click to search what they are talking about. */}
      <SearchTopicBar post={post} compact />
    </div>
  );
}
