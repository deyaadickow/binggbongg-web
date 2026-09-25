// Solo Battle — a host starts one instantly, no admin involved. Everyone watching gets a join
// window to go live and enter; when it ends, whoever received the most gift coins wins.
//
// It is the same PkBattleContest row and the same scoring/standings engine as an admin-run PK
// Battle Contest — host_user_id is the only field that distinguishes the two, which is why the
// standings call below is the shared contest one rather than anything solo-specific.
import { post } from "./api";

export interface SoloBattle {
  id: number;
  name?: string | null;
  /** "upcoming" while the join window is open, then "active", then ended/finished. */
  status?: string | null;
  /** When the join window closes and scoring starts. */
  starts_at?: string | null;
  ends_at?: string | null;
  duration_minutes?: number | null;
  host_user_id?: number | null;
  /** Only returned by fetchActiveSoloBattleForHost — true once the asker has joined. */
  already_joined?: boolean | null;
}

export interface StandingRow {
  label?: string | null;
  score?: number | null;
  user_id?: number | null;
  username?: string | null;
  profile_image?: string | null;
  location?: string | null;
}

export async function startSoloBattle(hostUserId: number): Promise<SoloBattle> {
  const res = await post<SoloBattle>("startSoloBattle", { host_user_id: hostUserId });
  if (!res.status || !res.data) throw new Error(res.message ?? "Couldn't start a Solo Battle.");
  return res.data;
}

export async function joinSoloBattle(contestId: number, userId: number): Promise<SoloBattle> {
  const res = await post<SoloBattle>("joinSoloBattle", { contest_id: contestId, user_id: userId });
  if (!res.status || !res.data) throw new Error(res.message ?? "Couldn't join that Solo Battle.");
  return res.data;
}

/** The host's own running Solo Battle, if any. Returns null when there isn't one. */
export async function fetchActiveSoloBattle(hostUserId: number, viewerUserId?: number): Promise<SoloBattle | null> {
  const params: Record<string, unknown> = { host_user_id: hostUserId };
  if (viewerUserId) params.user_id = viewerUserId;
  const res = await post<SoloBattle>("fetchActiveSoloBattleForHost", params).catch(() => null);
  return res?.status ? (res.data ?? null) : null;
}

export async function fetchSoloStandings(contestId: number, viewerUserId?: number): Promise<StandingRow[]> {
  const params: Record<string, unknown> = { id: contestId };
  if (viewerUserId) params.user_id = viewerUserId;
  const res = await post<{ contest?: SoloBattle; standings?: StandingRow[] }>("fetchPkBattleContestStandingsApp", params).catch(() => null);
  return res?.status ? (res.data?.standings ?? []) : [];
}
