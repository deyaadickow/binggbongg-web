import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSession } from "../lib/session";
import {
  fetchUpcomingSchedules, formatScheduleTime, mediaUrl,
  type ScheduleItem, type ScheduleKind,
} from "../lib/api";

/**
 * Everything coming up across the app — Steve's "for all the members to see and maybe they will
 * join", which a profile-only list cannot do on its own: only people already on your profile
 * would ever find your schedule.
 */
export function UpcomingPage() {
  const { user: me } = useSession();
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [filter, setFilter] = useState<ScheduleKind | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        setItems(await fetchUpcomingSchedules(me.id, filter === "all" ? undefined : filter));
      } catch {
        setError("Could not load what's coming up.");
      } finally {
        setLoading(false);
      }
    })();
  }, [me, filter]);

  if (!me) return <div className="notice">Sign in to see what's coming up.</div>;

  return (
    <div className="page">
      <h2>What's on</h2>
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        {(["all", "live", "battle"] as const).map((f) => (
          <button key={f} className={`btn small ${filter === f ? "" : "ghost"}`} onClick={() => setFilter(f)}>
            {f === "all" ? "Everything" : f === "live" ? "Lives" : "Battles"}
          </button>
        ))}
      </div>

      {error && <div className="notice">{error}</div>}

      {loading ? (
        <div className="muted">Loading…</div>
      ) : items.length === 0 ? (
        <div className="muted">Nothing scheduled yet. Be the first — add one on your profile.</div>
      ) : (
        items.map((item) => (
          <Link key={item.id} to={`/profile/${item.user_id}`} className="card schedule-row upcoming-row">
            {item.user?.profile_image ? (
              <img className="upcoming-avatar" src={mediaUrl(item.user.profile_image)} alt="" loading="lazy" />
            ) : (
              <span className="upcoming-avatar upcoming-avatar-blank" aria-hidden />
            )}
            <div>
              <b>{item.user?.fullname ?? "A member"}</b>
              <div className="muted">
                {item.kind === "battle"
                  ? `${item.battle_type ?? "Battle"}${item.opponent?.fullname ? ` vs ${item.opponent.fullname}` : ""}`
                  : "Going live"}
              </div>
              {item.note && <div className="muted">{item.note}</div>}
            </div>
            <span className="spacer" />
            <div className="upcoming-when">{formatScheduleTime(item.starts_at)}</div>
          </Link>
        ))
      )}
    </div>
  );
}
