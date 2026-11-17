import { NavLink, Link } from "react-router-dom";
import { useSession } from "../lib/session";
import { Avatar } from "./Common";
import { useT } from "../lib/i18n";
import { useSyncExternalStore } from "react";
import { useAnyCountryBattleLive } from "../lib/allCountryBattles";
import { countSuffix, inboxCountsSnapshot, inboxTotal, subscribeInboxCounts } from "../lib/inboxCounts";

export function Nav() {
  const { t } = useT();
  // The shop and CvC switch checks lived here to decide whether to show their links. Both links
  // moved into the directory, which does its own gating, so these were two API calls firing on
  // every page load to decide nothing. Removed with them.
  const { user, isLoggedIn, signOut } = useSession();
  // Steve, 2026-11-16: a red dot on the chip while at least one Country Battle is live.
  const battleLive = useAnyCountryBattleLive();
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
        {/* Steve, 2026-11-17: "The for you on top and on bottom do the same thing? if yes, remove the
            bottom one." The phones dropped their For You chip; this is the web's copy of it. The
            feed's own For You tab and the logo both lead to the feed. */}
        {/* Steve, 2026-11-17: "remove all the buttons on the bottom of the page and we will have only
            one button that says, 'Information Center'." All Country Battles, 70+ Features, 70+ Videos,
            1 Video 70+ Features and Our Ads moved onto /information-center. The red live dot that
            sat on All Country Battles (2026-11-16) rides on this button now. */}
        <NavLink to="/information-center" className="acb-chip info-center-chip">
          {t("information_center")}
          {battleLive && <span className="live-dot" aria-hidden />}
        </NavLink>
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
