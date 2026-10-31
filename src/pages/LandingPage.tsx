// The ads' landing page, /ph (Steve, 2026-10-31: 1,503 Facebook ad clicks landed on the generic
// For You feed and not one became a member — "Do 1 and 2 and 3"). One job: tell someone who just
// tapped the Singing Contest ad what it is, and get the app onto their phone.
//
// Shown on its own, without the site's menu and sidebar. The big button is the store for THIS
// phone (Android -> Google Play, iPhone -> App Store; a computer gets both). Store taps go through
// admin.binggbongg.com/go/... so the admin dashboard counts them (AdLinkController); the view
// itself is counted here, once per visit.
//
// The words stay with what Meta already approved in the ads — free to enter, members vote, all
// November — and say nothing about money: Meta reviews the page an ad links to as well, and it has
// already rejected one of these ads as a "social casino".
import { useEffect, useMemo } from "react";
import { post } from "../lib/api";
import { useT } from "../lib/i18n";
import { pixelEvent } from "../lib/pixel";

const GO = "https://admin.binggbongg.com/go/";

function adSource(): string {
  try {
    const q = new URLSearchParams(window.location.search);
    const src = (q.get("src") || q.get("utm_campaign") || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 60);
    if (src) return src;
    return q.get("fbclid") ? "facebook" : "direct";
  } catch { return "direct"; }
}

function deviceOf(): "android" | "ios" | "other" {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

export function LandingPage() {
  const { t } = useT();
  const src = useMemo(adSource, []);
  const device = useMemo(deviceOf, []);
  const playUrl = `${GO}play?from=landing&src=${encodeURIComponent(src)}`;
  const iosUrl = `${GO}appstore?from=landing&src=${encodeURIComponent(src)}`;

  useEffect(() => {
    document.title = "Philippine Singing Contest – Bingg Bongg";
    // One view per visit, however often the page re-renders or is refreshed in this tab.
    const key = `bb.landing.${src}`;
    let seen = false;
    try { seen = sessionStorage.getItem(key) === "1"; sessionStorage.setItem(key, "1"); } catch { /* private mode */ }
    if (!seen) post("recordAdLinkEvent", { event: "landing", src }).catch(() => undefined);
    pixelEvent("ViewContent", { content_name: "Philippine Singing Contest" });
  }, [src]);

  const lead = (store: string) => pixelEvent("Lead", { content_name: store });

  const primary = device === "ios"
    ? { href: iosUrl, label: t("lp_cta_ios"), icon: "", store: "App Store" }
    : { href: playUrl, label: t("lp_cta_play"), icon: "▶", store: "Google Play" };
  const secondary = device === "ios"
    ? { href: playUrl, label: "Google Play", store: "Google Play" }
    : { href: iosUrl, label: "App Store", store: "App Store" };

  return (
    <div className="lp">
      <div className="lp-inner">
        <img className="lp-logo" src="/logo_horizontal.png" alt="Bingg Bongg" />
        <div className="lp-badge">{t("lp_badge")}</div>
        <h1 className="lp-title">🎤 {t("lp_title")}</h1>
        <p className="lp-sub">{t("lp_sub")}</p>

        <a className="lp-cta" href={primary.href} onClick={() => lead(primary.store)}>
          <span className="lp-cta-icon" aria-hidden>{primary.icon}</span>{primary.label}
        </a>
        {device === "other" ? (
          <a className="lp-cta lp-cta-2" href={iosUrl} onClick={() => lead("App Store")}>
            <span className="lp-cta-icon" aria-hidden></span>{t("lp_cta_ios")}
          </a>
        ) : (
          <a className="lp-also" href={secondary.href} onClick={() => lead(secondary.store)}>
            {t("lp_also")} {secondary.label}
          </a>
        )}

        <ol className="lp-steps">
          <li><b>1</b><span>{t("lp_step1")}</span></li>
          <li><b>2</b><span>{t("lp_step2")}</span></li>
          <li><b>3</b><span>{t("lp_step3")}</span></li>
        </ol>

        <p className="lp-more">{t("lp_more")}</p>
        <a className="lp-site" href="/">{t("lp_site")} ›</a>
      </div>
    </div>
  );
}
