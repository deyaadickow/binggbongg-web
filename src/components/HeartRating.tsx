import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useT } from "../lib/i18n";

/** The feed heart's red (Steve, 2026-11-16: "First i want it to turn red"). */
export const HEART_RED = "#FF2D55";

/** One heart with its number in the middle, white and bold. */
function NumberHeart({ n, lit, big }: { n: number; lit: boolean; big: boolean }) {
  return (
    <svg viewBox="0 0 24 22" aria-hidden
      style={{ width: "100%", height: "auto", display: "block", overflow: "visible",
               transform: big ? "scale(1.22)" : "scale(1)", transition: "transform .15s, opacity .15s",
               opacity: lit ? 1 : 0.4 }}>
      <path d="M12 21.2 10.5 19.8C5.2 15 1.7 11.8 1.7 7.9 1.7 4.7 4.2 2.2 7.4 2.2c1.8 0 3.5.8 4.6 2.2 1.1-1.4 2.8-2.2 4.6-2.2 3.2 0 5.7 2.5 5.7 5.7 0 3.9-3.5 7.1-8.8 11.9L12 21.2Z"
        fill={HEART_RED} stroke={lit ? "#FFB3C2" : "none"} strokeWidth={0.6} />
      <text x="12" y="12.6" textAnchor="middle" dominantBaseline="middle" fill="#fff"
        style={{ fontWeight: 900, fontSize: n === 10 ? 8.2 : 9.5, fontFamily: "inherit" }}>{n}</text>
    </svg>
  );
}

/**
 * The 1-10 rating row the feed heart opens (Steve, 2026-11-16): ten red hearts side by side,
 * 1 on the left ("Just like") to 10 on the right ("Love it"), in a black gold-bordered panel
 * above the heart button. Picking one shows "You rated N ♥" for a second and closes; a click
 * anywhere outside closes it with the like kept and no rating.
 */
export function HeartRatingPanel({ anchorRef, current, onRate, onClose }: {
  anchorRef: RefObject<HTMLElement | null>;
  /** The member's rating so far, highlighted when the row is reopened; 0 = none. */
  current: number;
  onRate: (n: number) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [hover, setHover] = useState(0);
  const [picked, setPicked] = useState(0);
  const [top, setTop] = useState<number | null>(null);
  const [shown, setShown] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef(0);

  // Sit just above the heart button, inside the viewport.
  useLayoutEffect(() => {
    const place = () => {
      const a = anchorRef.current?.getBoundingClientRect();
      const h = panelRef.current?.offsetHeight ?? 90;
      if (!a) { setTop(Math.max(12, (window.innerHeight - h) / 2)); return; }
      let y = a.top - h - 10;
      if (y < 12) y = Math.min(window.innerHeight - h - 12, a.bottom + 10);
      setTop(Math.max(12, Math.min(y, window.innerHeight - h - 12)));
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [anchorRef]);

  useEffect(() => { const r = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(r); }, []);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const value = picked || hover || current;

  function pick(n: number) {
    if (picked) return;
    setPicked(n);
    onRate(n);
    closeTimer.current = window.setTimeout(onClose, 1100);
  }

  return (
    <div
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      // A touch long-press on the heart opens this AND fires a contextmenu a moment later, over
      // this backdrop — so the menu is only swallowed here, never treated as "outside".
      onContextMenu={(e) => e.preventDefault()}
      style={{ position: "fixed", inset: 0, zIndex: 70, background: "transparent" }}>
      <div
        ref={panelRef}
        role="dialog"
        aria-label={t("hr_rate_this_video")}
        style={{ position: "fixed", left: "50%", top: top ?? -9999, width: "max-content", maxWidth: "calc(100vw - 32px)",
                 transform: `translateX(-50%) scale(${shown ? 1 : 0.85})`, opacity: shown ? 1 : 0,
                 transition: "transform .18s cubic-bezier(.2,1.4,.4,1), opacity .15s",
                 background: "#000", border: "1.5px solid var(--gold-border)", borderRadius: 16,
                 padding: "12px 12px 8px", boxShadow: "0 10px 30px rgba(0,0,0,.6)", boxSizing: "border-box" }}>
        <div style={{ display: "flex", gap: 4, alignItems: "center", justifyContent: "center", visibility: picked ? "hidden" : "visible" }}
          onPointerLeave={() => setHover(0)}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n}`}
              onPointerEnter={(e) => { if (e.pointerType === "mouse") setHover(n); }}
              onClick={() => pick(n)}
              style={{ width: "min(32px, calc((100vw - 92px) / 10))", padding: 0, margin: 0, border: "none",
                       background: "transparent", cursor: "pointer", lineHeight: 0, flex: "0 0 auto" }}>
              <NumberHeart n={n} lit={!value || n <= value} big={n === value && value > 0} />
            </button>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, color: "var(--gold)",
                      fontSize: 11, fontWeight: 700, visibility: picked ? "hidden" : "visible" }}>
          <span>{t("hr_just_like")}</span>
          <span>{t("hr_love_it")}</span>
        </div>
        {picked > 0 && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
                        color: "var(--gold)", fontWeight: 900, fontSize: 18 }}>
            {t("hr_you_rated", picked)}
          </div>
        )}
      </div>
    </div>
  );
}

/** "♥ 8.4 rating · 12 ratings" for the hold menu, or null when nobody has rated it yet. */
export function ratingLine(t: (k: "hr_rating_line" | "hr_rating_line_one", ...a: (string | number)[]) => string,
  avg: unknown, count: unknown): string | null {
  const c = Math.round(Number(count ?? 0) || 0);
  if (c <= 0) return null;
  const a = (Number(avg ?? 0) || 0).toFixed(1);
  return c === 1 ? t("hr_rating_line_one", a) : t("hr_rating_line", a, c);
}
