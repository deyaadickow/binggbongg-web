// Help (Steve, 2026-10-23): a member in trouble uploads a 60-second video and asks for GIFTS —
// his framing, and the whole design: "The members are asking for help to get gifts not money,
// just like how everyone asks to give them a gift when they are in a battle."
//
// Keys below are read off HelpController, not guessed. Guessing a response key fails silently as
// an empty list, which looks exactly like "no data" — the Following tab said "No members yet."
// against 30 real rows because it had copied `toUser` from the PHP when the JSON says `to_user`.
import { post } from "./api";

// Every call here is wrapped. post() throws on a non-2xx, and Help can legitimately be unreachable:
// the routes 404 until the backend is deployed, and the endpoints answer status:false whenever the
// feature switch is off. An unhandled rejection leaves the page on "Loading…" forever, which is
// what it did the first time this was opened. Failing to an empty state is the honest answer.
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

export interface HelpCampaign {
  id: number;
  user_id: number;
  post_id: number | null;
  fullname?: string | null;
  username?: string | null;
  profile_image?: string | null;
  description?: string | null;
  goal_amount?: number | null;
  status: "active" | "ended" | "frozen" | "refunded";
  starts_at?: string | null;
  ends_at?: string | null;
  days_left: number;
  /** PAYABLE coins only. The dead slice is tracked server-side but is not "raised". */
  raised_coins: number;
  is_open: boolean;
  contributors?: HelpContributor[];
}

export interface HelpContributor {
  /** null when they gave anonymously — the row still exists, only the name is withheld. */
  user_id: number | null;
  fullname: string;
  username?: string | null;
  profile_image?: string | null;
  total_coins: number;
  is_anonymous: boolean;
}

export interface HelpStatus {
  feature_enabled: boolean;
  /** The server's own sentence. Shown verbatim — it owns the rule, so it owns the wording. */
  blocked_reason: string | null;
  video_seconds: number;
  campaign_days: number;
  allowed_countries: string[];
  campaign: HelpCampaign | null;
}

export async function fetchHelpStatus(userId: number): Promise<HelpStatus | null> {
  return safe(async () => {
    const r = await post<HelpStatus>("fetchHelpStatus", { user_id: userId });
    return r.status ? (r.data ?? null) : null;
  }, null);
}

/** Backs both the Help tab and the one-every-20-to-30 insertion in the feed. */
export async function fetchHelpCampaigns(start = 0, count = 20): Promise<{ rows: HelpCampaign[]; everyMin: number; everyMax: number }> {
  return safe(async () => {
    const r = await post<HelpCampaign[]>("fetchHelpCampaigns", { start, count });
    const raw = r as unknown as { feed_every_min?: number; feed_every_max?: number };
    return {
      rows: r.status ? (r.data ?? []) : [],
      everyMin: raw.feed_every_min ?? 20,
      everyMax: raw.feed_every_max ?? 30,
    };
  }, { rows: [], everyMin: 20, everyMax: 30 });
}

export async function fetchHelpCampaign(id: number): Promise<HelpCampaign | null> {
  return safe(async () => {
    const r = await post<HelpCampaign>("fetchHelpCampaign", { help_campaign_id: id });
    return r.status ? (r.data ?? null) : null;
  }, null);
}

export async function fetchHelpContributors(id: number): Promise<HelpContributor[]> {
  return safe(async () => {
    const r = await post<HelpContributor[]>("fetchHelpContributors", { help_campaign_id: id });
    return r.status ? (r.data ?? []) : [];
  }, []);
}

export async function createHelpCampaign(userId: number, postId: number, description: string, goal: number | null) {
  return post("createHelpCampaign", {
    user_id: userId,
    post_id: postId,
    ...(description.trim() ? { description: description.trim() } : {}),
    ...(goal && goal > 0 ? { goal_amount: goal } : {}),
  });
}

/** The gift. Anonymous is the sender's choice and only hides their name on the public page. */
export async function giftToHelpCampaign(userId: number, campaignId: number, coins: number, anonymous: boolean) {
  return post("giftToHelpCampaign", {
    user_id: userId,
    help_campaign_id: campaignId,
    coins,
    is_anonymous: anonymous ? 1 : 0,
  });
}
