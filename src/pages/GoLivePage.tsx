import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { post } from "../lib/api";
import { useSession } from "../lib/session";
import { Notice } from "../components/Common";

/** Camera preview + one button — same startLive endpoint the phones call, then the room page as host. */
export function GoLivePage() {
  const { user, isLoggedIn } = useSession();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user" }, audio: true })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch((e) => setPreviewError(`Camera or microphone not available: ${(e as Error).message}`));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [isLoggedIn]);

  async function goLive() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const res = await post<unknown>("startLive", { user_id: user.id });
      const roomName = (res as { room_name?: string }).room_name;
      if (!res.status || !roomName) throw new Error(res.message ?? "Couldn't start the stream.");
      streamRef.current?.getTracks().forEach((t) => t.stop()); // the room takes the camera over
      navigate(`/live/${encodeURIComponent(roomName)}?host=1`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (!isLoggedIn) return <div className="page"><Notice>Sign in to go live. <Link to="/login">Sign in</Link></Notice></div>;

  return (
    <div className="page" style={{ maxWidth: 560 }}>
      <h1 className="page-title">Go Live</h1>
      <div className="card" style={{ aspectRatio: "9 / 12", background: "#000", display: "grid", placeItems: "center" }}>
        {previewError ? <p className="muted center" style={{ padding: 20 }}>{previewError}</p> : <video ref={videoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
      </div>
      {error && <div style={{ marginTop: 12 }}><Notice error>{error}</Notice></div>}
      <button className="btn block" style={{ marginTop: 14, minHeight: 52, fontSize: 17 }} onClick={goLive} disabled={busy}>
        {busy ? "Starting…" : "Go Live"}
      </button>
      {previewError && <p className="muted center" style={{ fontSize: 13, marginTop: 8 }}>You can still go live and turn the camera on from inside the room once the browser allows it.</p>}
      <p className="muted center" style={{ fontSize: 13, marginTop: 8 }}>Your followers see you in Live Now the moment you start. Viewers can ask to join; you approve them from the room.</p>
    </div>
  );
}
