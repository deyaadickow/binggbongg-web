// The people live right now, as tappable cards (Steve, 2026-11-01: the directory's live-room
// features opened an empty page — "we can show the live battles they can click and watch").
// One card per room, like Live Now; refreshed every 15 seconds while the page is open.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { post, type LiveStream } from "../lib/api";
import { useSession } from "../lib/session";
import { useT } from "../lib/i18n";
import { Avatar } from "./Common";
import { PodcastBadge, isPodcastRoom } from "./PodcastBits";

export function LiveRoomsList() {
  const { t } = useT();
  const { user, isLoggedIn } = useSession();
  const [rooms, setRooms] = useState<LiveStream[] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => post<LiveStream[]>("fetchActiveLiveStreams", { user_id: user?.id ?? 0, connections_only: false })
      .then((res) => {
        if (!alive) return;
        const byRoom = new Map<string, LiveStream>();
        for (const s of res.status ? res.data ?? [] : []) if (!byRoom.has(s.room_name)) byRoom.set(s.room_name, s);
        setRooms([...byRoom.values()]);
      })
      .catch(() => { if (alive) setRooms([]); });
    load();
    const timer = setInterval(load, 15000);
    return () => { alive = false; clearInterval(timer); };
  }, [user?.id]);

  if (rooms === null) return null;
  if (rooms.length === 0) {
    return (
      <div className="card pad" style={{ borderColor: "var(--gold-border)", textAlign: "center", display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
        <span className="muted">{t("fx_nobody_live")}</span>
        <Link to={isLoggedIn ? "/go-live" : "/login"} className="btn">{t("fx_go_live")}</Link>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rooms.map((s) => (
        <Link key={s.room_name} to={`/live/${encodeURIComponent(s.room_name)}`} className="card row" style={{ padding: 12, gap: 10, alignItems: "center", color: "inherit" }}>
          <Avatar user={{ id: s.host_user_id, username: s.host_username, fullname: s.host_fullname, profile_image: s.host_profile_image }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <b>{s.host_fullname || s.host_username}</b>
            {s.host_username && <div className="muted" style={{ fontSize: 13 }}>@{s.host_username}</div>}
            {isPodcastRoom(s) && <div style={{ marginTop: 4 }}><PodcastBadge title={s.podcast_title} /></div>}
          </div>
          <span className="pill" style={{ borderColor: "#E53935", color: "#ff6b6b" }}>● LIVE</span>
        </Link>
      ))}
    </div>
  );
}
