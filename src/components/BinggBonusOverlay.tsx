// Bingg Bongg Bonus (Steve, 2026-11-07): "50 Bingg Bongg Gloves floating all over the screen for
// 10 seconds" and "a Bullet banner will appear and will say 'Bingg Bongg Bonus' with Black
// background and gold border and text." Mount once per screen; it plays whatever
// lib/binggBonus.playBinggBonus sends it, one bonus at a time in arrival order.
// Every floating image is the WHOLE logo (both gloves together — the owner, 2026-11-07).
import { useEffect, useMemo, useRef, useState } from "react";
import { onBinggBonus, type BinggBonus, type BinggBonusStyle } from "../lib/binggBonus";
import { useT } from "../lib/i18n";
import type { Gift } from "../lib/api";
import { TapTapBurst, tapTapBurstDuration } from "./TapTapBurst";

const LOGO = "/img/bb_gloves_logo.png";

function reducedMotion(): boolean {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

// No logo ever overlaps another (Steve, 2026-11-07: "i don't want one image over lapping another
// image"), not in straight columns ("that is too straight"), and "make every 10 or 12 pop out and
// disappear". So the logos come in WAVES of 10: each wave pops up at random, scattered, tilted spots
// (every spot is rejected if it would touch one already placed in that wave), holds, and pops away
// before the next wave pops in. 50 logos over 10 seconds = 5 waves of 2 seconds.
type Glove = { left: number; top: number; w: number; rot: number; dur: number; delay: number };

const LOGO_RATIO = 254 / 720; // height / width of bb_gloves_logo.png — only if even it fails to load
const PAD = 14; // px of clear space kept around every logo
const PER_WAVE = 10;
const STAGGER = 0.05; // s between logos popping in within a wave

function makeGloves(count: number, seconds: number, still: boolean, ratio: number): Glove[] {
  const W = window.innerWidth || 390;
  const H = window.innerHeight || 844;
  const top0 = 12;
  const bottom0 = H - 130; // keep clear of the banner at the bottom
  const maxW = Math.min(170, Math.floor(W / 2.4));
  const minW = Math.round(maxW * 0.8);
  const waves = still ? 1 : Math.max(1, Math.ceil(count / PER_WAVE));
  const waveLen = seconds / waves;
  const out: Glove[] = [];
  for (let wv = 0; wv < waves; wv++) {
    const n = still ? Math.min(PER_WAVE, count) : Math.min(PER_WAVE, count - wv * PER_WAVE);
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    for (let i = 0; i < n; i++) {
      for (let tries = 0; tries < 300; tries++) {
        const w = minW + Math.random() * (maxW - minW);
        const h = w * ratio;
        const rot = (Math.random() - 0.5) * 24; // up to ±12°, readable
        const r = (Math.abs(rot) * Math.PI) / 180;
        const bw = w * Math.cos(r) + h * Math.sin(r); // the tilted logo's bounding box
        const bh = w * Math.sin(r) + h * Math.cos(r);
        const cx = bw / 2 + Math.random() * Math.max(1, W - bw);
        const cy = top0 + bh / 2 + Math.random() * Math.max(1, bottom0 - top0 - bh);
        const b = { x0: cx - bw / 2 - PAD / 2, y0: cy - bh / 2 - PAD / 2, x1: cx + bw / 2 + PAD / 2, y1: cy + bh / 2 + PAD / 2 };
        if (placed.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0)) continue;
        placed.push(b);
        // Every logo of a wave is gone by the wave's end, so waves never share the screen.
        out.push({ left: cx, top: cy, w, rot, dur: Math.max(0.6, waveLen - i * STAGGER - 0.05), delay: wv * waveLen + i * STAGGER });
        break;
      }
    }
  }
  return out;
}

// Admin picks how the gloves appear (2026-11-07, backend 61650b4): "waves" is the pop-in waves
// below; every other style is the gift burst effect of the same name, played by the SAME
// TapTapBurst a gift uses — a stand-in gift carrying that style's flag, `gloves` as its price
// (the burst's count) and the logo as its image.
const STYLE_FLAG: Record<Exclude<BinggBonusStyle, "waves">, keyof Gift> = {
  taptap: "is_taptap", rainfall: "is_rainfall", left_hander: "is_left_hander", right_hander: "is_right_hander",
  surprise: "is_surprise", universal: "is_universal", spot: "is_spot",
};
function burstGift(b: BinggBonus): Gift | null {
  if (b.style === "waves") return null;
  return { id: 0, name: b.banner, coin_price: b.gloves, [STYLE_FLAG[b.style]]: true } as Gift;
}
const BURST_SIZE_MIN = 110; // logos 110-140px wide
const BURST_SIZE_RANGE = 30;

/**
 * Admin's uploaded image (backend 207b180), loaded BEFORE the show starts so no glove appears
 * blank: 3 seconds, then the built-in logo. Also gives the real height/width ratio the waves
 * layout needs to keep logos from touching.
 */
function loadImage(src: string, timeoutMs: number): Promise<{ src: string; ratio: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const done = (v: { src: string; ratio: number } | null) => { window.clearTimeout(timer); img.onload = img.onerror = null; resolve(v); };
    const timer = window.setTimeout(() => done(null), timeoutMs);
    img.onload = () => done(img.naturalWidth > 0 && img.naturalHeight > 0 ? { src, ratio: img.naturalHeight / img.naturalWidth } : null);
    img.onerror = () => done(null);
    img.src = src;
  });
}
async function bonusImage(b: BinggBonus): Promise<{ src: string; ratio: number }> {
  if (b.image) {
    const custom = await loadImage(b.image, 3000);
    if (custom) return custom;
  }
  return (await loadImage(LOGO, 3000)) ?? { src: LOGO, ratio: LOGO_RATIO };
}

export function BinggBonusOverlay() {
  const { t } = useT();
  const [queue, setQueue] = useState<BinggBonus[]>([]);
  const [now, setNow] = useState<{ b: BinggBonus; key: number; src: string; ratio: number } | null>(null);
  const loading = useRef(false);

  useEffect(() => onBinggBonus((b) => setQueue((q) => [...q, b])), []);
  useEffect(() => {
    if (now || loading.current || queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    loading.current = true;
    void bonusImage(next).then((img) => {
      loading.current = false;
      setNow({ b: next, key: Date.now(), ...img });
    });
  }, [now, queue]);
  const still = useMemo(() => reducedMotion(), []);
  // Reduced motion keeps the still waves whatever admin picked — the bursts all travel.
  const burst = useMemo(() => (now && !still ? burstGift(now.b) : null), [now, still]);
  const [bannerDown, setBannerDown] = useState(0); // the key of the bonus whose banner is done
  const bannerUp = !!now && bannerDown !== now.key;
  useEffect(() => {
    if (!now) return;
    // The banner stays `seconds`; a burst may run a little longer and is left to finish.
    const total = Math.max(now.b.seconds * 1000, burst ? tapTapBurstDuration(burst) : 0);
    const a = window.setTimeout(() => setBannerDown(now.key), now.b.seconds * 1000);
    const z = window.setTimeout(() => setNow(null), total);
    return () => { window.clearTimeout(a); window.clearTimeout(z); };
  }, [now, burst]);

  const gloves = useMemo(
    () => (now && !burst ? makeGloves(still ? Math.min(10, now.b.gloves) : Math.min(300, now.b.gloves), now.b.seconds, still, now.ratio) : []),
    [now, still, burst],
  );
  if (!now) return null;
  const { b } = now;
  const who = b.username ? `@${b.username}` : b.full_name;
  return (
    <>
    {burst && <TapTapBurst key={`burst-${now.key}`} gift={burst} imageUrl={now.src} sizeMin={BURST_SIZE_MIN} sizeRange={BURST_SIZE_RANGE} hideName />}
    {bannerUp && <div key={now.key} className={`bbb-bonus${still ? " still" : ""}`} aria-live="polite"
      style={{ ["--bbb-total" as string]: `${b.seconds}s` }}>
      {gloves.map((g, i) => (
        <img key={i} className="bbb-glove" src={now.src} alt="" draggable={false}
          style={{
            left: g.left, top: g.top, width: g.w, ["--rot" as string]: `${g.rot}deg`,
            animationDuration: `${g.dur}s`, animationDelay: `${g.delay}s`,
          }} />
      ))}
      <div className="bbb-banner" role="status">
        {/* Brand name — never translated. */}
        <b>{b.banner || "Bingg Bongg Bonus"}</b>
        <span>{who} +{t("n_coins", b.bonus_coins.toLocaleString())}</span>
      </div>
    </div>}
    </>
  );
}
