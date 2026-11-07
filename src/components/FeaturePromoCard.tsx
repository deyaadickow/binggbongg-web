// A Bingg Bongg feature card in the For You feed (Steve, 2026-11-07) — one of our own features,
// with its feature video, after every 20th member video. Not "Sponsored": it is ours, so the pill
// says Bingg Bongg. TRY IT goes exactly where that feature's tile in the directory goes.
//
// Like the paid ad card it plays muted in the grid while at least half of it is on screen, and
// pauses when scrolled away; tapping the video opens the feature video player with sound.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { translate, useT } from "../lib/i18n";
import { useSession } from "../lib/session";
import { featureHref, type Feature } from "../pages/FeaturesPage";
import { IDEA_KEY, promoVideoKey } from "../lib/featurePromo";
import { featureVideoSources } from "../lib/featureVideos";
import { FeatureVideoPlayer } from "./FeatureVideoPlayer";

export function FeaturePromoCard({ feature, video, onSeen }: { feature: Feature; video: string; onSeen?: () => void }) {
  const { t } = useT();
  const { user } = useSession();
  const box = useRef<HTMLDivElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  const seen = useRef(false);
  const [open, setOpen] = useState(false);
  const vk = promoVideoKey(feature);
  const isIdea = vk === IDEA_KEY;
  const name = t(feature.labelKey ?? feature.nameKey);
  const href = featureHref(feature, user?.id);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => {
      const v = player.current;
      if (entry.isIntersecting) {
        if (!seen.current) { seen.current = true; onSeen?.(); }
        v?.play().catch(() => undefined);
      } else {
        v?.pause();
      }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
    // onSeen is a fresh closure each render; the card only needs the first one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video]);

  return (
    <div ref={box} className="card post-card feature-promo-card">
      <div className="thumb" role="button" tabIndex={0} aria-label={name}
        onClick={() => setOpen(true)} onKeyDown={(e) => { if (e.key === "Enter") setOpen(true); }}>
        <video ref={player} src={video} muted loop playsInline preload="none" />
        <span className="fp-pill">Bingg Bongg</span>
        <div className="fp-text">
          <b className="fp-name">{name}</b>
          <span className="fp-line">{t(isIdea ? "fp_idea_line" : "fp_try_line")}</span>
        </div>
      </div>
      <div className="body" style={{ justifyContent: "center" }}>
        {href ? (
          <Link to={href} className="btn gold small fp-btn">{t(isIdea ? "fp_share_my_idea" : "fp_try_it")}</Link>
        ) : (
          <button type="button" className="btn gold small fp-btn" onClick={() => setOpen(true)}>
            {t(isIdea ? "fp_share_my_idea" : "fp_try_it")}
          </button>
        )}
      </div>
      {/* Portalled: a filter or transform on a feed card would trap a fixed full-screen player. */}
      {open && createPortal(
        <FeatureVideoPlayer
          items={[{ url: video, title: name, sources: featureVideoSources[vk], trackKey: vk,
            trackLabel: translate("en", feature.labelKey ?? feature.nameKey) }]}
          country={user?.country} onClose={() => setOpen(false)} />,
        document.body,
      )}
    </div>
  );
}
