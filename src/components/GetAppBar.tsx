import { useLocation } from "react-router-dom";
import { useSession } from "../lib/session";
import { useT } from "../lib/i18n";
import { phoneOs, storeUrl } from "../lib/getApp";

/** A gold "Install" bar along the bottom of the screen for a signed-out visitor on a phone
 *  (Steve, 2026-11-01: installs, not website visits). The sign-in page has its own. */
export function GetAppBar() {
  const { t } = useT();
  const { isLoggedIn } = useSession();
  const { pathname } = useLocation();
  const os = phoneOs();
  // The invite page has its own store button, with the inviter's code in the link.
  if (isLoggedIn || !os || pathname === "/login" || pathname.startsWith("/invite/")) return null;
  return (
    <>
      <div className="get-app-spacer" aria-hidden="true" />
      <a className="get-app-bar" href={storeUrl("bar", os)}>
        <img src="/logo_round.png" alt="" width={40} height={40} />
        <span className="get-app-text">
          <b>{t("ga_bar_title")}</b>
          <small>{os === "ios" ? t("ga_on_app_store") : t("ga_on_google_play")}</small>
        </span>
        <span className="get-app-btn">{t("ga_install")}</span>
      </a>
    </>
  );
}
