import { useEffect } from "react";
import { useT } from "../lib/i18n";

/**
 * "Different countries? No problem!" — the live room's 10-second hint that translation exists.
 *
 * Steve, 2026-11-08: "If there are 2 members from different countries, Please send a 10 seconds
 * popup to let them know that they can turn on the translation to understand each other. in their
 * language."
 *
 * Same black card / gold border / OK button as the site's notification popup (GoldToast), but it
 * closes itself after 10 seconds. When chat translation is off it also offers a button that turns
 * it on; when it is already on it says into which language.
 */
export function CountryTranslatePopup({ name, country, translatingInto, onTurnOn, onClose }: {
  name: string;
  country: string;
  /** The language name chat is translated into, or "" when translation is off. */
  translatingInto: string;
  onTurnOn: () => void;
  onClose: () => void;
}) {
  const { t } = useT();

  useEffect(() => {
    const timer = window.setTimeout(onClose, 10000);
    return () => window.clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        background: "rgba(0,0,0,.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        className="card pad"
        role="dialog"
        aria-live="polite"
        style={{ maxWidth: 420, width: "100%", textAlign: "center", background: "#000", borderColor: "var(--gold-border)" }}
      >
        <div style={{ fontSize: 32, lineHeight: 1 }}>🌐</div>
        <h3 style={{ margin: "10px 0 8px", color: "var(--gold-bright, var(--gold-border))" }}>{t("xc_title")}</h3>
        <p style={{ margin: "0 0 12px", color: "#fff", fontSize: 16 }}>{t("xc_body", name, country)}</p>
        {translatingInto && (
          <p style={{ margin: "0 0 12px", color: "#ccc", fontSize: 14 }}>{t("xc_already_on", translatingInto)}</p>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 6 }}>
          {!translatingInto && (
            <button
              className="btn"
              onClick={() => { onTurnOn(); onClose(); }}
              style={{ background: "var(--gold-border)", color: "#000", borderColor: "var(--gold-border)", minWidth: 140 }}
              autoFocus
            >
              🌐 {t("xc_turn_on")}
            </button>
          )}
          <button
            className={`btn${translatingInto ? "" : " ghost"}`}
            onClick={onClose}
            style={translatingInto
              ? { background: "var(--gold-border)", color: "#000", borderColor: "var(--gold-border)", minWidth: 140 }
              : { borderColor: "var(--gold-border)", minWidth: 100 }}
            autoFocus={!!translatingInto}
          >
            {t("ok")}
          </button>
        </div>
      </div>
    </div>
  );
}
