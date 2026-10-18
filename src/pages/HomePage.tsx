import { useCallback, useEffect, useState } from "react";
import { post, type Post } from "../lib/api";
import { useSession } from "../lib/session";
import { PostCard } from "../components/PostCard";
import { Loading, Notice, StoreBadges } from "../components/Common";
import { setFeed } from "../lib/feed";
import { FeedPhotoCard } from "../components/FeedPhotoCard";
import { useT } from "../lib/i18n";

export function HomePage() {
  const { t } = useT();
  const { user } = useSession();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMore = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await post<Post[]>("fetchPosts", user ? { my_user_id: user.id } : {});
      if (!res.status) throw new Error(res.message ?? "Couldn't load the feed.");
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
        {posts.map((p) => <PostCard key={p.id} post={p} />)}
      </div>
      {loading ? <Loading /> : (
        <div className="center" style={{ marginTop: 20 }}>
          <button className="btn" onClick={loadMore}>{t("show_more")}</button>
        </div>
      )}
    </div>
  );
}
