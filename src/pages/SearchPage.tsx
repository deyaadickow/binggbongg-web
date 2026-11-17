import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { displayName, mediaUrl, post, type Post, type Sound, type UserSummary } from "../lib/api";
import {
  clearRecentSearches, hashtagPath, recentSearches, rememberSearch, searchAll, searchPostsList, searchUsersList,
  videosLabel, type SearchAll,
} from "../lib/finding";
import { useSession } from "../lib/session";
import { Avatar, Loading, Notice, UserRow } from "../components/Common";
import { PostCard } from "../components/PostCard";
import { useT } from "../lib/i18n";
import { PageTitle } from "../components/PageTitle";

export function SearchPage() {
  const { t } = useT();
  const { user } = useSession();
  const [params] = useSearchParams();
  const [keyword, setKeyword] = useState(() => params.get("q") ?? "");
  // Steve, 2026-11-08: "Between Live and Videos please add 'Online Now' and add whoever is
  // online in a row, Avatar, Name and Message." It is still what an empty search shows.
  // Finding videos (Steve, 2026-11-16): one search with Top | Videos | People | Sounds | Hashtags.
  type Tab = "online" | "top" | "videos" | "people" | "sounds" | "hashtags";
  const [tab, setTab] = useState<Tab>(() => (params.get("q") ? "top" : "online"));
  const [online, setOnline] = useState<UserSummary[] | null>(null);
  // Steve, 2026-11-08 redesign: "Online Now" + All Members / Friends / Following / Followers.
  const [scope, setScope] = useState<"all" | "friends" | "following" | "followers">("all");
  // How many are online in each group — a green dot on that box when > 0 (Steve, 2026-11-08).
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    let alive = true;
    const load = () => {
      post<UserSummary[]>("fetchOnlineNowMembers", { search: "", scope: "all", ...(user ? { user_id: user.id } : {}) })
        .then((r) => { const c = (r as unknown as { counts?: Record<string, number> }).counts; if (alive && c) setCounts(c); })
        .catch(() => {});
    };
    load();
    const every = setInterval(load, 30000);
    return () => { alive = false; clearInterval(every); };
  }, [user?.id]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [all, setAll] = useState<SearchAll | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState("");
  const [recent, setRecent] = useState<string[]>(() => recentSearches());
  const lastSaved = useRef("");
  const runId = useRef(0);

  // Everyone live or active in the last 15 minutes, narrowed by what's typed; every 30 s while
  // the tab is open.
  useEffect(() => {
    if (tab !== "online") return;
    let alive = true;
    const load = () => {
      post<UserSummary[]>("fetchOnlineNowMembers", { search: keyword.trim(), scope, ...(user ? { user_id: user.id } : {}) })
        .then((r) => { if (alive) setOnline(r.data ?? []); })
        .catch(() => { if (alive) setOnline((o) => o ?? []); });
    };
    const first = setTimeout(load, 350);
    const every = setInterval(load, 30000);
    return () => { alive = false; clearTimeout(first); clearInterval(every); };
  }, [tab, keyword, scope, user?.id]);

  /** One search across everything. searchAll fills Top / Sounds / Hashtags; the Videos and People
   *  tabs use the full searchPosts / searchUser lists. If searchAll is not on the server yet, Top
   *  is built from those two. */
  async function search(raw: string) {
    const q = raw.trim();
    if (!q) return;
    const mine = ++runId.current;
    setLoading(true);
    setError(null);
    try {
      const me = user?.id ?? null;
      const [a, p, u] = await Promise.all([
        searchAll(q, me).catch(() => null),
        searchPostsList(q, me).catch(() => [] as Post[]),
        searchUsersList(q, me).catch(() => [] as UserSummary[]),
      ]);
      if (mine !== runId.current) return;
      setPosts(p);
      setUsers(u);
      setAll(a ?? {
        videos: p.slice(0, 12).map((x) => ({ id: x.id, thumbnail: x.thumbnail, description: x.description, views: x.views, likes: x.likes, user: x.user ?? null })),
        people: u.slice(0, 10), sounds: [], hashtags: [],
      });
      setSearched(q);
      // Kept on this device. While typing, "ca" then "cat" is one search, not two.
      if (q.length >= 2) {
        const prev = lastSaved.current;
        if (prev && (q.toLowerCase().startsWith(prev.toLowerCase()) || prev.toLowerCase().startsWith(q.toLowerCase()))) {
          try { localStorage.setItem("bb.recentSearches", JSON.stringify(recentSearches().filter((x) => x !== prev))); } catch { /* private mode */ }
        }
        lastSaved.current = q;
        setRecent(rememberSearch(q));
      }
    } catch (err) {
      if (mine === runId.current) setError((err as Error).message);
    } finally {
      if (mine === runId.current) setLoading(false);
    }
  }

  // As you type, ~350 ms after the last key.
  useEffect(() => {
    const q = keyword.trim();
    if (!q) { runId.current++; setLoading(false); setSearched(""); setAll(null); return; }
    const timer = window.setTimeout(() => { void search(q); }, 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, user?.id]);

  function onType(v: string) {
    setKeyword(v);
    if (v.trim() && tab === "online") setTab("top");
  }

  function run(e?: React.FormEvent) {
    e?.preventDefault();
    const q = keyword.trim();
    if (!q) return;
    if (tab === "online") setTab("top");
    lastSaved.current = "";
    void search(q);
  }

  function pickRecent(q: string) {
    lastSaved.current = "";
    setKeyword(q);
    setTab("top");
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "top", label: t("fnd_top") },
    { key: "videos", label: t("fnd_videos") },
    { key: "people", label: t("fnd_people") },
    { key: "sounds", label: t("fnd_sounds") },
    { key: "hashtags", label: t("fnd_hashtags") },
  ];
  const q = keyword.trim();
  const ready = !!q && searched.toLowerCase() === q.toLowerCase();
  const nothing = <p className="muted">{t("fnd_no_results", q)}</p>;

  const seeAll = (to: Tab) => (
    <button type="button" className="btn small ghost" onClick={() => setTab(to)} style={{ color: "var(--gold)", borderColor: "var(--gold-border)" }}>
      {t("fnd_see_all")} ›
    </button>
  );
  const head = (title: string, to: Tab, show: boolean) => (
    <div className="row" style={{ margin: "16px 0 8px" }}>
      <b style={{ color: "var(--gold)", fontSize: 17 }}>{title}</b>
      <span className="spacer" />
      {show && seeAll(to)}
    </div>
  );
  const soundRow = (s: Sound) => (
    <Link key={s.id} to={`/sound/${s.id}`} className="card fnd-list-row">
      <div style={{ width: 48, height: 48, borderRadius: 8, border: "1.5px solid var(--gold-border)", background: "#000", overflow: "hidden", flex: "none",
        display: "flex", alignItems: "center", justifyContent: "center", color: "var(--gold)", fontSize: 22 }}>
        {s.image ? <img src={mediaUrl(s.image)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.currentTarget.style.display = "none"; }} /> : "♪"}
      </div>
      <div className="grow">
        <div className="fnd-ellip" style={{ color: "var(--gold)", fontWeight: 800 }}>♪ {s.title || "Sound"}</div>
        <div className="fnd-ellip muted" style={{ fontSize: 13 }}>{[s.singer, s.video_count != null ? videosLabel(s.video_count) : ""].filter(Boolean).join(" · ")}</div>
      </div>
      <span style={{ color: "var(--gold)", fontWeight: 800 }}>›</span>
    </Link>
  );
  const tagRow = (h: { id: number; hashtag: string; video_count?: number }) => (
    <Link key={h.id + h.hashtag} to={hashtagPath(h.hashtag)} className="card fnd-list-row">
      <div style={{ width: 40, height: 40, borderRadius: "50%", border: "1.5px solid var(--gold-border)", background: "#000", flex: "none",
        display: "flex", alignItems: "center", justifyContent: "center", color: "var(--gold)", fontWeight: 800, fontSize: 20 }}>#</div>
      <div className="grow">
        <div className="fnd-ellip" style={{ color: "var(--gold)", fontWeight: 800 }}>#{h.hashtag.replace(/^#/, "")}</div>
        {h.video_count != null && <div className="muted" style={{ fontSize: 13 }}>{videosLabel(h.video_count)}</div>}
      </div>
      <span style={{ color: "var(--gold)", fontWeight: 800 }}>›</span>
    </Link>
  );
  const videoTile = (v: SearchAll["videos"][number]) => (
    <Link key={v.id} to={`/video/${v.id}`} style={{ display: "block", position: "relative", aspectRatio: "9 / 13", borderRadius: 10, overflow: "hidden",
      border: "1px solid var(--gold-border)", background: "#111" }}>
      {v.thumbnail && <img src={mediaUrl(v.thumbnail)} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
      <span style={{ position: "absolute", left: 6, bottom: 4, right: 6, color: "#fff", fontSize: 12, fontWeight: 700, textShadow: "0 1px 3px #000" }} className="fnd-ellip">
        👁 {v.views ?? 0}
      </span>
    </Link>
  );

  return (
    <div className="page">
      <PageTitle>{t("search")}</PageTitle>
      <form onSubmit={run} className="row" style={{ marginBottom: 14 }}>
        <input className="input" type="search" placeholder={t("fnd_search_placeholder")} aria-label={t("search")} value={keyword}
          onChange={(e) => onType(e.target.value)} style={{ minWidth: 0 }} />
        <button className="btn" type="submit">{t("search")}</button>
      </form>
      <div className="tabs fnd-search-tabs" role="tablist">
        {tabs.map((x) => (
          <button key={x.key} type="button" role="tab" aria-selected={tab === x.key} className={tab === x.key ? "active" : ""} onClick={() => setTab(x.key)}>{x.label}</button>
        ))}
      </div>
      <div style={{ textAlign: "center", margin: "12px 0 6px", color: "var(--gold)", fontWeight: 700 }}>
        <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#2ECC40", border: "1.5px solid #000", marginRight: 6, verticalAlign: "middle" }} />
        {t("online_now")}:
      </div>
      <div className="tabs search-uniform" style={{ marginBottom: 14 }}>
        {(["all", "friends", "following", "followers"] as const).map((s) => (
          <button key={s} className={tab === "online" && scope === s ? "active" : ""}
            onClick={() => { setScope(s); setOnline(null); setTab("online"); }}>
            {(counts[s] ?? 0) > 0 && <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#2ECC40", border: "1.5px solid #000", marginRight: 5, verticalAlign: "middle" }} />}
            {t(s === "all" ? "online_all_members" : s === "friends" ? "online_friends" : s === "following" ? "online_following" : "online_followers")}
          </button>
        ))}
      </div>
      {error && <Notice error>{error}</Notice>}
      {tab === "online" ? (
        online === null ? <Loading /> : (
          <div style={{ display: "grid", gap: 10 }}>
            {online.map((u) => (
              <div key={u.id} className="card row" style={{ padding: 10 }}>
                {/* Steve, 2026-11-08: "If they click on the avatar or name, link them to their profile page." */}
                <Link to={`/profile/${u.id}`} className="row" style={{ flex: 1, minWidth: 0, color: "inherit", gap: 10 }}>
                  {/* The green online dot is drawn by Avatar itself (Common.tsx) from is_online. */}
                  <Avatar user={{ ...u, is_online: 1 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, color: "var(--gold)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName(u)}</div>
                    <div style={{ fontSize: 13, color: "var(--gold)", opacity: 0.75 }}>@{u.username ?? ""}</div>
                    {u.country && <div style={{ fontSize: 13, color: "var(--gold)" }}>{u.country}{u.country_flag ? ` ${u.country_flag}` : ""}</div>}
                  </div>
                </Link>
                <div style={{ display: "grid", gap: 6, flex: "none" }}>
                  <Link to={`/messages/${u.id}`} className="btn small">{t("online_now_message")}</Link>
                  {/* Steve, 2026-11-08: a Live box under Message for every member; green dot +
                      opens their live when they are live now. */}
                  {u.is_live == 1 && u.live_room_name ? (
                    <Link to={`/live/${encodeURIComponent(u.live_room_name)}`} className="btn small">
                      <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: "#FF2D2D", border: "1.5px solid #000" }} />
                      {t("online_live")}
                    </Link>
                  ) : (
                    <span className="btn small" style={{ cursor: "default" }}>{t("online_live")}</span>
                  )}
                </div>
              </div>
            ))}
            {online.length === 0 && <p className="muted">{t("online_now_empty")}</p>}
          </div>
        )
      ) : !q ? (
        // Nothing typed: the recent searches kept on this device.
        recent.length > 0 ? (
          <div>
            <div className="row" style={{ marginBottom: 8 }}>
              <b style={{ color: "var(--gold)" }}>{t("fnd_recent")}</b>
              <span className="spacer" />
              <button type="button" className="btn small ghost" onClick={() => { clearRecentSearches(); setRecent([]); }}
                style={{ color: "var(--gold)", borderColor: "var(--gold-border)" }}>{t("fnd_clear")}</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {recent.map((r) => (
                <button key={r} type="button" className="fnd-chip" style={{ paddingRight: 14, cursor: "pointer" }} onClick={() => pickRecent(r)}>
                  <span>🕘 {r}</span>
                </button>
              ))}
            </div>
          </div>
        ) : <p className="muted">{t("fnd_type_to_search")}</p>
      ) : !ready || (loading && !all) ? <Loading text="Searching…" /> : tab === "top" ? (
        <div data-testid="search-top">
          {all && (all.videos.length + all.people.length + all.sounds.length + all.hashtags.length) === 0 && nothing}
          {all && all.videos.length > 0 && (
            <>
              {head(t("fnd_videos"), "videos", true)}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 }}>{all.videos.slice(0, 6).map(videoTile)}</div>
            </>
          )}
          {all && all.people.length > 0 && (
            <>
              {head(t("fnd_people"), "people", true)}
              <div style={{ display: "grid", gap: 10 }}>{all.people.slice(0, 3).map((u) => <UserRow key={u.id} user={u} />)}</div>
            </>
          )}
          {all && all.sounds.length > 0 && (
            <>
              {head(t("fnd_sounds"), "sounds", all.sounds.length > 3)}
              {all.sounds.slice(0, 3).map(soundRow)}
            </>
          )}
          {all && all.hashtags.length > 0 && (
            <>
              {head(t("fnd_hashtags"), "hashtags", all.hashtags.length > 4)}
              {all.hashtags.slice(0, 4).map(tagRow)}
            </>
          )}
        </div>
      ) : tab === "people" ? (
        <div style={{ display: "grid", gap: 10 }}>
          {users.map((u) => <UserRow key={u.id} user={u} />)}
          {users.length === 0 && <p className="muted">{t("no_members_match")}</p>}
        </div>
      ) : tab === "videos" ? (
        <>
          <div className="grid">{posts.map((p) => <PostCard key={p.id} post={p} />)}</div>
          {posts.length === 0 && <p className="muted">{t("no_videos_match")}</p>}
        </>
      ) : tab === "sounds" ? (
        <div>{(all?.sounds ?? []).map(soundRow)}{!(all?.sounds.length) && nothing}</div>
      ) : (
        <div>{(all?.hashtags ?? []).map(tagRow)}{!(all?.hashtags.length) && nothing}</div>
      )}
    </div>
  );
}
