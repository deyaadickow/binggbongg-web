// UI for the multi-player battle engines in the web live room: the "Battle" menu + pickers,
// invite cards, the score strips shown above the video grid, and the result overlays.
import { useState } from "react";
import { displayName, type UserSummary } from "../lib/api";
import { clock, secondsUntil, type B555Data, type Battle2v2Data, type Invite2v2, type MarathonData, type SeriesData } from "../lib/battles";

export interface Person { user_id: number; fullname?: string | null; username?: string | null; profile_image?: string | null }
export type NameOf = (id: number | null | undefined) => string;

export function personName(p?: Person | null): string {
  return p ? displayName({ fullname: p.fullname ?? undefined, username: p.username ?? undefined } as Partial<UserSummary>) : "Someone";
}

export function Overlay({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "grid", placeItems: "center", zIndex: 40, padding: 16 }} onClick={onClose}>
      <div className="card pad" style={{ width: "min(440px, 100%)", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h2 className="card-title" style={{ marginBottom: 10 }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export type BattleKind = "1v1" | "series" | "2v2" | "marathon" | "555";

export const BATTLE_KINDS: { kind: BattleKind; title: string; blurb: string; minPeople: number }[] = [
  { kind: "1v1", title: "Bingg Bongg Battle", blurb: "1v1 · 5 minutes · most gift coins wins", minPeople: 2 },
  { kind: "series", title: "Best Out Of", blurb: "Best of 3, 5, 7, 9 or 11 · 5-minute rounds", minPeople: 2 },
  { kind: "2v2", title: "2v2 Battle", blurb: "You + a teammate vs. two others · 5 minutes", minPeople: 4 },
  { kind: "marathon", title: "No Time Limit", blurb: "First to 100,000 gift coins wins", minPeople: 2 },
  { kind: "555", title: "5-5-5", blurb: "5 Games / 5 Minutes / Reach 5000 coins and win", minPeople: 2 },
];

/** Step 1 of the Battle button: which kind of battle. */
export function BattleMenu({ peopleOnScreen, onPick, onClose }: { peopleOnScreen: number; onPick: (k: BattleKind) => void; onClose: () => void }) {
  return (
    <Overlay title="⚔️ Start a battle" onClose={onClose}>
      {peopleOnScreen < 2 && <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>You're the only one on screen. Accept a viewer's "Ask to join" request first — battles are between the people streaming together.</p>}
      {BATTLE_KINDS.map((k) => {
        const ok = peopleOnScreen >= k.minPeople;
        return (
          <button key={k.kind} className="btn block" style={{ marginBottom: 8, textAlign: "left", opacity: ok ? 1 : 0.45 }} disabled={!ok} onClick={() => onPick(k.kind)}>
            <div style={{ fontWeight: 800 }}>{k.title}</div>
            <div className="muted" style={{ fontSize: 12, fontWeight: 400 }}>{ok ? k.blurb : `Needs ${k.minPeople} people on screen`}</div>
          </button>
        );
      })}
    </Overlay>
  );
}

/** Multi-select of the other people on screen (Best Out Of, No Time Limit, 5-5-5). */
export function MultiPicker({ title, blurb, people, lengths, onSubmit, onClose }: {
  title: string; blurb: string; people: Person[]; lengths?: number[];
  onSubmit: (ids: number[], length?: number) => Promise<void>; onClose: () => void;
}) {
  const [picked, setPicked] = useState<number[]>(people.length === 1 ? [people[0].user_id] : []);
  const [length, setLength] = useState<number>(lengths?.[1] ?? lengths?.[0] ?? 0);
  const [busy, setBusy] = useState(false);
  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <Overlay title={title} onClose={onClose}>
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>{blurb}</p>
      {lengths && (
        <div className="row" style={{ marginBottom: 10, flexWrap: "wrap" }}>
          <span className="soft" style={{ fontSize: 13 }}>Best of</span>
          {lengths.map((n) => (
            <button key={n} className={`btn small${length === n ? "" : " ghost"}`} onClick={() => setLength(n)}>{n}</button>
          ))}
        </div>
      )}
      <div className="soft" style={{ fontSize: 13, marginBottom: 6 }}>Who's in?</div>
      {people.map((p) => (
        <label key={p.user_id} className="row" style={{ padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 10, marginBottom: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={picked.includes(p.user_id)} onChange={() => toggle(p.user_id)} />
          <span style={{ fontWeight: 700 }}>{personName(p)}</span>
        </label>
      ))}
      <button className="btn block" style={{ marginTop: 10 }} disabled={busy || picked.length === 0} onClick={async () => {
        setBusy(true);
        try { await onSubmit(picked, lengths ? length : undefined); } finally { setBusy(false); }
      }}>{busy ? "Sending…" : `Send invite${picked.length > 1 ? "s" : ""}`}</button>
    </Overlay>
  );
}

/** 2v2: pick your teammate; the other two on screen are the opposing team. */
export function TwoVTwoPicker({ people, onSubmit, onClose }: { people: Person[]; onSubmit: (teammate: number, opp1: number, opp2: number) => Promise<void>; onClose: () => void }) {
  const [teammate, setTeammate] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const opponents = people.filter((p) => p.user_id !== teammate);
  return (
    <Overlay title="2v2 Battle — pick your teammate" onClose={onClose}>
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>You + your teammate vs. the other two on screen. 5 minutes, the team with more gift coins wins.</p>
      {people.map((p) => (
        <button key={p.user_id} className={`btn block${teammate === p.user_id ? "" : " ghost"}`} style={{ marginBottom: 6 }} onClick={() => setTeammate(p.user_id)}>{personName(p)}</button>
      ))}
      {teammate !== null && opponents.length === 2 && (
        <p className="soft" style={{ fontSize: 13 }}>Opponents: <b>{personName(opponents[0])}</b> &amp; <b>{personName(opponents[1])}</b></p>
      )}
      <button className="btn block" style={{ marginTop: 10 }} disabled={busy || teammate === null || opponents.length !== 2} onClick={async () => {
        if (teammate === null) return;
        setBusy(true);
        try { await onSubmit(teammate, opponents[0].user_id, opponents[1].user_id); } finally { setBusy(false); }
      }}>{busy ? "Sending…" : "Send invites"}</button>
    </Overlay>
  );
}

// ---- invite cards -----------------------------------------------------------------------
export function InviteCard({ title, body, onAnswer, onClose }: { title: string; body: React.ReactNode; onAnswer: (approve: boolean) => void; onClose: () => void }) {
  return (
    <Overlay title={title} onClose={onClose}>
      <p className="soft">{body}</p>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" style={{ flex: 1 }} onClick={() => onAnswer(true)}>Accept</button>
        <button className="btn ghost" style={{ flex: 1 }} onClick={() => onAnswer(false)}>Decline</button>
      </div>
    </Overlay>
  );
}

export function describe2v2Invite(i: Invite2v2): string {
  const n = (f?: string, u?: string) => displayName({ fullname: f, username: u } as Partial<UserSummary>);
  return `${n(i.initiator_fullname, i.initiator_username)} set up a 2v2: you + ${n(i.my_teammate_fullname, i.my_teammate_username)} vs. ${n(i.opponent1_fullname, i.opponent1_username)} & ${n(i.opponent2_fullname, i.opponent2_username)}. 5 minutes, the team with more gift coins wins.`;
}

// ---- strips ------------------------------------------------------------------------------
function Strip({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card" style={{ marginBottom: 8, padding: "8px 12px" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b style={{ color: "var(--gold)" }}>{title}</b>
        {right}
      </div>
      {children}
    </div>
  );
}

const Bar = ({ pct }: { pct: number }) => (
  <div style={{ height: 6, borderRadius: 3, background: "#2a2a2a", overflow: "hidden", marginTop: 4 }}>
    <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: 6, background: "var(--gold)" }} />
  </div>
);

const waiting = (accepted: number, total: number) => <span className="pill">Waiting for answers… {accepted}/{total}</span>;

export function SeriesStrip({ d, now, nameOf }: { d: SeriesData; now: number; nameOf: NameOf }) {
  const accepted = d.participants.filter((p) => p.invite_status === "accepted");
  const secs = d.status === "active" ? secondsUntil(d.current_round_ends_at, now) : null;
  return (
    <Strip title={`Best Out Of ${d.length}${d.status === "active" && d.current_round_number ? ` · Round ${d.current_round_number}` : ""}`}
      right={d.status === "pending_invites" ? waiting(accepted.length, d.participants.length) : <span className="pill">{clock(secs)}</span>}>
      <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>First to {d.rounds_needed_to_win} rounds. Each round is 5 minutes.</div>
      {(d.status === "active" ? accepted : d.participants).map((p) => (
        <div key={p.user_id} className="row" style={{ justifyContent: "space-between", marginTop: 4, fontSize: 13 }}>
          <span><b>{nameOf(p.user_id) || personName(p)}</b>{p.invite_status !== "accepted" ? <span className="muted"> · {p.invite_status}</span> : null}</span>
          <span><span title="rounds won">{"★".repeat(p.rounds_won ?? 0)}</span> <span style={{ color: "var(--gold)" }}>{(p.current_round_score ?? 0).toLocaleString()}</span></span>
        </div>
      ))}
    </Strip>
  );
}

export function TwoVTwoStrip({ d, now, nameOf }: { d: Battle2v2Data; now: number; nameOf: NameOf }) {
  const team = (t: "A" | "B") => d.participants.filter((p) => p.team === t);
  const names = (t: "A" | "B") => team(t).map((p) => nameOf(p.user_id) || personName(p)).join(" & ");
  const a = d.team_a_score ?? 0, b = d.team_b_score ?? 0;
  const total = a + b;
  const accepted = d.participants.filter((p) => p.invite_status === "accepted").length;
  const secs = d.status === "active" ? secondsUntil(d.ends_at, now) : null;
  return (
    <Strip title="2v2 Battle" right={d.status === "pending_invites" ? waiting(accepted, d.participants.length) : <span className="pill">{clock(secs)}</span>}>
      <div className="row" style={{ justifyContent: "space-between", marginTop: 6, fontSize: 13 }}>
        <span><b>{names("A")}</b> <span style={{ color: "var(--gold)" }}>{a.toLocaleString()}</span></span>
        <span><span style={{ color: "var(--gold)" }}>{b.toLocaleString()}</span> <b>{names("B")}</b></span>
      </div>
      <Bar pct={total > 0 ? (a / total) * 100 : 50} />
    </Strip>
  );
}

export function MarathonStrip({ d, myUserId, nameOf, onVote }: { d: MarathonData; myUserId: number | null; nameOf: NameOf; onVote: (approve: boolean) => void }) {
  const accepted = d.participants.filter((p) => p.invite_status === "accepted");
  const me = accepted.find((p) => p.user_id === myUserId);
  const leader = Math.max(1, ...accepted.map((p) => p.current_score ?? 0));
  return (
    <Strip title="No Time Limit" right={d.status === "pending_invites" ? waiting(accepted.length, d.participants.length) : <span className="pill">First to {d.target_points.toLocaleString()}</span>}>
      {(d.status === "active" ? accepted : d.participants).map((p) => (
        <div key={p.user_id} style={{ marginTop: 6, fontSize: 13 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span><b>{nameOf(p.user_id) || personName(p)}</b>{p.invite_status !== "accepted" ? <span className="muted"> · {p.invite_status}</span> : null}{p.cancel_vote ? <span className="muted"> · voted to end</span> : null}</span>
            <span style={{ color: "var(--gold)" }}>{(p.current_score ?? 0).toLocaleString()}</span>
          </div>
          {d.status === "active" && <Bar pct={((p.current_score ?? 0) / Math.max(leader, d.target_points)) * 100} />}
        </div>
      ))}
      {d.status === "active" && me && (
        <div className="row" style={{ marginTop: 8, fontSize: 12 }}>
          <span className="muted">End early: {d.cancel_vote_count}/{d.accepted_count} agree</span>
          <span className="spacer" />
          {me.cancel_vote
            ? <button className="btn small ghost" onClick={() => onVote(false)}>Withdraw my vote</button>
            : <button className="btn small ghost" onClick={() => onVote(true)}>Vote to end</button>}
        </div>
      )}
    </Strip>
  );
}

export function B555Strip({ d, myUserId, nameOf, onCancel }: { d: B555Data; myUserId: number | null; nameOf: NameOf; onCancel?: () => void }) {
  const accepted = d.participants.filter((p) => p.invite_status === "accepted");
  const k = Math.round(d.coins_per_game / 1000);
  return (
    <Strip title={`${d.games_to_win} Games / ${Math.round(d.seconds_per_game / 60)} Minutes / Reach ${d.coins_per_game.toLocaleString()} coins and win`}
      right={d.status === "pending_invites" ? waiting(accepted.length, d.participants.length) : <span className="pill">5-5-5</span>}>
      {(d.status === "active" ? accepted : d.participants).map((p) => {
        const done = !!p.finished_at || (p.games_completed ?? 0) >= d.games_to_win;
        const gameNo = Math.min(d.games_to_win, p.current_game_no ?? (p.games_completed ?? 0) + 1);
        return (
          <div key={p.user_id} style={{ marginTop: 6, fontSize: 13 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span><b>{nameOf(p.user_id) || personName(p)}</b>{p.invite_status !== "accepted" ? <span className="muted"> · {p.invite_status}</span> : null}</span>
              {d.status === "active" && (
                done
                  ? <span className="pill">Finished in {clock(p.finish_seconds ?? 0)}</span>
                  : <span className="muted">Game {gameNo} out of {d.games_to_win} · <span style={{ color: "var(--gold)" }}>{(p.current_game_coins ?? 0).toLocaleString()}</span>/{k}K · {(p.total_coins ?? 0).toLocaleString()} total{p.seconds_left !== null && p.seconds_left !== undefined ? ` · ${clock(p.seconds_left)}` : ""}</span>
              )}
            </div>
            {d.status === "active" && !done && <Bar pct={((p.current_game_coins ?? 0) / d.coins_per_game) * 100} />}
          </div>
        );
      })}
      {d.status === "pending_invites" && onCancel && myUserId === d.host_user_id && (
        <div className="row" style={{ marginTop: 8 }}><span className="spacer" /><button className="btn small ghost" onClick={onCancel}>Cancel</button></div>
      )}
    </Strip>
  );
}

// ---- results -----------------------------------------------------------------------------
export function resultTitle(winnerId: number | null | undefined, myUserId: number | null, iPlayed: boolean, cancelled: boolean): string {
  if (cancelled) return "Battle cancelled";
  if (!winnerId) return "It's a tie";
  if (!iPlayed) return "Battle over!";
  return winnerId === myUserId ? "🏆 You won!" : "You lost this one";
}

export function ResultOverlay({ title, rows, onClose }: { title: string; rows: { label: string; value: string; win?: boolean }[]; onClose: () => void }) {
  return (
    <Overlay title={title} onClose={onClose}>
      {rows.map((r, i) => (
        <div key={i} className="row" style={{ justifyContent: "space-between", fontSize: 16, padding: "4px 0" }}>
          <span style={{ fontWeight: r.win ? 800 : 500, color: r.win ? "var(--gold)" : undefined }}>{r.win ? "🏆 " : ""}{r.label}</span>
          <span style={{ color: "var(--gold)" }}>{r.value}</span>
        </div>
      ))}
      <button className="btn block" style={{ marginTop: 12 }} onClick={onClose}>Close</button>
    </Overlay>
  );
}
