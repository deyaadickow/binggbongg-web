// The Country Battle screen (Steve, 2026-11-01).
//
// "top left tile will be the person for his account and the rest of the tile will be members
// popping up at random and keep changing"; "the shuffle will be every 15 to 25 seconds, it could
// be 3,5,7,10 or any amount of members at a time ... the only member will stay in that account is
// the account owner/the host. and even the host can show on some one else's screen."
// "add a small gift box to fit each tile for sending gifts."
//
// /country-battle/live/:dayId          watch (viewer)
// /country-battle/live/:dayId?join=1   go live in it (participant: camera + mic)
// /country-battle/live/0?demo=24|12|6  the grid with fake members and no LiveKit, for the
//                                      announcement video. &own=0 hides the own tile (a viewer's
//                                      screen); &img=/path/ uses /path/1.jpg, /path/2.jpg ... as photos.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { displayName, initials, mediaUrl, type Gift } from "../lib/api";
import { useSession } from "../lib/session";
import { useT } from "../lib/i18n";
import { GiftFlash, GiftSheet } from "../components/GiftSheet";
import { Loading, Notice } from "../components/Common";
import { showGoldAlert } from "../components/GoldToast";
import { usePhaseLine, TestBanner } from "./CountryBattlePages";
import { battlerIdOf, useCountryBattleRoom } from "../lib/countryBattleRoom";
import {
  cbText, countryBattleHeartbeat, fetchCountryBattleStatus, flag, gridShape, joinCountryBattle, leaveCountryBattle,
  sendCountryBattleGift, stageText, useTick,
  type CbDay, type CbHeartbeat, type CbPerson, type CbStage,
} from "../lib/countryBattle";

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
      {!tile.own && onGift && (
        <button type="button" className="cb-gift" aria-label="🎁"
          onClick={(e) => { e.stopPropagation(); onGift(); }}>🎁</button>
      )}
      <span className="cb-name">{tile.name}</span>
    </div>
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
export function CbHeader({ stage, sub, line, liveCount, myScore, onBack, isTest, title, scoreText, backLabel, actions }: {
  stage: string; sub: string; line: string; liveCount?: number | null; myScore?: number | null; onBack: () => void; isTest?: boolean;
  title?: string; scoreText?: string | null; backLabel?: string; actions?: React.ReactNode;
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
      </div>
    </>
  );
}

// ---- the page -------------------------------------------------------------------------------

export function CountryBattleLivePage() {
  const { dayId } = useParams();
  const [sp] = useSearchParams();
  const demo = sp.get("demo");
  if (demo) return <CountryBattleDemo n={Number(demo) || 24} withOwn={sp.get("own") !== "0"} imgBase={sp.get("img")} />;
  return <CountryBattleLive key={dayId} dayId={Number(dayId)} wantJoin={sp.get("join") === "1"} />;
}

function CountryBattleLive({ dayId, wantJoin }: { dayId: number; wantJoin: boolean }) {
  const { t } = useT();
  const { user, isLoggedIn } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const myId = user?.id ?? 0;
  const now = useTick();

  const [day, setDay] = useState<CbDay | null>(null);
  const [isTest, setIsTest] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [role, setRole] = useState<"guest" | "viewer">("viewer");
  const [joinedRoom, setJoinedRoom] = useState<string | null>(null);
  const [joining, setJoining] = useState(wantJoin);
  const [hb, setHb] = useState<CbHeartbeat | null>(null);
  const [listen, setListen] = useState<number | null>(null);
  const [giftTarget, setGiftTarget] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ userId: number; gift: Gift } | null>(null);
  const roleRef = useRef(role);
  roleRef.current = role;

  // The day (stage, schedule, room) from the status call; refreshed every minute.
  const loadDay = useCallback(() => {
    fetchCountryBattleStatus(myId)
      .then((s) => {
        const d = s.battle?.days.find((x) => x.id === dayId) ?? null;
        setIsTest(flag(s.battle?.is_test));
        if (d) { setDay(d); setLoadError(null); } else setLoadError(t("cb_none"));
      })
      .catch((e) => setLoadError((e as Error).message));
  }, [myId, dayId, t]);
  useEffect(() => {
    loadDay();
    const timer = setInterval(loadDay, 60000);
    return () => clearInterval(timer);
  }, [loadDay]);

  // Going live: camera check first (a refused camera gets the reason, not a dead tile), then
  // joinCountryBattle; a full battle gets the gold popup. Either failure leaves the member watching.
  const joinStarted = useRef(false);
  useEffect(() => {
    if (!wantJoin || !day || joinStarted.current) return;
    joinStarted.current = true;
    if (!isLoggedIn || !user) {
      setJoining(false);
      navigate("/login", { state: { from: location.pathname + location.search } });
      return;
    }
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        stream.getTracks().forEach((tr) => tr.stop());
      } catch {
        showGoldAlert(t("cb_camera_needed"));
        setJoining(false);
        return;
      }
      try {
        const r = await joinCountryBattle(user.id, day.id);
        if (r.ok) { setJoinedRoom(r.roomName); setRole("guest"); }
        else showGoldAlert(r.full ? t("cb_full") : r.message || t("cb_not_open"));
      } catch (e) {
        showGoldAlert((e as Error).message);
      } finally {
        setJoining(false);
      }
    })();
  }, [wantJoin, day, isLoggedIn, user, navigate, location.pathname, location.search, t]);

  const roomName = role === "guest" ? joinedRoom : day?.room_name ?? null;

  // The heartbeat — every 20 s, participants AND viewers. It drives the live list and the phase.
  useEffect(() => {
    if (!day) return;
    let live = true;
    const beat = () => countryBattleHeartbeat(myId, day.id, roleRef.current === "guest")
      .then((h) => { if (live && h) setHb(h); })
      .catch(() => undefined);
    beat();
    const timer = setInterval(beat, 20000);
    return () => { live = false; clearInterval(timer); };
  }, [day?.id, myId, role]); // eslint-disable-line react-hooks/exhaustive-deps

  // A viewer who opened the page before the lobby has no room yet: fetch it when the phase turns.
  const hbPhase = hb?.phase;
  useEffect(() => { if (hbPhase && !day?.room_name) loadDay(); }, [hbPhase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving: the back arrow, or navigating away. Ends the entry server-side for a participant.
  // Reads refs only, so the unmount cleanup below runs once — at unmount — and never because the
  // day object was refreshed.
  const myIdRef = useRef(myId);
  myIdRef.current = myId;
  const leftRef = useRef(false);
  const leave = useCallback(() => {
    if (leftRef.current) return;
    leftRef.current = true;
    if (roleRef.current === "guest" && myIdRef.current) leaveCountryBattle(myIdRef.current, dayId).catch(() => undefined);
  }, [dayId]);
  useEffect(() => () => leave(), [leave]);

  const stage: CbStage = day?.stage ?? "weekday";
  const { cap } = gridShape(stage);
  const isParticipant = role === "guest";

  // Who is live: the heartbeat's list, plus anyone already publishing in the room the heartbeat
  // has not caught up with yet (it runs every 20 s; the room knows at once).
  const [visibleIds, setVisibleIds] = useState<number[]>([]);
  const [heard, setHeard] = useState<number[]>([]);
  const onDataRef = useRef<(topic: string, payload: unknown, from: number | null) => void>(() => undefined);
  const roomHook = useCountryBattleRoom({
    roomName,
    role,
    enabled: !!roomName && !joining,
    visible: visibleIds,
    listen: heard,
    onData: (topic, payload, from) => onDataRef.current(topic, payload, from),
    onPublishFailed: () => {
      showGoldAlert(t("cb_camera_needed"));
      if (myId && day) leaveCountryBattle(myId, day.id).catch(() => undefined);
      setRole("viewer");
    },
  });
  const people = useMemo(() => {
    const m = new Map<number, CbPerson>();
    for (const p of hb?.live ?? []) if (p.user_id) m.set(p.user_id, p);
    for (const p of roomHook.publishers) if (!m.has(p.userId)) m.set(p.userId, { user_id: p.userId, name: p.name });
    return m;
  }, [hb?.live, roomHook.publishers]);
  const pool = useMemo(() => [...people.keys()].filter((id) => id !== myId).sort((a, b) => a - b), [people, myId]);
  const star = useStarPins(pool, isParticipant, () => showGoldAlert(t("chb_pin_max")));
  const hold = useMemo(() => (giftTarget != null ? [...star.pins, giftTarget] : star.pins), [star.pins, giftTarget]);
  const shown = useRotation(cap - (isParticipant ? 1 : 0), pool, hold);
  const signals = useStarSignals({
    myId, isBattler: isParticipant, pins: star.pins, home: null, pool, connected: roomHook.status === "live", sendData: roomHook.sendData,
  });
  onDataRef.current = signals.onData;
  const heardNow = heardIds({ isBattler: isParticipant, pins: star.pins, home: null, homeStars: [], listen });
  const heardKey = heardNow.join(",");
  useEffect(() => { setHeard((cur) => (cur.join(",") === heardKey ? cur : heardNow)); }, [heardKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const awaitingBack = signals.starredMe.filter((id) => !star.pins.includes(id));
  useEffect(() => { setVisibleIds((cur) => (sameList(cur, shown) ? cur : shown)); }, [shown]);
  // The tile being listened to rotated away or left: back to silence.
  useEffect(() => { if (listen != null && !shown.includes(listen)) setListen(null); }, [shown, listen]);

  const tiles: CbTileData[] = [
    ...(isParticipant && user ? [{ userId: user.id, name: displayName(user), photo: user.profile_image, own: true }] : []),
    ...shown.map((id) => {
      const p = people.get(id);
      return { userId: id, name: p?.name || p?.username || "", photo: p?.profile_image ?? null, starred: star.pins.includes(id), starredMe: awaitingBack.includes(id) };
    }),
  ];

  const pl = usePhaseLine(day, now, hb?.phase ?? null, hb?.round_ends_at ?? null);
  const back = () => {
    leave();
    roomHook.disconnect();
    navigate("/country-battle");
  };

  if (!day) {
    return (
      <div className="page cb-page">
        <CbHeader stage="" sub="" line="" onBack={back} />
        {loadError ? <Notice error>{loadError}</Notice> : <Loading />}
      </div>
    );
  }

  const giftRoom = roomName ?? day.room_name ?? "";
  return (
    <div className="page cb-page" style={{ paddingTop: 10 }}>
      <CbHeader isTest={isTest} stage={stageText(t, day)} sub={pl.sub} line={pl.line}
        liveCount={hb?.live_count ?? (people.size || null)}
        myScore={isParticipant ? hb?.my_today_score ?? 0 : null}
        onBack={back} />
      {roomHook.error && <Notice error>{roomHook.error}</Notice>}
      {joining && <Loading />}
      <StarredYouBar ids={awaitingBack} nameOf={(id) => people.get(id)?.name || people.get(id)?.username || ""} onStarBack={(id) => star.toggle(id)} />
      {tiles.length === 0
        ? <div className="card cb-empty">{pl.phase === "ended" ? t("cb_ended_today") : t("cb_waiting")}</div>
        : (
          <CountryBattleGrid stage={stage} tiles={tiles} listen={heardNow}
            onTap={(id) => {
              // A battler's tap stars the tile — and they hear who they starred; a viewer's tap listens.
              if (isParticipant) star.toggle(id);
              else setListen((cur) => (cur === id ? null : id));
            }}
            onGift={(id) => {
              if (!isLoggedIn) { navigate("/login", { state: { from: location.pathname + location.search } }); return; }
              setGiftTarget(id);
            }}
            attach={roomHook.attachVideo} hasVideo={roomHook.hasVideo} version={roomHook.version}
            flash={flash} onFlashDone={() => setFlash(null)} />
        )}
      {tiles.some((x) => !x.own) && <p className="cb-hint">{isParticipant ? `★ ${t("chb_tap_pin")}` : `🔊 ${t("cb_tap_listen")}`}</p>}
      {giftTarget != null && (
        <GiftSheet
          onClose={() => setGiftTarget(null)}
          onSent={(gift) => setFlash({ userId: giftTarget, gift })}
          sendOverride={(coins, gift) => sendCountryBattleGift({
            myId, toUserId: giftTarget, coins, giftId: gift.id, roomName: giftRoom, dayId: day.id,
          })} />
      )}
    </div>
  );
}

// ---- the demo -------------------------------------------------------------------------------

const DEMO_NAMES = [
  "maria santos", "juan dela cruz", "angel reyes", "mark bautista", "joy villanueva", "paolo garcia",
  "kristine mendoza", "jericho ramos", "liza fernandez", "carlo aquino", "bea castillo", "miguel torres",
  "nicole gonzales", "rafael navarro", "jasmine cruz", "enzo salazar", "trisha domingo", "kevin morales",
  "andrea lim", "gabriel tan", "camille flores", "joshua rivera", "sofia del rosario", "daniel lopez",
  "ella marquez", "renz pascual", "hannah ocampo", "lance santiago", "mika valdez", "ivan soriano",
  "riza manalo", "nathan co", "pia robles", "jomar cabrera", "lovely ignacio", "aldrin perez",
  "yna gutierrez", "jay-r alcantara", "cherry de leon", "marvin padilla",
];

function CountryBattleDemo({ n, withOwn, imgBase }: { n: number; withOwn: boolean; imgBase: string | null }) {
  const { t } = useT();
  const navigate = useNavigate();
  const stage: CbStage = n <= 6 ? "sunday" : n <= 12 ? "saturday" : "weekday";
  const { cap } = gridShape(stage);
  const rounds = stage === "sunday" ? 5 : 3;
  const photo = (i: number) => (imgBase ? `${imgBase.replace(/\/?$/, "/")}${i}.jpg` : null);
  // More members than tiles, so the shuffle has someone to bring in (Mon–Fri can be fifty).
  const people = useMemo(() => {
    const total = stage === "weekday" ? DEMO_NAMES.length : stage === "saturday" ? 12 : 6;
    return DEMO_NAMES.slice(0, total).map((name, i) => ({ userId: 1001 + i, name, photo: photo(i + 1) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, imgBase]);
  const own = withOwn ? people[0] : null;
  const pool = useMemo(() => people.filter((p) => p.userId !== own?.userId).map((p) => p.userId), [people, own]);
  const [hold, setHold] = useState<number | null>(null);
  const star = useStarPins(pool, !!own, () => showGoldAlert(t("chb_pin_max")));
  const holdIds = useMemo(() => (hold != null ? [...star.pins, hold] : star.pins), [star.pins, hold]);
  const shown = useRotation(Math.min(n, cap) - (own ? 1 : 0), pool, holdIds);
  const [listen, setListen] = useState<number | null>(null);
  const byId = useMemo(() => new Map(people.map((p) => [p.userId, p])), [people]);
  // The demo shows one member who starred you, so the "talk back" banner is on camera.
  const demoStarredMe = own && shown.length > 2 ? [shown[2]].filter((id) => !star.pins.includes(id)) : [];
  const tiles: CbTileData[] = [
    ...(own ? [{ ...own, own: true }] : []),
    ...shown.map((id) => byId.get(id)!).filter(Boolean).map((p) => ({ ...p, starred: star.pins.includes(p.userId), starredMe: demoStarredMe.includes(p.userId) })),
  ];
  const demoHeard = heardIds({ isBattler: !!own, pins: star.pins, home: null, homeStars: [], listen });
  // A round that never ends: 3:47 counting down, round 2.
  const now = useTick();
  const left = 227 - (Math.floor(now / 1000) % 227);
  const timeText = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const fakeDay = { stage, day_index: 3 } as Pick<CbDay, "stage" | "day_index">;
  return (
    <div className="page cb-page" style={{ paddingTop: 10 }}>
      <CbHeader stage={stageText(t, fakeDay)}
        sub={cbText(t("cb_round"), { n: 2, total: rounds })}
        line={cbText(t("cb_time_left"), { time: timeText })}
        liveCount={stage === "weekday" ? 47 : n}
        myScore={own ? 1250 : null}
        onBack={() => navigate("/country-battle")} />
      <StarredYouBar ids={demoStarredMe} nameOf={(id) => byId.get(id)?.name ?? ""} onStarBack={(id) => star.toggle(id)} />
      <CountryBattleGrid stage={stage} tiles={tiles} listen={demoHeard}
        onTap={(id) => {
          if (own) star.toggle(id);
          else setListen((cur) => (cur === id ? null : id));
        }}
        onGift={(id) => { setHold(id); setTimeout(() => setHold(null), 4000); }} />
      <p className="cb-hint">{own ? `★ ${t("chb_tap_pin")}` : `🔊 ${t("cb_tap_listen")}`}</p>
    </div>
  );
}
