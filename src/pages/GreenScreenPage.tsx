// Green Screen (Steve, 2026-10-30: "Build the green screen for feed videos on all platforms" —
// after showing a TikTok where a man talks in front of a background video "without any
// distortion of the man"). The webcam is cut out by MediaPipe's selfie segmenter and drawn over
// a chosen background on one 720x1280 canvas; that canvas is what gets recorded, so the file is
// exactly what the member saw. The finished clip goes to /upload like any picked video.
//
// The no-distortion rules, the same on all three platforms:
//  - the camera frame and the background are each drawn ASPECT-FILL (one uniform scale, the
//    overflow cropped) — never stretched to the canvas's shape;
//  - the mask is drawn with the camera frame's exact rectangle, so it lines up pixel for pixel;
//  - the mask is smoothed over time and softened at the edge, so the outline doesn't shimmer.
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ImageSegmenter } from "@mediapipe/tasks-vision";
import { mediaUrl, post } from "../lib/api";
import { useSession } from "../lib/session";
import { useT } from "../lib/i18n";
import { Notice } from "../components/Common";
import { PageTitle } from "../components/PageTitle";

const W = 720;
const H = 1280;
const MAX_SECONDS = 180;
/** Pinned to the npm package version so the wasm and the JS glue always match. */
const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_URL = "/models/selfie_segmenter.tflite";
const USABLE = /\.(png|jpe?g|gif|webp|mp4|webm)$/i;
const VIDEO_EXT = /\.(mp4|webm)$/i;
const HIDDEN_MEDIA = { position: "absolute", left: 0, top: 0, width: 2, height: 2, opacity: 0.01, pointerEvents: "none" } as const;

interface Background { key: string; title: string; url: string; isVideo: boolean }
interface BgRow { id: number; title?: string | null; file?: string | null }

/** Chrome 126+, Edge and Safari record H.264 MP4; Firefox only records WebM, which iPhones
 *  can't play, so a recording from there would be a dead post on half the audience. */
function pickMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return ["video/mp4;codecs=avc1.42E01F,mp4a.40.2", "video/mp4;codecs=avc1,mp4a.40.2", "video/mp4"]
    .find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

/** Aspect-fill: one scale for both axes, centred, overflow cropped. Never a stretch. */
function cover(sw: number, sh: number, dw: number, dh: number): [number, number, number, number] {
  const s = Math.max(dw / sw, dh / sh);
  const w = sw * s;
  const h = sh * s;
  return [(dw - w) / 2, (dh - h) / 2, w, h];
}

function fmt(sec: number) {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** A video tile only loads its first frame once it scrolls into view — the catalog has ~90. */
function BgTile({ bg, selected, onPick }: { bg: Background; selected: boolean; onPick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setSeen(true); }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return (
    <button ref={ref} onClick={onPick} title={bg.title}
      style={{
        flex: "0 0 auto", width: 66, height: 110, padding: 0, borderRadius: 10, overflow: "hidden", cursor: "pointer",
        border: `2px solid ${selected ? "var(--gold-bright, #FFD84D)" : "var(--gold-border)"}`, background: "#111", position: "relative",
      }}>
      {seen && (bg.isVideo
        ? <video src={`${bg.url}#t=1`} muted playsInline preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <img src={bg.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />)}
      <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, fontSize: 10, lineHeight: "13px", padding: "2px 3px",
        background: "rgba(0,0,0,.65)", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{bg.title}</span>
    </button>
  );
}

export function GreenScreenPage() {
  const { t } = useT();
  const { user, isLoggedIn } = useSession();
  const navigate = useNavigate();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<HTMLVideoElement>(null);
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const segRef = useRef<ImageSegmenter | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const personCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevMaskRef = useRef<Float32Array | null>(null);
  const maskDataRef = useRef<ImageData | null>(null);
  const lastCamTimeRef = useRef(-1);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const thumbRef = useRef<Blob | null>(null);
  const localUrlRef = useRef<string | null>(null);

  const [mime] = useState(pickMime);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [canFlip, setCanFlip] = useState(false);
  const [phase, setPhase] = useState<"loading" | "ready" | "recording" | "done" | "error">("loading");
  const [error, setError] = useState("");
  const [backgrounds, setBackgrounds] = useState<Background[]>([]);
  const [selected, setSelected] = useState<Background | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<{ file: File; url: string; duration: number } | null>(null);

  // ---- Backgrounds: the member's own uploads first, then the Bingg Bongg catalog ----
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const toBg = (r: BgRow): Background | null => {
      const f = r.file ?? "";
      if (!USABLE.test(f)) return null;
      return { key: `r${r.id}`, title: r.title || "Background", url: mediaUrl(f), isVideo: VIDEO_EXT.test(f) };
    };
    Promise.all([
      post<BgRow[]>("fetchMyVirtualBackgrounds", { user_id: user.id }).then((r) => r.data ?? []).catch(() => [] as BgRow[]),
      post<{ virtualBackgrounds?: BgRow[] }>("fetchSettings", { x: 1 }).then((r) => r.data?.virtualBackgrounds ?? []).catch(() => [] as BgRow[]),
    ]).then(([mine, catalog]) => {
      if (!alive) return;
      const list = [...mine, ...catalog].map(toBg).filter((b): b is Background => !!b);
      setBackgrounds(list);
      setSelected((cur) => cur ?? list[0] ?? null);
    });
    return () => { alive = false; };
  }, [user]);

  // ---- The chosen background: a looping muted <video>, or an <img> ----
  useEffect(() => {
    const v = bgVideoRef.current;
    bgImageRef.current = null;
    if (!v) return;
    if (!selected) { v.removeAttribute("src"); v.load(); return; }
    if (selected.isVideo) {
      v.src = selected.url;
      v.play().catch(() => undefined);
    } else {
      v.removeAttribute("src");
      v.load();
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => { bgImageRef.current = img; };
      img.src = selected.url;
    }
  }, [selected]);

  // ---- Camera + microphone ----
  useEffect(() => {
    if (!isLoggedIn || !mime) return;
    let alive = true;
    (async () => {
      try {
        streamRef.current?.getTracks().forEach((tr) => tr.stop());
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
        if (!alive) { stream.getTracks().forEach((tr) => tr.stop()); return; }
        streamRef.current = stream;
        const cam = camRef.current!;
        cam.srcObject = stream;
        await cam.play().catch(() => undefined);
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
        setCanFlip(devices.filter((d) => d.kind === "videoinput").length > 1);
      } catch {
        if (alive) { setError(t("gs_camera_denied")); setPhase("error"); }
      }
    })();
    return () => { alive = false; };
  }, [facing, isLoggedIn, mime, t]);

  // ---- The segmenter (loaded once, on demand, so the rest of the site never pays for it) ----
  useEffect(() => {
    if (!isLoggedIn || !mime) return;
    let alive = true;
    (async () => {
      try {
        const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
        const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
        const make = (delegate: "GPU" | "CPU") => ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: "VIDEO",
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        });
        const seg = await make("GPU").catch(() => make("CPU"));
        if (!alive) { seg.close(); return; }
        segRef.current = seg;
        setPhase((p) => (p === "loading" ? "ready" : p));
      } catch {
        if (alive) { setError(t("gs_unsupported")); setPhase("error"); }
      }
    })();
    return () => { alive = false; segRef.current?.close(); segRef.current = null; };
  }, [isLoggedIn, mime, t]);

  // Stop the camera when leaving the page.
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
  }, []);

  // ---- The draw loop: background, then the cut-out person on top ----
  useEffect(() => {
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const canvas = canvasRef.current;
      const cam = camRef.current;
      if (!canvas || !cam) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Background, aspect-fill.
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      const bv = bgVideoRef.current;
      const bi = bgImageRef.current;
      if (bv && bv.src && bv.readyState >= 2 && bv.videoWidth) {
        ctx.drawImage(bv, ...cover(bv.videoWidth, bv.videoHeight, W, H));
      } else if (bi) {
        ctx.drawImage(bi, ...cover(bi.naturalWidth, bi.naturalHeight, W, H));
      }

      if (cam.readyState < 2 || !cam.videoWidth) return;
      const seg = segRef.current;

      // Segment each NEW camera frame. segmentForVideo calls back synchronously, so the mask
      // below always belongs to the exact frame drawn right after it.
      if (seg && cam.currentTime !== lastCamTimeRef.current) {
        lastCamTimeRef.current = cam.currentTime;
        try {
          seg.segmentForVideo(cam, performance.now(), (res) => {
            const masks = res.confidenceMasks;
            const m = masks?.[masks.length - 1];
            if (!m) return;
            const conf = m.getAsFloat32Array();
            const mw = m.width;
            const mh = m.height;
            let mc = maskCanvasRef.current;
            if (!mc || mc.width !== mw || mc.height !== mh) {
              mc = document.createElement("canvas");
              mc.width = mw;
              mc.height = mh;
              maskCanvasRef.current = mc;
              prevMaskRef.current = null;
              maskDataRef.current = null;
            }
            let prev = prevMaskRef.current;
            if (!prev || prev.length !== conf.length) { prev = new Float32Array(conf); prevMaskRef.current = prev; }
            let data = maskDataRef.current;
            if (!data) {
              data = new ImageData(mw, mh);
              for (let i = 0; i < data.data.length; i += 4) { data.data[i] = 255; data.data[i + 1] = 255; data.data[i + 2] = 255; }
              maskDataRef.current = data;
            }
            const px = data.data;
            for (let i = 0; i < conf.length; i++) {
              // Light temporal smoothing (no flicker), then a smoothstep so the edge is clean
              // instead of a see-through halo.
              const v = conf[i] * 0.7 + prev[i] * 0.3;
              prev[i] = v;
              const x = Math.min(1, Math.max(0, (v - 0.3) / 0.4));
              px[i * 4 + 3] = Math.round(x * x * (3 - 2 * x) * 255);
            }
            mc.getContext("2d")!.putImageData(data, 0, 0);
          });
        } catch { /* a dropped frame just keeps the previous mask */ }
      }

      const mc = maskCanvasRef.current;
      if (!mc) return; // no mask yet: show the background alone rather than an uncut room
      let pc = personCanvasRef.current;
      if (!pc) { pc = document.createElement("canvas"); pc.width = W; pc.height = H; personCanvasRef.current = pc; }
      const p = pc.getContext("2d")!;
      const rect = cover(cam.videoWidth, cam.videoHeight, W, H);
      p.globalCompositeOperation = "source-over";
      p.clearRect(0, 0, W, H);
      p.save();
      if (facing === "user") { p.translate(W, 0); p.scale(-1, 1); } // a mirror, like every selfie camera
      p.drawImage(cam, ...rect);
      p.globalCompositeOperation = "destination-in";
      p.imageSmoothingEnabled = true;
      p.imageSmoothingQuality = "high";
      p.filter = "blur(1.5px)"; // a soft edge; ignored where unsupported, the bilinear upscale still softens
      p.drawImage(mc, ...rect);
      p.filter = "none";
      p.restore();
      p.globalCompositeOperation = "source-over";
      ctx.drawImage(pc, 0, 0);

      if (recRef.current?.state === "recording") {
        const secs = (performance.now() - startedAtRef.current) / 1000;
        if (!thumbRef.current && secs >= 1) {
          thumbRef.current = new Blob(); // claim the slot so only one snapshot is taken
          canvas.toBlob((b) => { if (b) thumbRef.current = b; }, "image/jpeg", 0.85);
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [facing]);

  // ---- Recording ----
  const stop = useCallback(() => {
    const rec = recRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
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

  function start() {
    const canvas = canvasRef.current;
    const stream = streamRef.current;
    if (!canvas || !stream || !mime) return;
    const out = canvas.captureStream(30);
    stream.getAudioTracks().forEach((tr) => out.addTrack(tr));
    const rec = new MediaRecorder(out, { mimeType: mime, videoBitsPerSecond: 6_000_000, audioBitsPerSecond: 128_000 });
    chunksRef.current = [];
    thumbRef.current = null;
    rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      const duration = (performance.now() - startedAtRef.current) / 1000;
      const blob = new Blob(chunksRef.current, { type: "video/mp4" });
      const file = new File([blob], `greenscreen-${Date.now()}.mp4`, { type: "video/mp4" });
      setResult({ file, url: URL.createObjectURL(blob), duration });
      setPhase("done");
    };
    recRef.current = rec;
    startedAtRef.current = performance.now();
    setElapsed(0);
    rec.start(1000);
    setPhase("recording");
  }

  function retake() {
    if (result) URL.revokeObjectURL(result.url);
    setResult(null);
    setElapsed(0);
    setPhase("ready");
  }

  async function useVideo() {
    if (!result) return;
    let thumb = thumbRef.current;
    if (!thumb || !thumb.size) {
      thumb = await new Promise<Blob | null>((res) => canvasRef.current?.toBlob(res, "image/jpeg", 0.85) ?? res(null));
    }
    navigate("/upload", { state: { greenScreen: { file: result.file, duration: result.duration, thumb } } });
  }

  function pickLocal(f: File) {
    if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
    const url = URL.createObjectURL(f);
    localUrlRef.current = url;
    setSelected({ key: `local-${Date.now()}`, title: f.name, url, isVideo: f.type.startsWith("video/") });
  }

  if (!isLoggedIn || !user) {
    return <div className="page"><Notice>{t("sign_in_to_upload_a_video")}</Notice></div>;
  }
  if (!mime) {
    return <div className="page" style={{ maxWidth: 520 }}><PageTitle backTo="/upload">{t("fname_green_screen")}</PageTitle><Notice>{t("gs_unsupported")}</Notice></div>;
  }

  const recording = phase === "recording";
  return (
    <div className="page" style={{ maxWidth: 520 }}>
      <PageTitle backTo="/upload">{t("fname_green_screen")}</PageTitle>

      <input ref={fileRef} type="file" accept="image/*,video/*" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) pickLocal(f); e.target.value = ""; }} />

      <div style={{ position: "relative", width: "100%", maxWidth: 400, margin: "0 auto", aspectRatio: "9 / 16",
        borderRadius: 14, overflow: "hidden", border: "2px solid var(--gold-border)", background: "#000" }}>
        {/* The sources sit inside the visible frame at 2px and almost transparent: Chrome pauses
            a muted video it considers hidden ("paused to save power"), which froze them when
            they were display:none. Only the canvas is really seen. */}
        <video ref={camRef} muted playsInline style={HIDDEN_MEDIA} />
        <video ref={bgVideoRef} crossOrigin="anonymous" muted loop playsInline autoPlay style={HIDDEN_MEDIA} />
        <canvas ref={canvasRef} width={W} height={H}
          style={{ width: "100%", height: "100%", display: phase === "done" ? "none" : "block" }} />
        {phase === "done" && result && (
          <video src={result.url} controls autoPlay loop playsInline style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }} />
        )}
        {(phase === "loading" || phase === "error") && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
            <span className="soft">{phase === "loading" ? t("gs_loading") : error}</span>
          </div>
        )}
        {recording && (
          <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,.6)",
            color: "#fff", borderRadius: 999, padding: "4px 12px", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
            <span style={{ color: "var(--red, #e33)" }}>●</span> {fmt(elapsed)} / {fmt(MAX_SECONDS)}
          </div>
        )}
        {canFlip && phase === "ready" && (
          <button className="btn small" aria-label={t("gs_flip")} title={t("gs_flip")}
            onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
            style={{ position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,.55)" }}>⟲</button>
        )}
      </div>

      {phase !== "done" && (
        <div style={{ display: "flex", justifyContent: "center", margin: "14px 0" }}>
          <button aria-label={recording ? "Stop" : t("gs_tap_to_record")} disabled={phase !== "ready" && !recording}
            onClick={() => (recording ? stop() : start())}
            style={{ width: 74, height: 74, borderRadius: "50%", border: "4px solid var(--gold-border)", background: "transparent",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: phase === "ready" || recording ? 1 : 0.4 }}>
            <span style={{ width: recording ? 28 : 54, height: recording ? 28 : 54, borderRadius: recording ? 6 : "50%", background: "var(--red, #e33)", transition: "all .15s" }} />
          </button>
        </div>
      )}
      {phase === "ready" && <p className="muted" style={{ textAlign: "center", fontSize: 12, marginTop: -6 }}>{t("gs_tap_to_record")} · {t("gs_max_length")}</p>}

      {phase === "done" && (
        <div className="row" style={{ justifyContent: "center", gap: 10, margin: "14px 0" }}>
          <button className="btn ghost" onClick={retake}>{t("gs_retake")}</button>
          <button className="btn" onClick={useVideo} style={{ background: "var(--gold-border)", color: "#000", borderColor: "var(--gold-border)" }}>{t("gs_use_video")}</button>
        </div>
      )}

      {!recording && phase !== "done" && (
        <div className="card pad">
          <div className="soft" style={{ fontSize: 13, marginBottom: 8 }}>{t("gs_backgrounds")}</div>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
            <button onClick={() => fileRef.current?.click()}
              style={{ flex: "0 0 auto", width: 66, height: 110, borderRadius: 10, border: "2px dashed var(--gold-border)", background: "#111",
                color: "var(--gold)", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 4 }}>
              <div style={{ fontSize: 22 }}>＋</div>{t("gs_from_device")}
            </button>
            {selected?.key.startsWith("local-") && <BgTile bg={selected} selected onPick={() => undefined} />}
            {backgrounds.map((b) => <BgTile key={b.key} bg={b} selected={selected?.key === b.key} onPick={() => setSelected(b)} />)}
          </div>
        </div>
      )}
    </div>
  );
}
