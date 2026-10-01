import { useState } from "react";

/**
 * The web's version of the apps' picker sheets (GoldPickerSheet on iOS, MultiSelectListSheet on
 * Android) — Steve, 2026-09-30: "add all the counties together including the main markets just
 * like you did for the iphone and android", then "I see they are all together but open".
 *
 * "Open" was the cards being sliced in half by a short scroll window sitting inside the form.
 * A full-height overlay is what the apps show and what fixes it: the list gets real room, so
 * rows end where they end instead of being cut through the middle.
 *
 * `pinned` rows are listed first under `pinnedLabel`; both groups are filtered by the same query,
 * so a search can never hide a main market, and the captions drop away while filtering because a
 * filtered list has no sections.
 */
export function PickerSheet({ title, noun, items, pinned = [], pinnedLabel, restLabel, selected, onPick, onClose, stayOpen }: {
  title: string;
  noun: string;
  items: { code: string; name: string }[];
  pinned?: { code: string; name: string }[];
  pinnedLabel?: string;
  restLabel?: string;
  selected?: string;
  onPick: (code: string) => void;
  onClose: () => void;
  /** Cities add several targets in a row, so that sheet stays open after each tap. */
  stayOpen?: boolean;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const match = (c: { code: string; name: string }) => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q;
  const shownPinned = pinned.filter(match);
  const shownRest = items.filter(match);
  const total = pinned.length + items.length;
  const filtering = q.length > 0;

  const row = (c: { code: string; name: string }) => (
    <button
      key={c.code}
      onClick={() => { onPick(c.code); if (!stayOpen) onClose(); }}
      style={{
        display: "block", width: "100%", textAlign: "left", cursor: "pointer",
        padding: "13px 14px", marginBottom: 8, borderRadius: 10,
        background: "#101010", color: "var(--gold)",
        border: `1.5px solid ${c.code === selected ? "var(--gold-bright)" : "var(--gold-border)"}`,
        fontWeight: c.code === selected ? 800 : 500, fontSize: 15,
      }}
    >{c.name}</button>
  );

  const caption = (text: string) => (
    <div className="muted" style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", margin: "4px 0 6px" }}>{text}</div>
  );

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      {/* Stop clicks inside the card from reaching the backdrop's close handler. */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "flex", flexDirection: "column", width: "100%", maxWidth: 520, maxHeight: "86vh",
          background: "#000", border: "1.5px solid var(--gold-border)", borderRadius: 16, padding: 16,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 18, color: "var(--gold)", textAlign: "center", marginBottom: 12 }}>{title}</div>
        <input
          className="input"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${total} ${noun}…`}
          style={{ marginBottom: 12, flex: "0 0 auto" }}
        />
        <div style={{ overflowY: "auto", paddingRight: 4, flex: 1 }}>
          {shownPinned.length > 0 && !filtering && pinnedLabel && caption(pinnedLabel)}
          {shownPinned.map(row)}
          {shownRest.length > 0 && !filtering && restLabel && shownPinned.length > 0 && caption(restLabel)}
          {shownRest.map(row)}
          {shownPinned.length + shownRest.length === 0 && (
            <p className="muted" style={{ fontSize: 13, textAlign: "center", padding: "24px 0" }}>Nothing matches “{query}”.</p>
          )}
        </div>
        <button className="btn ghost" onClick={onClose} style={{ marginTop: 12, flex: "0 0 auto" }}>
          {stayOpen ? "Done" : "Close"}
        </button>
      </div>
    </div>
  );
}
