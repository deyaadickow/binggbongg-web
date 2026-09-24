// Bingg Bongg Battle (1v1) from the browser — same PkBattleController endpoints and the same
// everyone-polls-by-room discovery the phones use. Power-ups (bombs, time, boxing gloves) are
// not on the web yet; scores here are the server's own live sums.
import { useCallback, useEffect, useRef, useState } from "react";
import { post } from "./api";

export interface BattleData {
  battle_id: number;
  room_name: string;
  player_one_user_id: number;
  player_two_user_id: number;
  player_one_score: number;
  player_two_score: number;
  target_coins?: number | null;
  winner_user_id: number | null;
  status: "pending" | "active" | "completed" | string;
  started_at?: string | null;
  ends_at?: string | null;
  trash_talk?: string | null;
}

export interface BattleInvite {
  battle_id: number;
  opponent_user_id: number;
  opponent_fullname?: string;
  opponent_username?: string;
  opponent_profile_image?: string;
  target_coins?: number | null;
}

const STATUS_POLL_MS = 3000;
const INVITE_POLL_MS = 4000;

export function parseServerDate(s?: string | null): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

/**
 * Tracks the room's battle for every role; publishers additionally see invites addressed to
 * them. `onCompleted` fires once per battle when it flips to completed.
 */
export function useBattle(roomName: string, myUserId: number | null, isPublisher: boolean, enabled: boolean, onCompleted: (b: BattleData) => void) {
  const [battle, setBattle] = useState<BattleData | null>(null);
  const [invite, setInvite] = useState<BattleInvite | null>(null);
  const [now, setNow] = useState(Date.now());
  const completedIds = useRef(new Set<number>());
  const lastOpenId = useRef<number | null>(null);
  const shownInviteIds = useRef(new Set<number>());
  const finalizing = useRef(false);

  // Room-wide status poll.
  useEffect(() => {
    if (!enabled || !roomName) return;
    let alive = true;
    async function tick() {
      const res = await post<BattleData>("fetchBattleStatus", { room_name: roomName }).catch(() => null);
      if (!alive || !res) return;
      let data = res.status ? (res.data ?? null) : null;
      // The room query only returns open battles. If ours vanished (finalized by the other
      // battler, or the room ended and the server settled it), read the final row by id.
      if (!data && lastOpenId.current !== null) {
        const fin = await post<BattleData>("fetchBattleStatus", { battle_id: lastOpenId.current }).catch(() => null);
        if (!alive) return;
        data = fin?.status ? (fin.data ?? null) : null;
        lastOpenId.current = null;
        if (data && (data.status === "pending" || data.status === "active")) data = null;
      }
      if (data && (data.status === "pending" || data.status === "active")) lastOpenId.current = data.battle_id;
      if (data && data.status === "completed" && !completedIds.current.has(data.battle_id)) {
        completedIds.current.add(data.battle_id);
        onCompleted(data);
      }
      setBattle(data && data.status !== "completed" ? data : null);
    }
    tick();
    const t = setInterval(tick, STATUS_POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [roomName, enabled, onCompleted]);

  // Invites for me (host or guest), only while nothing is running.
  useEffect(() => {
    if (!enabled || !roomName || !isPublisher || !myUserId) return;
    let alive = true;
    async function tick() {
      if (battle && battle.status !== "completed") return;
      const res = await post<BattleInvite[]>("fetchPendingBattleInvites", { user_id: myUserId, room_name: roomName }).catch(() => null);
      if (!alive || !res?.status) return;
      const fresh = (res.data ?? []).find((i) => !shownInviteIds.current.has(i.battle_id));
      if (fresh) { shownInviteIds.current.add(fresh.battle_id); setInvite(fresh); }
    }
    tick();
    const t = setInterval(tick, INVITE_POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [roomName, myUserId, isPublisher, enabled, battle]);

  // One-second clock while a battle is active; a battler finalizes the moment it hits zero.
  useEffect(() => {
    if (!battle || battle.status !== "active") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [battle]);

  const endsAt = parseServerDate(battle?.ends_at);
  const secondsLeft = battle?.status === "active" && endsAt ? Math.max(0, Math.round((endsAt - now) / 1000)) : null;
  const iAmBattler = !!battle && !!myUserId && (battle.player_one_user_id === myUserId || battle.player_two_user_id === myUserId);

  useEffect(() => {
    if (!battle || battle.status !== "active" || secondsLeft !== 0 || !iAmBattler || finalizing.current) return;
    finalizing.current = true;
    post<BattleData>("finalizeBattle", { battle_id: battle.battle_id })
      .then((res) => { if (res.status && res.data) setBattle(res.data); })
      .catch(() => undefined)
      .finally(() => { finalizing.current = false; });
  }, [battle, secondsLeft, iAmBattler]);

  const inviteOpponent = useCallback(async (opponentUserId: number, targetCoins?: number) => {
    if (!myUserId) throw new Error("Sign in first.");
    const res = await post<unknown>("inviteToBattle", { my_user_id: myUserId, room_name: roomName, opponent_user_id: opponentUserId, ...(targetCoins ? { target_coins: targetCoins } : {}) });
    if (!res.status) throw new Error(res.message ?? "Couldn't send the battle invite.");
  }, [myUserId, roomName]);

  const respond = useCallback(async (battleId: number, approve: boolean) => {
    if (!myUserId) return;
    setInvite(null);
    const res = await post<BattleData>("respondToBattleInvite", { user_id: myUserId, battle_id: battleId, approve });
    if (!res.status) throw new Error(res.message ?? "Couldn't answer that invite.");
    if (res.data) setBattle(res.data);
  }, [myUserId]);

  return { battle, invite, secondsLeft, iAmBattler, inviteOpponent, respond, dismissInvite: () => setInvite(null) };
}
