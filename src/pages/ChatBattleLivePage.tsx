// The Chat Battle screen (#9, was "Solo Battle With Unlimited Players"; Steve, 2026-11-03):
// "I want it to be the same as country battle with up to 24 tiles changing on the host's screen,
// Every one that is battling will have a host screen exactly the same as country battle."
//
// Built from the Country Battle pieces (CountryBattleGrid, useRotation, useStarPins,
// useCountryBattleRoom, GiftSheet), plus what Chat Battle adds: the in-screen Join, the home tile
// a viewer followed in, the leaderboard's 30-second spotlight, the battler's own viewers' chat
// under the tiles, and the end podium with the way back to a normal live.
//
// /chat-battle/:contestId              watch (viewer, no home tile)
// /chat-battle/:contestId?home=303     a viewer who followed battler 303 in: 303 pinned top-left
// /chat-battle/:contestId?battler=1    this browser just started / joined: publish camera + mic
// /chat-battle/0?demo=24|12|6          the screen with fake battlers and no LiveKit or server, for
//                                      the explainer video. &own=0 = a viewer's screen (home tile
//                                      instead of own); &end=1 = the podium; &img=/path/ photos.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { displayName, mediaUrl, post, type Gift } from "../lib/api";
import { useSession } from "../lib/session";
import { useT } from "../lib/i18n";
import { GiftSheet } from "../components/GiftSheet";
import { Loading, Notice } from "../components/Common";
import { showGoldAlert } from "../components/GoldToast";
import { Confetti, Podium } from "../components/GameShow";
import { SoloBattleStandingsSheet } from "../components/SoloBattle";
import { CbHeader, CountryBattleGrid, StarredYouBar, heardIds, useRotation, useStarPins, useStarSignals, type CbTileData } from "./CountryBattleLivePage";
import { useCountryBattleRoom } from "../lib/countryBattleRoom";
import { cbText, clock, gridShape, serverNow, useTick } from "../lib/countryBattle";
import { chatChannel, ensureFirebaseSignIn, observeChat, sendChat, type ChatMessage } from "../lib/firebase";
import { haptic, sfx } from "../lib/gameSounds";
import {
  chatBattleHeartbeat, chatBattlePath, chatBattleStage, chatReasonText, checkUserLiveRoom, joinChatBattle, leaveChatBattle,
  bonusText, parseGiftMsg, roomHostId, sendChatBattleGift,
  type ChbBattler, type ChbGiftInfo, type ChbGiftMsg, type ChbPerson, type ChbState,
} from "../lib/chatBattle";

const HEARTBEAT_MS = 5000;
const SPOTLIGHT_MS = 30000;
const PODIUM_MS = 20000;
/** How long a gift's icon stays popped up on the tile, and the "You sent" line on screen. */
const TILE_GIFT_MS = 5000;
const SENT_NOTE_MS = 5000;
/** The receiver's "say thanks!" waits longer — it has a button. */
const GOT_NOTE_MS = 15000;
/** Room kept free under the grid for the chat strip. */
const CHAT_RESERVE = 116;

const nameOf = (p: ChbPerson | null | undefined) => p?.name || p?.username || "";
/** "@jimmy" where there is a username, else the name. */
const handleOf = (p: ChbPerson | null | undefined) => p?.username || p?.name || "";

// ---- round 2: gift visibility (Steve, 2026-11-03: "Who ever is gifing a gift they will be able
// to see the gift as well as the member that received the gift so they can thank you for the
// gift.") ----------------------------------------------------------------------------------------

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
  const withGift = useCallback(<T extends CbTileData>(tiles: T[]): T[] => (
    tileGift ? tiles.map((x) => (x.userId === tileGift.userId ? { ...x, gift: { icon: tileGift.icon, key: tileGift.key } } : x)) : tiles
  ), [tileGift]);
  return { note, popTile, showNote, closeNote, withGift };
}

/** A gift line for the chat strip, kept on this screen only (the server writes nothing to the
 *  Firestore thread for a tile gift). A NEGATIVE sender id draws it as a gift line. */
function giftLine(t: ReturnType<typeof useT>["t"], msg: ChbGiftMsg): ChatMessage {
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

// ---- the pieces both the live screen and the demo use ----------------------------------------

/** Which tiles are on screen: the pinned one (your own tile as a battler, the home battler as a
 *  viewer) top-left, then up to 23 others from the live list, rotating every 15–25 s. Starred
 *  tiles, the gift target and the spotlit battler never rotate out. */
function useChatBattleTiles(input: {
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
function ChatStrip({ messages, onSend, note }: { messages: ChatMessage[]; onSend: ((text: string) => void) | null; note?: ReactNode }) {
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

/** The end: confetti, the podium, the winner (or "Tie!"), and where you are being taken. */
function ChatBattleEnd({ st, note, onClose }: { st: ChbState; note: string | null; onClose: () => void }) {
  const { t } = useT();
  // Round 2: the starter's bonus, to the starter only (the server sends it to nobody else), once paid.
  const bonus = st.me.starter_bonus;
  const [burst] = useState(() => Date.now());
  const top = st.battlers.filter((b) => b.score > 0).slice(0, 3);
  const headline = st.tie ? `🤝 ${t("chb_tie")}`
    : st.winner ? `👑 ${cbText(t("chb_wins"), { name: nameOf(st.winner) })}`
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

/** Header lines for the phase: the countdown on the server's clock. */
function phaseLines(t: ReturnType<typeof useT>["t"], st: ChbState | null, now: number): { sub: string; line: string } {
  if (!st) return { sub: "", line: "" };
  if (st.phase === "ended") return { sub: "", line: t("chb_ended") };
  const target = st.phase_ends_at ? Date.parse(st.phase_ends_at) : NaN;
  const left = Number.isNaN(target) ? "" : clock(target - now);
  if (st.phase === "joining") return { sub: t("chb_gifts_start_in"), line: left };
  return { sub: t("chb_battle_on"), line: left ? cbText(t("cb_time_left"), { time: left }) : "" };
}

// ---- the page --------------------------------------------------------------------------------

export function ChatBattleLivePage() {
  const { contestId } = useParams();
  const [sp] = useSearchParams();
  const demo = sp.get("demo");
  if (demo) return <ChatBattleDemo n={Number(demo) || 24} withOwn={sp.get("own") !== "0"} showEnd={sp.get("end") === "1"} imgBase={sp.get("img")} />;
  const home = Number(sp.get("home")) || null;
  return <ChatBattleLive key={contestId} contestId={Number(contestId)} home={home} battlerHint={sp.get("battler") === "1"} />;
}

function ChatBattleLive({ contestId, home, battlerHint }: { contestId: number; home: number | null; battlerHint: boolean }) {
  const { t } = useT();
  const { user, isLoggedIn } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const myId = user?.id ?? 0;
  const now = useTick();

  const [st, setSt] = useState<ChbState | null>(null);
  const [gone, setGone] = useState(false);
  const [role, setRole] = useState<"guest" | "viewer">(battlerHint && isLoggedIn ? "guest" : "viewer");
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
    const r = await chatBattleHeartbeat(myIdRef.current, contestId, roleRef.current === "guest" && publishingRef.current).catch(() => null);
    if (!r) return;
    if (r.ok) setSt(r.data);
    else if (r.reason === "not_found") setGone(true);
  }, [contestId]);
  useEffect(() => {
    if (gone) return;
    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [beat, gone]);
  // Once more at starts_at and at ends_at, so the phase flips without waiting for the next beat.
  const phaseEnds = st?.phase_ends_at ?? null;
  useEffect(() => {
    if (!phaseEnds) return;
    const ms = Date.parse(phaseEnds) - serverNow();
    if (Number.isNaN(ms) || ms < 0 || ms > 20 * 60_000) return;
    const timer = setTimeout(beat, ms + 400);
    return () => clearTimeout(timer);
  }, [phaseEnds, beat]);

  // The server is the authority on whether I am battling: a battler row that left (another tab,
  // an admin) drops this screen back to watching.
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
      if (myIdRef.current) leaveChatBattle(myIdRef.current, contestId).catch(() => undefined);
      setRole("viewer");
    },
  });
  publishingRef.current = roomHook.status === "live";
  // Tell the server the moment we are publishing, not up to 5 s later.
  useEffect(() => { if (roomHook.status === "live" && role === "guest") beat(); }, [roomHook.status, role, beat]);

  const publisherIds = useMemo(() => roomHook.publishers.map((p) => p.userId), [roomHook.publishers]);
  const [homeHold, setHomeHold] = useState<number[]>([]);
  const grid = useChatBattleTiles({
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
  // ---- round 2: gifts on the tiles ----
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
  /** What the last confirmed tile gift answered (chat_battle_gift), for onSent. */
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
    if (r?.is_live && r.room_name && r.chat_battle_contest_id !== contestId) {
      navigate(r.chat_battle_contest_id ? chatBattlePath(r.chat_battle_contest_id, { home: id }) : `/live/${encodeURIComponent(r.room_name)}`);
    } else navigate(`/profile/${id}`);
  }, [st, publisherIds, myId, contestId, navigate]);
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
      const r = await joinChatBattle(user.id, contestId);
      if (r.ok && r.data.shared) {
        if (r.data.chat_battle) setSt(r.data.chat_battle);
        setRole("guest");
        setListen(null);
        setSpot(null);
      } else if (!r.ok) showGoldAlert(chatReasonText(t, r.reason, r.message));
    } catch (e) {
      showGoldAlert((e as Error).message);
    } finally {
      setJoining(false);
      beat();
    }
  }

  // ---- leaving: the back arrow, or navigating away. Score stays; rejoin is possible. ----
  const leftRef = useRef(false);
  const leave = useCallback(() => {
    if (leftRef.current || roleRef.current !== "guest" || !myIdRef.current) return;
    leftRef.current = true;
    leaveChatBattle(myIdRef.current, contestId).catch(() => undefined);
  }, [contestId]);
  useEffect(() => () => leave(), [leave]);
  const goBack = useCallback(() => {
    roomHook.disconnect();
    if (location.key !== "default") navigate(-1); else navigate("/live", { replace: true });
  }, [roomHook, location.key, navigate]);
  const back = () => {
    if (isBattler && !ended && !window.confirm(t("chb_leave_confirm"))) return;
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
      if (!home) return;
      // Follow the home battler back to their live: every 3 s for up to 30 s.
      const started = Date.now();
      const look = async () => {
        if (!mountedRef.current) return;
        const r = await checkUserLiveRoom(home);
        if (r?.is_live && r.room_name && !r.chat_battle_contest_id) { go(`/live/${encodeURIComponent(r.room_name)}`); return; }
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
      if (alive && r?.is_live && r.room_name && !r.chat_battle_contest_id) navigate(`/live/${encodeURIComponent(r.room_name)}`, { replace: true });
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

  const pl = phaseLines(t, st, now);
  if (gone) {
    return (
      <div className="page cb-page" style={{ paddingTop: 10 }}>
        <CbHeader title={t("chb_title")} stage="" sub="" line={t("chb_ended")} onBack={goBack} backLabel={t("chb_back")} />
        <Notice>{t("chb_over")}</Notice>
      </div>
    );
  }
  if (!st) {
    return (
      <div className="page cb-page" style={{ paddingTop: 10 }}>
        <CbHeader title={t("chb_title")} stage="" sub="" line="" onBack={goBack} backLabel={t("chb_back")} />
        <Loading />
      </div>
    );
  }

  const me = st.me;
  const showJoin = !isBattler && me.can_join && !ended;
  const rejoin = me.is_battler && (me.left || !me.is_live);
  const joinLabel = joining ? t("chb_joining")
    : rejoin ? t("chb_rejoin")
    : st.phase === "joining" && st.phase_ends_at ? cbText(t("chb_join_in"), { time: clock(Date.parse(st.phase_ends_at) - now) })
    : t("cb_join");
  const giftRoom = st.room_name ?? "";
  // Round 2: the starter's bonus — "so far" while it runs, the paid figure at the end. Starter only.
  const bonus = me.starter_bonus;
  const bonusLabel = bonus
    ? cbText(t(bonus.paid ? "chb_starter_bonus" : "chb_starter_bonus_so_far"), { amount: bonusText(bonus.amount) })
    : null;
  return (
    <div className="page cb-page" style={{ paddingTop: 10 }}>
      <CbHeader title={t("chb_title")} stage={st.name} sub={pl.sub} line={pl.line}
        liveCount={st.live_count}
        scoreText={isBattler ? cbText(t("chb_my_score"), { n: (me.score ?? 0).toLocaleString() }) : null}
        backLabel={isBattler && !ended ? t("cb_leave") : t("chb_back")}
        onBack={back}
        actions={<>
          {bonusLabel && <span className="chb-bonus" title={cbText(t("chb_starter_bonus_terms"), { percent: bonus?.percent ?? 1, cap: bonusText(bonus?.cap ?? 25) })}>💰 {bonusLabel}</span>}
          <button className="btn small ghost" onClick={() => setBoardOpen(true)}>🏆 {t("leaderboard")}</button>
          {showJoin && <button className="btn small" onClick={join} disabled={joining}>{joinLabel}</button>}
        </>} />
      {roomHook.error && <Notice error>{roomHook.error}</Notice>}
      <StarredYouBar ids={awaitingBack} nameOf={(id) => nameOf(grid.byId.get(id))} onStarBack={(id) => grid.star.toggle(id)} />
      {tiles.length === 0
        ? <div className="card cb-empty">{ended ? t("chb_ended") : t("chb_waiting")}</div>
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
            const res = await sendChatBattleGift({ myId, toUserId: giftTarget, giftId: gift.id, roomName: giftRoom, contestId });
            lastGiftRef.current = res.status && res.chat_battle_gift && typeof res.chat_battle_gift === "object" ? res.chat_battle_gift as ChbGiftInfo : null;
            return res;
          }} />
      )}
      {boardOpen && (
        <SoloBattleStandingsSheet battle={{ id: contestId, name: st.name, starts_at: st.starts_at, ends_at: st.ends_at }}
          myUserId={myId || null} onClose={() => setBoardOpen(false)}
          rows={st.battlers.map((b) => ({ user_id: b.user_id, label: nameOf(b), username: b.username, profile_image: b.profile_image, score: b.score, location: b.left ? t("chb_left") : null }))}
          finished={st.finished} onPick={spotlight} footer={`${t("chb_tap_spotlight")} · ${t("scored_by_the_gift_coins_each_person_rec")}`} />
      )}
      {endShown && <ChatBattleEnd st={st} note={endNote} onClose={() => { afterPodium.current = true; mountedRef.current = false; leftRef.current = true; goBack(); }} />}
    </div>
  );
}

// ---- the demo (explainer video, and the 360-px check) ---------------------------------------

const DEMO_NAMES = [
  "maria santos", "juan dela cruz", "angel reyes", "mark bautista", "joy villanueva", "paolo garcia",
  "kristine mendoza", "jericho ramos", "liza fernandez", "carlo aquino", "bea castillo", "miguel torres",
  "nicole gonzales", "rafael navarro", "jasmine cruz", "enzo salazar", "trisha domingo", "kevin morales",
  "andrea lim", "gabriel tan", "camille flores", "joshua rivera", "sofia del rosario", "daniel lopez",
  "ella marquez", "renz pascual", "hannah ocampo", "lance santiago", "mika valdez", "ivan soriano",
];
const DEMO_CHAT = [
  ["joy villanueva", "go maria!! 🔥"], ["paolo garcia", "sending roses 🌹"], ["bea castillo", "from Cebu 👋"],
  ["kevin morales", "you got this"], ["andrea lim", "the gift box is on every tile 😍"],
];

function ChatBattleDemo({ n, withOwn, showEnd, imgBase }: { n: number; withOwn: boolean; showEnd: boolean; imgBase: string | null }) {
  const { t } = useT();
  const navigate = useNavigate();
  const now = useTick();
  const count = Math.max(1, Math.min(n, DEMO_NAMES.length));
  // More battlers than tiles at 24, so the rotation has someone to bring in.
  const total = count >= 24 ? DEMO_NAMES.length : count;
  const battlers = useMemo<ChbBattler[]>(() => DEMO_NAMES.slice(0, total).map((name, i) => ({
    user_id: 1001 + i, name, username: name.replace(/\s+/g, ""), profile_image: imgBase ? `${imgBase.replace(/\/?$/, "/")}${i + 1}.jpg` : null,
    score: Math.max(0, 4200 - i * 170 - (i % 3) * 40), rank: i + 1, is_live: true, left: false, is_starter: i === 0,
    home_room_name: null, chat_room_name: null,
  })), [total, imgBase]);
  const live = useMemo(() => battlers.map((b) => b.user_id), [battlers]);
  const [giftTarget, setGiftTarget] = useState<number | null>(null);
  const [spot, setSpot] = useState<number | null>(null);
  const [listen, setListen] = useState<number | null>(null);
  const [boardOpen, setBoardOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(showEnd);
  const grid = useChatBattleTiles({
    battlers, live, publishers: [], myId: withOwn ? 1001 : 0, isBattler: withOwn, home: withOwn ? null : 1001,
    giftTarget, spot, onPinFull: () => showGoldAlert(t("chb_pin_max")),
  });
  // One member who starred you, so the "talk back" banner is on camera; on a viewer's screen the
  // host (1001) has two stars, so the viewer hears three.
  const demoStarredMe = withOwn && grid.shown.length > 2 ? [grid.shown[2]].filter((id) => !grid.star.pins.includes(id)) : [];
  const demoHomeStars = withOwn ? [] : grid.shown.slice(0, 2);
  const demoHeard = heardIds({ isBattler: withOwn, pins: grid.star.pins, home: withOwn ? null : 1001, homeStars: demoHomeStars, spot, listen });
  const demoTiles = grid.tiles.map((x) => (demoStarredMe.includes(x.userId) ? { ...x, starredMe: true } : x));
  const left = 227 - (Math.floor(now / 1000) % 227);
  const messages: ChatMessage[] = DEMO_CHAT.map(([who, msg], i) => ({ id: `d${i}`, senderUserId: 2000 + i, senderName: who, message: msg, sentAt: i }));
  const fakeState: ChbState = {
    contest_id: 0, name: "Maria's Chat Battle", shared: true, phase: endOpen ? "ended" : "battle",
    server_now: "", created_at: "", starts_at: "", ends_at: "", phase_ends_at: null, room_name: null, room_open: true,
    starter: battlers[0], max_battlers: 24, battler_count: total, live_count: total, spaces_left: 0, can_join_now: false,
    battlers, live, winner: { ...battlers[0], score: battlers[0].score }, tie: false, finished: endOpen,
    me: { user_id: 1001, is_battler: withOwn, is_live: withOwn, left: false, score: withOwn ? battlers[0].score : null, rank: 1, home_room_name: null, can_join: false, join_reason: null },
  };
  return (
    <div className="page cb-page" style={{ paddingTop: 10 }}>
      <CbHeader title={t("chb_title")} stage={fakeState.name} sub={t("chb_battle_on")}
        line={cbText(t("cb_time_left"), { time: clock(left * 1000) })}
        liveCount={total}
        scoreText={withOwn ? cbText(t("chb_my_score"), { n: battlers[0].score.toLocaleString() }) : null}
        onBack={() => navigate("/battles")}
        actions={<>
          <button className="btn small ghost" onClick={() => setBoardOpen(true)}>🏆 {t("leaderboard")}</button>
          {!withOwn && <button className="btn small" onClick={() => showGoldAlert(t("chb_full"))}>{cbText(t("chb_join_in"), { time: "1:42" })}</button>}
        </>} />
      <StarredYouBar ids={demoStarredMe} nameOf={(id) => nameOf(grid.byId.get(id))} onStarBack={(id) => grid.star.toggle(id)} />
      <CountryBattleGrid stage={grid.stage} tiles={demoTiles} listen={demoHeard} reserve={CHAT_RESERVE} phoneFullWidth
        onTap={(id) => {
          if (withOwn) grid.star.toggle(id);
          else if (id !== 1001) setListen((cur) => (cur === id ? null : id));
        }}
        onGift={(id) => { setGiftTarget(id); setTimeout(() => setGiftTarget(null), 4000); }} />
      <ChatStrip messages={messages} onSend={() => undefined} />
      {boardOpen && (
        <SoloBattleStandingsSheet battle={{ id: 0, name: fakeState.name }} myUserId={null} onClose={() => setBoardOpen(false)}
          rows={battlers.map((b) => ({ user_id: b.user_id, label: nameOf(b), score: b.score, profile_image: b.profile_image }))}
          finished={false} footer={t("chb_tap_spotlight")}
          onPick={(r) => {
            const id = Number(r.user_id);
            setBoardOpen(false);
            setSpot(id); sfx.reveal();
            setTimeout(() => setSpot((s) => (s === id ? null : s)), SPOTLIGHT_MS);
          }} />
      )}
      {endOpen && <ChatBattleEnd st={fakeState} note={withOwn ? t("chb_back_to_live") : cbText(t("chb_following"), { name: battlers[0].name ?? "" })} onClose={() => setEndOpen(false)} />}
    </div>
  );
}
