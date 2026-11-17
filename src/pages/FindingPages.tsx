// Finding videos (Steve, 2026-11-16): the Discover page, a hashtag's page, a topic's page and the
// Filter keywords screen. Search is pages/SearchPage.tsx; the three feeds are on HomePage; "Not
// interested" is in the video's hold menu (VideoPage).
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { mediaUrl, type Post } from "../lib/api";
import { useSession } from "../lib/session";
import { Avatar, Loading, Notice } from "../components/Common";
import { PageTitle } from "../components/PageTitle";
import { PostCard } from "../components/PostCard";
import { showGoldAlert } from "../components/GoldToast";
import { appendToFeed } from "../lib/feed";
import { useT } from "../lib/i18n";
import {
  addKeywordFilter, fetchDiscover, fetchKeywordFilters, fetchPostsByHashtag, fetchPostsByTopic, findingUserId,
  hashtagPath, MAX_KEYWORDS, removeKeywordFilter, videosLabel, type Discover,
} from "../lib/finding";

const GOLD_BTN = { background: "var(--gold-border)", color: "#000", borderColor: "var(--gold-border)" } as const;
const fmt = (n?: number | null) => new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(Number(n ?? 0) || 0);

/** The search bar at the top of Discover: opens the search screen. */
function SearchBar() {
  const { t } = useT();
  const navigate = useNavigate();
  return (
    <button type="button" className="fnd-searchbar" onClick={() => navigate("/search")}>
      <span aria-hidden style={{ color: "var(--gold)" }}>🔍</span>
      <span className="fnd-ellip">{t("fnd_search_placeholder")}</span>
    </button>
  );
}

// ---- Discover --------------------------------------------------------------------------------

export function DiscoverPage() {
  const { t } = useT();
  const { user } = useSession();
  const [data, setData] = useState<Discover | null>(null);
  const [error, setError] = useState(false);
  const [round, setRound] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(false);
    fetchDiscover(user?.id).then((d) => { if (alive) setData(d); }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [user?.id, round]);

  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <PageTitle>{t("fnd_discover")}</PageTitle>
      <SearchBar />
      {error && !data && (
        <div className="card pad" style={{ textAlign: "center" }}>
          <p style={{ color: "var(--gold)", marginTop: 0 }}>{t("fnd_couldnt_load")}</p>
          <button className="btn" style={GOLD_BTN} onClick={() => setRound((r) => r + 1)}>{t("fnd_try_again")}</button>
        </div>
      )}
      {!data && !error && <Loading />}
      {data && (
        <>
          {data.trending_hashtags.length > 0 && (
            <section>
              <h2 className="fnd-section-title">{t("fnd_trending_hashtags")}</h2>
              {data.trending_hashtags.map((h) => (
                <Link key={h.hashtag} to={hashtagPath(h.hashtag)} className="card fnd-tag-row">
                  <div className="fnd-tag-head">
                    <b>#{h.hashtag.replace(/^#/, "")}</b>
                    <span className="muted" style={{ fontSize: 13, flex: "none" }}>{videosLabel(h.total_videos || h.recent_videos)}</span>
                    <span style={{ marginLeft: "auto", color: "var(--gold)", fontWeight: 800 }}>›</span>
                  </div>
                  {(h.videos?.length ?? 0) > 0 && (
                    <div className="fnd-strip">
                      {h.videos!.slice(0, 6).map((v) => v.thumbnail
                        ? <img key={v.id} src={mediaUrl(v.thumbnail)} alt="" loading="lazy" />
                        : <span key={v.id} className="ph" />)}
                    </div>
                  )}
                </Link>
              ))}
            </section>
          )}

          {data.trending_sounds.length > 0 && (
            <section>
              <h2 className="fnd-section-title">{t("fnd_trending_sounds")}</h2>
              <div className="fnd-hscroll">
                {data.trending_sounds.map((s) => (
                  <Link key={s.id} to={`/sound/${s.id}`} className="card fnd-sound">
                    <div className="cover">{s.image ? <img src={mediaUrl(s.image)} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : "♪"}</div>
                    <div className="fnd-ellip" style={{ color: "var(--gold)", fontWeight: 800 }}>♪ {s.title || "Sound"}</div>
                    {s.singer && <div className="fnd-ellip soft" style={{ fontSize: 13 }}>{s.singer}</div>}
                    <div className="muted" style={{ fontSize: 12 }}>{videosLabel(s.uses ?? s.video_count)}</div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Only when the server has any (it may send none). */}
          {data.topics.length > 0 && (
            <section>
              <h2 className="fnd-section-title">{t("fnd_topics")}</h2>
              <div className="fnd-topics">
                {data.topics.map((tp) => (
                  <Link key={tp.id} to={`/topic/${tp.id}?name=${encodeURIComponent(tp.name)}`} className="card fnd-topic">
                    {tp.image && <img src={mediaUrl(tp.image)} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover" }} />}
                    <span className="fnd-ellip">{tp.name}</span>
                    <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>{videosLabel(tp.videos)}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {data.rising_creators.length > 0 && (
            <section>
              <h2 className="fnd-section-title">{t("fnd_rising_creators")}</h2>
              <div className="fnd-hscroll">
                {data.rising_creators.map((c) => (
                  <Link key={c.id} to={`/profile/${c.id}`} className="fnd-creator">
                    <Avatar user={{ ...c, profile_image: c.profile_image ?? undefined }} size="lg" />
                    <span className="fnd-ellip">{c.fullname || (c.username ? "@" + c.username : "")}</span>
                    <span className="muted" style={{ fontSize: 11 }}>{t("fnd_n_views", fmt(c.views))}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {!data.trending_hashtags.length && !data.trending_sounds.length && !data.topics.length && !data.rising_creators.length && (
            <Notice>{t("fnd_nothing_yet")}</Notice>
          )}
        </>
      )}
    </div>
  );
}

// ---- A grid of videos (hashtag / topic) ------------------------------------------------------

const PAGE = 18;

function VideoGrid({ load, resetKey, emptyText }: { load: (start: number) => Promise<Post[]>; resetKey: string; emptyText: string }) {
  const { t } = useT();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(true);
  const [error, setError] = useState("");

  const page = useCallback(async (start: number) => {
    setLoading(true);
    try {
      const rows = await load(start);
      setPosts((cur) => (start === 0 ? rows : [...cur, ...rows.filter((p) => !cur.some((c) => c.id === p.id))]));
      // Opening one plays it in the normal player with this list as its queue.
      if (rows.length) appendToFeed(rows);
      setMore(rows.length >= PAGE);
    } catch (e) {
      setError((e as Error).message || t("fnd_couldnt_load"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => { setPosts([]); setError(""); void page(0); }, [page]);

  return (
    <>
      {error && <Notice error>{error}</Notice>}
      {posts.length > 0 && <div className="grid">{posts.map((p) => <PostCard key={p.id} post={p} />)}</div>}
      {loading && <Loading />}
      {!loading && !error && posts.length === 0 && <Notice>{emptyText}</Notice>}
      {!loading && more && posts.length > 0 && (
        <div style={{ textAlign: "center", margin: "16px 0" }}>
          <button className="btn ghost" onClick={() => page(posts.length)}>{t("fnd_load_more")}</button>
        </div>
      )}
    </>
  );
}

export function HashtagPage() {
  const { t } = useT();
  const { tag: raw } = useParams();
  const { user } = useSession();
  const tag = decodeURIComponent(raw ?? "").replace(/^#+/, "").trim();
  const [total, setTotal] = useState<number | null>(null);
  useEffect(() => { setTotal(null); }, [tag]);
  const load = useCallback(async (start: number) => {
    const r = await fetchPostsByHashtag(tag, start, PAGE, user?.id);
    if (start === 0) setTotal(r.total);
    return r.posts;
  }, [tag, user?.id]);

  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <PageTitle style={{ wordBreak: "break-word" }}>#{tag}</PageTitle>
      {total !== null && <p className="soft" style={{ marginTop: -6 }}>{videosLabel(total)}</p>}
      <VideoGrid load={load} resetKey={`${tag}|${user?.id ?? 0}`} emptyText={t("fnd_no_videos_tag")} />
    </div>
  );
}

export function TopicPage() {
  const { t } = useT();
  const { id } = useParams();
  const { user } = useSession();
  const name = new URLSearchParams(window.location.search).get("name") || t("fnd_topics");
  const load = useCallback((start: number) => fetchPostsByTopic(Number(id), start, PAGE, user?.id), [id, user?.id]);
  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <PageTitle>{name}</PageTitle>
      <VideoGrid load={load} resetKey={`${id}|${user?.id ?? 0}`} emptyText={t("no_videos_yet")} />
    </div>
  );
}

// ---- Filter keywords -------------------------------------------------------------------------

export function FilterKeywordsPage() {
  const { t } = useT();
  const { user } = useSession();
  const meId = findingUserId(user?.id);
  const [words, setWords] = useState<string[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!meId) return;
    let alive = true;
    fetchKeywordFilters(meId).then((w) => { if (alive) setWords(w); }).catch(() => { if (alive) { setWords([]); setError(t("fnd_couldnt_load")); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meId]);

  if (!meId) {
    return (
      <div className="page" style={{ maxWidth: 640 }}>
        <PageTitle>{t("fnd_filter_keywords")}</PageTitle>
        <div className="card pad" style={{ textAlign: "center" }}>
          <p style={{ color: "var(--gold)", marginTop: 0 }}>{t("fnd_filter_explain")}</p>
          <Link to="/login" state={{ from: "/settings/filter-keywords" }} className="btn" style={GOLD_BTN}>{t("fnd_sign_in")}</Link>
        </div>
      </div>
    );
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const kw = draft.trim().replace(/^#+/, "").toLowerCase();
    if (kw.length < 2 || kw.length > 40) { showGoldAlert(t("fnd_keyword_length")); return; }
    if ((words?.length ?? 0) >= MAX_KEYWORDS) { showGoldAlert(t("fnd_keyword_max")); return; }
    if (words?.includes(kw)) { setDraft(""); return; }
    setBusy(true);
    try {
      setWords(await addKeywordFilter(meId!, kw));
      setDraft("");
    } catch (err) {
      showGoldAlert((err as Error).message || t("fnd_couldnt_load"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(kw: string) {
    const before = words ?? [];
    setWords(before.filter((w) => w !== kw));
    try {
      setWords(await removeKeywordFilter(meId!, kw));
    } catch (err) {
      setWords(before);
      showGoldAlert((err as Error).message || t("fnd_couldnt_load"));
    }
  }

  const full = (words?.length ?? 0) >= MAX_KEYWORDS;
  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <PageTitle>{t("fnd_filter_keywords")}</PageTitle>
      <p className="soft" style={{ marginTop: -4 }}>{t("fnd_filter_explain")}</p>
      {error && <Notice error>{error}</Notice>}
      <form onSubmit={add} className="row" style={{ marginBottom: 8 }}>
        <input className="input" value={draft} maxLength={40} placeholder={t("fnd_add_keyword")} aria-label={t("fnd_add_keyword")}
          onChange={(e) => setDraft(e.target.value)} disabled={busy || full} style={{ minWidth: 0 }} />
        <button className="btn" type="submit" disabled={busy || full || draft.trim().length < 2} style={GOLD_BTN}>{t("fnd_add")}</button>
      </form>
      <p className="muted" style={{ fontSize: 13, margin: "0 0 14px" }}>{t("fnd_keywords_count", words?.length ?? 0, MAX_KEYWORDS)}</p>
      {words === null ? <Loading /> : words.length === 0 ? <Notice>{t("fnd_no_keywords")}</Notice> : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }} data-testid="keyword-list">
          {words.map((w) => (
            <span key={w} className="fnd-chip">
              <span>{w}</span>
              <button type="button" aria-label={t("fnd_remove_keyword", w)} onClick={() => remove(w)}>✕</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
