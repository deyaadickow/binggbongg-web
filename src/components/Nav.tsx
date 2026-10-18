import { NavLink, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { fetchShopSettings } from "../lib/shop";
import { fetchCountryChallenges } from "../lib/countryChallenges";
import { useSession } from "../lib/session";
import { Avatar } from "./Common";
import { useT } from "../lib/i18n";

export function Nav() {
  const { t } = useT();
  // Bingg Bongg Shop (2026-10-15): the link exists only while the admin has the shop on, and
  // only for signed-in members (the settings call needs a session).
  const [shopOn, setShopOn] = useState(false);
  // CvC hides its own link while the switch is off (Steve, 2026-10-17). The board endpoint is
  // public and answers `enabled`, so this needs no session — unlike the shop check below.
  const [cvcOn, setCvcOn] = useState(false);
  const { user, isLoggedIn, signOut } = useSession();
  useEffect(() => { if (!isLoggedIn) { setShopOn(false); return; } fetchShopSettings().then((s) => setShopOn(!!s.shop_enabled)).catch(() => setShopOn(false)); }, [isLoggedIn]);
  useEffect(() => { fetchCountryChallenges().then((r) => setCvcOn(r.enabled)).catch(() => setCvcOn(false)); }, []);
  return (
    <header className="nav">
      {/* i18n-exempt: the brand name is the same in every language. */}
      <Link to="/" className="brand">Bingg Bongg</Link>
      <nav className="links">
        <NavLink to="/" end>{t("for_you")}</NavLink>
        <NavLink to="/exciting-news">{t("exciting_news")}</NavLink>
        {/* Steve, 2026-10-07: "L & B" — everyone's scheduled lives and battles, right after
            Exciting News, same slot as both phones. */}
        <NavLink to="/upcoming">{t("l_and_b")}</NavLink>
        {/* Steve, 2026-10-17: "add another tab on the main feed page for 'All Shows' with search
            on top" — right after L & B, the same slot as both phones. */}
        <NavLink to="/shows">{t("all_shows")}</NavLink>
        {/* Steve, 2026-10-17: "a new page on main feed called 'Video Ad Gig'" — influencers
            pitching to make your ad, right after All Shows, the same slot as both phones. */}
        <NavLink to="/gigs">{t("video_ad_gig")}</NavLink>
        {/* Steve, 2026-10-17: "I want the bragging rights board/page to be called 'CvC'" —
            country vs country, right after Video Ad Gig as on both phones. */}
        {cvcOn && <NavLink to="/cvc">{t("cvc")}</NavLink>}
        <NavLink to="/business">{t("business")}</NavLink>
        <NavLink to="/live">{t("live_now")}</NavLink>
        <NavLink to="/search">{t("search")}</NavLink>
        {/* Steve, 2026-09-30: "Also please add an 'Advertise' Tab on top with the other tabs".
            Ungated on purpose, unlike Wallet/Go Live below: this is the one tab a signed-out
            visitor has a reason to click, and the page itself asks them to sign in. */}
        <NavLink to="/settings/advertise">{t("advertise")}</NavLink>
        {isLoggedIn && shopOn && <NavLink to="/shop">{t("shop")}</NavLink>}
        {isLoggedIn && <NavLink to="/wallet">{t("wallet")}</NavLink>}
        {isLoggedIn && <NavLink to="/go-live">{t("go_live")}</NavLink>}
        <NavLink to="/settings" className="only-narrow">{t("settings")}</NavLink>
      </nav>
      <div className="me">
        {isLoggedIn && user ? (
          <>
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
