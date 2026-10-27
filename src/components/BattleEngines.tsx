// UI for the multi-player battle engines in the web live room: the "Battle" menu + pickers,
// invite cards, the score strips shown above the video grid, and the result overlays.
import { useState } from "react";
import { mediaUrl } from "../lib/api";
import { searchVirtualMembers, secondsUntil as vbSecondsUntil, clock as vbClock, type VirtualBattleData, type VirtualGiftRecord, type VirtualMember, type VirtualParticipant } from "../lib/battles";
import { useEffect as useEffectVB, useRef as useRefVB, useState as useStateVB } from "react";
import { displayName, type UserSummary } from "../lib/api";
import { clock, secondsUntil, type B555Data, type Battle2v2Data, type Invite2v2, type MarathonData, type SeriesData } from "../lib/battles";
import { tt, useT, type StringKey } from "../lib/i18n";

export interface Person { user_id: number; fullname?: string | null; username?: string | null; profile_image?: string | null }
export type NameOf = (id: number | null | undefined) => string;

export function personName(p?: Person | null): string {
  return p ? displayName({ fullname: p.fullname ?? undefined, username: p.username ?? undefined } as Partial<UserSummary>) : "Someone";
}

/** `back` adds the gold back arrow beside the title (Steve, 2026-10-27, on Bingo's results:
 *  "Please add a back arrow to this page"); without it the popup closes by clicking outside. */
export function Overlay({ title, children, onClose, width = 440, back = false }: { title: string; children: React.ReactNode; onClose: () => void; width?: number; back?: boolean }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "grid", placeItems: "center", zIndex: 40, padding: 16 }} onClick={onClose}>
      <div className="card pad" style={{ width: `min(${width}px, 100%)`, maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        {back ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <button onClick={onClose} aria-label="Back"
                    style={{ width: 34, height: 34, flex: "none", borderRadius: "50%", border: "1.5px solid var(--gold, #F0C420)", background: "#000",
                             color: "var(--gold, #F0C420)", fontSize: 20, lineHeight: 1, cursor: "pointer", display: "grid", placeItems: "center" }}>‹</button>
            <h2 className="card-title" style={{ margin: 0 }}>{title}</h2>
          </div>
        ) : <h2 className="card-title" style={{ marginBottom: 10 }}>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export type BattleKind =
  | "1v1" | "gameLimit" | "virtual" | "series" | "2v2" | "marathon" | "555" | "solo" | "hideSeek"
  | "bingo" | "bingoBoard" | "pyramid" | "checkers" | "chess"
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
  // title/blurb/info are translation KEYS: this is module-level data with no hook, so the
  // data carries keys and whatever renders it translates them.
  kind: BattleKind; title: StringKey; blurb: StringKey; minPeople: number;
  /** Absent on the reference rows — the phones leave those unnumbered too. */
  number?: string; info: StringKey; built?: boolean;
  /** Opens a screen or an explanation instead of starting a battle: never people-gated. */
  reference?: boolean;
}[] = [
  { kind: "1v1", number: "#1", title: "bingg_bongg_battle", blurb: "n1v1_5_minutes_most_coins_wins", minPeople: 2,
    info: "challenge_another_live_streamer_to_a_rea" },
  { kind: "gameLimit", number: "#2", title: "game_limit", blurb: "n1v1_first_to_your_coin_target", minPeople: 2,
    info: "same_as_bingg_bongg_battle_but_you_and_y" },
  { kind: "virtual", number: "#3", title: "virtual_battle", blurb: "host_live_battle_members_who_aren_t", minPeople: 1,
    info: "you_go_live_then_pick_up_to_3_members_to" },
  { kind: "series", number: "#4", title: "best_out_of", blurb: "best_of_3_to_11_5_minute_rounds", minPeople: 2,
    info: "a_best_of_series_3_5_7_9_or_11_rounds_wi" },
  { kind: "challenge31", number: "#5", title: "n31_day_battle_challenge", blurb: "battle_daily_for_31_days_up_to_15_bonus", minPeople: 1, reference: true,
    info: "a_personal_31_day_streak_starting_whenev" },
  { kind: "555", number: "#6", title: "n5_5_5", blurb: "n5_games_5_minutes_5_000_coins", minPeople: 2,
    info: "race_to_finish_5_games_first_against_up" },
  { kind: "marathon", number: "#7", title: "no_time_limit", blurb: "first_to_100_000_coins_wins", minPeople: 2,
    info: "race_to_100_000_points_against_up_to_4_p" },
  { kind: "2v2", number: "#8", title: "n2v2_battle", blurb: "two_teams_of_two_5_minutes", minPeople: 4,
    info: "n2_hosts_team_up_against_2_other_hosts_al" },
  // Solo Battle needs nobody else on screen — the room's viewers are the entrants, so
  // minPeople is 1. Starting one is host-only, gated at the call site like the phones do.
  { kind: "solo", number: "#9", title: "solo_battle_with_unlimited_players_2", blurb: "anyone_watching_can_join_and_compete", minPeople: 1,
    info: "start_one_instantly_no_admin_needed_ever" },
  // Steve, 2026-09-27: "Hide & Seek" — 5 minutes, scores hidden until the end, 2-4 players free
  // for all or 2v2 teams. Runs on the Best Out Of (single round) and 2v2 engines with hide_scores.
  { kind: "hideSeek", number: "#10", title: "hide_seek_2", blurb: "n5_minutes_scores_hidden_until_the_end", minPeople: 2,
    info: "a_5_minute_battle_where_nobody_can_see_t" },
  // Steve, 2026-10-11: "Bingg Bongg Bingo Battle". minPeople is 1 because a solo game is real
  // — the host always gets a card and the room's VIEWERS are the ones who buy squares, so
  // there is nobody who has to be on screen for it to work.
  { kind: "bingo", number: "#11", title: "bingg_bongg_bingo", blurb: "viewers_buy_squares_on_your_card", minPeople: 1,
    info: "everyone_in_the_room_gets_a_bingo_card_p" },
  // Steve, 2026-10-27: Pyramid — viewers send Flowers; 10 of each tier make the next; highest
  // pyramid when the host's timer ends wins. Solo is real, so minPeople is 1.
  { kind: "pyramid", number: "#12", title: "pyramid_battle", blurb: "pyramid_battle_blurb", minPeople: 1,
    info: "pyramid_battle_info" },
  // Steve, 2026-10-27: Checkers + Chess — a duel on chess clocks with viewer power-ups, or the
  // host against the audience's votes. Playing the audience needs nobody else, so minPeople is 1.
  { kind: "checkers", number: "#13", title: "checkers_battle", blurb: "board_battle_blurb", minPeople: 1,
    info: "checkers_battle_info" },
  { kind: "chess", number: "#14", title: "chess_battle", blurb: "board_battle_blurb", minPeople: 1,
    info: "chess_battle_info" },
  // Unnumbered from here down, exactly as on the phones: these aren't battles you can start, so
  // they carry no "#n" and never check how many people are on screen.
  { kind: "pkContests", title: "pk_battle_contests", blurb: "admin_run_scored_by_gift_coins", minPeople: 1, reference: true,
    info: "admin_run_contests_scored_by_total_gift" },
  { kind: "gamesExplained", title: "games_explained", blurb: "play_games_while_you_battle", minPeople: 1, reference: true,
    info: "you_can_play_any_of_our_games_balloon_po" },
  { kind: "lifetimeBoard", title: "lifetime_battle_board_2", blurb: "every_contest_all_time", minPeople: 1, reference: true,
    info: "your_full_battle_history_going_back_to_d" },
  { kind: "bingoBoard", title: "bingo_battle_board_2", blurb: "every_bingo_game_ever_played", minPeople: 1, reference: true,
    info: "every_bingg_bongg_bingo_game_ever_played" },
  { kind: "punishments", title: "friendly_punishment_suggestions", blurb: "agree_a_forfeit_before_you_start", minPeople: 1, reference: true,
    info: "battling_just_for_fun_agree_on_a_friendl" },
];

/** Step 1 of the Battle button: which kind of battle. Numbered and with an (i) per row,
 *  matching the phones (Steve, 2026-09-08: "Please add the (i) for information for every
 *  game" — the same treatment the Battle menu carries there). */
export function BattleMenu({ peopleOnScreen, onPick, onClose, onNotice }: { peopleOnScreen: number; onPick: (k: BattleKind) => void; onClose: () => void; onNotice: (msg: string) => void }) {
  const { t } = useT();
  const [info, setInfo] = useState<(typeof BATTLE_KINDS)[number] | null>(null);

  if (info) {
    return (
      <Overlay title={t(info.title)} onClose={() => setInfo(null)} width={560}>
        <p className="soft" style={{ marginTop: 0, whiteSpace: "pre-line" }}>{t(info.info)}</p>
        <button className="btn ghost block" onClick={() => setInfo(null)}>{t("back")}</button>
      </Overlay>
    );
  }

  return (
    <Overlay title={t("start_a_battle")} onClose={onClose} width={560}>
      {peopleOnScreen < 2 && <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>{t("you_re_the_only_one_on_screen_accept_a_v")}</p>}
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
                if (k.built === false) { onNotice(t("x_is_coming_soon", t(k.title))); return; }
                if (!ok) { onNotice(t("x_needs_n_people_on_screen", t(k.title), k.minPeople, peopleOnScreen)); return; }
                // Games Explained has nothing to select — it IS the explanation — so tapping the
                // row opens the same popup its (i) does, rather than a dead "coming soon". Same
                // exception the phones make for this one row.
                if (k.kind === "gamesExplained") { setInfo(k); return; }
                onPick(k.kind);
              }}>
              <span className="kind-title">{k.number ? `${k.number} ` : ""}{t(k.title)}</span>
              <span className="kind-blurb muted">{t(k.blurb)}</span>
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
            <button className="btn ghost battle-info" title={t("about_x", t(k.title))} onClick={() => setInfo(k)}>i</button>
          </div>
        );
      })}
    </Overlay>
  );
}

/** Multi-select of the other people on screen (Best Out Of, No Time Limit, 5-5-5). */
export function MultiPicker({ title, blurb, people, lengths, exact, onSubmit, onClose }: {
  title: string; blurb: string; people: Person[]; lengths?: number[];
  /** Hide & Seek (Steve, 2026-09-27): require exactly this many people picked. */
  exact?: number;
  onSubmit: (ids: number[], length?: number) => Promise<void>; onClose: () => void;
}) {
  const { t } = useT();
  const [picked, setPicked] = useState<number[]>(people.length === 1 ? [people[0].user_id] : []);
  const exactOk = exact === undefined || picked.length === exact;
  const [length, setLength] = useState<number>(lengths?.[1] ?? lengths?.[0] ?? 0);
  const [busy, setBusy] = useState(false);
  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <Overlay title={title} onClose={onClose}>
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>{blurb}</p>
      {lengths && (
        <div className="row" style={{ marginBottom: 10, flexWrap: "wrap" }}>
          <span className="soft" style={{ fontSize: 13 }}>{t("best_of")}</span>
          {lengths.map((n) => (
            <button key={n} className={`btn small${length === n ? "" : " ghost"}`} onClick={() => setLength(n)}>{n}</button>
          ))}
        </div>
      )}
      <div className="soft" style={{ fontSize: 13, marginBottom: 6 }}>{t("who_s_in")}</div>
      {people.map((p) => (
        <label key={p.user_id} className="row" style={{ padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 10, marginBottom: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={picked.includes(p.user_id)} onChange={() => toggle(p.user_id)} />
          <span style={{ fontWeight: 700 }}>{personName(p)}</span>
        </label>
      ))}
      {exact !== undefined && <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{t(exact === 1 ? "pick_exactly_one_person" : "pick_exactly_n_people", exact, picked.length)}</div>}
      <button className="btn block" style={{ marginTop: 10 }} disabled={busy || picked.length === 0 || !exactOk} onClick={async () => {
        setBusy(true);
        try { await onSubmit(picked, lengths ? length : undefined); } finally { setBusy(false); }
      }}>{busy ? "Sending…" : `Send invite${picked.length > 1 ? "s" : ""}`}</button>
    </Overlay>
  );
}

/** 2v2: pick your teammate; the other two on screen are the opposing team. */
export function TwoVTwoPicker({ people, onSubmit, onClose }: { people: Person[]; onSubmit: (teammate: number, opp1: number, opp2: number) => Promise<void>; onClose: () => void }) {
  const { t, tn } = useT();
  const [teammate, setTeammate] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const opponents = people.filter((p) => p.user_id !== teammate);
  return (
    <Overlay title={t("n2v2_battle_pick_your_teammate")} onClose={onClose}>
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>{t("you_your_teammate_vs_the_other_two_on_sc")}</p>
      {people.map((p) => (
        <button key={p.user_id} className={`btn block${teammate === p.user_id ? "" : " ghost"}`} style={{ marginBottom: 6 }} onClick={() => setTeammate(p.user_id)}>{personName(p)}</button>
      ))}
      {teammate !== null && opponents.length === 2 && (
        <p className="soft" style={{ fontSize: 13 }}>{tn("opponents_two", <b>{personName(opponents[0])}</b>, <b>{personName(opponents[1])}</b>)}</p>
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
  const { t } = useT();
  return (
    <Overlay title={title} onClose={onClose}>
      <p className="soft">{body}</p>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" style={{ flex: 1 }} onClick={() => onAnswer(true)}>{t("accept")}</button>
        <button className="btn ghost" style={{ flex: 1 }} onClick={() => onAnswer(false)}>{t("decline")}</button>
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

// A module-level helper, not a component: no hook may be called here, so tt() reads the
// active language directly. Every caller re-renders on a language change anyway.
const waiting = (accepted: number, total: number) => <span className="pill">{tt("waiting_for_answers_count", accepted, total)}</span>;

const BLINK_CSS = `@keyframes bbBlink { 0%,100% { opacity: 1 } 50% { opacity: .15 } } .bb-blink { animation: bbBlink .5s steps(1) infinite }`;

export function SeriesStrip({ d, now, nameOf }: { d: SeriesData; now: number; nameOf: NameOf }) {
  const { t } = useT();
  const accepted = d.participants.filter((p) => p.invite_status === "accepted");
  const secs = d.status === "active" ? secondsUntil(d.current_round_ends_at, now) : null;
  const done = d.status === "completed";
  const title = d.hide_scores ? (done ? "🙈 Hide & Seek — REVEALED!" : "🙈 Hide & Seek")
    : `Best Out Of ${d.length}${done ? " — FINAL" : d.status === "active" && d.current_round_number ? ` · Round ${d.current_round_number}` : ""}`;
  return (
    <Strip title={title}
      right={d.status === "pending_invites" ? waiting(accepted.length, d.participants.length) : done ? <span className="pill" style={{ color: "var(--gold)" }}>{t("final")}</span> : <span className="pill">{clock(secs)}</span>}>
      <style>{BLINK_CSS}</style>
      <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{d.hide_scores ? "Scores stay hidden until the end — then everyone's revealed at once." : `First to ${d.rounds_needed_to_win} rounds. Each round is 5 minutes.`}</div>
      {(d.status === "active" || done ? accepted : d.participants).map((p) => (
        <div key={p.user_id} className={`row${done && p.user_id === d.winner_user_id ? " bb-blink" : ""}`} style={{ justifyContent: "space-between", marginTop: 4, fontSize: 13 }}>
          <span><b>{nameOf(p.user_id) || personName(p)}</b>{p.invite_status !== "accepted" ? <span className="muted"> · {p.invite_status}</span> : null}</span>
          <span>{!d.hide_scores && <span title={t("rounds_won")}>{"★".repeat(p.rounds_won ?? 0)}</span>} <span style={{ color: "var(--gold)" }}>{d.hide_scores && d.status === "active" ? "🙈 ?" : (p.current_round_score ?? 0).toLocaleString()}{done && p.user_id === d.winner_user_id ? " 🏆" : ""}</span></span>
        </div>
      ))}
    </Strip>
  );
}

export function TwoVTwoStrip({ d, now, nameOf }: { d: Battle2v2Data; now: number; nameOf: NameOf }) {
  const { t } = useT();
  const team = (t: "A" | "B") => d.participants.filter((p) => p.team === t);
  const names = (t: "A" | "B") => team(t).map((p) => nameOf(p.user_id) || personName(p)).join(" & ");
  const hidden = !!d.hide_scores && d.status === "active";
  const done = d.status === "completed";
  const a = d.team_a_score ?? 0, b = d.team_b_score ?? 0;
  const total = a + b;
  const accepted = d.participants.filter((p) => p.invite_status === "accepted").length;
  const secs = d.status === "active" ? secondsUntil(d.ends_at, now) : null;
  return (
    <Strip title={d.hide_scores ? (done ? "🙈 Hide & Seek 2v2 — REVEALED!" : "🙈 Hide & Seek 2v2") : (done ? "2v2 Battle — FINAL" : "2v2 Battle")} right={d.status === "pending_invites" ? waiting(accepted, d.participants.length) : done ? <span className="pill" style={{ color: "var(--gold)" }}>{t("final")}</span> : <span className="pill">{clock(secs)}</span>}>
      <style>{BLINK_CSS}</style>
      <div className="row" style={{ justifyContent: "space-between", marginTop: 6, fontSize: 13 }}>
        <span className={done && d.winning_team === "A" ? "bb-blink" : ""}><b>{names("A")}</b> <span style={{ color: "var(--gold)" }}>{hidden ? "?" : a.toLocaleString()}{done && d.winning_team === "A" ? " 🏆" : ""}</span></span>
        <span className={done && d.winning_team === "B" ? "bb-blink" : ""}><span style={{ color: "var(--gold)" }}>{hidden ? "?" : b.toLocaleString()}{done && d.winning_team === "B" ? " 🏆" : ""}</span> <b>{names("B")}</b></span>
      </div>
      {hidden ? <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{t("scores_stay_hidden_until_the_end")}</div> : <Bar pct={total > 0 ? (a / total) * 100 : 50} />}
    </Strip>
  );
}

export function MarathonStrip({ d, myUserId, nameOf, onVote }: { d: MarathonData; myUserId: number | null; nameOf: NameOf; onVote: (approve: boolean) => void }) {
  const { t } = useT();
  const accepted = d.participants.filter((p) => p.invite_status === "accepted");
  const me = accepted.find((p) => p.user_id === myUserId);
  const leader = Math.max(1, ...accepted.map((p) => p.current_score ?? 0));
  return (
    <Strip title={t("no_time_limit")} right={d.status === "pending_invites" ? waiting(accepted.length, d.participants.length) : <span className="pill">{t("first_to_n", d.target_points.toLocaleString())}</span>}>
      {(d.status === "active" ? accepted : d.participants).map((p) => (
        <div key={p.user_id} style={{ marginTop: 6, fontSize: 13 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span><b>{nameOf(p.user_id) || personName(p)}</b>{p.invite_status !== "accepted" ? <span className="muted"> · {p.invite_status}</span> : null}{p.cancel_vote ? <span className="muted"> {t("voted_to_end")}</span> : null}</span>
            <span style={{ color: "var(--gold)" }}>{(p.current_score ?? 0).toLocaleString()}</span>
          </div>
          {d.status === "active" && <Bar pct={((p.current_score ?? 0) / Math.max(leader, d.target_points)) * 100} />}
        </div>
      ))}
      {d.status === "active" && me && (
        <div className="row" style={{ marginTop: 8, fontSize: 12 }}>
          <span className="muted">{t("end_early_agree", d.cancel_vote_count, d.accepted_count)}</span>
          <span className="spacer" />
          {me.cancel_vote
            ? <button className="btn small ghost" onClick={() => onVote(false)}>{t("withdraw_my_vote")}</button>
            : <button className="btn small ghost" onClick={() => onVote(true)}>{t("vote_to_end")}</button>}
        </div>
      )}
    </Strip>
  );
}

export function B555Strip({ d, myUserId, nameOf, onCancel }: { d: B555Data; myUserId: number | null; nameOf: NameOf; onCancel?: () => void }) {
  const { t, tn } = useT();
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
                  ? <span className="pill">{t("finished_in", clock(p.finish_seconds ?? 0))}</span>
                  : <span className="muted">{tn("game_n_of_m_progress", gameNo, d.games_to_win, <span style={{ color: "var(--gold)" }}>{(p.current_game_coins ?? 0).toLocaleString()}</span>, k, (p.total_coins ?? 0).toLocaleString())}{p.seconds_left !== null && p.seconds_left !== undefined ? ` · ${clock(p.seconds_left)}` : ""}</span>
              )}
            </div>
            {d.status === "active" && !done && <Bar pct={((p.current_game_coins ?? 0) / d.coins_per_game) * 100} />}
          </div>
        );
      })}
      {d.status === "pending_invites" && onCancel && myUserId === d.host_user_id && (
        <div className="row" style={{ marginTop: 8 }}><span className="spacer" /><button className="btn small ghost" onClick={onCancel}>{t("cancel")}</button></div>
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

export function ResultOverlay({ title, rows, onClose, onShare, sharing }: {
  title: string;
  rows: { label: string; value: string; win?: boolean }[];
  onClose: () => void;
  /** Battle Recap — omitted for the engines the server has no recap builder for. */
  onShare?: () => void;
  sharing?: boolean;
}) {
  const { t } = useT();
  return (
    <Overlay title={title} onClose={onClose}>
      {rows.map((r, i) => (
        <div key={i} className="row" style={{ justifyContent: "space-between", fontSize: 16, padding: "4px 0" }}>
          <span style={{ fontWeight: r.win ? 800 : 500, color: r.win ? "var(--gold)" : undefined }}>{r.win ? "🏆 " : ""}{r.label}</span>
          <span style={{ color: "var(--gold)" }}>{r.value}</span>
        </div>
      ))}
      {onShare && (
        <button className="btn block" style={{ marginTop: 12 }} disabled={sharing} onClick={onShare}>
          {sharing ? "Getting your recap…" : "Share this result"}
        </button>
      )}
      <button className={onShare ? "btn block ghost" : "btn block"} style={{ marginTop: 8 }} onClick={onClose}>{t("close")}</button>
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
  // Initials always underneath; a photo that exists AND loads covers them (a dead profile_image
  // URL must not leave an empty box — seen on Android 2026-09-27).
  return (
    <div style={{ ...box, position: "relative", display: "grid", placeItems: "center", color: "var(--gold)", fontWeight: 800, fontSize: size * 0.3 }}>
      {initials}
      {img && <img src={img} alt="" style={{ ...box, position: "absolute", inset: 0 }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />}
    </div>
  );
}

/** Host only: guests in the room + member search, up to 3. */
export function VirtualPicker({ myUserId, guests, onSubmit, onClose }: { myUserId: number; guests: Person[]; onSubmit: (ids: number[]) => Promise<void>; onClose: () => void }) {
  const { t } = useT();
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
  // Steve, 2026-09-27 (picker screenshot): "Add everyone's avatar here" — photo or initials on every row.
  // Steve, 2026-09-29: "everyone wants to battle a popular or famous person... can multiple
  // members battle with one person?" — no, exclusive per person; isMemberBusy greys the row,
  // disables its checkbox outright, and swaps the hint, so a host sees this BEFORE picking
  // instead of a rejection after tapping Start Battle — same fix as the Android picker.
  const row = (id: number, name: string, hint: string, p?: Person, isMemberBusy?: boolean) => (
    <label key={id} className="row" style={{ gap: 10, padding: "8px 10px", border: "1px solid var(--gold-border)", borderRadius: 10, cursor: isMemberBusy ? "default" : "pointer", opacity: isMemberBusy ? 0.5 : (selected.has(id) ? 1 : 0.85) }}>
      <input type="checkbox" checked={!isMemberBusy && selected.has(id)} disabled={isMemberBusy} onChange={() => { if (!isMemberBusy) toggle(id, name); }} />
      <span style={{ borderRadius: 17, overflow: "hidden", border: "1px solid var(--gold-border)", flex: "none" }}><VirtualLook p={{ profile_image: p?.profile_image, fullname: p?.fullname ?? name, username: p?.username }} size={34} /></span>
      <b>{name}</b><span className="muted" style={{ fontSize: 12 }}>· {isMemberBusy ? "Busy — in a battle" : hint}</span>
    </label>
  );
  return (
    <Overlay title={t("virtual_battle")} onClose={onClose}>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>{t("pick_up_to_3_guests_in_your_room_members")}</p>
      {guests.length > 0 && <>
        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--gold)", margin: "8px 0 6px" }}>{t("in_your_room")}</div>
        <div style={{ display: "grid", gap: 6 }}>{guests.map((g) => row(g.user_id, personName(g), "guest", g))}</div>
      </>}
      <div style={{ fontSize: 12, fontWeight: 800, color: "var(--gold)", margin: "12px 0 6px" }}>{t("search_members")}</div>
      <div className="row" style={{ gap: 8 }}>
        <input className="input" placeholder={t("name_or_username")} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") search(); }} style={{ flex: 1 }} />
        <button className="btn small" onClick={() => search()} disabled={busy}>{busy ? "…" : "Search"}</button>
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, color: "var(--gold)", margin: "12px 0 6px" }}>{query.trim() ? "Search results" : "Members not live right now"}</div>
      <div style={{ display: "grid", gap: 6, marginTop: 8, maxHeight: 260, overflowY: "auto" }}>
        {results.length === 0 && !busy && <span className="muted" style={{ fontSize: 12 }}>{query.trim() ? "No members found." : "No members to show yet."}</span>}
        {results.filter((r) => !guests.some((g) => g.user_id === r.user_id)).map((m) => row(m.user_id, personName(m as Person), m.virtual_media_url ? "has a virtual look" : `@${m.username ?? ""}`, m as Person, m.is_busy))}
      </div>
      {note && <p style={{ color: "#f55", fontSize: 12, margin: "8px 0 0" }}>{note}</p>}
      <div className="muted" style={{ fontSize: 12, margin: "10px 0" }}>{t("selected_n_of_3", selected.size)}{selected.size ? " — " + Array.from(selected.values()).join(", ") : ""}</div>
      <button className="btn" style={{ width: "100%", background: "var(--gold-border)", color: "#000", borderColor: "#000" }} disabled={busy || selected.size === 0}
        onClick={async () => { setBusy(true); try { await onSubmit(Array.from(selected.keys())); } catch (e) { setNote((e as Error).message); } finally { setBusy(false); } }}>
        {t("start_battle")}</button>
    </Overlay>
  );
}

/** The battle strip: clock plus one card per participant (virtual ones with their look), gift buttons. */
export function VirtualStrip({ d, now, myUserId, onGift }: { d: VirtualBattleData; now: number; myUserId: number | null; onGift: (p: VirtualParticipant) => void }) {
  const { t } = useT();
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
    <Strip title={t("virtual_battle")} right={<span className="pill">{vbClock(secs)}</span>}>
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
              <button className="btn small" style={{ background: "var(--gold-border)", color: "#000", borderColor: "#000" }} onClick={() => onGift(p)}>{t("gift")}</button>
            )}
          </div>
        ))}
      </div>
    </Strip>
  );
}

/** Who gifted each participant, totals, and the one-click / bulk Thank You (Steve, 2026-09-01). */
export function VirtualGiftRecordOverlay({ record, myUserId, onThank, onClose }: { record: VirtualGiftRecord; myUserId: number | null; onThank: (to: (number | "all")[], message: string) => Promise<void>; onClose: () => void }) {
  const { t } = useT();
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
    <Overlay title={t("virtual_battle_gifts")} onClose={onClose} width={520}>
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
                <div style={{ color: "var(--gold)", fontSize: 12 }}>{t(p.total_gifts === 1 ? "coins_and_one_gift_kind" : "coins_and_n_gifts_kind", p.total_coins.toLocaleString(), p.total_gifts, p.kind)}</div>
              </div>
            </div>
            {p.gifters.length === 0 ? (
              <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>{isMe ? "Nobody gifted you in this battle." : "No gifts."}</p>
            ) : (
              <>
                {isMe && (
                  <button className="btn small" style={{ width: "100%", marginTop: 8, background: "var(--gold-border)", color: "#000", borderColor: "#000" }}
                    onClick={() => { setDraft(record.default_thank_you); setEditing({ to: ["all"], who: t("everyone_who_gifted_you") }); }}>{t("thank_everyone_count", p.gifters.length)}</button>
                )}
                <div style={{ height: 1, background: "var(--gold-border)", opacity: 0.35, margin: "10px 0 6px" }} />
                {p.gifters.map((g) => (
                  <div key={g.user_id} className="row" style={{ gap: 10, padding: "5px 0" }}>
                    <VirtualLook p={{ profile_image: g.profile_image, fullname: g.fullname, username: g.username }} size={32} />
                    <div style={{ flex: 1 }}>
                      <b style={{ fontSize: 14 }}>{personName(g as Person)}</b>
                      <div className="muted" style={{ fontSize: 12 }}>{t(g.gifts === 1 ? "coins_and_one_gift" : "coins_and_n_gifts", g.coins.toLocaleString(), g.gifts)}</div>
                    </div>
                    {g.user_id !== myUserId && (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                        <input className="input" value={rowDraft(g.user_id)} placeholder={t("your_message")} style={{ width: 170, fontSize: 12, padding: "5px 8px" }}
                          onChange={(e) => setRowDrafts((cur) => new Map(cur).set(g.user_id, e.target.value))}
                          onKeyDown={(e) => { if (e.key === "Enter") send([g.user_id], rowDraft(g.user_id), [g.user_id]); }} />
                        {thanked.has(g.user_id)
                          ? <span className="pill" style={{ color: "var(--gold)" }}>{t("sent")}</span>
                          : <button className="btn small" style={{ background: "var(--gold-border)", color: "#000", borderColor: "#000" }} onClick={() => send([g.user_id], rowDraft(g.user_id), [g.user_id])}>{t("send")}</button>}
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
          <b style={{ color: "var(--gold)" }}>{t("thank_who", editing.who)}</b>
          <textarea className="input" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} style={{ width: "100%", marginTop: 8 }} />
          <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
            <button className="btn small ghost" onClick={() => setEditing(null)}>{t("cancel")}</button>
            <button className="btn small" style={{ background: "var(--gold-border)", color: "#000", borderColor: "#000" }} onClick={async () => {
              const ids = editing.to[0] === "all" ? (mine[0]?.gifters ?? []).map((g) => g.user_id) : editing.to.filter((t): t is number => typeof t === "number");
              await send(editing.to, draft, ids); setEditing(null);
            }}>{t("send")}</button>
          </div>
        </div>
      )}
    </Overlay>
  );
}
