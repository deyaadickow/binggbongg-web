// Steve, 2026-10-11: "Yes please start the direct messages on the web."
//
// The inbox — the same conversations the phones show, read straight out of the member's own
// userchatlist bucket in Firestore. Black and gold, with a rule under each row and the gold
// frame around the list, matching the chat page the phones got the same day.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar, Loading, Notice } from "../components/Common";
import { observeConversations, type DmConversation } from "../lib/dm";
import { useSession } from "../lib/session";
import { useT } from "../lib/i18n";

function whenLabel(ms: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function MessagesPage() {
  const { t } = useT();
  const { user } = useSession();
  const myIdentity = user?.identity ?? "";
  const [rows, setRows] = useState<DmConversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!myIdentity) return;
    let stop: (() => void) | null = null;
    let dead = false;
    void observeConversations(
      myIdentity,
      (r) => { if (!dead) setRows(r); },
      (e) => { if (!dead) setError(e.message || "Couldn't load your messages."); },
    ).then((unsub) => { if (dead) unsub(); else stop = unsub; })
     .catch((e) => { if (!dead) setError(String(e?.message ?? e)); });
    return () => { dead = true; stop?.(); };
  }, [myIdentity]);

  if (!user) return <Notice>{t("sign_in_to_see_your_messages")}</Notice>;
  if (!myIdentity) {
    // Older stored sessions predate `identity` being kept — signing in again fills it in.
    return <Notice error>{t("your_session_is_missing_its_chat_identit")}</Notice>;
  }

  return (
    <div className="page">
      <h2 className="lb-bar title">{t("messages")}</h2>
      {error && <Notice error>{error}</Notice>}
      {rows === null && !error && <Loading />}
      {rows?.length === 0 && <Notice>{t("no_messages_yet_open_a_member_s_profile")}</Notice>}
      {rows && rows.length > 0 && (
        <div className="dm-list">
          {rows.map((c) => (
            <Link key={c.partnerIdentity} to={`/messages/${c.partnerId}`} className="dm-row">
              <Avatar user={{ fullname: c.partnerName, profile_image: c.partnerImage }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="dm-row-name">{c.partnerName || c.partnerUsername || "A member"}</div>
                <div className="dm-row-last">{c.lastMsg}</div>
              </div>
              <div className="dm-row-when">
                {whenLabel(c.time)}
                {c.unread && <span className="dm-unread" aria-label={t("unread")} />}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
