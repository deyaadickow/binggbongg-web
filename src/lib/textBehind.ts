// Text Behind Photo (Steve, 2026-11-02: "Yes, build both on all three platforms"). Big text drawn
// BEHIND the person in a photo: (1) the photo, (2) the text, (3) the person cut out of the same
// photo, on top. Everything is drawn in the browser — no server image processing, no AI cost.
//
// The style NAMES and LOOKS are the same on all three platforms; which styles exist, which are
// premium and what they cost come from the server (fetchTextPhotoStyles), so admin can change a
// price with no release. A premium style is charged once per finished image, at Save/Share
// (chargeTextPhotoStyle — the CALLER pays, coins to Bingg Bongg, dead coins welcome).
import { post } from "./api";

// ---- The server's style list + the charge -------------------------------------------------

export type TextPhotoStyle = { key: string; name: string; font: string; is_premium: boolean; coins: number; sort: number };

const bool = (v: unknown) => v === true || v === 1 || v === "1" || v === "true";

/** Recipe keys are the style keys, lower case; "3D" may arrive as "3d", "three_d" or "threed". */
export function styleKeyOf(raw: string): string {
  const k = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  return k === "threed" || k === "3d" ? "3d" : k;
}

/** The 14 styles of the spec, used only to draw the shelf before (or without) the server's list. */
export const DEFAULT_STYLES: TextPhotoStyle[] = [
  ["bold", "Bold", "Anton"], ["clean", "Clean", "Bebas Neue"], ["script", "Script", "Pacifico"], ["black", "Black", "Anton"],
  ["gold", "Gold", "Anton"], ["neon", "Neon", "Bebas Neue"], ["3d", "3D", "Bungee"], ["glitter", "Glitter", "Anton"],
  ["chrome", "Chrome", "Anton"], ["fire", "Fire", "Anton"], ["ice", "Ice", "Bebas Neue"], ["rainbow", "Rainbow", "Bungee"],
  ["graffiti", "Graffiti", "Permanent Marker"], ["outline", "Outline", "Anton"],
].map(([key, name, font], i) => ({ key, name, font, is_premium: i >= 4, coins: i >= 4 ? 10 : 0, sort: i + 1 }));

/** The server's list, in its order, keeping only styles this page knows how to draw. null = no answer. */
export async function fetchTextPhotoStyles(userId: number): Promise<TextPhotoStyle[] | null> {
  // Never an empty body: the host's WAF answers an empty-body POST with a 403.
  const res = await post<unknown>("fetchTextPhotoStyles", { user_id: userId }).catch(() => null);
  const list = res?.status ? (Array.isArray(res.data) ? res.data : Array.isArray((res.data as { styles?: unknown })?.styles) ? (res.data as { styles: unknown[] }).styles : null) : null;
  if (!list) return null;
  const out: TextPhotoStyle[] = [];
  for (const raw of list as Record<string, unknown>[]) {
    if (!raw || typeof raw !== "object") continue;
    if (raw.is_active !== undefined && !bool(raw.is_active)) continue;
    const key = styleKeyOf(String(raw.key ?? raw.style_key ?? raw.name ?? ""));
    if (!RECIPES[key]) continue;
    // "coins == 0" is free — a premium style whose admin price is 0 is free too.
    const coins = Math.max(0, Math.round(Number(raw.coins) || 0));
    out.push({
      key, name: String(raw.name ?? key), font: String(raw.font ?? DEFAULT_STYLES.find((d) => d.key === key)?.font ?? "Anton"),
      is_premium: bool(raw.is_premium) && coins > 0, coins, sort: Number(raw.sort) || 0,
    });
  }
  return out.sort((a, b) => a.sort - b.sort);
}

export type TextPhotoCharge =
  | { ok: true; saveId: number | null; coinsCharged: number; coinsLeft: number | null }
  | { ok: false; notEnoughCoins: boolean; styleUnavailable: boolean; message: string };

/** A fresh id for one finished picture (≤ 64 chars). The same id again is free on the server. */
export function newClientRef(): string {
  try { return crypto.randomUUID(); } catch { return `tbp-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`; }
}

/**
 * Charge the caller for one finished picture in this style, at Save/Share (free styles too: it
 * records the save, 0 coins). `clientRef` names THIS picture: Save + Share + Save to Photos of the
 * same picture — or a network retry — send the same ref and are charged once.
 */
export async function chargeTextPhotoStyle(userId: number, styleKey: string, clientRef: string): Promise<TextPhotoCharge> {
  const res = await post<Record<string, unknown>>("chargeTextPhotoStyle", { user_id: userId, style_key: styleKey, client_ref: clientRef });
  const d = (res.data && typeof res.data === "object" ? res.data : {}) as Record<string, unknown>;
  if (!res.status) {
    const m = res.message ?? "";
    return { ok: false, notEnoughCoins: m === "not_enough_coins", styleUnavailable: m === "style_unavailable", message: m };
  }
  const left = d.coins_left ?? res.coins_left;
  return {
    ok: true, saveId: Number(d.save_id) || null, coinsCharged: Number(d.coins_charged ?? 0) || 0,
    coinsLeft: left === undefined || left === null ? null : Number(left),
  };
}

// ---- Fonts (bundled OFL / Apache Google Fonts, never hotlinked) ----------------------------

const FONT_FILES: Record<string, [family: string, file: string]> = {
  "anton": ["TBP Anton", "Anton-Regular.ttf"],
  "bebas neue": ["TBP Bebas Neue", "BebasNeue-Regular.ttf"],
  "pacifico": ["TBP Pacifico", "Pacifico-Regular.ttf"],
  "bungee": ["TBP Bungee", "Bungee-Regular.ttf"],
  "permanent marker": ["TBP Permanent Marker", "PermanentMarker-Regular.ttf"],
};
export const familyOf = (font: string): string => (FONT_FILES[font.toLowerCase()] ?? FONT_FILES.anton)[0];

let fontsReady: Promise<void> | null = null;
/** Loads the five fonts once (from /fonts/text-behind/). Resolves even if one fails — it then draws in a fallback. */
export function loadTextBehindFonts(): Promise<void> {
  if (fontsReady) return fontsReady;
  fontsReady = Promise.all(Object.values(FONT_FILES).map(async ([family, file]) => {
    try {
      const face = new FontFace(family, `url(/fonts/text-behind/${file})`);
      await face.load();
      document.fonts.add(face);
    } catch { /* that style falls back to a system font */ }
  })).then(() => undefined);
  return fontsReady;
}

// ---- Drawing ------------------------------------------------------------------------------

export const FREE_COLORS = ["#FFFFFF", "#000000", "#F0C420", "#E53935", "#1E88E5", "#EC407A"];

export type TextLayout = {
  text: string;
  /** Centre of the text block, 0..1 of the picture's width / height. */
  cx: number; cy: number;
  /** Font size as a fraction of the picture's width. */
  size: number;
  /** Degrees, small (-15..15). */
  tilt: number;
  /** Only the free styles take it. */
  color: string;
};

/** Per-font line height and how wide a glyph run is, so the block sits centred and 2 lines don't collide. */
const LINE_HEIGHT: Record<string, number> = { "TBP Anton": 1.08, "TBP Bebas Neue": 0.98, "TBP Pacifico": 1.35, "TBP Bungee": 1.08, "TBP Permanent Marker": 1.18 };

type Block = { lines: string[]; px: number; lineH: number; ys: number[]; w: number; h: number; family: string };

function block(ctx: CanvasRenderingContext2D, layout: TextLayout, family: string, W: number): Block {
  const lines = layout.text.split("\n").slice(0, 2).map((l) => l.trimEnd());
  const px = Math.max(4, layout.size * W);
  ctx.font = `${px}px "${family}", Impact, "Arial Black", sans-serif`;
  const lineH = px * (LINE_HEIGHT[family] ?? 1.1);
  const n = lines.length;
  const ys = lines.map((_, i) => (i - (n - 1) / 2) * lineH);
  const w = Math.max(1, ...lines.map((l) => ctx.measureText(l).width));
  return { lines, px, lineH, ys, w, h: lineH * n, family };
}

const fillAll = (ctx: CanvasRenderingContext2D, b: Block, dx = 0, dy = 0) => b.lines.forEach((l, i) => ctx.fillText(l, dx, b.ys[i] + dy));
const strokeAll = (ctx: CanvasRenderingContext2D, b: Block, dx = 0, dy = 0) => b.lines.forEach((l, i) => ctx.strokeText(l, dx, b.ys[i] + dy));
const vGradient = (ctx: CanvasRenderingContext2D, b: Block, stops: [number, string][]) => {
  const g = ctx.createLinearGradient(0, -b.h / 2, 0, b.h / 2);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
};
const hGradient = (ctx: CanvasRenderingContext2D, b: Block, stops: [number, string][]) => {
  const g = ctx.createLinearGradient(-b.w / 2, 0, b.w / 2, 0);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
};
const GOLD: [number, string][] = [[0, "#FFF3A0"], [0.5, "#F0C420"], [1, "#B8860B"]];

/** A small seeded random, so the glitter is the same in the preview and in the saved picture. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

type Recipe = (ctx: CanvasRenderingContext2D, b: Block, color: string) => void;

/** One function per style: the same names and looks as the phones. Drawn on the text's own layer. */
const RECIPES: Record<string, Recipe> = {
  bold: (ctx, b, color) => { ctx.fillStyle = color; fillAll(ctx, b); },
  clean: (ctx, b, color) => { ctx.fillStyle = color; fillAll(ctx, b); },
  script: (ctx, b, color) => { ctx.fillStyle = color; fillAll(ctx, b); },
  black: (ctx, b, color) => { ctx.fillStyle = color; fillAll(ctx, b); },
  gold: (ctx, b) => {
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#3B2A00"; ctx.lineWidth = b.px * 0.045; strokeAll(ctx, b);
    ctx.fillStyle = vGradient(ctx, b, GOLD); fillAll(ctx, b);
  },
  neon: (ctx, b) => {
    ctx.fillStyle = "#FFFFFF";
    ctx.shadowColor = "#FF2FD0"; ctx.shadowBlur = b.px * 0.45; fillAll(ctx, b); fillAll(ctx, b);
    ctx.shadowColor = "#22E4FF"; ctx.shadowBlur = b.px * 0.16; fillAll(ctx, b);
    ctx.shadowBlur = 0; fillAll(ctx, b);
  },
  "3d": (ctx, b) => {
    const step = b.px * 0.014;
    for (let i = 6; i >= 1; i--) {
      const shade = Math.round(70 - i * 7);
      ctx.fillStyle = `rgb(${shade + 20}, ${Math.round(shade * 0.7)}, 0)`;
      fillAll(ctx, b, i * step, i * step);
    }
    ctx.fillStyle = vGradient(ctx, b, [[0, "#FFE680"], [1, "#F0C420"]]); fillAll(ctx, b);
  },
  glitter: (ctx, b) => {
    ctx.fillStyle = vGradient(ctx, b, GOLD); fillAll(ctx, b);
    // Sparkles only where the letters are (source-atop on the text's own layer).
    ctx.globalCompositeOperation = "source-atop";
    const r = rng(b.lines.join("|").length * 7919 + Math.round(b.px));
    const n = Math.round((b.w * b.h) / (b.px * b.px) * 42);
    for (let i = 0; i < n; i++) {
      const x = (r() - 0.5) * b.w, y = (r() - 0.5) * b.h, s = b.px * (0.008 + r() * 0.022);
      ctx.globalAlpha = 0.55 + r() * 0.45;
      ctx.fillStyle = r() < 0.7 ? "#FFFFFF" : "#FFF8C8";
      if (r() < 0.25) { // a four-point star
        ctx.beginPath();
        ctx.moveTo(x, y - s * 2.6); ctx.lineTo(x + s * 0.5, y - s * 0.5); ctx.lineTo(x + s * 2.6, y); ctx.lineTo(x + s * 0.5, y + s * 0.5);
        ctx.lineTo(x, y + s * 2.6); ctx.lineTo(x - s * 0.5, y + s * 0.5); ctx.lineTo(x - s * 2.6, y); ctx.lineTo(x - s * 0.5, y - s * 0.5);
        ctx.closePath(); ctx.fill();
      } else { ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  },
  chrome: (ctx, b) => {
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#2B2B2B"; ctx.lineWidth = b.px * 0.04; strokeAll(ctx, b);
    ctx.fillStyle = vGradient(ctx, b, [[0, "#FFFFFF"], [0.32, "#D8D8D8"], [0.5, "#6E6E6E"], [0.56, "#E8E8E8"], [1, "#8C8C8C"]]); fillAll(ctx, b);
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    b.ys.forEach((y) => ctx.fillRect(-b.w, y - b.lineH * 0.2, b.w * 2, b.lineH * 0.06));
    ctx.globalCompositeOperation = "source-over";
  },
  fire: (ctx, b) => {
    ctx.fillStyle = vGradient(ctx, b, [[0, "#FFF176"], [0.45, "#FF9800"], [1, "#E53935"]]);
    ctx.shadowColor = "#FF6D00"; ctx.shadowBlur = b.px * 0.3; fillAll(ctx, b);
    ctx.shadowBlur = 0; fillAll(ctx, b);
  },
  ice: (ctx, b) => {
    ctx.fillStyle = vGradient(ctx, b, [[0, "#FFFFFF"], [1, "#A8F0FF"]]);
    ctx.shadowColor = "#1E88E5"; ctx.shadowBlur = b.px * 0.28; fillAll(ctx, b);
    ctx.shadowBlur = 0; fillAll(ctx, b);
  },
  rainbow: (ctx, b) => {
    ctx.fillStyle = hGradient(ctx, b, [[0, "#E53935"], [0.17, "#FB8C00"], [0.34, "#FDD835"], [0.5, "#43A047"], [0.67, "#1E88E5"], [0.84, "#5E35B1"], [1, "#8E24AA"]]);
    fillAll(ctx, b);
  },
  graffiti: (ctx, b) => {
    ctx.lineJoin = "round";
    ctx.fillStyle = "rgba(0,0,0,0.55)"; fillAll(ctx, b, b.px * 0.06, b.px * 0.07);
    ctx.strokeStyle = "#000000"; ctx.lineWidth = b.px * 0.1; strokeAll(ctx, b);
    ctx.fillStyle = "#FFFFFF"; fillAll(ctx, b);
  },
  outline: (ctx, b) => {
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#F0C420"; ctx.lineWidth = b.px * 0.06; strokeAll(ctx, b);
  },
};

export const hasRecipe = (key: string) => !!RECIPES[styleKeyOf(key)];
/** The free styles take the colour picker; "Black" starts black, the others white. */
export const defaultColorFor = (key: string) => (styleKeyOf(key) === "black" ? "#000000" : "#FFFFFF");

/** Fit the text to ~88% of the picture's width at its current font. */
export function fitSize(ctx: CanvasRenderingContext2D, text: string, font: string, W: number): number {
  const b = block(ctx, { text: text || "TEXT", cx: 0.5, cy: 0.5, size: 0.2, tilt: 0, color: "#fff" }, familyOf(font), W);
  return Math.min(0.6, Math.max(0.05, 0.2 * (0.88 * W) / b.w));
}

/** The text's own layer (so glitter/chrome effects only touch the letters). */
function drawTextLayer(layer: HTMLCanvasElement, style: TextPhotoStyle, layout: TextLayout) {
  const W = layer.width, H = layer.height;
  const ctx = layer.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);
  if (!layout.text.trim()) return;
  const family = familyOf(style.font);
  ctx.save();
  ctx.translate(layout.cx * W, layout.cy * H);
  ctx.rotate((layout.tilt * Math.PI) / 180);
  const b = block(ctx, layout, family, W);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  (RECIPES[styleKeyOf(style.key)] ?? RECIPES.bold)(ctx, b, layout.color);
  ctx.restore();
}

/** A shelf tile: the style's own name drawn in the style, on a dark plate. */
export function drawStyleSample(canvas: HTMLCanvasElement, style: TextPhotoStyle, color: string) {
  const ctx = canvas.getContext("2d")!;
  // A dark colour (the "Black" style) sits on a light plate, everything else on a dark one.
  const dark = /^#?(0{3}|0{6}|1[0-9a-f]{5})$/i.test(color.replace("#", ""));
  ctx.fillStyle = dark ? "#E6E6E6" : "#1A1A1A";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const tmp = document.createElement("canvas");
  tmp.width = canvas.width; tmp.height = canvas.height;
  const label = style.name.toUpperCase() === "SCRIPT" ? style.name : style.name.toUpperCase();
  const layout: TextLayout = { text: label, cx: 0.5, cy: 0.52, size: 0.3, tilt: 0, color };
  // Fit the name to the tile, height first (a short name would otherwise fill it top to bottom).
  const fitW = fitSize(ctx, label, style.font, canvas.width) * 0.86;
  layout.size = Math.min(fitW, (canvas.height * 0.5) / canvas.width);
  drawTextLayer(tmp, style, layout);
  ctx.drawImage(tmp, 0, 0);
}

/** Where the text block sits on a W x H picture (for dragging: is this point on the text?). */
export function textHitBox(ctx: CanvasRenderingContext2D, style: TextPhotoStyle, layout: TextLayout, W: number, H: number) {
  const b = block(ctx, layout, familyOf(style.font), W);
  return { cx: layout.cx * W, cy: layout.cy * H, hw: b.w / 2 + b.px * 0.2, hh: b.h / 2 + b.px * 0.2 };
}

export type Composite = {
  photo: CanvasImageSource & { width: number; height: number };
  /** The person cut out of the same photo (transparent elsewhere); null when no person was found. */
  person: CanvasImageSource | null;
  style: TextPhotoStyle; layout: TextLayout;
  /** "Made on Bingg Bongg" + the member's @username when on. */
  watermark: { username: string | null };
};

const layers = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();

/** Photo, then the text, then the person on top, then the small mark — onto `out` at its own size. */
export function renderComposite(out: HTMLCanvasElement, c: Composite) {
  const W = out.width, H = out.height;
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(c.photo, 0, 0, W, H);
  let layer = layers.get(out);
  if (!layer || layer.width !== W || layer.height !== H) { layer = document.createElement("canvas"); layer.width = W; layer.height = H; layers.set(out, layer); }
  drawTextLayer(layer, c.style, c.layout);
  ctx.drawImage(layer, 0, 0);
  if (c.person) ctx.drawImage(c.person, 0, 0, W, H);
  drawWatermark(ctx, W, H, c.watermark);
}

function drawWatermark(ctx: CanvasRenderingContext2D, W: number, H: number, wm: Composite["watermark"]) {
  const fs = Math.max(10, Math.round(Math.min(W, H) * 0.028));
  const pad = fs * 0.8;
  const text = `Made on Bingg Bongg${wm.username ? `  @${wm.username}` : ""}`;
  ctx.save();
  ctx.font = `600 ${fs}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  const x = W - pad, y = H - pad;
  ctx.shadowColor = "rgba(0,0,0,0.75)"; ctx.shadowBlur = fs * 0.4;
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fillText(text, x, y);
  ctx.restore();
}

// ---- The cut-out --------------------------------------------------------------------------

/** Long side of the saved picture. */
export const MAX_SIDE = 2048;

/** Draw a picked file onto a canvas, upright (EXIF), capped at MAX_SIDE on the long side. */
export async function photoCanvasFromFile(file: File): Promise<HTMLCanvasElement> {
  let src: ImageBitmap | HTMLImageElement;
  try {
    src = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Older Safari: an <img> applies EXIF orientation itself.
    src = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("bad image"));
      img.src = URL.createObjectURL(file);
    });
  }
  const w0 = "naturalWidth" in src ? src.naturalWidth : src.width;
  const h0 = "naturalHeight" in src ? src.naturalHeight : src.height;
  const k = Math.min(1, MAX_SIDE / Math.max(w0, h0));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w0 * k));
  c.height = Math.max(1, Math.round(h0 * k));
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, c.width, c.height);
  if ("close" in src) src.close();
  else URL.revokeObjectURL(src.src);
  return c;
}

/**
 * Cut the person out of `photo`. The segmenter runs on a copy at most 1024 px on its long side
 * (the model's own input is far smaller, so a bigger copy only costs time); the confidence mask is
 * sharpened with a smoothstep (no see-through halo), scaled back up smoothly and softened by a
 * pixel or two. Returns null when there is no person in the photo (under ~0.6% of it).
 */
export function cutOutPerson(seg: { segment: (img: HTMLCanvasElement, cb: (r: { confidenceMasks?: { getAsFloat32Array(): Float32Array; width: number; height: number }[] }) => void) => void }, photo: HTMLCanvasElement): HTMLCanvasElement | null {
  const k = Math.min(1, 1024 / Math.max(photo.width, photo.height));
  const small = document.createElement("canvas");
  small.width = Math.max(1, Math.round(photo.width * k));
  small.height = Math.max(1, Math.round(photo.height * k));
  small.getContext("2d")!.drawImage(photo, 0, 0, small.width, small.height);

  let mask: HTMLCanvasElement | null = null;
  let personShare = 0;
  seg.segment(small, (res) => {
    const masks = res.confidenceMasks;
    const m = masks?.[masks.length - 1];
    if (!m) return;
    const conf = m.getAsFloat32Array();
    const mw = m.width, mh = m.height;
    const mc = document.createElement("canvas");
    mc.width = mw; mc.height = mh;
    const data = new ImageData(mw, mh);
    const px = data.data;
    let on = 0;
    for (let i = 0; i < conf.length; i++) {
      const v = conf[i];
      if (v > 0.5) on++;
      const x = Math.min(1, Math.max(0, (v - 0.35) / 0.3));
      px[i * 4] = 255; px[i * 4 + 1] = 255; px[i * 4 + 2] = 255;
      px[i * 4 + 3] = Math.round(x * x * (3 - 2 * x) * 255);
    }
    personShare = on / Math.max(1, conf.length);
    mc.getContext("2d")!.putImageData(data, 0, 0);
    mask = mc;
  });
  if (!mask || personShare < 0.006) return null;
  const m: HTMLCanvasElement = mask;

  const person = document.createElement("canvas");
  person.width = photo.width; person.height = photo.height;
  const p = person.getContext("2d")!;
  p.drawImage(photo, 0, 0);
  p.globalCompositeOperation = "destination-in";
  p.imageSmoothingEnabled = true;
  p.imageSmoothingQuality = "high";
  p.filter = `blur(${Math.max(0.6, (photo.width / m.width) * 0.5).toFixed(2)}px)`; // ignored where unsupported
  p.drawImage(m, 0, 0, photo.width, photo.height);
  p.filter = "none";
  p.globalCompositeOperation = "source-over";
  return person;
}
