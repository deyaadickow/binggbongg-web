import { useEffect, useRef, useState } from "react";
import { VIDEO_LANGS, defaultVideoLang, rememberVideoLang, type VideoLang, type VideoSources } from "../lib/featureVideos";
import { trackPage } from "../lib/pageTracker";
import { WEB_BASE } from "../lib/api";
import { openDownloadLink } from "../lib/referralAds";
import { useT } from "../lib/i18n";

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
  const { t } = useT();
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
            <div style={{ padding: "10px 14px 6px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <button onClick={onClose} aria-label="Back" style={{
                width: 40, height: 40, borderRadius: "50%", background: "#000", color: "var(--gold)",
                border: "2px solid var(--gold-border)", fontSize: 20, fontWeight: 700, cursor: "pointer", lineHeight: 1,
              }}>‹</button>
              {items.length > 1 && (
                <span className="fv-count" style={{ color: "var(--gold)", fontSize: 13, opacity: 0.8, flexShrink: 0 }}>{i + 1} / {items.length}</span>
              )}
              {/* The buttons sit on the right; the title has its own line under them (Steve, 2026-11-12: "text is cutoff
                  when video is playing"). */}
              <span style={{ flex: 1 }} />
              {/* Steve, 2026-11-12: "add an 'Language' picker and 'Download' button next to each other on top. when they
                  pick a language it will stay on that language for every video they watch until they change the language."
                  The pick is remembered on the device (rememberVideoLang) and every video opens in it when it has it. */}
              <LangPicker langs={VIDEO_LANGS.filter((l) => item.sources?.[l.code]).map((l) => l.code)}
                value={lang ?? (VIDEO_LANGS.find((l) => item.sources?.[l.code])?.code ?? null)} onPick={pick} label={t("fv_language")} />
              {/* Steve, 2026-11-12: "In Bingg Bongg Featured Videos please add a download Button". The server's
                  attachment route, so the browser saves the file (in the language playing) instead of opening it. */}
              <button type="button" aria-label={t("download")} title={t("download")}
                onClick={() => openDownloadLink(
                  `${WEB_BASE}feature-videos/download?path=${encodeURIComponent(src)}&name=${encodeURIComponent(item.trackLabel || item.title)}`,
                  `Bingg Bongg - ${(item.trackLabel || item.title).replace(/[\\/:*?"<>|]+/g, " ").trim()}.mp4`)}
                style={{
                  height: 40, padding: "0 14px", borderRadius: 20, background: "#000", color: "var(--gold)",
                  border: "2px solid var(--gold-border)", fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
                }}>⬇ {t("download")}</button>
            </div>
            <b style={{ color: "var(--gold)", fontSize: 17, lineHeight: 1.25, padding: "0 16px 8px", flexShrink: 0, overflowWrap: "anywhere" }}>{item.title}</b>
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
          </div>
        );
      })}
    </div>
  );
}

/** The video's Language picker: a black and gold button that opens the languages this video has in a centred black card
 *  with a gold border (Steve, 2026-11-12: "Please fix the language picker popup design on all") — "Language" on top, one
 *  gold-outlined row per language with the playing one filled gold, a gold ✕. With one language it only shows it. */
function LangPicker({ langs, value, onPick, label }: { langs: VideoLang[]; value: VideoLang | null; onPick: (l: VideoLang) => void; label: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [open]);
  if (!value) return null;
  const name = (c: VideoLang) => VIDEO_LANGS.find((l) => l.code === c)?.label ?? c;
  const many = langs.length > 1;
  return (
    <>
      <button type="button" aria-label={`${label}: ${name(value)}`} aria-haspopup={many ? "dialog" : undefined}
        onClick={() => many && setOpen(true)} style={{
          height: 40, padding: "0 12px", borderRadius: 20, background: "#000", color: "var(--gold)", flexShrink: 0,
          border: "2px solid var(--gold-border)", fontSize: 14, fontWeight: 700, cursor: many ? "pointer" : "default", whiteSpace: "nowrap",
        }}>🌐 {name(value)}{many ? " ▾" : ""}</button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label={label} onClick={() => setOpen(false)} style={{
          position: "fixed", inset: 0, zIndex: 2100, background: "rgba(0,0,0,.7)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: "100%", maxWidth: 320, background: "#000", border: "2px solid var(--gold-border)", borderRadius: 22,
            padding: "12px 18px 18px", boxShadow: "0 10px 40px rgba(0,0,0,.7)",
          }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <b style={{ flex: 1, color: "var(--gold)", fontSize: 19 }}>🌐 {label}</b>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} style={{
                width: 36, height: 36, background: "transparent", border: 0, color: "var(--gold)", fontSize: 20, fontWeight: 800, cursor: "pointer",
              }}>✕</button>
            </div>
            {langs.map((c) => {
              const on = c === value;
              return (
                <button key={c} type="button" aria-pressed={on} onClick={() => { setOpen(false); if (!on) onPick(c); }} style={{
                  display: "block", width: "100%", marginTop: 12, height: 50, borderRadius: 25,
                  border: "2px solid var(--gold-border)", background: on ? "var(--gold)" : "#000", color: on ? "#000" : "var(--gold)",
                  fontSize: 17, fontWeight: 800, cursor: "pointer",
                }}>{on ? "✓  " : ""}{name(c)}</button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
