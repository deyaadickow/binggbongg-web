import { useCallback, useEffect, useRef, useState } from "react";
import { mediaUrl } from "../lib/api";
import { agreeToEntryFee, endTapGame, gameTitle, gameTitleWithRate, giftTapGameScore, isVideoUrl, sceneFor, speedProfile, startTapGame, type TapGameResult, type TapGameStart, type TapGameType } from "../lib/tapgame";
import { useSession } from "../lib/session";
import { useT } from "../lib/i18n";
import { Confetti, MuteButton } from "./GameShow";
import { haptic, isMuted, sfx } from "../lib/gameSounds";

interface Target { id: number; x: number; y: number; bornAt: number; life: number }
interface Balloon { id: number; lane: number; color: string }

// Balloon Pop — same rules as BalloonPopLanesActivity on the phone: 8 lanes, a balloon spawns at
// the top of a random unlocked lane and falls at one fixed medium pace; tap pops it, a miss just
// disappears. Every pop is worth the host's coin value (resolved server-side).
const LANES = 8;
const LANE_LOCK_MS = 400;
const LANE_SPAWN_CHECK_MS = 115;
const FALL_MS = 4400;
const BALLOON_COLORS = ["#FF8DA1", "#FF4444", "#FF8C00", "#FFD700", "#88FF88", "#22CC22", "#88CCFF", "#4444FF", "#AA44FF"];
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
  const { t } = useT();
  const { user, refresh } = useSession();
  const isRace = game.game_mode === "race";
  const isLanes = game.game_mode === "falling_lanes";
  // Through Number(), because the API typed this as a number but sent a quoted decimal ("1.00")
  // until the backend cast landed 2026-10-03 — which read as "worth 1.00 coins" and never
  // matched the singular test. Old data and old caches can still hand us the string.
  const coinsPer = Number(game.coin_value ?? 1) || 1;
  const [balloons, setBalloons] = useState<Balloon[]>([]);
  const laneLastSpawn = useRef<number[]>(new Array(LANES).fill(0));
  const [phase, setPhase] = useState<Phase>("intro");
  const [start, setStart] = useState<TapGameStart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [caught, setCaught] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [targets, setTargets] = useState<Target[]>([]);
  const [result, setResult] = useState<TapGameResult | null>(null);
  const [gifted, setGifted] = useState(false);
  const [gifting, setGifting] = useState(false);
  const [giftError, setGiftError] = useState<string | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const caughtRef = useRef(0);
  const startedAtRef = useRef(0);
  const nextId = useRef(1);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (game.sound_file_url) audio.current = new Audio(mediaUrl(game.sound_file_url));
  }, [game.sound_file_url]);

  const ctxRef = useRef<AudioContext | null>(null);
  const playTap = useCallback(() => {
    // The Game Show mute button (shared by every room game) silences the taps too.
    if (isMuted()) return;
    const a = audio.current;
    if (a) { a.currentTime = 0; a.play().catch(() => undefined); return; }
    // No admin sound: a short synthesized pop, same idea as the phones' built-in voices.
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = ctxRef.current ?? (ctxRef.current = new Ctx());
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = "triangle"; o.frequency.setValueAtTime(isLanes ? 520 : 660, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(isLanes ? 180 : 330, ctx.currentTime + 0.12);
      g.gain.setValueAtTime(0.25, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
      o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.15);
    } catch { /* audio not available */ }
  }, [isLanes]);

  // Game Show (Steve, 2026-10-27): a fanfare and confetti when the round's result comes in.
  const [burst, setBurst] = useState(0);
  const prevPhase = useRef<Phase>(phase);
  useEffect(() => {
    const was = prevPhase.current;
    prevPhase.current = phase;
    if (phase === "done" && was !== "done" && result) {
      if (Number(result.coins_earned) > 0) { sfx.fanfare(); haptic([40, 60, 40]); setBurst(Date.now()); }
      else sfx.reveal();
    }
  }, [phase, result]);

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
    setBalloons([]);
    laneLastSpawn.current = new Array(LANES).fill(0);
    startedAtRef.current = Date.now();
    setSecondsLeft(s.duration_seconds);
    setElapsed(0);
    setPhase("playing");
  }

  const finish = useCallback(async () => {
    if (!start) return;
    setPhase("finishing");
    setTargets([]);
    setBalloons([]);
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
    const { spawnMs, lifeMs, lifeJitterMs } = speedProfile(start.speed);
    const clock = setInterval(() => {
      const el = Math.round((Date.now() - startedAtRef.current) / 1000);
      setElapsed(el);
      const left = Math.max(0, start.duration_seconds - el);
      setSecondsLeft(left);
      if (left === 0) finish();
    }, 250);
    const spawner = isLanes
      ? setInterval(() => {
          const now = Date.now();
          const lane = Math.floor(Math.random() * LANES);
          if (now - laneLastSpawn.current[lane] < LANE_LOCK_MS) return;
          laneLastSpawn.current[lane] = now;
          setBalloons((prev) => [...prev, { id: nextId.current++, lane, color: BALLOON_COLORS[Math.floor(Math.random() * BALLOON_COLORS.length)] }]);
        }, LANE_SPAWN_CHECK_MS)
      : setInterval(() => {
          const area = areaRef.current;
          if (!area) return;
          const size = 72;
          const now = Date.now();
          setTargets((prev) => {
            const alive = prev.filter((t) => now - t.bornAt < t.life);
            if (alive.length >= MAX_ON_SCREEN) return alive;
            const w = Math.max(0, area.clientWidth - size), h = Math.max(0, area.clientHeight - size);
            return [...alive, { id: nextId.current++, x: Math.random() * w, y: Math.random() * h, bornAt: now, life: lifeMs + Math.random() * lifeJitterMs }];
          });
        }, spawnMs);
    return () => { clearInterval(clock); clearInterval(spawner); };
  }, [phase, start, finish, isLanes]);

  function pop(id: number) {
    if (phase !== "playing") return;
    setBalloons((prev) => (prev.some((b) => b.id === id) ? prev.filter((b) => b.id !== id) : prev));
    caughtRef.current += 1;
    setCaught(caughtRef.current);
    playTap();
  }

  function missed(id: number) {
    setBalloons((prev) => prev.filter((b) => b.id !== id));
  }

  function hit(id: number) {
    if (phase !== "playing") return;
    setTargets((prev) => prev.filter((t) => t.id !== id));
    caughtRef.current += 1;
    setCaught(caughtRef.current);
    playTap();
    if (isRace && caughtRef.current >= RACE_FINISH) finish();
  }

  async function gift() {
    if (!user || !start || gifting) return;
    setGifting(true);
    setGiftError(null);
    try {
      const msg = await giftTapGameScore(user.id, start.session_id);
      setGifted(true);
      onToast(msg);
      refresh();
    } catch (e) {
      // Shown on the card as well as in a toast: a toast over a full-screen game is easy to
      // miss, and "nothing happened" was exactly how this failure was reported.
      const msg = (e as Error).message;
      setGiftError(msg);
      onToast(msg);
    } finally {
      setGifting(false);
    }
  }

  const station = Math.min(RACE_STATIONS, Math.floor(caught / (RACE_FINISH / RACE_STATIONS)));
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  // Admin uploads ONE "background" field and it may hold a video — the Fishing game's is a 7 MB
  // mp4. A video cannot go in CSS url(), so it mounts as a real <video> behind the play area and
  // the CSS layer falls back to the painted scene underneath it.
  const bgUrl = game.background_image_url ? mediaUrl(game.background_image_url) : null;
  const bgIsVideo = isVideoUrl(bgUrl);
  const bg = bgUrl && !bgIsVideo ? `url(${bgUrl}) center/cover` : sceneFor(game);
  const character = game.character_image_url ? mediaUrl(game.character_image_url) : null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "#000", display: "flex", flexDirection: "column" }}>
      <Confetti burst={burst} />
      <div className="row" style={{ padding: "10px 14px", borderBottom: "1px solid var(--gold-border)", background: "var(--panel)" }}>
        <b style={{ color: "var(--gold)", flex: 1 }}>{gameTitleWithRate(game)}</b>
        <MuteButton />
        {phase === "playing" && <span className="pill">{isRace ? `Station ${station}/${RACE_STATIONS} · ${clock(elapsed)}` : `${clock(secondsLeft)} left`}</span>}
        {phase === "playing" && <span className="pill" style={{ marginLeft: 8 }}>{isRace ? `${caught}/${RACE_FINISH}` : isLanes ? `Popped ${caught}` : `Caught ${caught}`}</span>}
        {phase !== "playing" && <button className="btn small ghost" onClick={onClose}>{t("close")}</button>}
      </div>

      <div ref={areaRef} style={{ flex: 1, position: "relative", overflow: "hidden", background: bg, touchAction: "manipulation", userSelect: "none" }}>
        {/* The phones' race card: the racer riding a rainbow track through the 5 stations. */}
        {isRace && phase === "playing" && <RaceTrack emoji={game.emoji || "🏁"} caught={caught} elapsed={clock(elapsed)} />}
        {bgIsVideo && bgUrl && (
          <video
            ref={(el) => {
              if (!el) return;
              // Steve, 2026-09-09, about the phones: "also please make the sound effect of the
              // video work as well" — so this is deliberately NOT muted. The game only ever
              // starts from the player's own tap, which satisfies autoplay policy; if a browser
              // still refuses, drop to muted rather than showing a frozen frame.
              el.play().catch(() => { el.muted = true; el.play().catch(() => undefined); });
            }}
            src={bgUrl} autoPlay loop playsInline
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }}
          />
        )}
        {phase === "playing" && isLanes && balloons.map((b) => <BalloonSprite key={b.id} b={b} onPop={() => pop(b.id)} onMiss={() => missed(b.id)} />)}
        {/* With admin art, the sprite itself is the target. Without it — which is every game but
            one — the phones draw the game's OWN emoji as text (a fish for Fishing, a crab for Crab
            Beach). The web used to draw a gold disc with a dartboard on it for all of them, which
            is why the fishing game showed circles and no fish. */}
        {phase === "playing" && !isLanes && targets.map((t) => (
          <button key={t.id} onPointerDown={() => hit(t.id)} aria-label={`Tap the ${game.catch_name || "target"}`}
            style={{
              position: "absolute", left: t.x, top: t.y, width: 72, height: 72, padding: 0, cursor: "pointer",
              display: "grid", placeItems: "center",
              borderRadius: 36,
              border: character ? "2px solid var(--gold-bright)" : "none",
              // The phones draw the same translucent disc behind a sprite AND behind a bare
              // emoji — it is the tap affordance, not the object.
              background: character ? `url(${character}) center/contain no-repeat, rgba(0,0,0,0.2)` : "rgba(0,0,0,0.2)",
            }}>
            {!character && (
              // A drop shadow so a dark emoji still reads against a dark scene and vice versa.
              <span style={{ fontSize: 38, lineHeight: 1, filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.6))" }}>
                {game.emoji || "🎮"}
              </span>
            )}
          </button>
        ))}

        {phase !== "playing" && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 16, background: "rgba(0,0,0,0.55)" }}>
            <div className="card pad" style={{ width: "min(420px, 100%)", textAlign: "center" }}>
              {phase === "intro" && (
                <>
                  <h2 className="card-title" style={{ fontSize: 22 }}>{gameTitle(game)}</h2>
                  <p className="soft" style={{ marginTop: 8 }}>
                    {isLanes ? `Balloons fall down 8 lanes — tap them to pop them before they reach the bottom. Every pop is worth ${coinsPer} coin${coinsPer === 1 ? "" : "s"}.`
                      : isRace ? `Tap as fast as you can: 5 stations, 20 taps each. Reach station 5 for 100 coins — your time goes on the leaderboard.`
                      : `Tap every ${game.catch_name || "character"} before it disappears. Each catch is worth ${coinsPer} coin${coinsPer === 1 ? "" : "s"}.`}
                  </p>
                  <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>{t("playing_gifts_the_host_50_coins_to_start")}</p>
                  <button className="btn block" style={{ marginTop: 14 }} onClick={begin}>{t("play_now")}</button>
                </>
              )}
              {phase === "starting" && <p className="muted">{t("starting")}</p>}
              {phase === "attention" && start && (
                <>
                  <h2 className="card-title" style={{ fontSize: 22 }}>{t("attention")}</h2>
                  <p className="soft" style={{ marginTop: 8 }}>{t("tap_game_entry_agreement", start.entry_fee_coins)}</p>
                  <div className="row" style={{ marginTop: 14 }}>
                    <button className="btn ghost" style={{ flex: 1 }} onClick={onClose}>{t("gig_cancel")}</button>
                    <button className="btn" style={{ flex: 1 }} onClick={agree}>{t("agree")}</button>
                  </div>
                </>
              )}
              {phase === "finishing" && <p className="muted">{t("adding_up_your_coins")}</p>}
              {phase === "done" && result && (
                <>
                  {/* The same sentence the phones show. The score is what you can gift to the
                      host, never coins you receive, so it is not presented as a standalone
                      total and declining is "NO" rather than "keep them". */}
                  <h2 className="card-title" style={{ fontSize: 18, whiteSpace: "pre-line" }}>
                    {isRace
                      ? `Your ${game.catch_name || "racer"} reached Station ${RACE_STATIONS}\nin ${clock(elapsed)} — ${Number(result.coins_earned).toLocaleString()} coins!`
                      // Number then name, so no plural "s" is guessed: "Caught: 24 × Cricket Ball · worth 24 coins".
                      : `${t(isLanes ? "tap_result_popped" : "tap_result_caught", Number(result.objects_caught).toLocaleString(), isLanes ? (game.catch_name || "Balloon") : (game.catch_name || game.display_name || game.name || "Catch"))} · ${
                          Number(result.coins_earned) === 1 ? t("tap_result_worth_one_coin") : t("tap_result_worth_n_coins", Number(result.coins_earned).toLocaleString())}`}
                  </h2>
                  {/* The offer used to be hidden unless the server also returned host_name, so a
                      round where that came back empty ended with no way to gift at all and no
                      explanation. Coins earned is the only thing that decides it now; the server
                      still has the final say and its refusal is shown as-is. */}
                  {!gifted && result.coins_earned > 0 && (
                    <>
                      <p style={{ marginTop: 12, fontSize: 15, color: "var(--gold)" }}>{t("gift_these_to", result.host_name || t("the_host"))}</p>
                      {giftError && <p style={{ marginTop: 8, fontSize: 13, color: "var(--red)" }}>{giftError}</p>}
                      <div className="row" style={{ marginTop: 10 }}>
                        <button className="btn ghost" style={{ flex: 1 }} onClick={onClose} disabled={gifting}>{t("no")}</button>
                        <button className="btn" style={{ flex: 1 }} onClick={gift} disabled={gifting}>{gifting ? t("gifting_ellipsis") : t("yes_gift")}</button>
                      </div>
                    </>
                  )}
                  {(gifted || !(result.coins_earned > 0)) && <button className="btn block" style={{ marginTop: 12 }} onClick={onClose}>{t("done")}</button>}
                </>
              )}
              {phase === "error" && (
                <>
                  <p style={{ color: "var(--red)" }}>{error}</p>
                  {/* Steve, 2026-09-08, after a real abandoned session was found in the database:
                      a network hiccup while charging the fee used to cost the player the whole
                      screen. If a session already exists, offer the same retry the phones do. */}
                  {start ? (
                    <div className="row" style={{ marginTop: 12 }}>
                      <button className="btn ghost" style={{ flex: 1 }} onClick={onClose}>{t("close_3")}</button>
                      <button className="btn" style={{ flex: 1 }} onClick={agree}>{t("try_again")}</button>
                    </div>
                  ) : (
                    <button className="btn block" style={{ marginTop: 12 }} onClick={onClose}>{t("close")}</button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** The race card over the play area — Android's RaceTrackView: a rainbow bar with a dot per
 *  station (lit once reached), a 🏁 at the end, and the racer bobbing along it. */
export function RaceTrack({ emoji, caught, elapsed }: { emoji: string; caught: number; elapsed: string }) {
  const progress = Math.min(1, caught / RACE_FINISH);
  const reached = Math.min(RACE_STATIONS, Math.floor(caught / (RACE_FINISH / RACE_STATIONS)));
  return (
    <div style={{ position: "absolute", left: 10, right: 10, top: 10, zIndex: 2, background: "rgba(0,0,0,.7)", border: "2px solid var(--gold, #F0C420)", borderRadius: 14, padding: "8px 12px", pointerEvents: "none", color: "#fff" }}>
      <div style={{ display: "flex", fontSize: 13, fontWeight: 700 }}>
        <span style={{ flex: 1, minWidth: 0 }}>Tap the {emoji} — reach Station {RACE_STATIONS}!</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{elapsed}</span>
      </div>
      <div style={{ position: "relative", height: 58 }}>
        <div style={{ position: "absolute", left: 6, right: 26, top: "68%", height: 12, transform: "translateY(-50%)", borderRadius: 6, boxShadow: "0 0 0 2px rgba(255,255,255,.2)",
                      background: "linear-gradient(90deg, #FF3B6B, #FF8C00, #FFD400, #22C55E, #22B8F5, #7C4DFF, #FF3B6B)" }}>
          <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: `${(1 - progress) * 100}%`, borderRadius: 6, background: "rgba(0,0,0,.4)", transition: "width .35s ease-out" }} />
          {Array.from({ length: RACE_STATIONS }, (_, i) => (
            <span key={i} style={{ position: "absolute", left: `${((i + 1) / RACE_STATIONS) * 100}%`, top: "50%", width: 7, height: 7, borderRadius: "50%", transform: "translate(-50%,-50%)",
                                   background: i < reached ? "#fff" : "rgba(0,0,0,.53)", boxShadow: `0 0 0 1.5px ${i < reached ? "#F0C420" : "rgba(255,255,255,.67)"}` }}>
              <b style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", fontSize: 9 }}>{i + 1}</b>
            </span>
          ))}
          <span style={{ position: "absolute", left: `${progress * 100}%`, bottom: 8, transform: "translateX(-50%)", fontSize: 24, lineHeight: 1, transition: "left .35s ease-out" }}>
            <span className="gs-anim" style={{ display: "inline-block", animation: "gs-bob 1.4s ease-in-out infinite" }}>{emoji}</span>
          </span>
          <span style={{ position: "absolute", left: "calc(100% + 13px)", top: "50%", transform: "translate(-50%,-60%)", fontSize: 16 }}>🏁</span>
        </div>
      </div>
      <div style={{ color: "var(--gold, #F0C420)", fontWeight: 700, fontSize: 12 }}>Station {reached} of {RACE_STATIONS} • {caught} of {RACE_FINISH} coins</div>
    </div>
  );
}

/** One balloon: lane-positioned, falls with a CSS animation, popped on pointer-down, gone at the bottom. */
function BalloonSprite({ b, onPop, onMiss }: { b: Balloon; onPop: () => void; onMiss: () => void }) {
  const { t } = useT();
  const laneW = 100 / LANES;
  const dark = shade(b.color, -35);
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); onPop(); }}
      onAnimationEnd={onMiss}
      aria-label={t("pop")}
      style={{
        position: "absolute", top: 0, left: `${b.lane * laneW + laneW * 0.14}%`, width: `${laneW * 0.72}%`, maxWidth: 84,
        background: "transparent", border: "none", padding: 0, cursor: "pointer",
        animation: `bb-fall ${FALL_MS}ms linear forwards`,
      }}
    >
      <div style={{ width: "100%", aspectRatio: "1 / 1.15", borderRadius: "50% 50% 50% 50% / 45% 45% 55% 55%", background: `radial-gradient(circle at 35% 28%, #ffffffcc 0%, ${b.color} 28%, ${dark} 100%)`, boxShadow: "0 3px 8px rgba(0,0,0,0.25)" }} />
      <div style={{ width: 0, height: 0, margin: "-2px auto 0", borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderBottom: `8px solid ${dark}` }} />
      <div style={{ width: 2, margin: "0 auto", height: "min(46px, 55%)", background: "rgba(255,255,255,0.85)", borderRadius: 1 }} />
    </button>
  );
}

function shade(hex: string, pct: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (c * pct) / 100)));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), bl = f(n & 255);
  return `rgb(${r},${g},${bl})`;
}
