// The Pre-Launch Special banner (Steve, 2026-11-10) — top of the For You feed and the Wallet.
// Gold-bordered black box; shown ONLY while fetchPrelaunch says a window is active (nothing at all
// while it loads, when it fails, or once launch day has come). Tap opens /pre-launch.
// 2026-11-11: FBBs no longer end on Nov 29, so the banner runs until launch day (launch_at), not ends_at.
import { Link } from "react-router-dom";
import { useT } from "../lib/i18n";
import { prelaunchTexts, usePrelaunch } from "../lib/prelaunch";

export function PrelaunchBanner() {
  const { t, lang } = useT();
  const p = usePrelaunch();
  if (!p || !p.active || Date.now() >= p.launchAt) return null;
  const x = prelaunchTexts(p, lang);
  return (
    <Link to="/pre-launch" className="prelaunch-banner">
      <span className="pl-ico" aria-hidden>🎉</span>
      <span className="pl-text">
        <b>{t("pl_title")}</b>
        {t("pl_banner", x.amount, x.launchDay)}
        <span className="pl-more">{t("pl_tap_for_more")}</span>
      </span>
      <span className="pl-chev" aria-hidden>›</span>
    </Link>
  );
}
