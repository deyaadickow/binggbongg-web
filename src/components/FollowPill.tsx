import { useEffect, useState, type MouseEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { post } from "../lib/api";
import { useSession } from "../lib/session";
import { useT } from "../lib/i18n";

/**
 * Steve, 2026-11-26: "Please add Follow next to the bullseye with same design black and gold."
 *
 * The small black-and-gold Follow pill beside the gold bullseye on a video. It uses the same
 * followUser call as the profile's Follow button, and goes away once you follow — on every card
 * by that creator, not just the one you tapped. Never on your own videos or people you follow.
 * A button, not a <Link>: it often sits inside a card that is itself a link to the profile.
 */
const followed = new Set<number>();
const FOLLOWED_EVENT = "bb-followed";

export function FollowPill({ userId, isFollowing }: { userId?: number | null; isFollowing?: boolean | number }) {
  const { t } = useT();
  const { user: me } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [, bump] = useState(0);

  useEffect(() => {
    const on = () => bump((n) => n + 1);
    window.addEventListener(FOLLOWED_EVENT, on);
    return () => window.removeEventListener(FOLLOWED_EVENT, on);
  }, []);

  if (!userId || (me && me.id === userId) || !!isFollowing || followed.has(userId)) return null;

  const tap = async (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!me?.id) {
      navigate("/login", { state: { from: location.pathname + location.search } });
      return;
    }
    followed.add(userId);
    window.dispatchEvent(new Event(FOLLOWED_EVENT));
    try {
      await post("followUser", { user_id: me.id, to_user_id: userId });
    } catch {
      followed.delete(userId);
      window.dispatchEvent(new Event(FOLLOWED_EVENT));
    }
  };

  return (
    <button type="button" className="follow-pill" onClick={(e) => void tap(e)}>
      {t("fav_follow")}
    </button>
  );
}
