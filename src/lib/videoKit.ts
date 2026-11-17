// Shared pieces for everything that MAKES a video in the browser: the Duet / Stitch / sound
// recorder, the editor, Text posts and Photo slideshows (Steve, 2026-11-16: "Build all three on
// all 3 platforms").
//
// One rule runs through all of them: the finished file is a canvas recorded by MediaRecorder as
// MP4/H.264 (+ AAC). iPhones cannot play WebM, so a browser that can only record WebM (Firefox)
// gets a plain "not supported" note instead of making posts half the audience could never watch.
// The same rule the Green Screen has used since 2026-10-30.

export function pickMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return ["video/mp4;codecs=avc1.42E01F,mp4a.40.2", "video/mp4;codecs=avc1,mp4a.40.2", "video/mp4"]
    .find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

/** For the editor's raw camera clips, which are only ever replayed in THIS browser before the
 *  export re-renders them: MP4 when it can, else whatever it records. */
export function pickClipMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return pickMime() ?? ["video/webm;codecs=vp9,opus", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

/** Aspect-fill into a box at (x, y): one scale for both axes, centred, overflow cropped. */
export function drawCover(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, x: number, y: number, w: number, h: number, mirror = false, zoom = 1, panX = 0, panY = 0) {
  if (!sw || !sh) return;
  const s = Math.max(w / sw, h / sh) * zoom;
  const dw = sw * s;
  const dh = sh * s;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  if (mirror) { ctx.translate(x * 2 + w, 0); ctx.scale(-1, 1); }
  // pan: -1..1 of the overflow on each axis
  const ox = ((dw - w) / 2) * panX;
  const oy = ((dh - h) / 2) * panY;
  ctx.drawImage(src, x + (w - dw) / 2 + ox, y + (h - dh) / 2 + oy, dw, dh);
  ctx.restore();
}

export function fmt(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Cache-busts the browser layer (the feed player's non-CORS copy of the same URL); S3 ignores it. */
export function corsUrl(url: string): string {
  return url.startsWith("blob:") || url.startsWith("data:") || url.startsWith("/") ? url : url + (url.includes("?") ? "&" : "?") + "bbcors=1";
}

function waitMeta(el: HTMLMediaElement): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (el.readyState >= 1) { resolve(); return; }
    const ok = () => { cleanup(); resolve(); };
    const bad = () => { cleanup(); reject(new Error("That video couldn't be loaded.")); };
    const cleanup = () => { el.removeEventListener("loadedmetadata", ok); el.removeEventListener("error", bad); };
    el.addEventListener("loadedmetadata", ok);
    el.addEventListener("error", bad);
  });
}

/** Put a CloudFront file into a media element in a way a canvas may record: blob first, a
 *  crossOrigin load if the fetch fails. Resolves once metadata is in.
 *
 *  CloudFront's CORS is NOT dependable (checked 2026-11-16): the edge caches range responses with
 *  or without Access-Control-Allow-Origin depending on who asked first. A plain CORS fetch of the
 *  whole file did get the header, and a blob: URL never taints the canvas. */
export async function loadCrossOrigin(el: HTMLMediaElement, url: string, onBlobUrl: (u: string) => void): Promise<void> {
  el.preload = "auto";
  try {
    const res = await fetch(corsUrl(url), { mode: "cors", cache: "no-store" });
    if (!res.ok) throw new Error();
    const blobUrl = URL.createObjectURL(await res.blob());
    onBlobUrl(blobUrl);
    el.removeAttribute("crossorigin");
    el.src = blobUrl;
    el.load();
    await waitMeta(el);
    return;
  } catch { /* fall through to a crossOrigin stream */ }
  el.crossOrigin = "anonymous";
  el.src = corsUrl(url);
  el.load();
  await waitMeta(el);
}

export function waitSeek(el: HTMLMediaElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(el.currentTime - t) < 0.01 && el.readyState >= 2) { resolve(); return; }
    let finished = false;
    const done = () => { if (finished) return; finished = true; el.removeEventListener("seeked", done); resolve(); };
    el.addEventListener("seeked", done);
    el.currentTime = t;
    window.setTimeout(done, 3000);
  });
}

/** A media file's real length. A MediaRecorder file often says Infinity until it has been read
 *  through once; seeking far past the end makes the browser find the true end. */
export async function mediaDuration(el: HTMLMediaElement): Promise<number> {
  await waitMeta(el);
  if (Number.isFinite(el.duration) && el.duration > 0) return el.duration;
  await new Promise<void>((resolve) => {
    const done = () => { el.removeEventListener("durationchange", check); window.clearTimeout(timer); resolve(); };
    const check = () => { if (Number.isFinite(el.duration)) done(); };
    const timer = window.setTimeout(done, 4000);
    el.addEventListener("durationchange", check);
    el.currentTime = 1e7;
  });
  const d = el.duration;
  el.currentTime = 0;
  return Number.isFinite(d) ? d : 0;
}

export function newAudioContext(): AudioContext {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new AC();
}

/** A whole sound file as bytes (CloudFront via a plain CORS fetch, see loadCrossOrigin). */
export async function fetchMediaBlob(url: string): Promise<Blob> {
  const res = await fetch(corsUrl(url), { mode: "cors", cache: "no-store" });
  if (!res.ok) throw new Error("That sound couldn't be loaded.");
  return res.blob();
}

/** The sound decoded for the editor / text posts / slideshows: exact start times and the beat
 *  detector both need the samples. */
export async function loadAudioBuffer(ac: BaseAudioContext, url: string): Promise<AudioBuffer> {
  const bytes = await (await fetchMediaBlob(url)).arrayBuffer();
  return ac.decodeAudioData(bytes);
}

/** Simple beat finder for "Auto cut to the beat": an energy-flux onset curve, its tempo by
 *  autocorrelation (70-180 BPM), then the beat grid placed where the onsets line up best.
 *  Good enough to snap cuts to; not a DJ tool. */
export function detectBeats(buf: AudioBuffer): { bpm: number; period: number; beats: number[] } {
  const sr = buf.sampleRate;
  const hop = 512;
  const win = 1024;
  const ch0 = buf.getChannelData(0);
  const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
  const analyse = Math.min(buf.length, sr * 90);
  const frames = Math.max(0, Math.floor((analyse - win) / hop));
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let e = 0;
    const o = f * hop;
    for (let i = 0; i < win; i += 2) {
      const v = ch1 ? (ch0[o + i] + ch1[o + i]) * 0.5 : ch0[o + i];
      e += v * v;
    }
    energy[f] = Math.sqrt(e / (win / 2));
  }
  const flux = new Float32Array(frames);
  for (let f = 1; f < frames; f++) flux[f] = Math.max(0, energy[f] - energy[f - 1]);
  const fps = sr / hop;
  const lagMin = Math.max(1, Math.round((60 / 180) * fps));
  const lagMax = Math.round((60 / 70) * fps);
  let bestLag = Math.round((60 / 120) * fps);
  let bestScore = -1;
  for (let lag = lagMin; lag <= lagMax && lag < frames; lag++) {
    let s = 0;
    for (let f = lag; f < frames; f++) s += flux[f] * flux[f - lag];
    // a gentle preference for tempos near 120, so half / double tempo do not win on ties
    const bpm = (60 * fps) / lag;
    s *= 1 - Math.min(0.3, Math.abs(Math.log2(bpm / 120)) * 0.3);
    if (s > bestScore) { bestScore = s; bestLag = lag; }
  }
  let bestOff = 0;
  let bestSum = -1;
  for (let off = 0; off < bestLag; off++) {
    let s = 0;
    for (let f = off; f < frames; f += bestLag) s += flux[f];
    if (s > bestSum) { bestSum = s; bestOff = off; }
  }
  const period = bestLag / fps;
  const first = bestOff / fps;
  const beats: number[] = [];
  for (let t = first; t <= buf.duration; t += period) beats.push(t);
  return { bpm: Math.round(60 / period), period, beats };
}

// ---- Voice effects (applied at export) ---------------------------------------------------------

export type VoiceEffect = "none" | "chipmunk" | "deep" | "robot" | "echo";

/** A delay-line pitch shifter: two read heads half a window apart, each sliding through the
 *  window at (1 - ratio) samples per sample, cross-faded with sin^2 so the sum is always 1. */
const PITCH_WORKLET = `
class BbPitch extends AudioWorkletProcessor {
  constructor(o) {
    super();
    this.ratio = (o.processorOptions && o.processorOptions.ratio) || 1;
    this.N = 16384; this.buf = new Float32Array(this.N); this.w = 0;
    this.win = 2048; this.phase = 0;
  }
  read(d) {
    let p = this.w - d; while (p < 0) p += this.N;
    const i = Math.floor(p), f = p - i, a = this.buf[i % this.N], b = this.buf[(i + 1) % this.N];
    return a + (b - a) * f;
  }
  process(inputs, outputs) {
    const inp = inputs[0] && inputs[0][0];
    const out = outputs[0];
    const n = out[0].length;
    const step = (1 - this.ratio) / this.win;
    for (let k = 0; k < n; k++) {
      this.buf[this.w] = inp ? inp[k] : 0;
      let pa = this.phase, pb = pa + 0.5; if (pb >= 1) pb -= 1;
      const ga = Math.sin(Math.PI * pa) ** 2, gb = Math.sin(Math.PI * pb) ** 2;
      const y = this.read(pa * this.win + 1) * ga + this.read(pb * this.win + 1) * gb;
      for (let c = 0; c < out.length; c++) out[c][k] = y;
      this.w = (this.w + 1) % this.N;
      this.phase += step; if (this.phase >= 1) this.phase -= 1; if (this.phase < 0) this.phase += 1;
    }
    return true;
  }
}
registerProcessor('bb-pitch', BbPitch);
`;
const workletLoaded = new WeakMap<BaseAudioContext, Promise<void>>();

async function pitchNode(ac: AudioContext, ratio: number): Promise<AudioNode> {
  if (!workletLoaded.has(ac)) {
    const url = URL.createObjectURL(new Blob([PITCH_WORKLET], { type: "text/javascript" }));
    workletLoaded.set(ac, ac.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url)));
  }
  await workletLoaded.get(ac);
  return new AudioWorkletNode(ac, "bb-pitch", {
    numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
    channelCount: 1, channelCountMode: "explicit", processorOptions: { ratio },
  });
}

/** input -> effect -> output. `none` is a plain gain. */
export async function voiceChain(ac: AudioContext, effect: VoiceEffect): Promise<{ input: AudioNode; output: AudioNode }> {
  const input = ac.createGain();
  const output = ac.createGain();
  if (effect === "chipmunk" || effect === "deep") {
    try {
      const p = await pitchNode(ac, effect === "chipmunk" ? 1.7 : 0.7);
      input.connect(p);
      p.connect(output);
      return { input, output };
    } catch {
      input.connect(output); // no AudioWorklet: the voice stays as it was rather than silent
      return { input, output };
    }
  }
  if (effect === "robot") {
    // Ring modulation (the classic robot) plus a short metallic comb.
    const ring = ac.createGain();
    ring.gain.value = 0;
    const osc = ac.createOscillator();
    osc.frequency.value = 55;
    osc.connect(ring.gain);
    osc.start();
    input.connect(ring);
    const comb = ac.createDelay(0.05);
    comb.delayTime.value = 0.012;
    const fb = ac.createGain();
    fb.gain.value = 0.55;
    ring.connect(comb);
    comb.connect(fb);
    fb.connect(comb);
    ring.connect(output);
    comb.connect(output);
    output.gain.value = 1.4;
    return { input, output };
  }
  if (effect === "echo") {
    const delay = ac.createDelay(1);
    delay.delayTime.value = 0.28;
    const fb = ac.createGain();
    fb.gain.value = 0.42;
    const wet = ac.createGain();
    wet.gain.value = 0.6;
    input.connect(output);
    input.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(output);
    return { input, output };
  }
  input.connect(output);
  return { input, output };
}

// ---- Rendering a canvas to an MP4 ------------------------------------------------------------

export interface RenderOptions {
  canvas: HTMLCanvasElement;
  /** Seconds of video to make. */
  duration: number;
  /** Draw frame `t` (seconds from the start). Called every animation frame while recording. */
  draw: (ctx: CanvasRenderingContext2D, t: number) => void;
  /** Wire sound sources into `dest` (sound is never sent to the speakers while exporting). */
  setupAudio?: (ac: AudioContext, dest: MediaStreamAudioDestinationNode) => Promise<void> | void;
  /** Called the moment recording starts: start music, play the first video. */
  onStart?: (ac: AudioContext, dest: MediaStreamAudioDestinationNode) => void;
  onProgress?: (fraction: number) => void;
  /** Where in the video the thumbnail is taken. */
  thumbAt?: number;
  videoBitsPerSecond?: number;
  name?: string;
  /** Lets the caller stop early (Cancel). */
  signal?: AbortSignal;
}

export interface RenderResult { file: File; url: string; duration: number; thumb: Blob | null }

/**
 * Plays a timeline onto `canvas` in real time and records it with MediaRecorder. Always carries an
 * audio track: a silent one is mixed in, so a text post with no music still gets silent AAC (some
 * players refuse a video with no sound track at all).
 */
export async function renderToMp4(o: RenderOptions): Promise<RenderResult> {
  const mime = pickMime();
  if (!mime) throw new Error("This browser can't make videos that play on every phone. Please use Chrome, Edge or Safari, or the Bingg Bongg app.");
  const ctx = o.canvas.getContext("2d")!;
  const ac = newAudioContext();
  try {
    await ac.resume();
    const dest = ac.createMediaStreamDestination();
    const silent = ac.createOscillator();
    const zero = ac.createGain();
    zero.gain.value = 0;
    silent.connect(zero);
    zero.connect(dest);
    silent.start();
    await o.setupAudio?.(ac, dest);

    o.draw(ctx, 0);
    const stream = o.canvas.captureStream(30);
    dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: o.videoBitsPerSecond ?? 6_000_000, audioBitsPerSecond: 128_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise<void>((resolve) => { rec.onstop = () => resolve(); });

    let thumb: Blob | null = null;
    let thumbAsked = false;
    const thumbAt = Math.min(o.thumbAt ?? 1, Math.max(0, o.duration - 0.2));
    const started = performance.now();
    rec.start(1000);
    o.onStart?.(ac, dest);

    await new Promise<void>((resolve) => {
      let raf = 0;
      let timer = 0;
      const tick = () => {
        const t = (performance.now() - started) / 1000;
        if (t >= o.duration || o.signal?.aborted) {
          cancelAnimationFrame(raf);
          window.clearTimeout(timer);
          resolve();
          return;
        }
        o.draw(ctx, t);
        o.onProgress?.(Math.min(1, t / o.duration));
        if (!thumbAsked && t >= thumbAt) {
          thumbAsked = true;
          o.canvas.toBlob((b) => { thumb = b; }, "image/jpeg", 0.85);
        }
        // A hidden tab gets no animation frames; a timer keeps the clock moving (slowly).
        if (document.hidden) timer = window.setTimeout(tick, 40);
        else raf = requestAnimationFrame(tick);
      };
      tick();
    });
    o.draw(ctx, o.duration);
    rec.stop();
    await stopped;
    stream.getTracks().forEach((tr) => tr.stop());
    if (o.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    if (!thumb) thumb = await new Promise<Blob | null>((res) => o.canvas.toBlob(res, "image/jpeg", 0.85));
    const blob = new Blob(chunks, { type: "video/mp4" });
    if (!blob.size) throw new Error("The video came out empty. Please try again.");
    const file = new File([blob], `${o.name ?? "video"}-${Date.now()}.mp4`, { type: "video/mp4" });
    o.onProgress?.(1);
    return { file, url: URL.createObjectURL(blob), duration: o.duration, thumb };
  } finally {
    void ac.close().catch(() => undefined);
  }
}

/** Load an image file (or URL) scaled down so it is at most `maxW` x `maxH` while still covering
 *  them — a 12 MP photo kept whole is 48 MB of pixels, and a slideshow has up to 35. */
export async function loadScaledImage(src: Blob | string, maxW: number, maxH: number): Promise<ImageBitmap> {
  const blob = typeof src === "string" ? await (await fetch(corsUrl(src), { mode: "cors" })).blob() : src;
  const full = await createImageBitmap(blob);
  const s = Math.min(1, Math.max(maxW / full.width, maxH / full.height));
  if (s >= 1) return full;
  const scaled = await createImageBitmap(full, { resizeWidth: Math.round(full.width * s), resizeHeight: Math.round(full.height * s), resizeQuality: "high" });
  full.close();
  return scaled;
}

/** The Photo slideshow's slow Ken-Burns move (also the Bingg Bongg Song video's): photo `i` at
 *  `local` seconds into a slot `span` long zooms 1 -> 1.12 (or back), drifting in a direction that
 *  changes photo to photo. */
export function drawKenBurns(ctx: CanvasRenderingContext2D, bmp: ImageBitmap, i: number, local: number, span: number, w: number, h: number) {
  const k = Math.max(0, Math.min(1, local / span));
  const inward = i % 2 === 0;
  const zoom = inward ? 1 + 0.12 * k : 1.12 - 0.12 * k;
  const dir = [[-1, 0], [1, 0], [0, -1], [0, 1]][i % 4];
  drawCover(ctx, bmp, bmp.width, bmp.height, 0, 0, w, h, false, zoom, dir[0] * (k - 0.5) * 0.8, dir[1] * (k - 0.5) * 0.8);
}
