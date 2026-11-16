// The automatic-caption pieces of the video player (Steve, 2026-11-16): the line being spoken,
// the viewer's CC switch, and the creator's "Edit captions" list. See lib/autoCaptions.ts.
import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";
import { createPortal } from "react-dom";
import { captionAt, readCcOn, subscribeCc, writeCcOn, type CaptionLine } from "../lib/autoCaptions";
import { useT } from "../lib/i18n";

export function useCcOn(): boolean {
  return useSyncExternalStore(subscribeCc, readCcOn, () => true);
}

/** The line whose s <= currentTime < e, centred in the lower third above the player's own
 *  controls, clear of the buttons down the right edge. Polled 10x a second. */
export function AutoCaptionOverlay({ lines, videoRef, bottom = 64 }: { lines: CaptionLine[]; videoRef: RefObject<HTMLVideoElement | null>; bottom?: number }) {
  const on = useCcOn();
  const [text, setText] = useState("");
  useEffect(() => {
    if (!on || !lines.length) { setText(""); return; }
    const id = window.setInterval(() => {
      const v = videoRef.current;
      setText(v ? captionAt(lines, v.currentTime) : "");
    }, 100);
    return () => window.clearInterval(id);
  }, [on, lines, videoRef]);
  if (!on || !text) return null;
  return (
    <div aria-live="off" style={{ position: "absolute", left: 0, right: 0, bottom, display: "flex", justifyContent: "center", pointerEvents: "none", zIndex: 2, padding: "0 70px" }}>
      <span style={{
        background: "rgba(0,0,0,.62)", color: "#fff", fontWeight: 800, fontSize: "clamp(15px, 2.4vw, 20px)", lineHeight: 1.3,
        padding: "6px 12px", borderRadius: 10, textAlign: "center", maxWidth: "100%",
        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        textShadow: "0 1px 2px #000",
      }}>{text}</span>
    </div>
  );
}

/** "CC" — gold when on. One choice for every video, remembered on this device. */
export function CcButton({ style }: { style?: React.CSSProperties }) {
  const on = useCcOn();
  const { t } = useT();
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); writeCcOn(!on); }}
      onPointerDown={(e) => e.stopPropagation()}
      title={on ? t("ac_cc_on") : t("ac_cc_off")}
      aria-pressed={on}
      style={{
        width: 40, height: 30, borderRadius: 8, fontWeight: 900, fontSize: 13, cursor: "pointer", letterSpacing: 0.5,
        border: "1.5px solid var(--gold-border)",
        background: on ? "var(--gold)" : "rgba(0,0,0,.7)", color: on ? "#000" : "var(--gold)",
        ...style,
      }}>
      CC
    </button>
  );
}

function stamp(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
}

/** The creator's list: each line's time and its words in a box; Save sends them all. */
export function EditCaptionsDialog({ lines, onSave, onClose }: { lines: CaptionLine[]; onSave: (lines: CaptionLine[]) => Promise<void>; onClose: () => void }) {
  const { t } = useT();
  const [rows, setRows] = useState(() => lines.map((l) => ({ ...l })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    const clean = rows.map((r) => ({ ...r, t: r.t.trim() })).filter((r) => r.t);
    setBusy(true);
    setError("");
    try { await onSave(clean); } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 65, background: "rgba(0,0,0,.8)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 520, maxHeight: "86vh", display: "flex", flexDirection: "column", background: "#000", border: "1.5px solid var(--gold-border)", borderRadius: 16, padding: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: "var(--gold)", textAlign: "center", marginBottom: 4 }}>{t("ac_edit_captions")}</div>
        <div className="muted" style={{ textAlign: "center", fontSize: 13, marginBottom: 12 }}>{t("ac_edit_hint")}</div>
        <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <span style={{ color: "var(--gold)", fontVariantNumeric: "tabular-nums", fontSize: 12, width: 54, flex: "0 0 54px" }}>{stamp(r.s)}</span>
              <input className="input" value={r.t} maxLength={200} aria-label={`${stamp(r.s)}`}
                onChange={(e) => setRows((cur) => cur.map((x, j) => (j === i ? { ...x, t: e.target.value } : x)))}
                style={{ flex: 1, minWidth: 0 }} />
            </div>
          ))}
        </div>
        {error && <p style={{ color: "#f55", fontSize: 13, margin: "8px 0 0" }}>{error}</p>}
        <div className="row" style={{ gap: 10, marginTop: 12 }}>
          <button className="btn ghost" style={{ flex: 1 }} onClick={onClose} disabled={busy}>{t("close")}</button>
          <button className="btn gold" style={{ flex: 1 }} onClick={save} disabled={busy}>{busy ? t("ac_saving") : t("save")}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
