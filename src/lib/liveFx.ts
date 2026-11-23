// The live room's camera and mic tools on the website (Steve, 2026-11-23, battling from the web:
// "Missing I-cons from the bottom. Caption, Voice to text, Sound, Music, Stickers, Background,
// Filters, Text to Voice, Pause Chat." — and earlier: "everything should be the same with all the
// icons on the phones and the website").
//
// The phones draw stickers, backgrounds and face filters INTO the camera picture they publish
// (Android's StickerOverlayVideoProcessor) and mix sound buttons, music and voice INTO the mic they
// publish (LiveStreamManager's SoundEffectMixer), so every viewer — phone or web — sees and hears
// them with nothing to install. The web does the same with LiveKit track processors:
//   - MixedMic: mic + sound effects + music + spoken text -> one track, sent instead of the mic.
//   - CameraFx: camera -> background cut-out -> face filter / makeup -> stickers -> a canvas
//     track, sent instead of the camera. Only set while something is on; off again when nothing is.
// Both are self-contained: a failing sound, a broken sticker or a model that will not load drops
// just that piece. Nothing here may stop the stream.
import type { AudioProcessorOptions, LocalAudioTrack, LocalVideoTrack, ProcessorOptions, Track, TrackProcessor } from "livekit-client";
import type { FaceLandmarker, ImageSegmenter, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { SEGMENTER_MODEL_URL, SEGMENTER_WASM_BASE } from "./segmenter";

// ================================================================== the mic

/** Mic + effects + music + voice, as one track (the phones' SoundEffectMixer). */
export class MixedMic implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  name = "bb-mixed-mic";
  processedTrack?: MediaStreamTrack;
  private ctx: AudioContext | null = null;
  private src: MediaStreamAudioSourceNode | null = null;
  private micGain: GainNode | null = null;
  private fxGain: GainNode | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private sound: HTMLAudioElement | null = null;
  private music: HTMLAudioElement | null = null;
  private voices = new Set<AudioBufferSourceNode>();

  async init(opts: AudioProcessorOptions) {
    const ctx = opts.audioContext;
    this.ctx = ctx;
    this.dest = ctx.createMediaStreamDestination();
    this.micGain = ctx.createGain();
    this.micGain.connect(this.dest);
    // Effects go out to the room AND to this computer's speakers, so the battler hears what
    // they play (the phones play it through the speaker too).
    this.fxGain = ctx.createGain();
    this.fxGain.connect(this.dest);
    this.fxGain.connect(ctx.destination);
    this.attachMic(opts.track);
    this.processedTrack = this.dest.stream.getAudioTracks()[0];
  }

  async restart(opts: ProcessorOptions<Track.Kind.Audio>) {
    this.attachMic(opts.track);
  }

  private attachMic(track: MediaStreamTrack) {
    if (!this.ctx || !this.micGain) return;
    try { this.src?.disconnect(); } catch { /* already gone */ }
    try {
      this.src = this.ctx.createMediaStreamSource(new MediaStream([track]));
      this.src.connect(this.micGain);
    } catch { this.src = null; }
  }

  async destroy() {
    this.stopSound();
    this.stopMusic();
    this.stopVoices();
    for (const n of [this.src, this.micGain, this.fxGain]) { try { n?.disconnect(); } catch { /* ignore */ } }
    this.processedTrack?.stop();
    this.processedTrack = undefined;
    this.src = this.micGain = this.fxGain = null;
    this.dest = null;
  }

  /** The mic itself on or off (Mic Off silences the mixed track too, effects included). */
  setLive(on: boolean) {
    if (this.micGain) this.micGain.gain.value = on ? 1 : 0;
    if (this.fxGain) this.fxGain.gain.value = on ? 1 : 0;
  }

  private element(url: string, loop: boolean, volume: number): HTMLAudioElement | null {
    if (!this.ctx || !this.fxGain) return null;
    const el = new Audio();
    el.crossOrigin = "anonymous";
    el.loop = loop;
    el.preload = "auto";
    el.src = url;
    try {
      const node = this.ctx.createMediaElementSource(el);
      const g = this.ctx.createGain();
      g.gain.value = volume;
      node.connect(g);
      g.connect(this.fxGain);
    } catch { return null; }
    return el;
  }

  /** A sound button: loops until tapped again (the phones' playSoundButton). */
  async playSound(url: string): Promise<boolean> {
    this.stopSound();
    const el = this.element(url, true, 1);
    if (!el) return false;
    this.sound = el;
    try { await this.ctx?.resume(); await el.play(); return true; } catch { if (this.sound === el) this.stopSound(); return false; }
  }

  stopSound() {
    const el = this.sound;
    this.sound = null;
    if (el) { try { el.pause(); el.removeAttribute("src"); el.load(); } catch { /* ignore */ } }
  }

  /** One song of a music station; `onEnded` plays the next. */
  async playMusic(url: string, onEnded: () => void, onFailed: () => void): Promise<void> {
    this.stopMusic();
    const el = this.element(url, false, 0.7);
    if (!el) { onFailed(); return; }
    this.music = el;
    el.onended = () => { if (this.music === el) onEnded(); };
    el.onerror = () => { if (this.music === el) { this.stopMusic(); onFailed(); } };
    try { await this.ctx?.resume(); await el.play(); } catch { if (this.music === el) { this.stopMusic(); onFailed(); } }
  }

  stopMusic() {
    const el = this.music;
    this.music = null;
    if (el) { try { el.onended = null; el.onerror = null; el.pause(); el.removeAttribute("src"); el.load(); } catch { /* ignore */ } }
  }

  /** Spoken text (the server's MP3, base64), into the room. Resolves when it has finished. */
  async playVoice(base64: string, volume = 1): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || !this.fxGain) return;
    try {
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const buf = await ctx.decodeAudioData(bytes.buffer);
      await ctx.resume();
      const node = ctx.createBufferSource();
      node.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = Math.max(0, Math.min(1, volume));
      node.connect(g);
      g.connect(this.fxGain);
      this.voices.add(node);
      await new Promise<void>((resolve) => {
        node.onended = () => { this.voices.delete(node); try { g.disconnect(); } catch { /* ignore */ } resolve(); };
        node.start();
      });
    } catch { /* a voice that will not decode is skipped */ }
  }

  stopVoices() {
    this.voices.forEach((n) => { try { n.stop(); } catch { /* ignore */ } });
    this.voices.clear();
  }
}

// ================================================================== the camera

export interface FaceFilter {
  id: string;
  label: string;
  tab: "classic" | "funny" | "makeup";
  /** Sprite filters: the PNG (the phones' own, in /filters) and where it sits. */
  anchor?: "eyes" | "nose_mouth" | "head_top";
  scale?: number;
  /** Makeup: what it paints, in which colour. */
  makeup?: "lipstick" | "blush" | "eyeshadow" | "freckles" | "eyeliner" | "lashes" | "contour" | "highlight" | "smooth";
  color?: string;
  strength?: number;
}

const S = (id: string, label: string, anchor: FaceFilter["anchor"], scale = 1, tab: FaceFilter["tab"] = "classic"): FaceFilter => ({ id, label, tab, anchor, scale });
const M = (id: string, label: string, makeup: FaceFilter["makeup"], color: string, strength = 1): FaceFilter => ({ id, label, tab: "makeup", makeup, color, strength });

/** The phones' list (Android FaceFilterItem.ALL), same ids, same order. Hair colour is the one
 *  makeup item the web leaves out: it needs a hair mask the web's person cut-out does not give. */
export const FACE_FILTERS: FaceFilter[] = [
  S("glasses_round", "Round Glasses", "eyes"), S("glasses_square", "Square Glasses", "eyes"),
  S("glasses_aviator", "Aviators", "eyes"), S("glasses_heart", "Heart Glasses", "eyes"),
  S("glasses_star", "Star Glasses", "eyes"), S("glasses_nerd", "Nerd Glasses", "eyes"),
  S("ears_cat", "Cat Ears", "head_top"), S("ears_dog", "Dog Ears", "head_top"),
  S("ears_bunny", "Bunny Ears", "head_top", 1.15), S("horns_devil", "Devil Horns", "head_top"),
  S("halo_angel", "Halo", "head_top", 1.3), S("horn_unicorn", "Unicorn Horn", "head_top"),
  S("mustache_classic", "Mustache", "nose_mouth"), S("mustache_handlebar", "Handlebar", "nose_mouth"),
  S("clown_nose", "Clown Nose", "nose_mouth", 0.7), S("vampire_fangs", "Vampire Fangs", "nose_mouth", 0.9),
  S("hat_party", "Party Hat", "head_top", 1.4), S("crown_gold", "Crown", "head_top", 1.4),
  S("crown_flower", "Flower Crown", "head_top", 1.5), S("hat_wizard", "Wizard Hat", "head_top", 1.6),
  M("lipstick_red", "Red Lipstick", "lipstick", "#C81E3A"), M("lipstick_pink", "Pink Lipstick", "lipstick", "#E8579A"),
  M("lipstick_coral", "Coral Lipstick", "lipstick", "#F0704A"), M("lipstick_purple", "Vamp Lipstick", "lipstick", "#5A1A4A"),
  M("blush_pink", "Pink Blush", "blush", "#FF6FA0"), M("blush_peach", "Peach Blush", "blush", "#FFA366"),
  M("eyeshadow_purple", "Smoky Purple", "eyeshadow", "#6A3FA0"), M("eyeshadow_blue", "Ocean Blue", "eyeshadow", "#2E7FBF"),
  M("eyeshadow_gold", "Bronze Gold", "eyeshadow", "#C08A2E"), M("freckles", "Freckles", "freckles", "#8A5A2E"),
  M("smooth_soft", "Smooth Skin", "smooth", "#F2C9A8", 0.6), M("smooth_max", "Flawless Skin", "smooth", "#F7DCC4", 1),
  M("lipstick_nude", "Nude Lipstick", "lipstick", "#B5726A"), M("lipstick_berry", "Berry Lipstick", "lipstick", "#8A1E4A"),
  M("lipstick_orange", "Orange Lipstick", "lipstick", "#E8502A"), M("lipstick_plum", "Plum Lipstick", "lipstick", "#6A2A5A"),
  M("lipstick_rose", "Rose Lipstick", "lipstick", "#C85A7A"), M("lipstick_cherry", "Cherry Red", "lipstick", "#E0102A"),
  M("eyeliner_black", "Black Eyeliner", "eyeliner", "#141414"), M("eyeliner_brown", "Brown Eyeliner", "eyeliner", "#4A2A16"),
  M("eyeliner_navy", "Navy Eyeliner", "eyeliner", "#1A2A6A"), M("eyeliner_emerald", "Emerald Eyeliner", "eyeliner", "#0E6A4A"),
  M("lashes_natural", "Natural Lashes", "lashes", "#1A1410", 0.6), M("lashes_dramatic", "Dramatic Lashes", "lashes", "#050505", 1),
  M("contour_soft", "Soft Contour", "contour", "#7A4A2E"), M("highlight_glow", "Glow Highlight", "highlight", "#FFF2D6"),
  S("funny_googly_eyes", "Googly Eyes", "eyes", 1.2, "funny"), S("funny_groucho_glasses", "Groucho", "eyes", 1, "funny"),
  S("funny_swirl_specs", "Hypno Specs", "eyes", 1, "funny"), S("funny_big_unibrow", "Big Unibrow", "eyes", 0.85, "funny"),
  S("funny_pig_nose", "Pig Nose", "nose_mouth", 1.6, "funny"), S("funny_buck_teeth", "Buck Teeth", "nose_mouth", 0.9, "funny"),
  S("funny_tongue_out", "Tongue Out", "nose_mouth", 0.8, "funny"), S("funny_rainbow_mustache", "Rainbow Stache", "nose_mouth", 1, "funny"),
  S("funny_walrus_mustache", "Walrus Stache", "nose_mouth", 1, "funny"), S("funny_clown_nose_big", "Giant Clown Nose", "nose_mouth", 0.6, "funny"),
  S("funny_robot_smile", "Robot Smile", "nose_mouth", 0.95, "funny"), S("funny_propeller_hat", "Propeller Hat", "head_top", 1.3, "funny"),
  S("funny_rainbow_mohawk", "Rainbow Mohawk", "head_top", 1.2, "funny"), S("funny_donkey_ears", "Donkey Ears", "head_top", 1.1, "funny"),
  S("funny_alien_antennae", "Alien Antennae", "head_top", 1, "funny"), S("funny_toilet_paper_hat", "TP Hat", "head_top", 1.4, "funny"),
];

export const filterImageUrl = (f: FaceFilter) => `/filters/filter_${f.id}.png`;

/** A sticker on the camera: still image, animated GIF/WebP (decoded frame by frame where the
 *  browser can), or a WebM video sticker. */
interface CamSticker {
  id: string;
  x: number;
  y: number;
  img?: HTMLImageElement;
  video?: HTMLVideoElement;
  frames?: { bmp: ImageBitmap; ms: number }[];
  total?: number;
}

export interface CamBackground { url: string; isVideo: boolean }

const FACE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const FPS = 24;

/** Ticks that keep going in a background tab (a timer in a worker is not throttled to 1/s the way
 *  requestAnimationFrame and window timers are), so viewers never see a frozen battler. */
function makeTicker(fps: number, onTick: () => void): () => void {
  try {
    const src = `let t=setInterval(()=>postMessage(0),${Math.round(1000 / fps)});onmessage=()=>clearInterval(t);`;
    const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
    const w = new Worker(url);
    w.onmessage = () => onTick();
    return () => { w.postMessage(0); w.terminate(); URL.revokeObjectURL(url); };
  } catch {
    const id = window.setInterval(onTick, Math.round(1000 / fps));
    return () => window.clearInterval(id);
  }
}

let visionFileset: Promise<unknown> | null = null;
async function fileset() {
  const { FilesetResolver } = await import("@mediapipe/tasks-vision");
  visionFileset ??= FilesetResolver.forVisionTasks(SEGMENTER_WASM_BASE).catch((e) => { visionFileset = null; throw e; });
  return visionFileset as ReturnType<typeof FilesetResolver.forVisionTasks>;
}

/** Camera -> background -> face filter -> stickers, drawn on a canvas that is sent instead. */
export class CameraFx implements TrackProcessor<Track.Kind.Video> {
  name = "bb-camera-fx";
  processedTrack?: MediaStreamTrack;
  private video = document.createElement("video");
  private canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d")!;
  private stopTicker: (() => void) | null = null;
  // background
  background: CamBackground | null = null;
  private bgImg: HTMLImageElement | null = null;
  private bgVideo: HTMLVideoElement | null = null;
  private segmenter: ImageSegmenter | null = null;
  private segLoading = false;
  private maskCanvas: HTMLCanvasElement | null = null;
  private maskData: ImageData | null = null;
  private prevMask: Float32Array | null = null;
  private personCanvas = document.createElement("canvas");
  private lastSegTime = -1;
  // face filter
  filter: FaceFilter | null = null;
  private landmarker: FaceLandmarker | null = null;
  private lmLoading = false;
  private face: NormalizedLandmark[] | null = null;
  private lastFaceTime = -1;
  private sprites = new Map<string, HTMLImageElement>();
  private smoothCanvas = document.createElement("canvas");
  // stickers
  private stickers: CamSticker[] = [];
  private startedAt = performance.now();
  /** Something could not load (model, background): the caller shows a message. */
  onError: ((what: "background" | "filters") => void) | null = null;

  constructor() {
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.autoplay = true;
  }

  async init(opts: ProcessorOptions<Track.Kind.Video>) {
    this.setSource(opts.track);
    const s = opts.track.getSettings();
    this.canvas.width = s.width || 640;
    this.canvas.height = s.height || 480;
    this.processedTrack = this.canvas.captureStream(FPS).getVideoTracks()[0];
    this.stopTicker = makeTicker(FPS, () => this.frame());
  }

  async restart(opts: ProcessorOptions<Track.Kind.Video>) {
    this.setSource(opts.track);
  }

  private setSource(track: MediaStreamTrack) {
    this.video.srcObject = new MediaStream([track]);
    this.video.play().catch(() => undefined);
  }

  async destroy() {
    this.stopTicker?.();
    this.stopTicker = null;
    this.processedTrack?.stop();
    this.processedTrack = undefined;
    this.video.srcObject = null;
    this.setBackground(null);
    this.clearStickers();
    this.segmenter?.close();
    this.segmenter = null;
    this.landmarker?.close();
    this.landmarker = null;
  }

  /** Nothing on: the caller takes the processor off and sends the plain camera again. */
  get idle() { return !this.background && !this.filter && this.stickers.length === 0; }

  // ---------------------------------------------------------------- background

  setBackground(bg: CamBackground | null) {
    this.background = bg;
    if (this.bgVideo) { try { this.bgVideo.pause(); this.bgVideo.removeAttribute("src"); this.bgVideo.load(); } catch { /* ignore */ } }
    this.bgVideo = null;
    this.bgImg = null;
    if (!bg) return;
    if (bg.isVideo) {
      const v = document.createElement("video");
      v.crossOrigin = "anonymous";
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.src = bg.url;
      v.onerror = () => { if (this.bgVideo === v) this.onError?.("background"); };
      v.play().catch(() => undefined);
      this.bgVideo = v;
    } else {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onerror = () => { if (this.bgImg === img) this.onError?.("background"); };
      img.src = bg.url;
      this.bgImg = img;
    }
    this.loadSegmenter();
  }

  private loadSegmenter() {
    if (this.segmenter || this.segLoading) return;
    this.segLoading = true;
    (async () => {
      const { ImageSegmenter } = await import("@mediapipe/tasks-vision");
      const fs = await fileset();
      const make = (delegate: "GPU" | "CPU") => ImageSegmenter.createFromOptions(fs, {
        baseOptions: { modelAssetPath: SEGMENTER_MODEL_URL, delegate },
        runningMode: "VIDEO", outputConfidenceMasks: true, outputCategoryMask: false,
      });
      this.segmenter = await make("GPU").catch(() => make("CPU"));
    })().catch(() => { this.onError?.("background"); }).finally(() => { this.segLoading = false; });
  }

  // ---------------------------------------------------------------- face filters

  setFilter(f: FaceFilter | null) {
    this.filter = f;
    this.face = null;
    if (!f) return;
    if (f.anchor && !this.sprites.has(f.id)) {
      const img = new Image();
      img.src = filterImageUrl(f);
      this.sprites.set(f.id, img);
    }
    this.loadLandmarker();
  }

  private loadLandmarker() {
    if (this.landmarker || this.lmLoading) return;
    this.lmLoading = true;
    (async () => {
      const { FaceLandmarker } = await import("@mediapipe/tasks-vision");
      const fs = await fileset();
      const make = (delegate: "GPU" | "CPU") => FaceLandmarker.createFromOptions(fs, {
        baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate },
        runningMode: "VIDEO", numFaces: 1,
      });
      this.landmarker = await make("GPU").catch(() => make("CPU"));
    })().catch(() => { this.onError?.("filters"); }).finally(() => { this.lmLoading = false; });
  }

  // ---------------------------------------------------------------- stickers

  get stickerCount() { return this.stickers.length; }

  /** A free spot: down the middle, then the sides (the phones' LiveBarTools.addSticker). */
  async addSticker(url: string): Promise<boolean> {
    const spots: [number, number][] = [[0.5, 0.3], [0.5, 0.6], [0.25, 0.45], [0.75, 0.45], [0.25, 0.75], [0.75, 0.75]];
    const [x, y] = spots[this.stickers.length % spots.length];
    const s: CamSticker = { id: `${Date.now()}-${Math.random()}`, x, y };
    const ext = (url.split("?")[0].split(".").pop() || "").toLowerCase();
    try {
      if (ext === "webm" || ext === "mp4") {
        const v = document.createElement("video");
        v.crossOrigin = "anonymous"; v.muted = true; v.loop = true; v.playsInline = true; v.src = url;
        await v.play();
        s.video = v;
      } else {
        const animated = (ext === "gif" || ext === "webp") ? await decodeAnimated(url, ext) : null;
        if (animated && animated.frames.length > 1) { s.frames = animated.frames; s.total = animated.total; }
        else {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.src = url;
          await img.decode();
          s.img = img;
        }
      }
    } catch { return false; }
    this.stickers.push(s);
    return true;
  }

  removeLastSticker() { const s = this.stickers.pop(); if (s) freeSticker(s); }
  clearStickers() { this.stickers.forEach(freeSticker); this.stickers = []; }

  // ---------------------------------------------------------------- the frame

  private frame() {
    try { this.draw(); } catch { /* a bad frame is skipped, never the stream */ }
  }

  private draw() {
    const v = this.video;
    if (v.readyState < 2 || !v.videoWidth) return;
    const W = v.videoWidth, H = v.videoHeight;
    const c = this.canvas, g = this.ctx;
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }

    // 1. the camera, or the person over the background
    const seg = this.background ? this.segmenter : null;
    if (seg) {
      if (v.currentTime !== this.lastSegTime) {
        this.lastSegTime = v.currentTime;
        seg.segmentForVideo(v, performance.now(), (res) => {
          const m = res.confidenceMasks?.[res.confidenceMasks.length - 1];
          if (m) this.updateMask(m.getAsFloat32Array(), m.width, m.height);
        });
      }
    }
    if (this.background && this.maskCanvas) {
      g.fillStyle = "#000";
      g.fillRect(0, 0, W, H);
      const bv = this.bgVideo, bi = this.bgImg;
      if (bv && bv.readyState >= 2 && bv.videoWidth) g.drawImage(bv, ...cover(bv.videoWidth, bv.videoHeight, W, H));
      else if (bi && bi.complete && bi.naturalWidth) g.drawImage(bi, ...cover(bi.naturalWidth, bi.naturalHeight, W, H));
      const pc = this.personCanvas;
      if (pc.width !== W || pc.height !== H) { pc.width = W; pc.height = H; }
      const p = pc.getContext("2d")!;
      p.globalCompositeOperation = "source-over";
      p.clearRect(0, 0, W, H);
      p.drawImage(v, 0, 0, W, H);
      p.globalCompositeOperation = "destination-in";
      p.filter = "blur(1.5px)";
      p.drawImage(this.maskCanvas, 0, 0, W, H);
      p.filter = "none";
      p.globalCompositeOperation = "source-over";
      g.drawImage(pc, 0, 0);
    } else {
      g.drawImage(v, 0, 0, W, H);
    }

    // 2. the face filter
    const f = this.filter;
    const lm = f ? this.landmarker : null;
    if (f && lm) {
      if (v.currentTime !== this.lastFaceTime) {
        this.lastFaceTime = v.currentTime;
        const r = lm.detectForVideo(v, performance.now());
        this.face = r.faceLandmarks?.[0] ?? null;
      }
      if (this.face) drawFilter(g, f, this.face, W, H, this.sprites.get(f.id), this.smoothCanvas);
    }

    // 3. stickers, 22% of the frame's height each (StickerOverlayItem.BASE_IMAGE_SIZE_FRACTION)
    const now = performance.now() - this.startedAt;
    for (const s of this.stickers) {
      let src: CanvasImageSource | null = null, sw = 0, sh = 0;
      if (s.video && s.video.readyState >= 2) { src = s.video; sw = s.video.videoWidth; sh = s.video.videoHeight; }
      else if (s.frames && s.total) {
        let t = now % s.total;
        let fr = s.frames[0];
        for (const x of s.frames) { if (t < x.ms) { fr = x; break; } t -= x.ms; }
        src = fr.bmp; sw = fr.bmp.width; sh = fr.bmp.height;
      } else if (s.img) { src = s.img; sw = s.img.naturalWidth; sh = s.img.naturalHeight; }
      if (!src || !sw || !sh) continue;
      const th = 0.22 * H, tw = th * (sw / sh);
      g.drawImage(src, s.x * W - tw / 2, s.y * H - th / 2, tw, th);
    }
  }

  private updateMask(conf: Float32Array, mw: number, mh: number) {
    let mc = this.maskCanvas;
    if (!mc || mc.width !== mw || mc.height !== mh) {
      mc = document.createElement("canvas");
      mc.width = mw; mc.height = mh;
      this.maskCanvas = mc;
      this.prevMask = null;
      this.maskData = null;
    }
    let prev = this.prevMask;
    if (!prev || prev.length !== conf.length) { prev = new Float32Array(conf); this.prevMask = prev; }
    let data = this.maskData;
    if (!data) {
      data = new ImageData(mw, mh);
      for (let i = 0; i < data.data.length; i += 4) { data.data[i] = 255; data.data[i + 1] = 255; data.data[i + 2] = 255; }
      this.maskData = data;
    }
    const px = data.data;
    for (let i = 0; i < conf.length; i++) {
      const v = conf[i] * 0.7 + prev[i] * 0.3;
      prev[i] = v;
      const x = Math.min(1, Math.max(0, (v - 0.3) / 0.4));
      px[i * 4 + 3] = Math.round(x * x * (3 - 2 * x) * 255);
    }
    mc.getContext("2d")!.putImageData(data, 0, 0);
  }
}

function freeSticker(s: CamSticker) {
  if (s.video) { try { s.video.pause(); s.video.removeAttribute("src"); s.video.load(); } catch { /* ignore */ } }
  s.frames?.forEach((f) => f.bmp.close());
}

/** An animated GIF / WebP as frames, where the browser has ImageDecoder (Chrome, Edge). */
async function decodeAnimated(url: string, ext: string): Promise<{ frames: { bmp: ImageBitmap; ms: number }[]; total: number } | null> {
  const ID = (window as unknown as { ImageDecoder?: new (o: { data: ArrayBuffer; type: string }) => {
    tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null };
    decode: (o: { frameIndex: number }) => Promise<{ image: VideoFrame }>; close: () => void;
  } }).ImageDecoder;
  if (!ID) return null;
  const data = await (await fetch(url)).arrayBuffer();
  const dec = new ID({ data, type: ext === "gif" ? "image/gif" : "image/webp" });
  try {
    await dec.tracks.ready;
    const n = Math.min(120, dec.tracks.selectedTrack?.frameCount ?? 1);
    const frames: { bmp: ImageBitmap; ms: number }[] = [];
    let total = 0;
    for (let i = 0; i < n; i++) {
      const { image } = await dec.decode({ frameIndex: i });
      const ms = Math.max(20, (image.duration ?? 100000) / 1000);
      frames.push({ bmp: await createImageBitmap(image), ms });
      total += ms;
      image.close();
    }
    return { frames, total };
  } finally { dec.close(); }
}

function cover(sw: number, sh: number, W: number, H: number): [number, number, number, number] {
  const s = Math.max(W / sw, H / sh);
  const w = sw * s, h = sh * s;
  return [(W - w) / 2, (H - h) / 2, w, h];
}

// ---- drawing a filter on a face (MediaPipe's 478 landmarks, normalised 0..1) ----

const LIPS_OUTER = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const LID_L = [33, 246, 161, 160, 159, 158, 157, 173, 133];
const LID_R = [263, 466, 388, 387, 386, 385, 384, 398, 362];
const BROW_L = [70, 63, 105, 66, 107];
const BROW_R = [300, 293, 334, 296, 336];

function drawFilter(g: CanvasRenderingContext2D, f: FaceFilter, lm: NormalizedLandmark[], W: number, H: number, sprite: HTMLImageElement | undefined, smooth: HTMLCanvasElement) {
  const P = (i: number) => ({ x: (lm[i]?.x ?? 0) * W, y: (lm[i]?.y ?? 0) * H });
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(b.x - a.x, b.y - a.y);
  const eyeL = lm.length > 473 ? P(468) : mid(P(33), P(133));
  const eyeR = lm.length > 473 ? P(473) : mid(P(263), P(362));
  const roll = Math.atan2(eyeR.y - eyeL.y, eyeR.x - eyeL.x);
  const faceW = dist(P(234), P(454));

  if (f.anchor) {
    if (!sprite || !sprite.complete || !sprite.naturalWidth) return;
    let cx: number, cy: number, w: number;
    const k = f.scale ?? 1;
    if (f.anchor === "eyes") {
      const eyeDist = dist(eyeL, eyeR);
      cx = (eyeL.x + eyeR.x) / 2; cy = (eyeL.y + eyeR.y) / 2;
      w = (eyeDist / (240 / 512)) * 1.35 * k;
    } else if (f.anchor === "nose_mouth") {
      const ml = P(61), mr = P(291), nose = P(2);
      const mouthW = dist(ml, mr);
      const mouthCy = (ml.y + mr.y) / 2;
      cx = nose.x;
      cy = f.id.includes("nose") ? nose.y - mouthW * 0.2 : (nose.y + mouthCy) / 2;
      w = (mouthW / (280 / 512)) * k;
    } else {
      // The face's own top (landmark 10 is the top of the forehead) — the asset's bottom edge sits
      // a little into it, like the phones' HEAD_TOP_OVERLAP.
      const top = P(10);
      w = faceW * 1.15 * k;
      cx = top.x; cy = top.y - w / 2 + w * 0.3;
    }
    g.save();
    g.translate(cx, cy);
    g.rotate(roll);
    g.drawImage(sprite, -w / 2, -w / 2, w, w);
    g.restore();
    return;
  }

  const color = f.color ?? "#000";
  const poly = (ids: number[]) => { g.beginPath(); ids.forEach((i, n) => { const p = P(i); if (n) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); }); g.closePath(); };
  const line = (ids: number[]) => { g.beginPath(); ids.forEach((i, n) => { const p = P(i); if (n) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); }); };
  const glow = (x: number, y: number, r: number, alpha: number, rx = 1, ry = 1) => {
    g.save();
    g.translate(x, y);
    g.scale(rx, ry);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
    grad.addColorStop(0, hexA(color, alpha));
    grad.addColorStop(1, hexA(color, 0));
    g.fillStyle = grad;
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    g.restore();
  };
  g.save();
  switch (f.makeup) {
    case "lipstick":
      poly(LIPS_OUTER);
      // keep the mouth opening clear
      [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191].forEach((i, n) => { const p = P(i); if (n) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); });
      g.closePath();
      g.globalCompositeOperation = "multiply";
      g.fillStyle = hexA(color, 0.55);
      g.fill("evenodd");
      break;
    case "blush":
      glow(P(50).x, P(50).y, faceW * 0.13, 0.4);
      glow(P(280).x, P(280).y, faceW * 0.13, 0.4);
      break;
    case "eyeshadow":
      for (const [lid, brow] of [[LID_L, BROW_L], [LID_R, BROW_R]] as const) {
        g.beginPath();
        lid.forEach((i, n) => { const p = P(i); if (n) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); });
        [...brow].reverse().forEach((i, n) => {
          const b = P(i), l = P(lid[Math.round((lid.length - 1) * (1 - n / (brow.length - 1)))]);
          g.lineTo(l.x + (b.x - l.x) * 0.55, l.y + (b.y - l.y) * 0.55);
        });
        g.closePath();
        g.filter = `blur(${Math.max(2, faceW * 0.012)}px)`;
        g.fillStyle = hexA(color, 0.45);
        g.fill();
        g.filter = "none";
      }
      break;
    case "eyeliner":
    case "lashes": {
      const lw = faceW * (f.makeup === "lashes" ? 0.012 * (1 + (f.strength ?? 1)) : 0.011);
      g.strokeStyle = color;
      g.lineWidth = lw;
      g.lineCap = "round";
      g.lineJoin = "round";
      for (const lid of [LID_L, LID_R]) {
        line(lid); g.stroke();
        if (f.makeup === "lashes") {
          lid.slice(1, -1).forEach((i) => {
            const p = P(i);
            g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x, p.y - faceW * 0.03 * (f.strength ?? 1)); g.lineWidth = lw * 0.5; g.stroke();
          });
          g.lineWidth = lw;
        } else {
          // a small wing past the outer corner
          const o = P(lid[0]), n = P(lid[1]);
          g.beginPath(); g.moveTo(o.x, o.y); g.lineTo(o.x + (o.x - n.x) * 1.2, o.y - faceW * 0.02); g.stroke();
        }
      }
      break;
    }
    case "freckles": {
      let seed = 42;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      g.fillStyle = hexA(color, 0.55);
      for (const c of [P(205), P(425)]) {
        for (let i = 0; i < 18; i++) {
          const a = rnd() * Math.PI * 2, r = rnd() * faceW * 0.09;
          g.beginPath(); g.arc(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r * 0.7, faceW * (0.004 + rnd() * 0.004), 0, Math.PI * 2); g.fill();
        }
      }
      break;
    }
    case "contour":
      glow(P(147).x, P(147).y, faceW * 0.14, 0.32, 1.4, 0.5);
      glow(P(376).x, P(376).y, faceW * 0.14, 0.32, 1.4, 0.5);
      break;
    case "highlight":
      g.globalCompositeOperation = "screen";
      glow(P(6).x, (P(6).y + P(4).y) / 2, faceW * 0.08, 0.5, 0.5, 1.6);
      glow(P(117).x, P(117).y, faceW * 0.09, 0.45);
      glow(P(346).x, P(346).y, faceW * 0.09, 0.45);
      break;
    case "smooth": {
      // A blurred copy of the face, inside the face's outline, over the face (the phones' BeautyGlPass).
      if (smooth.width !== W || smooth.height !== H) { smooth.width = W; smooth.height = H; }
      const s = smooth.getContext("2d")!;
      s.clearRect(0, 0, W, H);
      s.filter = `blur(${Math.max(2, faceW * 0.02)}px)`;
      s.drawImage(g.canvas, 0, 0);
      s.filter = "none";
      poly(FACE_OVAL);
      g.clip();
      g.globalAlpha = 0.45 + 0.4 * (f.strength ?? 1);
      g.drawImage(smooth, 0, 0);
      break;
    }
  }
  g.restore();
}

function mid(a: { x: number; y: number }, b: { x: number; y: number }) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
function hexA(hex: string, a: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ================================================================== hooking them to a room

/** The tools of one publishing member, on whatever room they are in. `tracks()` returns the
 *  local camera and mic as published right now (either may be missing). */
export class LiveFx {
  mic: MixedMic | null = null;
  cam: CameraFx | null = null;
  private audioCtx: AudioContext | null = null;
  private micTrack: LocalAudioTrack | null = null;
  private camTrack: LocalVideoTrack | null = null;
  private tracks: () => { camera?: LocalVideoTrack | null; mic?: LocalAudioTrack | null };
  constructor(tracks: () => { camera?: LocalVideoTrack | null; mic?: LocalAudioTrack | null }) { this.tracks = tracks; }

  /** The mixed mic, put on the published mic the first time a sound, song or voice needs it. */
  async ensureMic(): Promise<MixedMic | null> {
    const t = this.tracks().mic ?? null;
    if (!t) return null;
    if (this.mic && this.micTrack === t && t.getProcessor() === this.mic) return this.mic;
    try {
      this.audioCtx ??= new AudioContext();
      void this.audioCtx.resume().catch(() => undefined);
      t.setAudioContext(this.audioCtx);
      const p = new MixedMic();
      await t.setProcessor(p);
      this.mic = p;
      this.micTrack = t;
      return p;
    } catch { return null; }
  }

  /** The camera pipeline, put on the published camera while anything is on it. */
  async ensureCam(): Promise<CameraFx | null> {
    const t = this.tracks().camera ?? null;
    if (!t) return null;
    if (this.cam && this.camTrack === t && t.getProcessor() === this.cam) return this.cam;
    try {
      // A new camera track (a reconnect) starts a fresh pipeline; the old one goes.
      if (this.cam) { const old = this.cam; this.cam = null; await old.destroy().catch(() => undefined); }
      const p = new CameraFx();
      await t.setProcessor(p);
      this.cam = p;
      this.camTrack = t;
      return p;
    } catch { return null; }
  }

  /** Nothing left on the camera: send it plain again. */
  async releaseCamIfIdle() {
    const p = this.cam;
    if (!p || !p.idle) return;
    const t = this.camTrack;
    this.cam = null;
    this.camTrack = null;
    try { if (t && t.getProcessor() === p) await t.stopProcessor(); else await p.destroy(); } catch { /* ignore */ }
  }

  async dispose() {
    try { this.mic?.stopSound(); this.mic?.stopMusic(); this.mic?.stopVoices(); } catch { /* ignore */ }
    const mt = this.micTrack, ct = this.camTrack, m = this.mic, c = this.cam;
    this.mic = null; this.cam = null; this.micTrack = null; this.camTrack = null;
    try { if (mt && m && mt.getProcessor() === m) await mt.stopProcessor(); else await m?.destroy(); } catch { /* ignore */ }
    try { if (ct && c && ct.getProcessor() === c) await ct.stopProcessor(); else await c?.destroy(); } catch { /* ignore */ }
    try { await this.audioCtx?.close(); } catch { /* ignore */ }
    this.audioCtx = null;
  }
}
