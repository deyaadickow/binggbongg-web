// One member's photo album, opened from a Photos directory tile.
//
// Read-only by design: the favourite/move/delete actions on My photos are yours alone, and the
// endpoint behind this cannot perform them either.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { mediaUrl } from "../lib/api";
import { useSession } from "../lib/session";
import { fetchUserPhotos, type DirectoryEntry, type Photo } from "../lib/photos";
import { Loading, Notice } from "../components/Common";

export function MemberAlbumPage() {
  const { id } = useParams();
  const { user, isLoggedIn } = useSession();
  const ownerId = Number(id);

  const [owner, setOwner] = useState<DirectoryEntry | null>(null);
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [viewing, setViewing] = useState<Photo | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user || !ownerId) return;
    fetchUserPhotos(user.id, ownerId)
      .then(({ user: o, photos }) => { setOwner(o); setPhotos(photos); })
      .catch((e) => { setError((e as Error).message); setPhotos([]); });
  }, [user, ownerId]);

  if (!isLoggedIn || !user) {
    return <div className="page"><Notice>Sign in to view this album.</Notice></div>;
  }

  const name = owner?.fullname || owner?.username || "Member";

  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <div className="row" style={{ alignItems: "center", marginBottom: 10, gap: 8 }}>
        {owner?.profile_image && (
          <img src={mediaUrl(owner.profile_image)} alt="" style={{ width: 34, height: 34, borderRadius: 17, objectFit: "cover" }} />
        )}
        <h1 className="page-title" style={{ flex: 1, marginBottom: 0 }}>{name}'s photos</h1>
        <Link className="btn small ghost" to={`/profile/${ownerId}`}>Profile</Link>
      </div>

      {error && <p style={{ color: "#f55", fontSize: 13 }}>{error}</p>}

      {photos === null ? <Loading /> : photos.length === 0 ? (
        <div className="card pad"><p className="muted" style={{ margin: 0 }}>No photos to show.</p></div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
          {photos.map((p) => (
            <button key={p.id} onClick={() => setViewing(p)}
              style={{ padding: 0, border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", background: "var(--panel)", cursor: "pointer", aspectRatio: "1" }}>
              <img src={mediaUrl(p.thumb_path || p.photo_path)} alt="" loading="lazy"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </button>
          ))}
        </div>
      )}

      {viewing && (
        <div onClick={() => setViewing(null)}
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.85)", display: "grid", placeItems: "center", padding: 16 }}>
          <img src={mediaUrl(viewing.photo_path || viewing.thumb_path)} alt=""
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "min(900px, 100%)", maxHeight: "86vh", objectFit: "contain", borderRadius: 10 }} />
        </div>
      )}
    </div>
  );
}
