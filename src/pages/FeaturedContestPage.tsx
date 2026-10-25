// Steve, 2026-10-25: the Philippine Singing Contest moved from the main tabs into Bingg Bongg
// Features as tile #1. Which contest is "featured" is an admin setting, so this route looks it up
// and opens that contest's board; with none set it shows every contest instead.
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useT } from "../lib/i18n";
import { fetchFeaturedContestId } from "../lib/contests";

export function FeaturedContestPage() {
  const nav = useNavigate();
  const { t } = useT();
  useEffect(() => {
    let live = true;
    fetchFeaturedContestId().then((id) => {
      if (live) nav(id ? `/contests/${id}` : "/contests", { replace: true });
    });
    return () => { live = false; };
  }, [nav]);
  return <div className="page"><p className="muted">{t("loading")}</p></div>;
}
