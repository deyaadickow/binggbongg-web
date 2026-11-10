// The inbox's sub-tabs, as on the phones (Inbox -> Notification / Messages / Announcements).
// Shown at the top of each of the three pages, so a member can move between them without the
// sidebar — on a phone-width screen the sidebar is folded away.
//
// Each label carries how many are new (Steve, 2026-11-10): "Notifications (3)", "Messages (5)".
// The numbers come from the shared store (lib/inboxCounts, kept fresh by InboxCountsSync), the
// same ones the header's "Inbox (N)" adds up. The tab being shown is marked seen and drawn as 0
// straight away, without waiting for the server. Messages are the conversations whose pointer
// doc has `newMsg: true` — the flag behind the unread dot on the Messages page — and opening the
// Messages tab does not clear them; opening a thread does, as before.
import { useEffect, useSyncExternalStore } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useT } from "../lib/i18n";
import { useSession } from "../lib/session";
import { countSuffix, inboxCountsSnapshot, markTabSeen, subscribeInboxCounts, type InboxSeenTab } from "../lib/inboxCounts";

function activeSeenTab(path: string): InboxSeenTab | null {
  if (path === "/notifications") return "notifications";
  if (path === "/announcements" || path.startsWith("/announcements/")) return "announcements";
  return null;
}

export function InboxTabs() {
  const { t } = useT();
  const { user } = useSession();
  const userId = user?.id ?? 0;
  const { pathname } = useLocation();
  const seenTab = activeSeenTab(pathname);
  const { server, unreadThreads } = useSyncExternalStore(subscribeInboxCounts, inboxCountsSnapshot);

  useEffect(() => {
    if (userId && seenTab) markTabSeen(userId, seenTab);
  }, [userId, seenTab]);

  const shown = (tab: InboxSeenTab) => (tab === seenTab ? 0 : server?.[tab] ?? 0);
  const tabs = [
    { to: "/notifications", label: t("notifications"), n: shown("notifications") },
    { to: "/messages", label: t("messages"), n: unreadThreads ?? 0 },
    { to: "/announcements", label: t("announcements"), n: shown("announcements") },
  ];
  return (
    <nav className="inbox-tabs" aria-label={t("inbox")}>
      {tabs.map((tab) => {
        const suffix = countSuffix(tab.n);
        return (
          <NavLink key={tab.to} to={tab.to} end={tab.to !== "/announcements"} className={({ isActive }) => (isActive ? "on" : "")}>
            <span className="inbox-tab-label">{tab.label}</span>
            {suffix && <bdi className="inbox-tab-count">{" " + suffix}</bdi>}
          </NavLink>
        );
      })}
    </nav>
  );
}
