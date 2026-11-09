// The shared battle grid (Country Battle 2026-11-01, reused by Chat Battle 2026-11-03 and Country
// Battle v2): the 6/12/24-tile layouts, a tile (photo or video, name strip, gift box, star, ear),
// the 15–25 s rotation, star pins, the "cb_star"/"cb_stars" sound-follows-the-star signals, and
// the battle header.
//
// "top left tile will be the person for his account and the rest of the tile will be members
// popping up at random and keep changing"; "the shuffle will be every 15 to 25 seconds, it could
// be 3,5,7,10 or any amount of members at a time ... the only member will stay in that account is
// the account owner/the host. and even the host can show on some one else's screen."
// "add a small gift box to fit each tile for sending gifts."
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { initials, mediaUrl, type Gift } from "../lib/api";
import { useT } from "../lib/i18n";
import { GiftFlash } from "./GiftSheet";
import { SundayBonusPill } from "./SundayBonus";
import { battlerIdOf } from "../lib/countryBattleRoom";
import { cbText, gridShape, type CbStage } from "../lib/countryBattle";

export function TestBanner() {
  const { t } = useT();
  return <div className="cb-test">🧪 {t("cb_test")}</div>;
}

// ---- the grid -------------------------------------------------------------------------------

export interface CbTileData {
  userId: number;
  name: string;
  photo?: string | null;
  own?: boolean;
  /** Chat Battle: the battler a viewer followed in — pinned top-left with a gold border, but
   *  (unlike your own tile) it keeps its gift box. */
  home?: boolean;
  /** Chat Battle: the leaderboard's 30-second spotlight — a flashing gold border. */
  spot?: boolean;
  /** Pinned with a star by the battler on this screen: it never rotates out (useStarPins). */
  starred?: boolean;
  /** This member starred ME (the "cb_star" signal) and I have not starred them back. */
  starredMe?: boolean;
  /** Not heard on this screen: a tiny muted icon in the corner opposite the star. */
  muted?: boolean;
  /** Chat Battle round 2: a gift just landed on this tile — its icon pops up over the tile.
   *  `key` restarts the animation when a second gift lands before the first one has faded. */
  gift?: { icon: string | null; key: number } | null;
}

/** Height the grid may use: from its own top edge (below the site's header and the battle
 *  header, whatever they measure on this screen) down to the bottom of the window, less the
 *  phones' fixed "get the app" bar and the hint line. Measured, not guessed — the site header is
 *  one row on a desktop and two on a phone. */
function useAvailableHeight(ref: React.RefObject<HTMLDivElement | null>, reserve = 34, phoneFullWidth = false): number | null {
  const [h, setH] = useState<number | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      // On a phone the grid may take the full width instead (the page scrolls a little) so that
      // 24 tiles stay readable 4 across — the site header alone is a third of a 360-px screen.
      if (phoneFullWidth && window.innerWidth < 600) { setH(null); return; }
      const top = el.getBoundingClientRect().top + window.scrollY;
      const bar = document.querySelector(".get-app-bar");
      const barH = bar && getComputedStyle(bar).display !== "none" ? bar.getBoundingClientRect().height : 0;
      setH(Math.max(200, window.innerHeight - top - barH - reserve));
    };
    measure();
    window.addEventListener("resize", measure);
    const t = setTimeout(measure, 300); // the get-app bar mounts a moment later
    return () => { window.removeEventListener("resize", measure); clearTimeout(t); };
  }, [ref, reserve, phoneFullWidth]);
  return h;
}

function CbTile({ tile, listening, onTap, onGift, attach, hasVideo, version }: {
  tile: CbTileData;
  listening: boolean;
  onTap?: () => void;
  onGift?: () => void;
  attach?: (el: HTMLVideoElement) => () => void;
  hasVideo: boolean;
  version: number;
}) {
  const { t } = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !attach || !hasVideo) return;
    return attach(el);
  }, [attach, hasVideo, version]);
  const photo = tile.photo ? mediaUrl(tile.photo) : "";
  const realPhoto = photo && !/\/$/.test(photo);
  return (
    <div className={`cb-tile${tile.own ? " own" : ""}${tile.home ? " home" : ""}${tile.spot ? " spot" : ""}${tile.starred ? " starred" : ""}${tile.starredMe ? " starred-me" : ""}${listening ? " listening" : ""}`}
      role={tile.own ? undefined : "button"} tabIndex={tile.own ? undefined : 0}
      onClick={tile.own ? undefined : onTap}
      onKeyDown={(e) => { if (!tile.own && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onTap?.(); } }}>
      {/* The member's photo while their video connects (and for good, if it never does). */}
      {realPhoto
        ? <img className="cb-photo" src={photo} alt="" loading="lazy" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
        : <div className="cb-ph" style={{ background: tileBackdrop(tile.userId) }}><i>{initials(tile.name || "?")}</i></div>}
      {hasVideo && <video ref={videoRef} autoPlay playsInline muted />}
      {tile.starred && <span className="cb-star" aria-hidden>★</span>}
      {listening && <span className="cb-ear" aria-hidden>🔊</span>}
      {tile.muted && !tile.own && <span className="cb-muted" aria-hidden>🔇</span>}
      {tile.starredMe && <span className="cb-starme">{t("chb_starred_you_tile")}</span>}
      {tile.gift && <TileGift key={tile.gift.key} icon={tile.gift.icon} />}
      {!tile.own && onGift && (
        <button type="button" className="cb-gift" aria-label="🎁"
          onClick={(e) => { e.stopPropagation(); onGift(); }}>🎁</button>
      )}
      <span className="cb-name">{tile.name}</span>
    </div>
  );
}

/** A gift's icon popping up over the tile it landed on (🎁 when it has no icon, or it fails). */
function TileGift({ icon }: { icon: string | null }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="cb-tile-gift" aria-hidden>
      {icon && !broken ? <img src={mediaUrl(icon)} alt="" onError={() => setBroken(true)} /> : "🎁"}
    </span>
  );
}

/** A dark tint per member, so photo-less tiles are told apart at a glance. */
function tileBackdrop(id: number): string {
  const hue = (id * 47) % 360;
  return `linear-gradient(160deg, hsl(${hue} 35% 22%), hsl(${(hue + 40) % 360} 30% 9%))`;
}

export function CountryBattleGrid({ stage, tiles, listen, onTap, onGift, attach, hasVideo, version = 0, flash, onFlashDone, reserve, phoneFullWidth }: {
  stage: CbStage;
  tiles: CbTileData[];
  /** Who is heard on this screen (one tapped tile, or the starred members). */
  listen: number | null | number[];
  onTap?: (userId: number) => void;
  onGift?: (userId: number) => void;
  attach?: (userId: number, el: HTMLVideoElement) => () => void;
  hasVideo?: (userId: number) => boolean;
  version?: number;
  flash?: { userId: number; gift: Gift } | null;
  onFlashDone?: () => void;
  /** Pixels to keep free under the grid (the hint line; Chat Battle's chat strip). */
  reserve?: number;
  /** On a phone-width screen, use the full width rather than shrinking to fit the height. */
  phoneFullWidth?: boolean;
}) {
  const { cols } = gridShape(stage);
  const rows = Math.max(1, Math.ceil(tiles.length / cols));
  // Each tile is 3:4, so the whole grid is (cols*3):(rows*4). It is as wide as the page allows,
  // but never so wide that its last row falls below the bottom of the screen.
  const ratio = (cols * 3) / (rows * 4);
  const stageRef = useRef<HTMLDivElement>(null);
  const avail = useAvailableHeight(stageRef, reserve, phoneFullWidth);
  const heard = new Set(Array.isArray(listen) ? listen : listen != null ? [listen] : []);
  return (
    <div ref={stageRef} className="cb-stage" style={{ width: avail ? `min(100%, ${Math.round(avail * ratio)}px)` : "100%", minWidth: Math.min(240, cols * 70) }}>
      <div className={`cb-grid cols-${cols}`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {tiles.map((tile) => (
          <CbTile key={`${tile.own ? "own" : tile.home ? "home" : "m"}-${tile.userId}`} tile={tile.muted == null && !tile.own ? { ...tile, muted: !heard.has(tile.userId) } : tile} listening={heard.has(tile.userId)}
            onTap={onTap ? () => onTap(tile.userId) : undefined}
            onGift={onGift ? () => onGift(tile.userId) : undefined}
            attach={attach ? (el) => attach(tile.userId, el) : undefined}
            hasVideo={hasVideo ? hasVideo(tile.userId) : false}
            version={version} />
        ))}
      </div>
      {/* The gift just sent, over the whole grid — a tile is too small to hold the card. */}
      {flash && onFlashDone && <GiftFlash gift={flash.gift} onDone={onFlashDone} />}
    </div>
  );
}

/**
 * Which members are on screen, and the shuffle.
 *
 * Every random 15–25 s, a random 3–10 of the shown tiles (never more than there are, never the
 * own tile — that is not in `pool`) are swapped for members not on screen. A member who leaves
 * is replaced in place, so the rest of the grid does not jump. A tile whose gift picker is open
 * (`hold`) is never swapped. If everyone fits, nothing rotates.
 *
 * `hold` may be several ids (Chat Battle holds the gift target AND the spotlit battler). `pin`
 * (Chat Battle's leaderboard spotlight) puts that member in the FIRST rotating slot now — the
 * member it displaces takes the pinned one's old slot, or leaves the screen — and is held there.
 */
export function useRotation(slots: number, pool: number[], hold: number | null | number[], pin: number | null = null): number[] {
  const [shown, setShown] = useState<number[]>([]);
  const poolRef = useRef(pool);
  const holdSet = new Set<number>(Array.isArray(hold) ? hold : hold != null ? [hold] : []);
  if (pin != null) holdSet.add(pin);
  const holdRef = useRef(holdSet);
  poolRef.current = pool;
  holdRef.current = holdSet;
  const poolKey = pool.join(",");

  useEffect(() => {
    if (pin == null || slots <= 0) return;
    setShown((cur) => {
      if (!poolRef.current.includes(pin)) return cur;
      // "The first rotating slot": the first one not held by a star (or the gift picker).
      const first = cur.findIndex((id) => id === pin || !holdRef.current.has(id));
      const at = cur.indexOf(pin);
      if (first === -1) {
        if (cur.length < slots) return [...cur, pin];
        return cur;
      }
      if (at === first) return cur;
      const next = [...cur];
      if (at >= 0) { next[at] = next[first]; next[first] = pin; }
      else next[first] = pin;
      return next;
    });
  }, [pin, slots, poolKey]);

  useEffect(() => {
    setShown((cur) => {
      const inPool = new Set(poolRef.current);
      const next: (number | null)[] = cur.slice(0, slots).map((id) => (inPool.has(id) ? id : null));
      const used = new Set(next.filter((x): x is number => x != null));
      const spare = shuffle(poolRef.current.filter((id) => !used.has(id)));
      for (let i = 0; i < next.length; i++) if (next[i] == null && spare.length) next[i] = spare.shift()!;
      const out = next.filter((x): x is number => x != null);
      while (out.length < slots && spare.length) out.push(spare.shift()!);
      return sameList(out, cur) ? cur : out;
    });
  }, [poolKey, slots]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setShown((cur) => {
          const onScreen = new Set(cur);
          const spare = shuffle(poolRef.current.filter((id) => !onScreen.has(id)));
          if (spare.length === 0) return cur;
          const swappable = shuffle(cur.map((id, i) => ({ id, i })).filter((x) => !holdRef.current.has(x.id)));
          const k = Math.min(3 + Math.floor(Math.random() * 8), spare.length, swappable.length);
          if (k <= 0) return cur;
          const next = [...cur];
          for (let j = 0; j < k; j++) next[swappable[j].i] = spare[j];
          return next;
        });
        schedule();
      }, 15000 + Math.random() * 10000);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  return shown;
}

function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}
const sameList = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Star pins (Steve, 2026-11-03): "when a host clicks on up to 3 members to chat with add a small
 * star to those members tile, they will be the only once that will not leave that chat until he
 * clicks them again and removes the star. and please do the same in the country battle as well."
 *
 * Only for a battler on their own screen (a viewer never pins). Up to 3; a 4th tap says so.
 * Kept on this device only — no server call — and a pin goes the moment its member is no longer
 * live in the battle. Pass the result to useRotation's `hold` so a starred tile never rotates out.
 */
export const MAX_STAR_PINS = 3;
export function useStarPins(pool: number[], enabled: boolean, onFull: () => void) {
  const [pins, setPins] = useState<number[]>([]);
  const poolKey = pool.join(",");
  // The member left (or the screen stopped being a battler's): their star goes.
  useEffect(() => {
    const inPool = new Set(pool);
    setPins((cur) => {
      const next = enabled ? cur.filter((id) => inPool.has(id)) : [];
      return sameList(next, cur) ? cur : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolKey, enabled]);
  const pinsRef = useRef(pins);
  pinsRef.current = pins;
  const onFullRef = useRef(onFull);
  onFullRef.current = onFull;
  /** Star or unstar a member. Returns true when they are starred afterwards. */
  const toggle = useCallback((id: number): boolean => {
    const cur = pinsRef.current;
    if (cur.includes(id)) { setPins(cur.filter((x) => x !== id)); return false; }
    if (cur.length >= MAX_STAR_PINS) { onFullRef.current(); return false; }
    setPins([...cur, id]);
    return true;
  }, []);
  return { pins, toggle };
}

/**
 * Sound follows the star (Steve, 2026-11-03: "They can also chat with each other, means their
 * speaker will be on"). A battler hears only the members they starred (plus a leaderboard
 * spotlight); everyone else is muted. Starring someone tells THEIR device with a LiveKit data
 * message — topic "cb_star", {from: identity, on}, sent to that one battler — so it can say
 * "@you starred you — tap ★ to talk back"; starring back makes it two-way. No server involved.
 *
 * A viewer following a host hears the host plus the host's starred members. The phones' contract
 * only names "cb_star", which goes to the starred battler alone, so the host's star list also goes
 * to the whole room on topic "cb_stars" ({from, stars: [ids]}, re-sent every 10 s for late
 * arrivals). A client that does not send it simply leaves its viewers hearing the host.
 *
 * `onData` is stable; hand it to useCountryBattleRoom's onData (through a ref, since the room hook
 * is created first and provides `sendData`).
 */
export function useStarSignals(opts: {
  myId: number; isBattler: boolean; pins: number[]; home: number | null; pool: number[]; connected: boolean;
  sendData: (topic: string, payload: unknown, toUserId?: number | null) => boolean;
}) {
  const { myId, isBattler, pins, home, pool, connected, sendData } = opts;
  const [starredMe, setStarredMe] = useState<number[]>([]);
  const [homeStars, setHomeStars] = useState<number[]>([]);
  const homeRef = useRef(home);
  homeRef.current = home;
  const onData = useCallback((topic: string, payload: unknown, from: number | null) => {
    const p = (payload ?? {}) as { from?: unknown; on?: unknown; stars?: unknown };
    const who = from ?? battlerIdOf(typeof p.from === "string" ? p.from : null);
    if (!who) return;
    if (topic === "cb_star") {
      const on = p.on === true || p.on === 1 || p.on === "true";
      setStarredMe((cur) => (on ? (cur.includes(who) ? cur : [...cur, who]) : cur.includes(who) ? cur.filter((x) => x !== who) : cur));
    } else if (topic === "cb_stars" && who === homeRef.current) {
      const ids = Array.isArray(p.stars) ? p.stars.map(Number).filter((x) => x > 0) : [];
      setHomeStars((cur) => (sameList(cur, ids) ? cur : ids));
    }
  }, []);
  useEffect(() => { setHomeStars([]); }, [home]);

  // Tell each newly starred (or unstarred) member, and the room, whenever my stars change.
  const sent = useRef<Set<number>>(new Set());
  const pinKey = pins.join(",");
  const sendRef = useRef(sendData);
  sendRef.current = sendData;
  useEffect(() => {
    if (!connected || !isBattler || !myId) { sent.current = new Set(); return; }
    const from = `user_${myId}`;
    const want = new Set(pins);
    for (const id of want) if (!sent.current.has(id)) sendRef.current("cb_star", { from, on: true }, id);
    for (const id of sent.current) if (!want.has(id)) sendRef.current("cb_star", { from, on: false }, id);
    sent.current = want;
    sendRef.current("cb_stars", { from, stars: pins });
    if (!pins.length) return;
    const timer = setInterval(() => sendRef.current("cb_stars", { from, stars: pins }), 10000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinKey, connected, isBattler, myId]);

  // Someone who starred me and then left the battle: their banner goes.
  const poolKey = pool.join(",");
  useEffect(() => {
    const inPool = new Set(pool);
    setStarredMe((cur) => { const n = cur.filter((id) => inPool.has(id)); return n.length === cur.length ? cur : n; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolKey]);
  return { starredMe, homeStars, onData };
}

/** Who this screen hears. A battler: their starred members (+ the spotlight). A viewer: the host
 *  they followed in and that host's starred members, plus whatever tile they tapped. */
export function heardIds(input: { isBattler: boolean; pins: number[]; home: number | null; homeStars: number[]; spot?: number | null; listen?: number | null }): number[] {
  const s = new Set<number>(input.isBattler ? input.pins : [...(input.home ? [input.home, ...input.homeStars] : []), ...(input.listen != null ? [input.listen] : [])]);
  if (input.spot != null) s.add(input.spot);
  return [...s].sort((a, b) => a - b);
}

/** "@maria starred you — tap ★ to talk back", over the grid, one line per member who starred me
 *  and is not starred back. The ★ stars them back (which also keeps them on screen). */
export function StarredYouBar({ ids, nameOf, onStarBack }: { ids: number[]; nameOf: (id: number) => string; onStarBack: (id: number) => void }) {
  const { t } = useT();
  if (!ids.length) return null;
  return (
    <div className="cb-starbar">
      {ids.map((id) => (
        <div key={id} className="cb-starbar-row">
          <span>{cbText(t("chb_starred_you"), { name: nameOf(id) || "?" })}</span>
          <button type="button" className="cb-bullseye" aria-label="★" onClick={() => onStarBack(id)}>★</button>
        </div>
      ))}
    </div>
  );
}

// ---- the header -----------------------------------------------------------------------------

/** The battle header. Country Battle's by default; Chat Battle passes its own title, score line,
 *  back label and a row of actions (Join / Leaderboard). */
export function CbHeader({ stage, sub, line, liveCount, myScore, onBack, isTest, title, scoreText, backLabel, actions, bonus = true, bonusBump }: {
  stage: string; sub: string; line: string; liveCount?: number | null; myScore?: number | null; onBack: () => void; isTest?: boolean;
  title?: string; scoreText?: string | null; backLabel?: string; actions?: React.ReactNode;
  /** The Sunday Battle Bonus pill (only shows on a bonus Sunday); off for the loading/ended shells. */
  bonus?: boolean; bonusBump?: unknown;
}) {
  const { t } = useT();
  const score = scoreText ?? (myScore != null ? cbText(t("cb_my_today"), { n: myScore.toLocaleString() }) : null);
  return (
    <>
      {isTest && <TestBanner />}
      <div className="cb-head">
        <div className="cb-head-row">
          <button className="back-circle" onClick={onBack} aria-label={backLabel ?? t("cb_leave")} title={backLabel ?? t("cb_leave")}>‹</button>
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <span className="cb-head-title">{title ?? t("cb_title")}</span>
            <span className="cb-head-stage">{stage}</span>
          </div>
          <div className="cb-head-clock">
            {sub && <span>{sub}</span>}
            <b>{line}</b>
          </div>
        </div>
        {(liveCount != null || score != null || actions) && (
          <div className="cb-head-sub">
            {liveCount != null && <span className="pill live">● {cbText(t("cb_live_count"), { n: liveCount })}</span>}
            {score != null && <span className="cb-score">{score}</span>}
            {actions && <span className="cb-head-actions">{actions}</span>}
          </div>
        )}
        {bonus && <SundayBonusPill bump={bonusBump} />}
      </div>
    </>
  );
}
