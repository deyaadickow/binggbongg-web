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
      { to: "/exciting-news", label: "Exciting News", icon: "📣" },
      { to: "/upcoming", label: "L & B", icon: "🗓" },
      { to: "/business", label: "Business", icon: "🏪" },
      { to: "/live", label: "Live Now", icon: "🔴" },
      { to: "/search", label: "Search", icon: "🔍" },
      { to: "/upload", label: "Upload video", icon: "🎬", needsLogin: true },
      { to: "/photos-directory", label: "Photos", icon: "📷", needsLogin: true },
      { to: "/photos", label: "My photos", icon: "🖼️", needsLogin: true },
      { to: "/upload-photos", label: "Upload photos", icon: "⬆️", needsLogin: true },
      { to: "/enter-contest", label: "Enter a contest", icon: "🏆", needsLogin: true },
      { to: "/go-live", label: "Go Live", icon: "📡", needsLogin: true },
    ] },
    { title: "Account", links: [
      { to: userId ? `/profile/${userId}` : "/login", label: "My Profile", icon: "👤", needsLogin: true },
      // Steve, 2026-09-26: "Where is support on the web?" — the 💝 Support button lives on the
      // member's own profile page; this puts Who Supported Me one click away from anywhere too.
      { to: "/support", label: "Who Supported Me", icon: "💝", needsLogin: true },
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
      { to: "/settings/virtual-look", label: "My Virtual Battle Look", icon: "🪞", needsLogin: true },
      { to: "/settings/virtual-battles", label: "My Virtual Battles", icon: "🥊", needsLogin: true },
      { to: "/settings/advertise", label: "Advertise", icon: "📣", needsLogin: true },
      { to: "/settings/printable-ads", label: "Create Your Own Ads", icon: "🖨️", needsLogin: true },
      { to: "/settings/business", label: "Bingg Bongg Business", icon: "💼", needsLogin: true },
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
      { to: "/settings/app-features", label: "App Features Explainer", icon: "📖" },
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
      {sidebarSections(user?.id ?? null).map((sec, i) => {
        const links = sec.links.filter((l) => !l.needsLogin || isLoggedIn);
        // Signed out, every ACCOUNT link is filtered away and the heading was left stranded
        // over nothing — drop a section once it has no links left to show.
        if (links.length === 0) return null;
        return (
          <div key={i} className="side-section">
            {sec.title && <div className="side-title">{sec.title}</div>}
            {links.map((l) => <SideLinkItem key={l.label} link={l} onSignOut={signOut} />)}
          </div>
        );
      })}
      <SiteFooter />
    </aside>
  );
}

/**
 * Who operates this site.
 *
 * Microsoft PhotoDNA, 2026-10-08: "available only to qualified organizations, and we have been
 * unable to verify the information provided." Nothing on binggbongg.com named a company — the
 * About and legal pages were reachable only by digging through Settings, and a stranger landing
 * on the site saw a video feed and two store badges.
 *
 * City and state, no street: the registered office is a home address.
 */
export function SiteFooter() {
  return (
    <div className="site-footer">
      <div>© {new Date().getFullYear()} Bingg Bongg Inc.</div>
      <div>Sterling Heights, Michigan, USA</div>
      <div className="site-footer-links">
        <NavLink to="/settings/about">About</NavLink>
        <NavLink to="/settings/contact">Contact</NavLink>
        <NavLink to="/settings/terms">Terms</NavLink>
        <NavLink to="/settings/privacy">Privacy</NavLink>
      </div>
    </div>
  );
}

export function SideLinkItem({ link, onSignOut, big }: { link: SideLink; onSignOut: () => void; big?: boolean }) {
  const cls = `side-link${big ? " big" : ""}`;
  if (link.action === "signout") return <button className={cls} onClick={onSignOut}><span className="ico">{link.icon}</span>{link.label}</button>;
  if (link.external) return <a className={cls} href={link.to} target="_blank" rel="noreferrer"><span className="ico">{link.icon}</span>{link.label}<span className="ext">↗</span></a>;
  return <NavLink className={({ isActive }) => `${cls}${isActive ? " active" : ""}`} to={link.to} end={link.to === "/"}><span className="ico">{link.icon}</span>{link.label}</NavLink>;
}
