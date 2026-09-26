// The four rows the phones' Battle menu carries that the web didn't: the 31 Day Battle
// Challenge, PK Battle Contests, the Lifetime Battle Board and Friendly Punishment Suggestions.
//
// None of these needed backend work — every endpoint here already exists and is already what the
// phones call. The web was simply the only client that never grew the screens.
import { post } from "./api";

// ---- 31 Day Battle Challenge ----------------------------------------------------------------
//
// A personal 31-consecutive-day streak that starts when the member opts in, NOT a calendar month.
// Daily tier is set by how many qualifying battles they play that day: >=1 -> 5%, >=2 -> 10%,
// >=3 -> 15%. The bonus for the whole 31 days is their single LOWEST daily tier, not an average —
// so one weak day drags the whole month down, which is the point. Miss a day entirely and the
// challenge restarts from scratch.

export interface ChallengeStatus {
  has_active_challenge: boolean;
  just_restarted?: boolean;
  just_completed?: boolean;
  /** Present only while a challenge is running. */
  started_at?: string | null;
  current_day_number?: number;
  today_battle_count?: number;
  today_tier_percent?: number;
  running_lowest_tier_percent?: number;
  days_remaining?: number;
  /** Present only when there is NO active challenge, describing the previous one. */
  last_challenge_status?: string | null;
  last_challenge_final_tier_percent?: number | null;
  last_challenge_final_bonus_amount?: number | null;
}

export async function fetchChallengeStatus(userId: number): Promise<ChallengeStatus | null> {
  const res = await post<ChallengeStatus>("fetchBattleChallengeStatus", { user_id: userId });
  return res.status ? (res.data ?? null) : null;
}

export async function startChallenge(userId: number): Promise<void> {
  const res = await post("startBattleChallenge", { user_id: userId });
  if (!res.status) throw new Error(res.message ?? "Couldn't start the challenge.");
}

/** The tier ladder, for rendering it without hardcoding the numbers in three places. */
export const CHALLENGE_TIERS = [
  { battles: 1, percent: 5 },
  { battles: 2, percent: 10 },
  { battles: 3, percent: 15 },
];

// ---- Lifetime Battle Board ------------------------------------------------------------------
//
// One board across every Talent Contest ever run. The phones also have a per-opponent head-to-head
// history screen (LifetimeBattleBoardActivity); this is the leaderboard half, which is the part
// that reads as a "board".

export interface LifetimeRow {
  rank: number;
  user_id: number;
  fullname?: string | null;
  username?: string | null;
  profile_image?: string | null;
  country_name?: string | null;
  total_votes: number;
  video_count: number;
  contest_count: number;
  contests_won: number;
}

export async function fetchLifetimeLeaderboard(countryName?: string | null, limit = 100): Promise<LifetimeRow[]> {
  const res = await post<{ country_filter?: string | null; leaderboard?: LifetimeRow[] }>(
    "fetchOfficialContestLifetimeLeaderboard",
    { country_name: countryName || undefined, limit },
  );
  return res.status ? (res.data?.leaderboard ?? []) : [];
}

// ---- Friendly Punishment Suggestions ---------------------------------------------------------
//
// Admin-managed list; the endpoint returns active suggestions as a flat array of strings.

export async function fetchPunishmentSuggestions(): Promise<string[]> {
  const res = await post<string[]>("fetchBattlePunishmentSuggestions", {});
  return res.status ? (res.data ?? []) : [];
}

// ---- PK Battle Contests ----------------------------------------------------------------------
//
// Admin-run contests scored by gift coins received while they run. Geographic contests are
// invisible to non-contestants — that filtering is the SERVER's (fetchPkBattleContests never
// sends one to a member who isn't in it), so nothing here decides who may see what.

/** Verified against production 2026-09-25: the columns are prize_type + prize_value, NOT a flat
 *  "prize_amount". prize_type is 'cash' (prize_value is a dollar figure) or 'percentage'
 *  (prize_value is a share of the prize pool) — rendering a percentage tier with a $ in front of
 *  it would misreport real prize money, so always branch on the type. */
export interface PrizeTier {
  rank?: number | null;
  prize_type?: "cash" | "percentage" | string | null;
  prize_value?: number | string | null;
}

/** The one place that turns a tier into text, so the cash/percentage distinction can't be lost. */
export function prizeLabel(t: PrizeTier): string {
  const v = Number(t.prize_value ?? 0);
  if (t.prize_type === "percentage") return `${v % 1 === 0 ? v : v.toFixed(2)}% of the pool`;
  return `$${v.toFixed(2)}`;
}

/** computedStatus() on the server returns exactly these. "active" is the running state — it is
 *  NOT called "running", which is what this client first assumed and got wrong. */
export type ContestStatus = "active" | "upcoming" | "ended" | "finished" | "disabled";

export function contestStatusLabel(status?: string | null): string {
  switch (status) {
    case "active": return "Running now";
    case "upcoming": return "Upcoming";
    case "ended": return "Ended";
    case "finished": return "Finished";
    case "disabled": return "Not running";
    default: return "—";
  }
}

export interface PkContest {
  id: number;
  name?: string | null;
  type?: string | null;
  granularity?: string | null;
  battle_type?: string | null;
  battle_limit?: number | null;
  battle_limit_period?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  duration_mode?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  payout_bonus_per_coins?: number | null;
  payout_bonus_amount?: number | null;
  prize_tiers?: PrizeTier[] | null;
  status?: string | null;
  winner_label?: string | null;
  winner_score?: number | null;
  host_user_id?: number | null;
  is_contestant?: boolean | null;
  featured?: boolean | null;
}

export async function fetchPkContests(userId: number): Promise<PkContest[]> {
  const res = await post<PkContest[]>("fetchPkBattleContests", { user_id: userId });
  return res.status ? (res.data ?? []) : [];
}

export interface StandingRow {
  /** Display name already resolved server-side, or the team name for a geographic contest. */
  label?: string | null;
  score?: number | null;
  /** null on a geographic contest's team row — the row is a country/team, not a member. */
  user_id?: number | null;
  username?: string | null;
  profile_image?: string | null;
  location?: string | null;
}

export interface ContestStandings {
  contest: PkContest | null;
  standings: StandingRow[];
  /** Contestants on the OTHER side, for "battle them right now" when they're in your room. */
  opponent_user_ids: number[];
}

/** NOTE: the parameter is `id`, not `contest_id` — verified against
 *  PkBattleContestController::fetchPkBattleContestStandings, whose validator requires `id`. */
export async function fetchPkContestStandings(contestId: number, userId: number): Promise<ContestStandings> {
  const res = await post<{ contest?: PkContest; standings?: StandingRow[]; opponent_user_ids?: number[] }>(
    "fetchPkBattleContestStandingsApp",
    { id: contestId, user_id: userId },
  );
  if (!res.status) throw new Error(res.message ?? "Couldn't load that contest.");
  return {
    contest: res.data?.contest ?? null,
    standings: res.data?.standings ?? [],
    opponent_user_ids: res.data?.opponent_user_ids ?? [],
  };
}
