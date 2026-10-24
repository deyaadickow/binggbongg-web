// The overlays behind the Battle menu's trailing rows: the 31 Day Battle Challenge, PK Battle
// Contests (list + standings), the Lifetime Battle Board and Friendly Punishment Suggestions.
//
// They live in the live room rather than as their own pages because that's where the phones put
// them — the Battle menu is the only way in. Each one is read-only apart from the challenge's
// single opt-in button.
import { useEffect, useState } from "react";
import { mediaUrl } from "../lib/api";
import {
  CHALLENGE_TIERS, contestStatusLabel, fetchChallengeStatus, fetchLifetimeLeaderboard,
  fetchPkContestStandings, fetchPkContests, fetchPunishmentSuggestions, prizeLabel, startChallenge,
  type ChallengeStatus, type LifetimeRow, type PkContest, type StandingRow,
} from "../lib/challenges";
import { Overlay } from "./BattleEngines";
import { tt, useT  } from "../lib/i18n";

function Loading() {
  const { t } = useT();
  return <p className="muted" style={{ textAlign: "center", padding: "24px 0", margin: 0 }}>{t("imagePickerLoading")}</p>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="muted" style={{ textAlign: "center", padding: "24px 0", margin: 0 }}>{children}</p>;
}

/** An avatar + name row, used by both leaderboards. */
function MemberRow({ rank, image, name, sub, value, valueLabel }: {
  rank?: number | null; image?: string | null; name: string; sub?: string | null;
  value: string; valueLabel?: string;
}) {
  return (
    <div className="row" style={{ alignItems: "center", gap: 10, padding: "9px 4px", borderBottom: "1px solid var(--line)" }}>
      {rank != null && (
        <span style={{ width: 26, textAlign: "right", fontWeight: 800, color: rank <= 3 ? "var(--gold)" : "var(--muted)" }}>
          {rank}
        </span>
      )}
      {image
        ? <img src={mediaUrl(image)} alt="" style={{ width: 30, height: 30, borderRadius: 15, objectFit: "cover" }} />
        : <div style={{ width: 30, height: 30, borderRadius: 15, background: "var(--bg)" }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
        {sub && <div className="muted" style={{ fontSize: 12 }}>{sub}</div>}
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontWeight: 800, color: "var(--gold)", fontVariantNumeric: "tabular-nums" }}>{value}</div>
        {valueLabel && <div className="muted" style={{ fontSize: 11 }}>{valueLabel}</div>}
      </div>
    </div>
  );
}

// ---- 31 Day Battle Challenge ------------------------------------------------------------------

export function Challenge31Overlay({ userId, onClose, onNotice }: { userId: number; onClose: () => void; onNotice: (m: string) => void }) {
  const { t, tn } = useT();
  const [status, setStatus] = useState<ChallengeStatus | null | "loading">("loading");
  const [busy, setBusy] = useState(false);

  const load = () => {
    fetchChallengeStatus(userId).then(setStatus).catch(() => setStatus(null));
  };
  useEffect(load, [userId]);

  async function optIn() {
    if (busy) return;
    setBusy(true);
    try {
      await startChallenge(userId);
      onNotice(tt("you_re_on_day_1_of_31_battle_at_least_on"));
      load();
    } catch (e) {
      onNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const tiers = (
    <div style={{ marginTop: 12 }}>
      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{t("daily_tiers")}</div>
      {CHALLENGE_TIERS.map((tier) => (
        <div key={tier.percent} className="row" style={{ justifyContent: "space-between", padding: "5px 0", fontSize: 13 }}>
          <span>{t(tier.battles === 1 ? "one_qualifying_battle_in_a_day" : "n_qualifying_battles_in_a_day",
                   tier.battles === 3 ? t("three_or_more") : tier.battles)}</span>
          <b style={{ color: "var(--gold)" }}>{t("n_percent", tier.percent)}</b>
        </div>
      ))}
      <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
        {tn("challenge_lowest_day_note", <b>{t("lowest")}</b>)}
      </p>
    </div>
  );

  return (
    <Overlay title={t("n5_31_day_battle_challenge")} onClose={onClose} width={520}>
      {status === "loading" ? <Loading /> : status?.has_active_challenge ? (
        <>
          <div className="card pad" style={{ marginBottom: 10, textAlign: "center" }}>
            <div style={{ fontSize: 30, fontWeight: 800, color: "var(--gold)" }}>
              {t("day_n_of_31", status.current_day_number ?? 0)}
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              {t(status.days_remaining === 1 ? "one_day_to_go" : "n_days_to_go", status.days_remaining ?? 0)}
            </div>
          </div>

          <div className="row" style={{ gap: 8 }}>
            <div className="card pad" style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{status.today_battle_count ?? 0}</div>
              <div className="muted" style={{ fontSize: 12 }}>{t("battles_today")}</div>
              <div style={{ color: "var(--gold)", fontWeight: 700, fontSize: 13 }}>{t("n_percent_tier", status.today_tier_percent ?? 0)}</div>
            </div>
            <div className="card pad" style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--gold)" }}>{status.running_lowest_tier_percent ?? 0}%</div>
              <div className="muted" style={{ fontSize: 12 }}>{t("on_track_for")}</div>
              <div className="muted" style={{ fontSize: 11 }}>{t("your_lowest_day_so_far")}</div>
            </div>
          </div>

          {(status.today_battle_count ?? 0) === 0 && (
            <p style={{ color: "#f5a623", fontSize: 13, marginBottom: 0 }}>
              {t("you_haven_t_battled_yet_today_a_day_with")}</p>
          )}
          {tiers}
        </>
      ) : (
        <>
          {status?.just_restarted && (
            <p style={{ color: "#f55", fontSize: 13, marginTop: 0 }}>
              {t("your_last_challenge_ended_a_day_went_by")}</p>
          )}
          {status?.just_completed && (
            <p style={{ color: "var(--gold)", fontSize: 14, marginTop: 0 }}>
              {status.last_challenge_final_bonus_amount != null
                ? t("finished_31_days_at_with_bonus", status.last_challenge_final_tier_percent ?? 0,
                    Number(status.last_challenge_final_bonus_amount).toFixed(2))
                : t("finished_31_days_at", status.last_challenge_final_tier_percent ?? 0)}
            </p>
          )}
          <p className="soft" style={{ marginTop: 0 }}>
            {t("a_personal_31_day_streak_that_starts_the")}</p>
          {tiers}
          <button className="btn block" disabled={busy} onClick={optIn} style={{ marginTop: 12 }}>
            {busy ? "Starting…" : "Start my 31 days"}
          </button>
        </>
      )}
    </Overlay>
  );
}

// ---- PK Battle Contests ------------------------------------------------------------------------

export function PkContestsOverlay({ userId, onClose }: { userId: number; onClose: () => void }) {
  const { t } = useT();
  const [rows, setRows] = useState<PkContest[] | null>(null);
  const [open, setOpen] = useState<PkContest | null>(null);

  useEffect(() => {
    fetchPkContests(userId).then(setRows).catch(() => setRows([]));
  }, [userId]);

  if (open) return <ContestStandingsOverlay contest={open} userId={userId} onClose={() => setOpen(null)} />;

  return (
    <Overlay title={t("pk_battle_contests")} onClose={onClose} width={560}>
      {rows === null ? <Loading /> : rows.length === 0 ? (
        <Empty>{t("no_contests_running_right_now")}</Empty>
      ) : rows.map((c) => (
        <button key={c.id} className="btn block" onClick={() => setOpen(c)}
          style={{
            textAlign: "left", marginBottom: 8,
            // A contest you're actually in gets the gold box the phones give it.
            borderColor: c.featured ? "var(--gold)" : undefined,
          }}>
          <span className="kind-title">{c.name || `Contest #${c.id}`}</span>
          <span className="kind-blurb muted">
            {contestStatusLabel(c.status)}
            {c.type === "geographic" ? " · countries" : c.type === "member" ? " · members" : ""}
            {c.is_contestant ? " · you're in this one" : ""}
          </span>
          <span className="kind-go">›</span>
        </button>
      ))}
    </Overlay>
  );
}

function ContestStandingsOverlay({ contest, userId, onClose }: { contest: PkContest; userId: number; onClose: () => void }) {
  const { t } = useT();
  const [rows, setRows] = useState<StandingRow[] | null>(null);
  const [live, setLive] = useState<PkContest>(contest);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchPkContestStandings(contest.id, userId)
      .then((r) => { setRows(r.standings); if (r.contest) setLive(r.contest); })
      .catch((e) => { setError((e as Error).message); setRows([]); });
  }, [contest.id, userId]);

  const prizes = (live.prize_tiers ?? []).filter((t) => t.prize_value != null);

  return (
    <Overlay title={live.name || "Contest"} onClose={onClose} width={560}>
      {error && <p style={{ color: "#f55", fontSize: 13, marginTop: 0 }}>{error}</p>}

      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        {contestStatusLabel(live.status)}
        {live.starts_at && ` · from ${new Date(live.starts_at).toLocaleDateString()}`}
        {live.ends_at && ` to ${new Date(live.ends_at).toLocaleDateString()}`}
      </div>

      {prizes.length > 0 && (
        <div className="card pad" style={{ marginBottom: 10 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{t("prizes")}</div>
          {prizes.map((t) => (
            <div key={t.rank} className="row" style={{ justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}>
              <span>#{t.rank}</span>
              <b style={{ color: "var(--gold)" }}>{prizeLabel(t)}</b>
            </div>
          ))}
        </div>
      )}

      {rows === null ? <Loading /> : rows.length === 0 ? (
        <Empty>{t("no_scores_yet")}</Empty>
      ) : rows.map((r, i) => (
        <MemberRow key={`${r.user_id ?? r.label}-${i}`}
          rank={i + 1}
          image={r.profile_image}
          name={r.label || "—"}
          sub={r.location}
          value={Number(r.score ?? 0).toLocaleString()}
          valueLabel="coins" />
      ))}
    </Overlay>
  );
}

// ---- Lifetime Battle Board ---------------------------------------------------------------------

export function LifetimeBoardOverlay({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const [rows, setRows] = useState<LifetimeRow[] | null>(null);

  useEffect(() => {
    fetchLifetimeLeaderboard(null, 100).then(setRows).catch(() => setRows([]));
  }, []);

  return (
    <Overlay title={t("lifetime_battle_board_2")} onClose={onClose} width={560}>
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
        {t("every_talent_contest_ever_run_all_time_t")}</p>
      {rows === null ? <Loading /> : rows.length === 0 ? (
        <Empty>{t("no_contest_results_yet")}</Empty>
      ) : rows.map((r) => (
        <MemberRow key={r.user_id}
          rank={r.rank}
          image={r.profile_image}
          name={r.fullname || r.username || `Member #${r.user_id}`}
          sub={[r.country_name, `${r.contest_count} contest${r.contest_count === 1 ? "" : "s"}`,
                r.contests_won > 0 ? `${r.contests_won} won` : null].filter(Boolean).join(" · ")}
          value={r.total_votes.toLocaleString()}
          valueLabel="votes" />
      ))}
    </Overlay>
  );
}

// ---- Friendly Punishment Suggestions -----------------------------------------------------------

export function PunishmentsOverlay({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const [rows, setRows] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    fetchPunishmentSuggestions().then(setRows).catch(() => setRows([]));
  }, []);

  function pickRandom() {
    if (!rows || rows.length === 0) return;
    // Avoid handing back the same one twice in a row when there's more than one to choose from.
    let next = rows[Math.floor(Math.random() * rows.length)];
    if (rows.length > 1) {
      while (next === picked) next = rows[Math.floor(Math.random() * rows.length)];
    }
    setPicked(next);
  }

  return (
    <Overlay title={t("friendly_punishment_suggestions")} onClose={onClose} width={520}>
      <p className="soft" style={{ marginTop: 0 }}>
        {t("battling_for_fun_agree_what_the_loser_do")}</p>

      {picked && (
        <div className="card pad" style={{ marginBottom: 10, textAlign: "center", borderColor: "var(--gold)" }}>
          <div className="muted" style={{ fontSize: 12 }}>{t("your_random_pick")}</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "var(--gold)", marginTop: 4 }}>{picked}</div>
        </div>
      )}

      {rows === null ? <Loading /> : rows.length === 0 ? (
        <Empty>{t("no_suggestions_have_been_added_yet")}</Empty>
      ) : (
        <>
          <button className="btn block" onClick={pickRandom} style={{ marginBottom: 10 }}>
            {t("pick_one_at_random")}</button>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{t("all_n_suggestions", rows.length)}</div>
          {rows.map((r, i) => (
            <div key={i} style={{ padding: "8px 4px", borderBottom: "1px solid var(--line)", fontSize: 14 }}>{r}</div>
          ))}
        </>
      )}
    </Overlay>
  );
}
