// Live Section Videos (Steve, 2026-11-12: "give admin the ability to upload videos that will go
// into the live section. When members go to watch live I don't want the live to be empty ... add
// them from 'The Good Judge's account.").
//
// A card per admin-uploaded video, listed on Live Now AFTER every real live, with a gold FEATURED
// pill — never the red LIVE one, because it is not live. Tapping it opens a full-screen looping
// player dressed like a live room for that account. Deliberately NOT a live room: no LiveKit, no
// gift button or panel, no chat input, nothing that can charge BBs (Steve: gifts OFF).
import { useEffect, useRef } from "react";
import { mediaUrl, type FeaturedLiveVideo } from "../lib/api";
import { useT } from "../lib/i18n";
import { Avatar } from "./Common";

function hostOf(v: FeaturedLiveVideo) {
  return { id: v.host_user_id, fullname: v.host_fullname ?? undefined, username: v.host_username ?? undefined, profile_image: v.host_profile_image ?? undefined };
}

/** One card, shaped like a Live Now card. No viewer count, heart, tap count or badge. */
export function FeaturedLiveCard({ video, onOpen }: { video: FeaturedLiveVideo; onOpen: () => void }) {
  const { t } = useT();
  const name = video.host_fullname || video.host_username || "Member";
  return (
    <button type="button" onClick={onOpen} className="card row"
      style={{ padding: 14, color: "inherit", textAlign: "left", font: "inherit", cursor: "pointer", width: "100%", borderColor: "var(--gold-border)" }}>
      <Avatar user={hostOf(video)} size="lg" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>{name}</div>
        <div className="muted" style={{ fontSize: 13 }}>@{video.host_username ?? ""}</div>
        {video.title ? (
          <div style={{ fontSize: 13, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{video.title}</div>
        ) : null}
      </div>
      <span className="btn small">{t("watch")}</span>
    </button>
  );
}

/** Full-screen looping player. The close button or Escape closes it. */
export function FeaturedLivePlayer({ video, onClose }: { video: FeaturedLiveVideo; onClose: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const src = video.video_url || mediaUrl(video.video);
  const poster = video.thumbnail_url || mediaUrl(video.thumbnail) || undefined;
  const name = video.host_fullname || video.host_username || "Member";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // With sound, as asked. A browser that refuses unmuted autoplay gets it muted instead of
    // a frozen first frame; the native controls let the viewer unmute.
    const el = ref.current;
    el?.play().catch(() => { if (el) { el.muted = true; el.play().catch(() => {}); } });
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);


  return (
    <div role="dialog" aria-label={name} data-live-swipe="video" style={{ position: "fixed", inset: 0, zIndex: 2000, background: "#000", display: "flex", flexDirection: "column" }}>
      <video
        ref={ref}
        src={src}
        poster={poster}
        autoPlay
        loop
        playsInline
        controls
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
      />
      {/* Top bar: only the red close X. */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
        background: "linear-gradient(rgba(0,0,0,.75), rgba(0,0,0,0))" }}>
        {/* Steve, 2026-11-12: "remove the badge and just keep the X to logout and the x supposed to be red". */}
        <span style={{ flex: 1 }} />
        <button type="button" onClick={onClose} aria-label="Close"
          style={{ width: 40, height: 40, borderRadius: "50%", background: "#000", border: "2px solid #E53935", color: "#E53935",
            fontSize: 20, fontWeight: 800, cursor: "pointer", flex: "none" }}>
          ✕
        </button>
      </div>
    </div>
  );
}
