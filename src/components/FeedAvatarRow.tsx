import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { displayName, mediaUrl, post } from "../lib/api";
import type { FeedTab } from "../lib/finding";
import { useT } from "../lib/i18n";

/**
 * The round avatars over the main feed (Steve, 2026-11-20, from TikTok's Friends tab): "When you
 * click on Nearby, friends, followings or for you buttons, you will get these avatars on top of the
 * page, you can scroll them to the left or right to see more of them. as soon as you click one of
 * them they will disappear."
 *
 * Shown each time a chip is tapped (`showKey` changes), hidden again when a circle is opened or the
 * member scrolls the feed. First circle = Create (upload a video). Live members first, red ring.
 */
export interface FeedAvatar {
  id: number; username: string; fullname?: string; profile_image?: string | null;
  is_following: number; is_live: number; room_name?: string | null;
}

export function FeedAvatarRow({ tab, meId, showKey }: { tab: FeedTab; meId: number | null; showKey: number }) {
  const { t } = useT();
  const navigate = useNavigate();
  const [rows, setRows] = useState<FeedAvatar[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!showKey || !meId) { setOpen(false); return; }
    let live = true;
    setOpen(true);
    setRows([]);
    // Dev server only: ?avatarmock=1 shows pretend people (the real call needs a signed-in token).
    (import.meta.env.DEV && new URLSearchParams(window.location.search).has("avatarmock")
      ? Promise.resolve({ status: true, data: DEV_MOCK, message: "" })
      : post<FeedAvatar[]>("fetchFeedAvatars", { my_user_id: meId, tab }))
      .then((r) => { if (live && r.status) setRows(Array.isArray(r.data) ? r.data : []); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [showKey, tab, meId]);

  // Starting to scroll the feed puts the row away until the next chip tap.
  useEffect(() => {
    if (!open) return;
    const start = window.scrollY;
    const onScroll = () => { if (Math.abs(window.scrollY - start) > 40) setOpen(false); };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [open]);

  if (!open || !meId) return null;

  const openPerson = (a: FeedAvatar) => {
    setOpen(false);
    navigate(a.is_live && a.room_name ? `/live/${encodeURIComponent(a.room_name)}` : `/profile/${a.id}`);
  };
  const follow = async (a: FeedAvatar) => {
    setRows((prev) => prev.map((x) => (x.id === a.id ? { ...x, is_following: 1 } : x)));
    try { await post("followUser", { user_id: meId, to_user_id: a.id }); }
    catch { setRows((prev) => prev.map((x) => (x.id === a.id ? { ...x, is_following: 0 } : x))); }
  };

  return (
    <div className="fav-row" role="list">
      <button type="button" className="fav-item" role="listitem" onClick={() => { setOpen(false); navigate("/upload"); }}>
        <span className="fav-ring fav-create">
          <img src="/logo_round.png" alt="" />
          <span className="fav-plus" aria-hidden>+</span>
        </span>
        <span className="fav-name">{t("fav_create")}</span>
      </button>
      {rows.map((a) => {
        const name = a.fullname?.trim() || a.username || displayName(a);
        const src = mediaUrl(a.profile_image);
        return (
          <div key={a.id} className="fav-item" role="listitem">
            <button type="button" className={`fav-ring ${a.is_live ? "live" : ""}`} onClick={() => openPerson(a)} aria-label={name}>
              {src && !/\/$/.test(src)
                ? <img src={src} alt="" onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
                : <span className="fav-initial">{name.slice(0, 1).toUpperCase()}</span>}
              {a.is_live ? <span className="fav-live">{t("fav_live")}</span> : null}
            </button>
            {!a.is_live && !a.is_following && (
              <button type="button" className="fav-follow" aria-label={t("fav_follow")} title={t("fav_follow")} onClick={() => follow(a)}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden><path fill="currentColor" d="M10 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.3 0-7 1.7-7 4v2h14v-2c0-2.3-3.7-4-7-4Zm9-6V6h-2v2h-2v2h2v2h2v-2h2V8h-2Z" /></svg>
              </button>
            )}
            <button type="button" className="fav-name" onClick={() => openPerson(a)}>{name}</button>
          </div>
        );
      })}
    </div>
  );
}

const DEV_MOCK: FeedAvatar[] = import.meta.env.DEV
  ? ["Liza Audo", "Amy Sitoo", "Steph", "Marlon", "Joseph", "Dennis", "Abel", "Braxis"].map((n, i) => ({
      id: 900100 + i, username: n.toLowerCase().replace(/ /g, ""), fullname: n, profile_image: null,
      is_following: i % 3 === 0 ? 1 : 0, is_live: i === 1 ? 1 : 0, room_name: i === 1 ? "mock" : null,
    }))
  : [];
