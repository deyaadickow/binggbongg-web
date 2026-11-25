// Steve, 2026-09-24: "add all the settings links on the left side of the screen on chrome…
// even if all the links are not working now we should add them anyway and work it out one at
// a time." Every row of the phones' Settings screen, in the same order, plus the main tabs.
import { Fragment, useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useSession } from "../lib/session";
import { post } from "../lib/api";
import { APP_STORE_URL, PLAY_STORE_URL } from "./Common";
import { useT, type StringKey } from "../lib/i18n";
import { useContestOn } from "../lib/contests";
import { usePodcastEnabled } from "../lib/podcast";

// `label` is a translation KEY, not text. sidebarSections() is a plain function with no hook,
// so the data carries the key and the view translates it; typing it as StringKey means a
// consumer that forgets to translate is a compile error rather than an English label.
export interface SideLink { to: string; label: StringKey; icon: string; external?: boolean; needsLogin?: boolean; action?: "signout" }
export interface SideSection { title?: StringKey; links: SideLink[] }

/** `contestOn`: whether any contest is switched on (see useContestOn) — "Enter a contest" only shows then. */
/** `podcastOn`: the Bingg Bongg Podcast switch (podcast_enabled) — its two entries only show then. */
export function sidebarSections(userId: number | null, contestOn = false, podcastOn = false): SideSection[] {
  return [
    { links: [
      { to: "/", label: "for_you", icon: "🏠" },
      { to: "/exciting-news", label: "exciting_news", icon: "📣" },
      { to: "/upcoming", label: "l_and_b", icon: "🗓" },
      { to: "/business", label: "business", icon: "🏪" },
      { to: "/live", label: "live_now", icon: "🔴" },
      // Steve, 2026-11-23: "one button for all country battles and one button for Country VS Country" —
      // these two replace the old "Country Battle" link and the "Join the … whole country battle Now" box.
      { to: "/country-battles", label: "acb_tab", icon: "🌏" },
      // Country VS Country — off 2026-11-24, back 2026-11-25 with Philippines vs Indonesia the only pair.
      { to: "/country-vs-country", label: "acb_filter_vs", icon: "⚔️" },
      // Your own live Bingg Bongg show (Steve, 2026-10-17).
      { to: "/shows", label: "shows", icon: "📺" },
      // Video Ad Gig (Steve, 2026-10-17) RETIRED 2026-11-17 (Steve: "we can eliminate our influencers
      // ads jobs and we can just do ours" — Bingg Bongg Video Ad replaces it). The pages stay, unlinked.
      // { to: "/gigs", label: "video_ad_gig", icon: "🎥" },
      // Steve, 2026-10-18: "add a tab on main feed for 'Go live on 6 platforms' and when tapped
      // link them right to that page on their settings." The phones put a chip on the feed; the
      // web's feed-level navigation is this list, so it goes here — pointing at the same
      // Simulcast page that already sits under Account.
      { to: "/settings/simulcast", label: "go_live_on_6_platforms", icon: "📡", needsLogin: true },
      // Finding videos (Steve, 2026-11-16): trending hashtags, sounds, topics and creators.
      { to: "/discover", label: "fnd_discover", icon: "🧭" },
      // Steve, 2026-10-11: "Yes please start the direct messages on the web."
      { to: "/messages", label: "messages", icon: "💬", needsLogin: true },
      // Steve, 2026-10-18: "Add the notification record so members can read it later."
      { to: "/notifications", label: "notifications", icon: "🔔", needsLogin: true },
      // Steve, 2026-11-09: the daily video announcement, in English and Tagalog.
      { to: "/announcements", label: "announcements", icon: "📢", needsLogin: true },
      { to: "/upload", label: "upload_video", icon: "🎬", needsLogin: true },
      // Steve, 2026-11-16: the editor, Text posts and Photo slideshows.
      { to: "/editor", label: "ed_title", icon: "🎞️", needsLogin: true },
      { to: "/text-post", label: "tp_title", icon: "🔤", needsLogin: true },
      { to: "/slideshow", label: "ss_title", icon: "🖼️", needsLogin: true },
      // Bingg Bongg Song (Steve, 2026-11-16).
      { to: "/bingg-bongg-song", label: "song_title", icon: "🎵" },
      // Bingg Bongg Video Ad (Steve, 2026-11-17).
      { to: "/bingg-bongg-video-ad", label: "vad_title", icon: "🎬" },
      { to: "/photos-directory", label: "photos", icon: "📷", needsLogin: true },
      { to: "/photos", label: "my_photos", icon: "🖼️", needsLogin: true },
      // Steve, 2026-10-18: "Add photo style tab on main feed". Next to Photos, because every
      // style files its result into the member's own photo folders.
      { to: "/cartoon", label: "photo_styles", icon: "✨", needsLogin: true },
      { to: "/upload-photos", label: "upload_photos", icon: "⬆️", needsLogin: true },
      ...(contestOn ? [{ to: "/enter-contest", label: "enter_a_contest", icon: "🏆", needsLogin: true } as SideLink] : []),
      { to: "/go-live", label: "go_live", icon: "📡", needsLogin: true },
      // Bingg Bongg Podcast (Steve, 2026-11-10): Start a Podcast sits next to Go Live.
      ...(podcastOn ? [
        { to: "/podcasts/start", label: "pod_start_short", icon: "🎙", needsLogin: true } as SideLink,
        { to: "/podcasts", label: "pod_title_short", icon: "🎧" } as SideLink,
      ] : []),
      { to: "/my-show", label: "my_show", icon: "🎙", needsLogin: true },
      // Video Ad Gig retired 2026-11-17 (see above): { to: "/my-gigs", label: "gig_my_gigs", icon: "🎬", needsLogin: true },
      // Lucky numbers + daily horoscope (Steve, 2026-10-09) — the feed-level door, matching
      // the Home chip on the phones. There is a second one under Account, matching their
      // Settings row; Steve asked for both.
      { to: "/lucky", label: "lucky_numbers", icon: "🔮", needsLogin: true },
      // Steve, 2026-10-18: "add a tab for 'App Features' next to the end on main feed as well."
      // Last entry in the main list, matching where the chip sits on the phones.
      { to: "/features", label: "everything_bingg_bongg_does", icon: "✨" },
      { to: "/settings/app-features", label: "app_features", icon: "📖" },
    ] },
    { title: "account", links: [
      { to: userId ? `/profile/${userId}` : "/login", label: "my_profile", icon: "👤", needsLogin: true },
      // "Remind me" (Steve, 2026-11-03: "add it to his account"). Right under My Profile, because
      // that is where the web keeps My Live/Battle Schedule.
      { to: "/settings/reminders", label: "sr_my_reminders", icon: "⏰", needsLogin: true },
      // Steve, 2026-09-26: "Where is support on the web?" — the 💝 Support button lives on the
      // member's own profile page; this puts Who Supported Me one click away from anywhere too.
      { to: "/support", label: "who_supported_me", icon: "💝", needsLogin: true },
      // Creators and money (Steve, 2026-11-17).
      { to: "/subscriptions", label: "cm_subscriptions", icon: "💎", needsLogin: true },
      { to: "/series", label: "cm_my_series", icon: "🎬", needsLogin: true },
      { to: "/scheduled", label: "cm_scheduled_posts", icon: "🗓", needsLogin: true },
      { to: "/settings/account", label: "account_settings", icon: "⚙️", needsLogin: true },
      { to: "/settings/share", label: "share_profile", icon: "🔗", needsLogin: true },
      { to: "/settings/qr", label: "my_qr_code", icon: "▦", needsLogin: true },
      { to: "/wallet", label: "wallet", icon: "💰", needsLogin: true },
      { to: "/settings/referrals", label: "referrals", icon: "🤝", needsLogin: true },
      { to: "/settings/contest-requests", label: "contest_pending_requests", icon: "🏆", needsLogin: true },
      { to: "/settings/blocked", label: "blocked_profiles", icon: "🚫", needsLogin: true },
      // Finding videos (Steve, 2026-11-16): words that keep videos out of your feeds.
      { to: "/settings/filter-keywords", label: "fnd_filter_keywords", icon: "🚷", needsLogin: true },
      // Safety and wellbeing (Steve, 2026-11-17).
      { to: "/settings/screen-time", label: "wb_screen_time", icon: "⏳", needsLogin: true },
      { to: "/settings/family-pairing", label: "wb_family_pairing", icon: "👨‍👧", needsLogin: true },
      { to: "/settings/restricted-mode", label: "wb_restricted_mode", icon: "🛡️", needsLogin: true },
      // Steve, 2026-11-09: the on/off switch for messages from members, plus who is stopped.
      { to: "/settings/messages", label: "dm_settings_title", icon: "✉️", needsLogin: true },
      { to: "/settings/moderators", label: "my_moderators", icon: "🛡️", needsLogin: true },
      { to: "/settings/find-a-battle", label: "find_a_battle", icon: "⚔️", needsLogin: true },
      { to: "/settings/simulcast", label: "simulcast", icon: "📺", needsLogin: true },
      { to: "/settings/virtual-look", label: "my_virtual_battle_look", icon: "🪞", needsLogin: true },
      { to: "/settings/virtual-battles", label: "my_virtual_battles", icon: "🥊", needsLogin: true },
      { to: "/settings/advertise", label: "advertise", icon: "📣", needsLogin: true },
      { to: "/settings/printable-ads", label: "ads_you_can_print", icon: "🖨️", needsLogin: true },
      { to: "/settings/business", label: "bingg_bongg_business", icon: "💼", needsLogin: true },
      { to: "/settings/shop", label: "bingg_bongg_shop", icon: "🛍️", needsLogin: true },
      { to: "/lucky", label: "lucky_numbers_horoscope", icon: "🔮", needsLogin: true },
      { to: "/settings/verification", label: "request_verification", icon: "✅", needsLogin: true },
      // Help (Steve, 2026-10-24): "remove it from there and add it to the account section."
      // No needsLogin — the Help list is public, and the page itself decides whether this
      // member may ASK, from the server's own blocked_reason.
      { to: "/help", label: "help_title", icon: "🤝" },
      // Password Protected Page (Steve, 2026-10-24). Optional — it does nothing until a member
      // sets a passcode, and the page itself explains that nobody can recover it.
      { to: "/settings/vault", label: "vault_title", icon: "🔐", needsLogin: true },
    ] },
    { title: "general", links: [
      { to: "/settings/language", label: "change_language", icon: "🌐" },
      // Steve, 2026-10-19: "In settings. Add a notepad for everyone."
      { to: "/settings/todo", label: "to_do_list", icon: "📝", needsLogin: true },
      { to: "/settings/support", label: "customer_support", icon: "💬" },
      { to: "/settings/terms", label: "terms_of_use", icon: "📄" },
      { to: "/settings/privacy", label: "privacy_policy", icon: "🔒" },
      { to: "/settings/contact", label: "contact_us", icon: "✉️" },
      { to: "/settings/about", label: "about_us", icon: "ℹ️" },
      { to: "/settings/safety", label: "safety_center", icon: "🛡️" },
      { to: "/settings/app-features", label: "app_features_explainer", icon: "📖" },
      { to: "/settings/faq", label: "faq", icon: "❓" },
{ to: "/settings/delete-account", label: "delete_account", icon: "🗑️", needsLogin: true },
      { to: "#signout", label: "log_out", icon: "🚪", needsLogin: true, action: "signout" },
    ] },
    { title: "get_the_app", links: [
      { to: APP_STORE_URL, label: "app_store", icon: "", external: true },
      { to: PLAY_STORE_URL, label: "google_play", icon: "▶", external: true },
    ] },
  ];
}

/** Desktop left column. Hidden under 900px — the same links live on the Settings page then. */
export function Sidebar() {
  const { t } = useT();
  const { user, isLoggedIn, signOut } = useSession();
  const contestOn = useContestOn();
  const podcastOn = usePodcastEnabled();
  const order = useSidebarOrder(user?.id ?? 0);
  return (
    <aside className="sidebar">
      <SidebarSearch />
      {sidebarSections(user?.id ?? null, contestOn, podcastOn).map((sec, i) => {
        const shown = sec.links.filter((l) => !l.needsLogin || isLoggedIn);
        // Signed out, every ACCOUNT link is filtered away and the heading was left stranded
        // over nothing — drop a section once it has no links left to show.
        if (shown.length === 0) return null;
        // The main list is in the member's own dragged order; the store badges stay put.
        const draggable = i === 0;
        const links = draggable ? applySidebarOrder(shown, order.items) : shown;
        return (
          <div key={i} className="side-section">
            {sec.title && <div className="side-title">{t(sec.title)}</div>}
            {links.map((l) => {
              const item = <SideLinkItem link={l} onSignOut={signOut} />;
              if (!draggable) return <Fragment key={l.label}>{item}</Fragment>;
              return (
                <div key={l.label} className={`side-drag${order.dragging === l.to ? " dragging" : ""}${order.over === l.to ? " over" : ""}`}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", l.to); order.start(l.to); }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; order.hover(l.to); }}
                  onDrop={(e) => { e.preventDefault(); order.drop(links.map((x) => x.to), l.to); }}
                  onDragEnd={order.end}>
                  {item}
                </div>
              );
            })}
          </div>
        );
      })}
      <SiteFooter />
    </aside>
  );
}

const SIDEBAR_ORDER_KEY = "bb_sidebar_order";

/** The links in the member's saved order; links not in it (new ones) keep their place at the end. */
function applySidebarOrder(links: SideLink[], items: string[]): SideLink[] {
  if (!items.length) return links;
  // The old "Country Battle" link became All Country Battles + Country VS Country (2026-11-23): a saved
  // order keeps the two new buttons where the old one was.
  const old = items.indexOf("/country-battle");
  if (old >= 0 && !items.includes("/country-battles")) items = [...items.slice(0, old), "/country-battles", "/country-vs-country", ...items.slice(old + 1)];
  const rank = new Map(items.map((p, i) => [p, i]));
  return links
    .map((l, i) => ({ l, i }))
    .sort((a, b) => (rank.get(a.l.to) ?? items.length + a.i) - (rank.get(b.l.to) ?? items.length + b.i))
    .map((x) => x.l);
}

/**
 * Steve, 2026-11-22: "Please make the side bar draggable on the website, every member will drag
 * their own website." — each member drags the sidebar rows into their own order. Signed in it is
 * kept on the server (it follows them to any computer); this browser keeps a copy so the sidebar
 * shows their order at once, and signed out the copy is all there is.
 */
function useSidebarOrder(userId: number) {
  const [items, setItems] = useState<string[]>(() => {
    try { const v = JSON.parse(localStorage.getItem(SIDEBAR_ORDER_KEY) || "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; }
  });
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const draggingRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    post<{ items?: string[] }>("fetchMySidebarOrder", { my_user_id: userId }).then((r) => {
      if (!alive || !r.status) return;
      const v = Array.isArray(r.data?.items) ? r.data!.items!.filter((x) => typeof x === "string") : [];
      setItems(v);
      try { localStorage.setItem(SIDEBAR_ORDER_KEY, JSON.stringify(v)); } catch { /* private mode */ }
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [userId]);

  const end = () => { draggingRef.current = null; setDragging(null); setOver(null); };
  return {
    items, dragging, over, end,
    start: (to: string) => { draggingRef.current = to; setDragging(to); },
    hover: (to: string) => { if (draggingRef.current && over !== to) setOver(to); },
    /** Drop the dragged row onto [target]'s place; [current] is the order on screen right now. */
    drop: (current: string[], target: string) => {
      const from = draggingRef.current;
      end();
      if (!from || from === target) return;
      const next = current.filter((p) => p !== from);
      const at = next.indexOf(target);
      // Dragging down lands after the target, dragging up lands before it.
      next.splice(current.indexOf(from) < current.indexOf(target) ? at + 1 : at, 0, from);
      setItems(next);
      try { localStorage.setItem(SIDEBAR_ORDER_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      if (userId) post("saveMySidebarOrder", { my_user_id: userId, items: next }).catch(() => undefined);
    },
  };
}

/** Search box on top of the sidebar (Steve, 2026-11-21: "On the website sidebar please add search
 *  on top."). Enter opens the Search page with what was typed; empty opens it as it is. */
function SidebarSearch() {
  const { t } = useT();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  return (
    <form className="side-search" role="search" onSubmit={(e) => {
      e.preventDefault();
      const k = q.trim();
      navigate(k ? `/search?q=${encodeURIComponent(k)}` : "/search");
    }}>
      <span className="ico" aria-hidden>🔍</span>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} />
    </form>
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
  const { t } = useT();
  return (
    <div className="site-footer">
      {/* i18n-exempt: a legal entity name and a year. */}
      <div>© {new Date().getFullYear()} Bingg Bongg Inc.</div>
      {/* i18n-exempt: a postal address is not translated. */}
      <div>Sterling Heights, Michigan, USA</div>
      <div className="site-footer-links">
        <NavLink to="/settings/about">{t("about")}</NavLink>
        <NavLink to="/settings/safety">{t("safety_center")}</NavLink>
        <NavLink to="/settings/contact">{t("contact")}</NavLink>
        <NavLink to="/settings/terms">{t("terms")}</NavLink>
        <NavLink to="/settings/privacy">{t("privacy")}</NavLink>
      </div>
    </div>
  );
}

export function SideLinkItem({ link, onSignOut, big }: { link: SideLink; onSignOut: () => void; big?: boolean }) {
  const { t } = useT();
  const cls = `side-link${big ? " big" : ""}`;
  if (link.action === "signout") return <button className={cls} onClick={onSignOut}><span className="ico">{link.icon}</span>{t(link.label)}</button>;
  if (link.external) return <a className={cls} href={link.to} target="_blank" rel="noreferrer"><span className="ico">{link.icon}</span>{t(link.label)}<span className="ext">↗</span></a>;
  return <NavLink className={({ isActive }) => `${cls}${isActive ? " active" : ""}`} to={link.to} end={link.to === "/"}><span className="ico">{link.icon}</span>{t(link.label)}</NavLink>;
}
