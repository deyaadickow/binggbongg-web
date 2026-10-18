import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { post, type LiveStream } from "../lib/api";
import { useSession } from "../lib/session";
import { Avatar, Loading, Notice } from "../components/Common";
import { useT } from "../lib/i18n";

/** Daily Live Badge (Steve, 2026-10-16) — the badge a host earns for the day by streaming to
 *  people who are actually watching. Ring colour per tier, gold text throughout, so it reads
 *  as one family with the rest of the app rather than four unrelated colours. */
const BADGE_RING: Record<number, string> = { 1: "#CD7F32", 2: "#C9CDD4", 3: "#D4AF37", 4: "#8FE3F5" };

function LiveBadge({ tier, name, minutes }: { tier?: number; name?: string; minutes?: number }) {
  if (!tier) return null;
  const ring = BADGE_RING[tier] ?? "#D4AF37";
  return (
    <span
      className="pill"
      style={{ borderColor: ring, color: ring }}
      title={`${name ?? "Badge"} today${minutes ? ` — ${minutes} min live with viewers watching` : ""}`}
    >
      ◉ {name ?? "Badge"}
    </span>
  );
}

export function LiveNowPage() {
  const { t } = useT();
  const { user } = useSession();
  const [streams, setStreams] = useState<LiveStream[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Steve, 2026-10-08: "incase i just want to watch my favorite live streamers?" Favourites
  // already sort to the top, but with forty people live that still means scrolling past
  // everyone. Filtered here rather than re-fetched: the server sends is_favourite on every row.
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  // The badge's own row. Deliberately separate from the main list rather than a reordering of
  // it: the main list answers "what is good right now", and letting hours streamed decide that
  // order would promote the longest stream instead of the best one.
  const [topToday, setTopToday] = useState<LiveStream[]>([]);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [res, top] = await Promise.all([
          post<LiveStream[]>("fetchActiveLiveStreams", { user_id: user?.id ?? 0, connections_only: false }),
          // Fails quietly on purpose: the badge row is a bonus, and a backend that has not been
          // deployed yet must never stop Live Now itself from rendering.
          post<LiveStream[]>("fetchTopLiveToday", { user_id: user?.id ?? 0 }).catch(() => null),
        ]);
        if (!alive) return;
        setTopToday(top?.status ? (top.data ?? []) : []);
        if (!res.status) throw new Error(res.message ?? "Couldn't load who's live.");
        // One card per room — the API lists every broadcaster in a room, host first.
        //
        // But PREFER a favourited broadcaster over the host when both are in the same room.
        // Keeping the host blindly would drop a favourite who is a GUEST in someone else's
        // battle, so the favourites filter below would find nothing while they were plainly
        // live. The room is the same either way; whose name is on the card is not.
        const byRoom = new Map<string, LiveStream>();
        for (const s of res.data ?? []) {
          const held = byRoom.get(s.room_name);
          if (!held || (s.is_favourite && !held.is_favourite)) byRoom.set(s.room_name, s);
        }
        setStreams([...byRoom.values()]);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    }
    load();
    const t = setInterval(load, 10000);
    return () => { alive = false; clearInterval(t); };
    // user?.id, NOT user — the session object is replaced on every refresh (a gift, a coin
    // change), and keying on it tore this list down and rebuilt it each time.
  }, [user?.id]);

  const visible = streams === null ? null : favouritesOnly ? streams.filter((s) => s.is_favourite) : streams;

  return (
    <div className="page">
      <div className="row" style={{ alignItems: "center", gap: 12 }}>
        <h1 className="page-title" style={{ margin: 0 }}>{t("live_now")}</h1>
        <span style={{ flex: 1 }} />
        {/* Filled when ON. Without that, an empty filtered list looks identical to
            "nobody is live", which is the confusion worth avoiding. */}
        <button
          type="button"
          className={favouritesOnly ? "btn" : "btn ghost"}
          onClick={() => setFavouritesOnly((v) => !v)}
          title={t("show_only_my_favourite_streamers")}
        >
          {favouritesOnly ? "♥ Favourites" : "♡ Favourites"}
        </button>
      </div>
      {error && <Notice error>{error}</Notice>}
      {/* Shown only when somebody has actually earned a place in it — an empty "Top Live Today"
          heading every quiet morning would just make the page look broken. Hidden while the
          favourites filter is on, since that filter is the member asking for one specific
          list and this row is not it. */}
      {!favouritesOnly && topToday.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 8px" }}>{t("top_live_today")}</h2>
          <div className="row" style={{ gap: 10, overflowX: "auto", paddingBottom: 4 }}>
            {topToday.map((s) => (
              <Link
                key={`top-${s.room_name}-${s.host_user_id}`}
                to={`/live/${encodeURIComponent(s.room_name)}`}
                className="card"
                style={{ padding: 12, color: "inherit", minWidth: 150, textAlign: "center" }}
              >
                <Avatar user={{ fullname: s.host_fullname, username: s.host_username, profile_image: s.host_profile_image }} size="lg" />
                <div style={{ fontWeight: 800, fontSize: 14, marginTop: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.host_fullname || s.host_username || "Member"}
                </div>
                <div style={{ marginTop: 6 }}>
                  <LiveBadge tier={s.live_badge_tier} name={s.live_badge_tier_name} minutes={s.live_badge_minutes} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
      {visible === null ? <Loading /> : visible.length === 0 ? (
        <Notice>
          {favouritesOnly
            ? (streams && streams.some((s) => s.is_favourite)
                ? "None of your favourites are live right now."
                : "None of your favourites are live right now. Open a live stream and tap the heart to add one.")
            : "Nobody is live right now. Check back in a few minutes."}
        </Notice>
      ) : (
        <div className="grid wide">
          {visible.map((s) => (
            <Link key={s.room_name} to={`/live/${encodeURIComponent(s.room_name)}`} className="card row" style={{ padding: 14, color: "inherit" }}>
              <Avatar user={{ fullname: s.host_fullname, username: s.host_username, profile_image: s.host_profile_image }} size="lg" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{s.host_fullname || s.host_username || "Member"}</div>
                <div className="muted" style={{ fontSize: 13 }}>@{s.host_username ?? ""}</div>
                <div className="row" style={{ marginTop: 6, gap: 6, flexWrap: "wrap" }}>
                  <span className="pill live">{t("live")}</span>
                  <LiveBadge tier={s.live_badge_tier} name={s.live_badge_tier_name} minutes={s.live_badge_minutes} />
                </div>
              </div>
              <span className="btn small">{t("watch")}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
