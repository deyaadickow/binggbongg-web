import { useEffect, useRef, useState } from "react";
import { VIDEO_LANGS, defaultVideoLang, rememberVideoLang, type VideoLang, type VideoSources } from "../lib/featureVideos";
import { trackPage } from "../lib/pageTracker";

/** One video in the player: its file, its heading, and its other languages. `trackKey` and
 *  `trackLabel` name it in the member's page history — the feature's key and its ENGLISH name,
 *  since `title` is in whatever language the member reads. */
export interface PlayerItem { url: string; title: string; sources?: VideoSources; trackKey?: string; trackLabel?: string }

/** The language to play for one video: the picked one if it has it, else English, else its first. */
function langFor(item: PlayerItem, want: VideoLang): VideoLang | null {
  const has = VIDEO_LANGS.filter((l) => item.sources?.[l.code]);
  if (has.length < 2) return null;
  return item.sources?.[want] ? want : item.sources?.en ? "en" : has[0].code;
}

/** Full-screen player for the feature videos: plays with sound, the browser's own controls, a gold
 *  back button and the feature's name on top. Esc or the back button closes it. Shared by the
 *  directory's tiles and the Bingg Bongg Features Videos page, so both play the same way.
 *
 *  It is a vertical feed (Steve, 2026-11-02: "When someone is watching Bingg Bongg Features videos
 *  please make them be able to scroll up and down for the next and previous feature videos"): swipe
 *  or scroll up for the next video, down for the previous, arrow keys too. Only the video on screen
 *  is loaded and playing.
 *
 *  When a video comes in more than one language, an English | Tagalog | Indonesia | Español |
 *  العربية switch sits under it (Steve: "we should do this with all three languages", then Spanish
 *  and Arabic). It opens on the member's country's language, and the pick carries on to the next
 *  videos and is remembered. */
export function FeatureVideoPlayer({ items, start = 0, onClose, country }: {
  items: PlayerItem[]; start?: number; onClose: () => void; country?: string | null;
}) {
  const [current, setCurrent] = useState(start);
  const [want, setWant] = useState<VideoLang>(() => defaultVideoLang(country));
  const feed = useRef<HTMLDivElement>(null);
  const slides = useRef<(HTMLDivElement | null)[]>([]);

  // Page history: one feature_video row per video actually brought on screen, as the member
  // scrolls from one feature's video to the next.
  const shown = items[current];
  useEffect(() => {
    if (shown) trackPage("feature_video", "feature", shown.trackKey, shown.trackLabel ?? shown.title);
  }, [shown?.trackKey, shown?.url]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open on the tapped video, without an animated scroll past the ones before it.
  useEffect(() => {
    slides.current[start]?.scrollIntoView({ block: "start" });
  }, [start]);

  // The slide that fills most of the screen is the one playing.
  useEffect(() => {
    const root = feed.current;
    if (!root) return;
    const seen = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) setCurrent(Number((e.target as HTMLElement).dataset.i));
      }
    }, { root, threshold: 0.6 });
    slides.current.forEach((s) => s && seen.observe(s));
    return () => seen.disconnect();
  }, [items.length]);

  useEffect(() => {
    const go = (i: number) => slides.current[i]?.scrollIntoView({ behavior: "smooth", block: "start" });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowDown" || e.key === "PageDown") { e.preventDefault(); go(Math.min(current + 1, items.length - 1)); }
      else if (e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); go(Math.max(current - 1, 0)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, current, items.length]);

  const pick = (l: VideoLang) => { setWant(l); rememberVideoLang(l); };

  return (
    <div role="dialog" aria-modal="true" aria-label={items[current]?.title} ref={feed} style={{
      position: "fixed", inset: 0, zIndex: 2000, background: "#000",
      overflowY: "auto", scrollSnapType: "y mandatory", overscrollBehavior: "contain",
    }}>
      {items.map((item, i) => {
        const lang = langFor(item, want);
        const src = (lang && item.sources?.[lang]) || item.url;
        const near = Math.abs(i - current) <= 1;
        return (
          <div key={i} data-i={i} ref={(el) => { slides.current[i] = el; }} style={{
            height: "100dvh", scrollSnapAlign: "start", scrollSnapStop: "always",
            display: "flex", flexDirection: "column",
          }}>
            {/* The bar sits ABOVE the video, not over it — over it, it covered the video's own logo. */}
            <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <button onClick={onClose} aria-label="Back" style={{
                width: 40, height: 40, borderRadius: "50%", background: "#000", color: "var(--gold)",
                border: "2px solid var(--gold-border)", fontSize: 20, fontWeight: 700, cursor: "pointer", lineHeight: 1,
              }}>‹</button>
              <b style={{ color: "var(--gold)", fontSize: 17, flex: 1, minWidth: 0 }}>{item.title}</b>
              {items.length > 1 && (
                <span style={{ color: "var(--gold)", fontSize: 13, opacity: 0.8 }}>{i + 1} / {items.length}</span>
              )}
            </div>
            <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
              {/* Only the video on screen plays; its neighbours are loaded, the rest are not. Keyed on
                  the file AND on being on screen: React would otherwise keep the same element when it
                  scrolls away, and a playing video keeps playing (with sound) under the next one. */}
              {i === current ? (
                <video key={`${src}#on`} src={src} controls autoPlay playsInline
                  style={{ flex: 1, minWidth: 0, objectFit: "contain", background: "#000" }} />
              ) : near ? (
                <video key={`${src}#near`} src={src} preload="metadata" playsInline muted
                  style={{ flex: 1, minWidth: 0, objectFit: "contain", background: "#000" }} />
              ) : null}
            </div>
            {lang && (
              // Under the video, never over it — the same black and gold pill as the landing page's.
              <div style={{ display: "flex", justifyContent: "center", padding: "10px 14px 14px", flexShrink: 0 }}>
                <div className="lp-langs fv-langs" role="group" aria-label="Video language">
                  {VIDEO_LANGS.filter((l) => item.sources?.[l.code]).map((l) => (
                    <button key={l.code} type="button" className={l.code === lang ? "on" : ""} aria-pressed={l.code === lang}
                      onClick={() => { if (l.code !== lang) pick(l.code); }}>{l.label}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
