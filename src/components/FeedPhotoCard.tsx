// A single member photo shown in the For You feed — the web side of the phones'
// fetchRandomFeedPhoto. Renders nothing at all when there's no eligible photo, which is the
// normal answer until members build up albums past the free storage allowance.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { mediaUrl } from "../lib/api";
import { useSession } from "../lib/session";
import { fetchRandomFeedPhoto, type FeedPhoto } from "../lib/photos";

export function FeedPhotoCard() {
  const { user } = useSession();
  const [photo, setPhoto] = useState<FeedPhoto | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchRandomFeedPhoto(user.id).then(setPhoto).catch(() => undefined);
  }, [user]);

  if (!photo) return null;

  const src = photo.photo_url || photo.thumb_url || mediaUrl(photo.photo_path || photo.thumb_path);
  if (!src) return null;

  return (
    <div className="card" style={{ marginBottom: 14, overflow: "hidden" }}>
      <div className="row" style={{ padding: "10px 12px", alignItems: "center", gap: 8 }}>
        <span style={{ color: "var(--gold)", fontWeight: 700, fontSize: 13 }}>📷 Photo</span>
        <span className="spacer" />
        {photo.user?.id && (
          <Link to={`/profile/${photo.user.id}`} style={{ fontSize: 13, fontWeight: 700 }}>
            {photo.user.fullname || photo.user.username || "Member"}
          </Link>
        )}
      </div>
      <img src={src} alt="" loading="lazy" style={{ width: "100%", display: "block", maxHeight: 520, objectFit: "cover" }} />
      <div className="row" style={{ padding: "8px 12px" }}>
        <Link className="btn small ghost" to="/photos-directory">Browse photos</Link>
      </div>
    </div>
  );
}
