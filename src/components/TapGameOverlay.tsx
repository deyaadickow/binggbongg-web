import { useCallback, useEffect, useRef, useState } from "react";
import { mediaUrl } from "../lib/api";
import { agreeToEntryFee, endTapGame, gameTitle, giftTapGameScore, speedProfile, startTapGame, type TapGameResult, type TapGameStart, type TapGameType } from "../lib/tapgame";
import { useSession } from "../lib/session";

interface Target { id: number; x: number; y: number; bornAt: number; life: number }
type Phase = "intro" | "starting" | "attention" | "playing" | "finishing" | "done" | "error";

const RACE_FINISH = 100;
const RACE_STATIONS = 5;
const MAX_ON_SCREEN = 10;

/**
 * Full-screen game over the live room. Catch mode: tap the characters before they vanish.
 * Race mode: 100 taps through 5 stations, timed. Balloon Pop and Colour Balls fall back to the
 * catch mechanic (their exact phone layouts are a later pass).
 */
export function TapGameOverlay({ game, roomName, onClose, onToast }: { game: TapGameType; roomName: string; onClose: () => void; onToast: (m: string) => void }) {
  const { user, refresh } = useSession();
  const isRace = game.game_mode === "race";
  const [phase, setPhase] = useState<Phase>("intro");
  const [start, setStart] = useState<TapGameStart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [caught, setCaught] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [targets, setTargets] = useState<Target[]>([]);
  const [result, setResult] = useState<TapGameResult | null>(null);
  const [gifted, setGifted] = useState(false);
  const areaRef = useRef<HTMLDivElement>(null);
  const caughtRef = useRef(0);
  const startedAtRef = useRef(0);
  const nextId = useRef(1);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (game.sound_file_url) audio.current = new Audio(mediaUrl(game.sound_file_url));
  }, [game.sound_file_url]);

  const playTap = useCallback(() => {
    const a = audio.current;
    if (a) { a.currentTime = 0; a.play().catch(() => undefined); }
  }, []);

  async function begin() {
    if (!user) return;
    setPhase("starting");
    setError(null);
    try {
      const s = await startTapGame(user.id, game.id, roomName);
      setStart(s);
      if (s.needs_attention_popup) setPhase("attention");
      else launch(s);
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  }

  async function agree() {
    if (!user || !start) return;
    setPhase("starting");
    try {
      await agreeToEntryFee(user.id, start.session_id);
      refresh();
      launch(start);
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  }

  function launch(s: TapGameStart) {
    caughtRef.current = 0;
    setCaught(0);
    setTargets([]);
    startedAtRef.current = Date.now();
    setSecondsLeft(s.duration_seconds);
    setElapsed(0);
    setPhase("playing");
  }

  const finish = useCallback(async () => {
    if (!start) return;
    setPhase("finishing");
    setTargets([]);
    const secs = Math.round((Date.now() - startedAtRef.current) / 1000);
    try {
      const r = await endTapGame(start.session_id, Math.min(caughtRef.current, isRace ? RACE_FINISH : 100000), isRace ? secs : undefined);
      setResult(r);
      setPhase("done");
      refresh();
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  }, [start, isRace, refresh]);

  // Clock + spawner while playing.
  useEffect(() => {
    if (phase !== "playing" || !start) return;
    const { spawnMs, lifeMs } = speedProfile(start.speed);
    const clock = setInterval(() => {
      const el = Math.round((Date.now() - startedAtRef.current) / 1000);
      setElapsed(el);
      const left = Math.max(0, start.duration_seconds - el);
      setSecondsLeft(left);
      if (left === 0) finish();
    }, 250);
    const spawner = setInterval(() => {
      const area = areaRef.current;
      if (!area) return;
      const size = 64;
      const now = Date.now();
      setTargets((prev) => {
        const alive = prev.filter((t) => now - t.bornAt < t.life);
        if (alive.length >= MAX_ON_SCREEN) return alive;
        const w = Math.max(0, area.clientWidth - size), h = Math.max(0, area.clientHeight - size);
        return [...alive, { id: nextId.current++, x: Math.random() * w, y: Math.random() * h, bornAt: now, life: lifeMs }];
      });
    }, spawnMs);
    return () => { clearInterval(clock); clearInterval(spawner); };
  }, [phase, start, finish]);

  function hit(id: number) {
    if (phase !== "playing") return;
    setTargets((prev) => prev.filter((t) => t.id !== id));
    caughtRef.current += 1;
    setCaught(caughtRef.current);
    playTap();
    if (isRace && caughtRef.current >= RACE_FINISH) finish();
  }

  async function gift() {
    if (!user || !start) return;
    try {
      const msg = await giftTapGameScore(user.id, start.session_id);
      setGifted(true);
      onToast(msg);
      refresh();
    } catch (e) { onToast((e as Error).message); }
  }

  const station = Math.min(RACE_STATIONS, Math.floor(caught / (RACE_FINISH / RACE_STATIONS)));
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const bg = game.background_image_url ? `url(${mediaUrl(game.background_image_url)}) center/cover` : "radial-gradient(circle at 30% 20%, #2a2408, #000 70%)";
  const character = game.character_image_url ? mediaUrl(game.character_image_url) : null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "#000", display: "flex", flexDirection: "column" }}>
      <div className="row" style={{ padding: "10px 14px", borderBottom: "1px solid var(--gold-border)", background: "var(--panel)" }}>
        <b style={{ color: "var(--gold)", flex: 1 }}>{gameTitle(game)}</b>
        {phase === "playing" && <span className="pill">{isRace ? `Station ${station}/${RACE_STATIONS} · ${clock(elapsed)}` : `${clock(secondsLeft)} left`}</span>}
        {phase === "playing" && <span className="pill" style={{ marginLeft: 8 }}>{isRace ? `${caught}/${RACE_FINISH}` : `Caught ${caught}`}</span>}
        {phase !== "playing" && <button className="btn small ghost" onClick={onClose}>Close</button>}
      </div>

      <div ref={areaRef} style={{ flex: 1, position: "relative", overflow: "hidden", background: bg, touchAction: "manipulation", userSelect: "none" }}>
        {phase === "playing" && targets.map((t) => (
          <button key={t.id} onPointerDown={() => hit(t.id)} aria-label="Tap"
            style={{ position: "absolute", left: t.x, top: t.y, width: 64, height: 64, borderRadius: 32, border: "2px solid var(--gold-bright)", background: character ? `url(${character}) center/contain no-repeat, #101010` : "var(--gold)", cursor: "pointer", padding: 0 }}>
            {!character && <span style={{ fontSize: 28 }}>🎯</span>}
          </button>
        ))}

        {phase !== "playing" && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 16, background: "rgba(0,0,0,0.55)" }}>
            <div className="card pad" style={{ width: "min(420px, 100%)", textAlign: "center" }}>
              {phase === "intro" && (
                <>
                  <h2 className="card-title" style={{ fontSize: 22 }}>{gameTitle(game)}</h2>
                  <p className="soft" style={{ marginTop: 8 }}>
                    {isRace ? `Tap as fast as you can: 5 stations, 20 taps each. Reach station 5 for 100 coins — your time goes on the leaderboard.`
                      : `Tap every ${game.catch_name || "character"} before it disappears. Each catch is worth ${game.coin_value ?? 1} coin${(game.coin_value ?? 1) === 1 ? "" : "s"}.`}
                  </p>
                  <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Playing gifts the host 50 coins to start.</p>
                  <button className="btn block" style={{ marginTop: 14 }} onClick={begin}>Play Now</button>
                </>
              )}
              {phase === "starting" && <p className="muted">Starting…</p>}
              {phase === "attention" && start && (
                <>
                  <h2 className="card-title" style={{ fontSize: 22 }}>Attention</h2>
                  <p className="soft" style={{ marginTop: 8 }}>When you start playing any of these games that means you agree to gift the host {start.entry_fee_coins} coins to start — every time you play, not just this once.</p>
                  <div className="row" style={{ marginTop: 14 }}>
                    <button className="btn ghost" style={{ flex: 1 }} onClick={onClose}>CANCEL</button>
                    <button className="btn" style={{ flex: 1 }} onClick={agree}>AGREE</button>
                  </div>
                </>
              )}
              {phase === "finishing" && <p className="muted">Adding up your coins…</p>}
              {phase === "done" && result && (
                <>
                  <h2 className="card-title" style={{ fontSize: 22 }}>{isRace && caught >= RACE_FINISH ? `Station 5 in ${clock(elapsed)}!` : "Time's up!"}</h2>
                  <p style={{ fontSize: 32, fontWeight: 800, color: "var(--gold-bright)", margin: "8px 0" }}>{Number(result.coins_earned).toLocaleString()} coins</p>
                  <p className="soft">{result.objects_caught} {isRace ? "taps" : "caught"}</p>
                  {!gifted && result.coins_earned > 0 && result.host_name && (
                    <>
                      <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>Gift these {Number(result.coins_earned).toLocaleString()} coins to {result.host_name}?</p>
                      <div className="row" style={{ marginTop: 10 }}>
                        <button className="btn ghost" style={{ flex: 1 }} onClick={onClose}>Keep them</button>
                        <button className="btn" style={{ flex: 1 }} onClick={gift}>🎁 Gift to {result.host_name}</button>
                      </div>
                    </>
                  )}
                  {(gifted || !(result.coins_earned > 0) || !result.host_name) && <button className="btn block" style={{ marginTop: 12 }} onClick={onClose}>Done</button>}
                </>
              )}
              {phase === "error" && (
                <>
                  <p style={{ color: "var(--red)" }}>{error}</p>
                  <button className="btn block" style={{ marginTop: 12 }} onClick={onClose}>Close</button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
