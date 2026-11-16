// The video editor (Steve, 2026-11-16: "Build all three on all 3 platforms" — TikTok's editor,
// automatic captions, text posts + slideshows). The same camera as before, with more tools:
//
//  RECORD  several clips (tap to start, tap to stop), each at its own speed (0.3x-3x), with a
//          3 s / 10 s countdown if wanted; a segmented progress bar up to the length chosen
//          (15 s / 60 s / 3 min); delete the last clip; add clips from files.
//  EDIT    a strip of the clips: tap one to trim it (gold handles), change its speed, delete it;
//          drag (or the arrows) to reorder. One transition for the whole video (None / Fade /
//          Slide / Zoom), a voice effect (Chipmunk / Deep / Robot / Echo), a sound from the
//          picker, "Auto cut to the beat", and ready-made templates.
//  EXPORT  the timeline is played onto a 720x1280 canvas and recorded (videoKit.renderToMp4):
//          speed by playbackRate (pitch kept by the browser), voice effects in WebAudio, the music
//          mixed in. The mp4 then goes to the existing upload screen like any recording.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useT, type StringKey } from "../lib/i18n";
import { PageTitle } from "../components/PageTitle";
import { Notice } from "../components/Common";
import { SoundPicker } from "../components/SoundPicker";
import { showGoldAlert } from "../components/GoldToast";
import { useSession } from "../lib/session";
import { startMusic, useMusic, type Music } from "../lib/music";
import {
  drawCover, fmt, loadCrossOrigin, mediaDuration, newAudioContext, pickClipMime, pickMime, renderToMp4, voiceChain, waitSeek,
  type RenderResult, type VoiceEffect,
} from "../lib/videoKit";

const W = 720;
const H = 1280;
const SPEEDS = [0.3, 0.5, 1, 2, 3];
const CAPS = [15, 60, 180];
const TRANS_LEN = 0.45;
const MIN_CLIP = 0.3;

type Transition = "none" | "fade" | "slide" | "zoom";

interface Clip {
  id: number;
  url: string;
  /** Source length in seconds. */
  dur: number;
  start: number;
  end: number;
  speed: number;
  /** A front-camera clip is drawn mirrored, the way the member saw themselves. */
  mirror: boolean;
  thumb: string;
}

interface Template {
  key: string; icon: string; label: string;
  speed?: number; transition: Transition; effect?: VoiceEffect;
  beatSync?: boolean; cutBeats?: number | null; maxLen?: number;
}
const TEMPLATES: Template[] = [
  { key: "slowmo", icon: "🐢", label: "Slow-mo", speed: 0.5, transition: "fade", effect: "none", beatSync: false, cutBeats: null },
  { key: "fastcuts", icon: "⚡", label: "Fast cuts", speed: 1, transition: "none", beatSync: true, cutBeats: 2, maxLen: 1.2 },
  { key: "fades", icon: "🌙", label: "Smooth fades", speed: 1, transition: "fade", beatSync: false, cutBeats: null, maxLen: 4 },
  { key: "beatdrop", icon: "🥁", label: "Beat drop", speed: 1, transition: "zoom", beatSync: true, cutBeats: 4, maxLen: 2 },
  { key: "zoomparty", icon: "🔍", label: "Zoom party", speed: 1, transition: "zoom", beatSync: false, cutBeats: null, maxLen: 2 },
  { key: "robot", icon: "🤖", label: "Robot remix", speed: 2, transition: "slide", effect: "robot", beatSync: false, cutBeats: null },
];

const outLen = (c: Clip) => (c.end - c.start) / c.speed;

interface Seg { clip: number; t0: number; t1: number; src0: number; src1: number }

/** Where each clip sits on the output timeline. With beat sync, every cut lands on a beat of the
 *  music (and, if the template says so, each clip is at most `cutBeats` beats long). */
function planSegments(clips: Clip[], music: Music | null, beatSync: boolean, cutBeats: number | null, cap: number): Seg[] {
  const segs: Seg[] = [];
  let t = 0;
  const grid = music && beatSync && music.period > 0.15 ? music : null;
  const beatAfter = (x: number) => {
    if (!grid) return x;
    const first = grid.beats[0] ?? 0;
    const n = Math.floor((x - first) / grid.period + 1e-6);
    return first + n * grid.period;
  };
  clips.forEach((c, i) => {
    if (t >= cap - 0.05) return;
    let len = outLen(c);
    if (grid && cutBeats) len = Math.min(len, cutBeats * grid.period);
    let end = Math.min(t + len, cap);
    if (grid) {
      const snapped = beatAfter(end);
      if (snapped > t + MIN_CLIP) end = snapped;
    }
    if (end - t < 0.05) return;
    segs.push({ clip: i, t0: t, t1: end, src0: c.start, src1: c.start + (end - t) * c.speed });
    t = end;
  });
  return segs;
}

/** A frame of `v` as a small JPEG data URL for the clip strip. */
function grabThumb(v: HTMLVideoElement, mirror: boolean): string {
  try {
    const c = document.createElement("canvas");
    c.width = 108; c.height = 192;
    drawCover(c.getContext("2d")!, v, v.videoWidth, v.videoHeight, 0, 0, 108, 192, mirror);
    return c.toDataURL("image/jpeg", 0.7);
  } catch { return ""; }
}

/** Two gold handles on one bar: the part of the clip that is kept. */
function TrimBar({ dur, start, end, onChange }: { dur: number; start: number; end: number; onChange: (s: number, e: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<"s" | "e" | null>(null);
  const at = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * dur;
  };
  const move = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const x = at(e.clientX);
    if (drag.current === "s") onChange(Math.min(x, end - MIN_CLIP), end);
    else onChange(start, Math.max(x, start + MIN_CLIP));
  };
  const handle = (which: "s" | "e", v: number) => (
    <div role="slider" aria-label={which === "s" ? "Start" : "End"} aria-valuemin={0} aria-valuemax={dur} aria-valuenow={v} tabIndex={0}
      onKeyDown={(e) => {
        const d = e.key === "ArrowLeft" ? -0.1 : e.key === "ArrowRight" ? 0.1 : 0;
        if (!d) return;
        if (which === "s") onChange(Math.max(0, Math.min(start + d, end - MIN_CLIP)), end);
        else onChange(start, Math.min(dur, Math.max(end + d, start + MIN_CLIP)));
      }}
      onPointerDown={(e) => { drag.current = which; (e.target as HTMLElement).setPointerCapture(e.pointerId); e.stopPropagation(); }}
      style={{ position: "absolute", top: -6, left: `calc(${(v / dur) * 100}% - 9px)`, width: 18, height: 44, borderRadius: 6, background: "var(--gold)", border: "2px solid #000", cursor: "ew-resize", touchAction: "none", zIndex: 2 }} />
  );
  return (
    <div ref={ref} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
      style={{ position: "relative", height: 32, margin: "10px 10px", borderRadius: 6, background: "#1a1a1a", border: "1px solid #333", touchAction: "none" }}>
      <div style={{ position: "absolute", top: 0, bottom: 0, left: `${(start / dur) * 100}%`, width: `${((end - start) / dur) * 100}%`, background: "rgba(240,196,32,.28)", borderTop: "2px solid var(--gold)", borderBottom: "2px solid var(--gold)" }} />
      {handle("s", start)}
      {handle("e", end)}
    </div>
  );
}

const chip = (on: boolean): React.CSSProperties => ({
  padding: "8px 12px", borderRadius: 999, cursor: "pointer", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap",
  border: "1.5px solid var(--gold-border)", background: on ? "var(--gold)" : "#000", color: on ? "#000" : "var(--gold)",
});

let nextClipId = 1;

export function EditorPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const { isLoggedIn } = useSession();
  // Dev-only: ?debugcam=<video url> stands in for the webcam (the test browser has no camera).
  const debugCam = import.meta.env.DEV ? new URLSearchParams(window.location.search).get("debugcam") : null;

  const [mime] = useState(pickMime);
  const [clipMime] = useState(pickClipMime);
  const camRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const recStartRef = useRef(0);
  const recThumbRef = useRef("");
  const guideRef = useRef<{ ac: AudioContext; src: AudioBufferSourceNode } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hiddenRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debugUrlRef = useRef<string>("");

  const [phase, setPhase] = useState<"record" | "edit" | "export" | "done">("record");
  const [camState, setCamState] = useState<"starting" | "ready" | "none">("starting");
  const [clips, setClips] = useState<Clip[]>([]);
  const clipsRef = useRef(clips);
  clipsRef.current = clips;
  const [cap, setCap] = useState(60);
  const [speed, setSpeed] = useState(1);
  const [timer, setTimer] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [recording, setRecording] = useState(false);
  const [liveSec, setLiveSec] = useState(0);
  const [adding, setAdding] = useState(false);

  const [sel, setSel] = useState(0);
  const [transition, setTransition] = useState<Transition>("none");
  const [effect, setEffect] = useState<VoiceEffect>("none");
  const [keepOriginal, setKeepOriginal] = useState(true);
  const [beatSync, setBeatSync] = useState(false);
  const [cutBeats, setCutBeats] = useState<number | null>(null);
  const [template, setTemplate] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { music, loading: musicLoading, error: musicError, choose, clear } = useMusic();

  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<RenderResult | null>(null);
  const dragFrom = useRef<number | null>(null);

  const used = useMemo(() => clips.reduce((a, c) => a + outLen(c), 0), [clips]);
  const segs = useMemo(() => planSegments(clips, music, beatSync, cutBeats, cap), [clips, music, beatSync, cutBeats, cap]);
  const total = segs.length ? segs[segs.length - 1].t1 : 0;
  const remaining = Math.max(0, cap - used);

  // ---- Camera + microphone (or the dev stand-in) ----
  useEffect(() => {
    if (phase !== "record" || !mime) return;
    let alive = true;
    (async () => {
      const cam = camRef.current;
      if (!cam) return;
      try {
        if (debugCam) {
          if (!debugUrlRef.current) await loadCrossOrigin(cam, debugCam, (u) => { debugUrlRef.current = u; });
          else { cam.src = debugUrlRef.current; }
          cam.loop = true;
          cam.muted = true;
          await cam.play();
        } else {
          if (!streamRef.current) {
            const stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
              audio: { echoCancellation: true, noiseSuppression: true },
            });
            if (!alive) { stream.getTracks().forEach((tr) => tr.stop()); return; }
            streamRef.current = stream;
          }
          cam.srcObject = streamRef.current;
          cam.muted = true;
          await cam.play().catch(() => undefined);
        }
        if (alive) setCamState("ready");
      } catch {
        if (alive) setCamState("none");
      }
    })();
    return () => { alive = false; };
  }, [phase, mime, debugCam]);

  // ---- Everything stops when the page closes ----
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    stopGuide();
    abortRef.current?.abort();
    clipsRef.current.forEach((c) => URL.revokeObjectURL(c.url));
    if (debugUrlRef.current) URL.revokeObjectURL(debugUrlRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Adding a clip (recorded or from a file) ----
  const addClipBlob = useCallback(async (blob: Blob, measured: number | null, mirror: boolean, thumb: string): Promise<boolean> => {
    const url = URL.createObjectURL(blob);
    const v = document.createElement("video");
    v.preload = "auto";
    v.muted = true;
    v.playsInline = true;
    v.src = url;
    let dur = 0;
    try { dur = await mediaDuration(v); } catch { /* unreadable */ }
    if (!dur && measured) dur = measured;
    if (!dur || dur < 0.2) { URL.revokeObjectURL(url); return false; }
    if (measured) dur = Math.min(dur, measured + 0.5);
    if (!thumb) {
      await waitSeek(v, Math.min(0.5, dur / 2));
      thumb = grabThumb(v, mirror);
    }
    v.removeAttribute("src");
    v.load();
    const room = Math.max(MIN_CLIP, cap - clipsRef.current.reduce((a, c) => a + outLen(c), 0));
    const clipSpeed = measured ? speed : 1;
    const end = Math.min(dur, room * clipSpeed);
    setClips((cur) => [...cur, { id: nextClipId++, url, dur, start: 0, end, speed: clipSpeed, mirror, thumb }]);
    return true;
  }, [cap, speed]);

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("video/"));
    if (!list.length) return;
    setAdding(true);
    try {
      for (const f of list) {
        if (cap - clipsRef.current.reduce((a, c) => a + outLen(c), 0) < MIN_CLIP) { showGoldAlert(t("ed_full", fmt(cap))); break; }
        const ok = await addClipBlob(f, null, false, "");
        if (!ok) showGoldAlert(t("ed_bad_file"));
      }
    } finally { setAdding(false); }
  }
  if (import.meta.env.DEV) (window as unknown as { __bbEditorAdd?: (f: File[]) => Promise<void> }).__bbEditorAdd = (f) => addFiles(f);

  // ---- Recording ----
  function stopGuide() {
    const g = guideRef.current;
    guideRef.current = null;
    if (g) { try { g.src.stop(); } catch { /* already stopped */ } void g.ac.close().catch(() => undefined); }
  }

  const stopRec = useCallback(() => {
    const rec = recRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    stopGuide();
  }, []);

  function beginRecording() {
    const cam = camRef.current;
    if (!cam) return;
    let stream: MediaStream | null = streamRef.current;
    if (debugCam) stream = (cam as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.() ?? null;
    if (!stream) return;
    const rec = new MediaRecorder(stream, clipMime ? { mimeType: clipMime, videoBitsPerSecond: 6_000_000 } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const clipSpeed = speed;
    rec.onstop = () => {
      const measured = (performance.now() - recStartRef.current) / 1000;
      setRecording(false);
      setLiveSec(0);
      const blob = new Blob(chunks, { type: rec.mimeType || clipMime || "video/mp4" });
      void addClipBlob(blob, measured, !debugCam, recThumbRef.current).then((ok) => { if (!ok) showGoldAlert(t("ed_too_short")); });
    };
    recThumbRef.current = "";
    recRef.current = rec;
    recStartRef.current = performance.now();
    rec.start(500);
    setRecording(true);
    window.setTimeout(() => { if (camRef.current) recThumbRef.current = grabThumb(camRef.current, !debugCam); }, 400);
    // The chosen sound plays while recording, at the pace the clip will have in the video.
    if (music) {
      try {
        const ac = newAudioContext();
        const src = ac.createBufferSource();
        src.buffer = music.buffer;
        src.playbackRate.value = 1 / clipSpeed;
        src.connect(ac.destination);
        src.start(0, used % music.buffer.duration);
        guideRef.current = { ac, src };
      } catch { /* no guide track */ }
    }
  }

  function onRecordTap() {
    if (recording) { stopRec(); return; }
    if (countdown) return;
    if (remaining < MIN_CLIP) { showGoldAlert(t("ed_full", fmt(cap))); return; }
    if (!timer) { beginRecording(); return; }
    let n = timer;
    setCountdown(n);
    const id = window.setInterval(() => {
      n -= 1;
      if (n <= 0) { window.clearInterval(id); setCountdown(0); beginRecording(); }
      else setCountdown(n);
    }, 1000);
  }

  // The live segment grows, and recording stops by itself at the cap.
  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => {
      const s = (performance.now() - recStartRef.current) / 1000;
      setLiveSec(s);
      if (used + s / speed >= cap) stopRec();
    }, 100);
    return () => window.clearInterval(id);
  }, [recording, used, speed, cap, stopRec]);

  function deleteLast() {
    setClips((cur) => {
      const last = cur[cur.length - 1];
      if (last) URL.revokeObjectURL(last.url);
      return cur.slice(0, -1);
    });
  }

  function goEdit() {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    camRef.current?.pause();
    setCamState("starting");
    setSel(0);
    setPhase("edit");
  }

  // ---- Edit ----
  const selected = clips[Math.min(sel, clips.length - 1)] ?? null;
  const updateClip = (id: number, patch: Partial<Clip>) => setClips((cur) => cur.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  function moveClip(from: number, to: number) {
    setClips((cur) => {
      if (to < 0 || to >= cur.length || from === to) return cur;
      const nx = cur.slice();
      const [c] = nx.splice(from, 1);
      nx.splice(to, 0, c);
      return nx;
    });
    setSel(to);
  }
  function deleteClip(i: number) {
    setClips((cur) => {
      const gone = cur[i];
      if (gone) URL.revokeObjectURL(gone.url);
      return cur.filter((_, j) => j !== i);
    });
    setSel((s) => Math.max(0, Math.min(s, clips.length - 2)));
  }
  function applyTemplate(tp: Template) {
    setTemplate(tp.key);
    setTransition(tp.transition);
    if (tp.effect) setEffect(tp.effect);
    setBeatSync(!!tp.beatSync && !!music);
    setCutBeats(tp.cutBeats ?? null);
    setClips((cur) => cur.map((c) => {
      const sp = tp.speed ?? c.speed;
      let end = Math.min(c.dur, c.start + (c.end - c.start) * (sp / c.speed));
      if (tp.maxLen && !(tp.beatSync && music)) end = Math.min(end, c.start + tp.maxLen * sp);
      return { ...c, speed: sp, end: Math.max(c.start + MIN_CLIP, end) };
    }));
  }

  // The selected clip's preview loops its kept part at its speed (muted).
  useEffect(() => {
    const v = previewRef.current;
    if (!v || !selected || phase !== "edit") return;
    v.playbackRate = selected.speed;
    if (v.currentTime < selected.start || v.currentTime > selected.end) v.currentTime = selected.start;
    const onTime = () => { if (v.currentTime >= selected.end - 0.03) { v.currentTime = selected.start; } };
    v.addEventListener("timeupdate", onTime);
    void v.play().catch(() => undefined);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [selected, phase]);

  // ---- Export ----
  async function exportVideo() {
    const canvas = canvasRef.current;
    const holder = hiddenRef.current;
    if (!canvas || !holder || !segs.length) return;
    previewRef.current?.pause();
    setPhase("export");
    setProgress(0);
    const ab = new AbortController();
    abortRef.current = ab;
    const list = clips.slice();
    const plan = segs.slice();
    const vids: HTMLVideoElement[] = [];
    try {
      for (const c of list) {
        const v = document.createElement("video");
        Object.assign(v.style, { position: "absolute", left: "0", top: "0", width: "2px", height: "2px", opacity: "0.01", pointerEvents: "none" });
        v.playsInline = true;
        v.preload = "auto";
        v.src = c.url;
        v.muted = false;
        (v as HTMLVideoElement & { preservesPitch?: boolean; webkitPreservesPitch?: boolean }).preservesPitch = true;
        (v as HTMLVideoElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true;
        holder.appendChild(v);
        vids.push(v);
      }
      for (const s of plan) await waitSeek(vids[s.clip], s.src0);

      const snap = document.createElement("canvas");
      snap.width = W; snap.height = H;
      const sctx = snap.getContext("2d")!;
      let cur = -1;

      const r = await renderToMp4({
        canvas, duration: total, name: "edited", thumbAt: Math.min(1, total / 2), signal: ab.signal, videoBitsPerSecond: 6_000_000,
        setupAudio: async (ac, dest) => {
          const chain = await voiceChain(ac, effect);
          const orig = ac.createGain();
          orig.gain.value = keepOriginal || !music ? 1 : 0;
          chain.output.connect(orig);
          orig.connect(dest);
          for (const v of vids) ac.createMediaElementSource(v).connect(chain.input);
        },
        onStart: (ac, dest) => { if (music) startMusic(ac, music.buffer, dest, keepOriginal ? 0.75 : 1, total); },
        draw: (ctx, time) => {
          let k = plan.findIndex((s) => time < s.t1);
          if (k < 0) k = plan.length - 1;
          const s = plan[k];
          const c = list[s.clip];
          const v = vids[s.clip];
          if (k !== cur) {
            if (cur >= 0) {
              sctx.drawImage(canvas, 0, 0);
              vids[plan[cur].clip].pause();
            }
            cur = k;
            v.playbackRate = c.speed;
            void v.play().catch(() => undefined);
          }
          if (v.currentTime >= s.src1 - 0.02 && !v.paused) v.pause();
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, W, H);
          const local = time - s.t0;
          const p = k > 0 && transition !== "none" && local < TRANS_LEN ? local / TRANS_LEN : 1;
          if (p < 1 && transition === "slide") {
            // The last frame slides out to the left as the new clip slides in from the right.
            const e = 1 - Math.pow(1 - p, 3);
            ctx.drawImage(snap, -e * W, 0);
            drawCover(ctx, v, v.videoWidth, v.videoHeight, (1 - e) * W, 0, W, H, c.mirror);
          } else {
            drawCover(ctx, v, v.videoWidth, v.videoHeight, 0, 0, W, H, c.mirror);
            if (p < 1 && transition === "fade") {
              ctx.globalAlpha = 1 - p;
              ctx.drawImage(snap, 0, 0);
              ctx.globalAlpha = 1;
            } else if (p < 1 && transition === "zoom") {
              const z = 1 + p * 0.8;
              ctx.globalAlpha = 1 - p;
              ctx.drawImage(snap, (W - W * z) / 2, (H - H * z) / 2, W * z, H * z);
              ctx.globalAlpha = 1;
            }
          }
        },
        onProgress: setProgress,
      });
      if (import.meta.env.DEV) (window as unknown as { __bbRender?: RenderResult }).__bbRender = r;
      setResult(r);
      setPhase("done");
    } catch (e) {
      setPhase("edit");
      if ((e as Error).name !== "AbortError") showGoldAlert((e as Error).message);
    } finally {
      vids.forEach((v) => { v.pause(); v.removeAttribute("src"); v.load(); v.remove(); });
    }
  }

  function next() {
    if (!result) return;
    if (!isLoggedIn) { navigate("/login", { state: { from: "/editor" } }); return; }
    navigate("/upload", {
      state: {
        greenScreen: { file: result.file, duration: result.duration, thumb: result.thumb },
        ...(music?.sound.id ? { remix: { soundId: music.sound.id, soundTitle: music.sound.title ?? "" } } : {}),
      },
    });
  }

  if (!mime) {
    return <div className="page" style={{ maxWidth: 520 }}><PageTitle backTo="/upload">{t("ed_title")}</PageTitle><Notice>{t("vk_unsupported")}</Notice></div>;
  }

  const soundRow = (
    <div className="card pad" style={{ marginBottom: 12 }}>
      <div className="row" style={{ alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0, color: "var(--gold)", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {musicLoading ? t("snd_loading") : music ? `♪ ${music.sound.title || t("snd_untitled")}` : t("vk_no_music")}
        </div>
        {music && !recording && <button className="btn small ghost" onClick={() => { clear(); setBeatSync(false); }}>{t("vk_remove")}</button>}
        <button className="btn small gold" disabled={recording} onClick={() => setPickerOpen(true)}>{music ? t("vk_change_sound") : t("vk_add_sound")}</button>
      </div>
      {musicError && <p style={{ color: "#f55", fontSize: 13, margin: "6px 0 0" }}>{musicError}</p>}
    </div>
  );

  // ---- Segmented progress bar ----
  const bar = (
    <div style={{ display: "flex", gap: 2, height: 8, borderRadius: 999, overflow: "hidden", background: "#222", margin: "10px 0" }}>
      {clips.map((c) => <div key={c.id} style={{ width: `${(outLen(c) / cap) * 100}%`, background: "var(--gold)" }} />)}
      {recording && <div style={{ width: `${(liveSec / speed / cap) * 100}%`, background: "var(--gold-bright)", opacity: 0.8 }} />}
    </div>
  );

  return (
    <div className="page" style={{ maxWidth: 940 }}>
      <PageTitle backTo="/upload">{t("ed_title")}</PageTitle>
      <input ref={fileRef} type="file" accept="video/*" multiple style={{ display: "none" }}
        onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ""; }} />

      {/* ---------------- RECORD ---------------- */}
      {phase === "record" && (
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: "0 1 340px", width: "100%", maxWidth: 360, margin: "0 auto" }}>
            <div style={{ position: "relative", aspectRatio: "9 / 16", borderRadius: 14, overflow: "hidden", border: "2px solid var(--gold-border)", background: "#000" }}>
              <video ref={camRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", transform: debugCam ? undefined : "scaleX(-1)" }} />
              {camState !== "ready" && (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
                  <span className="soft">{camState === "starting" ? t("ed_getting_ready") : t("ed_no_camera")}</span>
                </div>
              )}
              {countdown > 0 && (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.35)" }}>
                  <span style={{ fontSize: 140, fontWeight: 900, color: "var(--gold)", textShadow: "0 4px 18px #000" }}>{countdown}</span>
                </div>
              )}
              {recording && (
                <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,.6)", color: "#fff", borderRadius: 999, padding: "4px 12px", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ color: "var(--red, #e33)" }}>●</span> {fmt(used + liveSec / speed)} / {fmt(cap)}
                </div>
              )}
            </div>
            {bar}
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 18, margin: "8px 0" }}>
              <button className="btn small ghost" disabled={!clips.length || recording} onClick={deleteLast}>{t("ed_delete_last")}</button>
              <button aria-label={recording ? t("ed_stop") : t("ed_record")} disabled={camState !== "ready" || (!recording && remaining < MIN_CLIP)}
                onClick={onRecordTap}
                style={{ width: 74, height: 74, borderRadius: "50%", border: "4px solid var(--gold-border)", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: camState === "ready" ? 1 : 0.4 }}>
                <span style={{ width: recording ? 28 : 54, height: recording ? 28 : 54, borderRadius: recording ? 6 : "50%", background: "var(--red, #e33)", transition: "all .15s" }} />
              </button>
              <button className="btn small gold" disabled={!clips.length || recording} onClick={goEdit}>{t("vk_next")}</button>
            </div>
            <p className="muted" style={{ textAlign: "center", fontSize: 12 }}>{t("ed_record_hint")}</p>
          </div>

          <div style={{ flex: "1 1 340px", minWidth: 0 }}>
            <div className="card pad" style={{ marginBottom: 12 }}>
              <div className="soft" style={{ fontSize: 13, marginBottom: 8 }}>{t("ed_speed")}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                {SPEEDS.map((s) => <button key={s} type="button" disabled={recording} style={chip(s === speed)} onClick={() => setSpeed(s)}>{s}x</button>)}
              </div>
              <div className="soft" style={{ fontSize: 13, marginBottom: 8 }}>{t("ed_timer")}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                {[0, 3, 10].map((s) => <button key={s} type="button" disabled={recording} style={chip(s === timer)} onClick={() => setTimer(s)}>{s ? `${s} s` : t("switch_off")}</button>)}
              </div>
              <div className="soft" style={{ fontSize: 13, marginBottom: 8 }}>{t("ed_max_length")}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {CAPS.map((s) => <button key={s} type="button" disabled={recording || used > s} style={chip(s === cap)} onClick={() => setCap(s)}>{s < 60 ? `${s} s` : s === 60 ? "60 s" : "3 min"}</button>)}
              </div>
            </div>
            {soundRow}
            <div className="card pad" style={{ marginBottom: 12 }}>
              <div className="row" style={{ alignItems: "center", gap: 10 }}>
                <div className="soft" style={{ flex: 1, fontSize: 13 }}>{t("ed_clips_so_far", clips.length, fmt(used))}</div>
                <button className="btn small" disabled={recording || adding || remaining < MIN_CLIP} onClick={() => fileRef.current?.click()}>
                  {adding ? t("snd_loading") : t("ed_add_files")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- EDIT / EXPORT / DONE ---------------- */}
      {phase !== "record" && (
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: "0 1 340px", width: "100%", maxWidth: 360, margin: "0 auto" }}>
            <div style={{ position: "relative", aspectRatio: "9 / 16", borderRadius: 14, overflow: "hidden", border: "2px solid var(--gold-border)", background: "#000" }}>
              {phase === "edit" && selected && (
                <video ref={previewRef} key={selected.id} src={selected.url} muted playsInline
                  style={{ width: "100%", height: "100%", objectFit: "cover", transform: selected.mirror ? "scaleX(-1)" : undefined }} />
              )}
              {/* The export's sources sit here at 2px, nearly transparent: Chrome pauses a video it thinks is hidden. */}
              <div ref={hiddenRef} style={{ position: "absolute", left: 0, top: 0, width: 2, height: 2 }} />
              <canvas ref={canvasRef} width={W} height={H} style={{ width: "100%", height: "100%", display: phase === "export" ? "block" : "none" }} />
              {phase === "done" && result && <video src={result.url} controls autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }} />}
            </div>
            {phase === "edit" && <div className="muted" style={{ textAlign: "center", fontSize: 12, marginTop: 6 }}>{t("ed_total", fmt(total), fmt(cap))}</div>}
            {phase === "export" && (
              <div style={{ marginTop: 10 }}>
                <div className="muted" style={{ fontSize: 13, marginBottom: 6, textAlign: "center" }}>{t("vk_making_video", Math.round(progress * 100))}</div>
                <div style={{ height: 8, background: "var(--panel)", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ width: `${Math.round(progress * 100)}%`, height: "100%", background: "var(--gold-border)" }} />
                </div>
                <div style={{ textAlign: "center", marginTop: 8 }}><button className="btn ghost small" onClick={() => abortRef.current?.abort()}>{t("vk_cancel")}</button></div>
              </div>
            )}
            {phase === "done" && (
              <div className="row" style={{ justifyContent: "center", gap: 10, marginTop: 12 }}>
                <button className="btn ghost" onClick={() => { if (result) URL.revokeObjectURL(result.url); setResult(null); setPhase("edit"); }}>{t("vk_edit_again")}</button>
                <button className="btn gold" onClick={next}>{t("vk_next")}</button>
              </div>
            )}
          </div>

          <div style={{ flex: "1 1 380px", minWidth: 0, display: phase === "edit" ? "block" : "none" }}>
            {/* Templates */}
            <div className="card pad" style={{ marginBottom: 12 }}>
              <div className="soft" style={{ fontSize: 13, marginBottom: 8 }}>{t("ed_templates")}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8 }}>
                {TEMPLATES.map((tp) => (
                  <button key={tp.key} type="button" onClick={() => applyTemplate(tp)}
                    style={{ padding: "10px 6px", borderRadius: 12, cursor: "pointer", textAlign: "center", fontWeight: 800, fontSize: 13,
                      border: tp.key === template ? "2.5px solid var(--gold-bright)" : "1.5px solid var(--gold-border)",
                      background: tp.key === template ? "#2a2410" : "#000", color: "var(--gold)" }}>
                    <div style={{ fontSize: 24, marginBottom: 4 }}>{tp.icon}</div>{tp.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Clip strip */}
            <div className="card pad" style={{ marginBottom: 12 }}>
              <div className="row" style={{ alignItems: "center", marginBottom: 8 }}>
                <div className="soft" style={{ flex: 1, fontSize: 13 }}>{t("ed_clips_hint")}</div>
                <button className="btn small ghost" onClick={() => { setPhase("record"); setCamState("starting"); }} disabled={remaining < MIN_CLIP}>{t("ed_record_more")}</button>
              </div>
              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6 }}>
                {clips.map((c, i) => (
                  <button key={c.id} type="button" draggable
                    onDragStart={() => { dragFrom.current = i; }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => { if (dragFrom.current !== null) moveClip(dragFrom.current, i); dragFrom.current = null; }}
                    onClick={() => setSel(i)}
                    style={{ position: "relative", flex: "0 0 64px", height: 112, borderRadius: 8, padding: 0, cursor: "grab",
                      border: i === sel ? "3px solid var(--gold-bright)" : "1.5px solid var(--gold-border)",
                      background: c.thumb ? `#000 url(${JSON.stringify(c.thumb)}) center / cover` : "#111" }}>
                    <span style={{ position: "absolute", bottom: 2, left: 2, right: 2, fontSize: 11, fontWeight: 800, color: "#000", background: "var(--gold)", borderRadius: 4 }}>
                      {outLen(c).toFixed(1)}s{c.speed !== 1 ? ` · ${c.speed}x` : ""}
                    </span>
                  </button>
                ))}
              </div>
              {selected && (
                <div style={{ marginTop: 10, borderTop: "1px solid #222", paddingTop: 10 }}>
                  <div className="soft" style={{ fontSize: 13 }}>{t("ed_trim", (selected.start).toFixed(1), (selected.end).toFixed(1))}</div>
                  <TrimBar dur={selected.dur} start={selected.start} end={selected.end}
                    onChange={(s, e) => { updateClip(selected.id, { start: s, end: e }); if (previewRef.current) previewRef.current.currentTime = s; }} />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                    {SPEEDS.map((s) => <button key={s} type="button" style={chip(s === selected.speed)} onClick={() => updateClip(selected.id, { speed: s })}>{s}x</button>)}
                  </div>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    <button className="btn small ghost" disabled={sel === 0} onClick={() => moveClip(sel, sel - 1)}>‹ {t("vk_move_left")}</button>
                    <button className="btn small ghost" disabled={sel >= clips.length - 1} onClick={() => moveClip(sel, sel + 1)}>{t("vk_move_right")} ›</button>
                    <span className="spacer" />
                    <button className="btn small ghost" onClick={() => deleteClip(sel)}>{t("ed_delete_clip")}</button>
                  </div>
                </div>
              )}
            </div>

            {/* Transition + voice */}
            <div className="card pad" style={{ marginBottom: 12 }}>
              <div className="soft" style={{ fontSize: 13, marginBottom: 8 }}>{t("ed_transition")}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                {(["none", "fade", "slide", "zoom"] as Transition[]).map((x) => (
                  <button key={x} type="button" style={chip(x === transition)} onClick={() => setTransition(x)}>{t(("ed_tr_" + x) as StringKey)}</button>
                ))}
              </div>
              <div className="soft" style={{ fontSize: 13, marginBottom: 8 }}>{t("ed_voice")}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(["none", "chipmunk", "deep", "robot", "echo"] as VoiceEffect[]).map((x) => (
                  <button key={x} type="button" style={chip(x === effect)} onClick={() => setEffect(x)}>{t(("ed_fx_" + x) as StringKey)}</button>
                ))}
              </div>
            </div>

            {soundRow}
            <div className="card" style={{ marginBottom: 12 }}>
              <label className="row" style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)", cursor: "pointer" }}>
                <div style={{ flex: 1, fontWeight: 700 }}>{t("ed_keep_original")}</div>
                <input type="checkbox" className="switch" checked={keepOriginal} onChange={(e) => setKeepOriginal(e.target.checked)} />
              </label>
              <label className="row" style={{ padding: "12px 14px", cursor: music ? "pointer" : "default", opacity: music ? 1 : 0.5 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{t("ed_beat_sync")}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{music ? t("ed_beat_found", music.bpm) : t("ed_beat_needs_sound")}</div>
                </div>
                <input type="checkbox" className="switch" disabled={!music} checked={beatSync && !!music} onChange={(e) => setBeatSync(e.target.checked)} />
              </label>
            </div>

            <button className="btn block gold" disabled={!segs.length || musicLoading} onClick={exportVideo}>{t("vk_make_video")}</button>
          </div>
        </div>
      )}
      {pickerOpen && <SoundPicker onClose={() => setPickerOpen(false)} onPick={(s) => { setPickerOpen(false); void choose(s); }} />}
    </div>
  );
}
