import { Link } from "react-router-dom";
import { displayName, initials, mediaUrl, type UserSummary } from "../lib/api";
import { useT } from "../lib/i18n";

export function Avatar({ user, size }: { user?: Partial<UserSummary> | null; size?: "lg" }) {
  const name = displayName(user);
  const src = mediaUrl(user?.profile_image);
  const looksReal = src && !/\/$/.test(src);
  const circle = (
    <div className={`avatar ${size ?? ""}`} title={name}>
      {looksReal ? <img src={src} alt={name} onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} /> : initials(name)}
    </div>
  );
  // Steve, 2026-11-08: "I really like the green dot when a member is online, please add it to
  // the rest of the app." The backend appends is_online (0/1, active in the last 15 minutes) to
  // every user object, so every Avatar wears the dot. Only an online member is wrapped, so an
  // offline avatar's layout is exactly what it was; the wrapper is the avatar's own size.
  if (Number(user?.is_online) !== 1) return circle;
  return (
    <span className="avatar-wrap" style={{ position: "relative", display: "inline-flex", flex: "none", verticalAlign: "middle" }}>
      {circle}
      <span className="online-dot" aria-label="Online now" title="Online now"
        style={{ position: "absolute", right: 0, bottom: 0, width: "26%", height: "26%", minWidth: 10, minHeight: 10,
          // Steve, 2026-11-08: green = online, red = live (is_live is sent on Online Now rows).
          boxSizing: "border-box", borderRadius: "50%", background: Number((user as { is_live?: number })?.is_live) === 1 ? "#FF2D2D" : "#2ECC40", border: "2px solid #000" }} />
    </span>
  );
}

export function UserRow({ user, trailing }: { user: UserSummary; trailing?: React.ReactNode }) {
  return (
    <Link to={`/profile/${user.id}`} className="card row" style={{ padding: 10, color: "inherit" }}>
      <Avatar user={user} />
      {/* Steve, 2026-10-11: "For all the names, add a black background with gold borders and
          make the white lettering gold." The card already carried the border; the lettering
          was white and the handle grey. */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, color: "var(--gold)" }}>{displayName(user)}</div>
        <div style={{ fontSize: 13, color: "var(--gold)", opacity: 0.75 }}>@{user.username ?? ""}</div>
      </div>
      {trailing}
    </Link>
  );
}

export function Loading({ text }: { text?: string }) {
  // The default lives in the body, not in the parameter list: a default parameter cannot
  // call a hook, and "Loading…" is the string a member sees on every screen that fetches.
  const { t } = useT();
  return <p className="muted center">{text ?? t("loading")}</p>;
}

export function Notice({ children, error }: { children: React.ReactNode; error?: boolean }) {
  return <div className={`notice ${error ? "error" : ""}`}>{children}</div>;
}


// Steve, 2026-09-24: "add links for Bingg Bongg to Apple store and google play store for downloads".
export const APP_STORE_URL = "https://apps.apple.com/app/bingg-bongg/id1616509409";
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.apps.binggbongg";

export function StoreBadges({ compact }: { compact?: boolean }) {
  const { t } = useT();
  return (
    <div className="store-badges">
      {!compact && <span className="muted" style={{ fontSize: 13 }}>{t("get_the_bingg_bongg_app")}</span>}
      <a className="store-badge" href={APP_STORE_URL} target="_blank" rel="noreferrer"><span className="logo"></span>{/* i18n-exempt: store names. */}
        <span><small>{t("download_on_the")}</small>App Store</span></a>
      <a className="store-badge" href={PLAY_STORE_URL} target="_blank" rel="noreferrer"><span className="logo">▶</span>{/* i18n-exempt: store names. */}
        <span><small>{t("get_it_on")}</small>Google Play</span></a>
    </div>
  );
}
