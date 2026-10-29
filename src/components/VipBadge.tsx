import { useNavigate } from "react-router-dom";
import { useT } from "../lib/i18n";

/**
 * Steve, 2026-10-29: "include the badge ... everyone has to know what that badge is for" / "If
 * they click on the badge, a popup will appear and tell them about the badge." The gold pill a
 * VIP Referral Member wears beside their name; a real button, so it is one tap and one popup.
 */
export function VipBadge({ size = 26, onClick }: { size?: number; onClick?: () => void }) {
  const { t } = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={onClick ? t("what_is_this") : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        height: size,
        padding: "0 10px",
        borderRadius: size,
        border: "2px solid var(--gold)",
        background: "var(--gold)",
        color: "#412402",
        fontWeight: 800,
        fontSize: size * 0.46,
        lineHeight: 1,
        whiteSpace: "nowrap",
        cursor: onClick ? "pointer" : "default",
        flex: "0 0 auto",
        opacity: 1,
      }}
    >
      {t("vip_badge_label")}
    </button>
  );
}

/** What the pill means, in the app's black and gold popup. `viewerIsVip` swaps "Apply now" for "Got it". */
export function VipBadgePopup({ viewerIsVip, onClose }: { viewerIsVip: boolean; onClose: () => void }) {
  const { t } = useT();
  const navigate = useNavigate();
  const btn: React.CSSProperties = {
    width: "100%", padding: "12px 0", borderRadius: 999, fontWeight: 800, fontSize: 15, cursor: "pointer",
    border: "1.5px solid var(--gold)",
  };
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9000, padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 420, width: "100%", background: "#000", border: "2px solid var(--gold)", borderRadius: 18, padding: 22, color: "var(--gold)", textAlign: "center" }}
      >
        <div style={{ fontWeight: 800, fontSize: 19, marginBottom: 12, textWrap: "balance" }}>{t("vip_badge_label")}</div>
        <p style={{ fontSize: 14, lineHeight: 1.5, margin: 0, textWrap: "balance" }}>{t("vip_badge_body")}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
          {viewerIsVip ? (
            <button style={{ ...btn, background: "var(--gold)", color: "#000" }} onClick={onClose}>{t("got_it")}</button>
          ) : (
            <button style={{ ...btn, background: "var(--gold)", color: "#000" }} onClick={() => { onClose(); navigate("/vip-referral"); }}>{t("vip_apply_now")}</button>
          )}
          <button style={{ ...btn, background: "transparent", color: "var(--gold)" }} onClick={onClose}>{t("close")}</button>
        </div>
      </div>
    </div>
  );
}
