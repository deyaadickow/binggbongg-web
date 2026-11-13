import { NavLink, Link } from "react-router-dom";
import { useSession } from "../lib/session";
import { Avatar } from "./Common";
import { useT } from "../lib/i18n";
import { useSyncExternalStore } from "react";
import { countSuffix, inboxCountsSnapshot, inboxTotal, subscribeInboxCounts } from "../lib/inboxCounts";

export function Nav() {
  const { t } = useT();
  // The shop and CvC switch checks lived here to decide whether to show their links. Both links
  // moved into the directory, which does its own gating, so these were two API calls firing on
  // every page load to decide nothing. Removed with them.
  const { user, isLoggedIn, signOut } = useSession();
  const inboxSuffix = countSuffix(inboxTotal(useSyncExternalStore(subscribeInboxCounts, inboxCountsSnapshot)));
  return (
    <header className="nav">
      {/* Steve, 2026-10-20: "We need to add the logo to the web." The site had the mark in
          exactly two places — the tab icon and the feed's hold menu — and said its own name in
          plain bold text at the top of every page. The rectangle logo IS the wordmark, so it
          does the same job and carries the look the phones have.
          i18n-exempt: the brand name is the same in every language, and the alt text is the
          name, not a sentence. */}
      <Link to="/" className="brand" aria-label="Bingg Bongg">
        <img src="/logo_horizontal.png" alt="Bingg Bongg" />
      </Link>
      <nav className="links">
        {/* Steve, 2026-10-18: "only leave, For you, Exciting News, and Everything Bingg Bongg
            Does" — the phones' chip row cut to the same three, and the web's top nav matches.
            Everything that used to live here is in the directory, which can show fifty-six
            things without burying any of them.

            Settings keeps its narrow-screen link: it is not a feed destination, it is how a
            member reaches their own account when the sidebar is off screen. */}
        {/* Steve, 2026-10-25: Contests and Exciting News are directory tiles #1 and #2 now —
            only For You and the directory stay up here, centred like the phones. */}
        <NavLink to="/" end>{t("for_you")}</NavLink>
        <NavLink to="/features">{t("everything_bingg_bongg_does")}</NavLink>
        {/* Steve, 2026-11-05: "Next to 'For You Page' and 'Bingg Bongg features' on main feed page
            please add '70+ Featured Videos'" — the existing Features Videos page and its player
            with the language buttons. */}
        <NavLink to="/feature-videos">{t("featured_videos_tab")}</NavLink>
        {/* Steve, 2026-11-12: "Next to 70+ Featured Videos create 'Our Ads' button". */}
        <NavLink to="/our-ads">{t("our_ads_tab")}</NavLink>
        <NavLink to="/settings" className="only-narrow">{t("settings")}</NavLink>
      </nav>
      <div className="me">
        {isLoggedIn && user ? (
          <>
            {/* Steve, 2026-11-10: "Also please add the total messages on the bottom 'Inbox (5)'".
                The web has no bottom bar and no single Inbox entry, so it sits up here, where it
                stays in view at every width. Opens on Notifications, the Inbox's first tab. */}
            <NavLink to="/notifications" className={({ isActive }) => "btn small ghost inbox-pill" + (isActive ? " on" : "")}>
              <span>{t("inbox") + (inboxSuffix ? "\u00A0" + inboxSuffix : "")}</span>
            </NavLink>
            <Link to={`/profile/${user.id}`}><Avatar user={user} /></Link>
            <button className="btn small ghost" onClick={signOut}>{t("sign_out")}</button>
          </>
        ) : (
          <Link to="/login" className="btn small">{t("sign_in")}</Link>
        )}
      </div>
    </header>
  );
}
