// Notifications (Steve, 2026-10-18): "Add the notification record so members can read it later."
//
// The phones have had this list for a long time; the web never did, so a member who lives on the
// web had no way to read anything the app told them. Same endpoint the apps use
// (fetchUserNotification -> tbl_user_notification), same six types.
//
// Type 5 is the app's own notice — a gig approved or turned down, a battle invitation, a show
// renewal, an account notice. Those rows are written with the member as both sender and receiver,
// because the endpoint eager-loads the sender and reads is_following off it, so it cannot be
// null. Left alone that would show a member their own face and name telling them the app's news,
// so a type 5 row is drawn as being from Bingg Bongg and nothing links to a profile.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { displayName, post, type UserSummary } from "../lib/api";
import { useSession } from "../lib/session";
import { Avatar, Loading, Notice } from "../components/Common";
import { useT } from "../lib/i18n";
import { PageTitle } from "../components/PageTitle";

interface NotificationRow {
  id: number;
  type: number;
  message?: string | null;
  item_id?: number | null;
  created_at?: string | null;
  sender?: UserSummary | null;
}

const PAGE = 30;

/** The badge on the right, matching the phones' own icon per type. */
function TypeBadge({ type }: { type: number }) {
  const icon =
    type === 1 ? "♥" :
    type === 2 ? "👤" :
    type === 3 ? "🎁" :
    type === 4 ? "💬" :
    type === 6 ? "⚔" :
    "🔔";
  return <span style={{ fontSize: 20, lineHeight: 1, opacity: 0.9 }} aria-hidden>{icon}</span>;
}

/** When it happened, in the shape the rest of the site writes dates. */
function When({ at }: { at?: string | null }) {
  if (!at) return null;
  const d = new Date(at.replace(" ", "T") + (at.endsWith("Z") ? "" : "Z"));
  if (Number.isNaN(d.getTime())) return null;
  return (
    <span className="muted" style={{ fontSize: 12 }}>
      {d.toLocaleDateString(undefined, { day: "numeric", month: "short" })} · {d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
    </span>
  );
}

function Row({ row }: { row: NotificationRow }) {
  const isAppNotice = row.type === 5;
  const who = isAppNotice ? "Bingg Bongg" : displayName(row.sender ?? undefined);

  const body = (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      {isAppNotice
        ? <div style={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center",
                        background: "#000", border: "1.5px solid var(--gold-border)", fontSize: 20 }} aria-hidden>🔔</div>
        : <Avatar user={row.sender ?? undefined} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <strong style={{ color: "var(--gold)", fontSize: 15 }}>{who}</strong>
          <When at={row.created_at} />
        </div>
        {/* The whole message, not a clipped line — the point of keeping a record is being able
            to read it. */}
        <p style={{ margin: "4px 0 0", color: "var(--gold)", fontSize: 14, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {row.message ?? ""}
        </p>
      </div>
      <TypeBadge type={row.type} />
    </div>
  );

  const card = (
    <div className="card pad" style={{ borderColor: "var(--gold-border)", marginBottom: 10 }}>{body}</div>
  );

  // An app notice has nowhere to go; everything else leads to whoever sent it.
  if (isAppNotice || !row.sender?.id) return card;
  return <Link to={`/profile/${row.sender.id}`} style={{ textDecoration: "none", display: "block" }}>{card}</Link>;
}

export function NotificationsPage() {
  const { t } = useT();
  const { user, isLoggedIn } = useSession();
  // user?.id, never `user` — the session object is replaced on every refresh (a gift, a wallet
  // change), and an effect keyed on the object re-runs and re-fetches the whole list each time.
  const userId = user?.id ?? 0;
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  // Guards a second page firing while the first is still in flight — the button is disabled,
  // but a fast double click would otherwise request the same offset twice.
  const busy = useRef(false);

  const load = useCallback(async (start: number) => {
    if (!userId || busy.current) return;
    busy.current = true;
    try {
      const res = await post<NotificationRow[]>("fetchUserNotification", { user_id: userId, start, count: PAGE });
      const batch = (res.data ?? []) as NotificationRow[];
      setRows((prev) => (start === 0 ? batch : [...prev, ...batch]));
      setDone(batch.length < PAGE);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your notifications.");
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { if (userId) { setLoading(true); load(0); } }, [userId, load]);

  if (!isLoggedIn) {
    return <div className="page"><p className="soft">{t("please_sign_in_to_see_your_notifications")}</p></div>;
  }

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <PageTitle>{t("notifications")}</PageTitle>
      {error && <Notice error>{error}</Notice>}
      {loading && rows.length === 0 && <Loading />}
      {!loading && rows.length === 0 && !error && (
        <p className="soft">{t("nothing_yet_anything_bingg_bongg_tells_y")}</p>
      )}
      {rows.map((row) => <Row key={row.id} row={row} />)}
      {!done && rows.length > 0 && (
        <button className="btn" style={{ marginTop: 6 }} disabled={busy.current}
                onClick={() => load(rows.length)}>{t("show_more")}</button>
      )}
    </div>
  );
}
