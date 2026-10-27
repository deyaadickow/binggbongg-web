// Pyramid battle panel (Steve, 2026-10-27) — top-left over the stream like his reference picture:
// one column per player, 💰 🐶 🔥 ❤️ 🌹 from the top in gold circles, their coins, and a 🌹 button
// (click = 1 Flower, shift-click = 10). Same shape as the phones.
import { useEffect, useRef, useState } from "react";
import type { LiveTile } from "../lib/live";
import type { PyramidGame, PyramidPlayer, PyramidTiers } from "../lib/pyramid";
import { Confetti, CountdownRing, MuteButton, Podium, SceneBanner } from "./GameShow";
import { SCENES } from "../lib/gameSceneData";
import { haptic, sfx } from "../lib/gameSounds";

const gold = "var(--gold, #F0C420)";
/** Bottom to top — the order a gift climbs. */
const TIERS: (keyof PyramidTiers)[] = ["flowers", "hearts", "fires", "puppies", "bags"];

/** A player's live camera at the top of their column (Steve, 2026-10-27: "add the video screen
 *  for every player on all games") — a second video element on the room's own track. */
function ColumnScreen({ tile }: { tile: LiveTile }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { const el = ref.current; if (!el) return; return tile.attach(el); }, [tile]);
  return <video ref={ref} autoPlay playsInline muted style={{ width: 66, height: 88, objectFit: "cover", borderRadius: 8, background: "#000", border: `2px solid ${gold}`, marginBottom: 3, transform: tile.isLocal ? "scaleX(-1)" : undefined }} />;
}

function compact(n: number) {
  return n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(n);
}

export function PyramidOverlay({ game, myUserId, onSend, onEnd, onClose, tileFor }: {
  game: PyramidGame; myUserId: number;
  tileFor?: (userId: number) => LiveTile | undefined;
  onSend: (playerId: number, flowers: number) => void; onEnd: () => void; onClose: () => void;
}) {
  const [left, setLeft] = useState(game.seconds_left);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { setLeft(game.seconds_left); }, [game.seconds_left, game.pyramid_game_id]);
  useEffect(() => {
    if (game.status !== "active") return;
    const id = window.setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [game.status, game.pyramid_game_id]);
  const active = game.status === "active";
  const winner = game.players.find((p) => p.user_id === game.winner_user_id);

  // Game Show (Steve, 2026-10-27): every gift tier has its own sound — higher tiers louder — and
  // the circle that went up pops; the end gets a fanfare, confetti and a podium. Fired on CHANGES
  // between polls only: the ref holds what the last poll said.
  const [popped, setPopped] = useState<Set<string>>(() => new Set());
  const [burst, setBurst] = useState(0);
  const popTimer = useRef<number | undefined>(undefined);
  const tiersOf = (g: PyramidGame) => new Map(g.players.map((p) => [p.user_id, p.tiers]));
  const prev = useRef({ id: game.pyramid_game_id, status: game.status, tiers: tiersOf(game) });
  useEffect(() => () => window.clearTimeout(popTimer.current), []);
  useEffect(() => {
    const was = prev.current;
    prev.current = { id: game.pyramid_game_id, status: game.status, tiers: tiersOf(game) };
    if (was.id !== game.pyramid_game_id) { setPopped(new Set()); return; }
    const up = new Set<string>();
    let top = -1;
    for (const p of game.players) {
      const before = was.tiers.get(p.user_id);
      TIERS.forEach((tier, level) => {
        if (p.tiers[tier] > (before?.[tier] ?? 0)) { up.add(`${p.user_id}:${tier}`); top = Math.max(top, level); }
      });
    }
    if (up.size) {
      setPopped(up);
      window.clearTimeout(popTimer.current);
      popTimer.current = window.setTimeout(() => setPopped(new Set()), 1200);
    }
    if (was.status === "active" && game.status !== "active") {
      if (game.winner_user_id !== null) { sfx.fanfare(); setBurst(Date.now()); }
      return;
    }
    // 🌹 a click · ❤️ two notes · 🔥 🐶 the chime · 💰 the chime and a buzz.
    if (top === 0) sfx.lock();
    else if (top === 1) sfx.reveal();
    else if (top >= 2) { sfx.correct(); if (top === 4) haptic([40, 60, 40]); }
  }, [game]);
  const podium = active ? [] : [...game.players].filter((p) => p.flowers_total > 0)
    .sort((a, b) => (Number(b.user_id === game.winner_user_id) - Number(a.user_id === game.winner_user_id)) || b.flowers_total - a.flowers_total)
    .slice(0, 3).map((p) => ({ name: p.name, value: `${compact(p.flowers_total)} 🌹` }));

  const circle = (emoji: string, n: number, pop = false) => (
    <div className="gs-anim" style={{ width: 46, height: 46, borderRadius: "50%", border: `2px solid ${n > 0 ? gold : "rgba(212,175,55,.4)"}`, background: pop ? "rgba(240,196,32,.35)" : "rgba(0,0,0,.6)",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", marginTop: 4, lineHeight: 1.05,
                  animation: pop ? "gs-pop .45s ease-in-out 2" : "none", boxShadow: pop ? "0 0 12px 3px rgba(240,196,32,.75)" : "none", transition: "background .4s, box-shadow .4s" }}>
      <span style={{ fontSize: 13 }}>{emoji}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: n > 0 ? gold : "#fff" }}>{n}</span>
    </div>
  );
  const column = (p: PyramidPlayer) => {
    const won = !active && game.winner_user_id === p.user_id;
    const tile = tileFor?.(p.user_id);
    return (
      <div key={p.user_id} style={{ width: 74, display: "flex", flexDirection: "column", alignItems: "center" }}>
        {tile && <ColumnScreen tile={tile} />}
        <div style={{ fontSize: 10.5, fontWeight: 700, color: won ? gold : "#fff", maxWidth: 74, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {won ? "👑 " : ""}{p.name}
        </div>
        {circle("💰", p.tiers.bags, popped.has(`${p.user_id}:bags`))}{circle("🐶", p.tiers.puppies, popped.has(`${p.user_id}:puppies`))}{circle("🔥", p.tiers.fires, popped.has(`${p.user_id}:fires`))}{circle("❤️", p.tiers.hearts, popped.has(`${p.user_id}:hearts`))}{circle("🌹", p.tiers.flowers, popped.has(`${p.user_id}:flowers`))}
        <div style={{ fontSize: 10, color: gold, marginTop: 4 }}>{compact(p.coins)} coins</div>
        {active && (p.user_id === myUserId
          ? <div style={{ marginTop: 4, width: "100%", textAlign: "center", fontSize: 11, fontWeight: 700, color: gold, border: `1px solid ${gold}`, borderRadius: 999, padding: "4px 0" }}>You</div>
          : <button title="Click for 1 Flower — Shift-click for 10" onClick={(e) => onSend(p.user_id, e.shiftKey ? 10 : 1)}
                    style={{ marginTop: 4, width: "100%", fontSize: 11, fontWeight: 700, color: "#000", background: gold, border: "none", borderRadius: 999, padding: "5px 0", cursor: "pointer" }}>
              🌹 Send
            </button>)}
      </div>
    );
  };

  return (
    <div style={{ position: "fixed", top: 140, left: 12, zIndex: 90, background: "rgba(0,0,0,.72)", border: `2px solid ${gold}`, borderRadius: 14, padding: 8, color: "#fff", userSelect: "none", maxWidth: "calc(100vw - 24px)", boxSizing: "border-box" }}>
      <Confetti burst={burst} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <b style={{ color: gold, fontSize: 13 }}>🔺 Pyramid #{game.game_no}</b>
        <b style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{active ? `⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "Finished"}</b>
        {active && game.host_user_id === myUserId && (
          <button onClick={() => { if (window.confirm("End the Pyramid game? Whoever has the highest pyramid right now wins.")) onEnd(); }}
                  style={{ fontSize: 11, fontWeight: 700, background: gold, color: "#000", border: "none", borderRadius: 999, padding: "2px 10px", cursor: "pointer" }}>End</button>
        )}
        <MuteButton />
        <button onClick={() => setCollapsed((c) => !c)} style={{ background: "none", border: "none", color: gold, fontSize: 18, cursor: "pointer" }}>{collapsed ? "+" : "–"}</button>
        <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: "#fff", fontSize: 15, cursor: "pointer" }}>✕</button>
      </div>
      {!collapsed && (
        <>
          <div style={{ marginTop: 6 }}>
            <SceneBanner scene={SCENES.garden} height={54}>
              {active && <div style={{ position: "absolute", left: 5, top: 5 }}><CountdownRing msLeft={left * 1000} totalMs={Math.max(left, game.duration_minutes * 60) * 1000} size={44} /></div>}
              {!active && (
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(0,0,0,.3)", padding: "0 8px" }}>
                  <span className="gs-anim" style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14, fontWeight: 900, textShadow: "0 2px 4px #000", animation: winner ? "gs-pop .8s ease-in-out 3" : "none" }}>
                    {winner ? `👑 ${winner.name}` : "🏁 Finished"}
                  </span>
                </div>
              )}
            </SceneBanner>
          </div>
          <div style={{ fontSize: 10.5, opacity: 0.9, maxWidth: Math.max(game.players.length * 78, 200), margin: "2px 0 4px" }}>
            {active ? `🌹 = ${game.coins_per_flower} coin${game.coins_per_flower === 1 ? "" : "s"} · click = 1, Shift-click = 10 · 10 of each = 1 of the next`
              : winner ? `🏆 ${winner.name} wins${game.reached_top ? " — the pyramid is full!" : "!"}` : "No Flowers this game."}
          </div>
          <div style={{ display: "flex", gap: 4 }}>{game.players.map(column)}</div>
          {podium.length > 1 && <Podium rows={podium} />}
        </>
      )}
    </div>
  );
}

/** The host's one dialog: who plays, the price of a Flower (1-25 coins) and the length. */
export function PyramidStartDialog({ candidates, onStart, onClose }: {
  candidates: { userId: number; name: string }[];
  onStart: (others: number[], price: number, minutes: number) => void; onClose: () => void;
}) {
  const [picked, setPicked] = useState<number[]>([]);
  const [price, setPrice] = useState(5);
  const [minutes, setMinutes] = useState(5);
  return (
    <div role="dialog" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#000", border: `2px solid ${gold}`, borderRadius: 16, padding: 18, maxWidth: 380, width: "100%", color: "#fff", textAlign: "center" }}>
        <h3 style={{ color: gold, margin: "0 0 6px" }}>🔺 Pyramid</h3>
        <p style={{ fontSize: 12, opacity: 0.85, margin: "0 0 12px" }}>10 Flowers = ❤️ · 10 Hearts = 🔥 · 10 Fires = 🐶 · 10 Puppies = 💰<br />Highest pyramid when time runs out wins — 10 Money Bags wins straight away.</p>
        {candidates.length > 0 && (
          <div style={{ textAlign: "left", marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Who plays with you? (up to 3 — pick nobody to play on your own)</div>
            {candidates.map((c) => {
              const on = picked.includes(c.userId);
              return (
                <label key={c.userId} style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", borderRadius: 10, background: on ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.05)", marginBottom: 4, cursor: "pointer" }}>
                  {c.name}
                  <input type="checkbox" checked={on} onChange={() => setPicked((p) => on ? p.filter((x) => x !== c.userId) : p.length < 3 ? [...p, c.userId] : p)} />
                </label>
              );
            })}
          </div>
        )}
        <div style={{ fontSize: 22, fontWeight: 700, color: gold }}>🌹 = {price} coin{price === 1 ? "" : "s"}</div>
        <input type="range" min={1} max={25} value={price} onChange={(e) => setPrice(Number(e.target.value))} style={{ width: "100%" }} />
        <div style={{ fontSize: 13, fontWeight: 600, margin: "12px 0 6px" }}>Game length</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          {[5, 10, 15].map((m) => (
            <button key={m} onClick={() => setMinutes(m)} style={{ padding: "8px 16px", borderRadius: 999, border: `2px solid ${gold}`, background: minutes === m ? gold : "transparent", color: minutes === m ? "#000" : gold, fontWeight: 700, cursor: "pointer" }}>{m} min</button>
          ))}
        </div>
        <button onClick={() => onStart(picked, price, minutes)} style={{ marginTop: 16, width: "100%", padding: "12px 0", borderRadius: 999, border: "none", background: gold, color: "#000", fontWeight: 700, fontSize: 16, cursor: "pointer" }}>Start</button>
      </div>
    </div>
  );
}
