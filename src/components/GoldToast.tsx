import { useState } from "react";
import { createRoot } from "react-dom/client";
import { tt, useT } from "../lib/i18n";

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
  const { t } = useT();
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
          {t("ok")}
        </button>
      </div>
    </div>
  ) : null;

  return { toast, setToast, el };
}

/**
 * The same card, callable from anywhere — no hook, no `el` to render.
 *
 * Steve, 2026-10-17: "do it everywhere". The five remaining `window.alert(...)` calls on the
 * web were the browser's own grey box, which is the one notification on this site that looked
 * nothing like Bingg Bongg. They cannot use the hook, because they fire from inside event
 * handlers that have no component to hang state on — so this mounts the card itself and tears
 * it down when OK is pressed.
 */
export function showGoldAlert(message: string) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  const close = () => {
    root.unmount();
    host.remove();
  };

  root.render(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 70,
        background: "rgba(0,0,0,.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        className="card pad"
        style={{ maxWidth: 420, width: "100%", textAlign: "center", background: "#000", borderColor: "var(--gold-border)" }}
      >
        <p style={{ margin: "4px 0 18px", color: "#fff", fontSize: 16 }}>{message}</p>
        <button
          className="btn"
          onClick={close}
          style={{ background: "var(--gold-border)", color: "#000", borderColor: "var(--gold-border)", minWidth: 140 }}
          autoFocus
        >
          {tt("ok")}
        </button>
      </div>
    </div>,
  );
}
