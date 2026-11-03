import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  isReminded, reminderCount, setScheduleReminder, type ScheduleItem,
} from "../lib/api";
import { useT, tt } from "../lib/i18n";
import { showGoldAlert } from "./GoldToast";

/**
 * "Remind me" on a scheduled live or battle — Steve, 2026-11-03: "a one click button reminder for
 * the person who clicked the reminder button and add it to his account. Then he needs to be
 * reminded a few minutes before the battle".
 *
 * Off: outlined gold "🔔 Remind me". On: filled gold "🔔 Reminder set". The count of members who
 * set one sits beside it once there is at least one. One tap flips it straight away and then asks
 * the server; if the server says no, it flips back and the server's own sentence is shown.
 *
 * The caller decides WHETHER to show it (canRemind: someone else's entry, not started yet). A
 * guest gets the button too, and a tap sends them to sign in, the same as gifting does.
 *
 * `onChange` hands back the entry with the server's figures, so a list can copy them onto the
 * other half of an accepted battle (two rows, one battle_request_id, one shared reminder).
 */
export function RemindButton({ item, myId, onChange }: {
  item: ScheduleItem;
  myId?: number | null;
  onChange?: (updated: ScheduleItem) => void;
}) {
  const { t } = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const on = isReminded(item);
  const count = reminderCount(item);

  async function toggle(e: React.MouseEvent) {
    // The row around it may be a link to the host's profile.
    e.preventDefault();
    e.stopPropagation();
    if (!myId) { navigate("/login", { state: { from: location.pathname + location.search } }); return; }
    if (busy) return;
    const next = !on;
    const before = item;
    onChange?.({ ...item, i_reminded: next, reminder_count: Math.max(0, count + (next ? 1 : -1)) });
    setBusy(true);
    try {
      const res = await setScheduleReminder(myId, item.id, next);
      if (res.status === false) {
        onChange?.(before);
        showGoldAlert(res.message || tt("sr_failed"));
        return;
      }
      const d = res.data;
      if (d) onChange?.({ ...item, i_reminded: !!d.reminded, reminder_count: Number(d.reminder_count) || 0 });
      if (next) firstTimeHint(myId);
    } catch (err) {
      onChange?.(before);
      showGoldAlert(err instanceof Error && err.message ? err.message : tt("sr_failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="remind-wrap">
      <button
        type="button"
        className={`remind-btn${on ? " on" : ""}`}
        aria-pressed={on}
        disabled={busy}
        onClick={(e) => void toggle(e)}
      >
        {on ? t("sr_reminder_set") : t("sr_remind_me")}
      </button>
      {/* i18n-exempt: a bell and a number. */}
      {count > 0 && <span className="remind-count">🔔 {count}</span>}
    </span>
  );
}

/** "N reminded" on your OWN entry, where the button itself is hidden. */
export function RemindedCount({ item }: { item: ScheduleItem }) {
  const { t } = useT();
  const count = reminderCount(item);
  if (count <= 0) return null;
  return <span className="remind-count">{t("sr_n_reminded", count)}</span>;
}

/** "We'll remind you 5 minutes before it starts" — once per member on this browser, not on
 *  every tap: the app's notice is a card with an OK button, which would be a chore every time. */
function firstTimeHint(myId: number) {
  const key = `bb.reminderHint.${myId}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
  } catch { /* private mode: show it, it is harmless */ }
  showGoldAlert(tt("sr_first_on"));
}

/** Copy an updated entry onto every row that is the same battle (or the same row). */
export function applyReminder<T extends ScheduleItem>(rows: T[], updated: ScheduleItem): T[] {
  const pair = updated.battle_request_id;
  return rows.map((r) =>
    r.id === updated.id || (pair != null && Number(r.battle_request_id) === Number(pair))
      ? { ...r, i_reminded: updated.i_reminded, reminder_count: updated.reminder_count }
      : r,
  );
}
