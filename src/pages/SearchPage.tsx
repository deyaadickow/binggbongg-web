import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { displayName, post, type Post, type UserSummary } from "../lib/api";
import { useSession } from "../lib/session";
import { Avatar, Loading, Notice, UserRow } from "../components/Common";
import { PostCard } from "../components/PostCard";
import { useT } from "../lib/i18n";
import { PageTitle } from "../components/PageTitle";

export function SearchPage() {
  const { t } = useT();
  const { user } = useSession();
  const [keyword, setKeyword] = useState("");
  // Steve, 2026-11-08: "Between Live and Videos please add 'Online Now' and add whoever is
  // online in a row, Avatar, Name and Message." The web has no Live chip here, so it comes first.
  const [tab, setTab] = useState<"online" | "members" | "videos">("online");
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

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

  async function run(e?: React.FormEvent) {
    e?.preventDefault();
    const q = keyword.trim();
    if (!q) return;
    if (tab === "online") setTab("members");
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const extra = user ? { my_user_id: user.id } : {};
      const [u, p] = await Promise.all([
        post<UserSummary[]>("searchUser", { keyword: q, start: 0, count: 30, ...extra }),
        post<Post[]>("searchPosts", { keyword: q, start: 0, count: 30, ...extra }),
      ]);
      setUsers(u.data ?? []);
      setPosts(p.data ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <PageTitle>{t("search")}</PageTitle>
      <form onSubmit={run} className="row" style={{ marginBottom: 14 }}>
        <input className="input" placeholder={t("members_videos_hashtags")} value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        <button className="btn" type="submit">{t("search")}</button>
      </form>
      <div className="tabs">
        <button className={tab === "members" ? "active" : ""} onClick={() => setTab("members")}>{t("members_count", users.length)}</button>
        <button className={tab === "videos" ? "active" : ""} onClick={() => setTab("videos")}>{t("videos_count", posts.length)}</button>
      </div>
      <div style={{ textAlign: "center", margin: "12px 0 6px", color: "var(--gold)", fontWeight: 700 }}>
        <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#2ECC40", border: "1.5px solid #000", marginRight: 6, verticalAlign: "middle" }} />
        {t("online_now")}:
      </div>
      <div className="tabs" style={{ marginBottom: 14 }}>
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
                  </div>
                </Link>
                <div style={{ display: "grid", gap: 6, flex: "none" }}>
                  <Link to={`/messages/${u.id}`} className="btn small">{t("online_now_message")}</Link>
                  {/* Steve, 2026-11-08: a Live box under Message for every member; green dot +
                      opens their live when they are live now. */}
                  {u.is_live == 1 && u.live_room_name ? (
                    <Link to={`/live/${encodeURIComponent(u.live_room_name)}`} className="btn small">
                      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#2ECC40", border: "1.5px solid #000" }} />
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
      ) : loading ? <Loading text="Searching…" /> : tab === "members" ? (
        <div style={{ display: "grid", gap: 10 }}>
          {users.map((u) => <UserRow key={u.id} user={u} />)}
          {searched && users.length === 0 && <p className="muted">{t("no_members_match")}</p>}
        </div>
      ) : (
        <>
          <div className="grid">{posts.map((p) => <PostCard key={p.id} post={p} />)}</div>
          {searched && posts.length === 0 && <p className="muted">{t("no_videos_match")}</p>}
        </>
      )}
    </div>
  );
}
