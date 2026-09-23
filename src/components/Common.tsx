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
