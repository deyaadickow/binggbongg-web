// /ads-for-referrals — Ads for Referrals (Steve, 2026-11-11): "In that page we will add all the
// downloadable video ads so all members can download them to their phone and upload them to their
// social media accounts. Please explain all this to them in your words."
//
// Top to bottom: the offer video, how it works (download, post, code in your bio, 5% until $100,
// no limit, #ad), my referral code + Copy, and every ad with Download and Share. Black and gold.
//
// /ads-for-referrals?demo=1   sample videos, no server: &demo=out (signed out) | empty | error
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageTitle } from "../components/PageTitle";
import { FeatureVideoPlayer } from "../components/FeatureVideoPlayer";
import { showGoldAlert } from "../components/GoldToast";
import { LANGUAGES, useT } from "../lib/i18n";
import { useSession } from "../lib/session";
import {
  adFileName, adsDemoKind, demoReferralAds, duration, fetchAdFile, fetchReferralAds, openDownloadLink, saveBlob, shareAd,
  type ReferralAds, type ReferralVideo,
} from "../lib/referralAds";

type T = ReturnType<typeof useT>["t"];

/** "English", "Tagalog" … — fil is shown as Tagalog, the word the launch market uses. */
function langName(code: string): string {
  const c = code === "fil" ? "tl" : code;
  return LANGUAGES.find((l) => l.code === c)?.native ?? code.toUpperCase();
}

function AdCard({ ad, code, t, onPlay }: { ad: ReferralVideo; code: string | null; t: T; onPlay: () => void }) {
  const [pct, setPct] = useState<number | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const url = ad.download_url || ad.video_url;
  const name = adFileName(ad);

  async function download() {
    if (pct !== null) return;
    if (blob) { saveBlob(blob, name); showGoldAlert(t("afr_saved")); return; }
    setPct(0);
    try {
      const b = await fetchAdFile(url, setPct);
      setBlob(b);
      saveBlob(b, name);
      showGoldAlert(t("afr_saved"));
    } catch {
      // No CORS on the file or offline: the server's attachment route downloads it by itself.
      try { openDownloadLink(url, name); } catch { showGoldAlert(t("afr_download_failed")); }
    } finally {
      setPct(null);
    }
  }

  async function share() {
    const o = await shareAd({ blob, fileName: name, text: t("afr_share_text", code ?? ""), url: ad.video_url });
    if (o === "copied") showGoldAlert(t("link_copied_paste_it_anywhere"));
    else if (o === "failed") showGoldAlert(t("couldn_t_copy_select_the_link_and_copy_i"));
  }

  return (
    <li className="afr-ad">
      <button className="afr-ad-thumb" onClick={onPlay} aria-label={ad.title}>
        {ad.poster_url ? <img src={ad.poster_url} alt="" loading="lazy" /> : <span className="afr-ad-noposter" />}
        <span className="afr-ad-play" aria-hidden>▶</span>
        {ad.duration > 0 && <span className="afr-ad-dur">{duration(ad.duration)}</span>}
      </button>
      <div className="afr-ad-body">
        <b className="afr-ad-title">{ad.title}</b>
        <span className="afr-chip">{langName(ad.language)}</span>
        <div className="afr-ad-btns">
          <button className="btn gold" onClick={() => void download()} disabled={pct !== null}>
            {pct !== null ? t("afr_downloading", pct < 0 ? "" : `${pct}%`) : t("afr_download")}
          </button>
          <button className="btn" onClick={() => void share()}>📤 {t("rp_share")}</button>
        </div>
      </div>
    </li>
  );
}

export function AdsForReferralsPage() {
  const { t, tn, lang } = useT();
  const { user, isLoggedIn } = useSession();
  const [sp] = useSearchParams();
  const demo = adsDemoKind(sp.get("demo"));
  const [data, setData] = useState<ReferralAds | null>(null);
  const [error, setError] = useState(false);
  const [playing, setPlaying] = useState<number | null>(null);

  const load = useCallback(() => {
    setError(false);
    setData(null);
    (demo ? demoReferralAds(demo, lang) : fetchReferralAds(lang))
      .then(setData)
      .catch(() => setError(true));
  }, [demo, lang]);
  useEffect(() => { load(); }, [load, user?.id]);

  const signedOut = demo === "out" || (!demo && !isLoggedIn);
  const code = signedOut ? null : (data?.referral_code ?? user?.username ?? null);
  const cap = data?.cap ?? 100;
  const percent = data?.percent ?? 5;

  function copy() {
    if (!code) return;
    navigator.clipboard.writeText(code)
      .then(() => showGoldAlert(t("rp_copied")))
      .catch(() => showGoldAlert(t("couldn_t_copy_select_the_link_and_copy_i")));
  }

  const ads = data?.ads ?? [];
  return (
    <div className="page afr-page">
      <PageTitle backTo="/features">📣 {t("fname_ads_for_referrals")}</PageTitle>
      {demo && <div className="cbd-demo">🧪 {t("afr_demo")}</div>}

      {data?.offer_video && (
        <video className="afr-offer-top" src={data.offer_video.video_url} poster={data.offer_video.poster_url ?? undefined}
          controls playsInline preload="metadata" />
      )}

      <section className="afr-card afr-how">
        <h2 className="afr-headline">{t("afr_headline", cap)}</h2>
        <ol className="afr-steps">
          <li>{t("afr_step1")}</li>
          <li>{t("afr_step2")}</li>
          <li>{code ? tn("afr_step3", <b className="afr-inline-code">{code}</b>) : t("afr_step3_out")}</li>
          <li>{t("afr_step4", percent, cap)}</li>
        </ol>
        <p className="afr-nolimit">{t("afr_no_limit")}</p>
        <p className="afr-tip">{t("afr_tip")}</p>
      </section>

      <section className="afr-card afr-code">
        {code ? (
          <>
            <span className="afr-code-label">{t("afr_your_code")}</span>
            <b className="afr-code-value">{code}</b>
            <button className="btn gold afr-big-btn" onClick={copy}>📋 {t("rp_copy")}</button>
          </>
        ) : (
          <>
            <span className="afr-code-out">{t("afr_sign_in")}</span>
            <Link to="/login" className="btn gold afr-big-btn">{t("sign_in")}</Link>
          </>
        )}
      </section>

      <h2 className="afr-list-title">{t("afr_ads_heading")}</h2>
      {!data && !error && <div className="afr-state" role="status">{t("loading")}</div>}
      {error && <button className="afr-state afr-state-btn" onClick={load}>{t("afr_error")}</button>}
      {data && ads.length === 0 && <div className="afr-state">{t("afr_empty")}</div>}
      {ads.length > 0 && (
        <ul className="afr-list">
          {ads.map((ad, i) => <AdCard key={ad.id} ad={ad} code={code} t={t} onPlay={() => setPlaying(i)} />)}
        </ul>
      )}

      {playing !== null && (
        <FeatureVideoPlayer items={ads.map((a) => ({ url: a.video_url, title: a.title, trackKey: `referral_ad_${a.id}`, trackLabel: a.title }))}
          start={playing} onClose={() => setPlaying(null)} />
      )}
    </div>
  );
}
