import { useEffect } from "react";

/** Full-screen player for one feature video: plays with sound, the browser's own controls, a gold
 *  back button and the feature's name on top. Esc or the back button closes it. Shared by the
 *  directory's tiles (their short videos) and the Bingg Bongg Features Videos page (the 60-second
 *  ones), so both play the same way. */
export function FeatureVideoPlayer({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
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
      <video src={url} controls autoPlay playsInline
        style={{ flex: 1, minHeight: 0, width: "100%", objectFit: "contain", background: "#000" }} />
    </div>
  );
}
