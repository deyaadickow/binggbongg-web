import { NavLink, Link } from "react-router-dom";
import { useSession } from "../lib/session";
import { Avatar } from "./Common";

export function Nav() {
  const { user, isLoggedIn, signOut } = useSession();
  return (
    <header className="nav">
      <Link to="/" className="brand">Bingg Bongg</Link>
      <nav className="links">
        <NavLink to="/" end>For You</NavLink>
        <NavLink to="/exciting-news">Exciting News</NavLink>
        <NavLink to="/business">Business</NavLink>
        <NavLink to="/live">Live Now</NavLink>
        <NavLink to="/search">Search</NavLink>
        {/* Steve, 2026-09-30: "Also please add an 'Advertise' Tab on top with the other tabs".
            Ungated on purpose, unlike Wallet/Go Live below: this is the one tab a signed-out
            visitor has a reason to click, and the page itself asks them to sign in. */}
        <NavLink to="/settings/advertise">Advertise</NavLink>
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
