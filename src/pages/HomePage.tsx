import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { post, type Post } from "../lib/api";
import { useSession } from "../lib/session";
import { PostCard } from "../components/PostCard";
import { Loading, Notice, StoreBadges } from "../components/Common";
import { setFeed } from "../lib/feed";
import { FeedPhotoCard } from "../components/FeedPhotoCard";
import { CountryBattleDec1Banner } from "../components/CountryBattleDec1Banner";
import { PrelaunchBanner } from "../components/PrelaunchBanner";
import { ReferralOfferPopup } from "../components/ReferralOffer";
import { HelpFeedCard } from "../components/HelpFeedCard";
import { PaidAdCard, type FeedVideoAd } from "../components/PaidAdCard";
import { fetchHelpCampaigns, helpFeedSlots, type HelpCampaign } from "../lib/help";
import { tt, useT  } from "../lib/i18n";
import { FeaturePromoCard } from "../components/FeaturePromoCard";
import { FEATURES, type Feature } from "./FeaturesPage";
import { fetchFeatureVideos } from "../lib/featureVideos";
import { useContestOn } from "../lib/contests";
import { FEATURE_PROMO_EVERY, IDEA_KEY, markPromoShown, promoForCard, promoSequence, promoVideoKey } from "../lib/featurePromo";

/** A paid ad after every this many videos — the same as Android and iOS. */
const PAID_AD_EVERY = 20;
/** Where in each 20 the paid ad goes. The Bingg Bongg feature card took the 20th slot
 *  (Steve, 2026-11-07), and as both are every 20 the ad would never have shown again — so on the
 *  web the ad moved to the middle of each 20: after videos 10, 30, 50 … and features after 20, 40, 60 … */
const PAID_AD_OFFSET = 10;

export function HomePage() {
  const { t, lang } = useT();
  const { user } = useSession();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Help campaigns to sprinkle through the feed, and the interval the SERVER chose. Loaded once;
  // a failure here must never affect the feed, so help.ts swallows it and returns an empty list.
  const [help, setHelp] = useState<{ rows: HelpCampaign[]; everyMin: number; everyMax: number }>(
    { rows: [], everyMin: 20, everyMax: 30 },
  );

  const loadMore = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await post<Post[]>("fetchPosts", user ? { my_user_id: user.id } : {});
      if (!res.status) throw new Error(res.message ?? tt("couldn_t_load_the_feed"));
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const next = [...prev, ...(res.data ?? []).filter((p) => !seen.has(p.id))];
        setFeed(next); // the video page steps through this same order
        return next;
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
    // The member's ID, not the object. The session replaces the object on every balance
    // refresh — the gift sheet does one after each gift — and this callback changing is what
    // the effect below treats as "start over": it wiped the feed and loaded 10 fresh random
    // posts, so the card just gifted vanished with the gift still on it (Steve, 2026-10-15:
    // "I don't see the gift and the video switches to another video right away").
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    setPosts([]);
    loadMore();
  }, [loadMore]);

  useEffect(() => { fetchHelpCampaigns(0, 10).then(setHelp); }, []);

  // Paid video ads for where this member is (Steve, 2026-10-31). Signed-in only: the endpoint
  // needs the member, as it does on the phones. A failure just means no ads, never no feed.
  const [ads, setAds] = useState<FeedVideoAd[]>([]);
  useEffect(() => {
    if (!user?.id) { setAds([]); return; }
    let live = true;
    post<FeedVideoAd[]>("fetchFeedVideoAds", { my_user_id: user.id, client: "web" })
      .then((r) => { if (live) setAds((r.data ?? []).filter((a) => a.video_path)); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [user?.id]);

  // Feature promo cards (Steve, 2026-11-07): the directory's tiles this member can see that have a
  // feature video, in the app's language. A failed or empty fetch means no cards — the feed is untouched.
  const [featureVideos, setFeatureVideos] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    fetchFeatureVideos(lang).then((v) => { if (live) setFeatureVideos(v); });
    return () => { live = false; };
  }, [lang]);
  const hasContest = useContestOn();
  const promoFeatures = useMemo(() => {
    const byKey: Record<string, Feature> = {};
    for (const f of FEATURES.flatMap((sec) => sec.features)) {
      const vk = promoVideoKey(f);
      if ((hasContest || !f.contestOnly) && featureVideos[vk] && !byKey[vk]) byKey[vk] = f;
    }
    return byKey;
  }, [featureVideos, hasContest]);
  const promoKeys = useMemo(() => Object.keys(promoFeatures).filter((k) => k !== IDEA_KEY).sort(), [promoFeatures]);
  const hasIdea = !!promoFeatures[IDEA_KEY];
  // Computed once per set of features, so a card never changes feature as more videos load.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const promoSeq = useMemo(() => promoSequence(promoKeys, 300), [promoKeys.join("|")]);

  // Indexes only, never a merged array: the video page steps through `posts` in exactly this
  // order, and splicing anything into it would desync which video "next" means.
  const slots = helpFeedSlots(posts.length, help.rows.length, help.everyMin, help.everyMax);

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 14, flexWrap: "wrap" }}>
        <h1 className="page-title" style={{ margin: 0 }}>{t("for_you")}</h1>
        <span className="spacer" />
        <StoreBadges compact />
      </div>
      {error && <Notice error>{error}</Notice>}
      {/* Pre-Launch Special (Steve, 2026-11-10) — only while fetchPrelaunch says it is on. */}
      <PrelaunchBanner />
      <CountryBattleDec1Banner />
      {/* The $100 referral offer video, once per member (2026-11-11). For You only: never over a live room. */}
      <ReferralOfferPopup />
      {/* One member photo in the feed, the phones' fetchRandomFeedPhoto. Only members past the
          free storage allowance are eligible — that is the server's rule, not ours. */}
      <FeedPhotoCard />
      <div className="grid">
        {posts.map((p, i) => {
          const slot = slots.indexOf(i);
          // A Bingg Bongg feature card after every 20th video (i counts member videos only).
          const promoKey = i > 0 && i % FEATURE_PROMO_EVERY === 0 ? promoForCard(i / FEATURE_PROMO_EVERY, promoSeq, hasIdea) : null;
          const promo = promoKey ? promoFeatures[promoKey] : undefined;
          return (
            <Fragment key={p.id}>
              {/* One ad in every 20 videos, taking turns (Steve, 2026-11-05: "Once every 20 videos, we don't want to over whelm the members."). */}
              {user && ads.length > 0 && i >= PAID_AD_OFFSET && i % PAID_AD_EVERY === PAID_AD_OFFSET && (
                <PaidAdCard ad={ads[Math.floor(i / PAID_AD_EVERY) % ads.length]} userId={user.id} />
              )}
              {promo && promoKey && (
                <FeaturePromoCard feature={promo} video={featureVideos[promoKey]}
                  onSeen={() => markPromoShown(promoKey, promoKeys)} />
              )}
              {/* The feature card wins its slot over any other extra card. */}
              {!promo && slot !== -1 && help.rows[slot] && <HelpFeedCard campaign={help.rows[slot]} />}
              <PostCard post={p} />
            </Fragment>
          );
        })}
      </div>
      {loading ? <Loading /> : (
        <div className="center" style={{ marginTop: 20 }}>
          <button className="btn" onClick={loadMore}>{t("show_more")}</button>
        </div>
      )}
    </div>
  );
}
