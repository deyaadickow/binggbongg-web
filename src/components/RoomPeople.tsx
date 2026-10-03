// Steve, 2026-09-27: "Build them on all platforms please" — the phones' two live-room header
// buttons: "Who's Playing" (who is playing a tap game in this room right now, and which game)
// and "Invite" (pick someone you follow and pull them into an open seat). Both use endpoints
// the apps already call: fetchCurrentTapGamePlayers and inviteToLive.
import { useEffect, useState } from "react";
import { post, type UserSummary } from "../lib/api";
import { Avatar } from "./Common";
import { Overlay, personName, type Person } from "./BattleEngines";

export interface CurrentPlayer extends Person { game_emoji?: string | null; game_name?: string | null }

export async function fetchCurrentTapGamePlayers(roomName: string): Promise<CurrentPlayer[]> {
  const res = await post<CurrentPlayer[]>("fetchCurrentTapGamePlayers", { room_name: roomName });
  return res.status ? (res.data ?? []) : [];
}

/** Steve, 2026-10-03: "show only members you are following and only if they are online, also
 *  add a search on top." Both happen on the server — fetchFollowingList paged the follow list
 *  newest-first with no activity filter, so you got 50 people picked by WHEN you followed them.
 *  The search term goes with the request rather than filtering what came back: the person you
 *  are looking for is usually the one NOT on screen. "Online" is the app's existing definition
 *  (live right now, or any activity in the last 15 minutes) — see UsersController. */
export async function fetchOnlineFollowingPeople(myUserId: number, search?: string): Promise<Person[]> {
  const body: Record<string, unknown> = { user_id: myUserId };
  const term = (search ?? "").trim();
  if (term) body.search = term;
  const res = await post<(Person & { id?: number })[]>("fetchOnlineFollowingList", body);
  if (!res.status) return [];
  return (res.data ?? [])
    .map((u) => ({ user_id: u.user_id ?? u.id ?? 0, fullname: u.fullname, username: u.username, profile_image: u.profile_image }))
    .filter((u) => u.user_id > 0);
}

export async function inviteToLive(myUserId: number, roomName: string, inviteUserId: number): Promise<string> {
  const res = await post<unknown>("inviteToLive", { user_id: myUserId, room_name: roomName, invite_user_id: inviteUserId });
  if (!res.status) throw new Error(res.message ?? "Couldn't send that invite.");
  return res.message ?? "Invited.";
}

function row(p: Person, right: React.ReactNode, sub?: string) {
  return (
    <div key={p.user_id} className="row" style={{ gap: 10, padding: "8px 10px", border: "1px solid var(--gold-border)", borderRadius: 10, background: "#000" }}>
      <Avatar user={{ fullname: p.fullname ?? undefined, username: p.username ?? undefined, profile_image: p.profile_image ?? undefined } as Partial<UserSummary>} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ color: "var(--gold)" }}>{personName(p)}</b>
        {sub && <div className="muted" style={{ fontSize: 12 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

export function WhosPlayingOverlay({ roomName, onClose }: { roomName: string; onClose: () => void }) {
  const [players, setPlayers] = useState<CurrentPlayer[] | null>(null);
  useEffect(() => { fetchCurrentTapGamePlayers(roomName).then(setPlayers).catch(() => setPlayers([])); }, [roomName]);
  return (
    <Overlay title="Who's Playing" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Everyone playing a game in your room right now.</p>
      {players === null ? <p className="muted">Loading…</p>
        : players.length === 0 ? <p className="muted">No one is playing a game right now.</p>
        : <div style={{ display: "grid", gap: 6 }}>{players.map((p) => row(p, null, `${p.game_emoji ?? "🎮"} ${p.game_name ?? "Playing"}`))}</div>}
    </Overlay>
  );
}

export function InviteOverlay({ myUserId, roomName, excludeIds, onToast, onClose }: { myUserId: number; roomName: string; excludeIds: Set<number>; onToast: (s: string) => void; onClose: () => void }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [invited, setInvited] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState("");
  // Debounced: one request per typed name, not one per letter. The cleanup cancels the pending
  // call, so an abandoned prefix never lands after the term that replaced it.
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      fetchOnlineFollowingPeople(myUserId, query)
        .then((list) => { if (alive) setPeople(list.filter((p) => !excludeIds.has(p.user_id))); })
        .catch(() => { if (alive) setPeople([]); });
    }, query ? 350 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [myUserId, query]); // eslint-disable-line react-hooks/exhaustive-deps
  async function invite(p: Person) {
    try {
      await inviteToLive(myUserId, roomName, p.user_id);
      setInvited((cur) => new Set(cur).add(p.user_id));
      onToast(`Invited ${personName(p)}.`);
    } catch (e) { onToast((e as Error).message); }
  }
  return (
    <Overlay title="Invite to the Room" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>People you follow who are online right now — they get a push that opens your room as a guest.</p>
      <input
        className="input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name"
        aria-label="Search the people you follow"
        style={{ width: "100%", marginBottom: 10 }}
      />
      {people === null ? <p className="muted">Loading…</p>
        : people.length === 0 ? <p className="muted">{query.trim() ? "No one online matches that name." : "No one you follow is online right now."}</p>
        : <div style={{ display: "grid", gap: 6, maxHeight: 360, overflowY: "auto" }}>
            {people.map((p) => row(p, invited.has(p.user_id)
              ? <span className="pill" style={{ color: "var(--gold)" }}>✓ Invited</span>
              : <button className="btn small" style={{ background: "var(--gold-border)", color: "#000", borderColor: "#000" }} onClick={() => invite(p)}>Invite</button>))}
          </div>}
    </Overlay>
  );
}
