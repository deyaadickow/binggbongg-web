// Drawing for Text posts and the words on a Photo slideshow (Steve, 2026-11-16). Everything is
// drawn on a 720x1280 canvas, then recorded to an mp4 by videoKit.renderToMp4.
import { familyOf } from "./textBehind";

export const POST_W = 720;
export const POST_H = 1280;

export type TextAlign = "left" | "center" | "right";

export interface TextFont { key: string; label: string; family: string; weight: number; upper?: boolean }
export const TEXT_FONTS: TextFont[] = [
  { key: "classic", label: "Classic", family: "system-ui, -apple-system, 'Segoe UI', Arial, sans-serif", weight: 800 },
  { key: "anton", label: "Bold", family: `'${familyOf("anton")}', Impact, sans-serif`, weight: 400 },
  { key: "marker", label: "Marker", family: `'${familyOf("permanent marker")}', 'Comic Sans MS', cursive`, weight: 400 },
  { key: "pacifico", label: "Script", family: `'${familyOf("pacifico")}', 'Brush Script MT', cursive`, weight: 400 },
  { key: "bungee", label: "Block", family: `'${familyOf("bungee")}', 'Arial Black', sans-serif`, weight: 400, upper: true },
  { key: "serif", label: "Serif", family: "Georgia, 'Times New Roman', serif", weight: 700 },
];

export const TEXT_COLORS = ["#FFFFFF", "#F0C420", "#000000", "#E53935", "#FF80AB", "#4FC3F7", "#69F0AE"];

export interface TextBg { key: string; label: string; kind: "solid" | "gradient" | "image"; colors?: string[]; url?: string }
export const TEXT_BGS: TextBg[] = [
  { key: "black", label: "Black", kind: "solid", colors: ["#000000"] },
  { key: "gold", label: "Gold", kind: "gradient", colors: ["#6b4e00", "#D4AF37", "#FFDD55", "#B8860B"] },
  { key: "goldblack", label: "Black & gold", kind: "gradient", colors: ["#000000", "#1a1406", "#3d2f08", "#000000"] },
  { key: "red", label: "Red", kind: "gradient", colors: ["#5c0010", "#c4001d", "#ff3b3b"] },
  { key: "blue", label: "Blue", kind: "gradient", colors: ["#06122b", "#123d8a", "#2f7bff"] },
  { key: "purple", label: "Purple", kind: "gradient", colors: ["#1d0533", "#5b16a8", "#c13cff"] },
  { key: "green", label: "Green", kind: "solid", colors: ["#0f5132"] },
  { key: "white", label: "White", kind: "solid", colors: ["#ffffff"] },
  { key: "cosmic", label: "Cosmic", kind: "image", url: "/bg_vip_cosmic.webp" },
];

/** Background at time t: gradients drift slowly, pictures zoom in slowly. */
export function drawTextBg(ctx: CanvasRenderingContext2D, bg: TextBg, img: ImageBitmap | HTMLImageElement | null, t: number) {
  const W = POST_W, H = POST_H;
  if (bg.kind === "image" && img) {
    const iw = "naturalWidth" in img ? img.naturalWidth : img.width;
    const ih = "naturalHeight" in img ? img.naturalHeight : img.height;
    const z = 1 + Math.min(t, 15) * 0.006;
    const s = Math.max(W / iw, H / ih) * z;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img, (W - iw * s) / 2, (H - ih * s) / 2, iw * s, ih * s);
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.fillRect(0, 0, W, H);
    return;
  }
  const colors = bg.colors ?? ["#000"];
  if (bg.kind === "solid" || colors.length < 2) {
    ctx.fillStyle = colors[0];
    ctx.fillRect(0, 0, W, H);
    return;
  }
  const a = t * 0.25;
  const cx = W / 2, cy = H / 2, r = Math.hypot(W, H) / 2;
  const g = ctx.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r * 0.6 - r * 0.4, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.6 + r * 0.4);
  colors.forEach((c, i) => g.addColorStop(i / (colors.length - 1), c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(""); continue; }
    let line = "";
    for (const w of words) {
      const tryLine = line ? line + " " + w : w;
      if (ctx.measureText(tryLine).width <= maxW || !line) {
        // a single word wider than the line is broken by characters
        if (!line && ctx.measureText(w).width > maxW) {
          let part = "";
          for (const ch of w) {
            if (ctx.measureText(part + ch).width > maxW && part) { out.push(part); part = ch; } else part += ch;
          }
          line = part;
        } else line = tryLine;
      } else { out.push(line); line = w; }
    }
    out.push(line);
  }
  return out;
}

export interface TextStyle { font: TextFont; color: string; align: TextAlign }

/** The text block, as large as fits in `box` (font from maxSize down). `appear` 0..1 fades and
 *  lifts it in. A dark text on a dark background gets a light outline, and the reverse. */
export function drawTextBlock(ctx: CanvasRenderingContext2D, text: string, style: TextStyle, box: { x: number; y: number; w: number; h: number }, maxSize = 96, appear = 1, plate = false) {
  const raw = style.font.upper ? text.toUpperCase() : text;
  if (!raw.trim()) return;
  let size = maxSize;
  let lines: string[] = [];
  for (; size >= 22; size -= 4) {
    ctx.font = `${style.font.weight} ${size}px ${style.font.family}`;
    lines = wrap(ctx, raw, box.w);
    if (lines.length * size * 1.22 <= box.h) break;
  }
  ctx.font = `${style.font.weight} ${size}px ${style.font.family}`;
  const lh = size * 1.22;
  const total = lines.length * lh;
  const top = box.y + (box.h - total) / 2 + (1 - appear) * 30;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, appear));
  ctx.textAlign = style.align;
  ctx.textBaseline = "middle";
  const x = style.align === "left" ? box.x : style.align === "right" ? box.x + box.w : box.x + box.w / 2;
  if (plate) {
    let widest = 0;
    for (const l of lines) widest = Math.max(widest, ctx.measureText(l).width);
    const px = style.align === "left" ? box.x : style.align === "right" ? box.x + box.w - widest : box.x + (box.w - widest) / 2;
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.beginPath();
    ctx.roundRect(px - 20, top - 14, widest + 40, total + 28, 22);
    ctx.fill();
  }
  const dark = /^#0|^#1|^#2|^#000/i.test(style.color);
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(4, size * 0.08);
  ctx.strokeStyle = dark ? "rgba(255,255,255,.55)" : "rgba(0,0,0,.6)";
  ctx.fillStyle = style.color;
  lines.forEach((l, i) => {
    const y = top + lh * i + lh / 2;
    if (!plate) ctx.strokeText(l, x, y);
    ctx.fillText(l, x, y);
  });
  ctx.restore();
}
