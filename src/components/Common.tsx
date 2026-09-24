import { Link } from "react-router-dom";
import { displayName, initials, mediaUrl, type UserSummary } from "../lib/api";

export function Avatar({ user, size }: { user?: Partial<UserSummary> | null; size?: "lg" }) {
  const name = displayName(user);
  const src = mediaUrl(user?.profile_image);
  const looksReal = src && !/\/$/.test(src);
  return (
    <div className={`avatar ${size ?? ""}`} title={name}>
      {looksReal ? <img src={src} alt={name} onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} /> : initials(name)}
    </div>
  );
}

export function UserRow({ user, trailing }: { user: UserSummary; trailing?: React.ReactNode }) {
  return (
    <Link to={`/profile/${user.id}`} className="card row" style={{ padding: 10, color: "inherit" }}>
      <Avatar user={user} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800 }}>{displayName(user)}</div>
        <div className="muted" style={{ fontSize: 13 }}>@{user.username ?? ""}</div>
      </div>
      {trailing}
    </Link>
  );
}

export function Loading({ text = "Loading…" }: { text?: string }) {
  return <p className="muted center">{text}</p>;
}

export function Notice({ children, error }: { children: React.ReactNode; error?: boolean }) {
  return <div className={`notice ${error ? "error" : ""}`}>{children}</div>;
}


// Steve, 2026-09-24: "add links for Bingg Bongg to Apple store and google play store for downloads".
export const APP_STORE_URL = "https://apps.apple.com/app/bingg-bongg/id1616509409";
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.apps.binggbongg";

export function StoreBadges({ compact }: { compact?: boolean }) {
  return (
    <div className="store-badges">
      {!compact && <span className="muted" style={{ fontSize: 13 }}>Get the Bingg Bongg app</span>}
      <a className="store-badge" href={APP_STORE_URL} target="_blank" rel="noreferrer"><span className="logo"></span><span><small>Download on the</small>App Store</span></a>
      <a className="store-badge" href={PLAY_STORE_URL} target="_blank" rel="noreferrer"><span className="logo">▶</span><span><small>Get it on</small>Google Play</span></a>
    </div>
  );
}
