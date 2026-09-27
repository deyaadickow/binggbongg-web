// UI for the multi-player battle engines in the web live room: the "Battle" menu + pickers,
// invite cards, the score strips shown above the video grid, and the result overlays.
import { useState } from "react";
import { mediaUrl } from "../lib/api";
import { searchVirtualMembers, secondsUntil as vbSecondsUntil, clock as vbClock, type VirtualBattleData, type VirtualGiftRecord, type VirtualMember, type VirtualParticipant } from "../lib/battles";
import { useEffect as useEffectVB, useRef as useRefVB, useState as useStateVB } from "react";
import { displayName, type UserSummary } from "../lib/api";
import { clock, secondsUntil, type B555Data, type Battle2v2Data, type Invite2v2, type MarathonData, type SeriesData } from "../lib/battles";

export interface Person { user_id: number; fullname?: string | null; username?: string | null; profile_image?: string | null }
export type NameOf = (id: number | null | undefined) => string;

export function personName(p?: Person | null): string {
  return p ? displayName({ fullname: p.fullname ?? undefined, username: p.username ?? undefined } as Partial<UserSummary>) : "Someone";
}

export function Overlay({ title, children, onClose, width = 440 }: { title: string; children: React.ReactNode; onClose: () => void; width?: number }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "grid", placeItems: "center", zIndex: 40, padding: 16 }} onClick={onClose}>
      <div className="card pad" style={{ width: `min(${width}px, 100%)`, maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h2 className="card-title" style={{ marginBottom: 10 }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export type BattleKind =
  | "1v1" | "gameLimit" | "virtual" | "series" | "2v2" | "marathon" | "555" | "solo"
  // Android numbers this one #5 and it belongs between Best Out Of and 5-5-5. It isn't a battle
  // you start against someone in the room — it's a personal 31-day streak you opt into — so it
  // needs no people on screen.
  | "challenge31"
  // The trailing unnumbered rows. Android calls them reference rows: they open a screen or an
  // explanation rather than starting anything.
  | "pkContests" | "gamesExplained" | "lifetimeBoard" | "punishments";

/** Order, numbering and the (i) wording are Android's showBattleMenu, verbatim — the phones
 *  read #1..#9 and web should say the same thing about the same battle. `built: false` is a
 *  type that exists on the phones but has no web engine yet; it stays visible with its
 *  explanation rather than silently missing, and says so on tap. */
export const BATTLE_KINDS: {
  kind: BattleKind; title: string; blurb: string; minPeople: number;
  /** Absent on the reference rows — the phones leave those unnumbered too. */
  number?: string; info: string; built?: boolean;
  /** Opens a screen or an explanation instead of starting a battle: never people-gated. */
  reference?: boolean;
}[] = [
  { kind: "1v1", number: "#1", title: "Bingg Bongg Battle", blurb: "1v1 · 5 minutes · most coins wins", minPeople: 2,
    info: "Challenge another live streamer to a real-time, gift-scored battle. A 5-minute countdown starts the moment both sides accept — whoever's received the most gifts when time runs out wins." },
  { kind: "gameLimit", number: "#2", title: "Game Limit", blurb: "1v1 · first to your coin target", minPeople: 2,
    info: "Same as Bingg Bongg Battle, but you and your opponent agree on a custom coin target before starting. First to reach it wins instantly — if neither gets there in 5 minutes, whoever has the most coins wins." },
  { kind: "virtual", number: "#3", title: "Virtual Battle", blurb: "Host live, battle members who aren't", minPeople: 1,
    info: "You go live, then pick up to 3 members to battle with — any mix of guests already in your room and virtual members who aren't live, shown by the photo or looping video they chose. Everyone's followers get notified so they can jump in and gift — every gift is logged with the sender's name so you know exactly who to thank." },
  { kind: "series", number: "#4", title: "Best Out Of", blurb: "Best of 3 to 11 · 5-minute rounds", minPeople: 2,
    info: "A best-of series (3, 5, 7, 9, or 11 rounds), with up to 4 players in the battle. Each round is its own Bingg Bongg Battle — whoever wins the majority of rounds wins the series." },
  { kind: "challenge31", number: "#5", title: "31 Day Battle Challenge", blurb: "Battle daily for 31 days · up to 15% bonus", minPeople: 1, reference: true,
    info: "A personal 31-day streak, starting whenever you opt in. Battle at least once a day to keep your streak alive — hit 1, 2, or 3+ qualifying battles a day for a 5%, 10%, or 15% bonus on everything you earn that month. Miss a day and the streak restarts." },
  { kind: "555", number: "#6", title: "5-5-5", blurb: "5 games · 5 minutes · 5,000 coins", minPeople: 2,
    info: "Race to finish 5 games first, against up to 3 other players. Each game: first to 5000 coins wins, on your own 5-minute clock — you can start your next game the moment you finish one, even if others are still on theirs. Whoever completes all 5 games first wins the whole battle." },
  { kind: "marathon", number: "#7", title: "No Time Limit", blurb: "First to 100,000 coins wins", minPeople: 2,
    info: "Race to 100,000 points against up to 4 players — no time limit at all. Play as much or as little as you want and pick it back up anytime; the battle stays open until someone reaches 100,000. Everyone gets paid for whatever they've earned, even if all players agree to cancel it before it's won." },
  { kind: "2v2", number: "#8", title: "2v2 Battle", blurb: "Two teams of two · 5 minutes", minPeople: 4,
    info: "2 hosts team up against 2 other hosts, all 4 in this same live room. Pick a teammate, then 2 opponents — a 5-minute countdown starts once everyone accepts, and whichever TEAM'S combined gifts are highest when time runs out wins." },
  // Solo Battle needs nobody else on screen — the room's viewers are the entrants, so
  // minPeople is 1. Starting one is host-only, gated at the call site like the phones do.
  { kind: "solo", number: "#9", title: "Solo Battle", blurb: "Anyone watching can join and compete", minPeople: 1,
    info: "Start one instantly, no admin needed. Everyone watching gets 2 minutes to go live and join — whoever's received the most gifts when it ends wins. Tap any name on the leaderboard to jump straight to their live." },
  // Unnumbered from here down, exactly as on the phones: these aren't battles you can start, so
  // they carry no "#n" and never check how many people are on screen.
  { kind: "pkContests", title: "PK Battle Contests", blurb: "Admin-run · scored by gift coins", minPeople: 1, reference: true,
    info: "Admin-run contests, scored by total gift coins received while they're running. Geographic contests pit real member locations against each other (e.g. USA vs Canada); Member contests are a curated list (e.g. \"top 20\"). Free to enter, no charge to battle — whoever's highest when it ends gets lifetime bragging rights." },
  { kind: "gamesExplained", title: "Games Explained", blurb: "Play games while you battle", minPeople: 1, reference: true,
    info: "You can play any of our games — Balloon Pop, Fishing, Deer Hunting, and more — anytime, even while you're in a battle. Every member in the room can jump into a game whenever they want, battling or not." },
  { kind: "lifetimeBoard", title: "Lifetime Battle Board", blurb: "Every contest, all time", minPeople: 1, reference: true,
    info: "Your full battle history, going back to day one — browse it day by day within a month, or month by month across a year. Tap into your history with any one member to see your total wins, lifetime score, and trash talk with them. Visible on your own profile and everyone else's." },
  { kind: "punishments", title: "Friendly Punishment Suggestions", blurb: "Agree a forfeit before you start", minPeople: 1, reference: true,
    info: "Battling just for fun? Agree on a friendly punishment for whoever loses before you start — tap in for a random pick, or browse the full list together. Admin-managed, so the list keeps growing." },
];

/** Step 1 of the Battle button: which kind of battle. Numbered and with an (i) per row,
 *  matching the phones (Steve, 2026-09-08: "Please add the (i) for information for every
 *  game" — the same treatment the Battle menu carries there). */
export function BattleMenu({ peopleOnScreen, onPick, onClose, onNotice }: { peopleOnScreen: number; onPick: (k: BattleKind) => void; onClose: () => void; onNotice: (msg: string) => void }) {
  const [info, setInfo] = useState<(typeof BATTLE_KINDS)[number] | null>(null);

  if (info) {
    return (
      <Overlay title={info.title} onClose={() => setInfo(null)} width={560}>
        <p className="soft" style={{ marginTop: 0, whiteSpace: "pre-line" }}>{info.info}</p>
        <button className="btn ghost block" onClick={() => setInfo(null)}>Back</button>
      </Overlay>
    );
  }

  return (
    <Overlay title="⚔️ Start a battle" onClose={onClose} width={560}>
      {peopleOnScreen < 2 && <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>You're the only one on screen. Accept a viewer's "Ask to join" request first — battles are between the people streaming together. The rows further down open on their own.</p>}
      {BATTLE_KINDS.map((k) => {
        // A reference row opens a screen or an explanation, so who's on screen is irrelevant to
        // it — gating those on headcount would hide the Lifetime Board from anyone alone.
        const ok = k.reference === true || peopleOnScreen >= k.minPeople;
        // Steve, 2026-09-24: a dimmed box read as broken, and three texts on one row wrapped
        // ("it has 2 lines"). Every kind stays full brightness; each row is the title plus ONE
        // line — the description, or, when it can't start yet, why (repeated as a toast on tap).
        return (
          <div key={k.kind} className="battle-row">
            <button className="btn block battle-kind"
              onClick={() => {
                if (k.built === false) { onNotice(`${k.title} is coming soon.`); return; }
                if (!ok) { onNotice(`${k.title} needs ${k.minPeople} people on screen — you have ${peopleOnScreen}.`); return; }
                // Games Explained has nothing to select — it IS the explanation — so tapping the
                // row opens the same popup its (i) does, rather than a dead "coming soon". Same
                // exception the phones make for this one row.
                if (k.kind === "gamesExplained") { setInfo(k); return; }
                onPick(k.kind);
              }}>
              <span className="kind-title">{k.number ? `${k.number} ` : ""}{k.title}</span>
              <span className="kind-blurb muted">{k.blurb}</span>
              {ok && k.built !== false ? <span className="kind-go">›</span> : (
                // Two spellings of the same pill: CSS shows the long one normally and the short
                // one on a phone. Truncating the TITLE to keep "Needs 2 people" whole gets the
                // priority backwards — the title is what identifies the row, and the reason is
                // repeated as a toast on tap anyway.
                <span className="kind-need">
                  <span className="need-long">{k.built === false ? "Coming soon" : `Needs ${k.minPeople} people`}</span>
                  <span className="need-short">{k.built === false ? "Soon" : `${k.minPeople}+`}</span>
                </span>
              )}
            </button>
            <button className="btn ghost battle-info" title={`About ${k.title}`} onClick={() => setInfo(k)}>i</button>
          </div>
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


// ---- Virtual Battle (Steve, 2026-09-27) ---------------------------------------------------

/** Looping muted video, or the chosen photo, or the profile photo, or initials in gold. */
export function VirtualLook({ p, size = 96 }: { p: { virtual_media_url?: string | null; virtual_media_type?: string | null; profile_image?: string | null; fullname?: string | null; username?: string | null }; size?: number }) {
  const url = p.virtual_media_url || "";
  const name = personName(p as Person);
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
  const box: React.CSSProperties = { width: size, height: size, borderRadius: 8, objectFit: "cover", background: "#000", display: "block" };
  if (url && p.virtual_media_type === "video") return <video src={url} muted loop autoPlay playsInline style={box} />;
  const img = url || (p.profile_image ? mediaUrl(p.profile_image) : "");
  if (img) return <img src={img} alt="" style={box} />;
  return <div style={{ ...box, display: "grid", placeItems: "center", color: "var(--gold)", fontWeight: 800, fontSize: size * 0.3 }}>{initials}</div>;
}

/** Host only: guests in the room + member search, up to 3. */
export function VirtualPicker({ myUserId, guests, onSubmit, onClose }: { myUserId: number; guests: Person[]; onSubmit: (ids: number[]) => Promise<void>; onClose: () => void }) {
  const [selected, setSelected] = useStateVB<Map<number, string>>(new Map());
  const [query, setQuery] = useStateVB("");
  const [results, setResults] = useStateVB<VirtualMember[]>([]);
  const [busy, setBusy] = useStateVB(false);
  const [note, setNote] = useStateVB("");
  const toggle = (id: number, name: string) => {
    setSelected((cur) => {
      const next = new Map(cur);
      if (next.has(id)) next.delete(id);
      else if (next.size >= 3) { setNote("Up to 3 members."); return cur; }
      else next.set(id, name);
      setNote("");
      return next;
    });
  };
  // Steve, 2026-09-27: "also add members that are not live they can see and choose to battle
  // with or they can search for them as well" — an empty search loads the server's browse list
  // (members not hosting a live, most recently active first) on open; 2+ letters searches everyone.
  async function search(text?: string) {
    const q = (text ?? query).trim();
    if (q.length === 1) { setNote("Type at least 2 letters."); return; }
    setBusy(true);
    try { setResults(await searchVirtualMembers(myUserId, q)); } finally { setBusy(false); }
  }
  useEffectVB(() => { search(""); }, []);
  const row = (id: number, name: string, hint: string) => (
    <label key={id} className="row" style={{ gap: 10, padding: "8px 10px", border: "1px solid var(--gold-border)", borderRadius: 10, cursor: "pointer", opacity: selected.has(id) ? 1 : 0.85 }}>
      <input type="checkbox" checked={selected.has(id)} onChange={() => toggle(id, name)} />
      <b>{name}</b><span className="muted" style={{ fontSize: 12 }}>· {hint}</span>
    </label>
  );
  return (
    <Overlay title="Virtual Battle" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Pick up to 3 — guests in your room, members who aren't live, or search any member. Members who aren't live show their virtual look. 5 minutes, most coins wins.</p>
      {guests.length > 0 && <>
        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--gold)", margin: "8px 0 6px" }}>In your room</div>
        <div style={{ display: "grid", gap: 6 }}>{guests.map((g) => row(g.user_id, personName(g), "guest"))}</div>
      </>}
      <div style={{ fontSize: 12, fontWeight: 800, color: "var(--gold)", margin: "12px 0 6px" }}>Search members</div>
      <div className="row" style={{ gap: 8 }}>
        <input className="input" placeholder="Name or username" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") search(); }} style={{ flex: 1 }} />
        <button className="btn small" onClick={() => search()} disabled={busy}>{busy ? "…" : "Search"}</button>
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, color: "var(--gold)", margin: "12px 0 6px" }}>{query.trim() ? "Search results" : "Members not live right now"}</div>
      <div style={{ display: "grid", gap: 6, marginTop: 8, maxHeight: 260, overflowY: "auto" }}>
        {results.length === 0 && !busy && <span className="muted" style={{ fontSize: 12 }}>{query.trim() ? "No members found." : "No members to show yet."}</span>}
        {results.filter((r) => !guests.some((g) => g.user_id === r.user_id)).map((m) => row(m.user_id, personName(m as Person), m.virtual_media_url ? "has a virtual look" : `@${m.username ?? ""}`))}
      </div>
      {note && <p style={{ color: "#f55", fontSize: 12, margin: "8px 0 0" }}>{note}</p>}
      <div className="muted" style={{ fontSize: 12, margin: "10px 0" }}>Selected: {selected.size} / 3{selected.size ? " — " + Array.from(selected.values()).join(", ") : ""}</div>
      <button className="btn" style={{ width: "100%", background: "var(--gold-border)", color: "#000", borderColor: "#000" }} disabled={busy || selected.size === 0}
        onClick={async () => { setBusy(true); try { await onSubmit(Array.from(selected.keys())); } catch (e) { setNote((e as Error).message); } finally { setBusy(false); } }}>
        Start Battle
      </button>
    </Overlay>
  );
}

/** The battle strip: clock plus one card per participant (virtual ones with their look), gift buttons. */
export function VirtualStrip({ d, now, myUserId, onGift }: { d: VirtualBattleData; now: number; myUserId: number | null; onGift: (p: VirtualParticipant) => void }) {
  const secs = d.status === "active" ? vbSecondsUntil(d.ends_at, now) : null;
  const sorted = [...d.participants].sort((a, b) => (b.current_score ?? 0) - (a.current_score ?? 0));
  // Steve, 2026-09-27: "When sending a gift to the virtual member remove his avatar and show the
  // gift than bring back his avatar." Flash the last gift over the card for 3 seconds whenever
  // last_gift_id changes (the first sight of a card is remembered, not flashed).
  // "...and do this for every gift that avatar will receive": every gift not shown yet is queued
  // and each flashes for 5 s in turn (Steve 2026-09-27), so a burst of gifts shows one after another.
  const shownRef = useRefVB<Map<number, Set<number>>>(new Map());
  const queuesRef = useRefVB<Map<number, string[]>>(new Map());
  const busyRef = useRefVB<Set<number>>(new Set());
  const [flashing, setFlashing] = useStateVB<Map<number, string>>(new Map());
  const flashNext = (userId: number) => {
    const queue = queuesRef.current.get(userId) ?? [];
    const next = queue.shift();
    queuesRef.current.set(userId, queue);
    if (!next) { busyRef.current.delete(userId); setFlashing((cur) => { const m = new Map(cur); m.delete(userId); return m; }); return; }
    busyRef.current.add(userId);
    setFlashing((cur) => new Map(cur).set(userId, next));
    setTimeout(() => flashNext(userId), 5000); // Steve 2026-09-27: 5 s per gift
  };
  useEffectVB(() => {
    for (const p of d.participants) {
      const recent = (p.recent_gifts ?? []).filter((g) => g.id && g.image);
      let seen = shownRef.current.get(p.user_id);
      if (!seen) { shownRef.current.set(p.user_id, new Set(recent.map((g) => g.id))); continue; }
      const fresh = [...recent].reverse().filter((g) => !seen!.has(g.id));
      if (fresh.length === 0) continue;
      fresh.forEach((g) => seen!.add(g.id));
      const queue = queuesRef.current.get(p.user_id) ?? [];
      queue.push(...fresh.map((g) => g.image as string));
      queuesRef.current.set(p.user_id, queue);
      if (!busyRef.current.has(p.user_id)) flashNext(p.user_id);
    }
  }, [d]);
  return (
    <Strip title="Virtual Battle" right={<span className="pill">{vbClock(secs)}</span>}>
      <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        {sorted.map((p) => (
          <div key={p.user_id} style={{ display: "grid", gap: 4, justifyItems: "center", padding: 6, border: "1px solid var(--gold-border)", borderRadius: 10, background: "#000" }}>
            {flashing.get(p.user_id)
              ? <img src={flashing.get(p.user_id)!} alt="" style={{ width: 84, height: 84, borderRadius: 8, objectFit: "contain", background: "#000", padding: 6, boxSizing: "border-box" }} />
              : <VirtualLook p={p} size={84} />}
            <b style={{ fontSize: 12, maxWidth: 84, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{personName(p as Person)}</b>
            <span className="muted" style={{ fontSize: 11 }}>{p.kind}</span>
            <span style={{ color: "var(--gold)", fontWeight: 800 }}>{(p.current_score ?? 0).toLocaleString()}</span>
            {myUserId !== p.user_id && d.status === "active" && (
              <button className="btn small" style={{ background: "var(--gold-border)", color: "#000", borderColor: "#000" }} onClick={() => onGift(p)}>🎁 Gift</button>
            )}
          </div>
        ))}
      </div>
    </Strip>
  );
}

/** Who gifted each participant, totals, and the one-click / bulk Thank You (Steve, 2026-09-01). */
export function VirtualGiftRecordOverlay({ record, myUserId, onThank, onClose }: { record: VirtualGiftRecord; myUserId: number | null; onThank: (to: (number | "all")[], message: string) => Promise<void>; onClose: () => void }) {
  const [thanked, setThanked] = useStateVB<Set<number>>(new Set());
  const [editing, setEditing] = useStateVB<{ to: (number | "all")[]; who: string } | null>(null);
  const [draft, setDraft] = useStateVB(record.default_thank_you);
  // Steve, 2026-09-27: every gifter row carries its own editable "Thank You For Your Gift" + Send
  // on the right (any gifter in the battle, never myself) — one draft per gifter.
  const [rowDrafts, setRowDrafts] = useStateVB<Map<number, string>>(new Map());
  const rowDraft = (id: number) => rowDrafts.get(id) ?? record.default_thank_you;
  useEffectVB(() => {
    setThanked(new Set(record.participants.flatMap((p) => p.gifters).filter((g) => g.thanked).map((g) => g.user_id)));
  }, [record, myUserId]);
  const mine = record.participants.filter((p) => p.user_id === myUserId);
  const others = record.participants.filter((p) => p.user_id !== myUserId);
  const standings = [...record.battle.participants].sort((a, b) => b.current_score - a.current_score).map((p) => `${personName(p as Person)} ${p.current_score.toLocaleString()}`).join("  ·  ");
  const winner = record.battle.participants.find((p) => p.user_id === record.battle.winner_user_id);
  async function send(to: (number | "all")[], message: string, ids: number[]) {
    await onThank(to, message);
    setThanked((cur) => new Set([...cur, ...ids]));
  }
  return (
    <Overlay title="Virtual Battle Gifts" onClose={onClose} width={520}>
      <div className="card pad" style={{ marginBottom: 10, borderColor: "var(--gold-border)" }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--gold)" }}>{record.battle.status === "completed" ? "Final score" : "Live score"}</div>
        <div style={{ fontSize: 13 }}>{standings}</div>
        {record.battle.status === "completed" && <div style={{ color: "var(--gold)", fontWeight: 800, fontSize: 13 }}>{winner ? `🏆 ${personName(winner as Person)} won` : "It's a tie."}</div>}
      </div>
      {[...mine, ...others].map((p) => {
        const isMe = p.user_id === myUserId;
        return (
          <div key={p.user_id} className="card pad" style={{ marginBottom: 10, borderColor: "var(--gold-border)" }}>
            <div className="row" style={{ gap: 10 }}>
              <VirtualLook p={p} size={40} />
              <div style={{ flex: 1 }}>
                <b>{isMe ? "You" : personName(p as Person)}</b>
                <div style={{ color: "var(--gold)", fontSize: 12 }}>{p.total_coins.toLocaleString()} coins · {p.total_gifts} gift{p.total_gifts === 1 ? "" : "s"} · {p.kind}</div>
              </div>
            </div>
            {p.gifters.length === 0 ? (
              <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>{isMe ? "Nobody gifted you in this battle." : "No gifts."}</p>
            ) : (
              <>
                {isMe && (
                  <button className="btn small" style={{ width: "100%", marginTop: 8, background: "var(--gold-border)", color: "#000", borderColor: "#000" }}
                    onClick={() => { setDraft(record.default_thank_you); setEditing({ to: ["all"], who: "everyone who gifted you" }); }}>💝 Thank everyone ({p.gifters.length})</button>
                )}
                <div style={{ height: 1, background: "var(--gold-border)", opacity: 0.35, margin: "10px 0 6px" }} />
                {p.gifters.map((g) => (
                  <div key={g.user_id} className="row" style={{ gap: 10, padding: "5px 0" }}>
                    <VirtualLook p={{ profile_image: g.profile_image, fullname: g.fullname, username: g.username }} size={32} />
                    <div style={{ flex: 1 }}>
                      <b style={{ fontSize: 14 }}>{personName(g as Person)}</b>
                      <div className="muted" style={{ fontSize: 12 }}>{g.coins.toLocaleString()} coins · {g.gifts} gift{g.gifts === 1 ? "" : "s"}</div>
                    </div>
                    {g.user_id !== myUserId && (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                        <input className="input" value={rowDraft(g.user_id)} placeholder="Your message" style={{ width: 170, fontSize: 12, padding: "5px 8px" }}
                          onChange={(e) => setRowDrafts((cur) => new Map(cur).set(g.user_id, e.target.value))}
                          onKeyDown={(e) => { if (e.key === "Enter") send([g.user_id], rowDraft(g.user_id), [g.user_id]); }} />
                        {thanked.has(g.user_id)
                          ? <span className="pill" style={{ color: "var(--gold)" }}>✓ Sent</span>
                          : <button className="btn small" style={{ background: "var(--gold-border)", color: "#000", borderColor: "#000" }} onClick={() => send([g.user_id], rowDraft(g.user_id), [g.user_id])}>Send</button>}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        );
      })}
      {editing && (
        <div className="card pad" style={{ borderColor: "var(--gold-border)" }}>
          <b style={{ color: "var(--gold)" }}>Thank {editing.who}</b>
          <textarea className="input" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} style={{ width: "100%", marginTop: 8 }} />
          <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
            <button className="btn small ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn small" style={{ background: "var(--gold-border)", color: "#000", borderColor: "#000" }} onClick={async () => {
              const ids = editing.to[0] === "all" ? (mine[0]?.gifters ?? []).map((g) => g.user_id) : editing.to.filter((t): t is number => typeof t === "number");
              await send(editing.to, draft, ids); setEditing(null);
            }}>Send</button>
          </div>
        </div>
      )}
    </Overlay>
  );
}
