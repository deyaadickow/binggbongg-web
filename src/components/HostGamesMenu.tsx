// The host's (G) games menu, matching the phones: pick a game, then its coin value and
// length where that game mode takes them, and it becomes the room's active game. Viewers
// then see the Play Now card. Sending no game id turns the room's game off again.
import { useEffect, useState } from "react";
import {
  GAME_COIN_VALUES, GAME_DURATIONS, clearActiveTapGame, fetchTapGameTypes, gameTitle,
  needsCoinValue, needsDuration, setActiveTapGame, type TapGameType,
} from "../lib/tapgame";

const MODE_FILTERS = [
  { key: "all", label: "All" },
  { key: "catch", label: "Catch" },
  { key: "race", label: "Race" },
  { key: "falling_lanes", label: "Balloon Pop" },
  { key: "puzzle", label: "Puzzle" },
] as const;

type ModeFilter = (typeof MODE_FILTERS)[number]["key"];

function minutesLabel(seconds: number): string {
  const m = seconds / 60;
  return `${m} min${m === 1 ? "" : "s"}`;
}

export function HostGamesMenu({ userId, roomName, activeGame, onClose, onChanged, onToast }: {
  userId: number;
  roomName: string;
  activeGame: TapGameType | null;
  onClose: () => void;
  onChanged: () => void;
  onToast: (m: string) => void;
}) {
  const [games, setGames] = useState<TapGameType[] | null>(null);
  const [picked, setPicked] = useState<TapGameType | null>(null);
  const [coinValue, setCoinValue] = useState(1);
  const [duration, setDuration] = useState(120);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<ModeFilter>("all");

  useEffect(() => {
    let alive = true;
    fetchTapGameTypes()
      .then((list) => { if (alive) setGames(list); })
      .catch(() => { if (alive) setGames([]); });
    return () => { alive = false; };
  }, []);

  const shown = (games ?? []).filter((g) => {
    if (mode !== "all" && (g.game_mode ?? "") !== mode) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${g.display_name ?? ""} ${g.name ?? ""} ${g.catch_name ?? ""}`.toLowerCase().includes(q);
  });

  async function start() {
    if (!picked || busy) return;
    setBusy(true);
    try {
      await setActiveTapGame(userId, roomName, picked, { durationSeconds: duration, coinValue });
      onToast(`${gameTitle(picked)} is running — viewers can play now.`);
      onChanged();
      onClose();
    } catch (e) {
      onToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    if (busy) return;
    setBusy(true);
    try {
      await clearActiveTapGame(userId, roomName);
      onToast("Game turned off.");
      onChanged();
      onClose();
    } catch (e) {
      onToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.65)", display: "grid", placeItems: "center", padding: 16 }}>
      <div className="card pad" style={{ width: "min(460px, 100%)", maxHeight: "86vh", overflowY: "auto" }}>
        <div className="row" style={{ marginBottom: 10 }}>
          <b style={{ color: "var(--gold)", flex: 1, fontSize: 18 }}>🎮 Games</b>
          <button className="btn small ghost" onClick={onClose}>Close</button>
        </div>

        {activeGame && !picked && (
          <div className="card pad" style={{ marginBottom: 12 }}>
            <div className="muted" style={{ fontSize: 12 }}>Running now</div>
            <b style={{ color: "var(--gold)" }}>{gameTitle(activeGame)}</b>
            <button className="btn ghost block" style={{ marginTop: 10 }} disabled={busy} onClick={turnOff}>
              Turn this game off
            </button>
          </div>
        )}

        {!picked && (
          games === null ? <p className="muted">Loading games…</p>
          : games.length === 0 ? <p className="muted">No games are available right now.</p>
          : (
            <>
              <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
                Pick a game for your room. Viewers pay 50 coins to join, and their score becomes a gift to you.
              </p>
              {/* There are ~77 games, so browsing the raw list is impractical. */}
              <input className="input" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${games.length} games…`} style={{ width: "100%", marginBottom: 8 }} />
              <div className="row" style={{ flexWrap: "wrap", marginBottom: 10 }}>
                {MODE_FILTERS.map((f) => (
                  <button key={f.key} className={f.key === mode ? "btn small" : "btn small ghost"}
                    style={{ marginRight: 6, marginBottom: 6 }} onClick={() => setMode(f.key)}>{f.label}</button>
                ))}
              </div>
              {shown.length === 0 && <p className="muted">No games match that.</p>}
              {/* Not .btn here: that is a pill, and a game with a long description (Color Balls)
                  spills straight out of the rounded shape. A squared-off row holds both lines. */}
              {shown.map((g) => (
                <button key={g.id} onClick={() => { setPicked(g); setCoinValue(Math.round(Number(g.coin_value)) || 1); setDuration(120); }}
                  style={{
                    display: "block", width: "100%", textAlign: "left", marginBottom: 8, padding: "10px 12px",
                    borderRadius: 10, border: "1px solid var(--gold-border)", background: "transparent",
                    color: "var(--text)", cursor: "pointer", font: "inherit",
                  }}>
                  <span style={{ fontWeight: 700 }}>{gameTitle(g)}</span>
                  {g.description && (
                    <span className="muted" style={{
                      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                      overflow: "hidden", fontSize: 12, marginTop: 2,
                    }}>{g.description}</span>
                  )}
                </button>
              ))}
            </>
          )
        )}

        {picked && (
          <>
            <div className="row" style={{ marginBottom: 12 }}>
              <b style={{ flex: 1, color: "var(--gold)" }}>{gameTitle(picked)}</b>
              <button className="btn small ghost" onClick={() => setPicked(null)}>Back</button>
            </div>

            {needsCoinValue(picked) && (
              <>
                <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>Coins per catch</div>
                <div className="row" style={{ flexWrap: "wrap", marginBottom: 14 }}>
                  {GAME_COIN_VALUES.map((v) => (
                    <button key={v} className={v === coinValue ? "btn small" : "btn small ghost"}
                      style={{ marginRight: 6, marginBottom: 6 }} onClick={() => setCoinValue(v)}>
                      {v} coin{v === 1 ? "" : "s"}
                    </button>
                  ))}
                </div>
              </>
            )}

            {needsDuration(picked) && (
              <>
                <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>Game length</div>
                <div className="row" style={{ flexWrap: "wrap", marginBottom: 14 }}>
                  {GAME_DURATIONS.map((s) => (
                    <button key={s} className={s === duration ? "btn small" : "btn small ghost"}
                      style={{ marginRight: 6, marginBottom: 6 }} onClick={() => setDuration(s)}>
                      {minutesLabel(s)}
                    </button>
                  ))}
                </div>
              </>
            )}

            {!needsDuration(picked) && (
              <p className="muted" style={{ fontSize: 12 }}>
                {picked.game_mode === "race" ? "A race runs until the finish line — no clock to set." : "This game has no time limit."}
              </p>
            )}

            <button className="btn block" disabled={busy} onClick={start}>
              {busy ? "Starting…" : "Start this game"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
