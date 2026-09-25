// Upload photos from the browser: pick a folder (or make one), pick images, upload them one at
// a time with progress. Photos go as multipart to uploadPhoto rather than through S3 pre-signing
// — the backend stores them itself.
//
// Storage is metered past a free allowance, so the count is shown up front and the server's own
// refusal ("deposit more to your Ad Cash Account") is surfaced verbatim rather than reworded.
import { useCallback, useEffect, useRef, useState } from "react";
import { currentAuthHeaders, mediaUrl } from "../lib/api";
import { useSession } from "../lib/session";
import {
  createFolder, fetchMyFolders, fetchPhotoStorageStatus, isFavouritesFolder, uploadPhoto,
  type PhotoFolder, type PhotoStorageStatus,
} from "../lib/photos";
import { Loading, Notice } from "../components/Common";

export function UploadPhotosPage() {
  const { user, isLoggedIn } = useSession();
  const fileRef = useRef<HTMLInputElement>(null);

  const [folders, setFolders] = useState<PhotoFolder[] | null>(null);
  const [storage, setStorage] = useState<PhotoStorageStatus | null>(null);
  const [folderId, setFolderId] = useState<string>("");
  const [newFolder, setNewFolder] = useState("");
  const [creating, setCreating] = useState(false);

  const [queue, setQueue] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(() => {
    if (!user) return;
    fetchMyFolders(user.id).then((f) => {
      setFolders(f);
      // Default to the first folder you can actually upload into.
      const firstReal = f.find((x) => !isFavouritesFolder(x));
      if (firstReal && !folderId) setFolderId(String(firstReal.id));
    }).catch(() => setFolders([]));
    fetchPhotoStorageStatus(user.id).then(setStorage).catch(() => undefined);
  }, [user, folderId]);

  useEffect(() => { load(); }, [user]);

  async function addFolder() {
    if (!user || !newFolder.trim() || creating) return;
    setCreating(true);
    setError("");
    try {
      await createFolder(user.id, newFolder.trim());
      setNewFolder("");
      setToast("Folder created.");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function uploadAll() {
    if (!user || !queue.length || busy) return;
    if (!folderId) { setError("Pick a folder first."); return; }
    setBusy(true);
    setError("");
    setDoneCount(0);
    const headers = currentAuthHeaders();
    try {
      for (let i = 0; i < queue.length; i++) {
        setProgress(0);
        // One at a time: the server meters storage per photo and can refuse partway through,
        // and uploading in parallel would make it unclear which one was rejected.
        await uploadPhoto(user.id, Number(folderId), queue[i], headers, setProgress);
        setDoneCount(i + 1);
      }
      setToast(`${queue.length} photo${queue.length === 1 ? "" : "s"} uploaded.`);
      setQueue([]);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setProgress(0);
    }
  }

  if (!isLoggedIn || !user) {
    return <div className="page"><Notice>Sign in to upload photos.</Notice></div>;
  }

  const uploadable = (folders ?? []).filter((f) => !isFavouritesFolder(f));

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <h1 className="page-title">Upload photos</h1>

      {storage && (
        <div className="card pad" style={{ marginBottom: 12 }}>
          <div className="muted" style={{ fontSize: 13 }}>
            {Number(storage.total_photos ?? 0).toLocaleString()} photo{storage.total_photos === 1 ? "" : "s"} stored
            {storage.free_limit != null && ` · first ${Number(storage.free_limit).toLocaleString()} are free`}
          </div>
        </div>
      )}

      <div className="card pad" style={{ marginBottom: 12 }}>
        <label className="soft" style={{ fontSize: 13 }}>Folder</label>
        {folders === null ? <Loading /> : (
          <>
            <select className="input" value={folderId} onChange={(e) => setFolderId(e.target.value)} style={{ width: "100%", marginBottom: 10 }}>
              <option value="">Choose a folder…</option>
              {uploadable.map((f) => (
                <option key={f.id} value={f.id}>{f.name}{f.photo_count ? ` (${f.photo_count})` : ""}</option>
              ))}
            </select>
            {uploadable.length === 0 && (
              <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
                You don't have a folder yet — make one below. Favourites doesn't count: you star photos into it rather than uploading there.
              </p>
            )}
            <div className="row" style={{ gap: 8 }}>
              <input className="input" value={newFolder} onChange={(e) => setNewFolder(e.target.value)}
                placeholder="New folder name" maxLength={100} style={{ flex: 1 }} />
              <button className="btn ghost" disabled={creating || !newFolder.trim()} onClick={addFolder}>
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="card pad" style={{ marginBottom: 12 }}>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }}
          onChange={(e) => { setQueue([...(e.target.files ?? [])]); setError(""); }} />
        {queue.length === 0 ? (
          <>
            <p className="soft" style={{ marginTop: 0 }}>Choose one or more photos from this device.</p>
            <button className="btn" onClick={() => fileRef.current?.click()}>Choose photos</button>
          </>
        ) : (
          <>
            <div className="row" style={{ marginBottom: 10 }}>
              <b style={{ flex: 1 }}>{queue.length} photo{queue.length === 1 ? "" : "s"} ready</b>
              <button className="btn small ghost" disabled={busy} onClick={() => fileRef.current?.click()}>Change</button>
            </div>
            <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
              {queue.slice(0, 12).map((f, i) => (
                <img key={i} src={URL.createObjectURL(f)} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)" }} />
              ))}
              {queue.length > 12 && <span className="muted" style={{ alignSelf: "center" }}>+{queue.length - 12} more</span>}
            </div>
          </>
        )}
      </div>

      {error && <p style={{ color: "#f55", fontSize: 13 }}>{error}</p>}
      {toast && !error && <p className="soft" style={{ fontSize: 13 }}>{toast}</p>}

      {busy && (
        <div className="card pad" style={{ marginBottom: 12 }}>
          <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
            Uploading {doneCount + 1} of {queue.length}…
          </div>
          <div style={{ height: 8, background: "var(--panel)", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: `${Math.round(progress * 100)}%`, height: "100%", background: "var(--gold-border)", transition: "width .2s" }} />
          </div>
        </div>
      )}

      <button className="btn block" disabled={busy || !queue.length || !folderId} onClick={uploadAll}
        style={{ background: "var(--gold-border)", color: "#000", borderColor: "var(--gold-border)" }}>
        {busy ? "Uploading…" : `Upload ${queue.length || ""} photo${queue.length === 1 ? "" : "s"}`.trim()}
      </button>

      {(folders ?? []).some((f) => (f.preview_thumbs ?? []).length > 0) && (
        <div className="card pad" style={{ marginTop: 12 }}>
          <b style={{ color: "var(--gold)" }}>Your folders</b>
          {(folders ?? []).map((f) => (
            <div key={f.id} className="row" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)", alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <b>{f.name}</b>
                <div className="muted" style={{ fontSize: 12 }}>{f.photo_count ?? 0} photo{f.photo_count === 1 ? "" : "s"}</div>
              </div>
              <div className="row" style={{ gap: 4 }}>
                {(f.preview_thumbs ?? []).slice(0, 3).map((t, i) => (
                  <img key={i} src={mediaUrl(t)} alt="" style={{ width: 34, height: 34, objectFit: "cover", borderRadius: 6 }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
