import { useLayoutEffect, useRef, useState } from "react";
import type { ExcitingNewsFlyer, TextArea, TextAreas } from "../lib/excitingnews";

/**
 * The flyer's words, drawn ON the artwork rather than baked into it.
 *
 * Steve, 2026-10-02: "Tell me exactly what you need done to the flyer so i can make it in english
 * and the app can translated in any language." Words painted into a picture can never be
 * translated — character recognition and a redraw comes out crooked. So he makes one artwork with
 * three empty boxes, types the words once, and this draws them in whatever language the reader
 * has chosen.
 *
 * Positions arrive from the server as shares of the image, never pixels, so the same numbers fit a
 * thumbnail and a full-screen card alike, and a box can be nudged by a deploy instead of three app
 * releases.
 */

/** Text that shrinks until it fits its box.
 *
 *  This is the part that makes other languages safe. German runs about a third longer than
 *  English and Finnish longer still; a size that suits the English would overflow them. Rather
 *  than clip — which loses words silently, the worst outcome on a flyer — the text steps down
 *  until it fits, and only stops at a floor where it would stop being readable.
 */
function FitText({ children, max, min, bold, color, shadow, align = "center" }: {
  children: React.ReactNode;
  /** Both as a share of the FLYER's height, so type scales with the card. */
  max: number;
  min: number;
  bold?: boolean;
  color: string;
  shadow: string;
  align?: "center" | "left";
}) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(max);

  useLayoutEffect(() => {
    const b = box.current, i = inner.current;
    if (!b || !i) return;
    const h = b.clientHeight, w = b.clientWidth;
    if (!h || !w) return;
    // Binary search rather than stepping down one notch at a time: a long paragraph in a small
    // box would otherwise re-layout dozens of times per flyer, and a grid shows several at once.
    let lo = min, hi = max, best = min;
    for (let n = 0; n < 7; n++) {
      const mid = (lo + hi) / 2;
      i.style.fontSize = `${mid}px`;
      const fits = i.scrollHeight <= h && i.scrollWidth <= w + 1;
      if (fits) { best = mid; lo = mid; } else { hi = mid; }
    }
    i.style.fontSize = `${best}px`;
    setSize(best);
  }, [children, max, min]);

  return (
    <div ref={box} style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <div
        ref={inner}
        style={{
          fontSize: size, lineHeight: 1.2, textAlign: align, width: "100%",
          fontWeight: bold ? 700 : 600, color, textShadow: shadow, overflowWrap: "break-word",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function areaStyle(a: TextArea): React.CSSProperties {
  return { position: "absolute", left: `${a.x}%`, top: `${a.y}%`, width: `${a.w}%`, height: `${a.h}%` };
}

export function FlyerOverlay({ flyer, areas, height }: {
  flyer: ExcitingNewsFlyer;
  areas: TextAreas;
  /** The rendered card height in pixels — type sizes are a share of it, so a flyer reads the
   *  same whether it is a grid thumbnail or filling the screen. */
  height: number;
}) {
  const o = flyer.overlay;
  if (!o) return null;
  const title = (o.title ?? "").trim();
  const subtitle = (o.subtitle ?? "").trim();
  const body1 = (o.body1 ?? "").trim();
  const body2 = (o.body2 ?? "").trim();
  if (!title && !subtitle && !body1 && !body2) return null;

  // Gold for the header, cream and white for the two paragraphs — matching the flyer Steve
  // designed, so the drawn text looks like it was always part of it.
  const goldShadow = "0 0 .35em rgba(255,200,90,.55)";
  const darkShadow = "0 1px 2px rgba(0,0,0,.9)";

  return (
    // Never takes a tap: the card itself stays the thing you click.
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }} aria-hidden="false">
      {(title || subtitle) && (
        <div style={{ ...areaStyle(areas.header), display: "flex", flexDirection: "column", justifyContent: "center", gap: "3%" }}>
          {title && (
            <div style={{ flex: subtitle ? "0 0 62%" : "1 1 auto", minHeight: 0 }}>
              <FitText max={height * 0.052} min={height * 0.019} bold color="#F7DD8C" shadow={goldShadow}>
                {title}
              </FitText>
            </div>
          )}
          {subtitle && (
            <div style={{ flex: title ? "0 0 38%" : "1 1 auto", minHeight: 0 }}>
              <FitText max={height * 0.026} min={height * 0.014} color="#F0C86E" shadow={goldShadow}>
                {subtitle}
              </FitText>
            </div>
          )}
        </div>
      )}
      {body1 && (
        <div style={areaStyle(areas.body1)}>
          <FitText max={height * 0.0175} min={height * 0.010} color="#FFF4D6" shadow={darkShadow}>{body1}</FitText>
        </div>
      )}
      {body2 && (
        <div style={areaStyle(areas.body2)}>
          <FitText max={height * 0.0175} min={height * 0.010} color="#FFFFFF" shadow={darkShadow}>{body2}</FitText>
        </div>
      )}
    </div>
  );
}
