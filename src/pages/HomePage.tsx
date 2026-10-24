import { Fragment, useCallback, useEffect, useState } from "react";
import { post, type Post } from "../lib/api";
import { useSession } from "../lib/session";
import { PostCard } from "../components/PostCard";
import { Loading, Notice, StoreBadges } from "../components/Common";
import { setFeed } from "../lib/feed";
import { FeedPhotoCard } from "../components/FeedPhotoCard";
import { HelpFeedCard } from "../components/HelpFeedCard";
import { fetchHelpCampaigns, helpFeedSlots, type HelpCampaign } from "../lib/help";
import { tt, useT  } from "../lib/i18n";

export function HomePage() {
  const { t } = useT();
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
      {/* One member photo in the feed, the phones' fetchRandomFeedPhoto. Only members past the
          free storage allowance are eligible — that is the server's rule, not ours. */}
      <FeedPhotoCard />
      <div className="grid">
        {posts.map((p, i) => {
          const slot = slots.indexOf(i);
          return (
            <Fragment key={p.id}>
              {slot !== -1 && help.rows[slot] && <HelpFeedCard campaign={help.rows[slot]} />}
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
