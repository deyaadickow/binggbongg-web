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
import { useCountryBattleRoom } from "../lib/countryBattleRoom";
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
}

/** Height the grid may use: from its own top edge (below the site's header and the battle
 *  header, whatever they measure on this screen) down to the bottom of the window, less the
 *  phones' fixed "get the app" bar and the hint line. Measured, not guessed — the site header is
 *  one row on a desktop and two on a phone. */
function useAvailableHeight(ref: React.RefObject<HTMLDivElement | null>): number | null {
  const [h, setH] = useState<number | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const bar = document.querySelector(".get-app-bar");
      const barH = bar && getComputedStyle(bar).display !== "none" ? bar.getBoundingClientRect().height : 0;
      setH(Math.max(200, window.innerHeight - top - barH - 34));
    };
    measure();
    window.addEventListener("resize", measure);
    const t = setTimeout(measure, 300); // the get-app bar mounts a moment later
    return () => { window.removeEventListener("resize", measure); clearTimeout(t); };
  }, [ref]);
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
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !attach || !hasVideo) return;
    return attach(el);
  }, [attach, hasVideo, version]);
  const photo = tile.photo ? mediaUrl(tile.photo) : "";
  const realPhoto = photo && !/\/$/.test(photo);
  return (
    <div className={`cb-tile${tile.own ? " own" : ""}${listening ? " listening" : ""}`}
      role={tile.own ? undefined : "button"} tabIndex={tile.own ? undefined : 0}
      onClick={tile.own ? undefined : onTap}
      onKeyDown={(e) => { if (!tile.own && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onTap?.(); } }}>
      {/* The member's photo while their video connects (and for good, if it never does). */}
      {realPhoto
        ? <img className="cb-photo" src={photo} alt="" loading="lazy" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
        : <div className="cb-ph" style={{ background: tileBackdrop(tile.userId) }}><i>{initials(tile.name || "?")}</i></div>}
      {hasVideo && <video ref={videoRef} autoPlay playsInline muted />}
      {listening && <span className="cb-ear" aria-hidden>🔊</span>}
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

export function CountryBattleGrid({ stage, tiles, listen, onTap, onGift, attach, hasVideo, version = 0, flash, onFlashDone }: {
  stage: CbStage;
  tiles: CbTileData[];
  listen: number | null;
  onTap?: (userId: number) => void;
  onGift?: (userId: number) => void;
  attach?: (userId: number, el: HTMLVideoElement) => () => void;
  hasVideo?: (userId: number) => boolean;
  version?: number;
  flash?: { userId: number; gift: Gift } | null;
  onFlashDone?: () => void;
}) {
  const { cols } = gridShape(stage);
  const rows = Math.max(1, Math.ceil(tiles.length / cols));
  // Each tile is 3:4, so the whole grid is (cols*3):(rows*4). It is as wide as the page allows,
  // but never so wide that its last row falls below the bottom of the screen.
  const ratio = (cols * 3) / (rows * 4);
  const stageRef = useRef<HTMLDivElement>(null);
  const avail = useAvailableHeight(stageRef);
  return (
    <div ref={stageRef} className="cb-stage" style={{ width: avail ? `min(100%, ${Math.round(avail * ratio)}px)` : "100%", minWidth: Math.min(240, cols * 70) }}>
      <div className={`cb-grid cols-${cols}`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {tiles.map((tile) => (
          <CbTile key={`${tile.own ? "own" : "m"}-${tile.userId}`} tile={tile} listening={listen === tile.userId}
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
 */
export function useRotation(slots: number, pool: number[], hold: number | null): number[] {
  const [shown, setShown] = useState<number[]>([]);
  const poolRef = useRef(pool);
  const holdRef = useRef(hold);
  poolRef.current = pool;
  holdRef.current = hold;
  const poolKey = pool.join(",");

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
          const swappable = shuffle(cur.map((id, i) => ({ id, i })).filter((x) => x.id !== holdRef.current));
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

// ---- the header -----------------------------------------------------------------------------

function CbHeader({ stage, sub, line, liveCount, myScore, onBack, isTest }: {
  stage: string; sub: string; line: string; liveCount?: number | null; myScore?: number | null; onBack: () => void; isTest?: boolean;
}) {
  const { t } = useT();
  return (
    <>
      {isTest && <TestBanner />}
      <div className="cb-head">
        <div className="cb-head-row">
          <button className="back-circle" onClick={onBack} aria-label={t("cb_leave")} title={t("cb_leave")}>‹</button>
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <span className="cb-head-title">{t("cb_title")}</span>
            <span className="cb-head-stage">{stage}</span>
          </div>
          <div className="cb-head-clock">
            {sub && <span>{sub}</span>}
            <b>{line}</b>
          </div>
        </div>
        {(liveCount != null || myScore != null) && (
          <div className="cb-head-sub">
            {liveCount != null && <span className="pill live">● {cbText(t("cb_live_count"), { n: liveCount })}</span>}
            {myScore != null && <span className="cb-score">{cbText(t("cb_my_today"), { n: myScore.toLocaleString() })}</span>}
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
  const roomHook = useCountryBattleRoom({
    roomName,
    role,
    enabled: !!roomName && !joining,
    visible: visibleIds,
    listen,
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
  const shown = useRotation(cap - (isParticipant ? 1 : 0), pool, giftTarget);
  useEffect(() => { setVisibleIds((cur) => (sameList(cur, shown) ? cur : shown)); }, [shown]);
  // The tile being listened to rotated away or left: back to silence.
  useEffect(() => { if (listen != null && !shown.includes(listen)) setListen(null); }, [shown, listen]);

  const tiles: CbTileData[] = [
    ...(isParticipant && user ? [{ userId: user.id, name: displayName(user), photo: user.profile_image, own: true }] : []),
    ...shown.map((id) => {
      const p = people.get(id);
      return { userId: id, name: p?.name || p?.username || "", photo: p?.profile_image ?? null };
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
      {tiles.length === 0
        ? <div className="card cb-empty">{pl.phase === "ended" ? t("cb_ended_today") : t("cb_waiting")}</div>
        : (
          <CountryBattleGrid stage={stage} tiles={tiles} listen={listen}
            onTap={(id) => setListen((cur) => (cur === id ? null : id))}
            onGift={(id) => {
              if (!isLoggedIn) { navigate("/login", { state: { from: location.pathname + location.search } }); return; }
              setGiftTarget(id);
            }}
            attach={roomHook.attachVideo} hasVideo={roomHook.hasVideo} version={roomHook.version}
            flash={flash} onFlashDone={() => setFlash(null)} />
        )}
      {tiles.some((x) => !x.own) && <p className="cb-hint">🔊 {t("cb_tap_listen")}</p>}
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
  const shown = useRotation(Math.min(n, cap) - (own ? 1 : 0), pool, hold);
  const [listen, setListen] = useState<number | null>(null);
  const byId = useMemo(() => new Map(people.map((p) => [p.userId, p])), [people]);
  const tiles: CbTileData[] = [
    ...(own ? [{ ...own, own: true }] : []),
    ...shown.map((id) => byId.get(id)!).filter(Boolean),
  ];
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
      <CountryBattleGrid stage={stage} tiles={tiles} listen={listen}
        onTap={(id) => setListen((cur) => (cur === id ? null : id))}
        onGift={(id) => { setHold(id); setTimeout(() => setHold(null), 4000); }} />
      <p className="cb-hint">🔊 {t("cb_tap_listen")}</p>
    </div>
  );
}
