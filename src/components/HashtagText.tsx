// Tappable #hashtags in a video's description (Steve, 2026-11-16: Finding videos). Each tag opens
// /hashtag/<tag>. `inLink`: the text sits inside another <a> (the feed card links to the
// profile), so tags are buttons that navigate themselves instead of a nested <a>.
import type { CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { hashtagPath, splitHashtags } from "../lib/finding";

const TAG_STYLE: CSSProperties = { color: "var(--gold)", fontWeight: 700 };

export function HashtagText({ text, inLink }: { text?: string | null; inLink?: boolean }) {
  const navigate = useNavigate();
  if (!text) return null;
  return (
    <>
      {splitHashtags(text).map((part, i) => {
        if (!part.tag) return <span key={i}>{part.text}</span>;
        if (inLink) {
          return (
            <span key={i} role="link" tabIndex={0} style={{ ...TAG_STYLE, cursor: "pointer" }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(hashtagPath(part.tag!)); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); navigate(hashtagPath(part.tag!)); } }}>
              {part.text}
            </span>
          );
        }
        return <Link key={i} to={hashtagPath(part.tag)} style={TAG_STYLE}>{part.text}</Link>;
      })}
    </>
  );
}

/** The post's own hashtag list as tappable chips of text (#a #b). */
export function HashtagList({ tags, style }: { tags: string[]; style?: CSSProperties }) {
  if (!tags.length) return null;
  return (
    <div style={{ fontSize: 13, display: "flex", flexWrap: "wrap", gap: "2px 8px", ...style }}>
      {tags.map((t) => <Link key={t} to={hashtagPath(t)} style={TAG_STYLE}>#{t}</Link>)}
    </div>
  );
}
