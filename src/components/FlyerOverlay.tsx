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
function FitText({ children, max, min, bold, color, shadow, align = "center", panel }: {
  children: React.ReactNode;
  /** Both as a share of the FLYER's height, so type scales with the card. */
  max: number;
  min: number;
  bold?: boolean;
  color: string;
  shadow: string;
  align?: "center" | "left";
  /** Draw a black box with a gold border around the words, sized to the words themselves. */
  panel?: boolean;
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
      // The drawn box's padding is a share of the type size, so it has to be applied for EACH
      // trial, not left at the previous render's value — otherwise the text is measured against
      // one padding and drawn with another, and the box ends up taller than its area. That is how
      // a two-line title grew over the subtitle underneath it.
      if (panel) i.style.padding = `${mid * 0.55}px ${mid * 0.8}px`;
      const fits = i.scrollHeight <= h && i.scrollWidth <= w + 1;
      if (fits) { best = mid; lo = mid; } else { hi = mid; }
    }
    i.style.fontSize = `${best}px`;
    if (panel) i.style.padding = `${best * 0.55}px ${best * 0.8}px`;
    setSize(best);
  }, [children, max, min, panel]);

  return (
    <div ref={box} style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <div
        ref={inner}
        style={{
          fontSize: size, lineHeight: 1.2, textAlign: align, width: "100%",
          fontWeight: bold ? 700 : 600, color, textShadow: shadow, overflowWrap: "break-word",
          // The box takes its HEIGHT from the words it actually holds, which is what makes it the
          // right size in a language that runs longer than English. Its width stays the width of
          // the area, so a flyer's boxes line up with each other the way drawn ones do.
          ...(panel ? {
            background: "rgba(0,0,0,0.82)",
            border: "2px solid #D4A72C",
            borderRadius: size * 0.6,
            padding: `${size * 0.55}px ${size * 0.8}px`,
            boxShadow: "0 0 .6em rgba(212,167,44,.35)",
            boxSizing: "border-box" as const,
          } : {}),
        }}
      >
        {children}
      </div>
    </div>
  );
}

function hasSize(a?: TextArea): boolean {
  return !!a && a.w > 0 && a.h > 0;
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
  const panel = flyer.draw_panels === true;
  const title = (o.title ?? "").trim();
  const subtitle = (o.subtitle ?? "").trim();
  const body1 = (o.body1 ?? "").trim();
  const body2 = (o.body2 ?? "").trim();
  const body3 = (o.body3 ?? "").trim();
  if (!title && !subtitle && !body1 && !body2 && !body3) return null;

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
              <FitText max={height * 0.052} min={height * 0.019} bold color="#F7DD8C" shadow={goldShadow} panel={panel}>
                {title}
              </FitText>
            </div>
          )}
          {subtitle && (
            <div style={{ flex: title ? "0 0 38%" : "1 1 auto", minHeight: 0 }}>
              <FitText max={height * 0.034} min={height * 0.018} color="#F0C86E" shadow={goldShadow} panel={panel}>
                {subtitle}
              </FitText>
            </div>
          )}
        </div>
      )}
      {body1 && (
        <div style={areaStyle(areas.body1)}>
          <FitText max={height * 0.026} min={height * 0.014} color="#FFF4D6" shadow={darkShadow} panel={panel}>{body1}</FitText>
        </div>
      )}
      {body2 && (
        <div style={areaStyle(areas.body2)}>
          <FitText max={height * 0.026} min={height * 0.014} color="#FFFFFF" shadow={darkShadow} panel={panel}>{body2}</FitText>
        </div>
      )}
      {/* Only the four-frame designs have a third box. A box with no size is never drawn. */}
      {body3 && hasSize(areas.body3) && (
        <div style={areaStyle(areas.body3!)}>
          <FitText max={height * 0.026} min={height * 0.014} color="#FFF4D6" shadow={darkShadow} panel={panel}>{body3}</FitText>
        </div>
      )}
    </div>
  );
}
