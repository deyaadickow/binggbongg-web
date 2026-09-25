// Steve, 2026-09-24: "add all the settings links on the left side of the screen on chrome…
// even if all the links are not working now we should add them anyway and work it out one at
// a time." Every row of the phones' Settings screen, in the same order, plus the main tabs.
import { NavLink } from "react-router-dom";
import { useSession } from "../lib/session";
import { APP_STORE_URL, PLAY_STORE_URL } from "./Common";

export interface SideLink { to: string; label: string; icon: string; external?: boolean; needsLogin?: boolean; action?: "signout" }
export interface SideSection { title?: string; links: SideLink[] }

export function sidebarSections(userId: number | null): SideSection[] {
  return [
    { links: [
      { to: "/", label: "For You", icon: "🏠" },
      { to: "/live", label: "Live Now", icon: "🔴" },
      { to: "/search", label: "Search", icon: "🔍" },
      { to: "/upload", label: "Upload video", icon: "🎬", needsLogin: true },
      { to: "/photos", label: "My photos", icon: "🖼️", needsLogin: true },
      { to: "/upload-photos", label: "Upload photos", icon: "⬆️", needsLogin: true },
      { to: "/enter-contest", label: "Enter a contest", icon: "🏆", needsLogin: true },
      { to: "/go-live", label: "Go Live", icon: "📡", needsLogin: true },
    ] },
    { title: "Account", links: [
      { to: userId ? `/profile/${userId}` : "/login", label: "My Profile", icon: "👤", needsLogin: true },
      { to: "/settings/account", label: "Account settings", icon: "⚙️", needsLogin: true },
      { to: "/settings/share", label: "Share profile", icon: "🔗", needsLogin: true },
      { to: "/settings/qr", label: "My QR code", icon: "▦", needsLogin: true },
      { to: "/wallet", label: "Wallet", icon: "💰", needsLogin: true },
      { to: "/settings/referrals", label: "Referrals", icon: "🤝", needsLogin: true },
      { to: "/settings/contest-requests", label: "Contest pending requests", icon: "🏆", needsLogin: true },
      { to: "/settings/blocked", label: "Blocked profiles", icon: "🚫", needsLogin: true },
      { to: "/settings/moderators", label: "My Moderators", icon: "🛡️", needsLogin: true },
      { to: "/settings/find-a-battle", label: "Find a Battle", icon: "⚔️", needsLogin: true },
      { to: "/settings/simulcast", label: "Simulcast", icon: "📺", needsLogin: true },
      { to: "/settings/advertise", label: "Advertise", icon: "📣", needsLogin: true },
      { to: "/settings/shop", label: "Bingg Bongg Shop", icon: "🛍️", needsLogin: true },
      { to: "/settings/verification", label: "Request verification", icon: "✅", needsLogin: true },
    ] },
    { title: "General", links: [
      { to: "/settings/language", label: "Change language", icon: "🌐" },
      { to: "/settings/support", label: "Support", icon: "💬" },
      { to: "/settings/terms", label: "Terms of Use", icon: "📄" },
      { to: "/settings/privacy", label: "Privacy Policy", icon: "🔒" },
      { to: "/settings/contact", label: "Contact Us", icon: "✉️" },
      { to: "/settings/about", label: "About Us", icon: "ℹ️" },
      { to: "/settings/faq", label: "FAQ", icon: "❓" },
{ to: "/settings/delete-account", label: "Delete account", icon: "🗑️", needsLogin: true },
      { to: "#signout", label: "Log out", icon: "🚪", needsLogin: true, action: "signout" },
    ] },
    { title: "Get the app", links: [
      { to: APP_STORE_URL, label: "App Store", icon: "", external: true },
      { to: PLAY_STORE_URL, label: "Google Play", icon: "▶", external: true },
    ] },
  ];
}

/** Desktop left column. Hidden under 900px — the same links live on the Settings page then. */
export function Sidebar() {
  const { user, isLoggedIn, signOut } = useSession();
  return (
    <aside className="sidebar">
      {sidebarSections(user?.id ?? null).map((sec, i) => (
        <div key={i} className="side-section">
          {sec.title && <div className="side-title">{sec.title}</div>}
          {sec.links.filter((l) => !l.needsLogin || isLoggedIn).map((l) => <SideLinkItem key={l.label} link={l} onSignOut={signOut} />)}
        </div>
      ))}
    </aside>
  );
}

export function SideLinkItem({ link, onSignOut, big }: { link: SideLink; onSignOut: () => void; big?: boolean }) {
  const cls = `side-link${big ? " big" : ""}`;
  if (link.action === "signout") return <button className={cls} onClick={onSignOut}><span className="ico">{link.icon}</span>{link.label}</button>;
  if (link.external) return <a className={cls} href={link.to} target="_blank" rel="noreferrer"><span className="ico">{link.icon}</span>{link.label}<span className="ext">↗</span></a>;
  return <NavLink className={({ isActive }) => `${cls}${isActive ? " active" : ""}`} to={link.to} end={link.to === "/"}><span className="ico">{link.icon}</span>{link.label}</NavLink>;
}
