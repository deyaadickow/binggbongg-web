// Solo Battle in the live room: the strip everyone in the room sees while one is running, and
// the standings sheet behind it. Mirrors what the phones show — a join window everyone can
// enter during, then a live leaderboard scored by gift coins received.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { mediaUrl } from "../lib/api";
import { fetchSoloStandings, joinSoloBattle, type SoloBattle, type StandingRow } from "../lib/solobattle";
import { clock, secondsUntil } from "../lib/battles";
import { useT } from "../lib/i18n";
import { Confetti, Podium } from "./GameShow";
import { haptic, sfx } from "../lib/gameSounds";

/** Past its end time — the clock the strip already counts down on. */
function isFinished(battle: SoloBattle, now: number): boolean {
  const left = secondsUntil(battle.ends_at, now);
  return left !== null && left <= 0;
}

/** Whether the join window is still open — the phones gate the Join button on exactly this. */
export function isJoinWindowOpen(battle: SoloBattle, now: number): boolean {
  const left = secondsUntil(battle.starts_at, now);
  return left !== null && left > 0;
}

/** The winner of a finished Solo Battle from its standings: the top scorer, or a tie for first
 *  (nobody is crowned), or nobody at all if no one scored. */
function soloOutcome(rows: StandingRow[] | null): { winner: StandingRow | null; tie: boolean } {
  const top = Number(rows?.[0]?.score ?? 0);
  if (!rows || top <= 0) return { winner: null, tie: false };
  if (rows.length > 1 && Number(rows[1].score ?? 0) === top) return { winner: null, tie: true };
  return { winner: rows[0], tie: false };
}
const standingName = (r: StandingRow) => r.label || r.username || "Member";

export function SoloBattleStrip({ battle, myUserId, onOpenStandings, onToast, onJoined }: {
  battle: SoloBattle;
  myUserId: number | null;
  onOpenStandings: () => void;
  onToast: (m: string) => void;
  onJoined: () => void;
}) {
  const { t } = useT();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const joinOpen = isJoinWindowOpen(battle, now);
  const joinLeft = secondsUntil(battle.starts_at, now);
  const endsIn = secondsUntil(battle.ends_at, now);
  const joined = battle.already_joined === true;
  // Game Show (Steve, 2026-10-27): a fanfare and confetti the moment the battle's clock runs out
  // while you're watching — on the CHANGE, so opening a room after it ended stays quiet.
  const finished = isFinished(battle, now);
  const [burst, setBurst] = useState(0);
  // Once it's over, the strip names the winner — one standings read, not a poll.
  const [finalRows, setFinalRows] = useState<StandingRow[] | null>(null);
  useEffect(() => {
    if (!finished) { setFinalRows(null); return; }
    let alive = true;
    fetchSoloStandings(battle.id, myUserId ?? undefined).then((r) => { if (alive) setFinalRows(r); }).catch(() => undefined);
    return () => { alive = false; };
  }, [finished, battle.id, myUserId]);
  const outcome = soloOutcome(finalRows);
  const wasFinished = useRef({ id: battle.id, finished });
  useEffect(() => {
    const was = wasFinished.current;
    wasFinished.current = { id: battle.id, finished };
    if (was.id === battle.id && !was.finished && finished) { sfx.fanfare(); haptic([40, 60, 40]); setBurst(Date.now()); }
  }, [battle.id, finished]);

  async function join() {
    if (!myUserId || busy) return;
    setBusy(true);
    try {
      await joinSoloBattle(battle.id, myUserId);
      onToast("You're in — go live to start scoring.");
      onJoined();
    } catch (e) {
      onToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card pad" style={{ position: "relative", marginTop: 12, borderColor: "var(--gold-border)" }}>
      <Confetti burst={burst} />
      <div className="row" style={{ alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <b style={{ color: "var(--gold)" }}>{t("solo_battle_with_unlimited_players")}</b>
          <div className="muted" style={{ fontSize: 12 }}>
            {joinOpen
              ? `Anyone can join for the next ${clock(joinLeft)} — go live and the gifts you receive count.`
              : endsIn !== null && endsIn > 0
              ? `Running — ${clock(endsIn)} left. Most gift coins wins.`
              : outcome.winner ? `🏁 Finished — 👑 ${standingName(outcome.winner)} wins!`
              : outcome.tie ? "🏁 Finished — 🤝 Tie!"
              : "🏁 Finished — 👑 the winner is top of the leaderboard."}
          </div>
        </div>
        <button className="btn small ghost" onClick={onOpenStandings}>{t("leaderboard")}</button>
        {joinOpen && myUserId && !joined && (
          <button className="btn small" disabled={busy} onClick={join} style={{ marginLeft: 6 }}>
            {busy ? "Joining…" : "Join"}
          </button>
        )}
        {joined && <span className="pill" style={{ marginLeft: 6 }}>{t("you_re_in")}</span>}
      </div>
    </div>
  );
}

export function SoloBattleStandingsSheet({ battle, myUserId, onClose }: {
  battle: SoloBattle;
  myUserId: number | null;
  onClose: () => void;
}) {
  const { t } = useT();
  const [rows, setRows] = useState<StandingRow[] | null>(null);
  const finished = isFinished(battle, Date.now());
  const nameOf = standingName;

  const { tie } = soloOutcome(rows);
  const crowned = finished && !tie;

  const load = useCallback(() => {
    fetchSoloStandings(battle.id, myUserId ?? undefined).then(setRows).catch(() => setRows([]));
  }, [battle.id, myUserId]);

  useEffect(() => {
    load();
    // The phones poll this while it is open so a leaderboard moves as gifts land.
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.65)", display: "grid", placeItems: "center", padding: 16 }}>
      <div className="card pad" style={{ width: "min(460px, 100%)", maxHeight: "86vh", overflowY: "auto" }}>
        <div className="row" style={{ marginBottom: 10 }}>
          <b style={{ color: "var(--gold)", flex: 1, fontSize: 18 }}>{t("solo_battle_with_unlimited_players")}</b>
          <button className="btn small ghost" onClick={onClose}>{t("close")}</button>
        </div>
        {rows === null ? (
          <p className="muted">{t("imagePickerLoading")}</p>
        ) : rows.length === 0 ? (
          <p className="muted">{t("no_one_has_scored_yet")}</p>
        ) : (
          <>
          {/* Game Show: once it's over, the top three on a podium, the winner crowned — unless
              first place is shared, when nobody is ("Tie!"). */}
          {finished && Number(rows[0]?.score ?? 0) > 0 && (
            <div style={{ marginBottom: 10 }}>
              {tie && <div style={{ textAlign: "center", fontWeight: 900, color: "var(--gold)", marginBottom: 4 }}>🤝 Tie!</div>}
              <Podium tie={tie} rows={rows.slice(0, 3).filter((r) => Number(r.score ?? 0) > 0).map((r) => ({ name: nameOf(r), value: Number(r.score ?? 0).toLocaleString() }))} />
            </div>
          )}
          {rows.map((r, i) => (
            <div key={`${r.user_id ?? i}`} className="row" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)", alignItems: "center" }}>
              <b style={{ color: "var(--gold)", width: 28 }}>#{i + 1}</b>
              {r.profile_image
                ? <img src={mediaUrl(r.profile_image)} alt="" style={{ width: 30, height: 30, borderRadius: 15, objectFit: "cover" }} />
                : <div aria-hidden style={{ width: 30, height: 30, borderRadius: 15, background: "var(--panel)", border: "1px solid var(--gold-border)", color: "var(--gold)", fontWeight: 800, fontSize: 14, display: "grid", placeItems: "center", flex: "none" }}>{(nameOf(r).trim()[0] ?? "?").toUpperCase()}</div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* The phones let you tap a name to go straight to that person's live. */}
                {r.user_id
                  ? <Link to={`/profile/${r.user_id}`} onClick={onClose} style={{ fontWeight: 700 }}>{crowned && i === 0 ? "👑 " : ""}{nameOf(r)}</Link>
                  : <span style={{ fontWeight: 700 }}>{crowned && i === 0 ? "👑 " : ""}{nameOf(r)}</span>}
                {r.location && <div className="muted" style={{ fontSize: 12 }}>{r.location}</div>}
              </div>
              <b>{Number(r.score ?? 0).toLocaleString()}</b>
            </div>
          ))}
          </>
        )}
        <p className="muted" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
          {t("scored_by_the_gift_coins_each_person_rec")}</p>
      </div>
    </div>
  );
}
