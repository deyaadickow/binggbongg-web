// The Photos directory: one tile per member who has photos, showing their most recent one.
//
// Tapping a tile opens that member's album (Steve, 2026-09-17: "when they click on any photo
// they will be linked to that member's photo album"). That needed a new backend endpoint,
// fetchUserPhotos — fetchFolderPhotos could never serve it, because AuthorizeUser rebinds its
// my_user_id to the caller on every request.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { mediaUrl } from "../lib/api";
import { useSession } from "../lib/session";
import { fetchPhotosDirectory, type DirectoryEntry } from "../lib/photos";
import { Loading, Notice } from "../components/Common";

export function PhotosDirectoryPage() {
  const { user, isLoggedIn } = useSession();
  const [rows, setRows] = useState<DirectoryEntry[] | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchPhotosDirectory(user.id).then(setRows).catch(() => setRows([]));
  }, [user]);

  if (!isLoggedIn || !user) {
    return <div className="page"><Notice>Sign in to browse photos.</Notice></div>;
  }

  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <div className="row" style={{ alignItems: "center", marginBottom: 8 }}>
        <h1 className="page-title" style={{ flex: 1, marginBottom: 0 }}>Photos</h1>
        <Link className="btn small ghost" to="/photos">My photos</Link>
      </div>

      {rows === null ? <Loading /> : rows.length === 0 ? (
        <div className="card pad">
          <p className="soft" style={{ marginTop: 0 }}>No photos to browse yet.</p>
          <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
            Photos appear here once members build up an album.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
          {rows.map((r) => (
            <Link key={r.user_id} to={`/photos/${r.user_id}`}
              style={{ display: "block", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden", background: "var(--panel)" }}>
              <div style={{ aspectRatio: "1", background: "#000" }}>
                {r.preview_thumb && (
                  <img src={r.preview_thumb} alt="" loading="lazy"
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                )}
              </div>
              <div className="row" style={{ padding: "8px 10px", alignItems: "center", gap: 8 }}>
                {r.profile_image
                  ? <img src={mediaUrl(r.profile_image)} alt="" style={{ width: 24, height: 24, borderRadius: 12, objectFit: "cover" }} />
                  : <div style={{ width: 24, height: 24, borderRadius: 12, background: "var(--bg)" }} />}
                <span style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.fullname || r.username || "Member"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
