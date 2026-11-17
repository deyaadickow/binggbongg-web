// /information-center — Information Center (Steve, 2026-11-17): "On main feed page remove all the
// buttons on the bottom of the page and we will have only one button that says, 'Information
// Center'. When you click the information center button you will link to the information center
// page that will have all the buttons we need to add." ... "Make all the buttons same size from side
// to side of the page. If the line is too long do not cut it off but add a second line to continue
// the sentences. Please add different banners with different features on top of the page that will
// change every 10 to 15 seconds just so the page doesn't look empty."
//
// Top: a rotating banner over the 70+ Videos (the same fetchFeaturePageVideos list as /feature-videos),
// a new one every 12 s; clicking one plays it on /feature-videos?play=<id>. Below: one full-width
// gold button per destination, text wrapping onto a second line rather than being cut off.
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { post, mediaUrl } from "../lib/api";
import { useT, type StringKey } from "../lib/i18n";
import { PageTitle } from "../components/PageTitle";

interface BannerRow { id: number; sort: number; title: string; video: string; thumbnail?: string | null }
interface Banner { id: number; title: string; poster: string }

const ROTATE_MS = 12_000;

function InfoBanner() {
  const { t } = useT();
  const navigate = useNavigate();
  const [banners, setBanners] = useState<Banner[] | null>(null);
  const [at, setAt] = useState(0);

  useEffect(() => {
    let alive = true;
    // "platform" keeps the body non-empty — the host's firewall 403s an empty-body POST.
    post<BannerRow[]>("fetchFeaturePageVideos", { platform: "web" })
      .then((res) => {
        if (!alive || !res.status) return;
        const rows = [...(res.data ?? [])].filter((r) => r.video && r.thumbnail).sort((a, b) => a.sort - b.sort);
        setBanners(rows.map((r) => ({ id: r.id, title: r.title, poster: mediaUrl(r.thumbnail) })));
      })
      .catch(() => { /* no banner: the buttons still work */ });
    return () => { alive = false; };
  }, []);

  const count = banners?.length ?? 0;
  useEffect(() => {
    if (count < 2) return;
    const timer = window.setInterval(() => setAt((i) => (i + 1) % count), ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [count, at]); // `at` restarts the 12 s after a dot is clicked

  // Steve, 2026-11-17: "Make it where i can just swipe it to the left or right to get the next
  // banner." Left = next, right = previous (finger or mouse); a plain click still plays it.
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const onDown = (e: React.PointerEvent) => { swipeStart.current = { x: e.clientX, y: e.clientY }; swiped.current = false; };
  const onUp = (e: React.PointerEvent) => {
    const s0 = swipeStart.current;
    swipeStart.current = null;
    if (!s0 || count < 2) return;
    const dx = e.clientX - s0.x;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(e.clientY - s0.y)) return;
    swiped.current = true;
    setAt((i) => (i + (dx < 0 ? 1 : -1) + count) % count);
  };

  if (!banners || banners.length === 0) return null;
  return (
    <div className="ic-banner" onPointerDown={onDown} onPointerUp={onUp}
      onPointerCancel={() => { swipeStart.current = null; }}>
      {banners.map((b, i) => (
        <button key={b.id} type="button" className={"ic-slide" + (i === at ? " on" : "")}
          tabIndex={i === at ? 0 : -1} aria-hidden={i !== at}
          onClick={() => { if (swiped.current) { swiped.current = false; return; } navigate(`/feature-videos?play=${b.id}`); }}
          aria-label={b.title}>
          <img src={b.poster} alt="" draggable={false} loading={i === 0 ? "eager" : "lazy"} />
          <span className="ic-slide-title">{b.title}</span>
          <span className="ic-play" aria-hidden>▶</span>
        </button>
      ))}
      {/* One dot per video stops being readable past ten (there are 70+), so a counter instead. */}
      {banners.length > 10 && (
        <div className="ic-count" aria-hidden>{at + 1} / {banners.length}</div>
      )}
      {banners.length > 1 && banners.length <= 10 && (
        <div className="ic-dots">
          {banners.map((b, i) => (
            <button key={b.id} type="button" className={i === at ? "on" : ""} aria-label={t("ic_banner_n", i + 1)}
              onClick={() => setAt(i)} />
          ))}
        </div>
      )}
    </div>
  );
}

export function InformationCenterPage() {
  const { t } = useT();
  const items: { to: string; key: StringKey }[] = [
    // The $1,000,000 referral video ad sits at the top of Ads for Referrals.
    { to: "/ads-for-referrals?video=en", key: "ic_million" },
    { to: "/country-battles", key: "acb_tab" },
    { to: "/features", key: "tab_70_features" },
    { to: "/feature-videos", key: "tab_70_videos" },
    { to: "/one-video", key: "ic_one_video" },
    { to: "/our-ads", key: "our_ads_tab" },
    { to: "/feature-videos?play=86", key: "ic_algorithm" },
    { to: "/exciting-news", key: "ic_exciting_news" },
    // The daily Video of the Day email is one of these videos.
    { to: "/feature-videos", key: "ic_daily_email" },
  ];
  return (
    <div className="page ic-page">
      <PageTitle backTo="/">{t("information_center")}</PageTitle>
      <InfoBanner />
      <nav className="ic-list" aria-label={t("information_center")}>
        {items.map((it) => (
          <Link key={it.key} to={it.to} className="ic-btn">{t(it.key)}</Link>
        ))}
      </nav>
    </div>
  );
}
