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
      post<UserSummary[]>("fetchOnlineNowMembers", { search: keyword.trim(), ...(user ? { user_id: user.id } : {}) })
        .then((r) => { if (alive) setOnline(r.data ?? []); })
        .catch(() => { if (alive) setOnline((o) => o ?? []); });
    };
    const first = setTimeout(load, 350);
    const every = setInterval(load, 30000);
    return () => { alive = false; clearTimeout(first); clearInterval(every); };
  }, [tab, keyword, user?.id]);

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
        <button className={tab === "online" ? "active" : ""} onClick={() => setTab("online")}>{t("online_now")}</button>
        <button className={tab === "members" ? "active" : ""} onClick={() => setTab("members")}>{t("members_count", users.length)}</button>
        <button className={tab === "videos" ? "active" : ""} onClick={() => setTab("videos")}>{t("videos_count", posts.length)}</button>
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
                <Link to={`/messages/${u.id}`} className="btn small">{t("online_now_message")}</Link>
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
