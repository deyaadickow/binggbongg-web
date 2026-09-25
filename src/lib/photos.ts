// Photos: folders, and uploading into one.
//
// Unlike video, uploadPhoto takes a real multipart file rather than a pre-signed S3 key — the
// backend resizes and stores it itself — so this posts FormData straight to the endpoint rather
// than going through createUploadUrls.
//
// Photo storage is metered: past a free allowance it draws on the member's Ad Cash Account, and
// the server refuses an upload when that balance runs out. fetchMyPhotoStorageStatus is what
// tells the member where they stand before they hit that wall.
import { API_BASE, post } from "./api";
import { uploadErrorMessage } from "./upload";

export interface PhotoFolder {
  id: number;
  name?: string | null;
  /** The Favourites folder is virtual — you star photos into it, you cannot upload to it. */
  is_favorites?: boolean | number | null;
  photo_count?: number | null;
  preview_thumbs?: string[] | null;
}

export interface PhotoStorageStatus {
  total_photos?: number | null;
  free_limit?: number | null;
  block_size?: number | null;
  [k: string]: unknown;
}

export const isFavouritesFolder = (f: PhotoFolder): boolean =>
  f.is_favorites === true || f.is_favorites === 1;

export async function fetchMyFolders(myUserId: number): Promise<PhotoFolder[]> {
  const res = await post<PhotoFolder[]>("fetchMyFolders", { my_user_id: myUserId });
  return res.status ? (res.data ?? []) : [];
}

export async function createFolder(myUserId: number, name: string): Promise<void> {
  const res = await post("createFolder", { my_user_id: myUserId, name });
  if (!res.status) throw new Error(res.message ?? "Couldn't create that folder.");
}

export async function fetchPhotoStorageStatus(myUserId: number): Promise<PhotoStorageStatus | null> {
  const res = await post<PhotoStorageStatus>("fetchMyPhotoStorageStatus", { my_user_id: myUserId }).catch(() => null);
  return res?.status ? (res.data ?? null) : null;
}

/**
 * Multipart upload of one photo, with progress. XMLHttpRequest for the same reason as video:
 * fetch cannot report upload progress.
 *
 * The auth headers are read from the same place lib/api.ts keeps them, passed in by the caller
 * so this file never reaches into that module's private state.
 */
export function uploadPhoto(
  myUserId: number,
  folderId: number,
  file: File,
  headers: Record<string, string>,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("my_user_id", String(myUserId));
    form.append("folder_id", String(folderId));
    form.append("photo", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", API_BASE + "uploadPhoto", true);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body: { status?: boolean; message?: string } = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* falls through to the status check */ }
      if (xhr.status >= 200 && xhr.status < 300 && body.status) resolve();
      else reject(new Error(uploadErrorMessage(xhr.status, body.message)));
    };
    xhr.onerror = () => reject(new Error(uploadErrorMessage(0)));
    xhr.send(form);
  });
}
