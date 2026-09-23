import { useState } from "react";
import { post, type Post, type UserSummary } from "../lib/api";
import { useSession } from "../lib/session";
import { Loading, Notice, UserRow } from "../components/Common";
import { PostCard } from "../components/PostCard";

export function SearchPage() {
  const { user } = useSession();
  const [keyword, setKeyword] = useState("");
  const [tab, setTab] = useState<"members" | "videos">("members");
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function run(e?: React.FormEvent) {
    e?.preventDefault();
    const q = keyword.trim();
    if (!q) return;
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
      <h1 className="page-title">Search</h1>
      <form onSubmit={run} className="row" style={{ marginBottom: 14 }}>
        <input className="input" placeholder="Members, videos, hashtags…" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        <button className="btn" type="submit">Search</button>
      </form>
      <div className="tabs">
        <button className={tab === "members" ? "active" : ""} onClick={() => setTab("members")}>Members ({users.length})</button>
        <button className={tab === "videos" ? "active" : ""} onClick={() => setTab("videos")}>Videos ({posts.length})</button>
      </div>
      {error && <Notice error>{error}</Notice>}
      {loading ? <Loading text="Searching…" /> : tab === "members" ? (
        <div style={{ display: "grid", gap: 10 }}>
          {users.map((u) => <UserRow key={u.id} user={u} />)}
          {searched && users.length === 0 && <p className="muted">No members match.</p>}
        </div>
      ) : (
        <>
          <div className="grid">{posts.map((p) => <PostCard key={p.id} post={p} />)}</div>
          {searched && posts.length === 0 && <p className="muted">No videos match.</p>}
        </>
      )}
    </div>
  );
}
