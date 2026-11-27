// Partnership Program pieces used outside its page (2026-11-27): the gold "Bingg Bongg Partner" badge on
// profiles, and the one-time card after sign-up. Both appear only while the program switch is on: the badge
// because the server sends is_bb_partner true only then, the card because it asks fetchMyPartnership.
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "../lib/session";
import { useT } from "../lib/i18n";
import { partnerCardDue, partnerCardSeen, partnerNumber, useMyPartnership } from "../lib/partnership";

const GOLD = "#F0C420";

/** The gold pill beside a partner's name. Opens the program page (what it is, and how to join). */
export function PartnerBadge({ size = 26 }: { size?: number }) {
  const { t } = useT();
  return (
    <Link
      to="/partnership"
      title={t("pt_become_title")}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, height: size, padding: "0 12px", borderRadius: size,
        border: `2px solid ${GOLD}`, background: "linear-gradient(180deg, #FFE27A 0%, #F0C420 55%, #C9971A 100%)",
        color: "#2a1a00", fontWeight: 800, fontSize: Math.round(size * 0.48), lineHeight: 1, whiteSpace: "nowrap",
        textDecoration: "none", flex: "0 0 auto", boxShadow: "0 0 10px rgba(240,196,32,.35)",
      }}
    >
      <span aria-hidden>🤝</span>{t("pt_badge")}
    </Link>
  );
}

/** Once per member, shortly after a brand-new sign-up, while the program is on and they can apply. */
export function PartnerSignupCard() {
  const { t, lang } = useT();
  const { user, isLoggedIn } = useSession();
  const uid = user?.id ?? 0;
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // Re-read when the member changes: the sign-up itself happens inside this same page load.
  const due = useMemo(() => (uid ? partnerCardDue(uid) : false), [uid]);
  const [open, setOpen] = useState(false);
  const [shownFor, setShownFor] = useState(0);
  const d = useMyPartnership(due ? uid : 0);
  const eligible = !!d && d.program_enabled && d.can_apply && d.status === "none";
  const blockedHere = pathname === "/login" || pathname.startsWith("/partnership") || pathname === "/become-a-partner";

  useEffect(() => {
    if (!isLoggedIn || !uid || !due || !eligible || blockedHere || shownFor === uid) return;
    // Seen the moment it shows: "one-time" means one, even if they leave the page without answering.
    partnerCardSeen(uid);
    setShownFor(uid);
    setOpen(true);
  }, [isLoggedIn, uid, due, eligible, blockedHere, shownFor]);

  if (!open || !d || blockedHere) return null;
  const close = () => setOpen(false);
  return (
    <div className="modal-backdrop" onClick={close} style={{ zIndex: 9000 }}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        dir={lang === "ar" ? "rtl" : undefined}
        style={{ maxWidth: 420, width: "100%", background: "#000", border: `2px solid ${GOLD}`, borderRadius: 18, padding: 22, color: GOLD, textAlign: "center", boxShadow: "0 0 24px rgba(240,196,32,.25)" }}
      >
        <div style={{ fontSize: 34, lineHeight: 1 }} aria-hidden>🤝</div>
        <div style={{ fontWeight: 800, fontSize: 19, margin: "10px 0", textWrap: "balance" }}>{t("pt_become_title")}</div>
        <p style={{ fontSize: 14, lineHeight: 1.5, margin: 0, textWrap: "balance" }}>{t("pt_become_body", d.payout_percent, d.default_days)}</p>
        <p style={{ fontSize: 13, lineHeight: 1.5, margin: "10px 0 0", opacity: 0.85, textWrap: "balance" }}>{t("pt_become_requirement", partnerNumber(d.min_followers, lang))}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
          <button className="btn gold" onClick={() => { close(); navigate("/partnership"); }}>{t("pt_card_btn")}</button>
          <button className="btn" style={{ background: "#000", borderColor: GOLD, color: GOLD }} onClick={close}>{t("pt_card_later")}</button>
        </div>
      </div>
    </div>
  );
}
