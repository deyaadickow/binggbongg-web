import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useT } from "../lib/i18n";
import { fetchSingingPlaylist, scDemo, singingPillEnabled } from "../lib/singingContest";
import { playFixedQueue } from "../lib/feed";
import { fetchFeedBatch } from "../lib/finding";
import { showGoldAlert, showGoldConfirm } from "./GoldToast";
import { useSession } from "../lib/session";

/**
 * "Singing Contest" on top of the feed, right of "How to make money on Bingg Bongg" (Steve, 2026-11-26: "add a very
 * important button, "Singing Contest" where everyone can see all videos one after another ... All votes will be
 * hidden, random videos will show for every member that clicks the contest button.").
 *
 * Shown while the contest switch is on (peek, once per page load). A tap fetches the entries in a new random order
 * and plays them on the normal video page as a fixed queue (lib/feed playFixedQueue: never topped up from the feed).
 * The server leaves every vote count out; the video page's gift button is still the vote. No videos yet: a popup
 * that opens the Singing Contest page.
 */
export function SingingContestPill() {
  const { t } = useT();
  const navigate = useNavigate();
  const { user } = useSession();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    singingPillEnabled().then((v) => { if (live) setOn(v); });
    return () => { live = false; };
  }, []);
  if (!on) return null;

  const open = async () => {
    if (busy) return;
    setBusy(true);
    try {
      let posts = (await fetchSingingPlaylist().catch(() => null))?.posts ?? null;
      // DEV ?scdemo=play: a few For You videos stand in, so the player can be looked at before December.
      if (import.meta.env.DEV && scDemo() === "play") posts = (await fetchFeedBatch("foryou", user?.id ?? null, 0)).posts.slice(0, 5);
      if (posts === null) { showGoldAlert(t("something_went_wrong")); return; }
      posts = posts.filter((p) => !!p.video);
      if (posts.length === 0) {
        if (await showGoldConfirm({ message: t("sc_pill_empty"), confirmLabel: t("sc_pill_open"), cancelLabel: t("sc_pill_close") })) {
          navigate("/singing-contest");
        }
        return;
      }
      playFixedQueue(posts);
      navigate(`/video/${posts[0].id}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className="money-pill singing-pill" onClick={open} aria-busy={busy}>{t("sc_pill")}</button>
  );
}
