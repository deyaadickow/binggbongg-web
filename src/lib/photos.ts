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

// ---- Viewing and managing what's already uploaded -------------------------------------------

export interface Photo {
  id: number;
  photo_path?: string | null;
  thumb_path?: string | null;
  is_favorited?: boolean | number | null;
  folder_id?: number | null;
  created_at?: string | null;
}

export const isFavourited = (p: Photo): boolean =>
  p.is_favorited === true || p.is_favorited === 1;

/** Favourites is virtual: asking for it returns every starred photo, whatever folder it lives in. */
export async function fetchFolderPhotos(myUserId: number, folderId: number): Promise<{ folder: PhotoFolder | null; photos: Photo[] }> {
  const res = await post<{ folder?: PhotoFolder; photos?: Photo[] }>("fetchFolderPhotos", {
    my_user_id: myUserId,
    folder_id: folderId,
  });
  if (!res.status) throw new Error(res.message ?? "Couldn't open that folder.");
  return { folder: res.data?.folder ?? null, photos: res.data?.photos ?? [] };
}

export async function togglePhotoFavourite(myUserId: number, photoId: number): Promise<void> {
  const res = await post("togglePhotoFavorite", { my_user_id: myUserId, photo_id: photoId });
  if (!res.status) throw new Error(res.message ?? "Couldn't update that photo.");
}

export async function movePhoto(myUserId: number, photoId: number, targetFolderId: number): Promise<void> {
  const res = await post("movePhoto", { my_user_id: myUserId, photo_id: photoId, target_folder_id: targetFolderId });
  if (!res.status) throw new Error(res.message ?? "Couldn't move that photo.");
}

export async function deletePhoto(myUserId: number, photoId: number): Promise<void> {
  const res = await post("deletePhoto", { my_user_id: myUserId, photo_id: photoId });
  if (!res.status) throw new Error(res.message ?? "Couldn't delete that photo.");
}

export async function renameFolder(myUserId: number, folderId: number, name: string): Promise<void> {
  const res = await post("renameFolder", { my_user_id: myUserId, folder_id: folderId, name });
  if (!res.status) throw new Error(res.message ?? "Couldn't rename that folder.");
}

export async function deleteFolder(myUserId: number, folderId: number): Promise<void> {
  const res = await post("deleteFolder", { my_user_id: myUserId, folder_id: folderId });
  if (!res.status) throw new Error(res.message ?? "Couldn't delete that folder.");
}

// ---- Public surfaces: the directory and the feed --------------------------------------------
//
// Both only ever show photos from members whose photo storage is active AND who are past the
// free allowance — i.e. members paying for storage. That is the server's rule
// (eligiblePhotosQuery), not something the client decides.

export interface DirectoryEntry {
  user_id: number;
  fullname?: string | null;
  username?: string | null;
  profile_image?: string | null;
  /** Already a full url from the server, unlike profile_image which is a raw path. */
  preview_thumb?: string | null;
}

export interface FeedPhoto extends Photo {
  user?: { id?: number; fullname?: string | null; username?: string | null; profile_image?: string | null } | null;
  thumb_url?: string | null;
  photo_url?: string | null;
}

/** One row per member with photos, newest-active first. */
export async function fetchPhotosDirectory(myUserId: number): Promise<DirectoryEntry[]> {
  const res = await post<DirectoryEntry[]>("fetchPhotosDirectory", { my_user_id: myUserId });
  return res.status ? (res.data ?? []) : [];
}

/** A single random eligible photo, or null when there are none. */
export async function fetchRandomFeedPhoto(myUserId: number): Promise<FeedPhoto | null> {
  const res = await post<FeedPhoto>("fetchRandomFeedPhoto", { my_user_id: myUserId }).catch(() => null);
  return res?.status ? (res.data ?? null) : null;
}

/**
 * One member's whole album, viewed by someone else — the profile Photos tab, and what a Photos
 * directory tile opens. Needs its own endpoint because fetchFolderPhotos' my_user_id is always
 * rebound to the caller; see the backend's fetchUserPhotos doc comment.
 *
 * Returns EVERY photo that member has, paid storage or not (2026-09-26). The paid-only rule still
 * decides who appears in the directory and the main feed — it just doesn't hide an album from
 * someone who deliberately opened that member's profile.
 */
export async function fetchUserPhotos(myUserId: number, userId: number): Promise<{ user: DirectoryEntry | null; photos: Photo[]; count: number }> {
  const res = await post<{ user?: DirectoryEntry; photos?: Photo[]; photo_count?: number }>("fetchUserPhotos", {
    my_user_id: myUserId,
    user_id: userId,
  });
  if (!res.status) throw new Error(res.message ?? "Couldn't open that album.");
  const photos = res.data?.photos ?? [];
  return { user: res.data?.user ?? null, photos, count: res.data?.photo_count ?? photos.length };
}
