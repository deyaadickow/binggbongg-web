// The playlist bar under a video, like the phones' (Steve, 2026-11-20: "Please take a look at how the
// playlist works and make the series the same way"). Every playlist the video is in — and its
// numbered-series folder, which the server sends as one more playlist ("📁 name") — shows as one
// line with the video's number; tapping it opens the list of all its videos, #1 first, and a row
// plays the list from there in order.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { mediaUrl, type Post } from "../lib/api";
import { setFeed } from "../lib/feed";

type Entry = { post_id: number; index: number; post?: Post | null };
export type PostPlaylist = { id: number; title?: string | null; data?: Entry[] | null };

export function PostPlaylistBar({ post }: { post: Post }) {
  const lists = ((post as { playlists?: PostPlaylist[] }).playlists ?? []).filter((p) => (p.data ?? []).some((e) => e.post));
  const [open, setOpen] = useState<PostPlaylist | null>(null);
  const navigate = useNavigate();
  if (!lists.length) return null;

  function play(pl: PostPlaylist, at: number) {
    const posts = (pl.data ?? []).map((e) => e.post).filter((p): p is Post => !!p);
    const target = (pl.data ?? [])[at]?.post;
    if (!target) return;
    setFeed(posts);
    setOpen(null);
    navigate(`/video/${target.id}`);
  }

  return (
    <>
      {lists.map((pl) => {
        const rows = (pl.data ?? []).filter((e) => e.post);
        const n = rows.findIndex((e) => e.post_id === post.id) + 1;
        return (
          <button key={pl.id} type="button" onClick={() => setOpen(pl)}
            style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", marginTop: 6, padding: "5px 10px", borderRadius: 8,
              background: "rgba(0,0,0,.45)", border: "1px solid var(--gold-border)", color: "var(--gold)", fontWeight: 800, fontSize: 13, cursor: "pointer", textAlign: "left" }}>
            <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {pl.title?.startsWith("📁") ? "" : "▶ "}{pl.title}
            </span>
            {n > 0 && <span style={{ whiteSpace: "nowrap" }}>#{n}/{rows.length}</span>}
            <span aria-hidden>⌃</span>
          </button>
        );
      })}
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(null)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "80vh", overflowY: "auto", boxSizing: "border-box" }}>
            <h3 style={{ color: "var(--gold)", marginTop: 0 }}>{open.title}</h3>
            {(open.data ?? []).map((e, i) => e.post && (
              <button key={e.post_id} type="button" onClick={() => play(open, i)}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: 8, marginBottom: 6, borderRadius: 10, cursor: "pointer", textAlign: "left",
                  background: e.post_id === post.id ? "rgba(212,175,55,.18)" : "transparent", border: "1px solid var(--gold-border)", color: "inherit" }}>
                {e.post.thumbnail ? <img src={mediaUrl(e.post.thumbnail)} alt="" loading="lazy" style={{ width: 50, height: 60, objectFit: "cover", borderRadius: 6 }} />
                  : <span style={{ width: 50, height: 60, borderRadius: 6, background: "#222" }} />}
                <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.post.description || ""}</span>
                <b style={{ color: "var(--gold)", whiteSpace: "nowrap" }}>#{i + 1}</b>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
