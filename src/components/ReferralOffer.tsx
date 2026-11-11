// The $100 referral offer video, shown ONCE per member (Steve, 2026-11-11: when a member signs up
// we show them a video about the $100 offer). It lives on For You only, so it never opens on top
// of a live room or a battle: a new member lands there right after signing up, and everyone else
// sees it on their next visit. Signed-out visitors never see it.
//
// "Once" is two flags: the server's referral_offer_seen_at (offer_seen in fetchReferralAds, set by
// markReferralOfferSeen) and a local one, so it never repeats even when the mark never arrived.
//
// /?demo=1 shows it with the sample video, signed in or not, and marks nothing.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useT } from "../lib/i18n";
import { useSession } from "../lib/session";
import {
  demoReferralAds, fetchReferralAds, markReferralOfferSeen, offerSeenLocally, rememberOfferSeen, type ReferralAds,
} from "../lib/referralAds";

export function ReferralOfferPopup() {
  const { t, lang } = useT();
  const { user, isLoggedIn } = useSession();
  const nav = useNavigate();
  const demo = new URLSearchParams(useLocation().search).get("demo") === "1";
  const [data, setData] = useState<ReferralAds | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const userId = user?.id ?? null;

  useEffect(() => {
    let live = true;
    setData(null);
    if (demo) {
      demoReferralAds("on", lang).then((d) => { if (live) setData(d); }).catch(() => undefined);
      return () => { live = false; };
    }
    if (!isLoggedIn || !userId || offerSeenLocally(userId)) return;
    fetchReferralAds(lang)
      .then((d) => {
        if (!live) return;
        // Seen on another device or a phone: remember it here too, and show nothing.
        if (d.offer_seen) { rememberOfferSeen(userId); return; }
        if (d.offer_video) setData(d);
      })
      .catch(() => undefined); // not deployed / offline: try again next visit
    return () => { live = false; };
    // The language only picks the first fetch's video; a language change must not re-open it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, isLoggedIn, userId]);

  // Try to start it with sound; a browser that refuses waits on the poster for a tap.
  useEffect(() => { if (data) video.current?.play().catch(() => undefined); }, [data]);

  useEffect(() => {
    if (!data) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", key);
    const body = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", key); document.body.style.overflow = body; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (!data?.offer_video) return null;
  const v = data.offer_video;

  function done() {
    video.current?.pause();
    if (!demo && userId) markReferralOfferSeen(userId);
    setData(null);
  }
  function close() { done(); }
  function open() { done(); nav(`/ads-for-referrals${demo ? "?demo=1" : ""}`); }

  return createPortal(
    <div className="afr-offer" role="dialog" aria-modal="true" aria-label={t("afr_headline", data.cap)}>
      <button className="afr-offer-x" onClick={close} aria-label={t("close")}>✕</button>
      <div className="afr-offer-inner">
        <div className="afr-offer-kicker">{t("afr_offer_kicker")}</div>
        <h2 className="afr-offer-title">{t("afr_headline", data.cap)}</h2>
        <video ref={video} className="afr-offer-video" src={v.video_url} poster={v.poster_url ?? undefined}
          controls playsInline preload="metadata" />
        <button className="btn gold afr-offer-btn" onClick={open}>📣 {t("afr_open_page")}</button>
      </div>
    </div>,
    document.body,
  );
}

