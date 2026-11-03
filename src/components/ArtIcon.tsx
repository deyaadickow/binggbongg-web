// A photo icon from the game-art manifest in place of an emoji (real images, Steve 2026-11-02):
// the same size the emoji had, clipped to a rounded square (corner radius ~22%). Until the photo
// has loaded — or if there is none, or it fails — the emoji / drawing passed as children shows.
import type { ReactNode } from "react";
import { useBattleIcon, useFeatureIcon, useLoadedImage } from "../lib/gameArt";
import { isVideoUrl } from "../lib/tapgame";

function Photo({ src, size }: { src: string; size: number }) {
  return (
    <img src={src} alt="" aria-hidden width={size} height={size} draggable={false}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.22), objectFit: "cover", display: "inline-block", verticalAlign: "middle", flexShrink: 0 }} />
  );
}

export function BattleIcon({ artKey, size, children }: { artKey?: string; size: number; children: ReactNode }) {
  const src = useBattleIcon(artKey);
  return src ? <Photo src={src} size={size} /> : <>{children}</>;
}

export function FeatureIcon({ artKey, size, children }: { artKey?: string; size: number; children: ReactNode }) {
  const src = useFeatureIcon(artKey);
  return src ? <Photo src={src} size={size} /> : <>{children}</>;
}

/** A tap game's own picture (character_image_url) as a small circle on a dark disc where its
 *  emoji was — a still only (a webm/mp4 sprite keeps the emoji), and the emoji until it loads. */
export function GameThumb({ url, emoji, size = 28 }: { url?: string | null; emoji?: string | null; size?: number }) {
  const src = useLoadedImage(url && !isVideoUrl(url) ? url : null);
  if (src) {
    return (
      <span aria-hidden style={{ width: size, height: size, borderRadius: "50%", background: "#111", border: "1px solid var(--gold-border, rgba(240,196,32,.4))",
                                 display: "inline-grid", placeItems: "center", flexShrink: 0, overflow: "hidden", verticalAlign: "middle" }}>
        <img src={src} alt="" draggable={false} style={{ width: "86%", height: "86%", objectFit: "contain", borderRadius: "50%" }} />
      </span>
    );
  }
  return emoji ? <span aria-hidden style={{ fontSize: Math.round(size * 0.72), lineHeight: 1, flexShrink: 0 }}>{emoji}</span> : null;
}
