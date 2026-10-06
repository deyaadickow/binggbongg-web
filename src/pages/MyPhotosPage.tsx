// My Photos: folders in one shared box, the chosen folder's photos as a grid, an "All Photos"
// preview strip at the bottom, and a lightbox with the actions the phones have — favourite,
// move to another folder, delete.
//
// Favourites is virtual: it isn't a folder photos live in, it's every starred photo wherever it
// sits. So it can't be uploaded into, renamed or deleted, and moving out of it is meaningless.
//
// Steve, 2026-09-28 (ported from the same day's iOS pass on PhotosView.swift — "exactly the same
// thing" for the web app):
// - "Put these two links in one box one next to the other." — folders now render as compact
//   2-per-row cards inside one shared black/gold box instead of a stacked vertical list.
// - "Also show all photos thumbnail on the bottom of this page." / "it should just open the
//   photos, it should not go to another page that has all the photos." — a separate preview grid
//   of the member's "All Photos" folder, independent of whichever folder is currently open above;
//   tapping a thumbnail opens the lightbox directly.
// - "Center all the text on this banner... Remove the link that says 'Fund Ad Cash Account'
//   Replace it with the line above that says 'Add money to your cash account' And make all text
//   in gold... make it look like a link by adding a gold border to it." — storage banner redesign.
// - "Add gold borders all around the thumbnaile including the photos." / "add a small star on top
//   right hand side of every photo so they can heigh light it to be in their favorite photo
//   folder." — every own-photo thumbnail below gets a gold border and a directly-tappable star.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { mediaUrl, post } from "../lib/api";
import { useSession } from "../lib/session";
import {
  deleteFolder, deletePhoto, fetchFolderPhotos, fetchMyFolders, fetchPhotoStorageStatus,
  isFavourited, isFavouritesFolder, isPhotoStoragePaidTier, isPhotoStoragePaused, movePhoto,
  renameFolder, togglePhotoFavourite, type Photo, type PhotoFolder, type PhotoStorageStatus,
} from "../lib/photos";
import { Loading, Notice } from "../components/Common";
import { GoldSelect } from "../components/GoldSelect";

const THUMB_BORDER = "1.5px solid var(--gold-border)";

/** "All Photos" by name if there is one, else the first folder you can actually upload into. */
function findAllPhotosFolder(folders: PhotoFolder[]): PhotoFolder | null {
  const uploadable = folders.filter((f) => !isFavouritesFolder(f));
  return uploadable.find((f) => (f.name ?? "").trim().toLowerCase() === "all photos") ?? uploadable[0] ?? null;
}

export function MyPhotosPage() {
  const { user, isLoggedIn } = useSession();

  const [folders, setFolders] = useState<PhotoFolder[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [allPhotos, setAllPhotos] = useState<Photo[] | null>(null);
  const [storage, setStorage] = useState<PhotoStorageStatus | null>(null);
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

  const loadAllPhotos = useCallback(async () => {
    if (!user || !folders) return;
    const folder = findAllPhotosFolder(folders);
    if (!folder) { setAllPhotos([]); return; }
    try {
      const { photos } = await fetchFolderPhotos(user.id, folder.id);
      setAllPhotos(photos);
    } catch {
      setAllPhotos([]);
    }
  }, [user, folders]);

  useEffect(() => { void loadFolders(); }, [loadFolders]);
  useEffect(() => { void loadPhotos(); }, [loadPhotos]);
  useEffect(() => { void loadAllPhotos(); }, [loadAllPhotos]);
  useEffect(() => {
    if (!user) return;
    void fetchPhotoStorageStatus(user.id).then(setStorage);
  }, [user]);

  const openFolder = folders?.find((f) => f.id === openId) ?? null;
  const moveTargets = (folders ?? []).filter((f) => !isFavouritesFolder(f) && f.id !== openId);
  const allPhotosFolder = folders ? findAllPhotosFolder(folders) : null;

  async function act(fn: () => Promise<void>, after: "photos" | "all" = "photos") {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      if (after === "all") await loadFolders();
      await Promise.all([loadPhotos(), loadAllPhotos()]);
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function startAdCashDeposit() {
    if (!user) return;
    const r = await post<unknown>("startAdCashDepositSession", { my_user_id: user.id }).catch(() => null);
    const url = (r as { url?: string } | null)?.url;
    if (url) window.open(url, "_blank", "noopener");
    else window.alert((r as { message?: string } | null)?.message ?? "Couldn't open the funding page.");
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

      {storage && (
        <div className="card pad" style={{ marginBottom: 14, textAlign: "center" }}>
          <div style={{ fontWeight: 800, color: "var(--gold)", fontSize: 15 }}>Photo Storage</div>

          {isPhotoStoragePaused(storage) && (
            <span style={{
              display: "inline-block", marginTop: 6, padding: "3px 10px", borderRadius: 6,
              background: "rgba(255,60,60,.9)", color: "#fff", fontWeight: 800, fontSize: 11,
            }}>PAUSED</span>
          )}

          <div style={{ color: "var(--gold)", fontSize: 12, marginTop: 6 }}>
            {isPhotoStoragePaidTier(storage)
              ? `${Number(storage.total_photos ?? 0).toLocaleString()} photos · $${Number(storage.current_monthly_price ?? 0).toFixed(2)}/month · next billed ${storage.next_billing_date ?? "—"}`
              : `${Number(storage.total_photos ?? 0).toLocaleString()} of ${Number(storage.free_limit ?? 100).toLocaleString()} free photos used`}
          </div>

          <div style={{ color: "var(--gold)", fontSize: 12, marginTop: 4 }}>
            Cash Account balance: ${Number(storage.ad_cash_balance ?? 0).toFixed(2)}
          </div>

          <button onClick={() => void startAdCashDeposit()}
            style={{
              marginTop: 10, background: "transparent", borderRadius: 999, border: THUMB_BORDER,
              color: "var(--gold)", padding: "6px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}>
            Add money to your cash account
          </button>

          {isPhotoStoragePaused(storage) && (
            <div style={{ color: "#f55", fontSize: 12, marginTop: 8 }}>
              Uploads are paused until you add funds — your existing photos are safe and still visible.
            </div>
          )}
        </div>
      )}

      {toast && <p style={{ color: "#f55", fontSize: 13 }}>{toast}</p>}

      {folders === null ? <Loading /> : folders.length === 0 ? (
        <div className="card pad">
          <p className="soft" style={{ marginTop: 0 }}>You haven't uploaded any photos yet.</p>
          <Link className="btn" to="/upload-photos">Upload your first photo</Link>
        </div>
      ) : (
        <>
          {/* Steve, 2026-09-28: "Put these two links in one box one next to the other." — every
              folder (Favourites, All Photos, any custom folder) lives in one shared black/gold
              box, laid out two-per-row as compact cards. */}
          <div className="card pad" style={{ marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
              {folders.map((f) => {
                const open = f.id === openId;
                return (
                  <button key={f.id} onClick={() => setOpenId(f.id)}
                    style={{
                      display: "block", width: "100%", textAlign: "left", padding: 0, border: "none",
                      background: "transparent", cursor: "pointer", font: "inherit", borderRadius: 10,
                    }}>
                    <div style={{
                      width: "100%", aspectRatio: "1", borderRadius: 8, overflow: "hidden",
                      border: open ? "1.5px solid var(--gold-bright)" : THUMB_BORDER,
                      background: "var(--panel)", display: "grid", placeItems: "center",
                    }}>
                      {f.preview_thumbs?.[0] ? (
                        <img src={mediaUrl(f.preview_thumbs[0])} alt="" loading="lazy"
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      ) : (
                        <span style={{ fontSize: 26 }}>{isFavouritesFolder(f) ? "⭐" : "🖼️"}</span>
                      )}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: open ? "var(--gold)" : "var(--text)" }}>
                        {isFavouritesFolder(f) ? "⭐ " : ""}{f.name}
                      </span>
                      <span className="muted" style={{ display: "block", fontSize: 12 }}>
                        {f.photo_count ?? 0} photo{f.photo_count === 1 ? "" : "s"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            {openFolder && !isFavouritesFolder(openFolder) && (
              <div className="row" style={{ marginBottom: 10, gap: 8 }}>
                <button className="btn small ghost" disabled={busy} onClick={() => {
                  const name = window.prompt("Rename folder", openFolder.name ?? "");
                  if (name && name.trim()) void act(() => renameFolder(user.id, openFolder.id, name.trim()), "all");
                }}>Rename</button>
                <button className="btn small ghost" disabled={busy} onClick={() => {
                  // Steve, 2026-09-28: the old copy said "and everything in it," implying this
                  // button also deletes the folder's photos — it doesn't. The server
                  // (deleteFolder in PhotoController.php) refuses with "Move or delete every
                  // photo in this folder first." if the folder isn't already empty, and act()
                  // surfaces that real server message via the toast either way, so the confirm
                  // text just needs to stop overpromising.
                  if (!window.confirm(`Delete "${openFolder.name}"? The folder must be empty first — move or delete its photos before this will work. This cannot be undone.`)) return;
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
                  <PhotoThumb key={p.id} photo={p} busy={busy}
                    onOpen={() => setViewing(p)}
                    onToggleFavourite={() => void act(() => togglePhotoFavourite(user.id, p.id), "all")} />
                ))}
              </div>
            )}
          </div>

          {/* Steve, 2026-09-28: "Also show all photos thumbnail on the bottom of this page." —
              independent of whichever folder is open above; tapping a thumbnail opens the
              lightbox directly rather than another folder-listing page. */}
          {allPhotos && allPhotos.length > 0 && (
            <div style={{ marginTop: 22 }}>
              <b style={{ color: "var(--gold)", display: "block", marginBottom: 10, fontSize: 15 }}>
                {allPhotosFolder?.name ?? "All Photos"}
              </b>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 6 }}>
                {allPhotos.map((p) => (
                  <PhotoThumb key={p.id} photo={p} busy={busy}
                    onOpen={() => setViewing(p)}
                    onToggleFavourite={() => void act(() => togglePhotoFavourite(user.id, p.id), "all")} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {viewing && (
        <div onClick={() => setViewing(null)}
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.82)", display: "grid", placeItems: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: "min(760px, 100%)", width: "100%" }}>
            <img src={viewing.photo_url || viewing.thumb_url || mediaUrl(viewing.photo_path || viewing.thumb_path)} alt=""
              style={{ width: "100%", maxHeight: "68vh", objectFit: "contain", borderRadius: 10, display: "block" }} />
            <div className="card pad" style={{ marginTop: 10 }}>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <button className="btn small" disabled={busy}
                  onClick={() => void act(() => togglePhotoFavourite(user.id, viewing.id), "all")}>
                  {isFavourited(viewing) ? "★ Remove favourite" : "☆ Favourite"}
                </button>

                {moveTargets.length > 0 && (
                  <GoldSelect
                    ariaLabel="Move to"
                    placeholder="Move to…"
                    searchable
                    disabled={busy}
                    // An action menu rather than a value: picking a folder moves the photo and
                    // closes the viewer, so nothing is ever left showing as "chosen".
                    value=""
                    options={moveTargets.map((f) => ({ value: String(f.id), label: f.name ?? "" }))}
                    onChange={(v) => {
                      const target = Number(v);
                      if (!target) return;
                      void act(async () => {
                        await movePhoto(user.id, viewing.id, target);
                        setViewing(null);
                      }, "all");
                    }}
                    style={{ flex: 1, minWidth: 150 }}
                  />
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

/**
 * One own-photo grid thumbnail: gold border, and a small star top-right that toggles favourite
 * status directly — without opening the full viewer first (Steve, 2026-09-28: "add a small star
 * on top right hand side of every photo so they can heigh light it to be in their favorite photo
 * folder"). A plain div (not a button) so the star can be its own real, independently-clickable
 * button nested inside it.
 */
function PhotoThumb({ photo, busy, onOpen, onToggleFavourite }: {
  photo: Photo; busy: boolean; onOpen: () => void; onToggleFavourite: () => void;
}) {
  return (
    <div onClick={onOpen}
      style={{
        position: "relative", borderRadius: 10, overflow: "hidden", border: THUMB_BORDER,
        background: "var(--panel)", cursor: "pointer", aspectRatio: "1",
      }}>
      <img src={photo.thumb_url || photo.photo_url || mediaUrl(photo.thumb_path || photo.photo_path)} alt="" loading="lazy"
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      <button disabled={busy}
        onClick={(e) => { e.stopPropagation(); onToggleFavourite(); }}
        title={isFavourited(photo) ? "Remove favourite" : "Add to favourites"}
        style={{
          position: "absolute", top: 5, right: 5, width: 22, height: 22, borderRadius: "50%", padding: 0,
          border: "1px solid var(--gold-border)", background: "rgba(0,0,0,.6)", color: "var(--gold)",
          display: "grid", placeItems: "center", fontSize: 12, lineHeight: 1, cursor: "pointer",
        }}>
        {isFavourited(photo) ? "★" : "☆"}
      </button>
    </div>
  );
}
