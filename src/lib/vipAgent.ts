// VIP Agents (Steve, 2026-11-14) — VipAgentController. An agent applies; once approved they send influencers
// (username, platform, handle, followers) on one standard deal that the page shows greyed out. The admin approves.
import { post } from "./api";

export type VipAgentDeal = {
  enabled: boolean; min_followers: number; percent: number; months: number; total_cap: number;
  agent_from_percent: number; agent_top_percent: number; agent_cap: number;
};
export type VipAgentInfluencer = {
  id: number; name: string; username: string | null; image: string | null; platform: string | null; handle: string | null;
  followers: number; status: "pending" | "approved" | "declined"; deal_active: boolean; agent_paid: number; submitted: string;
};
export type VipAgentState = {
  deal: VipAgentDeal;
  me: { status: "none" | "pending" | "active" | "ended" | "declined"; applied_at: string | null; code: string };
  influencers: VipAgentInfluencer[];
};
type Res = { ok: boolean; message: string; data: VipAgentState | null };

export async function fetchVipAgent(userId: number): Promise<VipAgentState | null> {
  const res = await post<VipAgentState>("fetchVipAgent", { user_id: userId });
  return res.status && res.data ? res.data : null;
}
export async function applyVipAgent(userId: number, name: string, about: string): Promise<Res> {
  const res = await post<VipAgentState>("applyVipAgent", { user_id: userId, name, about, agree: 1 });
  return { ok: !!res.status, message: res.message ?? "", data: res.data ?? null };
}
export async function submitVipInfluencer(userId: number, f: { username: string; platform: string; handle: string; followers: string }): Promise<Res> {
  const res = await post<VipAgentState>("submitVipInfluencer", { user_id: userId, ...f });
  return { ok: !!res.status, message: res.message ?? "", data: res.data ?? null };
}
