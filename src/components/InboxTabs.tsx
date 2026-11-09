// The inbox's sub-tabs, as on the phones (Inbox -> Notification / Messages / Announcements).
// Shown at the top of each of the three pages, so a member can move between them without the
// sidebar — on a phone-width screen the sidebar is folded away.
import { NavLink } from "react-router-dom";
import { useT } from "../lib/i18n";

export function InboxTabs() {
  const { t } = useT();
  const tabs = [
    { to: "/notifications", label: t("notifications") },
    { to: "/messages", label: t("messages") },
    { to: "/announcements", label: t("announcements") },
  ];
  return (
    <nav className="inbox-tabs" aria-label={t("inbox")}>
      {tabs.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.to !== "/announcements"} className={({ isActive }) => (isActive ? "on" : "")}>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
