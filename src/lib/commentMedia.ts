// Photo, video and voice-message comments (Steve, 2026-11-16: "When leaving a comment, Give
// everyone the ability to upload a photo, upload a video, upload an imoji, upload a voice
// message.")
//
// The file goes up exactly like a post: a pre-signed S3 url from createUploadUrls, a PUT from
// the browser, then the KEY rides on addCommentOnPost. The server moderates it there (PhotoDNA +
// Hive for photos and video stills, Hive for video, a transcribe-and-classify pass for voice)
// before the comment is saved, so nothing here pretends to moderate.
import { createUploadUrls, putToSignedUrl, videoDuration, videoThumbnail } from "./upload";

export type CommentMediaType = "photo" | "video" | "voice";

/** The server's own caps, checked here first so nothing too big is uploaded just to be refused. */
export const COMMENT_MEDIA_MAX_SECONDS = 60;
const MAX_BYTES: Record<CommentMediaType, number> = {
  photo: 20 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  voice: 10 * 1024 * 1024,
};

/** An attachment picked or recorded but not sent yet. */
export interface PendingMedia {
  type: CommentMediaType;
  blob: Blob;
  ext: string;
  contentType: string;
  /** An object URL for the preview chip. Revoke it with discardPending. */
  previewUrl: string;
  duration?: number;
  width?: number;
  height?: number;
  thumb?: Blob;
}

/** What addCommentOnPost needs once the files are up. */
export interface UploadedMedia {
  media_type: CommentMediaType;
  media_path: string;
  media_thumbnail?: string;
  media_duration?: number;
  media_width?: number;
  media_height?: number;
}

const PHOTO_EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp",
  "image/gif": "gif", "image/heic": "heic", "image/heif": "heic",
};
const VIDEO_EXT: Record<string, string> = {
  "video/mp4": "mp4", "video/quicktime": "mov", "video/x-m4v": "m4v", "video/webm": "webm",
};

function extFromName(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : "";
}

export function discardPending(p: PendingMedia | null) {
  if (p) URL.revokeObjectURL(p.previewUrl);
}

export function formatDuration(seconds?: number | null): string {
  const s = Math.max(0, Math.round(seconds ?? 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function imageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = url;
  });
}

export async function preparePhoto(file: File): Promise<PendingMedia> {
  const ext = PHOTO_EXT[file.type] || extFromName(file.name);
  if (!Object.values(PHOTO_EXT).includes(ext)) throw new Error("That file doesn't look like a photo.");
  if (file.size > MAX_BYTES.photo) throw new Error("That photo is too large. Please pick one under 20 MB.");
  const previewUrl = URL.createObjectURL(file);
  const { width, height } = await imageSize(previewUrl);
  return { type: "photo", blob: file, ext, contentType: file.type || "image/jpeg", previewUrl, width, height };
}

export async function prepareVideo(file: File): Promise<PendingMedia> {
  const ext = VIDEO_EXT[file.type] || extFromName(file.name);
  if (!Object.values(VIDEO_EXT).includes(ext)) throw new Error("That file doesn't look like a video.");
  if (file.size > MAX_BYTES.video) throw new Error("That video is too large. Please pick one under 100 MB.");
  const duration = await videoDuration(file);
  if (duration > COMMENT_MEDIA_MAX_SECONDS + 1) {
    throw new Error("Videos in comments can be at most one minute long.");
  }
  const thumb = await videoThumbnail(file, 0.5);
  const previewUrl = URL.createObjectURL(thumb);
  const { width, height } = await imageSize(previewUrl);
  return {
    type: "video", blob: file, ext, contentType: file.type || "video/mp4",
    previewUrl, duration, width, height, thumb,
  };
}

function uniqueName(ext: string): string {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "")
    : `${Date.now()}${Math.random().toString(36).slice(2)}`;
  return `comment_${id}.${ext}`;
}

/** Puts the attachment (and a video's still) on S3 and returns the fields for addCommentOnPost. */
export async function uploadPending(
  userId: number,
  p: PendingMedia,
  onProgress?: (fraction: number) => void,
): Promise<UploadedMedia> {
  const files = [{ file_name: uniqueName(p.ext), content_type: p.contentType }];
  if (p.thumb) files.push({ file_name: uniqueName("jpg"), content_type: "image/jpeg" });
  const slots = await createUploadUrls(userId, files);
  if (slots.length !== files.length) throw new Error("Couldn't prepare the upload.");

  const asFile = (b: Blob, name: string, type: string) =>
    b instanceof File ? b : new File([b], name, { type });
  if (p.thumb) {
    await putToSignedUrl(slots[1], asFile(p.thumb, slots[1].file_name, "image/jpeg"));
  }
  await putToSignedUrl(slots[0], asFile(p.blob, slots[0].file_name, p.contentType), onProgress);

  return {
    media_type: p.type,
    media_path: slots[0].key,
    media_thumbnail: p.thumb ? slots[1].key : undefined,
    media_duration: p.duration != null ? Math.round(p.duration) : undefined,
    media_width: p.width || undefined,
    media_height: p.height || undefined,
  };
}

// ---- Voice messages -------------------------------------------------------------------------
//
// MediaRecorder gives webm/opus in Chrome and mp4 in Safari, and neither plays everywhere (an
// iPhone will not play webm). So the recording is decoded and re-encoded here as 16 kHz mono
// WAV: every phone, every browser and the server's moderation can read it, and a minute is
// under 2 MB.

const VOICE_RATE = 16000;

function encodeWav(samples: Float32Array, rate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

async function toWav(recorded: Blob): Promise<{ wav: Blob; duration: number }> {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(await recorded.arrayBuffer());
    const length = Math.max(1, Math.ceil(decoded.duration * VOICE_RATE));
    const offline = new OfflineAudioContext(1, length, VOICE_RATE);
    const src = offline.createBufferSource();
    src.buffer = decoded;   // a stereo source is mixed down to the 1-channel destination
    src.connect(offline.destination);
    src.start();
    const rendered = await offline.startRendering();
    return { wav: encodeWav(rendered.getChannelData(0), VOICE_RATE), duration: decoded.duration };
  } finally {
    void ctx.close();
  }
}

/** Hold-to-record. start() asks for the microphone; stop() returns the clip, or null if it was too short. */
export class VoiceRecorder {
  private rec: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;

  static supported(): boolean {
    return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
  }

  get elapsed(): number {
    return this.startedAt ? (Date.now() - this.startedAt) / 1000 : 0;
  }

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.rec = new MediaRecorder(this.stream);
    this.rec.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.rec.start();
    this.startedAt = Date.now();
  }

  private release() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.rec = null;
    this.startedAt = 0;
  }

  cancel() {
    try { this.rec?.stop(); } catch { /* already stopped */ }
    this.release();
  }

  async stop(): Promise<PendingMedia | null> {
    const rec = this.rec;
    if (!rec) return null;
    const elapsed = this.elapsed;
    const done = new Promise<void>((resolve) => { rec.onstop = () => resolve(); });
    rec.stop();
    await done;
    const type = rec.mimeType || "audio/webm";
    this.release();
    if (elapsed < 0.8) return null;   // a tap, not a message
    const { wav, duration } = await toWav(new Blob(this.chunks, { type }));
    return {
      type: "voice", blob: wav, ext: "wav", contentType: "audio/wav",
      previewUrl: URL.createObjectURL(wav),
      duration: Math.min(duration, COMMENT_MEDIA_MAX_SECONDS),
    };
  }
}
