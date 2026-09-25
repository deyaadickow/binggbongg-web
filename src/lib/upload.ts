// Uploading from the browser. The clients hold no AWS credentials any more (they were removed
// on 2026-09-24 after Google Play flagged them), so every upload is the same three steps:
//
//   1. ask the backend for a pre-signed S3 PUT url  (createUploadUrls)
//   2. PUT the bytes straight to S3 from here
//   3. tell the backend the key it landed under     (uploadPost / uploadPhoto / ...)
//
// Nothing here ever sees a credential — the signed url IS the permission, and it expires.
import { API_BASE, post } from "./api";

/**
 * What to tell a member when an upload fails.
 *
 * A bare "Upload failed (500)" tells them nothing and implies they did something wrong. A 5xx
 * or a rejected signed url is our problem, not theirs — on 2026-09-25 every upload on every
 * platform was failing this way because the backend's AWS key had been rotated without updating
 * .env, and the only visible symptom was that number. So say plainly when it is our end, and
 * keep the specifics for the server log, which is where the real answer was.
 *
 * `serverMessage` wins when there is one: the backend writes messages a member can act on
 * ("deposit more to your Ad Cash Account", "this photo was flagged during review").
 */
export function uploadErrorMessage(status: number, serverMessage?: string | null): string {
  const fromServer = serverMessage?.trim();
  if (fromServer) return fromServer;

  if (status === 0) return "Upload failed — check your connection and try again.";
  if (status === 401 || status === 403) {
    // A 403 here is the signed url or our credentials being refused, never the member.
    return "Uploading isn't working right now. Please try again in a few minutes.";
  }
  if (status === 413) return "That file is too large to upload.";
  if (status === 429) return "Too many uploads just now — give it a minute and try again.";
  if (status >= 500) return "Uploading isn't working right now. Please try again shortly.";
  return "Upload failed. Please try again.";
}

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
      else reject(new Error(uploadErrorMessage(xhr.status)));
    };
    xhr.onerror = () => reject(new Error(uploadErrorMessage(0)));
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
