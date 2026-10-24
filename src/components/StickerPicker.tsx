import { useEffect, useRef, useState } from "react";
import { mediaUrl } from "../lib/api";
import {
  STICKER_ACCEPT,
  addMySticker,
  deleteMySticker,
  fetchActiveStickers,
  type Sticker,
} from "../lib/stickers";
import { useSession } from "../lib/session";
import { showGoldAlert } from "./GoldToast";

/**
 * Pick a sticker to send, or upload one of your own.
 *
 * Steve, 2026-10-21: "Add the sticker picker to the web." The web could already show a sticker
 * comment that arrived from a phone but had no way to send one. Same catalog, same uploads and
 * the same endpoints as the phones' own picker (Android's StickerSendPickerSheet).
 *
 * Picking one sends it immediately — no separate confirm step — matching how the phones behave
 * and how tapping Send works for text.
 *
 * Uploads: moderation is the server's job (PhotoDNA on the way into S3, then Hive synchronously),
 * and a rejected file is never saved, so the only thing to do here is show the server's own
 * sentence when it says no.
 */
export function StickerPicker({
  onPick,
  onClose,
}: {
  onPick: (sticker: Sticker) => void;
  onClose: () => void;
}) {
  const { user } = useSession();
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    fetchActiveStickers(user?.id)
      .then((rows) => { if (alive) setStickers(rows); })
      .catch(() => { if (alive) setStickers([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [user?.id]);

  // Escape closes it, like every other overlay in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function upload(file: File) {
    if (!user) return;
    setUploading(true);
    setProgress(0);
    try {
      const added = await addMySticker(user.id, file, setProgress);
      // Straight to the front, so they can see it landed and send it at once.
      setStickers((prev) => [added, ...prev]);
    } catch (e) {
      // The server's own words — a Hive rejection or an unsupported file type.
      showGoldAlert(e instanceof Error ? e.message : "That sticker could not be uploaded.");
    } finally {
      setUploading(false);
      setProgress(0);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function remove(s: Sticker) {
    if (!user) return;
    const keep = stickers;
    setStickers((prev) => prev.filter((x) => x.id !== s.id));
    try {
      const res = await deleteMySticker(user.id, s.id);
      if (!res.status) throw new Error(res.message);
    } catch {
      setStickers(keep);
      showGoldAlert("Couldn't delete that sticker.");
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.7)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ maxWidth: 460, width: "100%", maxHeight: "80vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row" style={{ alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 800, flex: 1 }}>Stickers</div>
          <button className="btn small ghost" onClick={onClose}>✕</button>
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {loading && <div className="muted">Loading stickers…</div>}
          {!loading && stickers.length === 0 && (
            <div className="muted">No stickers yet. Upload one of your own below.</div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(76px, 1fr))", gap: 10 }}>
            {stickers.map((s) => {
              const mine = !!user && s.user_id === user.id;
              return (
                <div key={s.id} style={{ position: "relative" }}>
                  <button
                    onClick={() => onPick(s)}
                    title={s.title || "Send this sticker"}
                    style={{
                      width: "100%", aspectRatio: "1", padding: 4, cursor: "pointer",
                      background: "#0d0d0d", border: "1px solid var(--gold-border)", borderRadius: 10,
                    }}
                  >
                    {/* webm stickers are video, not images — an <img> would render nothing. */}
                    {/\.webm$/i.test(s.file) ? (
                      <video
                        src={mediaUrl(s.file)}
                        muted
                        loop
                        autoPlay
                        playsInline
                        style={{ width: "100%", height: "100%", objectFit: "contain" }}
                      />
                    ) : (
                      <img
                        src={mediaUrl(s.file)}
                        alt={s.title || "sticker"}
                        style={{ width: "100%", height: "100%", objectFit: "contain" }}
                      />
                    )}
                  </button>
                  {mine && (
                    <button
                      onClick={() => void remove(s)}
                      title="Delete this sticker"
                      style={{
                        position: "absolute", top: -6, right: -6, width: 22, height: 22,
                        borderRadius: "50%", cursor: "pointer", lineHeight: 1, fontSize: 12,
                        background: "#000", color: "var(--gold)", border: "1px solid var(--gold-border)",
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <input
            ref={fileInput}
            type="file"
            accept={STICKER_ACCEPT}
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <button
            className="btn ghost"
            style={{ width: "100%" }}
            disabled={uploading || !user}
            onClick={() => fileInput.current?.click()}
          >
            {uploading
              ? `Uploading… ${Math.round(progress * 100)}%`
              : "Upload my own sticker"}
          </button>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            PNG, JPG, GIF, WEBP or WEBM. Yours are checked before they are saved.
          </div>
        </div>
      </div>
    </div>
  );
}
