import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSession } from "../lib/session";
import { ScheduleSection } from "../components/ScheduleSection";
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
  const navigate = useNavigate();
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [filter, setFilter] = useState<ScheduleKind | "all">("all");
  const [loading, setLoading] = useState(true);
  /** The scheduler, opened in place rather than sending anyone to their profile. */
  const [showMine, setShowMine] = useState(false);
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
    <div className="page cosmic-page">
      <div className="cosmic-head">
        <button className="back-circle" onClick={() => navigate(-1)} aria-label="Back">‹</button>
        {/* Steve, 2026-10-07: the chip is "L & B"; the page it opens is headed with his own
            wording. */}
        <h2 className="lb-bar title">Scheduled Lives and Battles</h2>
      </div>
      {/* Steve, 2026-10-07: "Everything is still sitting in my profile." A button that bounced
          him to his profile was barely better than telling him to go there — the scheduler itself
          now opens HERE, on the page he is already looking at. */}
      <button className="btn wide" style={{ marginBottom: 10 }} onClick={() => setShowMine((v) => !v)}>
        {showMine ? "Hide my schedule" : "+ Schedule a Live or Battle"}
      </button>
      {showMine && <ScheduleSection profileId={me.id} myId={me.id} />}

      <div className="lb-tabs">
        {(["all", "live", "battle"] as const).map((f) => (
          <button key={f} className={`btn small ${filter === f ? "" : "ghost"}`} onClick={() => setFilter(f)}>
            {f === "all" ? "Everything" : f === "live" ? "Lives" : "Battles"}
          </button>
        ))}
      </div>

      {error && <div className="notice">{error}</div>}

      {loading ? (
        <div className="lb-bar">Loading…</div>
      ) : items.length === 0 ? (
        <div className="lb-bar">Nothing scheduled yet. Be the first — add one on your profile.</div>
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
