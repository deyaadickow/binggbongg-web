import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Steve, 2026-10-06: "Please make these into our black and gold design" — about the dropdowns on
 * the Redeem page, which opened as the operating system's own grey list with a red highlight.
 *
 * A native <select>'s open list is drawn by the OS, not the page: no amount of CSS can make it
 * black and gold. So the list is ours — a gold-bordered panel under the field, with the chosen
 * row filled gold the way every other pill in the app is.
 *
 * The panel is PORTALLED to <body> and positioned fixed, not absolutely inside the field. Every
 * one of these dropdowns lives inside a `.card`, and `.card` is `overflow: hidden` for its
 * rounded corners — an absolutely positioned panel was sliced off at the card's edge, which is
 * exactly what it looked like on the Redeem page before this.
 *
 * It stays a plain button-and-panel rather than the full-screen PickerSheet, because these lists
 * are short (four years, a couple of countries, a wallet list) and a whole overlay for four years
 * would be heavier than the thing it replaces. Long lists get `searchable`.
 */
export function GoldSelect({
  value,
  options,
  onChange,
  placeholder = "Select",
  searchable,
  disabled,
  style,
  ariaLabel,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  placeholder?: string;
  /** Shows a filter box once the list is long enough to need one. */
  searchable?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [box, setBox] = useState<{ left: number; top: number; width: number; drop: "down" | "up"; room: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const el = trigger.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    // Opens downward unless there genuinely isn't room, in which case it opens upward rather
    // than running off the bottom of the window.
    const drop = below < 180 && above > below ? "up" : "down";
    setBox({
      left: r.left,
      top: drop === "down" ? r.bottom + 6 : r.top - 6,
      width: r.width,
      drop,
      room: Math.max(140, Math.min(300, drop === "down" ? below : above)),
    });
  }, []);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (trigger.current?.contains(t) || panel.current?.contains(t)) return;
      setOpen(false);
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    // Fixed positioning doesn't follow the page, so the panel is re-placed as things move.
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  useEffect(() => { if (!open) setQuery(""); }, [open]);

  const current = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  const showSearch = searchable && options.length > 8;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="input"
        aria-label={ariaLabel}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 8, textAlign: "left", cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.5 : 1,
          color: current ? "var(--gold)" : "var(--text-soft)",
          ...style,
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {current?.label ?? placeholder}
        </span>
        <span style={{ color: "var(--gold)", flex: "0 0 auto" }}>{open ? "▴" : "▾"}</span>
      </button>

      {open && box && createPortal(
        <div
          ref={panel}
          className="picker-scroll"
          style={{
            position: "fixed", zIndex: 1000,
            left: box.left,
            width: Math.max(box.width, 180),
            ...(box.drop === "down" ? { top: box.top } : { bottom: window.innerHeight - box.top }),
            maxHeight: box.room,
            background: "#000", border: "1.5px solid var(--gold-border)", borderRadius: 12,
            padding: 6, overflowY: "auto",
            boxShadow: "0 10px 30px rgba(0,0,0,.75)",
          }}
        >
          {showSearch && (
            <input
              className="input"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${options.length}…`}
              style={{ marginBottom: 6 }}
            />
          )}
          {shown.map((o) => {
            const picked = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); }}
                style={{
                  display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                  padding: "10px 12px", marginBottom: 4, borderRadius: 9, fontSize: 14,
                  background: picked ? "var(--gold)" : "#101010",
                  color: picked ? "#0d0d0d" : "var(--gold)",
                  border: `1px solid ${picked ? "var(--gold)" : "var(--gold-border)"}`,
                  fontWeight: picked ? 800 : 500,
                }}
              >{o.label}</button>
            );
          })}
          {shown.length === 0 && (
            <p className="muted" style={{ fontSize: 13, textAlign: "center", padding: "16px 0", margin: 0 }}>
              Nothing matches “{query}”.
            </p>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
