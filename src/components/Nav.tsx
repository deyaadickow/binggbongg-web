import { NavLink, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { fetchShopSettings } from "../lib/shop";
import { fetchCountryChallenges } from "../lib/countryChallenges";
import { useSession } from "../lib/session";
import { Avatar } from "./Common";

export function Nav() {
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
      <Link to="/" className="brand">Bingg Bongg</Link>
      <nav className="links">
        <NavLink to="/" end>For You</NavLink>
        <NavLink to="/exciting-news">Exciting News</NavLink>
        {/* Steve, 2026-10-07: "L & B" — everyone's scheduled lives and battles, right after
            Exciting News, same slot as both phones. */}
        <NavLink to="/upcoming">L &amp; B</NavLink>
        {/* Steve, 2026-10-17: "add another tab on the main feed page for 'All Shows' with search
            on top" — right after L & B, the same slot as both phones. */}
        <NavLink to="/shows">All Shows</NavLink>
        {/* Steve, 2026-10-17: "a new page on main feed called 'Video Ad Gig'" — influencers
            pitching to make your ad, right after All Shows, the same slot as both phones. */}
        <NavLink to="/gigs">Video Ad Gig</NavLink>
        {/* Steve, 2026-10-17: "I want the bragging rights board/page to be called 'CvC'" —
            country vs country, right after Video Ad Gig as on both phones. */}
        {cvcOn && <NavLink to="/cvc">CvC</NavLink>}
        <NavLink to="/business">Business</NavLink>
        <NavLink to="/live">Live Now</NavLink>
        <NavLink to="/search">Search</NavLink>
        {/* Steve, 2026-09-30: "Also please add an 'Advertise' Tab on top with the other tabs".
            Ungated on purpose, unlike Wallet/Go Live below: this is the one tab a signed-out
            visitor has a reason to click, and the page itself asks them to sign in. */}
        <NavLink to="/settings/advertise">Advertise</NavLink>
        {isLoggedIn && shopOn && <NavLink to="/shop">Shop</NavLink>}
        {isLoggedIn && <NavLink to="/wallet">Wallet</NavLink>}
        {isLoggedIn && <NavLink to="/go-live">Go Live</NavLink>}
        <NavLink to="/settings" className="only-narrow">Settings</NavLink>
      </nav>
      <div className="me">
        {isLoggedIn && user ? (
          <>
            <Link to={`/profile/${user.id}`}><Avatar user={user} /></Link>
            <button className="btn small ghost" onClick={signOut}>Sign out</button>
          </>
        ) : (
          <Link to="/login" className="btn small">Sign in</Link>
        )}
      </div>
    </header>
  );
}
