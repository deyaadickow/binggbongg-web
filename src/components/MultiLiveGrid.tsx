// Multi-live 24 (Steve, 2026-11-05) — the live room's grid for rooms over 4, plus the room battle.
//
// The room's own 4-tile grid stays exactly as it is for rooms of 2–4. A room the host made bigger
// swaps it for this: the speakers side by side on the top row (host first), everyone else below in
// the server's order, and on every tile the Chat Battle tile chrome (name on a thin dark strip,
// gold-ringed gift box top-right on every tile but your own — components/BattleGrid's cb-tile
// classes) plus the speaker icon: sound on, muted, or the yellow raised hand.
//
// Mirrors Android's view/livestream/MultiLiveRoom.kt (same words, same taps).
import { useEffect, useMemo, useRef, useState } from "react";
import { initials, mediaUrl } from "../lib/api";
import { useT } from "../lib/i18n";
import type { LiveTile } from "../lib/live";
import { mlName, mmss, type MlMember, type MlState, type RoomBattle } from "../lib/multiLive";
import { Confetti, Podium } from "./GameShow";
import { cbText } from "../lib/countryBattle";

/** A dark tint per member, so photo-less tiles are told apart at a glance (BattleGrid's). */
function tileBackdrop(id: number): string {
  const hue = (id * 47) % 360;
  return `linear-gradient(160deg, hsl(${hue} 35% 22%), hsl(${(hue + 40) % 360} 30% 9%))`;
}

function MlTile({ m, me, tile, onSpeaker, onTap, onGift, pulse, score, bombed }: {
  m: MlMember;
  me: boolean;
  tile: LiveTile | undefined;
  onSpeaker: () => void;
  onTap: () => void;
  onGift: (() => void) | null;
  pulse: boolean;
  score: number | null;
  /** A bomb is on this member right now (Bingg Bongg Battle). */
  bombed: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasVideo = !!tile && !tile.muted;
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !tile || !hasVideo) return;
    return tile.attach(el);
  }, [tile, hasVideo]);
  const name = mlName(m);
  const photo = m.profile_image ? mediaUrl(m.profile_image) : "";
  const realPhoto = photo && !/\/$/.test(photo);
  const icon = m.is_speaker ? "🔊" : m.hand_raised ? "✋" : "🔇";
  const cls = m.is_speaker ? "on" : m.hand_raised ? "hand" : "off";
  return (
    <div className={`cb-tile ml-tile${me ? " own" : ""}${m.is_host ? " host" : ""}${pulse && m.is_speaker ? " ml-pulse" : ""}${tile?.speaking && m.is_speaker ? " listening" : ""}`}
      role="button" tabIndex={0} onClick={onTap} data-uid={m.user_id}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTap(); } }}>
      {realPhoto
        ? <img className="cb-photo" src={photo} alt="" loading="lazy" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
        : <div className="cb-ph" style={{ background: tileBackdrop(m.user_id) }}><i>{initials(name || "?")}</i></div>}
      {hasVideo && <video ref={videoRef} autoPlay playsInline muted style={tile?.isLocal ? { transform: "scaleX(-1)" } : undefined} />}
      {/* Steve, 2026-11-06: "A small bomb will show in a corner of the tile for anyone that
          receives it for 40 seconds." Top-left; the score moves over beside it. */}
      {bombed && <span className="ml-bomb" aria-label="💣">💣</span>}
      {score !== null && <span className={`ml-score${bombed ? " bombed" : ""}`}>🪙 {score.toLocaleString()}</span>}
      {/* Steve, 2026-11-06: "Gift box, speaker and watchers/eye should be next to each other on
          the bottom right of the tile" — speaker then gift, side by side above the name strip. */}
      <div className="ml-acts">
        <button type="button" className={`ml-spk ${cls}`} aria-label={icon}
          onClick={(e) => { e.stopPropagation(); onSpeaker(); }}>
          {icon}{m.hand_raised && !m.is_speaker && m.hand_order ? <small>{m.hand_order}</small> : null}
        </button>
        {onGift && (
          <button type="button" className="cb-gift" aria-label="🎁"
            onClick={(e) => { e.stopPropagation(); onGift(); }}>🎁</button>
        )}
      </div>
      <span className="cb-name">{m.is_host ? "👑 " : ""}{name}</span>
    </div>
  );
}

/**
 * The grid. `members` arrive already in display order (host, the other speakers, then everyone
 * else by join time) — rendered in that order, never re-sorted. The top row is the speakers.
 */
export function MultiLiveGrid({ state, myId, tiles, pulse, battle, bombed, onSpeaker, onTap, onGift, onHands, isHost }: {
  state: MlState;
  myId: number | null;
  tiles: LiveTile[];
  pulse: boolean;
  battle: RoomBattle | null;
  /** Members with a bomb on them right now. */
  bombed: Set<number>;
  onSpeaker: (m: MlMember) => void;
  onTap: (m: MlMember) => void;
  onGift: (userId: number) => void;
  onHands: () => void;
  isHost: boolean;
}) {
  const byUser = useMemo(() => new Map(tiles.filter((x) => x.userId != null).map((x) => [x.userId as number, x])), [tiles]);
  const top = state.members.filter((m) => m.row === "top");
  const rest = state.members.filter((m) => m.row !== "top");
  const scores = useMemo(() => {
    if (!battle || battle.finished) return null;
    return new Map(battle.leaderboard.map((r) => [r.user_id, r.score]));
  }, [battle]);
  // 4 across; the whole grid is (4*3):(rows*4), as wide as the page allows but never so wide
  // that the last row falls under the bottom of a desktop window (a phone uses the full width).
  const rows = 1 + Math.ceil(rest.length / 4);
  const ratio = 12 / (rows * 4);
  const tileFor = (m: MlMember) => (
    <MlTile key={m.user_id} m={m} me={m.user_id === myId} tile={byUser.get(m.user_id)}
      onSpeaker={() => onSpeaker(m)} onTap={() => onTap(m)}
      onGift={m.user_id === myId ? null : () => onGift(m.user_id)}
      pulse={pulse} score={scores ? scores.get(m.user_id) ?? 0 : null} bombed={bombed.has(m.user_id)} />
  );
  return (
    <div className="ml-stage" style={{ width: `min(100%, max(320px, calc((100vh - 230px) * ${ratio.toFixed(4)})))` }}>
      <div className="cb-grid ml-top" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>{top.map(tileFor)}</div>
      {rest.length > 0 && <div className="cb-grid ml-rest" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>{rest.map(tileFor)}</div>}
      {isHost && state.hands.length > 0 && (
        <button type="button" className="ml-hands-pill" onClick={(e) => { e.stopPropagation(); onHands(); }}>✋ {state.hands.length}</button>
      )}
    </div>
  );
}

/** A simple black-and-gold action sheet (the phones' showMenu). */
export function MlMenu({ title, items, onClose }: { title: string; items: { label: string; onPick: () => void; danger?: boolean }[]; onClose: () => void }) {
  const { t } = useT();
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((it, i) => (
            <button key={i} type="button" className="btn block"
              style={it.danger ? { borderColor: "var(--red)", color: "var(--red)" } : undefined}
              onClick={() => { onClose(); it.onPick(); }}>{it.label}</button>
          ))}
          <button type="button" className="btn block ghost" onClick={onClose}>{t("ml_cancel")}</button>
        </div>
      </div>
    </div>
  );
}

/** Host: the room's size, 2 .. the admin ceiling, never below who is on camera now. */
export function MlSizeSheet({ current, min, max, onSave, onClose }: { current: number; min: number; max: number; onSave: (n: number) => void; onClose: () => void }) {
  const { t } = useT();
  const [n, setN] = useState(Math.min(max, Math.max(min, current)));
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{t("ml_members_on_camera")}</h3>
        <MlSizeStepper value={n} min={min} max={max} onChange={setN} />
        <div className="row" style={{ marginTop: 16, gap: 8 }}>
          <button type="button" className="btn ghost" style={{ flex: 1 }} onClick={onClose}>{t("ml_cancel")}</button>
          <button type="button" className="btn" style={{ flex: 1 }} onClick={() => { onClose(); onSave(n); }}>{t("ml_save")}</button>
        </div>
      </div>
    </div>
  );
}

/** − N + with the hint under it. Used on Go Live and in the room. */
export function MlSizeStepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (n: number) => void }) {
  const { t } = useT();
  return (
    <div>
      <div className="ml-stepper">
        <button type="button" className="btn small" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} aria-label="−">−</button>
        <b>{value}</b>
        <button type="button" className="btn small" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} aria-label="+">+</button>
      </div>
      <p className="muted center" style={{ fontSize: 13, margin: "8px 0 0" }}>{t("ml_size_hint", value - 1)}</p>
    </div>
  );
}

/** Seconds left on a running battle, counted down from the server's seconds_left. */
export function useBattleClock(b: RoomBattle | null): number {
  const endsAt = useRef(0);
  const [now, setNow] = useState(Date.now());
  const key = b ? `${b.battle_id}:${b.seconds_left}:${b.finished}` : "";
  useEffect(() => { if (b && !b.finished) endsAt.current = Date.now() + b.seconds_left * 1000; }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!b || b.finished) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [b?.battle_id, b?.finished]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!b || b.finished) return 0;
  return Math.max(0, Math.ceil((endsAt.current - now) / 1000));
}

/**
 * Bingg Bongg Battle (Steve, 2026-11-06): the double/triple window running now and who has a bomb
 * on them, each counted down here from the server's seconds_left (the room is re-read every 5 s).
 */
export function useRoomBattleExtras(b: RoomBattle | null): { boost: { multiplier: number; secondsLeft: number } | null; bombed: Set<number> } {
  const running = !!b && !b.finished;
  const boostEnds = useRef(0);
  const bombEnds = useRef(new Map<number, number>());
  const [now, setNow] = useState(Date.now());
  const boostKey = running && b.boost_now ? `${b.battle_id}:${b.boost_now.multiplier}:${b.boost_now.seconds_left}` : "";
  const bombKey = running ? `${b.battle_id}:` + b.bombs.map((x) => `${x.user_id}/${x.seconds_left}`).join(",") : "";
  useEffect(() => { boostEnds.current = running && b.boost_now ? Date.now() + b.boost_now.seconds_left * 1000 : 0; }, [boostKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const m = new Map<number, number>();
    if (running) for (const x of b.bombs) m.set(x.user_id, Date.now() + x.seconds_left * 1000);
    bombEnds.current = m;
  }, [bombKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running, b?.battle_id]); // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(() => {
    if (!running) return { boost: null, bombed: new Set<number>() };
    const left = Math.ceil((boostEnds.current - now) / 1000);
    const boost = b.boost_now && left > 0 ? { multiplier: b.boost_now.multiplier, secondsLeft: left } : null;
    const bombed = new Set<number>();
    bombEnds.current.forEach((end, id) => { if (end > now) bombed.add(id); });
    return { boost, bombed };
  }, [running, b, now, boostKey, bombKey]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * The strip under the live header during ANY battle (Steve, 2026-11-06): "For this and any battle
 * remove the scrolling text ads and add the 5 minutes timer or the double and triple points there,
 * it will be the perfect spot for everyone to see." It shows "⚔️ Bingg Bongg Battle 4:12", or
 * during a window "🥊 DOUBLE POINTS 0:32" / "🥊 TRIPLE POINTS 0:32". Tap = the leaderboard (room
 * battle). `bombs` is the signed-in member's bomb count — one bomb control with the number in it.
 */
export function BattleTopStrip({ secondsLeft, boost, onOpen, bombs, bombArmed, onBomb }: {
  secondsLeft: number | null;
  boost: { multiplier: number; secondsLeft: number } | null;
  onOpen?: () => void;
  bombs?: number | null;
  bombArmed?: boolean;
  onBomb?: () => void;
}) {
  const { t } = useT();
  const label = boost
    ? t(boost.multiplier >= 3 ? "bbb_triple_points" : "bbb_double_points", mmss(boost.secondsLeft))
    : `⚔️ ${t("bingg_bongg_battle")}${secondsLeft !== null ? ` ${mmss(secondsLeft)}` : ""}`;
  return (
    <div className={`bb-top-strip${boost ? " boost" : ""}`}>
      <button type="button" className="bb-top-strip-label" onClick={onOpen} disabled={!onOpen}>{label}</button>
      {!!bombs && bombs > 0 && onBomb && (
        <button type="button" className={`bb-bomb-btn${bombArmed ? " armed" : ""}`} aria-label={`💣 ${bombs}`}
          onClick={(e) => { e.stopPropagation(); onBomb(); }}>💣<b>{bombs}</b></button>
      )}
    </div>
  );
}

export function RoomBattleBoard({ b, secondsLeft, isHost, onEnd, onClose }: { b: RoomBattle; secondsLeft: number; isHost: boolean; onEnd: () => void; onClose: () => void }) {
  const { t } = useT();
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>⚔️ {t("bingg_bongg_battle")} · {mmss(secondsLeft)}</h3>
        <p className="muted center" style={{ fontSize: 13, margin: "0 0 12px" }}>{t("ml_battle_hint")}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: "50vh", overflowY: "auto" }}>
          {b.leaderboard.map((r) => (
            <div key={r.user_id} className="row" style={{ padding: "8px 10px", border: "1px solid var(--gold-border)", borderRadius: 10, background: "#111" }}>
              <b style={{ color: "var(--gold)", width: 26 }}>{r.rank}</b>
              <div style={{ flex: 1, minWidth: 0, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mlName(r)}</div>
              <div style={{ color: "var(--gold)", fontWeight: 800 }}>🪙 {r.score.toLocaleString()}</div>
            </div>
          ))}
        </div>
        {isHost && !b.finished && (
          <button type="button" className="btn block" style={{ marginTop: 12, borderColor: "var(--red)", color: "var(--red)" }} onClick={() => { onClose(); onEnd(); }}>{t("ml_end_battle")}</button>
        )}
        <button type="button" className="btn block ghost" style={{ marginTop: 8 }} onClick={onClose}>{t("close")}</button>
      </div>
    </div>
  );
}

/** Chat Battle's winner screen: crown or tie, podium, confetti. */
export function RoomBattleEnd({ b, onClose }: { b: RoomBattle; onClose: () => void }) {
  const { t } = useT();
  const [burst] = useState(() => Date.now());
  const top = b.leaderboard.filter((r) => r.score > 0).slice(0, 3);
  const headline = b.tie ? `🤝 ${t("chb_tie")}`
    : b.winner && !b.no_gifts ? `👑 ${cbText(t("chb_wins"), { name: mlName(b.winner) })}`
    : t("chb_no_winner");
  return (
    <div className="chb-end" role="dialog" aria-modal="true">
      <div className="card pad">
        {!b.no_gifts && <Confetti burst={burst} />}
        <div style={{ color: "var(--gold)", fontWeight: 800, fontSize: 13, marginBottom: 2 }}>🏁 {t("chb_ended")}</div>
        <div style={{ fontWeight: 900, fontSize: 22, color: "var(--gold)", marginBottom: 8, overflowWrap: "anywhere" }}>{headline}</div>
        {top.length > 0 && <Podium tie={b.tie} rows={top.map((r) => ({ name: mlName(r), value: r.score.toLocaleString() }))} />}
        <button className="btn" style={{ marginTop: 14 }} onClick={onClose}>{t("chb_back")}</button>
      </div>
    </div>
  );
}
