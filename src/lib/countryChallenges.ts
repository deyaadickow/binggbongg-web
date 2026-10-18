// CvC — country vs country challenges (Steve, 2026-10-17). Mirrors CountryChallengeController.
//
//   "We will choose 2 of the best members with the most followers on the app one from each
//    country to chalange each other for a 5, or a 10 minutes battle."
//   "We should have lifetime country vs country battle bragging rights board."
//
// He named it on the same day: the page is "CvC" wherever it is linked, and the heading inside
// it is "Country VS Country".
import { post } from "./api";

export interface CvCRow {
  id: number;
  title: string;
  country_a_name: string;
  country_a_code?: string | null;
  country_b_name: string;
  country_b_code?: string | null;
  scheduled_at?: string;
  ended_at?: string;
  /** The day it was fought — the board is a list of dates first. */
  date: string;
  status: string;
  minutes: number;
  score_a: number;
  score_b: number;
  winner_country_name?: string | null;
  winner_country_code?: string | null;
  is_draw: boolean;
}

export interface CvCPlayer {
  user_id?: number | null;
  name?: string | null;
  username?: string | null;
  image?: string | null;
  followers: number;
  country: string;
  score: number;
}

export interface CvCSupporter {
  user_id: number;
  name?: string | null;
  image?: string | null;
  coins: number;
}

/** The lifetime record between the two countries — the bragging rights themselves. */
export interface CvCHeadToHead {
  played: number;
  wins_a: number;
  wins_b: number;
  draws: number;
}

export interface CvCDetail extends CvCRow {
  started_at?: string;
  room_name?: string | null;
  player_a: CvCPlayer;
  player_b: CvCPlayer;
  top_supporters_a: CvCSupporter[];
  top_supporters_b: CvCSupporter[];
  head_to_head: CvCHeadToHead;
}

export async function fetchCountryChallenges(): Promise<{ upcoming: CvCRow[]; rows: CvCRow[]; enabled: boolean }> {
  const r = await post<CvCRow[]>("fetchCountryChallenges", {});
  const body = r as unknown as { upcoming?: CvCRow[]; enabled?: boolean };
  return { upcoming: body.upcoming ?? [], rows: r.data ?? [], enabled: Boolean(body.enabled) };
}

export async function fetchCountryChallenge(id: number): Promise<CvCDetail> {
  const r = await post<CvCDetail>("fetchCountryChallenge", { challenge_id: id });
  if (!r.status || !r.data) throw new Error(r.message ?? "Couldn't load that battle.");
  return r.data;
}

/** 🇺🇸 from "US" — the flag is just the two letters shifted into the regional-indicator block,
 *  so no image and no list to maintain. An unknown code simply has no flag. */
export function flagOf(code?: string | null): string {
  if (!code || code.length !== 2) return "";
  const base = 0x1f1e6;
  return String.fromCodePoint(
    base + (code.toUpperCase().charCodeAt(0) - 65),
    base + (code.toUpperCase().charCodeAt(1) - 65),
  );
}
