import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  apiTrue, displayName, fetchMyScheduleReminders, formatScheduleTime, mediaUrl, type ReminderItem,
} from "../lib/api";
import { useSession } from "../lib/session";
import { Avatar, Notice } from "../components/Common";
import { PageTitle } from "../components/PageTitle";
import { RemindButton, applyReminder } from "../components/ScheduleReminder";
import { useT } from "../lib/i18n";

/**
 * My Reminders — Steve, 2026-11-03: "add it to his account".
 *
 * Every scheduled live or battle this member pressed 🔔 Remind me on, soonest first, from the
 * server (fetchMyScheduleReminders), so the list is the same one the phones show. The web has no
 * push, so this page is where a web member sees what they asked to be reminded of.
 *
 * A row opens the host's live room when the host is live right now, otherwise the host's profile.
 * Switching one off leaves the row on the page (showing "Remind me" again) so a slip of the finger
 * can be undone; it is gone the next time the page opens.
 */
export function MyRemindersPage() {
  const { t, tn } = useT();
  const { user: me } = useSession();
  const [items, setItems] = useState<ReminderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const myId = me?.id;

  useEffect(() => {
    if (!myId) return;
    let live = true;
    setLoading(true);
    setError(false);
    fetchMyScheduleReminders(myId)
      .then((rows) => { if (live) setItems(rows); })
      .catch(() => { if (live) setError(true); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [myId]);

  if (!myId) {
    return <div className="page"><Notice>{tn("sign_in_to_open_this_page", <Link to="/login">{t("sign_in")}</Link>)}</Notice></div>;
  }

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <PageTitle>{t("sr_my_reminders")}</PageTitle>
      {error && <div className="lb-bar">{t("sr_could_not_load")}</div>}
      {loading ? (
        <div className="lb-bar">{t("imagePickerLoading")}</div>
      ) : !error && items.length === 0 ? (
        <div className="lb-bar">{t("sr_empty")}</div>
      ) : (
        items.map((item) => {
          const host = item.host;
          const hostId = host?.id ?? item.user_id;
          const isLive = apiTrue(host?.is_live);
          const to = isLive && host?.room_name
            ? `/live/${encodeURIComponent(host.room_name)}`
            : `/profile/${hostId}`;
          const name = host
            ? (host.fullname?.trim() || host.username?.trim() || displayName(item.user))
            : displayName(item.user);
          const picture = host?.profile_image_url || mediaUrl(host?.profile_image ?? item.user?.profile_image);
          return (
            <div key={item.id} className="card upcoming-card reminder-row">
              <Link to={to} className="reminder-link">
                {picture ? (
                  <img className="upcoming-avatar" src={picture} alt="" loading="lazy" />
                ) : (
                  <Avatar user={item.user} />
                )}
                <div className="reminder-text">
                  <b>{name}</b>
                  <div className="reminder-meta">
                    <span className="reminder-kind">
                      {item.kind === "battle"
                        ? `${t("sr_kind_battle")}${item.battle_type ? ` · ${item.battle_type}` : ""}`
                        : t("sr_kind_live")}
                    </span>
                    {isLive && <span className="live-now-pill">{t("sr_live_now")}</span>}
                  </div>
                  <div className="upcoming-when reminder-when">{formatScheduleTime(item.starts_at)}</div>
                </div>
              </Link>
              <div className="upcoming-remind">
                <RemindButton item={item} myId={myId} onChange={(u) => setItems((rows) => applyReminder(rows, u))} />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
