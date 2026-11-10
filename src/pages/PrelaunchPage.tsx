// /pre-launch — the Pre-Launch Special page (Steve, 2026-11-10). Black + gold only. Opened from the
// banner (feed + Wallet) and from its directory tile. Uses the server's window (fetchPrelaunch) when
// it answers and the owner-approved defaults when it does not, so the tile always opens something.
import { Link } from "react-router-dom";
import { PageTitle } from "../components/PageTitle";
import { Loading } from "../components/Common";
import { useT } from "../lib/i18n";
import { PRELAUNCH_DEFAULTS, prelaunchTexts, usePrelaunch } from "../lib/prelaunch";

export function PrelaunchPage() {
  const { t, lang } = useT();
  const fetched = usePrelaunch();
  if (fetched === undefined) return <div className="page prelaunch-page"><PageTitle>{t("pl_title")}</PageTitle><Loading /></div>;
  const p = fetched ?? PRELAUNCH_DEFAULTS;
  // Over: the server answered "not active" and the end date has passed.
  const ended = !!fetched && !fetched.active && Date.now() >= fetched.endsAt;
  const x = prelaunchTexts(p, lang);
  return (
    <div className="page prelaunch-page">
      <PageTitle>{t("pl_title")}</PageTitle>
      {ended && <div className="prelaunch-card"><span className="big">{t("pl_ended")}</span></div>}
      <div className="prelaunch-card">
        <span className="big">{t("pl_banner", x.amount, x.until, x.launchDay)}</span>
        <span>{t("pl_pbbs_explained")}</span>
      </div>
      <div className="prelaunch-card">
        <span>{t("pl_invite", x.cap)}</span>
        <Link to="/referral-program" className="btn">{t("pl_invite_button")}</Link>
      </div>
      <div className="prelaunch-card">
        <span>{t("pl_report")}</span>
        <Link to="/settings/support" className="btn">{t("pl_report_button")}</Link>
      </div>
    </div>
  );
}
