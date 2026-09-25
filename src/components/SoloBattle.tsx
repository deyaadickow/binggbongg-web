// Solo Battle in the live room: the strip everyone in the room sees while one is running, and
// the standings sheet behind it. Mirrors what the phones show — a join window everyone can
// enter during, then a live leaderboard scored by gift coins received.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { mediaUrl } from "../lib/api";
import { fetchSoloStandings, joinSoloBattle, type SoloBattle, type StandingRow } from "../lib/solobattle";
import { clock, secondsUntil } from "../lib/battles";

/** Whether the join window is still open — the phones gate the Join button on exactly this. */
export function isJoinWindowOpen(battle: SoloBattle, now: number): boolean {
  const left = secondsUntil(battle.starts_at, now);
  return left !== null && left > 0;
}

export function SoloBattleStrip({ battle, myUserId, onOpenStandings, onToast, onJoined }: {
  battle: SoloBattle;
  myUserId: number | null;
  onOpenStandings: () => void;
  onToast: (m: string) => void;
  onJoined: () => void;
}) {
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
    <div className="card pad" style={{ marginTop: 12, borderColor: "var(--gold-border)" }}>
      <div className="row" style={{ alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <b style={{ color: "var(--gold)" }}>🏆 Solo Battle</b>
          <div className="muted" style={{ fontSize: 12 }}>
            {joinOpen
              ? `Anyone can join for the next ${clock(joinLeft)} — go live and the gifts you receive count.`
              : endsIn !== null && endsIn > 0
              ? `Running — ${clock(endsIn)} left. Most gift coins wins.`
              : "Finished."}
          </div>
        </div>
        <button className="btn small ghost" onClick={onOpenStandings}>Leaderboard</button>
        {joinOpen && myUserId && !joined && (
          <button className="btn small" disabled={busy} onClick={join} style={{ marginLeft: 6 }}>
            {busy ? "Joining…" : "Join"}
          </button>
        )}
        {joined && <span className="pill" style={{ marginLeft: 6 }}>You're in</span>}
      </div>
    </div>
  );
}

export function SoloBattleStandingsSheet({ battle, myUserId, onClose }: {
  battle: SoloBattle;
  myUserId: number | null;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<StandingRow[] | null>(null);

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
          <b style={{ color: "var(--gold)", flex: 1, fontSize: 18 }}>🏆 Solo Battle</b>
          <button className="btn small ghost" onClick={onClose}>Close</button>
        </div>
        {rows === null ? (
          <p className="muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="muted">No one has scored yet.</p>
        ) : (
          rows.map((r, i) => (
            <div key={`${r.user_id ?? i}`} className="row" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)", alignItems: "center" }}>
              <b style={{ color: "var(--gold)", width: 28 }}>#{i + 1}</b>
              {r.profile_image
                ? <img src={mediaUrl(r.profile_image)} alt="" style={{ width: 30, height: 30, borderRadius: 15, objectFit: "cover" }} />
                : <div style={{ width: 30, height: 30, borderRadius: 15, background: "var(--panel)" }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* The phones let you tap a name to go straight to that person's live. */}
                {r.user_id
                  ? <Link to={`/profile/${r.user_id}`} onClick={onClose} style={{ fontWeight: 700 }}>{r.label || r.username || "Member"}</Link>
                  : <span style={{ fontWeight: 700 }}>{r.label || "Member"}</span>}
                {r.location && <div className="muted" style={{ fontSize: 12 }}>{r.location}</div>}
              </div>
              <b>{Number(r.score ?? 0).toLocaleString()}</b>
            </div>
          ))
        )}
        <p className="muted" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
          Scored by the gift coins each person receives while the battle runs.
        </p>
      </div>
    </div>
  );
}
