// Uploading from the browser. The clients hold no AWS credentials any more (they were removed
// on 2026-09-24 after Google Play flagged them), so every upload is the same three steps:
//
//   1. ask the backend for a pre-signed S3 PUT url  (createUploadUrls)
//   2. PUT the bytes straight to S3 from here
//   3. tell the backend the key it landed under     (uploadPost / uploadPhoto / ...)
//
// Nothing here ever sees a credential — the signed url IS the permission, and it expires.
import { API_BASE, post } from "./api";

export interface UploadSlot {
  file_name: string;
  key: string;
  content_type: string;
  upload_url: string;
  headers: Record<string, string>;
  public_url: string;
  expires_in: number;
}

/** One pre-signed slot per file, in the order asked for. */
export async function createUploadUrls(
  userId: number,
  files: { file_name: string; content_type: string }[],
): Promise<UploadSlot[]> {
  const res = await post<UploadSlot[]>("createUploadUrls", {
    user_id: userId,
    files: JSON.stringify(files),
  });
  if (!res.status || !res.data) throw new Error(res.message ?? "Couldn't prepare the upload.");
  return res.data;
}

/**
 * PUT one file to its signed url, reporting progress. XMLHttpRequest rather than fetch purely
 * because fetch still cannot report upload progress, and a video upload with no progress bar
 * reads as frozen.
 */
export function putToSignedUrl(slot: UploadSlot, file: File, onProgress?: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", slot.upload_url, true);
    for (const [k, v] of Object.entries(slot.headers ?? {})) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status}). Please try again.`));
    };
    xhr.onerror = () => reject(new Error("Upload failed — check your connection and try again."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    xhr.send(file);
  });
}

/** Reads a video's duration without uploading it, so a too-long file is caught before any bytes move. */
export function videoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file doesn't look like a video we can read."));
    };
    video.src = url;
  });
}

/**
 * Grabs a frame to use as the thumbnail. uploadPost requires one, and asking a member to supply
 * a separate image would be a worse flow than taking a frame from what they already chose.
 */
export function videoThumbnail(file: File, atSeconds = 1): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const fail = (m: string) => { URL.revokeObjectURL(url); reject(new Error(m)); };

    video.onloadedmetadata = () => {
      // A frame at 1s is usually more representative than frame zero, which is often black —
      // but never seek past the end of a very short clip.
      video.currentTime = Math.min(atSeconds, Math.max(0, (video.duration || 1) - 0.1));
    };
    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return fail("Couldn't create a thumbnail for that video.");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (blob) resolve(blob);
        else reject(new Error("Couldn't create a thumbnail for that video."));
      }, "image/jpeg", 0.8);
    };
    video.onerror = () => fail("That file doesn't look like a video we can read.");
    video.src = url;
  });
}

export { API_BASE };
