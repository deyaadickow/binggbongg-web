import { useState } from "react";

/**
 * The app's notification banner — black card, gold border, dead centre of the page, with an OK
 * button, and it stays until that button is pressed.
 *
 * Steve, 2026-10-17: "The notification banner has to change into our BB Design and stay till
 * they press (Ok) and it always shows on the bottom of the page, please bring it to the middle
 * of the page so it will be more visible."
 *
 * It used to be a `.notice` strip pinned to the bottom of the window that cleared itself after
 * four seconds — a message could be gone before it was read, and on a phone it sat under the
 * thumb. Android and iOS were changed the same way at the same time, so the three cannot drift.
 *
 * This replaces two identical copies of the hook that had been pasted into WalletPages and
 * SettingsPages; both import it now, and anything else that needs a message imports it too
 * rather than writing a third.
 */
export function useToast() {
  const [toast, setToast] = useState<string | null>(null);

  const el = toast ? (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        background: "rgba(0,0,0,.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
      // No dismiss on the backdrop: "stay till they press (Ok)" means a stray tap must not
      // throw away a message nobody has read.
    >
      <div
        className="card pad"
        style={{
          maxWidth: 420, width: "100%", textAlign: "center",
          background: "#000", borderColor: "var(--gold-border)",
        }}
      >
        <p style={{ margin: "4px 0 18px", color: "#fff", fontSize: 16 }}>{toast}</p>
        <button
          className="btn"
          onClick={() => setToast(null)}
          style={{ background: "var(--gold-border)", color: "#000", borderColor: "var(--gold-border)", minWidth: 140 }}
          autoFocus
        >
          OK
        </button>
      </div>
    </div>
  ) : null;

  return { toast, setToast, el };
}
