// "Block Escape" (Steve, 2026-10-12, with a screen recording of a puzzle advert: "Create this
// game.") — drag a block and it slides until something stops it. Reach a gate of your own colour
// and it leaves the board. Clear them all.
//
// The sixth tap-game engine, with its own overlay: nothing about sliding blocks shares the
// spawn-and-tap machinery the catch modes use, which is the same reason One Stroke has its own.
//
// The rules are NOT in here — they live in lib/blockescape.ts, free of React, so they can be
// checked against the solver that proved every board clearable. If the two ever drift, a board
// verified as solvable silently stops being so.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  EXITED, blockColour, fetchBlockEscapeLevels, remaining, slide,
  type BEBlock, type BlockEscapeLevel,
} from "../lib/blockescape";
import { tt, useT  } from "../lib/i18n";
import { Confetti, MuteButton, SceneBanner } from "./GameShow";
import { SCENES } from "../lib/gameSceneData";
import { haptic, sfx } from "../lib/gameSounds";

export function BlockEscapeOverlay({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const [levels, setLevels] = useState<BlockEscapeLevel[] | null>(null);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [blocks, setBlocks] = useState<BEBlock[]>([]);
  const [moves, setMoves] = useState(0);
  const [solved, setSolved] = useState(false);
  const [hint, setHint] = useState("Drag a block — it slides until something stops it.");
  // Game Show (Steve, 2026-10-27): a click per slide, two notes when a block gets out, a chime +
  // confetti when the board is clear.
  const [burst, setBurst] = useState(0);
  // Board states before each move, so a bricked board is recoverable.
  const history = useRef<BEBlock[][]>([]);
  const drag = useRef<{ i: number; x: number; y: number } | null>(null);

  const level = levels?.[index];

  useEffect(() => {
    fetchBlockEscapeLevels()
      .then((rows) => {
        if (rows.length === 0) setError(tt("no_boards_yet_try_again_in_a_moment"));
        setLevels(rows);
      })
      // A failed fetch is not an empty game: say so, rather than showing a blank board that
      // looks like the feature itself is broken.
      .catch((e) => setError((e as Error).message));
  }, []);

  const show = useCallback((at: number) => {
    if (!levels || levels.length === 0) return;
    const i = at >= levels.length ? 0 : Math.max(0, at);
    const lv = levels[i];
    setIndex(i);
    setBlocks(lv.pieces.map((p) => ({ ...p, gone: false })));
    history.current = [];
    setMoves(0);
    setSolved(false);
    setHint(lv.par_moves > 0
      ? `${lv.pieces.length} blocks — best known is ${lv.par_moves} moves`
      : `${lv.pieces.length} blocks to get out`);
  }, [levels]);

  useEffect(() => { if (levels && levels.length > 0) show(0); }, [levels, show]);

  function move(i: number, dx: number, dy: number) {
    if (!level || solved) return;
    const next = blocks.map((b) => ({ ...b }));
    const before = blocks.map((b) => ({ ...b }));
    const travelled = slide(next, level.gates, level.cols, level.rows, i, dx, dy);
    if (travelled === 0) {
      // Not a failure and not a penalty: a block with nowhere to go is information.
      setHint("That one can't move that way.");
      return;
    }
    if (travelled === EXITED) next[i].gone = true;
    const cleared = remaining(next) === 0;
    if (cleared) { sfx.correct(); haptic([40, 60, 40]); setBurst(Date.now()); }
    else if (travelled === EXITED) { sfx.reveal(); haptic(25); }
    else sfx.lock();
    history.current.push(before);
    setBlocks(next);
    setMoves((m) => m + 1);
    const left = remaining(next);
    if (left === 0) {
      setSolved(true);
      const par = level.par_moves;
      const used = moves + 1;
      setHint(par > 0 && used < par ? `Cleared in ${used} — better than the best known ${par}!`
        : par > 0 && used === par ? `Cleared in ${used} — matched the best known.`
        : `Board cleared in ${used} moves.`);
    } else {
      setHint(left === 1 ? "1 block left" : `${left} blocks left`);
    }
  }

  /** Undo is a rescue, not a discount — the move counter deliberately does not go back down. */
  function undo() {
    const previous = history.current.pop();
    if (!previous) return;
    setBlocks(previous);
    setSolved(false);
  }

  // Pointer, not mouse: the same handler then works for a finger on a phone browser.
  function onPointerDown(e: React.PointerEvent, i: number) {
    drag.current = { i, x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function onPointerUp(e: React.PointerEvent) {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    // Smaller than this is a click, and a click on a block should do nothing rather than have
    // the game guess a direction.
    if (Math.abs(dx) < 14 && Math.abs(dy) < 14) return;
    if (Math.abs(dx) > Math.abs(dy)) move(d.i, dx > 0 ? 1 : -1, 0);
    else move(d.i, 0, dy > 0 ? 1 : -1);
  }

  const cell = 46;
  const gutter = 22;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="card pad" style={{ position: "relative", maxWidth: 560, width: "100%" }} onClick={(e) => e.stopPropagation()}>
        <Confetti burst={burst} />
        <div style={{ marginBottom: 10 }}>
          <SceneBanner scene={SCENES.road} height={58}>
            {solved && (
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(0,0,0,.3)" }}>
                <span className="gs-anim" style={{ fontSize: 17, fontWeight: 900, color: "#fff", textShadow: "0 2px 4px #000", background: "rgba(0,0,0,.55)", borderRadius: 999, padding: "3px 14px", animation: "gs-pop .6s ease-in-out 3" }}>🎉 Board cleared!</span>
              </div>
            )}
          </SceneBanner>
        </div>
        <div className="row" style={{ alignItems: "center", marginBottom: 6 }}>
          <h2 className="page-title" style={{ flex: 1, margin: 0, fontSize: 20 }}>
            {level ? `${level.level_no}. ${level.name}` : error ? "Couldn't load" : "Loading…"}
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <MuteButton />
            <span style={{ background: "var(--gold)", color: "#000", fontWeight: 800, fontSize: 11, padding: "2px 9px", borderRadius: 999 }}>{t("moves")}</span>
            <b style={{ color: "var(--gold)", fontSize: 20 }}>{moves}</b>
          </div>
        </div>

        <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>{error || hint}</div>

        {level && (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div style={{ position: "relative", width: level.cols * cell + gutter * 2, height: level.rows * cell + gutter * 2 }}>
              {/* Gates sit OUTSIDE the grid so one is never mistaken for a cell to move into. */}
              {level.gates.map((g, k) => {
                const thick = gutter * 0.6;
                const span = (g.hi - g.lo + 1) * cell;
                const base: React.CSSProperties = { position: "absolute", background: blockColour(g.c), borderRadius: 4 };
                if (g.edge === "left") Object.assign(base, { left: gutter - thick, top: gutter + g.lo * cell, width: thick, height: span });
                else if (g.edge === "right") Object.assign(base, { left: gutter + level.cols * cell, top: gutter + g.lo * cell, width: thick, height: span });
                else if (g.edge === "top") Object.assign(base, { left: gutter + g.lo * cell, top: gutter - thick, width: span, height: thick });
                else Object.assign(base, { left: gutter + g.lo * cell, top: gutter + level.rows * cell, width: span, height: thick });
                return <div key={k} style={base} />;
              })}

              <div style={{
                position: "absolute", left: gutter, top: gutter,
                width: level.cols * cell, height: level.rows * cell,
                background: "#12121C", border: "2px solid var(--gold-border)", borderRadius: 8,
              }} />

              {blocks.map((b, i) => b.gone ? null : (
                <div
                  key={i}
                  onPointerDown={(e) => onPointerDown(e, i)}
                  onPointerUp={onPointerUp}
                  style={{
                    position: "absolute",
                    left: gutter + b.x * cell + 3,
                    top: gutter + b.y * cell + 3,
                    width: b.w * cell - 6,
                    height: b.h * cell - 6,
                    background: blockColour(b.c),
                    border: "2px solid rgba(255,255,255,0.45)",
                    borderRadius: 8,
                    cursor: "grab",
                    touchAction: "none",
                    transition: "left 160ms ease-out, top 160ms ease-out",
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <div className="row" style={{ justifyContent: "center", gap: 10, marginTop: 14 }}>
          {history.current.length > 0 && !solved && (
            // Undo earns its place: a block that cannot leave still moves, so a careless drag can
            // wall a board in permanently. Without it the only way out is a restart, which reads
            // as the game being broken rather than the player having made a mistake.
            <button className="btn small" onClick={undo}>{t("undo")}</button>
          )}
          {!solved
            ? <button className="btn small" onClick={() => show(index)}>{t("start_again")}</button>
            : <button className="btn small primary" onClick={() => show(index + 1)}>{t("next_board")}</button>}
          <button className="btn small ghost" onClick={onClose}>{t("close")}</button>
        </div>
      </div>
    </div>
  );
}
