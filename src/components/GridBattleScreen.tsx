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
import { displayName, giftPrice, mediaUrl, post, type ApiResponse, type Gift } from "../lib/api";
import { useSession } from "../lib/session";
import { useT } from "../lib/i18n";
import { GiftSheet } from "./GiftSheet";
import { Loading, Notice } from "./Common";
import { showGoldAlert } from "./GoldToast";
import { Confetti, Podium } from "./GameShow";
import { SoloBattleStandingsSheet } from "./SoloBattle";
import { CbHeader, CountryBattleGrid, StarredYouBar, heardIds, useRotation, useStarPins, useStarSignals, type CbTileData } from "./BattleGrid";
import { useCountryBattleRoom } from "../lib/countryBattleRoom";
import { cbText, countShape, gridShape, serverNow, useTick } from "../lib/countryBattle";
import { chatChannel, ensureFirebaseSignIn, observeChat, observeLiveCaption, sendChat, type ChatMessage } from "../lib/firebase";
import { haptic, sfx, stopGameSounds } from "../lib/gameSounds";
import {
  battleScreenPath, bonusText, chatBattleStage, checkUserLiveRoom, parseGiftMsg, roomHostId,
  type ChbBattler, type ChbGiftInfo, type ChbGiftMsg, type ChbLiveRoom, type ChbPerson, type ChbResult, type ChbState,
} from "../lib/chatBattle";
import { requireVerified } from "../lib/verifyEmail";
import { makeBinggBonusWatcher } from "../lib/binggBonus";
import { BinggBonusOverlay } from "./BinggBonusOverlay";
import { FishHostControls, LiveFishOverlay } from "./LiveFishOverlay";
import { TapTapBurst, isTapTapGift, tapTapBurstDuration } from "./TapTapBurst";
import { loadGifts } from "../lib/gifts";
import { ACTION_BAR_RESERVE, BattleActionBar, BattlesMenu } from "./BattleActionBar";
import { PickerSheet } from "./PickerSheet";
import { TRANSLATION_LANGUAGES, defaultTargetLanguage, translateChatMessage, type TranslationResult } from "../lib/translate";

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
  /** More on the end screen under the podium (Country Battle: "Share my result"). `hold` keeps the
   *  member on the end screen — the trip home after the podium is skipped once they press it. */
  endExtra?: (st: ChbState, hold: () => void) => ReactNode;
}

// ---- gift visibility (Steve, 2026-11-03: "Who ever is gifing a gift they will be able to see the
// gift as well as the member that received the gift so they can thank you for the gift.") -------

/** One gift line on screen: the sender's "You sent 🌹 to @jimmy", or the receiver's "@sam sent
 *  you 🌹 — say thanks!" with a Thank you button. */
interface GiftNoteData {
  /** "thanks": the receiver's Thank you, back on the GIFTER's screen (Steve, 2026-11-21: "the
   *  Thank you is not reaching the gifter") — `who` thanked me, `giftName` is their whole line. */
  kind: "sent" | "got" | "thanks";
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
    <div className={`chb-gift-note ${note.kind === "thanks" ? "got" : note.kind}`} role="status">
      <span className="chb-gn-text">
        {note.kind === "thanks" ? <>💛 <b>{note.who}</b>: {note.giftName}</>
          : note.kind === "sent" ? tn("chb_gift_you_sent", gift, note.who) : tn("chb_gift_sent_you", note.who, gift)}
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
    noteTimer.current = window.setTimeout(() => setNote((cur) => (cur?.key === key ? null : cur)), n.kind === "sent" ? SENT_NOTE_MS : GOT_NOTE_MS);
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
    message: t("chb_gift_line", msg.from_name || "?", msg.to_name || "?", giftLabel(msg.gift_name, msg.count)),
    sentAt: Date.now(),
  };
}

/** "Rose ×100" for a Bongg Burst gift (one icon per BB it costs), else just the name. Steve,
 *  2026-11-21: "When i give 100 roses it's only showing one rose". */
function giftLabel(name: string | null | undefined, count?: number): string {
  const n = name || "🎁";
  return count && count > 1 ? `${n} ×${count.toLocaleString()}` : n;
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
  /** Country Battle: the grid's shape follows the tile count, 2 to 24 (countShape). */
  byCount?: boolean;
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
  const shape = input.byCount ? countShape(total) : gridShape(stage);
  const { cap } = shape;
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
  return { tiles, stage, shape, shown, pinnedId, star, byId, pool };
}

/** The live chat of one room, read from Firestore like the live room's. */
function useRoomChat(room: string | null, enabled: boolean, myId: number | null): ChatMessage[] {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const myIdRef = useRef(myId);
  myIdRef.current = myId;
  useEffect(() => {
    setMessages([]);
    if (!room || !enabled) return;
    let unsub: (() => void) | null = null;
    let cancelled = false;
    // Bingg Bongg Bonus lines are played (gloves + banner), never shown as chat (lib/binggBonus).
    const bonusLines = makeBinggBonusWatcher(() => myIdRef.current);
    ensureFirebaseSignIn()
      .then(() => { if (!cancelled) unsub = observeChat(chatChannel(room, roomHostId(room)), (all) => setMessages(bonusLines(all)), () => undefined); })
      .catch(() => undefined);
    return () => { cancelled = true; unsub?.(); };
  }, [room, enabled]);
  return messages;
}

/** The small strip under the tiles: the home battler's own viewers' chat (Steve: "each battler
 *  keeps their OWN viewers' chat in a small strip under the tiles"). */
export function ChatStrip({ messages, onSend, note, inputRef, translations }: {
  messages: ChatMessage[]; onSend: ((text: string) => void) | null; note?: ReactNode;
  /** The bar's Messages icon focuses this input. */
  inputRef?: React.RefObject<HTMLInputElement | null>;
  /** MT: each line's translation, shown after the original when it differs. */
  translations?: Record<string, TranslationResult>;
}) {
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
              {m.senderUserId < 0 ? <>🎁 {m.message}</> : <><b>{m.senderName}</b>{m.stickerUrl ? "🖼️" : m.message}{trOf(translations?.[m.id], m.message)}</>}
            </div>
          ))}
      </div>
      {onSend && (
        <form onSubmit={(e) => { e.preventDefault(); const v = draft.trim(); if (v) { onSend(v); setDraft(""); } }}>
          <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("say_something")} maxLength={300} aria-label={t("say_something")} />
          <button className="btn small" type="submit" disabled={!draft.trim()}>{t("send")}</button>
        </form>
      )}
    </div>
  );
}

/** " → the translation", only when it says something different. */
function trOf(tr: TranslationResult | undefined, original: string): ReactNode {
  const text = tr?.translated;
  if (!text || text.trim().toLowerCase() === original.trim().toLowerCase()) return null;
  return <span className="chb-tr">→ {text}</span>;
}

/** MT on the battle's chat strip — the live room's Message Translation, same picker, same saved
 *  choice on this browser (bb.mtLang), same server call. */
function useStripTranslation(messages: ChatMessage[], enabled: boolean) {
  const [mtLang, setMtLang] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem("bb.mtLang");
      if (saved !== null) return saved || null;
    } catch { /* private window */ }
    return defaultTargetLanguage();
  });
  const [translations, setTranslations] = useState<Record<string, TranslationResult>>({});
  const asked = useRef<Set<string>>(new Set());
  const pick = useCallback((code: string) => {
    setMtLang(code || null);
    try { localStorage.setItem("bb.mtLang", code); } catch { /* ignore */ }
    asked.current = new Set();
    setTranslations({});
  }, []);
  useEffect(() => {
    if (!mtLang || !enabled) return;
    let alive = true;
    for (const m of messages.slice(-30)) {
      if (m.senderUserId < 0 || m.stickerUrl || !m.message.trim() || asked.current.has(m.id)) continue;
      asked.current.add(m.id);
      translateChatMessage(m.message, mtLang).then((r) => {
        if (alive && r) setTranslations((prev) => (prev[m.id] ? prev : { ...prev, [m.id]: r }));
      });
    }
    return () => { alive = false; };
  }, [messages, mtLang, enabled]);
  return { mtLang, translations, pick };
}

/** The end: confetti, the podium (Country Battle: the server's top 3), the winner (or "Tie!"),
 *  and where you are being taken. */
export function GridBattleEnd({ st, note, onClose, extra }: { st: ChbState; note: string | null; onClose: () => void; extra?: ReactNode }) {
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
        {extra}
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
  // Leaving the live (or this battle screen) silences every game sound still ringing (Steve, 2026-11-18).
  useEffect(() => stopGameSounds, []);
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
  /** A battler's heartbeat refused with "full": over the server's quiet cap (Steve, 2026-11-04 —
   *  advertised as no limit). The popup, then the screen closes. */
  const [overLimit, setOverLimit] = useState(false);
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
    else if (r.reason === "full" && roleRef.current === "guest") setOverLimit(true);
  }, []);
  useEffect(() => {
    if (gone || overLimit) return;
    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [beat, gone, overLimit, battleId]);
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
    byCount: source.kind === "country",
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
  // A Bongg Burst gift (100 roses for a 100-BB rose) bursts over the battle screen as in the live
  // room, for the sender, the receiver and the receiver's own viewers — no longer one rose.
  const [burst, setBurst] = useState<{ gift: Gift; key: number } | null>(null);
  const burstTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(burstTimer.current), []);
  const playBurst = useCallback((gift: Gift) => {
    window.clearTimeout(burstTimer.current);
    const key = Date.now();
    setBurst({ gift, key });
    burstTimer.current = window.setTimeout(() => setBurst((cur) => (cur?.key === key ? null : cur)), tapTapBurstDuration(gift));
  }, []);
  const giftsRef = useRef<Promise<Gift[]> | null>(null);
  /** The full gift (its effect flags) for a cb_gift, which carries only the id. */
  const giftById = useCallback(async (id: number): Promise<Gift | null> => {
    giftsRef.current ??= loadGifts().catch(() => { giftsRef.current = null; return []; });
    return (await giftsRef.current).find((g) => g.id === id) ?? null;
  }, []);
  /** The gift the receiver's Thank you is for. */
  const thankRef = useRef<ChbGiftMsg | null>(null);
  const addLine = useCallback((msg: ChbGiftMsg) => setLocalLines((cur) => [...cur.slice(-19), giftLine(t, msg)]), [t]);
  /** A cb_gift from the room: the receiver gets "say thanks!", the receiver's own viewers get the
   *  line in their strip, everyone else ignores it. */
  const onGiftData = async (payload: unknown) => {
    const parsed = parseGiftMsg(payload);
    if (!parsed || parsed.from_user_id === myIdRef.current) return;
    const mine = roleRef.current === "guest" && parsed.to_user_id === myIdRef.current;
    if (!mine && !(stripOwnerRef.current && parsed.to_user_id === stripOwnerRef.current)) return;
    const full = parsed.gift_id ? await giftById(parsed.gift_id) : null;
    const isBurst = !!full && isTapTapGift(full);
    const msg = isBurst ? { ...parsed, count: parsed.coins ?? giftPrice(full) } : parsed;
    if (isBurst) playBurst(full);
    if (roleRef.current === "guest" && msg.to_user_id === myIdRef.current) {
      giftShow.popTile(msg.to_user_id, msg.icon_url ?? null);
      giftShow.showNote({ kind: "got", who: msg.from_name || "?", giftName: giftLabel(msg.gift_name, msg.count), icon: msg.icon_url ?? null });
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
    if (topic === "cb_gift") void onGiftData(payload);
    else if (topic === "cb_thanks") onThanksData(payload);
    else signals.onData(topic, payload, from);
  };
  /** A receiver's Thank you, sent to the whole room; only the gifter it names shows it. */
  const onThanksData = (payload: unknown) => {
    const p = (payload ?? {}) as Record<string, unknown>;
    if (Number(p.to_user_id) !== myIdRef.current || !myIdRef.current) return;
    giftShow.showNote({ kind: "thanks", who: String(p.from_name || "?"), giftName: String(p.line || "💛"), icon: null });
    sfx.reveal();
    haptic([30, 40, 30]);
  };
  /** What the last confirmed tile gift answered (chat_battle_gift / country_battle_gift), for onSent. */
  const lastGiftRef = useRef<ChbGiftInfo | null>(null);
  const onGiftSent = (toUserId: number, gift: Gift) => {
    const info = lastGiftRef.current;
    lastGiftRef.current = null;
    const icon = info?.icon_url ?? (gift.image ? gift.image : null);
    const receiver = info?.receiver ?? grid.byId.get(toUserId) ?? null;
    const count = isTapTapGift(gift) ? info?.cb_gift?.coins ?? giftPrice(gift) : undefined;
    if (count) playBurst(gift);
    giftShow.popTile(toUserId, icon);
    giftShow.showNote({ kind: "sent", who: handleOf(receiver), giftName: giftLabel(info?.gift_name ?? gift.name, count), icon });
    // Published only once the server confirmed the gift (GiftSheet calls onSent on status:true).
    if (info?.cb_gift) {
      roomHook.sendData("cb_gift", info.cb_gift);
      if (toUserId === stripOwnerRef.current) addLine({ ...info.cb_gift, count, from_name: info.cb_gift.from_name ?? displayName(user ?? undefined) });
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
  useEffect(() => {
    if (!overLimit) return;
    leave();
    roomHook.disconnect();
    showGoldAlert(srcRef.current.reasonText("full"), goBack);
  }, [overLimit]); // eslint-disable-line react-hooks/exhaustive-deps
  const back = () => {
    if (isBattler && !ended && !window.confirm(source.leaveConfirm)) return;
    leave();
    goBack();
  };
  /** The Battles menu's other pages: a battler leaves the battle first, as with the back arrow. */
  const leaveTo = (path: string) => {
    if (isBattler && !ended && !window.confirm(source.leaveConfirm)) return;
    leave();
    roomHook.disconnect();
    navigate(path);
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
  /** The member pressed something on the end screen (Share my result): stay there. */
  const holdEnd = useRef(false);
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  useEffect(() => {
    if (!endShown || !sawRunning.current || afterPodium.current) return;
    afterPodium.current = true;
    const go = (to: string) => { if (mountedRef.current) navigateRef.current(to, { replace: true }); };
    window.setTimeout(async () => {
      if (!mountedRef.current || holdEnd.current) return;
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
  const threadMessages = useRoomChat(chatRoom, isLoggedIn, myId || null);
  const messages = useMemo(() => mergeLines(threadMessages, localLines), [threadMessages, localLines]);
  // ---- the bottom bar (the live room's icons): Battles · Messages · MT · Flip ----
  const [battlesOpen, setBattlesOpen] = useState(false);
  const [mtOpen, setMtOpen] = useState(false);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const mt = useStripTranslation(messages, isLoggedIn);
  // ---- the rest of the live room's bar (Steve, 2026-11-21: "I want them to see and use all the
  // icons we have available to use. Please add the rest of the icons to the country battle.") ----
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [giftsOpen, setGiftsOpen] = useState(false);
  // CC: the captions of whoever this screen hears (their phone's "Captions" switch), in my language.
  const [ccOn, setCcOn] = useState(false);
  const [caption, setCaption] = useState("");
  const ccSpeaker = isBattler ? (grid.star.pins[0] ?? null) : (listen ?? home ?? null);
  const ccRoom = ccSpeaker ? (st?.battlers.find((b) => b.user_id === ccSpeaker)?.chat_room_name ?? st?.room_name ?? null) : null;
  const ccLang = mt.mtLang;
  useEffect(() => {
    setCaption("");
    if (!ccOn || !ccSpeaker || !ccRoom || !isLoggedIn || ccSpeaker === myId) return;
    let alive = true;
    let unsub: (() => void) | null = null;
    let hideTimer = 0;
    const target = ccLang ?? defaultTargetLanguage();
    ensureFirebaseSignIn().then(() => {
      if (!alive) return;
      unsub = observeLiveCaption(ccRoom, ccSpeaker, (text, isFinal, updatedAt) => {
        if (Date.now() - updatedAt > 15000) return;
        window.clearTimeout(hideTimer);
        setCaption(text);
        hideTimer = window.setTimeout(() => { if (alive) setCaption(""); }, 6000);
        if (isFinal && target) {
          translateChatMessage(text, target).then((r) => {
            if (alive && r?.translated) setCaption((cur) => (cur === text ? r.translated : cur));
          });
        }
      });
    }).catch(() => undefined);
    return () => { alive = false; unsub?.(); window.clearTimeout(hideTimer); };
  }, [ccOn, ccSpeaker, ccRoom, isLoggedIn, myId, ccLang]);
  /** Share & Earn 10%: my own invite link (the referral program), with the battle. */
  const shareBattle = () => {
    const code = (user?.username ?? "").trim();
    const url = code ? `https://binggbongg.com/invite/${encodeURIComponent(code)}` : "https://binggbongg.com/country-battles";
    const text = `${source.title} · Bingg Bongg`;
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) { nav.share({ title: text, text, url }).catch(() => undefined); return; }
    navigator.clipboard?.writeText(`${text}\n${url}`).then(() => showGoldAlert(t("link_copied")), () => undefined);
  };
  const onSend = isLoggedIn && user && chatRoom
    ? (text: string) => { if (!requireVerified()) return; sendChat(chatChannel(chatRoom, roomHostId(chatRoom)), user.id, displayName(user), text, user.profile_image ?? "").catch(() => undefined); }
    : null;
  // The receiver's Thank you: an ordinary chat line in their own strip, nothing more to the server.
  const onThank = onSend
    ? () => {
      const g = thankRef.current;
      if (g) {
        const line = t("chb_thanks_line", g.from_name || "", giftLabel(g.gift_name, g.count));
        onSend(line);
        // ...and to the gifter, who watches a different chat (Steve, 2026-11-21: "the Thank you is
        // not reaching the gifter"). Everyone gets it; only to_user_id shows it.
        roomHook.sendData("cb_thanks", { from_user_id: myId, from_name: displayName(user ?? undefined), to_user_id: g.from_user_id, gift_id: g.gift_id, line });
      }
      giftShow.closeNote();
    }
    : null;

  if (gone) {
    return (
      <div className="page cb-page" style={{ paddingTop: 10 }}>
        <CbHeader title={source.title} stage="" sub="" line={t("chb_ended")} onBack={goBack} backLabel={t("chb_back")} bonus={false} />
        <Notice>{source.goneText(gone)}</Notice>
      </div>
    );
  }
  if (!st) {
    return (
      <div className="page cb-page" style={{ paddingTop: 10 }}>
        <CbHeader title={source.title} stage="" sub="" line="" onBack={goBack} backLabel={t("chb_back")} bonus={false} />
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
  const fishStreamer = homeRow?.chat_room_name ? roomHostId(homeRow.chat_room_name) || homeRow.user_id : 0;
  // Chat Battle round 2: the starter's bonus — "so far" while it runs, the paid figure at the end. Starter only.
  const bonus = me.starter_bonus;
  const bonusLabel = bonus
    ? cbText(t(bonus.paid ? "chb_starter_bonus" : "chb_starter_bonus_so_far"), { amount: bonusText(bonus.amount) })
    : null;
  return (
    <div className="page cb-page" style={{ paddingTop: 10 }}>
      <CbHeader isTest={!!st.is_test} title={source.title} stage={st.name} sub={pl.sub} line={pl.line}
        bonus={!ended} bonusBump={giftShow.note?.kind === "got" ? giftShow.note.key : 0}
        liveCount={st.phase === "upcoming" ? null : st.live_count}
        scoreText={isBattler ? cbText(t("chb_my_score"), { n: (me.score ?? 0).toLocaleString() }) : null}
        backLabel={isBattler && !ended ? t("cb_leave") : t("chb_back")}
        onBack={back}
        actions={<>
          {bonusLabel && <span className="chb-bonus" title={cbText(t("chb_starter_bonus_terms"), { percent: bonus?.percent ?? 1, cap: bonusText(bonus?.cap ?? 25) })}>💰 {bonusLabel}</span>}
          {st.phase !== "upcoming" && <button className="btn small ghost" onClick={() => setBoardOpen(true)}>🏆 {t("leaderboard")}</button>}
          {showJoin && <button className="btn small" onClick={join} disabled={joining}>{joinLabel}</button>}
          {/* Catch the Fish: a battler is a streamer — their switch and who caught it in their own room. */}
          {isBattler && !demoUserId && myId > 0 && meRow?.chat_room_name && <FishHostControls myId={myId} roomName={meRow.chat_room_name} messages={threadMessages} />}
        </>} />
      {joinNote && <div className="cb-join-note" role="status">{joinNote}</div>}
      {roomHook.error && <Notice error>{roomHook.error}</Notice>}
      <StarredYouBar ids={awaitingBack} nameOf={(id) => nameOf(grid.byId.get(id))} onStarBack={(id) => grid.star.toggle(id)} />
      {/* No "Waiting for members to go live" box any more (Steve, 2026-11-21: "please remove this
          banner") — the header already says when the room opens and the battle starts. */}
      {tiles.length === 0
        ? (ended ? <div className="card cb-empty">{t("chb_ended")}</div> : null)
        : (
          <CountryBattleGrid stage={grid.stage} shape={source.kind === "country" ? grid.shape : undefined} tiles={giftShow.withGift(tiles)} listen={heardNow} reserve={CHAT_RESERVE + ACTION_BAR_RESERVE} phoneFullWidth
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
      <ChatStrip messages={messages} onSend={onSend} inputRef={chatInputRef} translations={mt.mtLang ? mt.translations : undefined}
        note={giftShow.note && <GiftNote key={giftShow.note.key} note={giftShow.note} onThank={onThank} onClose={giftShow.closeNote} />} />
      <BattleActionBar
        onBattles={() => setBattlesOpen(true)}
        onMessages={() => {
          if (!isLoggedIn) { navigate("/login", { state: { from: location.pathname + location.search } }); return; }
          chatInputRef.current?.focus();
          chatInputRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }}
        onMt={() => setMtOpen(true)} mtOn={!!mt.mtLang}
        onFlip={isBattler && !demoUserId ? () => { roomHook.flipCamera().then((ok) => { if (!ok) showGoldAlert(t("cb_camera_needed")); }); } : null}
        onCc={() => setCcOn((on) => !on)} ccOn={ccOn}
        onCamera={isBattler && !demoUserId ? () => { const next = !camOn; roomHook.setCamera(next).then((ok) => { if (ok) setCamOn(next); }); } : null} cameraOn={camOn}
        onMic={isBattler && !demoUserId ? () => { const next = !micOn; roomHook.setMic(next).then((ok) => { if (ok) setMicOn(next); }); } : null} micOn={micOn}
        joinLabel={showJoin ? joinLabel : null} onJoin={join}
        onGifts={() => {
          if (isBattler) { setGiftsOpen(true); return; }
          if (!isLoggedIn) { navigate("/login", { state: { from: location.pathname + location.search } }); return; }
          // The battler this screen hears, the one followed in, else the first one on screen.
          const who = [listen, home, ...shown].find((id): id is number => typeof id === "number" && id > 0 && id !== myId);
          if (who) setGiftTarget(who);
        }}
        onShare={shareBattle} />
      {caption && <div className="cb-caption" role="status">{caption}</div>}
      {giftsOpen && (
        <div className="cb-menu-backdrop" onClick={() => setGiftsOpen(false)} role="dialog" aria-modal="true">
          <div className="cb-menu" onClick={(e) => e.stopPropagation()}>
            <div className="cb-menu-title">🎁 {t("gifts")}</div>
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              {messages.filter((m) => m.senderUserId < 0 || m.senderName === "🎁").slice().reverse().map((m) => (
                <div key={m.id} className="cb-menu-row" style={{ cursor: "default" }}><span>{m.message}</span></div>
              ))}
              {!messages.some((m) => m.senderUserId < 0 || m.senderName === "🎁") && <div style={{ textAlign: "center", color: "#aaa", padding: 12 }}>—</div>}
            </div>
            <button type="button" className="btn ghost" style={{ width: "100%", marginTop: 4 }} onClick={() => setGiftsOpen(false)}>{t("close")}</button>
          </div>
        </div>
      )}
      {battlesOpen && (
        <BattlesMenu showLeaderboard={st.phase !== "upcoming"} onClose={() => setBattlesOpen(false)}
          onLeaderboard={() => { setBattlesOpen(false); setBoardOpen(true); }}
          onAllCountries={() => { setBattlesOpen(false); leaveTo("/country-battles"); }}
          onAllBattles={() => { setBattlesOpen(false); leaveTo("/battles"); }} />
      )}
      {mtOpen && (
        <PickerSheet title={t("message_translation")} noun="language" selected={mt.mtLang ?? ""}
          items={[{ code: "", name: "None — show messages exactly as sent" },
            ...TRANSLATION_LANGUAGES.map((l) => ({ code: l.code, name: `${l.name} · ${l.native}` }))]}
          onPick={(code) => { mt.pick(code); setMtOpen(false); }} onClose={() => setMtOpen(false)} />
      )}
      <BinggBonusOverlay />
      {burst && <TapTapBurst key={burst.key} gift={burst.gift} />}
      {/* Catch the Fish (Steve, 2026-11-07): a viewer's fish is a gift to the battler whose room
          they came in through (their home battler's own live room), never a battle gift. */}
      <LiveFishOverlay streamerId={fishStreamer} roomName={homeRow?.chat_room_name ?? ""}
        streamerName={homeRow ? handleOf(homeRow) : ""} active={!isBattler && !demoUserId && !ended && fishStreamer > 0} />
      {giftTarget != null && (
        <GiftSheet
          onClose={() => setGiftTarget(null)}
          onSent={(gift) => { if (!isTapTapGift(gift)) setFlash({ userId: giftTarget, gift }); onGiftSent(giftTarget, gift); beat(); }}
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
      {endShown && <GridBattleEnd st={st} note={endNote} extra={source.endExtra?.(st, () => { holdEnd.current = true; })} onClose={() => { afterPodium.current = true; mountedRef.current = false; leftRef.current = true; goBack(); }} />}
    </div>
  );
}
