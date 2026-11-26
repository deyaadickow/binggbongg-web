// DEV ONLY (never in a production build — singingContest.ts imports this behind import.meta.env.DEV):
// fixture answers shaped exactly like the contract, so the page and the REC pill can be seen without the server.
//   /singing-contest?scdemo=1           active round: leaderboard, my entry, last month's winners
//   /singing-contest?scdemo=upcoming    the round before it starts (no entries yet, "Starts in")
//   /singing-contest?scdemo=processing  my recording is still being made
//   /go-live?singing=1&scdemo=rec       the go-live page with the red REC pill counting down
//   /singing-contest/bragging-rights?scdemo=1      Lifetime Bragging Rights: 3 past months + Legends
//   /singing-contest/bragging-rights?scdemo=empty  the board before the first month ends
// Demo singers are adults with initials only (no faces).
import { UPLOAD_BASE } from "./api";
import type { ScBragging, ScContest, ScEntry, ScRecording } from "./singingContest";

const SINGERS: [string, string, string, number][] = [
  ["maria.santos", "Maria Santos", "Philippines", 1840],
  ["budi.prasetyo", "Budi Prasetyo", "Indonesia", 1325],
  ["jake.miller", "Jake Miller", "United States", 990],
  ["ana.reyes", "Ana Reyes", "Philippines", 610],
  ["siti.rahma", "Siti Rahma", "Indonesia", 455],
  ["tom.harris", "Tom Harris", "United Kingdom", 230],
  ["carlos.diaz", "Carlos Díaz", "Mexico", 120],
];
const ME = { user_id: 99001, username: "demo.me", fullname: "Demo Me", profile_image: null, is_verified: 0, country: "Philippines" };

function entry(i: number, u: (typeof SINGERS)[number], mine = false): ScEntry {
  return {
    entry_id: 100 + i, round_id: 1, rank: i + 1, votes: u[3], is_mine: mine, post_id: 3700 + i,
    video_url: null, thumbnail_url: null, duration_s: 180 + i * 13, created_at: "2026-12-0" + (1 + (i % 8)) + "T10:00:00Z",
    user: { user_id: 6000 + i, username: u[0], fullname: u[1], profile_image: null, is_verified: i === 0 ? 1 : 0, country: u[2] },
  };
}

function contest(mode: string): ScContest {
  const upcoming = mode === "upcoming";
  const entries = upcoming ? [] : SINGERS.map((u, i) => entry(i, u));
  let mine: ScEntry | null = null;
  if (mode === "1" || mode === "") {
    mine = { ...entry(4, SINGERS[4], true), user: ME };
    entries[4] = mine;
  }
  const canRecord = mode === "rec";
  return {
    status: true, enabled: true,
    round: {
      id: 1, month: "2026-12", label: "December 2026", status: upcoming ? "upcoming" : "active",
      starts_at: "2026-11-30T16:00:00Z", ends_at: "2026-12-31T16:00:00Z",
      seconds_left: upcoming ? 0 : 12 * 86400 + 4 * 3600 + 120, seconds_to_start: upcoming ? 5 * 86400 + 3 * 3600 : 0,
      entries_count: entries.length, votes_total: entries.reduce((s, e) => s + e.votes, 0),
    },
    rules: { max_seconds: 300, one_per_month: true, extras: [{ place: 1, extra_percent: 15 }, { place: 2, extra_percent: 10 }, { place: 3, extra_percent: 5 }] },
    video: { url: UPLOAD_BASE + "uploads/1794317913_6af31e595f98f_fv_podcast_en.mp4", poster: null, language: "en" },
    me: {
      can_record: canRecord,
      reason: canRecord ? null : upcoming ? "not_started" : mode === "processing" ? "recording_in_progress" : "already_entered",
      reason_text: canRecord ? null : upcoming ? "The Singing Contest starts on December 1 at midnight (Manila time)."
        : mode === "processing" ? "Your singing video is being made." : "You already made your singing video this month.",
      entry: mine,
      recording: mode === "processing" ? { ...rec(), status: "processing", seconds_left: 0 } : null,
    },
    entries, has_more: false,
    last_winners: upcoming ? null : {
      round_id: 0, label: "November 2026",
      winners: [0, 1, 2].map((i) => ({ place: i + 1, extra_percent: [15, 10, 5][i], entry: { ...entry(i, SINGERS[[3, 5, 6][i]]), round_id: 0, entry_id: 50 + i, post_id: 3600 + i } })),
    },
  };
}

// Lifetime Bragging Rights: three past months, newest first, and the Legends they add up to.
const PEOPLE: [string, string, string][] = [
  ["maria.santos", "Maria Santos", "Philippines"], ["budi.prasetyo", "Budi Prasetyo", "Indonesia"], ["jake.miller", "Jake Miller", "United States"],
  ["ana.reyes", "Ana Reyes", "Philippines"], ["siti.rahma", "Siti Rahma", "Indonesia"], ["tom.harris", "Tom Harris", "United Kingdom"],
  ["carlos.diaz", "Carlos Díaz", "Mexico"],
];
const person = (i: number) => ({ user_id: 6000 + i, username: PEOPLE[i][0], fullname: PEOPLE[i][1], profile_image: null, is_verified: i === 0 ? 1 : 0, country: PEOPLE[i][2] });
function bragging(mode: string): ScBragging {
  if (mode === "empty") return { status: true, enabled: true, months: [], has_more: false, legends: [] };
  const months: [string, string, number[], number[]][] = [
    ["2027-03", "March 2027", [0, 1, 3], [4120, 3380, 2210]],
    ["2027-02", "February 2027", [1, 0, 5], [3650, 2990, 1740]],
    ["2027-01", "January 2027", [0, 2, 4], [3000, 2480, 1325]],
  ];
  const tally = new Map<number, { first: number; second: number; third: number }>();
  const out = months.map(([month, label, who, votes], m) => ({
    round_id: 3 - m, month, label,
    winners: who.map((i, p) => {
      const t = tally.get(i) ?? { first: 0, second: 0, third: 0 };
      if (p === 0) t.first++; else if (p === 1) t.second++; else t.third++;
      tally.set(i, t);
      return { place: p + 1, votes: votes[p], user: person(i), entry_id: 200 + m * 3 + p, post_id: m === 2 && p === 2 ? null : 3800 + m * 3 + p, thumbnail_url: null };
    }),
  }));
  const legends = [...tally.entries()]
    .map(([i, t]) => ({ user: person(i), wins: t.first + t.second + t.third, ...t }))
    .sort((a, b) => b.first - a.first || b.second - a.second || b.third - a.third)
    .map((l, k) => ({ rank: k + 1, ...l }));
  return { status: true, enabled: true, months: out, has_more: false, legends };
}

let startedAt = 0;
let stopped: ScRecording | null = null;
function rec(): ScRecording {
  const left = Math.max(0, 300 - Math.floor((Date.now() - startedAt) / 1000));
  return { recording_id: 9, round_id: 1, room_name: "bb-live-99001-1", status: "recording", reason: null, reason_text: null,
    max_seconds: 300, seconds_left: left, started_at: new Date(startedAt || Date.now()).toISOString(), entry_id: null };
}

export async function demoCall(endpoint: string, _params: Record<string, unknown>, mode: string): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 250));
  switch (endpoint) {
    case "fetchSingingContest": return contest(mode);
    case "fetchSingingContestEntries": return { status: true, round_id: 1, entries: contest(mode).entries, has_more: false };
    case "startSingingContestRecording":
      startedAt = Date.now() - 1000; stopped = null;
      return { status: true, recording: rec() };
    case "fetchSingingContestRecording": {
      if (stopped) return { status: true, recording: stopped };
      const r = rec();
      return { status: true, recording: r.seconds_left <= 0 ? { ...r, status: "processing" } : r };
    }
    case "stopSingingContestRecording":
      stopped = { ...rec(), status: "processing" };
      return { status: true, recording: stopped };
    case "fetchSingingContestBraggingRights": return bragging(mode);
    case "deleteSingingContestEntry": return { status: true, message: "Deleted." };
    default: return { status: false, message: "demo" };
  }
}
