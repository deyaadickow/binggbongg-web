import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { post as apiPost, type Post } from "../lib/api";
import { useSession } from "../lib/session";
import { useT } from "../lib/i18n";

/**
 * "🔍 Search · <topic> ›" under a video (Steve, 2026-11-20, after TikTok's bar: "The search also fills
 * out with what ever these people are talking about ... they can search that conversation with one
 * click"). The topic is written once per video on the server (tbl_post.search_topic); no topic, no bar.
 * One click opens Search with the topic typed in and the results showing, and counts the tap.
 */
export function SearchTopicBar({ post, compact, style }: { post: Post; compact?: boolean; style?: CSSProperties }) {
  const { t } = useT();
  const { user } = useSession();
  const navigate = useNavigate();
  const topic = (post.search_topic ?? "").trim();
  if (!topic || post.locked) return null;
  return (
    <button
      type="button"
      className={`stb-bar${compact ? " compact" : ""}`}
      style={style}
      title={`${t("stb_search")} · ${topic}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        apiPost("searchTopicTap", { post_id: post.id, platform: "web", ...(user ? { my_user_id: user.id } : {}) }).catch(() => {});
        navigate(`/search?q=${encodeURIComponent(topic)}`);
      }}>
      <svg className="stb-icon" viewBox="0 0 24 24" width={compact ? 15 : 18} height={compact ? 15 : 18} aria-hidden>
        <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
        <line x1="15.5" y1="15.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
      <span className="stb-text"><b>{t("stb_search")}</b> · {topic}</span>
      <span className="stb-chev" aria-hidden>›</span>
    </button>
  );
}
