import { useEffect, useState } from "react";
import { VIDEO_LANGS, defaultVideoLang, rememberVideoLang, type VideoLang, type VideoSources } from "../lib/featureVideos";

/** Full-screen player for one feature video: plays with sound, the browser's own controls, a gold
 *  back button and the feature's name on top. Esc or the back button closes it. Shared by the
 *  directory's tiles (their short videos) and the Bingg Bongg Features Videos page (the 60-second
 *  ones), so both play the same way.
 *
 *  When the video comes in more than one language, an English | Tagalog | Indonesia switch sits
 *  under it (Steve, 2026-11-02, after the landing page's: "we should do this with all three
 *  languages"). It opens on the member's country's language and remembers what they pick. */
export function FeatureVideoPlayer({ url, title, onClose, sources, country }: {
  url: string; title: string; onClose: () => void; sources?: VideoSources; country?: string | null;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const langs = VIDEO_LANGS.filter((l) => sources?.[l.code]);
  const [lang, setLang] = useState<VideoLang | null>(() => {
    if (langs.length < 2) return null;
    const want = defaultVideoLang(country);
    return sources?.[want] ? want : sources?.en ? "en" : langs[0].code;
  });
  const src = (lang && sources?.[lang]) || url;

  return (
    // The bar sits ABOVE the video, not over it — over it, it covered the video's own logo.
    <div role="dialog" aria-modal="true" aria-label={title} style={{
      position: "fixed", inset: 0, zIndex: 2000, background: "#000",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <button onClick={onClose} aria-label="Back" style={{
          width: 40, height: 40, borderRadius: "50%", background: "#000", color: "var(--gold)",
          border: "2px solid var(--gold-border)", fontSize: 20, fontWeight: 700, cursor: "pointer", lineHeight: 1,
        }}>‹</button>
        <b style={{ color: "var(--gold)", fontSize: 17 }}>{title}</b>
      </div>
      {/* Keyed on the file, so a new language starts from the beginning. */}
      <video key={src} src={src} controls autoPlay playsInline
        style={{ flex: 1, minHeight: 0, width: "100%", objectFit: "contain", background: "#000" }} />
      {lang && (
        // Under the video, never over it — the same black and gold pill as the landing page's.
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 14px 14px", flexShrink: 0 }}>
          <div className="lp-langs" role="group" aria-label="Video language">
            {langs.map((l) => (
              <button key={l.code} type="button" className={l.code === lang ? "on" : ""} aria-pressed={l.code === lang}
                onClick={() => { if (l.code !== lang) { setLang(l.code); rememberVideoLang(l.code); } }}>{l.label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
