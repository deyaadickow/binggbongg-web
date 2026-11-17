import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useT } from "../lib/i18n";

/** The feed heart's red (Steve, 2026-11-16: "First i want it to turn red"). */
export const HEART_RED = "#FF2D55";

/** Soft dark shadows so the bare hearts, numbers and labels read over any video frame. */
const TEXT_SHADOW = "0 1px 2px rgba(0,0,0,.95), 0 0 6px rgba(0,0,0,.75)";
const HEART_SHADOW = "drop-shadow(0 1px 2px rgba(0,0,0,.85)) drop-shadow(0 0 4px rgba(0,0,0,.5))";

/** One heart with its number in the middle, white and bold. */
function NumberHeart({ n, lit, big, size }: { n: number; lit: boolean; big: boolean; size: number }) {
  return (
    <svg viewBox="0 0 24 22" aria-hidden width={size} height={size * 22 / 24}
      style={{ display: "block", overflow: "visible", filter: HEART_SHADOW,
               transform: big ? "scale(1.22)" : "scale(1)", transition: "transform .15s, opacity .15s",
               opacity: lit ? 1 : 0.45 }}>
      <path d="M12 21.2 10.5 19.8C5.2 15 1.7 11.8 1.7 7.9 1.7 4.7 4.2 2.2 7.4 2.2c1.8 0 3.5.8 4.6 2.2 1.1-1.4 2.8-2.2 4.6-2.2 3.2 0 5.7 2.5 5.7 5.7 0 3.9-3.5 7.1-8.8 11.9L12 21.2Z"
        fill={HEART_RED} stroke={lit ? "#FFB3C2" : "none"} strokeWidth={0.6} />
      <text x="12" y="12.6" textAnchor="middle" dominantBaseline="middle" fill="#fff"
        style={{ fontWeight: 900, fontSize: n === 10 ? 8.2 : 9.5, fontFamily: "inherit",
                 paintOrder: "stroke", stroke: "rgba(0,0,0,.45)", strokeWidth: 1.2 }}>{n}</text>
    </svg>
  );
}

/** Space between the row and the existing heart, and the least margin kept at the left edge. */
const GAP_TO_HEART = 6;
const LEFT_EDGE = 6;

/**
 * The 1-10 rating row the feed heart opens (Steve, 2026-11-16): ten red hearts in one row,
 * 1 on the left ("Just like") to 10 on the right ("Love it").
 *
 * Steve, 2026-11-16 (second pass): "Please make just the hearts appear right next to the
 * existing heart without the black background. but keep the 'Like' and the 'Love'." So no
 * card: the bare hearts run LEFT from the heart button, 10 nearest it, vertically centred on
 * it, each heart, number and label carrying a soft shadow instead. Each tap target is 32px
 * wide where the room allows and shrinks to fit the space left of the heart on a phone (the
 * height stays 40px so a narrow one is still easy to hit). Picking one shows "You rated N ♥"
 * in the row's place for a second and closes; a click anywhere outside closes it with the
 * like kept and no rating.
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
  // Where the row's right end and vertical centre sit (viewport px), and each heart's slot.
  const [box, setBox] = useState<{ right: number; centerY: number; slot: number } | null>(null);
  const [shown, setShown] = useState(false);
  const closeTimer = useRef(0);

  useLayoutEffect(() => {
    const place = () => {
      const a = anchorRef.current?.getBoundingClientRect();
      const vw = document.documentElement.clientWidth || window.innerWidth;
      if (!a) { setBox({ right: 8, centerY: window.innerHeight / 2, slot: 32 }); return; }
      const room = a.left - GAP_TO_HEART - LEFT_EDGE;
      const slot = Math.max(18, Math.min(32, Math.floor(room / 10)));
      setBox({ right: vw - (a.left - GAP_TO_HEART), centerY: a.top + a.height / 2, slot });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [anchorRef]);

  useEffect(() => { const r = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(r); }, []);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const value = picked || hover || current;
  const slot = box?.slot ?? 32;
  const heart = Math.min(28, slot - 2);
  const label = { position: "absolute" as const, top: "100%", marginTop: -4, color: "var(--gold)", fontSize: 11,
                  fontWeight: 800, whiteSpace: "nowrap" as const, textShadow: TEXT_SHADOW, pointerEvents: "none" as const };

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
        role="dialog"
        aria-label={t("hr_rate_this_video")}
        style={{ position: "fixed", right: box?.right ?? -9999, top: box?.centerY ?? -9999,
                 transform: `translateY(-50%) scale(${shown ? 1 : 0.85})`, transformOrigin: "right center",
                 opacity: shown ? 1 : 0, transition: "transform .18s cubic-bezier(.2,1.4,.4,1), opacity .15s" }}>
        <div style={{ position: "relative", display: "flex", alignItems: "center", visibility: picked ? "hidden" : "visible" }}
          onPointerLeave={() => setHover(0)}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n}`}
              onPointerEnter={(e) => { if (e.pointerType === "mouse") setHover(n); }}
              onClick={() => pick(n)}
              style={{ position: "relative", width: slot, height: 40, padding: 0, margin: 0, border: "none",
                       background: "transparent", cursor: "pointer", lineHeight: 0, flex: "0 0 auto",
                       display: "flex", alignItems: "center", justifyContent: "center" }}>
              <NumberHeart n={n} size={heart} lit={!value || n <= value} big={n === value && value > 0} />
              {n === 1 && <span style={{ ...label, left: 0 }}>{t("hr_just_like")}</span>}
              {n === 10 && <span style={{ ...label, right: 0 }}>{t("hr_love_it")}</span>}
            </button>
          ))}
        </div>
        {picked > 0 && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "flex-end",
                        color: "var(--gold)", fontWeight: 900, fontSize: 18, whiteSpace: "nowrap", textShadow: TEXT_SHADOW }}>
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
