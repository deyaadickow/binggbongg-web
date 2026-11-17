// The browser camera for Stories and for replying to a comment with a video (Steve, 2026-11-17).
// getUserMedia for the preview, a canvas frame for a photo, MediaRecorder for a video (up to
// `maxSeconds`, stopping itself there). The camera and microphone are released the moment this
// closes, so nothing is left recording or playing behind it.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "../lib/i18n";
import { formatDuration } from "../lib/commentMedia";

export interface Capture {
  kind: "photo" | "video";
  blob: Blob;
  ext: string;
  contentType: string;
  duration?: number;
  thumb?: Blob;
}

function pickMime(): string {
  const options = ["video/mp4;codecs=avc1,mp4a", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  for (const m of options) if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(m)) return m;
  return "";
}

function frame(video: HTMLVideoElement, quality = 0.85): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 720;
  canvas.height = video.videoHeight || 1280;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
}

export function cameraSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

export function CameraCapture({ allowPhoto, maxSeconds, onDone, onCancel, overlay }: {
  allowPhoto: boolean;
  maxSeconds: number;
  onDone: (c: Capture) => void;
  onCancel: () => void;
  /** Drawn over the preview — e.g. the comment being replied to. */
  overlay?: ReactNode;
}) {
  const { t } = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const thumbRef = useRef<Blob | null>(null);
  const startedAt = useRef(0);
  /** Cancel / closing: a recording that stops because of that is thrown away, not handed back. */
  const discard = useRef(false);
  const timer = useRef(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 1280 } }, audio: true });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        }
        if (!alive) { stream.getTracks().forEach((tr) => tr.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => undefined); }
        setReady(true);
      } catch {
        if (alive) setError(t("soc_camera_blocked"));
      }
    })();
    return () => {
      alive = false;
      discard.current = true;
      window.clearInterval(timer.current);
      try { if (recRef.current?.state === "recording") recRef.current.stop(); } catch { /* already stopped */ }
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function takePhoto() {
    const v = videoRef.current;
    if (!v) return;
    const b = await frame(v, 0.9);
    if (b) onDone({ kind: "photo", blob: b, ext: "jpg", contentType: "image/jpeg" });
  }

  async function startRec() {
    const stream = streamRef.current;
    const v = videoRef.current;
    if (!stream || !v || recording) return;
    thumbRef.current = await frame(v, 0.8);
    const mime = pickMime();
    let rec: MediaRecorder;
    try { rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); } catch { setError(t("soc_cant_record")); return; }
    chunks.current = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    rec.onstop = () => {
      const type = (rec.mimeType || mime || "video/webm").split(";")[0];
      const blob = new Blob(chunks.current, { type });
      const duration = Math.min(maxSeconds, (Date.now() - startedAt.current) / 1000);
      if (!discard.current && blob.size && duration >= 0.8) {
        onDone({ kind: "video", blob, ext: type.includes("mp4") ? "mp4" : "webm", contentType: type, duration, thumb: thumbRef.current ?? undefined });
      }
    };
    recRef.current = rec;
    rec.start(250);
    startedAt.current = Date.now();
    setSeconds(0);
    setRecording(true);
    timer.current = window.setInterval(() => {
      const s = (Date.now() - startedAt.current) / 1000;
      setSeconds(s);
      if (s >= maxSeconds) stopRec();
    }, 200);
  }

  function stopRec() {
    window.clearInterval(timer.current);
    setRecording(false);
    try { if (recRef.current?.state === "recording") recRef.current.stop(); } catch { /* already stopped */ }
  }

  return (
    <div className="cam-capture">
      <div className="cam-frame">
        <video ref={videoRef} muted playsInline autoPlay className="cam-video" />
        {overlay}
        {recording && (
          <div className="cam-timer"><span style={{ color: "#e53935" }}>●</span> {formatDuration(seconds)} / {formatDuration(maxSeconds)}</div>
        )}
        {!ready && !error && <div className="cam-msg">{t("loading")}</div>}
        {error && <div className="cam-msg">{error}</div>}
      </div>
      <div className="cam-controls">
        <button className="btn" onClick={() => { discard.current = true; stopRec(); onCancel(); }}>{t("cancel")}</button>
        {allowPhoto && !recording && <button className="btn" disabled={!ready} onClick={() => void takePhoto()}>📷 {t("soc_photo")}</button>}
        {recording
          ? <button className="btn gold" onClick={stopRec}>■ {t("soc_stop")}</button>
          : <button className="btn gold" disabled={!ready} onClick={() => void startRec()}>● {t("soc_record")}</button>}
      </div>
    </div>
  );
}
