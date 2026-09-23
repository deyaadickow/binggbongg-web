import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { post, type LiveStream } from "../lib/api";
import { useSession } from "../lib/session";
import { Avatar, Loading, Notice } from "../components/Common";

export function LiveNowPage() {
  const { user } = useSession();
  const [streams, setStreams] = useState<LiveStream[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await post<LiveStream[]>("fetchActiveLiveStreams", { user_id: user?.id ?? 0, connections_only: false });
        if (!alive) return;
        if (!res.status) throw new Error(res.message ?? "Couldn't load who's live.");
        // One card per room (the API lists every broadcaster in a room; the host is first).
        const seen = new Set<string>();
        setStreams((res.data ?? []).filter((s) => (seen.has(s.room_name) ? false : (seen.add(s.room_name), true))));
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    }
    load();
    const t = setInterval(load, 10000);
    return () => { alive = false; clearInterval(t); };
  }, [user]);

  return (
    <div className="page">
      <h1 className="page-title">Live Now</h1>
      {error && <Notice error>{error}</Notice>}
      {streams === null ? <Loading /> : streams.length === 0 ? (
        <Notice>Nobody is live right now. Check back in a few minutes.</Notice>
      ) : (
        <div className="grid wide">
          {streams.map((s) => (
            <Link key={s.room_name} to={`/live/${encodeURIComponent(s.room_name)}`} className="card row" style={{ padding: 14, color: "inherit" }}>
              <Avatar user={{ fullname: s.host_fullname, username: s.host_username, profile_image: s.host_profile_image }} size="lg" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{s.host_fullname || s.host_username || "Member"}</div>
                <div className="muted" style={{ fontSize: 13 }}>@{s.host_username ?? ""}</div>
                <div style={{ marginTop: 6 }}><span className="pill live">● LIVE</span></div>
              </div>
              <span className="btn small">Watch</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
