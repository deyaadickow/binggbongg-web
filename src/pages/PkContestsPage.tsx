// PK Battle Contests (Steve, 2026-11-01, on the directory's tile: "This room is empty as well").
// The tile used to open Live Now, which says nothing about contests and is simply empty when
// nobody is live. This is the contests themselves: what they are, every one that is running or
// coming up with its prizes, and the standings behind a tap. With none on, it says so and points
// to the battles a member can start any time.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageTitle } from "../components/PageTitle";
import { Avatar, Loading } from "../components/Common";
import { useSession } from "../lib/session";
import { useT } from "../lib/i18n";
import {
  contestStatusLabel, fetchPkContests, fetchPkContestStandings, prizeLabel,
  type PkContest, type StandingRow,
} from "../lib/challenges";

function dates(c: PkContest): string {
  const a = c.starts_at ?? c.start_date, b = c.ends_at ?? c.end_date;
  const f = (s?: string | null) => (s ? new Date(s.replace(" ", "T")).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");
  return a && b ? `${f(a)} – ${f(b)}` : f(a) || f(b);
}

function ContestCard({ c, userId }: { c: PkContest; userId: number }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<StandingRow[] | null>(null);
  const [error, setError] = useState(false);
  const toggle = () => {
    setOpen((o) => !o);
    if (rows === null) fetchPkContestStandings(c.id, userId).then((s) => setRows(s.standings)).catch(() => setError(true));
  };
  const running = c.status === "active";
  return (
    <div className="card pad" style={{ borderColor: "var(--gold-border)", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <b style={{ color: "var(--gold)", fontSize: 17, flex: 1 }}>{c.name || t("fname_pk_battle_contests")}</b>
        <span className="pill" style={{ borderColor: running ? "#4CAF50" : "var(--gold-border)", color: running ? "#4CAF50" : "var(--gold)" }}>
          {contestStatusLabel(c.status)}
        </span>
      </div>
      <span className="muted">{dates(c)}</span>
      {(c.prize_tiers ?? []).length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {(c.prize_tiers ?? []).map((p, i) => (
            <span key={i} className="pill">#{p.rank ?? i + 1} · {prizeLabel(p)}</span>
          ))}
        </div>
      )}
      <button className="btn ghost" onClick={toggle} style={{ alignSelf: "flex-start" }}>
        {open ? t("pkc_hide_standings") : t("pkc_show_standings")}
      </button>
      {open && (error ? <span className="muted">{t("pkc_standings_error")}</span>
        : rows === null ? <Loading />
        : rows.length === 0 ? <span className="muted">{t("pkc_no_scores_yet")}</span>
        : (
          <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {rows.slice(0, 20).map((r, i) => {
              const inner = (
                <>
                  <b style={{ width: 28, color: "var(--gold)" }}>#{i + 1}</b>
                  {r.user_id ? <Avatar user={{ id: r.user_id, username: r.username ?? undefined, profile_image: r.profile_image ?? undefined }} /> : null}
                  <span style={{ flex: 1 }}>{r.label || r.username || "—"}</span>
                  <b style={{ fontVariantNumeric: "tabular-nums" }}>{(r.score ?? 0).toLocaleString()}</b>
                </>
              );
              return (
                <li key={i}>
                  {r.user_id
                    ? <Link to={`/profile/${r.user_id}`} className="row" style={{ alignItems: "center", gap: 8, color: "inherit" }}>{inner}</Link>
                    : <div className="row" style={{ alignItems: "center", gap: 8 }}>{inner}</div>}
                </li>
              );
            })}
          </ol>
        ))}
    </div>
  );
}

export function PkContestsPage() {
  const { t } = useT();
  const { user } = useSession();
  const [contests, setContests] = useState<PkContest[] | null>(null);
  useEffect(() => {
    let live = true;
    fetchPkContests(user?.id ?? 0)
      // Only the admin-run ones that are on or coming up; a finished contest is history.
      .then((all) => { if (live) setContests(all.filter((c) => c.status === "active" || c.status === "upcoming")); })
      .catch(() => { if (live) setContests([]); });
    return () => { live = false; };
  }, [user?.id]);

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <PageTitle>{t("fname_pk_battle_contests")}</PageTitle>
      <div className="card pad" style={{ borderColor: "var(--gold-border)", marginBottom: 14 }}>
        <b style={{ color: "var(--gold)" }}>{t("pkc_how_title")}</b>
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
          <li>{t("pkc_how_1")}</li>
          <li>{t("pkc_how_2")}</li>
          <li>{t("pkc_how_3")}</li>
        </ul>
      </div>
      {contests === null ? <Loading /> : contests.length === 0 ? (
        <div className="card pad" style={{ borderColor: "var(--gold-border)", textAlign: "center", display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
          <b style={{ color: "var(--gold)", fontSize: 17 }}>{t("pkc_none_title")}</b>
          <span className="muted">{t("pkc_none_text")}</span>
          <Link to="/battles" className="btn">{t("pkc_see_battles")}</Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {contests.map((c) => <ContestCard key={c.id} c={c} userId={user?.id ?? 0} />)}
        </div>
      )}
    </div>
  );
}
