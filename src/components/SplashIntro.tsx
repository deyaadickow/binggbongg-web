import { useEffect, useRef, useState } from "react";

// Bingg and Bongg splash, the same 4.5 s video as the phones (Steve, 2026-11-13: "Lady...Bingg...
// Man...Bongg Bingg Bongg together one after another pink and blue"): a lady says "Bingg" over pink
// Bingg, a man says "Bongg" over blue Bongg, then both pandas with pink Bingg + blue Bongg + BinggBongg.com.
// Once per browser tab session. Browsers block autoplay with sound, so it tries with sound
// first and falls back to muted. Tap to skip; capped at 6.5 s so it can never hold the site.
const KEY = "bb_splash_seen";
const MAX_MS = 6500;

function shouldShow(): boolean {
  if (typeof window === "undefined") return false;
  if (navigator.webdriver || /bot|crawl|spider|slurp|facebookexternalhit|lighthouse|headless/i.test(navigator.userAgent)) return false;
  try {
    if (sessionStorage.getItem(KEY)) return false;
  } catch {
    /* storage blocked: still show it once for this page load */
  }
  return true;
}

export default function SplashIntro() {
  const [show, setShow] = useState(shouldShow);
  const [leaving, setLeaving] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!show) return;
    try { sessionStorage.setItem(KEY, "1"); } catch { /* blocked */ }
    const v = ref.current;
    const cap = window.setTimeout(close, MAX_MS);
    if (v) {
      v.muted = false;
      v.play().catch(() => {
        v.muted = true;
        v.play().catch(close);
      });
    }
    return () => window.clearTimeout(cap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  function close() {
    setLeaving(true);
    window.setTimeout(() => setShow(false), 350);
  }

  if (!show) return null;
  return (
    <div
      onClick={close}
      style={{
        position: "fixed", inset: 0, zIndex: 100000, background: "#000",
        display: "flex", alignItems: "center", justifyContent: "center",
        opacity: leaving ? 0 : 1, transition: "opacity 350ms ease", cursor: "pointer",
      }}
    >
      <video
        ref={ref}
        src="/splash.mp4"
        playsInline
        preload="auto"
        onEnded={() => window.setTimeout(close, 400)}
        onError={close}
        style={{ height: "100%", maxWidth: "100%", objectFit: "contain" }}
      />
    </div>
  );
}
