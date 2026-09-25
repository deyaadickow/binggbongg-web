// My Photos: folders down the side, the chosen folder's photos as a grid, and a lightbox with
// the actions the phones have — favourite, move to another folder, delete.
//
// Favourites is virtual: it isn't a folder photos live in, it's every starred photo wherever it
// sits. So it can't be uploaded into, renamed or deleted, and moving out of it is meaningless.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { mediaUrl } from "../lib/api";
import { useSession } from "../lib/session";
import {
  deleteFolder, deletePhoto, fetchFolderPhotos, fetchMyFolders, isFavourited, isFavouritesFolder,
  movePhoto, renameFolder, togglePhotoFavourite, type Photo, type PhotoFolder,
} from "../lib/photos";
import { Loading, Notice } from "../components/Common";

export function MyPhotosPage() {
  const { user, isLoggedIn } = useSession();

  const [folders, setFolders] = useState<PhotoFolder[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [viewing, setViewing] = useState<Photo | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  const loadFolders = useCallback(async () => {
    if (!user) return;
    const f = await fetchMyFolders(user.id).catch(() => [] as PhotoFolder[]);
    setFolders(f);
    setOpenId((cur) => cur ?? f[0]?.id ?? null);
  }, [user]);

  const loadPhotos = useCallback(async () => {
    if (!user || openId == null) return;
    setPhotos(null);
    try {
      const { photos } = await fetchFolderPhotos(user.id, openId);
      setPhotos(photos);
    } catch (e) {
      setToast((e as Error).message);
      setPhotos([]);
    }
  }, [user, openId]);

  useEffect(() => { void loadFolders(); }, [loadFolders]);
  useEffect(() => { void loadPhotos(); }, [loadPhotos]);

  const openFolder = folders?.find((f) => f.id === openId) ?? null;
  const moveTargets = (folders ?? []).filter((f) => !isFavouritesFolder(f) && f.id !== openId);

  async function act(fn: () => Promise<void>, after: "photos" | "all" = "photos") {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      if (after === "all") await loadFolders();
      await loadPhotos();
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!isLoggedIn || !user) {
    return <div className="page"><Notice>Sign in to see your photos.</Notice></div>;
  }

  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <div className="row" style={{ alignItems: "center", marginBottom: 8 }}>
        <h1 className="page-title" style={{ flex: 1, marginBottom: 0 }}>My photos</h1>
        <Link className="btn small" to="/upload-photos">Upload photos</Link>
      </div>
      {toast && <p style={{ color: "#f55", fontSize: 13 }}>{toast}</p>}

      {folders === null ? <Loading /> : folders.length === 0 ? (
        <div className="card pad">
          <p className="soft" style={{ marginTop: 0 }}>You haven't uploaded any photos yet.</p>
          <Link className="btn" to="/upload-photos">Upload your first photo</Link>
        </div>
      ) : (
        <div className="row" style={{ alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div className="card" style={{ flex: "0 0 220px", minWidth: 200, overflow: "hidden" }}>
            {folders.map((f) => {
              const open = f.id === openId;
              return (
                <button key={f.id} onClick={() => setOpenId(f.id)}
                  style={{
                    display: "block", width: "100%", textAlign: "left", padding: "11px 13px",
                    background: open ? "rgba(212,175,55,.12)" : "transparent", border: "none",
                    borderBottom: "1px solid var(--line)", color: "var(--text)", cursor: "pointer", font: "inherit",
                  }}>
                  <span style={{ fontWeight: 700, color: open ? "var(--gold)" : undefined }}>
                    {isFavouritesFolder(f) ? "⭐ " : ""}{f.name}
                  </span>
                  <span className="muted" style={{ display: "block", fontSize: 12 }}>
                    {f.photo_count ?? 0} photo{f.photo_count === 1 ? "" : "s"}
                  </span>
                </button>
              );
            })}
          </div>

          <div style={{ flex: 1, minWidth: 260 }}>
            {openFolder && !isFavouritesFolder(openFolder) && (
              <div className="row" style={{ marginBottom: 10, gap: 8 }}>
                <button className="btn small ghost" disabled={busy} onClick={() => {
                  const name = window.prompt("Rename folder", openFolder.name ?? "");
                  if (name && name.trim()) void act(() => renameFolder(user.id, openFolder.id, name.trim()), "all");
                }}>Rename</button>
                <button className="btn small ghost" disabled={busy} onClick={() => {
                  if (!window.confirm(`Delete "${openFolder.name}" and everything in it? This cannot be undone.`)) return;
                  void act(async () => {
                    await deleteFolder(user.id, openFolder.id);
                    setOpenId(null);
                  }, "all");
                }} style={{ color: "#f55", borderColor: "#f55" }}>Delete folder</button>
              </div>
            )}

            {photos === null ? <Loading /> : photos.length === 0 ? (
              <div className="card pad">
                <p className="muted" style={{ margin: 0 }}>
                  {openFolder && isFavouritesFolder(openFolder)
                    ? "No favourites yet — star a photo to keep it here."
                    : "Nothing in this folder yet."}
                </p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
                {photos.map((p) => (
                  <button key={p.id} onClick={() => setViewing(p)}
                    style={{ position: "relative", padding: 0, border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", background: "var(--panel)", cursor: "pointer", aspectRatio: "1" }}>
                    <img src={mediaUrl(p.thumb_path || p.photo_path)} alt="" loading="lazy"
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    {isFavourited(p) && (
                      <span style={{ position: "absolute", top: 6, right: 6, fontSize: 15 }}>⭐</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {viewing && (
        <div onClick={() => setViewing(null)}
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.82)", display: "grid", placeItems: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: "min(760px, 100%)", width: "100%" }}>
            <img src={mediaUrl(viewing.photo_path || viewing.thumb_path)} alt=""
              style={{ width: "100%", maxHeight: "68vh", objectFit: "contain", borderRadius: 10, display: "block" }} />
            <div className="card pad" style={{ marginTop: 10 }}>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <button className="btn small" disabled={busy}
                  onClick={() => void act(() => togglePhotoFavourite(user.id, viewing.id))}>
                  {isFavourited(viewing) ? "★ Remove favourite" : "☆ Favourite"}
                </button>

                {moveTargets.length > 0 && (
                  <select className="input" defaultValue="" disabled={busy}
                    onChange={(e) => {
                      const target = Number(e.target.value);
                      if (!target) return;
                      void act(async () => {
                        await movePhoto(user.id, viewing.id, target);
                        setViewing(null);
                      }, "all");
                    }}
                    style={{ flex: 1, minWidth: 150 }}>
                    <option value="">Move to…</option>
                    {moveTargets.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                )}

                <button className="btn small ghost" disabled={busy} style={{ color: "#f55", borderColor: "#f55" }}
                  onClick={() => {
                    if (!window.confirm("Delete this photo? This cannot be undone.")) return;
                    void act(async () => {
                      await deletePhoto(user.id, viewing.id);
                      setViewing(null);
                    }, "all");
                  }}>Delete</button>

                <button className="btn small ghost" onClick={() => setViewing(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
