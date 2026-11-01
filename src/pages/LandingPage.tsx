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
import { useEffect, useMemo, useRef, useState } from "react";
import { post } from "../lib/api";
import { useT, type StringKey } from "../lib/i18n";
import { pixelEvent } from "../lib/pixel";
import { HomePage } from "./HomePage";

const GO = "https://admin.binggbongg.com/go/";
/** The 2-3 minute feature tour (Steve, 2026-10-31), on S3 like the other feature videos. */
const TOUR_VIDEO = "https://binggbongg.s3.amazonaws.com/uploads/landing/feature-tour-v1.mp4";
const TOUR_POSTER = "https://binggbongg.s3.amazonaws.com/uploads/landing/feature-tour-v1.jpg";

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

  // The store button for this phone (a computer gets both), shown at the top and again at the end.
  const ctas = (
    <>
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
    </>
  );

  // Steve, 2026-10-31: "make a nice flyer with the contest, live stream, battle, make money. add a
  // few interesting features ... this will be the first page they will see, then they can keep
  // scrolling". Photos are stills from the licensed stock footage the ads themselves use.
  const pillars: { img: string; title: StringKey; text: StringKey; icon: string }[] = [
    { img: "/lp/live.jpg", title: "lp_p_live_t", text: "lp_p_live_d", icon: "🔴" },
    { img: "/lp/battle.jpg", title: "lp_p_battle_t", text: "lp_p_battle_d", icon: "⚔️" },
    { img: "/lp/earn.jpg", title: "lp_p_earn_t", text: "lp_p_earn_d", icon: "💰" },
    { img: "/lp/friends.jpg", title: "lp_p_world_t", text: "lp_p_world_d", icon: "🌍" },
  ];
  const more: { icon: string; text: StringKey }[] = [
    { icon: "🎮", text: "lp_f_games" }, { icon: "🟩", text: "lp_f_green" },
    { icon: "🎭", text: "lp_f_filters" }, { icon: "🎨", text: "lp_f_cartoon" },
    { icon: "🗣️", text: "lp_f_translate" }, { icon: "🎁", text: "lp_f_gifts" },
    { icon: "🎂", text: "lp_f_birthday" }, { icon: "👑", text: "lp_f_vip" },
  ];

  return (
    <div className="lp">
      <div className="lp-inner">
        {/* The tour opens the page; it carries its own big logo, so the page's is only shown without it. */}
        {TOUR_VIDEO ? <TourVideo label={t("lp_tap_sound")} /> : <img className="lp-logo" src="/logo_horizontal.png" alt="Bingg Bongg" />}
        <h1 className="lp-title">{t("lp_hero_title")}</h1>
        <p className="lp-sub">{t("lp_hero_sub")}</p>
        {ctas}

        {/* The contest the ads are about. */}
        <section className="lp-contest">
          <img src="/lp/contest.jpg" alt="" loading="eager" />
          <div className="lp-contest-text">
            <div className="lp-badge">{t("lp_contest_tag")}</div>
            <h2>🎤 {t("lp_title")}</h2>
            <p>{t("lp_contest_text")}</p>
          </div>
        </section>
        <ol className="lp-steps">
          <li><b>1</b><span>{t("lp_step1")}</span></li>
          <li><b>2</b><span>{t("lp_step2")}</span></li>
          <li><b>3</b><span>{t("lp_step3")}</span></li>
        </ol>

        <div className="lp-pillars">
          {pillars.map((p) => (
            <section key={p.title} className="lp-pillar">
              <img src={p.img} alt="" loading="lazy" />
              <div className="lp-pillar-text">
                <h3>{p.icon} {t(p.title)}</h3>
                <p>{t(p.text)}</p>
              </div>
            </section>
          ))}
        </div>

        <section className="lp-more-box">
          <h2>{t("lp_more_title")}</h2>
          <ul>
            {more.map((f) => <li key={f.text}><span aria-hidden>{f.icon}</span>{t(f.text)}</li>)}
          </ul>
        </section>

        <section className="lp-final">
          <img src="/lp/fans.jpg" alt="" loading="lazy" />
          <div className="lp-final-text">
            <h2>{t("lp_final_title")}</h2>
            <p>{t("lp_final_sub")}</p>
          </div>
        </section>
        {ctas}

        <div className="lp-keep">⌄ {t("lp_keep_scrolling")} ⌄</div>
      </div>
      {/* Then the real For You feed, so they can keep scrolling through members' videos. */}
      <div className="lp-feed"><HomePage /></div>
    </div>
  );
}

/**
 * The feature tour, playing the moment the page opens (Steve: "Let the video play right away").
 * Browsers only let a video start by itself with the sound OFF, so it starts muted with a big
 * "Tap for sound" button that restarts it from the top with the voice. The captions are burned in,
 * so it reads even before anyone taps.
 */
function TourVideo({ label }: { label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  useEffect(() => { ref.current?.play().catch(() => undefined); }, []);
  const unmute = () => {
    const v = ref.current;
    if (!v) return;
    v.muted = false;
    v.currentTime = 0;
    v.play().catch(() => undefined);
    setMuted(false);
  };
  return (
    <div className="lp-video">
      <video ref={ref} src={TOUR_VIDEO} poster={TOUR_POSTER || undefined} autoPlay muted={muted} playsInline loop
        controls={!muted} preload="auto" />
      {muted && (
        <button type="button" className="lp-sound" onClick={unmute}>🔊 {label}</button>
      )}
    </div>
  );
}
