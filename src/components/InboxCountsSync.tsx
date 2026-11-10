// Keeps the shared inbox counts (lib/inboxCounts) fresh for the signed-in member, for the
// header's "Inbox (N)" pill and the Inbox tabs (Steve, 2026-11-10). Mounted once in App.
//   - server counts: on page load, every time an Inbox page opens, and when the browser tab
//     comes back to the front;
//   - Messages: a live Firestore listener on the member's own inbox bucket, so reading a thread
//     (markConversationRead sets newMsg: false) takes it off straight away.
// Keyed on the user's id / identity, never the user object (it is replaced on every balance refresh).
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useSession } from "../lib/session";
import { observeConversations } from "../lib/dm";
import { refreshInboxCounts, resetInboxCounts, setUnreadThreads } from "../lib/inboxCounts";

const isInboxPath = (p: string) =>
  p === "/notifications" || p === "/messages" || p === "/announcements" || p.startsWith("/announcements/");

export function InboxCountsSync() {
  const { user } = useSession();
  const userId = user?.id ?? 0;
  const myIdentity = user?.identity ?? "";
  const { pathname } = useLocation();
  const inInbox = isInboxPath(pathname);

  useEffect(() => {
    if (!userId) { resetInboxCounts(); return; }
    void refreshInboxCounts(userId);
    const onVisible = () => { if (document.visibilityState === "visible") void refreshInboxCounts(userId); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [userId]);

  // Opening the Inbox (or moving between its tabs) reloads them too.
  useEffect(() => {
    if (userId && inInbox) void refreshInboxCounts(userId);
  }, [userId, inInbox, pathname]);

  useEffect(() => {
    if (!myIdentity) { setUnreadThreads(null); return; }
    let stop: (() => void) | null = null;
    let dead = false;
    void observeConversations(
      myIdentity,
      (rows) => { if (!dead) setUnreadThreads(rows.filter((r) => r.unread).length); },
      () => { if (!dead) setUnreadThreads(null); },
    ).then((unsub) => { if (dead) unsub(); else stop = unsub; })
     .catch(() => { if (!dead) setUnreadThreads(null); });
    return () => { dead = true; stop?.(); };
  }, [myIdentity]);

  return null;
}
