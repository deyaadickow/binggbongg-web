import { API_BASE, currentAuthHeaders, post } from "./api";

/**
 * Stickers — the catalog, your own uploads, and sending one as a comment.
 *
 * Steve, 2026-10-21: "Add the sticker picker to the web." The web could already SHOW a sticker
 * comment that came from a phone (it had to, or those rows read as blank) but could not send one,
 * because there was no picker. This is the same catalog, the same uploads and the same endpoints
 * both phones use — see StickerController and Android's StickerSendPickerSheet.
 *
 * Eddie, 2026-09-08 for the catalog ("add animated stickers like Gif") and Steve for the uploads
 * ("give the members the ability to upload their own stickers").
 */

/** A row of tbl_stickers. `userId` null = an admin catalog sticker; set = somebody's own. */
export interface Sticker {
  id: number;
  user_id?: number | null;
  title?: string | null;
  /** The stored path — this is what gets sent as a comment's `sticker_url`, exactly as the
   *  phones send it (Android passes `sticker.getFile()` straight through). Render it through
   *  mediaUrl(); send it raw. */
  file: string;
}

/** png/jpg/jpeg/gif/webp/webm — StickerController::ALLOWED_STICKER_EXTENSIONS. */
export const STICKER_ACCEPT = ".png,.jpg,.jpeg,.gif,.webp,.webm";

/**
 * The catalog: every admin sticker, plus this member's own when a user_id is given. One call
 * covers both, the way the phones' picker loads its grid.
 */
export async function fetchActiveStickers(userId?: number): Promise<Sticker[]> {
  const res = await post<Sticker[]>("fetchActiveStickers", { user_id: userId });
  return Array.isArray(res.data) ? res.data : [];
}

/** Only this member's own uploads, for the manage/delete list. */
export async function fetchMyStickers(userId: number): Promise<Sticker[]> {
  const res = await post<Sticker[]>("fetchMyStickers", { user_id: userId });
  return Array.isArray(res.data) ? res.data : [];
}

/**
 * Upload one of your own.
 *
 * Moderation is the server's job and happens here, not on the client: addMySticker runs the file
 * through uploadFilToS3 (the PhotoDNA gate) and then synchronously through Hive, and a flagged
 * upload is rejected outright rather than saved as "pending". So a rejection comes back as
 * status:false with the server's own sentence, which is what the caller must show.
 */
export function addMySticker(userId: number, file: File, onProgress?: (f: number) => void): Promise<Sticker> {
  const form = new FormData();
  form.append("user_id", String(userId));
  form.append("file", file);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", API_BASE + "addMySticker", true);
    for (const [k, v] of Object.entries(currentAuthHeaders())) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      let body: { status?: boolean; message?: string; data?: Sticker } = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* handled below */ }
      if (xhr.status >= 200 && xhr.status < 300 && body.status && body.data) resolve(body.data);
      // The server's own words when Hive rejects it, or the file type is unsupported.
      else reject(new Error(body.message || "That sticker could not be uploaded."));
    };
    xhr.onerror = () => reject(new Error("That sticker could not be uploaded."));
    xhr.send(form);
  });
}

export async function deleteMySticker(userId: number, stickerId: number) {
  return post("deleteMySticker", { user_id: userId, sticker_id: stickerId });
}
