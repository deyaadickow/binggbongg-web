// The web had no contest board at all until 2026-10-22 — nothing here called
// fetchOfficialContestCalendar, fetchOfficialContestLeaderboard or voteOfficialContestVideo, and
// /enter-contest was the only contest route on the site. Steve, seeing the Philippine contest
// missing from www.binggbongg.com on his phone: "The web on my phone doesn't have the
// 'Philippine singing contest'." It was invisible to everyone, Filipinos included.
//
// Every key below was read out of OfficialContestController rather than guessed. That matters:
// the Following tab once showed "No members yet." against 30 real rows because the page had
// copied `toUser` from the PHP when the JSON says `to_user`. Guessed response keys fail
// silently as an empty list, which looks exactly like "no data".
import { post } from "./api";

/** computedStatus() on the model. There is no "running" — a filter on that string matches
 *  nothing and the list is silently always empty. A contest in its ENTRY-ONLY week reports
 *  "upcoming": voting has not opened, but entries are going in and its board already exists,
 *  which is precisely when a supporter wants to look. */
export type ContestStatus = "active" | "upcoming" | "ended" | "disabled";

export interface Contest {
  /** The contest that owns the featured spot (directory tile #1 since 2026-10-25). */
  is_featured?: boolean;
  id: number;
  name?: string | null;
  ranking_metric?: "votes" | "gifts" | "both" | null;
  country_name?: string | null;
  countries?: string[] | null;
  entry_start_date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: ContestStatus | null;
  vote_limit_text?: string | null;
  rules?: string[] | null;
  prize_tiers?: { rank: number; prize_amount: string }[] | null;
}

/** One row of either board. `score` is whichever column this contest is actually decided on,
 *  so a caller that knows nothing about gifts still prints the right number. */
export interface BoardRow {
  rank: number;
  video_id: number;
  /** The real post behind the entry — this is what gifting needs, and it is why the board can
   *  reuse the site's existing PostGiftButton instead of growing its own gift flow. */
  post_id: number | null;
  user_id: number;
  fullname?: string | null;
  username?: string | null;
  profile_image?: string | null;
  video_path?: string | null;
  thumb_path?: string | null;
  caption?: string | null;
  vote_count: number;
  gift_coins: number;
  score: number;
  /** false only when the contest sets a minimum-videos floor this contestant has not met. */
  is_prize_eligible: boolean;
}

export interface Board {
  contest: Contest;
  leaderboard: BoardRow[];
  /** Present ONLY when ranking_metric is "both" — the same rows re-ranked on gifts, sorted
   *  server-side from one read so the two boards can never disagree. */
  gifts_leaderboard?: BoardRow[];
}

/** Every contest that exists. Deliberately NOT country-filtered — it never has been on the
 *  server, and that is the whole point: entering is country-locked, watching is not. */
export async function fetchContests(userId?: number): Promise<Contest[]> {
  const res = await post<Contest[]>("fetchOfficialContestCalendar", userId ? { user_id: userId } : {});
  return res.status ? (res.data ?? []) : [];
}

/** The featured contest's id — the one the phones' tile #1 opens — or null if none is set. */
export async function fetchFeaturedContestId(): Promise<number | null> {
  try {
    const all = await fetchContests();
    return all.find((c) => c.is_featured)?.id ?? null;
  } catch {
    return null;
  }
}

/** The two states worth showing. Excludes ended and disabled only. */
export function isLive(c: Contest): boolean {
  const s = (c.status ?? "").toLowerCase();
  return s === "active" || s === "upcoming";
}

export async function fetchBoard(contestId: number, countryName?: string): Promise<Board | null> {
  const res = await post<Board>("fetchOfficialContestLeaderboard", {
    official_contest_id: contestId,
    ...(countryName ? { country_name: countryName } : {}),
  });
  return res.status ? (res.data ?? null) : null;
}

export interface VoteResult {
  ok: boolean;
  /** The server's own words on refusal — it owns the per-hour rule, the once-per-contest rule
   *  and "you can't vote for your own video", and phrases each far better than a guess here. */
  message?: string;
  videoVoteCount?: number;
}

export async function voteForEntry(userId: number, videoId: number): Promise<VoteResult> {
  const res = await post<{ video_vote_count?: number }>("voteOfficialContestVideo", {
    user_id: userId,
    official_contest_video_id: videoId,
  });
  return {
    ok: !!res.status,
    message: res.message ?? undefined,
    videoVoteCount: res.data?.video_vote_count,
  };
}

// Steve, 2026-10-30: "Yes build the share to get votes button". The link a contestant shares
// opens the contest board on the website, scrolled to their entry and lit up in gold, where a
// friend can vote (signing in first if they have to). Same link on Android and iOS.
export function contestEntryShareUrl(contestId: number, videoId: number): string {
  return `https://www.binggbongg.com/contests/${contestId}?entry=${videoId}`;
}

/** The phone's own share sheet where there is one, otherwise the link goes to the clipboard. */
export async function shareContestEntry(text: string, url: string): Promise<"shared" | "copied" | "failed"> {
  try {
    if (navigator.share) { await navigator.share({ text, url }); return "shared"; }
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return "shared"; // they closed the sheet themselves
  }
  try { await navigator.clipboard.writeText(`${text} ${url}`); return "copied"; } catch { /* fall through */ }
  window.prompt("Copy this link", `${text} ${url}`);
  return "copied";
}
