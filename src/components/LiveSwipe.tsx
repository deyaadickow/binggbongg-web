// Next / previous for the feed's Live button (Steve, 2026-11-12) — see lib/liveSwipe.
//
// Touch: swipe up on the video = next, down = previous. Desktop: mouse wheel over the video, the
// Up / Down arrow keys, or the small gold ▲ / ▼ buttons on the right. Wraps at both ends.
//
// Moving on is a route change to the next item, and the live room is keyed by its room name, so
// the old room UNMOUNTS on the way: its own cleanup disconnects LiveKit, stops the watching
// heartbeat and the chat listener — one room connection at a time, by the page's own path.
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { goToSwipe, swipeStateOf } from "../lib/liveSwipe";

const MIN_SWIPE_PX = 60;
const STEP_GAP_MS = 700;

/** Renders nothing (and listens to nothing) unless this page was opened by the feed's Live button.
 *  `zone`: CSS selector of the area a swipe / wheel must start on (the video), so chat scrolling
 *  and the page's own scroll keep working. `enabled` false pauses it (e.g. a guest on stage). */
export function LiveSwipeNav({ zone, enabled = true }: { zone: string; enabled?: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const swipe = swipeStateOf(location.state);
  const active = !!swipe && swipe.items.length > 1 && enabled;
  const swipeRef = useRef(swipe);
  swipeRef.current = swipe;
  const lastStep = useRef(0);

  useEffect(() => {
    if (!active) return;
    const step = (dir: 1 | -1) => {
      const s = swipeRef.current;
      if (!s) return;
      const now = Date.now();
      if (now - lastStep.current < STEP_GAP_MS) return;
      lastStep.current = now;
      goToSwipe(navigate, s.items, s.index + dir, true);
    };
    const inZone = (t: EventTarget | null) => t instanceof Element && !!t.closest(zone);
    const typing = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

    let start: { x: number; y: number; at: number } | null = null;
    const onTouchStart = (e: TouchEvent) => {
      start = e.touches.length === 1 && inZone(e.target)
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY, at: Date.now() } : null;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const s = start; start = null;
      if (!s || e.changedTouches.length === 0) return;
      const dx = e.changedTouches[0].clientX - s.x;
      const dy = e.changedTouches[0].clientY - s.y;
      if (Date.now() - s.at > 900 || Math.abs(dy) < MIN_SWIPE_PX || Math.abs(dy) < Math.abs(dx) * 1.5) return;
      step(dy < 0 ? 1 : -1); // finger up = next
    };
    const onWheel = (e: WheelEvent) => {
      if (!inZone(e.target) || Math.abs(e.deltaY) < 20 || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
      e.preventDefault();
      step(e.deltaY > 0 ? 1 : -1); // scroll down = next
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== "ArrowDown" && e.key !== "ArrowUp") || e.altKey || e.ctrlKey || e.metaKey || typing(e.target)) return;
      e.preventDefault();
      step(e.key === "ArrowDown" ? 1 : -1);
    };
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
    };
  }, [active, zone, navigate]);

  if (!active || !swipe) return null;
  return (
    <div className="live-swipe-btns" role="group" aria-label="Next live">
      <button type="button" aria-label="Previous live" title="Previous live (↑)"
        onClick={() => goToSwipe(navigate, swipe.items, swipe.index - 1, true)}>▲</button>
      <button type="button" aria-label="Next live" title="Next live (↓)"
        onClick={() => goToSwipe(navigate, swipe.items, swipe.index + 1, true)}>▼</button>
    </div>
  );
}
