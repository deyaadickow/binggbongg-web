// The recorder behind "Use this sound", Duet and Stitch (Steve, 2026-11-16: "Build Duet, Stitch
// and sounds on all 3 platforms"). Built the same way as the Green Screen: everything is drawn
// onto one canvas and THAT canvas is recorded, so the file is exactly what the member saw.
//
//   /record/sound/:id   webcam full frame (720x1280) while the sound plays; the sound is mixed
//                       into the recording with WebAudio, then uploaded with that sound_id.
//   /record/duet/:id    webcam LEFT, the original RIGHT, 720x640 (each half 360x640, aspect-fill);
//                       audio = the original + the mic. Stops at the original's end (cap 60 s).
//   /record/stitch/:id  pick up to 5 s of the original first, then ONE continuous 720x1280
//                       recording: that clip (with its own sound), then the webcam (with the mic).
//
// The output is MP4/H.264 only (pickMime, same rule as the Green Screen): iPhones cannot play
// WebM, so a browser that can only record WebM gets a "not supported" note instead of a post
// half the audience could never watch.
//
// The originals live on CloudFront. Its CORS is NOT dependable (checked 2026-11-16): the edge
// caches range responses with or without Access-Control-Allow-Origin depending on who asked
// first, ignores the query string in its cache key, and the browser cache reuses the feed
// player's non-CORS copy. A crossOrigin <video> therefore failed with "Format error" on one file
// and worked on another. So the original is fetched ONCE as a blob (a plain CORS fetch, which did
// get the header) and played from memory — no later range request can fail mid-recording, and a
// blob: URL never taints the canvas. A crossOrigin load is only the fallback.
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchPostsBySound, mediaUrl, post, remixAllowed, type Post, type Sound } from "../lib/api";
import { useSession } from "../lib/session";
import { Notice } from "../components/Common";
import { PageTitle } from "../components/PageTitle";
import { corsUrl, drawCover, fmt, loadCrossOrigin, pickMime, waitSeek } from "../lib/videoKit";

type Mode = "sound" | "duet" | "stitch";
const MAX_SECONDS = 60;
const STITCH_MAX = 5;
const HIDDEN_MEDIA = { position: "absolute", left: 0, top: 0, width: 2, height: 2, opacity: 0.01, pointerEvents: "none" } as const;

export function RemixRecorderPage() {
  const { mode: modeParam, id } = useParams();
  const mode: Mode = modeParam === "duet" || modeParam === "stitch" ? modeParam : "sound";
  const targetId = Number(id);
  const navigate = useNavigate();
  const { user, isLoggedIn } = useSession();

  // Dev-only test path: ?debugcam=<video url> stands in for the webcam (the built-in test
  // browser has no camera). Never active in a production build.
  const debugCam = import.meta.env.DEV ? new URLSearchParams(window.location.search).get("debugcam") : null;

  const W = 720;
  const H = mode === "duet" ? 640 : 1280;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<HTMLVideoElement>(null);
  const origRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const trimRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const destRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const micGainRef = useRef<GainNode | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const thumbRef = useRef<Blob | null>(null);
  const blobUrlsRef = useRef<string[]>([]);
  /** Stitch: true while the chosen clip is being drawn, false once the webcam has taken over. */
  const clipPhaseRef = useRef(false);
  const clipRef = useRef({ start: 0, len: STITCH_MAX });

  const [mime] = useState(pickMime);
  const [original, setOriginal] = useState<Post | null>(null);
  const [sound, setSound] = useState<Sound | null>(null);
  const [phase, setPhase] = useState<"loading" | "trim" | "ready" | "recording" | "done" | "error">("loading");
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<{ file: File; url: string; duration: number } | null>(null);
  const [origDuration, setOrigDuration] = useState(0);
  const [clipStart, setClipStart] = useState(0);
  const [clipLen, setClipLen] = useState(STITCH_MAX);
  const [mediaReady, setMediaReady] = useState(false);
  const [camReady, setCamReady] = useState(false);
  clipRef.current = { start: clipStart, len: clipLen };

  const fail = useCallback((m: string) => { setError(m); setPhase("error"); }, []);

  // ---- What is being remixed ----
  useEffect(() => {
    const me = user?.id ?? (debugCam ? 0 : null);
    if (me === null || !targetId) return;
    let alive = true;
    (async () => {
      try {
        if (mode === "sound") {
          const r = await fetchPostsBySound(targetId, 0, 1, me || undefined);
          if (!alive) return;
          if (!r.sound?.sound) throw new Error("That sound isn't available.");
          setSound(r.sound);
        } else {
          const res = await post<Post | Post[]>("fetchPostById", { post_id: targetId, ...(me ? { my_user_id: me, user_id: me } : {}) });
          const data = Array.isArray(res.data) ? res.data[0] : res.data;
          if (!alive) return;
          if (!res.status || !data?.video) throw new Error(res.message || "That video isn't available.");
          if (!remixAllowed(data, mode)) throw new Error(`The creator turned off ${mode === "duet" ? "Duet" : "Stitch"} for that video.`);
          setOriginal(data);
        }
      } catch (e) {
        if (alive) fail((e as Error).message);
      }
    })();
    return () => { alive = false; };
  }, [mode, targetId, user?.id, debugCam]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Load the original video / the sound into its element ----
  useEffect(() => {
    const el: HTMLMediaElement | null = mode === "sound" ? audioRef.current : origRef.current;
    const src = mode === "sound" ? sound?.sound : original?.video;
    if (!el || !src) return;
    let alive = true;
    loadCrossOrigin(el, mediaUrl(src), (u) => blobUrlsRef.current.push(u))
      .then(() => {
        if (!alive) return;
        setOrigDuration(Number.isFinite(el.duration) ? el.duration : 0);
        setMediaReady(true);
        if (mode === "stitch") {
          const tv = trimRef.current;
          if (tv) { tv.src = el.currentSrc || el.src; tv.load(); }
          setPhase("trim");
        }
      })
      .catch((e) => { if (alive) fail((e as Error).message); });
    return () => { alive = false; };
  }, [mode, sound?.sound, original?.video, fail]);

  // ---- Camera + microphone (or the dev stand-in) ----
  useEffect(() => {
    if ((!isLoggedIn && !debugCam) || !mime) return;
    let alive = true;
    (async () => {
      const cam = camRef.current!;
      try {
        if (debugCam) {
          cam.crossOrigin = "anonymous";
          cam.src = corsUrl(debugCam);
          cam.loop = true;
          cam.muted = true;
          await cam.play();
        } else {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: { echoCancellation: true, noiseSuppression: true },
          });
          if (!alive) { stream.getTracks().forEach((tr) => tr.stop()); return; }
          streamRef.current = stream;
          cam.srcObject = stream;
          await cam.play().catch(() => undefined);
        }
        if (alive) setCamReady(true);
      } catch {
        if (alive) fail("Please allow the camera and microphone to record.");
      }
    })();
    return () => { alive = false; };
  }, [isLoggedIn, mime, debugCam, fail]);

  useEffect(() => {
    if (mode !== "stitch" && mediaReady && camReady) setPhase((p) => (p === "loading" ? "ready" : p));
  }, [mode, mediaReady, camReady]);

  // ---- Everything stops when the page closes ----
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    void ctxRef.current?.close().catch(() => undefined);
    blobUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  // ---- The canvas: drawn every frame, recorded while recording ----
  useEffect(() => {
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const canvas = canvasRef.current;
      const cam = camRef.current;
      if (!canvas || !cam) return;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const camOk = cam.readyState >= 2 && cam.videoWidth > 0;
      const orig = origRef.current;
      const origOk = !!orig && orig.readyState >= 2 && orig.videoWidth > 0;
      const mirror = !debugCam;
      if (mode === "duet") {
        if (camOk) drawCover(ctx, cam, cam.videoWidth, cam.videoHeight, 0, 0, W / 2, H, mirror);
        if (origOk) drawCover(ctx, orig!, orig!.videoWidth, orig!.videoHeight, W / 2, 0, W / 2, H);
        ctx.fillStyle = "#D4AF37";
        ctx.fillRect(W / 2 - 1, 0, 2, H);
      } else if (mode === "stitch" && clipPhaseRef.current) {
        if (origOk) drawCover(ctx, orig!, orig!.videoWidth, orig!.videoHeight, 0, 0, W, H);
      } else if (camOk) {
        drawCover(ctx, cam, cam.videoWidth, cam.videoHeight, 0, 0, W, H, mirror);
      }

      // Stitch: the clip's end hands over to the webcam, in the same recording.
      if (mode === "stitch" && clipPhaseRef.current && orig) {
        const { start, len } = clipRef.current;
        if (orig.currentTime >= start + len - 0.03 || orig.ended) {
          orig.pause();
          clipPhaseRef.current = false;
          if (micGainRef.current) micGainRef.current.gain.value = 1;
        }
      }

      if (recRef.current?.state === "recording" && !thumbRef.current) {
        const secs = (performance.now() - startedAtRef.current) / 1000;
        if (secs >= 1) {
          thumbRef.current = new Blob(); // claim the slot so only one snapshot is taken
          canvas.toBlob((b) => { if (b) thumbRef.current = b; }, "image/jpeg", 0.85);
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [mode, W, H, debugCam]);

  /** WebAudio graph, made once on the first Record tap (a user gesture, so it may start):
   *  original/sound -> speakers + recording; mic -> recording only (never the speakers). */
  function audioGraph(): MediaStreamAudioDestinationNode {
    if (destRef.current && ctxRef.current) { void ctxRef.current.resume(); return destRef.current; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new AC();
    const dest = ac.createMediaStreamDestination();
    const media = mode === "sound" ? audioRef.current : origRef.current;
    if (media) {
      media.muted = false;
      const src = ac.createMediaElementSource(media);
      src.connect(dest);
      src.connect(ac.destination);
    }
    const mic = streamRef.current;
    if (mic && mic.getAudioTracks().length) {
      const gain = ac.createGain();
      gain.gain.value = 1;
      ac.createMediaStreamSource(mic).connect(gain);
      gain.connect(dest);
      micGainRef.current = gain;
    }
    ctxRef.current = ac;
    destRef.current = dest;
    void ac.resume();
    return dest;
  }

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    origRef.current?.pause();
    audioRef.current?.pause();
  }, []);

  useEffect(() => {
    if (phase !== "recording") return;
    const id = window.setInterval(() => {
      const s = (performance.now() - startedAtRef.current) / 1000;
      setElapsed(s);
      if (s >= MAX_SECONDS) stop();
    }, 250);
    return () => window.clearInterval(id);
  }, [phase, stop]);

  async function start() {
    const canvas = canvasRef.current;
    if (!canvas || !mime) return;
    const dest = audioGraph();
    const media = mode === "sound" ? audioRef.current : origRef.current;
    if (media) {
      media.loop = false;
      media.onended = mode === "stitch" ? null : () => stop();
      await waitSeek(media, mode === "stitch" ? clipRef.current.start : 0);
    }
    if (mode === "stitch") {
      clipPhaseRef.current = true;
      if (micGainRef.current) micGainRef.current.gain.value = 0; // the clip carries its own sound
    }

    const out = canvas.captureStream(30);
    dest.stream.getAudioTracks().forEach((tr) => out.addTrack(tr));
    const rec = new MediaRecorder(out, { mimeType: mime, videoBitsPerSecond: mode === "duet" ? 4_000_000 : 6_000_000, audioBitsPerSecond: 128_000 });
    chunksRef.current = [];
    thumbRef.current = null;
    rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      const duration = (performance.now() - startedAtRef.current) / 1000;
      const blob = new Blob(chunksRef.current, { type: "video/mp4" });
      const file = new File([blob], `${mode}-${Date.now()}.mp4`, { type: "video/mp4" });
      clipPhaseRef.current = false;
      if (import.meta.env.DEV) (window as unknown as { __remixResult?: unknown }).__remixResult = { blob, duration, mime };
      setResult({ file, url: URL.createObjectURL(blob), duration });
      setPhase("done");
    };
    recRef.current = rec;
    startedAtRef.current = performance.now();
    setElapsed(0);
    rec.start(1000);
    if (media) await media.play().catch(() => undefined);
    setPhase("recording");
  }

  function retake() {
    if (result) URL.revokeObjectURL(result.url);
    setResult(null);
    setElapsed(0);
    setPhase(mode === "stitch" ? "trim" : "ready");
  }

  async function next() {
    if (!result) return;
    let thumb = thumbRef.current;
    if (!thumb || !thumb.size) {
      thumb = await new Promise<Blob | null>((res) => canvasRef.current?.toBlob(res, "image/jpeg", 0.85) ?? res(null));
    }
    const remix = mode === "sound"
      ? { soundId: sound?.id ?? targetId, soundTitle: sound?.title ?? "" }
      : { type: mode, postId: original!.id, userName: original!.user?.username ?? original!.user?.fullname ?? "",
          soundId: mode === "duet" ? (original!.sound_id ?? original!.sound?.id ?? null) : null };
    navigate("/upload", { state: { greenScreen: { file: result.file, duration: result.duration, thumb }, remix } });
  }

  // ---- Stitch trim preview: plays the chosen piece on the trim video, then stops ----
  function previewClip() {
    const tv = trimRef.current;
    if (!tv) return;
    tv.currentTime = clipStart;
    void tv.play().catch(() => undefined);
  }
  useEffect(() => {
    const tv = trimRef.current;
    if (!tv || phase !== "trim") return;
    const onTime = () => { if (tv.currentTime >= clipStart + clipLen) tv.pause(); };
    tv.addEventListener("timeupdate", onTime);
    return () => tv.removeEventListener("timeupdate", onTime);
  }, [phase, clipStart, clipLen]);
  useEffect(() => {
    const tv = trimRef.current;
    if (tv && phase === "trim" && tv.readyState >= 1) { tv.pause(); tv.currentTime = clipStart; }
  }, [clipStart, phase]);

  const title = mode === "duet" ? "Duet" : mode === "stitch" ? "Stitch" : "Use this sound";
  const backTo = mode === "sound" ? `/sound/${targetId}` : `/video/${targetId}`;

  if ((!isLoggedIn || !user) && !debugCam) {
    return <div className="page"><PageTitle>{title}</PageTitle><Notice>Sign in to record.</Notice></div>;
  }
  if (!mime) {
    return (
      <div className="page" style={{ maxWidth: 520 }}>
        <PageTitle backTo={backTo}>{title}</PageTitle>
        <Notice>This browser can't record videos that play on every phone. Please use Chrome, Edge or Safari, or the Bingg Bongg app.</Notice>
      </div>
    );
  }

  const recording = phase === "recording";
  const maxStart = Math.max(0, origDuration - 0.5);
  const lenMax = Math.max(0.5, Math.min(STITCH_MAX, origDuration - clipStart));
  const ownerName = original?.user?.username ? `@${original.user.username}` : original?.user?.fullname ?? "";
  const goldBtn = { background: "var(--gold-border)", color: "#000", borderColor: "var(--gold-border)" } as const;

  return (
    <div className="page" style={{ maxWidth: mode === "duet" ? 640 : 520 }}>
      <PageTitle backTo={backTo}>{title}</PageTitle>

      {mode === "sound" && sound && (
        <div style={{ color: "var(--gold)", fontWeight: 700, textAlign: "center", marginBottom: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          ♪ {sound.title || "Sound"}
        </div>
      )}
      {mode !== "sound" && ownerName && (
        <div style={{ color: "var(--gold)", fontWeight: 700, textAlign: "center", marginBottom: 10 }}>
          {mode === "duet" ? `Duet with ${ownerName}` : `Stitch from ${ownerName}`}
        </div>
      )}

      <audio ref={audioRef} playsInline style={{ display: "none" }} />

      {/* Stitch, step 1: choose the piece of the original. */}
      <div style={{ display: phase === "trim" ? "block" : "none" }}>
        <div style={{ width: "100%", maxWidth: 360, margin: "0 auto", aspectRatio: "9 / 16", borderRadius: 14, overflow: "hidden",
          border: "2px solid var(--gold-border)", background: "#000" }}>
          <video ref={trimRef} playsInline style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        </div>
        <div className="card pad" style={{ marginTop: 12 }}>
          <div className="soft" style={{ fontSize: 13, marginBottom: 6 }}>
            Start at <b style={{ color: "var(--gold)" }}>{clipStart.toFixed(1)} s</b> · length <b style={{ color: "var(--gold)" }}>{clipLen.toFixed(1)} s</b> (up to {STITCH_MAX} s)
          </div>
          <label className="muted" style={{ fontSize: 12 }}>Start</label>
          <input type="range" min={0} max={maxStart} step={0.1} value={clipStart} aria-label="Start"
            onChange={(e) => { const s = Number(e.target.value); setClipStart(s); setClipLen((l) => Math.min(l, Math.max(0.5, Math.min(STITCH_MAX, origDuration - s)))); }}
            style={{ width: "100%", accentColor: "var(--gold)" }} />
          <label className="muted" style={{ fontSize: 12 }}>Length</label>
          <input type="range" min={0.5} max={lenMax} step={0.1} value={Math.min(clipLen, lenMax)} aria-label="Length"
            onChange={(e) => setClipLen(Number(e.target.value))}
            style={{ width: "100%", accentColor: "var(--gold)" }} />
          <div className="row" style={{ justifyContent: "center", gap: 10, marginTop: 10 }}>
            <button className="btn ghost" onClick={previewClip}>▶ Preview</button>
            <button className="btn" style={goldBtn} disabled={!camReady}
              onClick={() => { trimRef.current?.pause(); setClipLen((l) => Math.min(l, lenMax)); setPhase("ready"); }}>
              Next
            </button>
          </div>
        </div>
      </div>

      {/* The recording frame. */}
      <div style={{ display: phase === "trim" ? "none" : "block" }}>
        <div style={{ position: "relative", width: "100%", maxWidth: mode === "duet" ? 640 : 400, margin: "0 auto",
          aspectRatio: mode === "duet" ? "720 / 640" : "9 / 16", borderRadius: 14, overflow: "hidden",
          border: "2px solid var(--gold-border)", background: "#000" }}>
          {/* Sources at 2px and nearly transparent: Chrome pauses a video it thinks is hidden. */}
          <video ref={camRef} muted playsInline style={HIDDEN_MEDIA} />
          <video ref={origRef} playsInline muted style={HIDDEN_MEDIA} />
          <canvas ref={canvasRef} width={W} height={H}
            style={{ width: "100%", height: "100%", display: phase === "done" ? "none" : "block" }} />
          {phase === "done" && result && (
            <video src={result.url} controls autoPlay loop playsInline style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }} />
          )}
          {(phase === "loading" || phase === "error") && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
              <span className="soft">{phase === "loading" ? "Getting ready…" : error}</span>
            </div>
          )}
          {recording && (
            <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,.6)",
              color: "#fff", borderRadius: 999, padding: "4px 12px", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
              <span style={{ color: "var(--red, #e33)" }}>●</span> {fmt(elapsed)} / {fmt(MAX_SECONDS)}
            </div>
          )}
        </div>

        {phase !== "done" && phase !== "error" && (
          <div style={{ display: "flex", justifyContent: "center", margin: "14px 0" }}>
            <button aria-label={recording ? "Stop" : "Record"} disabled={phase !== "ready" && !recording}
              onClick={() => (recording ? stop() : void start())}
              style={{ width: 74, height: 74, borderRadius: "50%", border: "4px solid var(--gold-border)", background: "transparent",
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: phase === "ready" || recording ? 1 : 0.4 }}>
              <span style={{ width: recording ? 28 : 54, height: recording ? 28 : 54, borderRadius: recording ? 6 : "50%", background: "var(--red, #e33)", transition: "all .15s" }} />
            </button>
          </div>
        )}
        {phase === "ready" && (
          <p className="muted" style={{ textAlign: "center", fontSize: 12, marginTop: -6 }}>
            {mode === "duet" ? "Tap to record — the video plays from the start with its sound. Headphones help."
              : mode === "stitch" ? "Tap to record — your clip plays first, then it's you."
              : "Tap to record — the sound plays while you record. Headphones help."}
            {" "}Up to {MAX_SECONDS} s.
          </p>
        )}
        {phase === "ready" && mode === "stitch" && (
          <div style={{ textAlign: "center" }}><button className="btn ghost small" onClick={() => setPhase("trim")}>Change the clip</button></div>
        )}
        {phase === "done" && (
          <div className="row" style={{ justifyContent: "center", gap: 10, margin: "14px 0" }}>
            <button className="btn ghost" onClick={retake}>Retake</button>
            <button className="btn" onClick={next} style={goldBtn}>Next</button>
          </div>
        )}
        {phase === "error" && (
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <button className="btn ghost" onClick={() => navigate(backTo)}>Back</button>
          </div>
        )}
      </div>
    </div>
  );
}
