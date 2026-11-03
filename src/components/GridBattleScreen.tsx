// The shared-room battle screen, for BOTH grid battles:
//  - Chat Battle (#9; Steve, 2026-11-03: "I want it to be the same as country battle with up to 24
//    tiles changing on the host's screen, Every one that is battling will have a host screen
//    exactly the same as country battle.")
//  - Country Battle v2 (Steve, 2026-11-03: "one 10 minutes country battle once a day every day
//    seven days a week ... Everything else will be the same as chat battle.")
//
// One screen, two wire contracts: each battle hands in a GridBattleSource (its heartbeat, join,
// leave, gift call, texts) and its state in the Chat Battle shape (Country Battle's day is mapped
// by dayAsBattleState). Built from the grid pieces (components/BattleGrid), plus the in-screen
// Join, the home tile a viewer followed in, the leaderboard's 30-second spotlight, the battler's
// own viewers' chat under the tiles, the cb_gift "say thanks!", and the end podium with the way
// back to a normal live.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { displayName, mediaUrl, post, type ApiResponse, type Gift } from "../lib/api";
import { useSession } from "../lib/session";
import { useT } from "../lib/i18n";
import { GiftSheet } from "./GiftSheet";
import { Loading, Notice } from "./Common";
import { showGoldAlert } from "./GoldToast";
import { Confetti, Podium } from "./GameShow";
import { SoloBattleStandingsSheet } from "./SoloBattle";
import { CbHeader, CountryBattleGrid, StarredYouBar, heardIds, useRotation, useStarPins, useStarSignals, type CbTileData } from "./BattleGrid";
import { useCountryBattleRoom } from "../lib/countryBattleRoom";
import { cbText, gridShape, serverNow, useTick } from "../lib/countryBattle";
import { chatChannel, ensureFirebaseSignIn, observeChat, sendChat, type ChatMessage } from "../lib/firebase";
import { haptic, sfx } from "../lib/gameSounds";
import {
  battleScreenPath, bonusText, chatBattleStage, checkUserLiveRoom, parseGiftMsg, roomHostId,
  type ChbBattler, type ChbGiftInfo, type ChbGiftMsg, type ChbLiveRoom, type ChbPerson, type ChbResult, type ChbState,
} from "../lib/chatBattle";

const HEARTBEAT_MS = 5000;
export const SPOTLIGHT_MS = 30000;
const PODIUM_MS = 20000;
/** How long a gift's icon stays popped up on the tile, and the "You sent" line on screen. */
const TILE_GIFT_MS = 5000;
const SENT_NOTE_MS = 5000;
/** The receiver's "say thanks!" waits longer — it has a button. */
const GOT_NOTE_MS = 15000;
/** Room kept free under the grid for the chat strip. */
export const CHAT_RESERVE = 116;

export const nameOf = (p: ChbPerson | null | undefined) => p?.name || p?.username || "";
/** "@jimmy" where there is a username, else the name. */
const handleOf = (p: ChbPerson | null | undefined) => p?.username || p?.name || "";

type T = ReturnType<typeof useT>["t"];

/** What differs between the two grid battles. Everything else is this one screen. */
export interface GridBattleSource {
  kind: "chat" | "country";
  /** contest_id (Chat Battle) or day_id (Country Battle). */
  id: number;
  title: string;
  heartbeat: (userId: number, live: boolean) => Promise<ChbResult<ChbState>>;
  /** Join / rejoin. `state` = the fresh state when the answer carries one. */
  join: (userId: number) => Promise<ChbResult<{ state: ChbState | null }>>;
  leave: (userId: number) => Promise<unknown>;
  sendGift: (input: { myId: number; toUserId: number; giftId: number; roomName: string }) => Promise<ApiResponse<unknown>>;
  /** chat_battle_gift / country_battle_gift off a confirmed gift. */
  giftInfo: (res: ApiResponse<unknown>) => ChbGiftInfo | null;
  reasonText: (reason: string | null | undefined, message?: string | null) => string;
  /** The header's countdown lines for the phase. */
  phaseLines: (st: ChbState, now: number) => { sub: string; line: string };
  /** The Join button's text while me.can_join. */
  joinLabel: (st: ChbState, now: number) => string;
  /** A note under the header when I cannot join (Country Battle: "Country Battle is full"). */
  joinNote?: (st: ChbState) => string | null;
  /** The card shown while no tile is live yet. */
  emptyText: (st: ChbState, now: number) => string;
  leaveConfirm: string;
  /** Heartbeat reasons that mean "this battle is gone — close the screen". */
  goneReasons: string[];
  goneText: (reason: string) => string;
  /** This member's checkUserLiveRoom says they are live in THIS battle. */
  isThis: (r: ChbLiveRoom) => boolean;
  /** Country Battle breaks ties by who reached the score first: never "Tie!". */
  noTie?: boolean;
  /** Where the back arrow goes when there is no history (a link opened in a new tab). */
  fallbackPath: string;
  /** The end screen's "not running any more" fallback (viewer, no home). */
  afterEndPath?: string;
}

// ---- gift visibility (Steve, 2026-11-03: "Who ever is gifing a gift they will be able to see the
// gift as well as the member that received the gift so they can thank you for the gift.") -------

/** One gift line on screen: the sender's "You sent 🌹 to @jimmy", or the receiver's "@sam sent
 *  you 🌹 — say thanks!" with a Thank you button. */
interface GiftNoteData {
  kind: "sent" | "got";
  /** The other member: the receiver for "sent", the sender for "got". */
  who: string;
  giftName: string;
  icon: string | null;
  key: number;
}

function GiftNote({ note, onThank, onClose }: { note: GiftNoteData; onThank: (() => void) | null; onClose: () => void }) {
  const { t, tn } = useT();
  const [broken, setBroken] = useState(false);
  const gift = note.icon && !broken
    ? <img className="chb-gn-icon" src={mediaUrl(note.icon)} alt={note.giftName} title={note.giftName} onError={() => setBroken(true)} />
    : <b>{note.giftName || "🎁"}</b>;
  return (
    <div className={`chb-gift-note ${note.kind}`} role="status">
      <span className="chb-gn-text">
        {note.kind === "sent" ? tn("chb_gift_you_sent", gift, note.who) : tn("chb_gift_sent_you", note.who, gift)}
      </span>
      {note.kind === "got" && onThank && <button type="button" className="btn small" onClick={onThank}>💛 {t("chb_thank_you")}</button>}
      <button type="button" className="chb-gn-x" onClick={onClose} aria-label={t("close")}>×</button>
    </div>
  );
}

/** The gift's icon popped up on one tile, and the line under the grid — with their timers. */
function useGiftShow() {
  const [tileGift, setTileGift] = useState<{ userId: number; icon: string | null; key: number } | null>(null);
  const [note, setNote] = useState<GiftNoteData | null>(null);
  const tileTimer = useRef(0);
  const noteTimer = useRef(0);
  useEffect(() => () => { window.clearTimeout(tileTimer.current); window.clearTimeout(noteTimer.current); }, []);
  const popTile = useCallback((userId: number, icon: string | null) => {
    window.clearTimeout(tileTimer.current);
    const key = Date.now();
    setTileGift({ userId, icon, key });
    tileTimer.current = window.setTimeout(() => setTileGift((cur) => (cur?.key === key ? null : cur)), TILE_GIFT_MS);
  }, []);
  const showNote = useCallback((n: Omit<GiftNoteData, "key">) => {
    window.clearTimeout(noteTimer.current);
    const key = Date.now();
    setNote({ ...n, key });
    noteTimer.current = window.setTimeout(() => setNote((cur) => (cur?.key === key ? null : cur)), n.kind === "got" ? GOT_NOTE_MS : SENT_NOTE_MS);
  }, []);
  const closeNote = useCallback(() => { window.clearTimeout(noteTimer.current); setNote(null); }, []);
  /** The tiles with the popped-up gift on the one it landed on. */
  const withGift = useCallback(<X extends CbTileData>(tiles: X[]): X[] => (
    tileGift ? tiles.map((x) => (x.userId === tileGift.userId ? { ...x, gift: { icon: tileGift.icon, key: tileGift.key } } : x)) : tiles
  ), [tileGift]);
  return { note, popTile, showNote, closeNote, withGift };
}

/** A gift line for the chat strip, kept on this screen only (the server writes nothing to the
 *  Firestore thread for a tile gift). A NEGATIVE sender id draws it as a gift line. */
function giftLine(t: T, msg: ChbGiftMsg): ChatMessage {
  return {
    id: `cbg-${msg.from_user_id}-${msg.to_user_id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    senderUserId: -Math.max(1, msg.gift_id || 1),
    senderName: msg.from_name ?? "",
    message: t("chb_gift_line", msg.from_name || "?", msg.to_name || "?", msg.gift_name || "🎁"),
    sentAt: Date.now(),
  };
}

/** Thread + local lines, in time order. */
function mergeLines(messages: ChatMessage[], local: ChatMessage[]): ChatMessage[] {
  if (!local.length) return messages;
  return [...messages, ...local].sort((a, b) => a.sentAt - b.sentAt);
}

// ---- the pieces both the live screen and the demos use ----------------------------------------

/** Which tiles are on screen: the pinned one (your own tile as a battler, the home battler as a
 *  viewer) top-left, then up to 23 others from the live list, rotating every 15–25 s. Starred
 *  tiles, the gift target and the spotlit battler never rotate out. */
export function useGridBattleTiles(input: {
  battlers: ChbBattler[];
  live: number[];
  publishers: number[];
  myId: number;
  isBattler: boolean;
  home: number | null;
  giftTarget: number | null;
  spot: number | null;
  onPinFull: () => void;
  /** Also never rotated out: on a follower's screen, the members their host starred. */
  extraHold?: number[];
}) {
  const { battlers, live, publishers, myId, isBattler, home, giftTarget, spot } = input;
  const byId = useMemo(() => new Map(battlers.map((b) => [b.user_id, b])), [battlers]);
  // Tiles = live ∩ battlers, plus anyone already publishing the heartbeat has not caught up with.
  const liveIds = useMemo(() => {
    const s = new Set<number>();
    for (const id of live) if (byId.has(id)) s.add(id);
    for (const id of publishers) { const b = byId.get(id); if (b && !b.left) s.add(id); }
    return s;
  }, [live, publishers, byId]);
  const homeRow = home ? byId.get(home) : undefined;
  const pinnedId = isBattler ? myId : homeRow && !homeRow.left ? homeRow.user_id : null;
  const total = liveIds.size + (pinnedId != null && !liveIds.has(pinnedId) ? 1 : 0);
  const stage = chatBattleStage(total);
  const { cap } = gridShape(stage);
  const pool = useMemo(
    () => [...liveIds].filter((id) => id !== pinnedId && id !== myId).sort((a, b) => a - b),
    [liveIds, pinnedId, myId],
  );
  const star = useStarPins(pool, isBattler, input.onPinFull);
  const extraKey = (input.extraHold ?? []).join(",");
  const hold = useMemo(
    () => [...star.pins, ...(input.extraHold ?? []), ...(giftTarget != null ? [giftTarget] : [])],
    [star.pins, extraKey, giftTarget], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const spotInPool = spot != null && pool.includes(spot) ? spot : null;
  const shown = useRotation(cap - (pinnedId != null ? 1 : 0), pool, hold, spotInPool);
  const tiles: CbTileData[] = [
    ...(pinnedId != null ? [{
      userId: pinnedId, name: nameOf(byId.get(pinnedId)), photo: byId.get(pinnedId)?.profile_image ?? null,
      own: isBattler, home: !isBattler, spot: spot === pinnedId,
    }] : []),
    ...shown.map((id) => {
      const b = byId.get(id);
      return { userId: id, name: nameOf(b), photo: b?.profile_image ?? null, spot: spot === id, starred: star.pins.includes(id) };
    }),
  ];
  return { tiles, stage, shown, pinnedId, star, byId, pool };
}

/** The live chat of one room, read from Firestore like the live room's. */
function useRoomChat(room: string | null, enabled: boolean): ChatMessage[] {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  useEffect(() => {
    setMessages([]);
    if (!room || !enabled) return;
    let unsub: (() => void) | null = null;
    let cancelled = false;
    ensureFirebaseSignIn()
      .then(() => { if (!cancelled) unsub = observeChat(chatChannel(room, roomHostId(room)), setMessages, () => undefined); })
      .catch(() => undefined);
    return () => { cancelled = true; unsub?.(); };
  }, [room, enabled]);
  return messages;
}

/** The small strip under the tiles: the home battler's own viewers' chat (Steve: "each battler
 *  keeps their OWN viewers' chat in a small strip under the tiles"). */
export function ChatStrip({ messages, onSend, note }: { messages: ChatMessage[]; onSend: ((text: string) => void) | null; note?: ReactNode }) {
  const { t } = useT();
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const recent = messages.slice(-30);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [messages]);
  return (
    <div className="chb-chat">
      {note}
      <div ref={logRef} className="chb-chat-log" aria-live="polite">
        {recent.length === 0
          ? <span className="chb-empty">💬 {t("chb_chat_empty")}</span>
          : recent.map((m) => (
            // A gift line carries its gift as a NEGATIVE sender id (postGiftMessage on the phones).
            <div key={m.id} className={`chb-line${m.senderUserId < 0 ? " gift" : ""}`}>
              {m.senderUserId < 0 ? <>🎁 {m.message}</> : <><b>{m.senderName}</b>{m.stickerUrl ? "🖼️" : m.message}</>}
            </div>
          ))}
      </div>
      {onSend && (
        <form onSubmit={(e) => { e.preventDefault(); const v = draft.trim(); if (v) { onSend(v); setDraft(""); } }}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("say_something")} maxLength={300} aria-label={t("say_something")} />
          <button className="btn small" type="submit" disabled={!draft.trim()}>{t("send")}</button>
        </form>
      )}
    </div>
  );
}

/** The end: confetti, the podium (Country Battle: the server's top 3), the winner (or "Tie!"),
 *  and where you are being taken. */
export function GridBattleEnd({ st, note, onClose }: { st: ChbState; note: string | null; onClose: () => void }) {
  const { t } = useT();
  // Chat Battle round 2: the starter's bonus, to the starter only (the server sends it to nobody else), once paid.
  const bonus = st.me.starter_bonus;
  const [burst] = useState(() => Date.now());
  const top = st.top3?.length
    ? [...st.top3].sort((a, b) => a.place - b.place).filter((b) => b.score > 0).slice(0, 3)
    : st.battlers.filter((b) => b.score > 0).slice(0, 3);
  const winner = st.winner ?? (st.top3?.length ? top[0] ?? null : null);
  const headline = st.tie ? `🤝 ${t("chb_tie")}`
    : winner ? `👑 ${cbText(t("chb_wins"), { name: nameOf(winner) })}`
    : t("chb_no_winner");
  return (
    <div className="chb-end" role="dialog" aria-modal="true">
      <div className="card pad">
        <Confetti burst={burst} />
        <div style={{ color: "var(--gold)", fontWeight: 800, fontSize: 13, marginBottom: 2 }}>🏁 {t("chb_ended")}</div>
        <div style={{ fontWeight: 900, fontSize: 22, color: "var(--gold)", marginBottom: 8, overflowWrap: "anywhere" }}>{headline}</div>
        {top.length > 0 && <Podium tie={st.tie} rows={top.map((b) => ({ name: nameOf(b), value: b.score.toLocaleString() }))} />}
        {st.finished && bonus?.paid && (
          <div className="chb-bonus-end">💰 {cbText(t("chb_starter_bonus"), { amount: bonusText(bonus.amount) })}</div>
        )}
        {note && <p className="muted" style={{ fontSize: 13, margin: "12px 0 0" }}>{note}</p>}
        <button className="btn" style={{ marginTop: 14 }} onClick={onClose}>{t("chb_back")}</button>
      </div>
    </div>
  );
}

// ---- the live screen -------------------------------------------------------------------------

export function GridBattleLive({ source, home, battlerHint, autoJoin, demoUserId }: {
  source: GridBattleSource;
  /** A viewer who followed this battler in: pinned top-left, heard by default. */
  home: number | null;
  /** This browser has already joined (it just started / joined): publish camera + mic. */
  battlerHint: boolean;
  /** Join as soon as the screen opens (Country Battle's "Join live" on its page). */
  autoJoin?: boolean;
  /** The explainer-video demo only: whose screen this is (a fake battler), signed in or not. */
  demoUserId?: number;
}) {
  const { t } = useT();
  const { user, isLoggedIn } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const myId = demoUserId ?? user?.id ?? 0;
  const now = useTick();
  const srcRef = useRef(source);
  srcRef.current = source;
  const battleId = source.id;

  const [st, setSt] = useState<ChbState | null>(null);
  /** The heartbeat's reason once this battle is gone (not_found / off), else null. */
  const [gone, setGone] = useState<string | null>(null);
  const [role, setRole] = useState<"guest" | "viewer">(battlerHint && (isLoggedIn || !!demoUserId) ? "guest" : "viewer");
  const [joining, setJoining] = useState(false);
  // A tile tapped to listen to (viewers). Battlers hear their stars; a home viewer always hears home.
  const [listen, setListen] = useState<number | null>(null);
  const [giftTarget, setGiftTarget] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ userId: number; gift: Gift } | null>(null);
  const [boardOpen, setBoardOpen] = useState(false);
  const [spot, setSpot] = useState<number | null>(null);
  const [endNote, setEndNote] = useState<string | null>(null);
  const [endShown, setEndShown] = useState(false);

  const roleRef = useRef(role);
  roleRef.current = role;
  const myIdRef = useRef(myId);
  myIdRef.current = myId;
  const publishingRef = useRef(false);

  // ---- the heartbeat: every 5 s, battlers AND viewers ----
  const beat = useCallback(async () => {
    const r = await srcRef.current.heartbeat(myIdRef.current, roleRef.current === "guest" && publishingRef.current).catch(() => null);
    if (!r) return;
    if (r.ok) setSt(r.data);
    else if (srcRef.current.goneReasons.includes(r.reason)) setGone(r.reason);
  }, []);
  useEffect(() => {
    if (gone) return;
    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [beat, gone, battleId]);
  // Once more as each phase turns (lobby opens, gifts start counting, the end), so the screen
  // flips without waiting for the next beat.
  const phaseEnds = st?.phase_ends_at ?? null;
  useEffect(() => {
    if (!phaseEnds) return;
    const ms = Date.parse(phaseEnds) - serverNow();
    if (Number.isNaN(ms) || ms < 0 || ms > 20 * 60_000) return;
    const timer = setTimeout(beat, ms + 400);
    return () => clearTimeout(timer);
  }, [phaseEnds, beat]);

  // The server is the authority on whether I am battling: a battler row that left (another tab,
  // an admin, the 30-second liveness window) drops this screen back to watching.
  useEffect(() => {
    if (st && role === "guest" && (!st.me.is_battler || st.me.left)) setRole("viewer");
  }, [st, role]);

  const ended = st?.phase === "ended";
  const roomName = st?.room_open ? st.room_name : null;
  const isBattler = role === "guest";

  const [visibleIds, setVisibleIds] = useState<number[]>([]);
  const [heard, setHeard] = useState<number[]>([]);
  const onDataRef = useRef<(topic: string, payload: unknown, from: number | null) => void>(() => undefined);
  const roomHook = useCountryBattleRoom({
    roomName,
    role,
    enabled: !!roomName && !joining && !gone,
    visible: visibleIds,
    listen: heard,
    onData: (topic, payload, from) => onDataRef.current(topic, payload, from),
    onPublishFailed: () => {
      showGoldAlert(t("cb_camera_needed"));
      if (myIdRef.current) srcRef.current.leave(myIdRef.current).catch(() => undefined);
      setRole("viewer");
    },
  });
  publishingRef.current = roomHook.status === "live";
  // Tell the server the moment we are publishing, not up to 5 s later.
  useEffect(() => { if (roomHook.status === "live" && role === "guest") beat(); }, [roomHook.status, role, beat]);

  const publisherIds = useMemo(() => roomHook.publishers.map((p) => p.userId), [roomHook.publishers]);
  const [homeHold, setHomeHold] = useState<number[]>([]);
  const grid = useGridBattleTiles({
    battlers: st?.battlers ?? [], live: st?.live ?? [], publishers: publisherIds, myId, isBattler,
    home: isBattler ? null : home, giftTarget, spot, onPinFull: () => showGoldAlert(t("chb_pin_max")),
    extraHold: isBattler ? [] : homeHold,
  });
  const { shown, pinnedId } = grid;
  // Sound follows the star: who this screen hears, and who starred me.
  const signals = useStarSignals({
    myId, isBattler, pins: grid.star.pins, home: isBattler ? null : home, pool: grid.pool,
    connected: roomHook.status === "live", sendData: roomHook.sendData,
  });
  // ---- gifts on the tiles ----
  const giftShow = useGiftShow();
  const [localLines, setLocalLines] = useState<ChatMessage[]>([]);
  // Whose strip this screen shows: my own as a battler, the home battler's as a viewer.
  const stripOwner = isBattler ? myId : home;
  const stripOwnerRef = useRef(stripOwner);
  stripOwnerRef.current = stripOwner;
  useEffect(() => { setLocalLines([]); }, [stripOwner]);
  /** The gift the receiver's Thank you is for. */
  const thankRef = useRef<ChbGiftMsg | null>(null);
  const addLine = useCallback((msg: ChbGiftMsg) => setLocalLines((cur) => [...cur.slice(-19), giftLine(t, msg)]), [t]);
  /** A cb_gift from the room: the receiver gets "say thanks!", the receiver's own viewers get the
   *  line in their strip, everyone else ignores it. */
  const onGiftData = (payload: unknown) => {
    const msg = parseGiftMsg(payload);
    if (!msg || msg.from_user_id === myIdRef.current) return;
    if (roleRef.current === "guest" && msg.to_user_id === myIdRef.current) {
      giftShow.popTile(msg.to_user_id, msg.icon_url ?? null);
      giftShow.showNote({ kind: "got", who: msg.from_name || "?", giftName: msg.gift_name || "", icon: msg.icon_url ?? null });
      addLine(msg);
      sfx.reveal();
      haptic([30, 40, 30]);
      thankRef.current = msg;
    } else if (stripOwnerRef.current && msg.to_user_id === stripOwnerRef.current) {
      giftShow.popTile(msg.to_user_id, msg.icon_url ?? null);
      addLine(msg);
    }
  };
  onDataRef.current = (topic, payload, from) => {
    if (topic === "cb_gift") onGiftData(payload);
    else signals.onData(topic, payload, from);
  };
  /** What the last confirmed tile gift answered (chat_battle_gift / country_battle_gift), for onSent. */
  const lastGiftRef = useRef<ChbGiftInfo | null>(null);
  const onGiftSent = (toUserId: number, gift: Gift) => {
    const info = lastGiftRef.current;
    lastGiftRef.current = null;
    const icon = info?.icon_url ?? (gift.image ? gift.image : null);
    const receiver = info?.receiver ?? grid.byId.get(toUserId) ?? null;
    giftShow.popTile(toUserId, icon);
    giftShow.showNote({ kind: "sent", who: handleOf(receiver), giftName: info?.gift_name ?? gift.name ?? "", icon });
    // Published only once the server confirmed the gift (GiftSheet calls onSent on status:true).
    if (info?.cb_gift) {
      roomHook.sendData("cb_gift", info.cb_gift);
      if (toUserId === stripOwnerRef.current) addLine({ ...info.cb_gift, from_name: info.cb_gift.from_name ?? displayName(user ?? undefined) });
    }
  };
  const homeStarsKey = signals.homeStars.join(",");
  useEffect(() => { setHomeHold(signals.homeStars); }, [homeStarsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const heardNow = heardIds({ isBattler, pins: grid.star.pins, home: isBattler ? null : home, homeStars: signals.homeStars, spot, listen });
  const heardKey = heardNow.join(",");
  useEffect(() => { setHeard((cur) => (cur.join(",") === heardKey ? cur : heardNow)); }, [heardKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const awaitingBack = isBattler ? signals.starredMe.filter((id) => !grid.star.pins.includes(id)) : [];
  const tiles = awaitingBack.length ? grid.tiles.map((x) => (awaitingBack.includes(x.userId) ? { ...x, starredMe: true } : x)) : grid.tiles;
  useEffect(() => {
    const ids = [...(pinnedId != null && pinnedId !== myId ? [pinnedId] : []), ...shown];
    setVisibleIds((cur) => (cur.length === ids.length && cur.every((x, i) => x === ids[i]) ? cur : ids));
  }, [shown, pinnedId, myId]);
  // The tile being listened to rotated away or left: back to silence (home stays heard).
  useEffect(() => {
    if (listen != null && listen !== pinnedId && !shown.includes(listen)) setListen(null);
  }, [shown, listen, pinnedId]);

  // ---- the leaderboard's spotlight: 30 s in the first rotating slot, heard while it lasts ----
  const spotTimer = useRef<number>(0);
  const spotlight = useCallback(async (b: { user_id?: number | null }) => {
    const id = Number(b.user_id ?? 0);
    if (!id) return;
    setBoardOpen(false);
    const live = st?.live.includes(id) || publisherIds.includes(id);
    if (live && id !== myId) {
      window.clearTimeout(spotTimer.current);
      setSpot(id);
      sfx.reveal();
      haptic(30);
      spotTimer.current = window.setTimeout(() => setSpot(null), SPOTLIGHT_MS);
      return;
    }
    if (id === myId) return;
    // Not on the grid (left or dropped): their live, else their profile.
    const r = await checkUserLiveRoom(id);
    if (r?.is_live && r.room_name && !srcRef.current.isThis(r)) {
      navigate(battleScreenPath(r, id) ?? `/live/${encodeURIComponent(r.room_name)}`);
    } else navigate(`/profile/${id}`);
  }, [st, publisherIds, myId, navigate]);
  useEffect(() => () => window.clearTimeout(spotTimer.current), []);

  // ---- join / rejoin ----
  async function join() {
    if (!isLoggedIn || !user) { navigate("/login", { state: { from: location.pathname + location.search } }); return; }
    if (joining) return;
    setJoining(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach((tr) => tr.stop());
    } catch {
      showGoldAlert(t("cb_camera_needed"));
      setJoining(false);
      return;
    }
    try {
      const r = await srcRef.current.join(user.id);
      if (r.ok) {
        if (r.data.state) setSt(r.data.state);
        leftRef.current = false;
        setRole("guest");
        setListen(null);
        setSpot(null);
      } else showGoldAlert(srcRef.current.reasonText(r.reason, r.message));
    } catch (e) {
      showGoldAlert((e as Error).message);
    } finally {
      setJoining(false);
      beat();
    }
  }
  // Country Battle's "Join live" on its page opens this screen with ?join=1: join once the state is
  // here and says a join would work (the server still decides).
  const autoJoined = useRef(false);
  useEffect(() => {
    if (!autoJoin || autoJoined.current || !st) return;
    autoJoined.current = true;
    if (role !== "guest" && st.me.can_join) join();
    else if (role !== "guest" && st.me.join_reason && st.me.join_reason !== "already_in") showGoldAlert(source.reasonText(st.me.join_reason));
  }, [autoJoin, st]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- leaving: the back arrow, or navigating away. Score stays; rejoin is possible. ----
  const leftRef = useRef(false);
  const leave = useCallback(() => {
    if (leftRef.current || roleRef.current !== "guest" || !myIdRef.current) return;
    leftRef.current = true;
    srcRef.current.leave(myIdRef.current).catch(() => undefined);
  }, []);
  useEffect(() => () => leave(), [leave]);
  const goBack = useCallback(() => {
    roomHook.disconnect();
    if (location.key !== "default") navigate(-1); else navigate(srcRef.current.fallbackPath, { replace: true });
  }, [roomHook, location.key, navigate]);
  const back = () => {
    if (isBattler && !ended && !window.confirm(source.leaveConfirm)) return;
    leave();
    goBack();
  };

  // ---- the end: podium ~20 s, then battlers back to a live of their own, viewers follow home ----
  const sawRunning = useRef(false);
  if (st && st.phase !== "ended") sawRunning.current = true;
  const wasBattlerAtEnd = useRef(false);
  const endHandled = useRef(false);
  useEffect(() => {
    if (!ended || !st || endHandled.current) return;
    endHandled.current = true;
    setEndShown(true);
    setBoardOpen(false);
    setGiftTarget(null);
    if (!sawRunning.current) return; // opened after the end: show the result, take nobody anywhere
    sfx.fanfare();
    haptic([40, 60, 40]);
    wasBattlerAtEnd.current = roleRef.current === "guest";
    const homeName = home ? nameOf(st.battlers.find((b) => b.user_id === home)) : "";
    if (wasBattlerAtEnd.current) setEndNote(t("chb_back_to_live"));
    else if (home) setEndNote(cbText(t("chb_following"), { name: homeName }));
  }, [ended, st, home, t]);

  // Runs once per screen: refs only, so a re-render can never cancel the trip home half-way.
  const afterPodium = useRef(false);
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  useEffect(() => {
    if (!endShown || !sawRunning.current || afterPodium.current) return;
    afterPodium.current = true;
    const go = (to: string) => { if (mountedRef.current) navigateRef.current(to, { replace: true }); };
    window.setTimeout(async () => {
      if (!mountedRef.current) return;
      leftRef.current = true; // the battle is over — nothing to leave
      roomHook.disconnect();
      if (wasBattlerAtEnd.current) {
        // Back to a normal live of my own, exactly as starting one (GoLivePage).
        const res = await post<unknown>("startLive", { user_id: myIdRef.current }).catch(() => null);
        const room = (res as { room_name?: string } | null)?.room_name;
        go(room ? `/live/${encodeURIComponent(room)}?host=1` : "/live");
        return;
      }
      if (!home) { if (srcRef.current.afterEndPath) go(srcRef.current.afterEndPath); return; }
      // Follow the home battler back to their live: every 3 s for up to 30 s.
      const started = Date.now();
      const look = async () => {
        if (!mountedRef.current) return;
        const r = await checkUserLiveRoom(home);
        if (r?.is_live && r.room_name && !r.chat_battle_contest_id && !r.country_battle_day_id) { go(`/live/${encodeURIComponent(r.room_name)}`); return; }
        if (Date.now() - started > 30_000) { go("/live"); return; }
        window.setTimeout(look, 3000);
      };
      look();
    }, PODIUM_MS);
  }, [endShown]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the battle is gone: follow the home battler if they are live somewhere ----
  useEffect(() => {
    if (!gone) return;
    roomHook.disconnect();
    if (!home) return;
    let alive = true;
    checkUserLiveRoom(home).then((r) => {
      if (alive && r?.is_live && r.room_name && !r.chat_battle_contest_id && !r.country_battle_day_id) navigate(`/live/${encodeURIComponent(r.room_name)}`, { replace: true });
    });
    return () => { alive = false; };
  }, [gone, home]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- chat: my own thread as a battler, the home battler's as a viewer, else the room's ----
  const meRow = st?.battlers.find((b) => b.user_id === myId);
  const homeRow = home ? st?.battlers.find((b) => b.user_id === home) : undefined;
  const chatRoom = (isBattler ? meRow?.chat_room_name : homeRow?.chat_room_name) || st?.room_name || null;
  const threadMessages = useRoomChat(chatRoom, isLoggedIn);
  const messages = useMemo(() => mergeLines(threadMessages, localLines), [threadMessages, localLines]);
  const onSend = isLoggedIn && user && chatRoom
    ? (text: string) => { sendChat(chatChannel(chatRoom, roomHostId(chatRoom)), user.id, displayName(user), text, user.profile_image ?? "").catch(() => undefined); }
    : null;
  // The receiver's Thank you: an ordinary chat line in their own strip, nothing more to the server.
  const onThank = onSend
    ? () => {
      const g = thankRef.current;
      if (g) onSend(t("chb_thanks_line", g.from_name || "", g.gift_name || "🎁"));
      giftShow.closeNote();
    }
    : null;

  if (gone) {
    return (
      <div className="page cb-page" style={{ paddingTop: 10 }}>
        <CbHeader title={source.title} stage="" sub="" line={t("chb_ended")} onBack={goBack} backLabel={t("chb_back")} />
        <Notice>{source.goneText(gone)}</Notice>
      </div>
    );
  }
  if (!st) {
    return (
      <div className="page cb-page" style={{ paddingTop: 10 }}>
        <CbHeader title={source.title} stage="" sub="" line="" onBack={goBack} backLabel={t("chb_back")} />
        <Loading />
      </div>
    );
  }

  const pl = source.phaseLines(st, now);
  const me = st.me;
  const showJoin = !isBattler && me.can_join && !ended;
  const rejoin = me.is_battler && (me.left || !me.is_live);
  const joinLabel = joining ? t("chb_joining") : rejoin ? t("chb_rejoin") : source.joinLabel(st, now);
  const joinNote = !isBattler && !ended && !me.can_join ? source.joinNote?.(st) ?? null : null;
  const giftRoom = st.room_name ?? "";
  // Chat Battle round 2: the starter's bonus — "so far" while it runs, the paid figure at the end. Starter only.
  const bonus = me.starter_bonus;
  const bonusLabel = bonus
    ? cbText(t(bonus.paid ? "chb_starter_bonus" : "chb_starter_bonus_so_far"), { amount: bonusText(bonus.amount) })
    : null;
  return (
    <div className="page cb-page" style={{ paddingTop: 10 }}>
      <CbHeader isTest={!!st.is_test} title={source.title} stage={st.name} sub={pl.sub} line={pl.line}
        liveCount={st.phase === "upcoming" ? null : st.live_count}
        scoreText={isBattler ? cbText(t("chb_my_score"), { n: (me.score ?? 0).toLocaleString() }) : null}
        backLabel={isBattler && !ended ? t("cb_leave") : t("chb_back")}
        onBack={back}
        actions={<>
          {bonusLabel && <span className="chb-bonus" title={cbText(t("chb_starter_bonus_terms"), { percent: bonus?.percent ?? 1, cap: bonusText(bonus?.cap ?? 25) })}>💰 {bonusLabel}</span>}
          {st.phase !== "upcoming" && <button className="btn small ghost" onClick={() => setBoardOpen(true)}>🏆 {t("leaderboard")}</button>}
          {showJoin && <button className="btn small" onClick={join} disabled={joining}>{joinLabel}</button>}
        </>} />
      {joinNote && <div className="cb-join-note" role="status">{joinNote}</div>}
      {roomHook.error && <Notice error>{roomHook.error}</Notice>}
      <StarredYouBar ids={awaitingBack} nameOf={(id) => nameOf(grid.byId.get(id))} onStarBack={(id) => grid.star.toggle(id)} />
      {tiles.length === 0
        ? <div className="card cb-empty">{ended ? t("chb_ended") : source.emptyText(st, now)}</div>
        : (
          <CountryBattleGrid stage={grid.stage} tiles={giftShow.withGift(tiles)} listen={heardNow} reserve={CHAT_RESERVE} phoneFullWidth
            onTap={(id) => {
              // A battler's tap stars the tile — they hear only who they starred; a viewer's tap listens.
              if (isBattler) grid.star.toggle(id);
              else if (id !== home) setListen((cur) => (cur === id ? null : id));
            }}
            onGift={(id) => {
              if (!isLoggedIn) { navigate("/login", { state: { from: location.pathname + location.search } }); return; }
              if (id !== myId) setGiftTarget(id);
            }}
            attach={roomHook.attachVideo} hasVideo={roomHook.hasVideo} version={roomHook.version}
            flash={flash} onFlashDone={() => setFlash(null)} />
        )}
      <ChatStrip messages={messages} onSend={onSend}
        note={giftShow.note && <GiftNote key={giftShow.note.key} note={giftShow.note} onThank={onThank} onClose={giftShow.closeNote} />} />
      {giftTarget != null && (
        <GiftSheet
          onClose={() => setGiftTarget(null)}
          onSent={(gift) => { setFlash({ userId: giftTarget, gift }); onGiftSent(giftTarget, gift); beat(); }}
          sendOverride={async (_coins, gift) => {
            const res = await source.sendGift({ myId, toUserId: giftTarget, giftId: gift.id, roomName: giftRoom });
            lastGiftRef.current = source.giftInfo(res);
            return res;
          }} />
      )}
      {boardOpen && (
        <SoloBattleStandingsSheet battle={{ id: battleId, name: st.name, starts_at: st.starts_at, ends_at: st.ends_at }}
          title={source.title} noTie={source.noTie}
          myUserId={myId || null} onClose={() => setBoardOpen(false)}
          rows={st.battlers.map((b) => ({ user_id: b.user_id, label: nameOf(b), username: b.username, profile_image: b.profile_image, score: b.score, location: b.left ? t("chb_left") : null }))}
          finished={st.finished} onPick={spotlight} footer={`${t("chb_tap_spotlight")} · ${t("scored_by_the_gift_coins_each_person_rec")}`} />
      )}
      {endShown && <GridBattleEnd st={st} note={endNote} onClose={() => { afterPodium.current = true; mountedRef.current = false; leftRef.current = true; goBack(); }} />}
    </div>
  );
}
