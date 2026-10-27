// "One Stroke" (Steve, 2026-10-12, with a screen recording of a puzzle advert: "Create this
// game.") — draw a whole shape in one unbroken line, never lifting and never going back over a
// line already drawn. The fifth tap-game engine, web side.
//
// The tracing deliberately is NOT path-following. Requiring the pointer to stay on the drawn
// line makes a curved edge a dexterity test, which is a different and worse game than the one
// in the clip. The pointer only has to REACH the next node: come within a generous radius of a
// node joined to the current one by an unused edge and that edge is consumed, with the line
// painted along the edge's own geometry so a curve looks traced even though the pointer cut the
// corner. That also makes the rules exact — an edge is either used or it is not, so "every line
// covered" and "no line twice" are set membership rather than tolerance.
//
// SVG rather than a canvas, because the levels are authored as fractions of a 0..1 square:
// a viewBox of "0 0 1 1" means the browser does every bit of the scaling, and the same
// coordinates that the phones have to convert by hand are simply the drawing instructions here.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchOneStrokeLevels, type OneStrokeLevel } from "../lib/onestroke";
import { tt, useT  } from "../lib/i18n";
import { Confetti, MuteButton, SceneBanner } from "./GameShow";
import { SCENES } from "../lib/gameSceneData";
import { haptic, sfx } from "../lib/gameSounds";

// The board's viewBox is inset beyond 0..1 so a thick stroke on an edge node is not clipped in
// half. These two constants exist because that inset ALSO has to be undone when a pointer
// position is converted back into level coordinates — getting that wrong is invisible on screen
// (the shape draws perfectly) and breaks every hit test, which is exactly what it did: the
// first browser playthrough traced the whole Kite correctly and reported "0 of 5 lines".
const VIEW_MIN = -0.08;
const VIEW_SPAN = 1.16;

const IQ_BASE = 100;
const IQ_PER_EDGE = 3;
const IQ_PER_LEVEL = 11;

export function OneStrokeOverlay({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const [levels, setLevels] = useState<OneStrokeLevel[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [index, setIndex] = useState(0);
  const [used, setUsed] = useState<Set<number>>(new Set());
  const [current, setCurrent] = useState<number | null>(null);
  const [finger, setFinger] = useState<{ x: number; y: number } | null>(null);
  const [iq, setIq] = useState(IQ_BASE);
  const [message, setMessage] = useState("");
  // Game Show (Steve, 2026-10-27): a tick for every line drawn, a chime + confetti on a solve.
  const [burst, setBurst] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const drawing = useRef(false);
  // The trace itself lives in refs, and state is only a mirror of it for rendering.
  //
  // Not a style preference: pointermove reading `current` and `used` out of React state would
  // see values that have not updated yet, and a fast drag fires several moves inside one batch
  // — so a flick across three nodes would consume one edge instead of three. Refs are read and
  // written synchronously, so no move is lost. (This was NOT the cause of the "0 of 5 lines"
  // bug, which was the viewBox conversion above; it is a real one it would have masked next.)
  const usedRef = useRef<Set<number>>(new Set());
  const currentRef = useRef<number | null>(null);

  const level = levels && levels[index] ? levels[index] : null;
  const solved = !!level && used.size === level.edges.length;

  useEffect(() => {
    let alive = true;
    fetchOneStrokeLevels()
      .then((rows) => { if (alive) { setLevels(rows); setFailed(false); } })
      // A failed fetch is not an empty game — an empty board would read as the feature being
      // broken rather than the connection being out.
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  const restart = useCallback(() => {
    usedRef.current = new Set();
    currentRef.current = null;
    setUsed(new Set());
    setCurrent(null);
    setFinger(null);
    setMessage("");
  }, []);

  useEffect(() => { restart(); }, [index, restart]);

  /** Pointer position in the level's own 0..1 space. */
  function toUnit(e: React.PointerEvent): { x: number; y: number } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    // The SVG's OWN transform, not arithmetic on its bounding box. Two attempts at doing this
    // by hand were wrong and this is why: the element is not necessarily square, so
    // preserveAspectRatio letterboxes the drawing inside it, and the viewBox is inset past
    // 0..1 as well. Both were invisible on screen — the shape drew perfectly — while every hit
    // test missed, so a correctly traced Kite reported "0 of 5 lines". getScreenCTM accounts
    // for the viewBox, the letterboxing and any transform at once, and cannot drift from
    // whatever the CSS does to this element later.
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const local = p.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }

  function nearest(p: { x: number; y: number }): number | null {
    if (!level) return null;
    // In 0..1 space, so one constant is right at every size — which is the whole point of
    // authoring levels as fractions.
    const grab = 0.09;
    let best: number | null = null;
    let bestD = Infinity;
    level.nodes.forEach((n, i) => {
      const d = Math.hypot(n[0] - p.x, n[1] - p.y);
      if (d < grab && d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  function unusedEdge(a: number, b: number): number | null {
    if (!level) return null;
    for (let i = 0; i < level.edges.length; i++) {
      if (usedRef.current.has(i)) continue;
      const e = level.edges[i];
      if ((e.a === a && e.b === b) || (e.b === a && e.a === b)) return i;
    }
    return null;
  }

  function onDown(e: React.PointerEvent) {
    if (!level || solved) return;
    const p = toUnit(e);
    if (!p) return;
    const hit = nearest(p);
    if (hit === null) return;
    // Starting somewhere new abandons the old trace: a player touching down elsewhere means
    // "let me try from there", and silently keeping the old stroke would leave the shape
    // unfinishable for a reason they cannot see.
    if (currentRef.current !== null && hit !== currentRef.current) {
      usedRef.current = new Set();
      setUsed(new Set());
    }
    currentRef.current = hit;
    setCurrent(hit);
    setFinger(p);
    drawing.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function onMove(e: React.PointerEvent) {
    if (!drawing.current || !level || currentRef.current === null) return;
    const p = toUnit(e);
    if (!p) return;
    setFinger(p);
    const hit = nearest(p);
    if (hit === null || hit === currentRef.current) return;
    const edge = unusedEdge(currentRef.current, hit);
    if (edge === null) return;
    // No edge, or one already used: the stroke simply does not move. NOT a failure — a pointer
    // strays over a node constantly, and punishing that reads as broken rather than hard.
    const next = new Set(usedRef.current);
    next.add(edge);
    usedRef.current = next;
    currentRef.current = hit;
    setUsed(next);
    setCurrent(hit);
    setIq((v) => v + IQ_PER_EDGE);
    setMessage("");
    if (next.size === level.edges.length) {
      drawing.current = false;
      setFinger(null);
      setIq((v) => v + IQ_PER_LEVEL);
      setMessage(tt("solved_in_one_stroke"));
      sfx.correct(); haptic([40, 60, 40]); setBurst(Date.now());
    } else sfx.tick();
  }

  function onUp() {
    if (!drawing.current || !level) return;
    drawing.current = false;
    setFinger(null);
    if (usedRef.current.size < level.edges.length && currentRef.current !== null) {
      setMessage(`You drew ${usedRef.current.size} of ${level.edges.length} lines. Start again from any point.`);
    }
  }

  const paths = useMemo(() => {
    if (!level) return [];
    return level.edges.map((e) => {
      const pts = [level.nodes[e.a], ...(e.via ?? []), level.nodes[e.b]];
      return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]} ${p[1]}`).join(" ");
    });
  }, [level]);

  return (
    <div className="onestroke-overlay">
      <Confetti burst={burst} />
      <div className="onestroke-inner">
        <div className="onestroke-top">
          <button className="btn ghost" onClick={onClose}>{t("close_2")}</button>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <MuteButton />
            <span className="onestroke-iq"><b>{t("iq")}</b> {iq}</span>
          </span>
        </div>

        {level ? (
          <>
            <SceneBanner scene={SCENES.space} height={72}>
              <div style={{ position: "absolute", left: 8, right: 8, top: "50%", transform: "translateY(-50%)", textAlign: "center" }}>
                <span className="onestroke-title gs-anim" style={{ display: "inline-block", maxWidth: "100%", boxSizing: "border-box", background: "rgba(0,0,0,.55)", borderRadius: 999, padding: "4px 14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", animation: solved ? "gs-pop .6s ease-in-out 3" : "none" }}>
                  {solved ? "🌟 " : ""}{level.level_no}. {level.name}
                </span>
              </div>
            </SceneBanner>
            <div className="onestroke-hint">{message || `${used.size} of ${level.edges.length} lines`}</div>
            <svg
              ref={svgRef}
              className="onestroke-board"
              viewBox={`${VIEW_MIN} ${VIEW_MIN} ${VIEW_SPAN} ${VIEW_SPAN}`}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            >
              {/* Untraced first, so a traced edge always paints over its own track. */}
              {paths.map((d, i) => !used.has(i) && (
                <path key={`t${i}`} d={d} className="onestroke-track" />
              ))}
              {paths.map((d, i) => used.has(i) && (
                <path key={`d${i}`} d={d} className="onestroke-done" />
              ))}
              {/* The loose end, so the stroke reads as continuous before the next node. */}
              {current !== null && finger && (
                <path d={`M${level.nodes[current][0]} ${level.nodes[current][1]} L${finger.x} ${finger.y}`} className="onestroke-done" />
              )}
              {level.nodes.map((n, i) => (
                <circle key={i} cx={n[0]} cy={n[1]} r={i === current ? 0.033 : 0.022}
                        className={i === current ? "onestroke-node live" : "onestroke-node"} />
              ))}
            </svg>
            <div className="onestroke-actions">
              <button className="btn ghost" onClick={restart}>{t("start_again")}</button>
              {solved && (
                <button className="btn" onClick={() => setIndex((i) => (levels && i + 1 < levels.length ? i + 1 : 0))}>
                  {t("next_shape")}</button>
              )}
            </div>
          </>
        ) : failed ? (
          <p className="soft">{t("couldn_t_load_the_shapes_check_your_conn")}</p>
        ) : (
          <p className="soft">{t("imagePickerLoading")}</p>
        )}
      </div>
    </div>
  );
}
