import { useEffect, useRef, useState } from "react";
import { giftPrice, mediaUrl, type Gift } from "../lib/api";
import { subscribeTileGifts, type TileGiftPlay } from "../lib/tileGiftFx";
import { TapTapBurst, isTapTapGift, tapTapBurstDuration } from "./TapTapBurst";

/**
 * A gift playing INSIDE one member's tile (Steve, 2026-11-23: "it is only suppose to show on
 * steve's screen because he gave the gift and also on eddie's screen because he is the receiver
 * of the gift. it is not suppose to show on the entire phone screen.").
 *
 * Mounted in every tile of a multi-person grid (the 2–4 tiles, the 24-member grid, the battle
 * grids). Plays what lib/tileGiftFx sends for this member: the gift's video (covering the tile),
 * else its burst (inside the tile, icons ~1/5 of the tile), else its picture popping in the middle,
 * holding, then floating up and fading. Gifts on one tile wait their turn; different tiles play at
 * the same time. Same effect as Android's TileGiftEffect.
 */

/** A contained burst may send this many icons — 100 roses stay 100, two tiles of 500 do not. */
const TILE_MAX_ICONS = 200;
/** A gift video ends itself; this is only a safety cap. */
const VIDEO_CAP_MS = 20000;

/** The picture's hold, the same as the full-screen picture had: 4.5 s, 8–10 s for 500+ BBs. */
export function tileGiftHoldMs(gift: Gift): number {
  const coins = giftPrice(gift);
  if (coins < 500) return 4500;
  return Math.round(Math.min(10000, Math.max(8000, 8000 + Math.log10(coins / 500) * 1000)));
}

export function TileGiftLayer({ uid }: { uid: number | null | undefined }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [queue, setQueue] = useState<TileGiftPlay[]>([]);
  const [now, setNow] = useState<(TileGiftPlay & { short: number }) | null>(null);

  useEffect(() => {
    if (!uid) return;
    return subscribeTileGifts(uid, (p) => setQueue((q) => [...q, p]));
  }, [uid]);

  // Next in line once the tile is free; the tile's shorter side is read as it starts.
  useEffect(() => {
    if (now || queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    const r = boxRef.current?.getBoundingClientRect();
    setNow({ ...next, short: Math.max(60, Math.min(r?.width || 200, r?.height || 200)) });
  }, [now, queue]);

  const kind = now ? (isTapTapGift(now.gift) ? "burst" : now.gift.video ? "video" : "picture") : null;
  useEffect(() => {
    if (!now) return;
    const ms = kind === "burst" ? tapTapBurstDuration(now.gift, TILE_MAX_ICONS)
      : kind === "video" ? VIDEO_CAP_MS
      : tileGiftHoldMs(now.gift) + 1200;
    const t = window.setTimeout(() => setNow((cur) => (cur?.key === now.key ? null : cur)), ms);
    return () => window.clearTimeout(t);
  }, [now, kind]);

  const done = () => setNow(null);
  // Icons about a fifth of the tile's shorter side, never smaller than 18 px or bigger than 84.
  const icon = now ? Math.min(84, Math.max(18, Math.round(now.short / 5))) : 0;

  return (
    <div ref={boxRef} className="tile-gift-layer" aria-hidden="true"
      style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 3, borderRadius: "inherit" }}>
      {now && kind === "burst" && (
        <TapTapBurst key={now.key} gift={now.gift} contained maxIcons={TILE_MAX_ICONS}
          sizeMin={Math.round(icon * 0.85)} sizeRange={Math.max(2, Math.round(icon * 0.3))} />
      )}
      {now && kind === "video" && (
        <video key={now.key} src={mediaUrl(now.gift.video!)} autoPlay playsInline muted={!now.audible}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", background: "rgba(0,0,0,.35)" }}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            // Browsers refuse sound without a tap on the page; play it silent rather than not at all.
            v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
          }}
          onEnded={done} onError={done} />
      )}
      {now && kind === "picture" && <TilePicture key={now.key} gift={now.gift} size={Math.round(now.short * 0.55)} />}
    </div>
  );
}

/** The gift's gif/picture: grows in the middle of the tile, holds, floats up and fades. */
function TilePicture({ gift, size }: { gift: Gift; size: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== "function") return;
    const hold = tileGiftHoldMs(gift);
    const total = hold + 600;
    const a = el.animate([
      { offset: 0, opacity: 0, transform: "translate(-50%, -50%) scale(.4)" },
      { offset: 350 / total, opacity: 1, transform: "translate(-50%, -50%) scale(1.15)" },
      { offset: 550 / total, opacity: 1, transform: "translate(-50%, -50%) scale(1)" },
      { offset: hold / total, opacity: 1, transform: "translate(-50%, -50%) scale(1)" },
      { offset: 1, opacity: 0, transform: "translate(-50%, -75%) scale(1)" },
    ], { duration: total, easing: "ease-out", fill: "forwards" });
    return () => a.cancel();
  }, [gift]);
  return (
    <div ref={ref} style={{
      position: "absolute", left: "50%", top: "50%", width: size, height: size, opacity: 0,
      transform: "translate(-50%, -50%)", display: "grid", placeItems: "center",
      filter: "drop-shadow(0 0 10px rgba(212,175,55,.75))",
    }}>
      {gift.image
        ? <img src={mediaUrl(gift.image)} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", position: "static" }} />
        : <span style={{ fontSize: Math.round(size * 0.7) }}>🎁</span>}
    </div>
  );
}
