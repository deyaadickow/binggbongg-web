import type { MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useT } from "../lib/i18n";

/**
 * Steve, 2026-11-20: "I wanna clean the screen ... Please remove them and add a Bullseye right next
 * to the member's name, when they click the bullseye, It will link them to another page with these
 * 4 items inside that page each with explanation for each item."
 *
 * The small gold bullseye beside a member's name. It replaces the Battle Badge circle, the streak
 * pill and the VIP badge that used to crowd the name; tapping it opens /badges/<id>.
 * A button, not a <Link>: it often sits inside a card that is itself a link to the profile.
 */
export function MemberBullseye({ userId, size = 22 }: { userId?: number | null; size?: number }) {
  const navigate = useNavigate();
  const { t } = useT();
  if (!userId) return null;
  const open = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(`/badges/${userId}`);
  };
  return (
    <button type="button" onClick={open} title={t("mb_open")} aria-label={t("mb_open")}
      style={{ width: size, height: size, padding: 0, border: "none", background: "transparent",
               cursor: "pointer", lineHeight: 0, flex: "0 0 auto" }}>
      <BullseyeSvg size={size} />
    </button>
  );
}

export function BullseyeSvg({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <circle cx="12" cy="12" r="10" fill="rgba(0,0,0,.75)" stroke="#F0C420" strokeWidth="2" />
      <circle cx="12" cy="12" r="6" fill="none" stroke="#F0C420" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="2.6" fill="#F0C420" />
    </svg>
  );
}
