// A paid video ad in the web feed (Steve, 2026-10-31, Ads Analytics item 4: "Paid ads shown in the
// website feed, so advertisers also get views from website visitors"). Until now only the phones
// placed them, so an advertiser got nothing from anyone using binggbongg.com.
//
// Same rules as the phones' PaidAdCardFragment / PaidAdCardView: the server chooses which ads this
// member sees (VideoAdController::fetchFeedVideoAds, by where they are), one goes after every 5
// videos, it is plainly labelled Sponsored, and showing it counts one view — when at least half of
// it is on screen, not when it merely exists further down the page. The server ignores a repeat
// from the same member within 20 seconds, so scrolling back and forth can't run a count up.
import { useEffect, useRef } from "react";
import { mediaUrl, post } from "../lib/api";
import { useT } from "../lib/i18n";

export interface FeedVideoAd {
  id: number;
  advertiser_name?: string | null;
  advertiser_image?: string | null;
  video_path: string;
  thumb_path?: string | null;
  click_url?: string | null;
}

export function PaidAdCard({ ad, userId }: { ad: FeedVideoAd; userId: number }) {
  const { t } = useT();
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const counted = useRef(false);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => {
      const v = video.current;
      if (entry.isIntersecting) {
        if (!counted.current) {
          counted.current = true;
          post("recordVideoAdImpression", { my_user_id: userId, video_ad_id: ad.id }).catch(() => undefined);
        }
        v?.play().catch(() => undefined);
      } else {
        v?.pause();
        // A later return to the card is a new showing; the server's 20-second guard decides.
        counted.current = false;
      }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [ad.id, userId]);

  const open = () => {
    if (!ad.click_url) return;
    // Counted before the new tab opens, as the apps do: once the browser switches away the
    // request may never go out.
    post("recordVideoAdClick", { my_user_id: userId, video_ad_id: ad.id }).catch(() => undefined);
    window.open(ad.click_url, "_blank", "noopener,noreferrer");
  };

  return (
    <div ref={box} className="card post-card" style={{ border: "1px solid var(--gold-border)" }}>
      <div className="thumb" role={ad.click_url ? "button" : undefined} tabIndex={ad.click_url ? 0 : undefined}
        onClick={open} onKeyDown={(e) => { if (e.key === "Enter") open(); }}
        style={{ display: "block", cursor: ad.click_url ? "pointer" : "default", position: "relative" }}>
        <video ref={video} src={mediaUrl(ad.video_path)} poster={ad.thumb_path ? mediaUrl(ad.thumb_path) : undefined}
          muted loop playsInline preload="none" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        <span style={{ position: "absolute", top: 8, left: 8, background: "#000", color: "var(--gold)", border: "1px solid var(--gold)",
          borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 800 }}>{t("pa_sponsored")}</span>
      </div>
      <div className="body">
        <div className="row" style={{ minWidth: 0, flex: 1, gap: 8 }}>
          {ad.advertiser_image ? (
            <img src={mediaUrl(ad.advertiser_image)} alt="" width={32} height={32} style={{ borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
          ) : null}
          <span style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {ad.advertiser_name || t("pa_sponsored")}
          </span>
        </div>
        {ad.click_url && (
          <button type="button" className="btn small" onClick={open} style={{ flexShrink: 0 }}>{t("pa_visit")}</button>
        )}
      </div>
    </div>
  );
}
