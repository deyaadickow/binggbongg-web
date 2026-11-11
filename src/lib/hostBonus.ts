// Battle Host Bonus +10% (Steve, 2026-11-10): "If you bring a friend or any member and start
// battling as a host we will give you an extra 10% from all the gifts you receive. The more member
// you bring to battle with the money you make. This is a limited offer" ... and the video "when a
// member goes live the first thing they will see".
//
// The server counts and pays the bonus (backend fetchHostBonus / sendCoinsToUser); the web only
// shows the card on /battles and plays the explainer video once, full screen, when the member's
// OWN live starts. Any failure (endpoint not deployed yet, 404, offline, signed out) or the switch
// being off means "no promotion": show NOTHING, never an error.
import { useEffect, useState } from "react";
import { mediaUrl, post } from "./api";
import { isFilipinoLang } from "./announcements";

export interface HostBonus {
  percent: number;
  endsOn: string | null;
  videoEn: string | null;
  videoFil: string | null;
  poster: string | null;
  todayCoins: number;
  totalCoins: number;
}

const clean = (v: unknown): string | null => (typeof v === "string" && v.trim() ? mediaUrl(v.trim()) : null);

export async function fetchHostBonus(userId: number): Promise<HostBonus | null> {
  try {
    const r = await post<Record<string, unknown>>("fetchHostBonus", { my_user_id: userId });
    const d = r.status ? r.data : null;
    if (!d || !(d.enabled === true || Number(d.enabled) === 1)) return null;
    // Past the last day the server already says "off"; this is only a belt-and-braces check.
    const endsOn = typeof d.ends_on === "string" && /^\d{4}-\d{2}-\d{2}/.test(d.ends_on) ? d.ends_on.slice(0, 10) : null;
    if (endsOn && endsOn < phToday()) return null;
    return {
      percent: Number(d.percent ?? 10) || 10,
      endsOn,
      videoEn: clean(d.video_url),
      videoFil: clean(d.video_fil_url),
      poster: clean(d.poster_url),
      todayCoins: Number(d.today_coins ?? 0) || 0,
      totalCoins: Number(d.total_coins ?? 0) || 0,
    };
  } catch {
    return null;
  }
}

/** Today's date in the Philippines, "YYYY-MM-DD" (the promotion's days are PH days). */
function phToday(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}

export function useHostBonus(userId: number | null | undefined): HostBonus | null {
  const [data, setData] = useState<HostBonus | null>(null);
  useEffect(() => {
    if (!userId) { setData(null); return; }
    let alive = true;
    fetchHostBonus(userId).then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, [userId]);
  return data;
}

/** The Tagalog video for a Filipino reader — or a member in the Philippines reading the site in
 *  English (any other language means they chose it). English for everyone else. */
export function prefersTagalog(siteLang: string, country: string | null | undefined): boolean {
  if (isFilipinoLang(siteLang)) return true;
  const ph = /^(philippines|ph)$/i.test((country ?? "").trim());
  return ph && siteLang === "en";
}

/** Shown once per member on this browser (the phones keep the same flag per user id). */
const SEEN_KEY = "host_bonus_video_seen_v1";

// Steve, 2026-11-10: a NEW go-live video plays again for members who saw the old one — "seen" is per video URL.
export function hostBonusVideoSeen(userId: number, video: string): boolean {
  try { return localStorage.getItem(`${SEEN_KEY}:${userId}:${video}`) === "1"; } catch { return false; }
}

export function markHostBonusVideoSeen(userId: number, video: string): void {
  try { localStorage.setItem(`${SEEN_KEY}:${userId}:${video}`, "1"); } catch { /* private mode */ }
}
