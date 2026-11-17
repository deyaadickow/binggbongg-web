// A profile's Playlists tab (Steve, 2026-11-17: "Playlists on a profile"). The playlists come with
// the profile (fetchUserDetails -> playlists); each card's cover and count come from
// fetchPlaylistData, which is also what plays it: the videos in the playlist's order become the
// video page's queue. The owner makes, edits and deletes them.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { mediaUrl, type Post } from "../lib/api";
import { setFeed } from "../lib/feed";
import { useT } from "../lib/i18n";
import { showGoldAlert, showGoldConfirm } from "./GoldToast";
import { Loading } from "./Common";
import { deletePlaylist, fetchPlaylistData, playlistPostIds, savePlaylist, socialCall, type PlaylistRow } from "../lib/social";

export function PlaylistsPanel({ ownerId, isMe, myId, playlists, onChanged, createRequest }: {
  ownerId: number;
  isMe: boolean;
  myId?: number | null;
  playlists: PlaylistRow[];
  onChanged: () => void;
  /** Bumped by the profile's "Playlist" button to open the new-playlist dialog. */
  createRequest?: number;
}) {
  const { t } = useT();
  const navigate = useNavigate();
  const [covers, setCovers] = useState<Record<number, { cover?: string; video?: string; count: number }>>({});
  const [editing, setEditing] = useState<PlaylistRow | "new" | null>(null);
  const [opening, setOpening] = useState(0);

  useEffect(() => { if (createRequest && isMe) setEditing("new"); }, [createRequest, isMe]);

  useEffect(() => {
    let alive = true;
    for (const pl of playlists.slice(0, 30)) {
      if (covers[pl.id]) continue;
      fetchPlaylistData(pl.id, myId).then((d) => {
        if (alive) setCovers((c) => ({ ...c, [pl.id]: { cover: d.data.find((p) => p.thumbnail)?.thumbnail, video: d.data.find((p) => p.video)?.video, count: d.data.length } }));
      }).catch(() => { if (alive) setCovers((c) => ({ ...c, [pl.id]: { count: playlistPostIds(pl).length } })); });
    }
    return () => { alive = false; };
  }, [playlists]); // eslint-disable-line react-hooks/exhaustive-deps

  async function play(pl: PlaylistRow) {
    if (opening) return;
    setOpening(pl.id);
    try {
      const d = await fetchPlaylistData(pl.id, myId);
      if (!d.data.length) { showGoldAlert(t("soc_playlist_empty")); return; }
      setFeed(d.data); // the video page steps through the playlist in its order
      navigate(`/video/${d.data[0].id}`);
    } catch (e) {
      showGoldAlert((e as Error).message || t("something_went_wrong"));
    } finally {
      setOpening(0);
    }
  }

  async function remove(pl: PlaylistRow) {
    const yes = await showGoldConfirm({ message: t("soc_delete_playlist_q", pl.title || t("fname_playlists")), confirmLabel: t("soc_delete"), cancelLabel: t("cancel"), danger: true });
    if (!yes) return;
    try { await deletePlaylist(pl.id); onChanged(); } catch (e) { showGoldAlert((e as Error).message || t("something_went_wrong")); }
  }

  return (
    <div>
      {isMe && (
        <button className="btn gold" style={{ width: "100%", margin: "8px 0 12px" }} onClick={() => setEditing("new")}>＋ {t("soc_new_playlist")}</button>
      )}
      {playlists.length === 0 ? (
        <p className="muted" style={{ padding: "24px 0", textAlign: "center" }}>{t("soc_no_playlists")}</p>
      ) : (
        <div className="playlist-grid">
          {playlists.map((pl) => {
            const c = covers[pl.id];
            return (
              <div key={pl.id} className="playlist-card">
                <button type="button" className="playlist-cover" onClick={() => void play(pl)} aria-label={pl.title ?? ""}>
                  {c?.cover ? <img src={mediaUrl(c.cover)} alt="" loading="lazy" /> : c?.video ? <video src={mediaUrl(c.video) + "#t=0.5"} muted playsInline preload="metadata" /> : <span>🎵</span>}
                  <span className="playlist-play">{opening === pl.id ? "…" : "▶"}</span>
                </button>
                <div className="playlist-title">{pl.title || t("fname_playlists")}</div>
                <div className="muted" style={{ fontSize: 12, textAlign: "center" }}>{t("n_videos", c?.count ?? playlistPostIds(pl).length)}</div>
                {isMe && (
                  <div className="row" style={{ gap: 6, justifyContent: "center", marginTop: 4 }}>
                    <button className="btn small ghost" onClick={() => setEditing(pl)}>✎ {t("soc_edit")}</button>
                    <button className="btn small ghost" onClick={() => void remove(pl)}>🗑</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {editing && (
        <PlaylistDialog ownerId={ownerId} myId={myId} row={editing === "new" ? null : editing}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setCovers({}); onChanged(); }} />
      )}
    </div>
  );
}

function PlaylistDialog({ ownerId, myId, row, onClose, onSaved }: { ownerId: number; myId?: number | null; row: PlaylistRow | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const [title, setTitle] = useState(row?.title ?? "");
  const [picked, setPicked] = useState<number[]>(() => (row ? playlistPostIds(row) : []));
  const [videos, setVideos] = useState<Post[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    socialCall<Post[]>("fetchUserPosts", { user_id: ownerId, start: 0, count: 60, ...(myId ? { my_user_id: myId } : {}) })
      .then((r) => setVideos(Array.isArray(r.data) ? r.data : []))
      .catch(() => setVideos([]));
  }, [ownerId, myId]);

  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function save() {
    if (!title.trim()) { setErr(t("soc_playlist_name_needed")); return; }
    if (!picked.length) { setErr(t("soc_playlist_pick_videos")); return; }
    setSaving(true);
    setErr("");
    try {
      await savePlaylist({ myUserId: ownerId, playlistId: row?.id, title: title.trim(), postIds: picked });
      onSaved();
    } catch (e) {
      setErr((e as Error).message || t("something_went_wrong"));
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "86vh", overflowY: "auto" }}>
        <h3 style={{ color: "var(--gold)" }}>{row ? t("soc_edit_playlist") : t("create_playlist")}</h3>
        <input className="input" maxLength={60} placeholder={t("playlist_name")} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus style={{ marginBottom: 10 }} />
        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{t("soc_playlist_pick_hint")}</div>
        {videos === null ? <Loading /> : videos.length === 0 ? <p className="muted center">{t("no_videos_yet")}</p> : (
          <div className="playlist-pick">
            {videos.map((v) => {
              const n = picked.indexOf(v.id);
              return (
                <button key={v.id} type="button" className={`playlist-pick-item${n >= 0 ? " on" : ""}`} onClick={() => toggle(v.id)}>
                  {v.thumbnail ? <img src={mediaUrl(v.thumbnail)} alt="" loading="lazy" /> : <span />}
                  {n >= 0 && <b>{n + 1}</b>}
                </button>
              );
            })}
          </div>
        )}
        {err && <div style={{ color: "#f84", fontSize: 13, margin: "8px 0" }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button className="btn gold" style={{ flex: 1 }} onClick={() => void save()} disabled={saving}>{saving ? t("loading") : t("soc_save")}</button>
          <button className="btn ghost small" onClick={onClose}>{t("cancel")}</button>
        </div>
      </div>
    </div>
  );
}
