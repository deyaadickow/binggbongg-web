import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { post, type LiveStream } from "../lib/api";
import { useSession } from "../lib/session";
import { Avatar, Loading, Notice } from "../components/Common";

export function LiveNowPage() {
  const { user } = useSession();
  const [streams, setStreams] = useState<LiveStream[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Steve, 2026-10-08: "incase i just want to watch my favorite live streamers?" Favourites
  // already sort to the top, but with forty people live that still means scrolling past
  // everyone. Filtered here rather than re-fetched: the server sends is_favourite on every row.
  const [favouritesOnly, setFavouritesOnly] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await post<LiveStream[]>("fetchActiveLiveStreams", { user_id: user?.id ?? 0, connections_only: false });
        if (!alive) return;
        if (!res.status) throw new Error(res.message ?? "Couldn't load who's live.");
        // One card per room — the API lists every broadcaster in a room, host first.
        //
        // But PREFER a favourited broadcaster over the host when both are in the same room.
        // Keeping the host blindly would drop a favourite who is a GUEST in someone else's
        // battle, so the favourites filter below would find nothing while they were plainly
        // live. The room is the same either way; whose name is on the card is not.
        const byRoom = new Map<string, LiveStream>();
        for (const s of res.data ?? []) {
          const held = byRoom.get(s.room_name);
          if (!held || (s.is_favourite && !held.is_favourite)) byRoom.set(s.room_name, s);
        }
        setStreams([...byRoom.values()]);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    }
    load();
    const t = setInterval(load, 10000);
    return () => { alive = false; clearInterval(t); };
  }, [user]);

  const visible = streams === null ? null : favouritesOnly ? streams.filter((s) => s.is_favourite) : streams;

  return (
    <div className="page">
      <div className="row" style={{ alignItems: "center", gap: 12 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Live Now</h1>
        <span style={{ flex: 1 }} />
        {/* Filled when ON. Without that, an empty filtered list looks identical to
            "nobody is live", which is the confusion worth avoiding. */}
        <button
          type="button"
          className={favouritesOnly ? "btn" : "btn ghost"}
          onClick={() => setFavouritesOnly((v) => !v)}
          title="Show only my favourite streamers"
        >
          {favouritesOnly ? "♥ Favourites" : "♡ Favourites"}
        </button>
      </div>
      {error && <Notice error>{error}</Notice>}
      {visible === null ? <Loading /> : visible.length === 0 ? (
        <Notice>
          {favouritesOnly
            ? (streams && streams.some((s) => s.is_favourite)
                ? "None of your favourites are live right now."
                : "None of your favourites are live right now. Open a live stream and tap the heart to add one.")
            : "Nobody is live right now. Check back in a few minutes."}
        </Notice>
      ) : (
        <div className="grid wide">
          {visible.map((s) => (
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
