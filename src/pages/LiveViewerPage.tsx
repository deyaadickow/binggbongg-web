import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { displayName, giftPrice, mediaUrl, post, type Gift, type UserSummary } from "../lib/api";
import { TapTapBurst, isTapTapGift, tapTapBurstDuration } from "../components/TapTapBurst";
import { useSession } from "../lib/session";
import { chatChannel, ensureFirebaseSignIn, observeChat, sendChat, type ChatMessage } from "../lib/firebase";
import { useLiveRoom, type LiveRole, type LiveTile } from "../lib/live";
import { activeBoxingWindow, useBattle, type BattleData } from "../lib/battle";
import { VIRTUAL, fetchVirtualGiftRecord, sendVirtualThankYou, startVirtualBattle, type VirtualBattleData, type VirtualGiftRecord, type VirtualParticipant, FIVE_FIVE_FIVE, MARATHON, SERIES, TWO_V_TWO, cancel555, createSeries, finalize2v2, finalizeSeriesRound, invite2v2, invite555, inviteMarathon, secondsUntil, useEngine, voteMarathonCancel, type B555Data, type Battle2v2Data, type MarathonData, type SeriesData } from "../lib/battles";
import { B555Strip, BattleMenu, InviteCard, MarathonStrip, MultiPicker, Overlay, ResultOverlay, SeriesStrip, TwoVTwoPicker, TwoVTwoStrip, VirtualGiftRecordOverlay, VirtualPicker, VirtualStrip, describe2v2Invite, personName, resultTitle, type BattleKind } from "../components/BattleEngines";
import { Challenge31Overlay, LifetimeBoardOverlay, PkContestsOverlay, PunishmentsOverlay } from "../components/BattleReference";
import { BingoBoardOverlay, BingoOverlay, BingoStartDialog, BingoWinnersOverlay } from "../components/BingoOverlay";
import { OneStrokeOverlay } from "../components/OneStrokeOverlay";
import { BlockEscapeOverlay } from "../components/BlockEscapeOverlay";
import { BINGO_FALLBACK, bingoClamp, buyBingoSquare, cancelBingoBattle, fetchBingoGame, startBingoBattle, type BingoGame } from "../lib/bingo";
import { cancelPyramidBattle, fetchPyramidGame, sendPyramidFlowers, startPyramidBattle, type PyramidGame } from "../lib/pyramid";
import { PyramidOverlay, PyramidStartDialog } from "../components/PyramidOverlay";
import { buyBoardPowerup, cancelBoardGame, fetchBoardGame, makeBoardMove, resignBoardGame, startBoardGame, type BoardGame, type BoardKind } from "../lib/boardgame";
import { BOARD_TITLE, BoardGameOverlay, BoardGameStartDialog } from "../components/BoardGameOverlay";
import { fetchActiveTapGame, gameTitle, type TapGameType } from "../lib/tapgame";
import { TapGameOverlay } from "../components/TapGameOverlay";
import { HostGamesMenu } from "../components/HostGamesMenu";
import { SoloBattleStandingsSheet, SoloBattleStrip } from "../components/SoloBattle";
import { fetchActiveSoloBattle, startSoloBattle, type SoloBattle } from "../lib/solobattle";
import { Avatar, Notice } from "../components/Common";
import { InviteOverlay, WhosPlayingOverlay } from "../components/RoomPeople";
import { PickerSheet } from "../components/PickerSheet";
import { TRANSLATION_LANGUAGES, defaultTargetLanguage, languageName, translateChatMessage, type TranslationResult } from "../lib/translate";
import { tt, useT  } from "../lib/i18n";

interface Member { user_id: number; fullname?: string; username?: string; profile_image?: string; country?: string }
interface RoomMembers { host_user_id: number; host_fullname?: string; host_username?: string; host_profile_image?: string; host_country?: string; guests: Member[] }
interface JoinRequest { request_id: number; user_id: number; fullname?: string; username?: string; profile_image?: string }

const HEARTBEAT_MS = 20000;
const MEMBERS_POLL_MS = 5000;

/** One page for every role: viewer (default), guest (after the host approves), host (?host=1). */
export function LiveViewerPage() {
  const { t, tn } = useT();
  const { room: roomParam } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const roomName = decodeURIComponent(roomParam ?? "");
  const { user, isLoggedIn, refresh } = useSession();
  const hostUserId = useMemo(() => Number(roomName.match(/^bb-(?:live|priv)-(\d+)-\d+$/)?.[1] ?? 0), [roomName]);
  const wantsHost = search.get("host") === "1" && !!user && user.id === hostUserId;

  const [role, setRole] = useState<LiveRole>(wantsHost ? "host" : "viewer");
  const [members, setMembers] = useState<RoomMembers | null>(null);
  const [roomClosed, setRoomClosed] = useState(false);
  const [watchers, setWatchers] = useState<number | null>(null);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [joinState, setJoinState] = useState<"none" | "requested" | "approved">("none");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [giftTarget, setGiftTarget] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Favourite streamers (Steve, 2026-10-07). Private, silent, and deliberately NOT Follow:
  // follow is about being told, favourite is about ordering what you see on Live Now.
  const [isFavourite, setIsFavourite] = useState(false);
  const [favBusy, setFavBusy] = useState(false);
  const [favExplainer, setFavExplainer] = useState(false);
  const holdTimer = useRef<number | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // Auto Voice Thanks — TTS settings loaded from the backend for the host.
  const [voiceThanksGift, setVoiceThanksGift] = useState(true);
  // Raw TTS voice settings needed to call synthesizeSpeech with the host's own voice preference.
  const ttsVoiceRef = useRef<{ voiceType: string; language: string; volume: number; enabled: boolean; filter: string; minCoins: number; blacklistWords: string }>({ voiceType: "male_deep", language: "en-US", volume: 1, enabled: true, filter: "", minCoins: 0, blacklistWords: "[]" });
  // Tracks the sentAt watermark so we only fire for NEW gift messages, not replayed history.
  const lastSeenGiftSentAtRef = useRef<number>(Date.now());
  // Steve, 2026-10-14: "add the effects to the web too." Every gift that lands in this room's
  // chat plays on the video for EVERYONE here — the six effects (Bongg Burst, Rainfall, the two
  // Handers, Surprise, Universal) through TapTapBurst, and a plain gift as the card the phones
  // show. Until now the web live room showed nothing for a gift but the sender's own toast;
  // TapTapBurst only ever ran on feed gifts. One at a time, in arrival order, like Android's
  // queueGiftOverlay. Baselined at open so the chat history does not replay on entry; this ref
  // is separate from lastSeenGiftSentAtRef, which belongs to the host's voice thank-you.
  type GiftEffect = { key: string; gift: Gift | null; text: string };
  const seenGiftEffectSentAtRef = useRef<number>(Date.now());
  const [giftEffectQueue, setGiftEffectQueue] = useState<GiftEffect[]>([]);
  const [giftEffect, setGiftEffect] = useState<GiftEffect | null>(null);
  useEffect(() => {
    const fresh = messages.filter((m) => m.senderUserId < 0 && m.sentAt > seenGiftEffectSentAtRef.current);
    if (fresh.length === 0) return;
    seenGiftEffectSentAtRef.current = Math.max(...fresh.map((m) => m.sentAt));
    setGiftEffectQueue((q) => [...q, ...fresh.map((m) => ({
      key: `${m.id}-${m.sentAt}`,
      // A gift chat line carries its gift as a NEGATIVE sender id — see postGiftMessage on the phones.
      gift: gifts.find((g) => Number(g.id) === -m.senderUserId) ?? null,
      text: m.message,
    }))]);
  }, [messages, gifts]);
  useEffect(() => {
    if (giftEffect || giftEffectQueue.length === 0) return;
    const [next, ...rest] = giftEffectQueue;
    setGiftEffectQueue(rest);
    setGiftEffect(next);
    const burst = next.gift ? isTapTapGift(next.gift) : false;
    // A video gift ends itself (onEnded below); 20s is only a safety cap.
    const hasVideo = !burst && !!next.gift?.video;
    const t = setTimeout(() => setGiftEffect(null), burst && next.gift ? tapTapBurstDuration(next.gift) : hasVideo ? 20000 : 3200);
    return () => clearTimeout(t);
  }, [giftEffect, giftEffectQueue]);

  const live = useLiveRoom(roomName, role, isLoggedIn && !roomClosed);
  const isPublisher = role !== "viewer" && live.status === "live";

  // Bingg Bongg Battle (1v1). Result overlay for the two battlers, a toast for everyone else.
  const [battleResult, setBattleResult] = useState<BattleData | null>(null);
  const [sharingRecap, setSharingRecap] = useState(false);
  /**
   * Battle Recap (Steve, 2026-10-07). The share SENTENCE comes from the server rather than being
   * written here, so Android, iOS and the web cannot drift into three different sentences for the
   * same thing. Uses the Web Share sheet on a phone and falls back to the clipboard on a desktop,
   * where navigator.share mostly does not exist.
   */
  // Fetched once so the heart is right before anyone clicks it, rather than drawing hollow and
  // correcting itself a moment later.
  useEffect(() => {
    if (!user?.id || !hostUserId || role === "host") return;
    let alive = true;
    post<{ user_id: number }[]>("fetchFavouriteStreamers", { user_id: user.id })
      .then((res) => {
        if (!alive || !res.status) return;
        setIsFavourite((res.data ?? []).some((f) => f.user_id === hostUserId));
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [user?.id, hostUserId, role]);

  const toggleFavourite = useCallback(async () => {
    if (!user?.id || !hostUserId || favBusy) return;
    setFavBusy(true);
    try {
      // is_favourite comes back at the TOP level, not inside data — ApiResponse carries
      // `& Record<string, unknown>` for exactly this.
      const res = await post("toggleFavouriteStreamer",
        { user_id: user.id, streamer_user_id: hostUserId });
      // Drawn from the SERVER's answer, never an optimistic flip: a failed click must not leave
      // a heart claiming something untrue.
      if (res.status) {
        setIsFavourite(Boolean((res as { is_favourite?: boolean }).is_favourite));
        setToast(res.message ?? "");
      } else {
        setToast(res.message ?? tt("couldn_t_save_that_try_again"));
      }
    } catch {
      setToast(tt("couldn_t_save_that_try_again"));
    } finally {
      setFavBusy(false);
    }
  }, [user?.id, hostUserId, favBusy]);

  const shareBattleRecap = useCallback(async (battleId: number, engine = "1v1") => {
    setSharingRecap(true);
    try {
      // The engines have separate id spaces, so the id alone is ambiguous to the server.
      const res = await post<{ share_url?: string; share_text?: string }>("fetchBattleRecap", { battle_id: battleId, engine });
      const url = res.data?.share_url;
      if (!res.status || !url) throw new Error(tt("no_recap_yet"));
      const text = [res.data?.share_text, url].filter(Boolean).join("\n");
      if (navigator.share) {
        await navigator.share({ text, url });
      } else {
        await navigator.clipboard.writeText(text);
        setToast(tt("link_copied_paste_it_anywhere"));
      }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") setToast(tt("couldn_t_get_the_recap_try_again_in_a_mo"));
    } finally {
      setSharingRecap(false);
    }
  }, []);
  const [battlePicker, setBattlePicker] = useState(false);
  // "Game Limit" — the same 1v1 engine and invite, plus a coin target chosen first
  // (Steve, 2026-09-01: "give them the option of adding as many coins as they want",
  // so it is an open input rather than preset amounts).
  const [gameLimitPicker, setGameLimitPicker] = useState(false);
  const [gameLimitTarget, setGameLimitTarget] = useState("");
  // Solo Battle — the room's own, keyed on the room host. Everyone in the room sees the strip;
  // only the host can start one (the phones gate it the same way).
  const [soloBattle, setSoloBattle] = useState<SoloBattle | null>(null);
  const [soloStandingsOpen, setSoloStandingsOpen] = useState(false);
  const onBattleCompleted = useCallback((b: BattleData) => {
    if (user && (b.player_one_user_id === user.id || b.player_two_user_id === user.id)) setBattleResult(b);
    else setToast(b.winner_user_id ? tt("battle_over") : tt("battle_over_a_tie"));
    refresh();
  }, [user, refresh]);
  // Steve, 2026-09-06 (phones) / 2026-09-24 (web): the battle-start clip plays for everyone in
  // the room the moment any battle goes active. Queued if one is already playing.
  const [introQueue, setIntroQueue] = useState(0);
  // Steve, 2026-09-27: "keep the score on the board for at least 60 seconds or until they start
  // another game" — the final Best Out Of / Hide & Seek / 2v2 payload stays on its strip for 60 s
  // after it ends (the winner blinks), unless another battle starts first.
  const [heldSeries, setHeldSeries] = useState<{ d: SeriesData; until: number } | null>(null);
  const [heldTwo, setHeldTwo] = useState<{ d: Battle2v2Data; until: number } | null>(null);
  const onAnyBattleStarted = useCallback(() => { setIntroQueue((n) => n + 1); setHeldSeries(null); setHeldTwo(null); }, []);
  const battle = useBattle(roomName, user?.id ?? null, isPublisher, isLoggedIn && !roomClosed, onBattleCompleted, onAnyBattleStarted);

  // The other four engines: Best Out Of, 2v2, No Time Limit, 5-5-5. One result overlay at a time.
  const [result, setResult] = useState<{
    title: string;
    rows: { label: string; value: string; win?: boolean }[];
    /** Set only for engines the server can build a recap for. */
    recap?: { id: number; engine: string };
  } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Bingg Bongg Bingo (Steve, 2026-10-11) — battle engine #11. Everyone polls, viewers
  // included: it is the only way somebody who opens the room mid-game finds the card, since
  // the chat line the host posts scrolls out of a busy room in seconds.
  const [bingoGame, setBingoGame] = useState<BingoGame | null>(null);
  const [bingoOpen, setBingoOpen] = useState(false);
  const [bingoStartOpen, setBingoStartOpen] = useState(false);
  // The game this browser has already opened the card for. Without it the overlay would
  // spring back open on every poll tick after the viewer closed it.
  const bingoAutoOpened = useRef<number | null>(null);
  const bingoBuying = useRef(false);
  const [bingoBoardOpen, setBingoBoardOpen] = useState(false);
  // Steve, 2026-10-12: "when a game was over i did not see any of them." A finished game used
  // to just stop being interactive, so unless you happened to have the card open at the moment
  // the last square fell, the result passed you by entirely. Announced once per game.
  const [bingoFinishedId, setBingoFinishedId] = useState<number | null>(null);
  const bingoAnnouncedOver = useRef<number | null>(null);
  // Pyramid battle (Steve, 2026-10-27) — same discovery rule as bingo: everyone polls.
  const [pyramidGame, setPyramidGame] = useState<PyramidGame | null>(null);
  const [pyramidOpen, setPyramidOpen] = useState(false);
  const [pyramidStartOpen, setPyramidStartOpen] = useState(false);
  const pyramidClosedId = useRef<number | null>(null);
  const pyramidAnnounced = useRef<number | null>(null);
  const pyramidSending = useRef(false);
  // Checkers / Chess (Steve, 2026-10-27) — same discovery rule: everyone polls the room.
  const [boardGame, setBoardGame] = useState<BoardGame | null>(null);
  const [boardOpen, setBoardOpen] = useState(false);
  const [boardStartKind, setBoardStartKind] = useState<BoardKind | null>(null);
  const boardClosedId = useRef<number | null>(null);
  const boardAnnounced = useRef<number | null>(null);
  const boardBusy = useRef(false);
  const [picker, setPicker] = useState<BattleKind | null>(null);
  // Steve, 2026-09-27: Hide & Seek — pick the shape first (free for all 2-4, or 2v2 teams).
  const [hideSeekMode, setHideSeekMode] = useState<"choose" | "2v2" | 1 | 2 | 3 | null>(null);
  const myId = user?.id ?? null;
  const virtualRef = useRef<VirtualBattleData | null>(null);
  const nameOfId = useCallback((id: number | null | undefined) => {
    const m = broadcastersRef.current.find((b) => b.user_id === id);
    if (m) return displayName(m as Partial<UserSummary>);
    // A virtual battler is not on screen — resolve them from the battle roster instead.
    const v = virtualRef.current?.participants.find((p) => p.user_id === id);
    return v ? personName(v) : "";
  }, []);
  const onSeriesFinished = useCallback((d: SeriesData) => {
    setHeldSeries({ d, until: Date.now() + 60_000 });
    const acc = d.participants.filter((p) => p.invite_status === "accepted");
    setResult({
      // Only a TWO-player series has a recap — the engine allows more (Hide & Seek runs on it with
      // up to four) and beyond two it stops being a versus story, which is the rule the server
      // applies as well. Checking it here means the button is never offered for a share that 404s.
      recap: d.status === "completed" && acc.length === 2 && d.winner_user_id
        ? { id: d.series_id, engine: "best_out_of" }
        : undefined,
      title: resultTitle(d.winner_user_id, myId, acc.some((p) => p.user_id === myId), d.status === "cancelled"),
      rows: acc.map((p) => ({ label: nameOfId(p.user_id) || personName(p), value: `${p.rounds_won ?? 0} round${p.rounds_won === 1 ? "" : "s"}`, win: p.user_id === d.winner_user_id })),
    });
    refresh();
  }, [myId, nameOfId, refresh]);
  const on2v2Finished = useCallback((d: Battle2v2Data) => {
    setHeldTwo({ d, until: Date.now() + 60_000 });
    const mine = d.participants.find((p) => p.user_id === myId);
    const iPlayed = !!mine && mine.invite_status === "accepted";
    const iWon = !!mine && d.winning_team === mine.team;
    const team = (t: "A" | "B") => d.participants.filter((p) => p.team === t).map((p) => nameOfId(p.user_id) || personName(p)).join(" & ");
    setResult({
      recap: d.status === "completed" ? { id: d.battle_id, engine: "2v2" } : undefined,
      title: d.status === "cancelled" ? tt("battle_cancelled") : !d.winning_team ? tt("it_s_a_tie") : !iPlayed ? tt("battle_over") : iWon ? tt("your_team_won") : tt("your_team_lost_this_one"),
      rows: [
        { label: team("A"), value: (d.team_a_score ?? 0).toLocaleString(), win: d.winning_team === "A" },
        { label: team("B"), value: (d.team_b_score ?? 0).toLocaleString(), win: d.winning_team === "B" },
      ],
    });
    refresh();
  }, [myId, nameOfId, refresh]);
  const onMarathonFinished = useCallback((d: MarathonData) => {
    const acc = d.participants.filter((p) => p.invite_status === "accepted");
    setResult({
      title: resultTitle(d.winner_user_id, myId, acc.some((p) => p.user_id === myId), d.status === "cancelled"),
      rows: acc.map((p) => ({ label: nameOfId(p.user_id) || personName(p), value: (p.current_score ?? 0).toLocaleString(), win: p.user_id === d.winner_user_id })),
    });
    refresh();
  }, [myId, nameOfId, refresh]);
  const on555Finished = useCallback((d: B555Data) => {
    const acc = d.participants.filter((p) => p.invite_status === "accepted");
    setResult({
      title: resultTitle(d.winner_user_id, myId, acc.some((p) => p.user_id === myId), d.status === "cancelled"),
      rows: acc.map((p) => ({ label: nameOfId(p.user_id) || personName(p), value: `${p.games_completed ?? 0}/${d.games_to_win} games · ${(p.total_coins ?? 0).toLocaleString()} coins`, win: p.user_id === d.winner_user_id })),
    });
    refresh();
  }, [myId, nameOfId, refresh]);
  // Virtual Battle (Steve, 2026-09-27): result for the battlers, then the gift record page.
  const [virtualRecord, setVirtualRecord] = useState<VirtualGiftRecord | null>(null);
  const [virtualGiftTarget, setVirtualGiftTarget] = useState<VirtualParticipant | null>(null);
  const openVirtualRecord = useCallback((battleId: number) => {
    if (!myId) return;
    fetchVirtualGiftRecord(myId, battleId).then(setVirtualRecord).catch((e) => setToast((e as Error).message));
  }, [myId]);
  const onVirtualFinished = useCallback((d: VirtualBattleData) => {
    const mine = d.participants.find((p) => p.user_id === myId);
    setResult({
      title: resultTitle(d.winner_user_id, myId, !!mine, d.status === "cancelled"),
      rows: [...d.participants].sort((a, b) => b.current_score - a.current_score).map((p) => ({ label: nameOfId(p.user_id) || personName(p), value: (p.current_score ?? 0).toLocaleString(), win: p.user_id === d.winner_user_id })),
    });
    if (mine) setTimeout(() => openVirtualRecord(d.virtual_battle_id), 2500);
    refresh();
  }, [myId, nameOfId, refresh, openVirtualRecord]);
  const enginesOn = isLoggedIn && !roomClosed;
  const series = useEngine(SERIES, roomName, myId, isPublisher, enginesOn, onSeriesFinished, onAnyBattleStarted);
  const two = useEngine(TWO_V_TWO, roomName, myId, isPublisher, enginesOn, on2v2Finished, onAnyBattleStarted);
  const marathon = useEngine(MARATHON, roomName, myId, isPublisher, enginesOn, onMarathonFinished, onAnyBattleStarted);
  const b555 = useEngine(FIVE_FIVE_FIVE, roomName, myId, isPublisher, enginesOn, on555Finished, onAnyBattleStarted);
  const virtual = useEngine(VIRTUAL, roomName, myId, isPublisher, enginesOn, onVirtualFinished, onAnyBattleStarted);
  // Boxing gloves: 3 fixed 40s double-points windows per 1v1 battle / Best Out Of round.
  const boxing = battle.boxing ?? (series.data?.status === "active" ? activeBoxingWindow(series.data.boxing_windows, series.now) : null);
  const boxingLeft = boxing ? Math.max(0, Math.ceil((boxing.endMs - Math.max(battle.now, series.now)) / 1000)) : null;
  const anyBattleOpen = (!!battle.battle && battle.battle.status !== "completed") || !!series.data || !!two.data || !!marathon.data || !!b555.data;

  // Best Out Of: a participant finalizes the round the moment its clock hits zero (server
  // rejects early calls, so a second or two of drift is harmless). 2v2: same at ends_at.
  const seriesRoundSecs = series.data?.status === "active" ? secondsUntil(series.data.current_round_ends_at, series.now) : null;
  const iAmInSeries = !!series.data && series.data.participants.some((p) => p.user_id === myId && p.invite_status === "accepted");
  const finalizingRound = useRef<number | null>(null);
  useEffect(() => {
    const d = series.data;
    if (!d || d.status !== "active" || seriesRoundSecs !== 0 || !iAmInSeries || !d.current_round_id || finalizingRound.current === d.current_round_id) return;
    finalizingRound.current = d.current_round_id;
    finalizeSeriesRound(d.current_round_id).catch(() => undefined).finally(() => { if (finalizingRound.current === d.current_round_id) finalizingRound.current = null; });
  }, [series.data, seriesRoundSecs, iAmInSeries]);
  const twoSecs = two.data?.status === "active" ? secondsUntil(two.data.ends_at, two.now) : null;
  const iAmIn2v2 = !!two.data && two.data.participants.some((p) => p.user_id === myId && p.invite_status === "accepted");
  const finalizing2v2 = useRef(false);
  useEffect(() => {
    const d = two.data;
    if (!d || d.status !== "active" || twoSecs !== 0 || !iAmIn2v2 || finalizing2v2.current) return;
    finalizing2v2.current = true;
    finalize2v2(d.battle_id).then((res) => { if (res.status && res.data) two.absorb(res.data); }).catch(() => undefined).finally(() => { finalizing2v2.current = false; });
  }, [two, twoSecs, iAmIn2v2]);

  // Tap games: the host activates one from the phone (or later, here); everyone gets a Play button.
  async function startSolo() {
    if (role !== "host" || !user) { setToast(tt("only_the_host_can_start_a_solo_battle_wi")); return; }
    try {
      const b = await startSoloBattle(user.id);
      setSoloBattle(b);
      setToast(tt("solo_battle_with_unlimited_players_start"));
    } catch (e) {
      setToast((e as Error).message);
    }
  }

  // A Solo Battle belongs to the room's host, so everyone here polls the same one.
  useEffect(() => {
    if (!hostUserId || roomClosed) return;
    let alive = true;
    const tick = () => fetchActiveSoloBattle(hostUserId, user?.id).then((b) => { if (alive) setSoloBattle(b); }).catch(() => undefined);
    tick();
    const t = setInterval(tick, 8000);
    return () => { alive = false; clearInterval(t); };
  }, [hostUserId, user?.id, roomClosed]);

  const [activeGame, setActiveGame] = useState<TapGameType | null>(null);
  const [gameOpen, setGameOpen] = useState(false);
  const [gamesMenuOpen, setGamesMenuOpen] = useState(false);
  // Steve, 2026-09-27: the phones' Who's Playing / Invite header buttons, on the web too.
  const [whosPlayingOpen, setWhosPlayingOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  // ---- Message Translation (the phones' "MT" button) ------------------------------------------
  // Steve, 2026-10-02: "On the web, Please add the automatic translation messages just like on the
  // phones." Per-viewer and local: nothing is stored server-side and nobody else in the room is
  // told. It seeds from the viewer's own language rather than starting at None, per Eddie's
  // 2026-09-19 note that a message in Spanish should just arrive in English.
  const [mtOpen, setMtOpen] = useState(false);
  const [mtLang, setMtLang] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem("bb.mtLang");
      if (saved !== null) return saved || null;   // "" is a deliberate "off", not "unset"
    } catch { /* private window, blocked storage */ }
    return defaultTargetLanguage();
  });
  const [translations, setTranslations] = useState<Record<string, TranslationResult>>({});
  // Ids already sent to the server, so a re-render never re-asks and never bills twice.
  const translatingRef = useRef<Set<string>>(new Set());

  const pickMtLang = useCallback((code: string) => {
    const next = code || null;
    setMtLang(next);
    try { localStorage.setItem("bb.mtLang", code); } catch { /* ignore */ }
    // A new target invalidates everything already translated.
    translatingRef.current = new Set();
    setTranslations({});
    setMtOpen(false);
  }, []);

  useEffect(() => {
    if (!mtLang || !isLoggedIn) return;
    let alive = true;
    // Only the tail is worth translating: scrollback the viewer has already read past does not
    // need a round trip each, and a busy room would otherwise fire dozens at once.
    const recent = messages.slice(-40);
    for (const m of recent) {
      if (m.stickerUrl || !m.message.trim()) continue;
      if (translatingRef.current.has(m.id)) continue;
      translatingRef.current.add(m.id);
      translateChatMessage(m.message, mtLang).then((r) => {
        if (!alive || !r) return;
        setTranslations((prev) => (prev[m.id] ? prev : { ...prev, [m.id]: r }));
      });
    }
    return () => { alive = false; };
  }, [messages, mtLang, isLoggedIn]);
  useEffect(() => {
    if (!isLoggedIn || roomClosed) return;
    let alive = true;
    const tick = () => fetchActiveTapGame(roomName).then((g) => { if (alive) setActiveGame(g); });
    tick();
    const t = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(t); };
  }, [roomName, isLoggedIn, roomClosed]);

  const broadcasters = useMemo<Member[]>(() => {
    if (!members) return [];
    return [{ user_id: members.host_user_id, fullname: members.host_fullname, username: members.host_username, profile_image: members.host_profile_image }, ...members.guests];
  }, [members]);
  const nameOf = useCallback((id: number | null) => broadcasters.find((b) => b.user_id === id), [broadcasters]);
  const broadcastersRef = useRef<Member[]>([]);

  // Bingo's one read. Polled for every role, and the only way a game is discovered.
  useEffect(() => {
    if (!roomName) return;
    let alive = true;
    const tick = async () => {
      try {
        const fresh = await fetchBingoGame(roomName);
        if (!alive) return;
        setBingoGame(fresh);
        // Auto-open once per game, so the card appears when the host starts one — and never
        // again for that game, or closing it would be pointless.
        if (fresh && fresh.status === "active" && bingoAutoOpened.current !== fresh.bingo_game_id) {
          bingoAutoOpened.current = fresh.bingo_game_id;
          setBingoOpen(true);
        }
        if (fresh && fresh.status !== "active" && bingoAnnouncedOver.current !== fresh.bingo_game_id) {
          bingoAnnouncedOver.current = fresh.bingo_game_id;
          setBingoFinishedId(fresh.bingo_game_id);
        }
      } catch {
        // Fail open, same as every other poll in this room — keep the last good card rather
        // than blanking it on one bad tick.
      }
    };
    void tick();
    const id = window.setInterval(tick, 5000);
    return () => { alive = false; window.clearInterval(id); };
  }, [roomName]);

  async function refreshPyramid() {
    if (!roomName) return;
    try {
      const fresh = await fetchPyramidGame(roomName);
      setPyramidGame(fresh);
      if (!fresh) { setPyramidOpen(false); return; }
      if (fresh.status === "active") {
        if (pyramidClosedId.current !== fresh.pyramid_game_id) setPyramidOpen(true);
      } else if (pyramidAnnounced.current !== fresh.pyramid_game_id) {
        pyramidAnnounced.current = fresh.pyramid_game_id;
        const w = fresh.players.find((p) => p.user_id === fresh.winner_user_id);
        if (w && pyramidOpenRef.current) setToast(`🏆 ${w.name} wins Pyramid #${fresh.game_no}!`);
      }
    } catch { /* keep the last good state */ }
  }
  const pyramidOpenRef = useRef(false);
  pyramidOpenRef.current = pyramidOpen;
  const pyramidActive = pyramidGame?.status === "active";
  useEffect(() => {
    if (!roomName) return;
    void refreshPyramid();
    const id = window.setInterval(() => { void refreshPyramid(); }, pyramidActive ? 3000 : 8000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName, pyramidActive]);

  async function refreshBoard() {
    if (!roomName) return;
    try {
      const fresh = await fetchBoardGame(roomName);
      setBoardGame(fresh);
      if (!fresh) { setBoardOpen(false); return; }
      if (fresh.status === "active") {
        if (boardClosedId.current !== fresh.board_game_id) setBoardOpen(true);
      } else if (boardAnnounced.current !== fresh.board_game_id) {
        boardAnnounced.current = fresh.board_game_id;
        const w = fresh.players.find((p) => p.side === fresh.result);
        if (w && fresh.status === "completed" && boardOpenRef.current) setToast(`🏆 ${w.name} wins ${BOARD_TITLE[fresh.kind]} #${fresh.game_no}!`);
      }
    } catch { /* keep the last good board */ }
  }
  const boardOpenRef = useRef(false);
  boardOpenRef.current = boardOpen;
  const boardActive = boardGame?.status === "active";
  useEffect(() => {
    if (!roomName) return;
    void refreshBoard();
    // Moves need to show up fast for the person waiting on them.
    const id = window.setInterval(() => { void refreshBoard(); }, boardActive ? 1500 : 8000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName, boardActive]);

  function openBoard(kind: BoardKind) {
    if (boardGame && boardGame.status === "active") { boardClosedId.current = null; setBoardOpen(true); return; }
    if (role !== "host") { setToast(`No ${BOARD_TITLE[kind]} game is running — the host starts it.`); return; }
    setBoardStartKind(kind);
  }

  function openPyramid() {
    if (pyramidGame && pyramidGame.status === "active") { pyramidClosedId.current = null; setPyramidOpen(true); return; }
    if (role !== "host") { setToast("No Pyramid game is running — the host starts it."); return; }
    setPyramidStartOpen(true);
  }

  async function refreshBingo() {
    if (!roomName) return;
    try { setBingoGame(await fetchBingoGame(roomName)); } catch { /* keep the last good card */ }
  }

  function openBingo() {
    if (bingoGame && bingoGame.status === "active") { setBingoOpen(true); return; }
    if (role !== "host") { setToast(tt("no_bingo_game_is_running_the_host_starts")); return; }
    setBingoStartOpen(true);
  }
  broadcastersRef.current = broadcasters;
  virtualRef.current = virtual.data;

  // Room roster (host + approved guests) — checkHeader only, works before sign-in too.
  useEffect(() => {
    let alive = true;
    async function load() {
      const res = await post<RoomMembers>("fetchLiveRoomMembers", { room_name: roomName }).catch(() => null);
      if (!alive || !res) return;
      if (!res.status || !res.data) { setRoomClosed(true); return; }
      setMembers(res.data);
      // Viewer who asked to join (or was invited): the moment I'm in guests, publish.
      if (user && role === "viewer" && res.data.guests.some((g) => g.user_id === user.id)) {
        setJoinState("approved");
        setRole("guest");
      }
    }
    load();
    const t = setInterval(load, MEMBERS_POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [roomName, user, role]);

  // Watcher count for everyone; join requests for the host.
  useEffect(() => {
    if (!isLoggedIn || roomClosed) return;
    let alive = true;
    async function tick() {
      const w = await post<unknown[]>("fetchLiveRoomWatchers", { room_name: roomName }).catch(() => null);
      if (alive && w?.status) setWatchers((w.data ?? []).length);
      if (role === "host" && user) {
        const r = await post<JoinRequest[]>("fetchJoinRequests", { user_id: user.id, room_name: roomName }).catch(() => null);
        if (alive && r?.status) setJoinRequests(r.data ?? []);
      }
    }
    tick();
    const t = setInterval(tick, MEMBERS_POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [roomName, role, user, isLoggedIn, roomClosed]);

  // Heartbeat: keeps the room alive for a host and puts viewers/guests in the watchers list.
  useEffect(() => {
    if (!isLoggedIn || !user || roomClosed) return;
    const beat = () => post("markWatchingLive", { user_id: user.id, room_name: roomName }).catch(() => undefined);
    beat();
    const t = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [roomName, user, isLoggedIn, roomClosed]);

  // Chat.
  useEffect(() => {
    if (!isLoggedIn || !hostUserId) return;
    let unsub: (() => void) | null = null;
    let cancelled = false;
    ensureFirebaseSignIn()
      .then(() => { if (!cancelled) unsub = observeChat(chatChannel(roomName, hostUserId), setMessages, (e) => setToast(`Chat: ${e.message}`)); })
      .catch((e) => setToast(`Chat unavailable: ${(e as Error).message}`));
    return () => { cancelled = true; unsub?.(); };
  }, [roomName, hostUserId, isLoggedIn]);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [messages]);

  useEffect(() => {
    post<{ gifts?: Gift[]; livestreamGifts?: Gift[] }>("fetchSettings", { x: 1 })
      .then((res) => setGifts((res.data?.gifts?.length ? res.data.gifts : res.data?.livestreamGifts) ?? []))
      .catch(() => undefined);
  }, []);

  // Auto Voice Thanks — fetch TTS settings once the host is active so the voice/language match
  // their personal preference. Falls back to defaults (male_deep / en-US / 1.0) on any error.
  useEffect(() => {
    if (role !== "host" || !user) return;
    post<Record<string, unknown>>("getTextToVoiceSettings", { user_id: user.id })
      .then((res) => {
        const s = res as Record<string, unknown> & { settings?: Record<string, unknown> };
        const settings = s.settings ?? s;
        ttsVoiceRef.current = {
          voiceType: String(settings.voice_type ?? "male_deep"),
          language: String(settings.language ?? "en-US"),
          volume: Number(settings.volume ?? 1),
          enabled: settings.enabled !== false,
          filter: String(settings.filter ?? ""),
          minCoins: Number(settings.min_coins ?? 0),
          blacklistWords: typeof settings.blacklist_words === "string" ? settings.blacklist_words : "[]",
        };
        setVoiceThanksGift(settings.voice_thanks_gift !== false);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, user?.id]);

  // Auto Voice Thanks — watch the chat stream for new gift messages and play a TTS phrase.
  // Only fires when I'm the host and the gift-thanks toggle is on. Uses the same
  // synthesizeSpeech endpoint as Android/iOS, plays locally via HTMLAudioElement.
  // Web has no stream-mix infrastructure (no AudioProcessor equivalent), so local-only is the
  // best the web can do — the host hears it; the audience doesn't (same limitation as Android
  // before SoundEffectMixer, or iOS before SoundPlayer was wired in).
  useEffect(() => {
    if (role !== "host" || !voiceThanksGift) return;
    const newGifts = messages.filter((m) => m.senderUserId < 0 && m.sentAt > lastSeenGiftSentAtRef.current);
    if (newGifts.length === 0) return;
    lastSeenGiftSentAtRef.current = Math.max(...newGifts.map((m) => m.sentAt));
    for (const msg of newGifts) {
      const name = msg.senderName || msg.message.split(" sent a ")[0] || null;
      if (!name) continue;
      const { voiceType, language, volume } = ttsVoiceRef.current;
      post<{ audioBase64?: string }>("synthesizeSpeech", { text: `Thanks for the gift ${name}`, voice_type: voiceType, language, volume })
        .then((res) => {
          const b64 = (res as Record<string, unknown>).audioBase64 as string | undefined
            ?? (res as Record<string, unknown>).audio_base64 as string | undefined;
          if (!b64) return;
          const audio = new Audio(`data:audio/mp3;base64,${b64}`);
          audio.volume = Math.min(1, Math.max(0, volume));
          audio.play().catch(() => undefined);
        })
        .catch(() => undefined);
    }
  }, [messages, role, voiceThanksGift]);

  function saveVoiceThanksGift(newVal: boolean) {
    if (!user) return;
    const { voiceType, language, volume, enabled, filter, minCoins, blacklistWords } = ttsVoiceRef.current;
    post("saveTextToVoiceSettings", {
      user_id: user.id, enabled, voice_type: voiceType, language, volume,
      filter, min_coins: minCoins, blacklist_words: blacklistWords,
      voice_thanks_follow: true, voice_thanks_gift: newVal,
    }).catch(() => undefined);
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  async function submitChat(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !draft.trim()) return;
    const text = draft;
    setDraft("");
    try { await sendChat(chatChannel(roomName, hostUserId), user.id, displayName(user), text, user.profile_image ?? ""); }
    catch (err) { setToast(`Couldn't send: ${(err as Error).message}`); }
  }

  async function sendGift(gift: Gift) {
    if (!user || !giftTarget) return;
    try {
      const b = battle.battle;
      const tag: Record<string, number> = {};
      const accepted = (ps: { user_id: number; invite_status: string }[]) => ps.some((p) => p.user_id === giftTarget && p.invite_status === "accepted");
      if (b && b.status === "active" && (b.player_one_user_id === giftTarget || b.player_two_user_id === giftTarget)) tag.battle_id = b.battle_id;
      else if (series.data?.status === "active" && series.data.current_round_id && accepted(series.data.participants)) tag.series_round_id = series.data.current_round_id;
      else if (two.data?.status === "active" && accepted(two.data.participants)) tag.battle_2v2_id = two.data.battle_id;
      else if (marathon.data?.status === "active" && accepted(marathon.data.participants)) tag.marathon_id = marathon.data.marathon_id;
      else if (b555.data?.status === "active" && accepted(b555.data.participants)) tag.battle_555_id = b555.data.battle_555_id;
      else if (virtual.data?.status === "active" && virtual.data.participants.some((p) => p.user_id === giftTarget)) tag.virtual_battle_id = virtual.data.virtual_battle_id;
      const res = await post("sendCoinsToUser", { my_user_id: user.id, user_id: giftTarget, coins: giftPrice(gift), gift_id: gift.id, room_name: roomName, ...tag });
      if (!res.status) throw new Error(res.message ?? tt("couldn_t_send_that_gift"));
      setToast(`Sent ${gift.name ?? "a gift"} (${giftPrice(gift)} coins) to ${nameOfId(giftTarget) || (virtualGiftTarget ? personName(virtualGiftTarget) : "")}`);
      setGiftTarget(null);
      setVirtualGiftTarget(null);
      refresh();
    } catch (err) { setToast((err as Error).message); }
  }

  async function requestToJoin() {
    if (!user) return;
    try {
      const res = await post<unknown>("requestToJoinLive", { user_id: user.id, room_name: roomName });
      if (!res.status) throw new Error(res.message ?? tt("couldn_t_send_the_request"));
      const st = (res as { member_status?: string }).member_status;
      setJoinState(st === "approved" ? "approved" : "requested");
      setToast(st === "approved" ? "You're in — joining as a guest." : "Request sent. The host will see it in a moment.");
    } catch (err) { setToast((err as Error).message); }
  }

  async function answerRequest(r: JoinRequest, approve: boolean) {
    if (!user) return;
    try {
      const res = await post("respondToJoinRequest", { user_id: user.id, request_id: r.request_id, approve });
      if (!res.status) throw new Error(res.message ?? tt("couldn_t_answer_that_request"));
      setJoinRequests((prev) => prev.filter((x) => x.request_id !== r.request_id));
      setToast(approve ? `${displayName(r as Partial<UserSummary>)} is joining.` : "Declined.");
    } catch (err) { setToast((err as Error).message); }
  }

  async function endLive() {
    if (!user) return;
    if (!window.confirm("End your live for everyone?")) return;
    live.disconnect();
    await post("endLive", { user_id: user.id }).catch(() => undefined);
    navigate("/live", { replace: true });
  }

  function leaveAsGuest() {
    // Steve, 2026-09-27: an approved guest who backs out must stop counting as a room member
    // on the server (battle invites / pickers kept including them). Fire and forget.
    if (user) post("leaveLiveRoom", { my_user_id: user.id, room_name: roomName }).catch(() => undefined);
    live.disconnect();
    navigate("/live", { replace: true });
  }

  const hostCard = members ? { fullname: members.host_fullname, username: members.host_username, profile_image: members.host_profile_image } : null;
  const orderedTiles = [...live.tiles].sort((a, b) => (a.userId === hostUserId ? -1 : b.userId === hostUserId ? 1 : 0));
  const statusLabel = roomClosed || live.status === "ended" ? "ENDED" : live.status === "live" ? "● LIVE" : live.status === "error" ? "ERROR" : "CONNECTING";

  if (!isLoggedIn) {
    return <div className="page"><Notice>{tn("sign_in_to_watch_this_live", <Link to="/login">{t("sign_in")}</Link>)}</Notice></div>;
  }

  // ---- Taps on the live (Steve, 2026-10-14) ------------------------------------------------
  //
  // Free hearts, like TikTok's, and one of the inputs to how Live Now is ordered now that it
  // ranks rooms instead of just listing the newest first.
  // `x`/`y` are px inside the grid for a heart you tapped yourself; `remote` ones have no
  // meaningful point (somebody else's finger) and are placed bottom-centre instead.
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number; drift: number; size: number; remote?: boolean }[]>([]);
  const [tapCount, setTapCount] = useState(0);
  // Steve, 2026-10-14: "When i click on the red Tap Tap heart, please add all the members that
  // tap taped for me and total hearts they sent me.... so the host can thank them all one by
  // one." null = closed, [] = open and empty, undefined entries never happen.
  const [tapSenders, setTapSenders] = useState<{ user_id: number; fullname?: string; username?: string; profile_image?: string; taps: number }[] | null>(null);
  const [tapSendersTotal, setTapSendersTotal] = useState(0);
  const [tapSendersLoading, setTapSendersLoading] = useState(false);
  function openTapSenders() {
    if (!roomName || !hostUserId) return;
    setTapSenders([]); setTapSendersTotal(0); setTapSendersLoading(true);
    // post() resolves to the server's JSON itself, so `data` is the list and `total` a sibling —
    // the first cut read r.data?.data and this list was always empty.
    post<{ user_id: number; fullname?: string; username?: string; profile_image?: string; taps: number }[]>(
      "fetchLiveTapSenders", { room_name: roomName, to_user_id: hostUserId })
      .then((r) => { setTapSenders(r.data ?? []); setTapSendersTotal(typeof r.total === "number" ? r.total : 0); })
      .catch(() => setTapSenders([]))
      .finally(() => setTapSendersLoading(false));
  }
  // Steve, 2026-10-14: the live Leader Board (LB). "Any of the audience or any live streamer will
  // have the option to click (LB)... up to 4 members on top. When they click on any member it will
  // show the leaderboard with all members that gifted that member." One (LB) for every role.
  // null = closed. Reads LivestreamController::fetchLiveGiftLeaderboard; same row shape both ways.
  type LbRow = { user_id: number; fullname?: string; username?: string; profile_image?: string; is_host?: boolean; coins: number };
  const [lbMembers, setLbMembers] = useState<LbRow[] | null>(null);
  const [lbLoading, setLbLoading] = useState(false);
  const [lbSelected, setLbSelected] = useState<LbRow | null>(null);
  const [lbSenders, setLbSenders] = useState<LbRow[] | null>(null);
  const [lbTotal, setLbTotal] = useState(0);
  function openLeaderBoard() {
    if (!roomName) return;
    setLbMembers([]); setLbSelected(null); setLbSenders(null); setLbTotal(0); setLbLoading(true);
    post("fetchLiveGiftLeaderboard", { room_name: roomName })
      .then((r) => setLbMembers((r.members as LbRow[] | undefined) ?? []))
      .catch(() => setLbMembers([]))
      .finally(() => setLbLoading(false));
  }
  function selectLbMember(m: LbRow) {
    if (!roomName) return;
    setLbSelected(m); setLbSenders(null); setLbTotal(0);
    post("fetchLiveGiftLeaderboard", { room_name: roomName, to_user_id: m.user_id })
      .then((r) => {
        // Only the latest tap's answer may land.
        setLbSelected((cur) => {
          if (cur?.user_id !== m.user_id) return cur;
          setLbSenders((r.senders as LbRow[] | undefined) ?? []);
          setLbTotal(typeof r.total === "number" ? r.total : 0);
          const fresh = r.members as LbRow[] | undefined;
          if (fresh && fresh.length) setLbMembers(fresh);
          return cur;
        });
      })
      .catch(() => setLbSenders([]));
  }
  const pendingTaps = useRef(0);
  const tapFlushTimer = useRef<number | null>(null);

  // Double click, not single: a double tap is what sends a heart on the phones, and a single
  // click on the grid must stay free for everything else the tiles do.
  function dropHeart(e: React.MouseEvent<HTMLDivElement>) {
    // Steve, 2026-10-14: "You can not Tap Tap and get hearts for your self." The web grid only
    // ever hearts the host, so a host watching their own room is the self case: no animation,
    // no count, nothing sent — and the server refuses it anyway.
    if (myId && hostUserId && myId === hostUserId) return;
    const box = e.currentTarget.getBoundingClientRect();
    const id = Date.now() + Math.random();
    const heart = {
      id,
      x: e.clientX - box.left,
      y: e.clientY - box.top,
      drift: Math.round((Math.random() - 0.5) * 70),
      size: 24 + Math.round(Math.random() * 12),
    };
    setHearts((h) => [...h, heart]);
    window.setTimeout(() => setHearts((h) => h.filter((x) => x.id !== id)), 1200);

    // Steve, 2026-10-14: the heart has to reach the person it is FOR, not just the tapper.
    // The web grid is one room with no per-tile targeting yet, so this is the host's identity —
    // the same "user_<id>" form the phones key their tiles by.
    if (hostUserId) live.sendHeart(`user_${hostUserId}`);

    // The heart is already on screen; this half is only the reporting, and it must never hold
    // the animation up.
    pendingTaps.current += 1;
    if (tapFlushTimer.current !== null) return;
    tapFlushTimer.current = window.setTimeout(() => {
      tapFlushTimer.current = null;
      const taps = pendingTaps.current;
      pendingTaps.current = 0;
      if (taps <= 0 || !roomName) return;
      post<{ tap_count?: number }>("sendLiveTaps", { user_id: myId ?? 0, room_name: roomName, taps })
        .then((r) => { if (typeof r.data?.tap_count === "number") setTapCount(r.data.tap_count); })
        // A dropped batch is a few hearts nobody counted. No message over a live stream, and no
        // retry — a retry would double-count whatever did land.
        .catch(() => {});
    }, 1500);
  }

  // A heart somebody else tapped. Keyed on the seq, because the same identity twice running is
  // two hearts and the identity alone would not change.
  useEffect(() => {
    if (!live.incomingHeart) return;
    const id = Date.now() + Math.random();
    setHearts((h) => [...h, {
      id,
      // Unused for a remote heart — see `remote` below.
      x: 0, y: 0,
      drift: Math.round((Math.random() - 0.5) * 70),
      size: 24 + Math.round(Math.random() * 12),
      remote: true,
    }]);
    window.setTimeout(() => setHearts((h) => h.filter((x) => x.id !== id)), 1200);
  }, [live.incomingHeart?.seq]);

  // Nothing should still be pending when the page goes away.
  useEffect(() => () => { if (tapFlushTimer.current !== null) window.clearTimeout(tapFlushTimer.current); }, []);

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 12 }}>
        <Avatar user={hostCard} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800 }}>{hostCard ? displayName(hostCard) : "Live"}{role === "host" ? " (you)" : ""}</div>
          <div className="muted" style={{ fontSize: 13 }}>
            {watchers !== null ? `👁 ${watchers} watching` : ""}{broadcasters.length > 1 ? ` · ${broadcasters.length} on screen` : ""}
          </div>
        </div>
        <span className={`pill ${statusLabel === "● LIVE" ? "live" : ""}`}>{statusLabel}</span>
      </div>
      {live.error && <Notice error>{live.error}</Notice>}
      {live.publishError && <Notice error>{live.publishError}</Notice>}
      {(roomClosed || live.status === "ended") && <Notice>{tn("this_live_has_ended", <Link to="/live">{t("see_who_else_is_live")}</Link>)}</Notice>}

      <div className="live-layout">
        <div>
          {battle.battle && battle.battle.status !== "completed" && (
            <BattleStrip b={battle.battle} secondsLeft={battle.secondsLeft} nameOf={(id) => displayName(nameOf(id) as Partial<UserSummary>)} />
          )}
          {(series.data ?? (heldSeries && heldSeries.until > series.now ? heldSeries.d : null)) && <SeriesStrip d={series.data ?? heldSeries!.d} now={series.now} nameOf={nameOfId} />}
          {(two.data ?? (heldTwo && heldTwo.until > two.now ? heldTwo.d : null)) && <TwoVTwoStrip d={two.data ?? heldTwo!.d} now={two.now} nameOf={nameOfId} />}
          {virtual.data && <VirtualStrip d={virtual.data} now={virtual.now} myUserId={myId} onGift={(p) => { setVirtualGiftTarget(p); setGiftTarget(p.user_id); }} />}
          {marathon.data && (
            <MarathonStrip d={marathon.data} myUserId={myId} nameOf={nameOfId} onVote={(approve) => {
              if (!myId || !marathon.data) return;
              voteMarathonCancel(myId, marathon.data.marathon_id, approve).then(() => setToast(approve ? "Your vote to end is in." : "Vote withdrawn.")).catch((e) => setToast((e as Error).message));
            }} />
          )}
          {b555.data && (
            <B555Strip d={b555.data} myUserId={myId} nameOf={nameOfId} onCancel={() => {
              if (!myId || !b555.data) return;
              cancel555(myId, b555.data.battle_555_id).then(() => setToast("5-5-5 cancelled.")).catch((e) => setToast((e as Error).message));
            }} />
          )}
          <div className={`video-grid count-${Math.min(4, Math.max(1, orderedTiles.length))}`} onDoubleClick={dropHeart}>
            {/* Hearts and the room total. pointer-events:none in CSS — one stolen click here
                would break everything the tiles underneath do. */}
            <div className="live-hearts">
              {hearts.map((h) => (
                <span key={h.id} className="live-heart"
                  style={{
                    // A heart you tapped rises from your finger; one from somebody else has no
                    // point on this screen, so it rises from the bottom centre of the video.
                    left: h.remote ? "50%" : h.x,
                    top: h.remote ? "88%" : h.y,
                    fontSize: h.size,
                    ["--drift" as string]: `${h.drift}px`,
                  }}>❤️</span>
              ))}
            </div>
            {/* The gift playing right now — an effect gift bursts, a plain one shows the card. */}
            {giftEffect && (giftEffect.gift && isTapTapGift(giftEffect.gift) ? (
              <TapTapBurst key={giftEffect.key} gift={giftEffect.gift} />
            ) : giftEffect.gift?.video ? (
              // Steve, 2026-10-26: "make it 9:16 so it will cover the phone". A gift with a video
              // plays it over the whole live view — a tall clip covers it, a wide one fills the
              // width — to its own end, with the sender line along the bottom.
              <div key={giftEffect.key} className="gift-video" aria-live="polite">
                <video src={mediaUrl(giftEffect.gift.video)} autoPlay playsInline
                  onLoadedMetadata={(e) => {
                    const v = e.currentTarget;
                    v.classList.toggle("tall", v.videoHeight > v.videoWidth);
                    // Browsers refuse sound without a tap on the page; play it silent rather than not at all.
                    v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
                  }}
                  onEnded={() => setGiftEffect(null)}
                  onError={() => setGiftEffect(null)} />
                <span className="gift-video-name">{giftEffect.text}</span>
              </div>
            ) : (
              <div key={giftEffect.key} className="gift-flash" aria-live="polite">
                <div className="gift-flash-card">
                  {giftEffect.gift?.image ? <img src={mediaUrl(giftEffect.gift.image)} alt="" /> : <span style={{ fontSize: 64 }}>🎁</span>}
                  <span>{giftEffect.text}</span>
                </div>
              </div>
            ))}
            {tapCount > 0 && (
              <button type="button" className="live-tap-count" title={t("who_sent_these_hearts")}
                onClick={(e) => { e.stopPropagation(); openTapSenders(); }}>
                ❤️ {tapCount.toLocaleString()}
              </button>
            )}
            <button type="button" className="live-lb" title={t("leader_board_top_givers_this_live")}
              onClick={(e) => { e.stopPropagation(); openLeaderBoard(); }}>
              {t("lb")}</button>
            {orderedTiles.length === 0 && (
              <div className="tile" style={{ display: "grid", placeItems: "center" }}>
                <span className="muted">{live.status === "live" ? "Waiting for video…" : "Connecting…"}</span>
              </div>
            )}
            {orderedTiles.map((t) => <VideoTile key={t.identity} tile={t} user={t.isLocal ? user : (nameOf(t.userId) as Partial<UserSummary> | undefined) ?? { fullname: t.name }} label={t.isLocal ? `${displayName(user)} (you)` : displayName(nameOf(t.userId) as Partial<UserSummary> ?? { fullname: t.name })} />)}
            {boxing && (
              <div className="boxing-gloves" title={t("boxing_gloves_every_gift_counts_double")}>
                <img src="/boxing_gloves.png" alt={t("boxing_gloves_double_points")} />
                <span className="clock">{boxingLeft}s</span>
              </div>
            )}
          </div>

          {/* Viewer-side. Deliberately NOT inside the isPublisher block below: a host would be
              favouriting themselves, which the server refuses anyway. Hold it for two seconds for
              the explainer, same gesture as both phones. */}
          {!isPublisher && isLoggedIn && hostUserId > 0 && (
            <div className="row" style={{ marginTop: 12, flexWrap: "wrap" }}>
              <button
                className={isFavourite ? "btn small" : "btn small ghost"}
                disabled={favBusy}
                onClick={toggleFavourite}
                onPointerDown={() => {
                  // A real two-second hold. The browser has no long-press of its own, and a
                  // right-click menu is not a gesture a phone user has.
                  holdTimer.current = window.setTimeout(() => setFavExplainer(true), 2000);
                }}
                onPointerUp={() => { if (holdTimer.current) window.clearTimeout(holdTimer.current); }}
                onPointerLeave={() => { if (holdTimer.current) window.clearTimeout(holdTimer.current); }}
                title={t("save_this_streamer_hold_for_two_seconds")}
              >{isFavourite ? "♥ Favourited" : "♡ Favourite"}</button>
            </div>
          )}

          {tapSenders !== null && (
            <div className="modal-backdrop" onClick={() => setTapSenders(null)}>
              <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
                <h3 style={{ color: "var(--gold)", marginTop: 0 }}>
                  {tapSendersTotal > 0
                    ? t("hearts_for_count", hostCard ? displayName(hostCard) : t("the_host"), tapSendersTotal.toLocaleString())
                    : t("hearts_for", hostCard ? displayName(hostCard) : t("the_host"))}
                </h3>
                {/* Steve, 2026-10-14: "Please add this text on top of the page that when I see the
                    total tap taps." Verbatim, his line break kept. True, if modest: taps are one
                    term in the Live Now ranking (LivestreamController::liveHeatScores). */}
                <p style={{ color: "var(--gold)", textAlign: "center", fontWeight: 600, fontSize: 13, margin: "0 0 12px", whiteSpace: "pre-line" }}>
                  {t("tap_tap_hearts_note")}
                </p>
                {tapSendersLoading ? (
                  <p className="muted">{t("imagePickerLoading")}</p>
                ) : tapSenders.length === 0 ? (
                  <p className="muted">{t("no_hearts_yet")}</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "60vh", overflowY: "auto" }}>
                    {tapSenders.map((s) => (
                      <div key={s.user_id} className="row" style={{ padding: "8px 10px", border: "1px solid var(--gold-border)", borderRadius: 10, background: "#111" }}>
                        <Avatar user={{ fullname: s.fullname, username: s.username, profile_image: s.profile_image } as Partial<UserSummary>} />
                        <div style={{ flex: 1, minWidth: 0, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {displayName({ fullname: s.fullname, username: s.username } as Partial<UserSummary>)}
                        </div>
                        <div style={{ color: "var(--gold)", fontWeight: 800, whiteSpace: "nowrap" }}>❤️ {s.taps.toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                )}
                <button className="btn" style={{ marginTop: 12 }} onClick={() => setTapSenders(null)}>{t("close")}</button>
              </div>
            </div>
          )}

          {lbMembers !== null && (
            <div className="modal-backdrop" onClick={() => setLbMembers(null)}>
              <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
                <h3 style={{ color: "var(--gold)", marginTop: 0, textAlign: "center" }}>{t("leader_board")}</h3>
                <p style={{ color: "var(--gold)", textAlign: "center", fontWeight: 600, fontSize: 13, margin: "0 0 12px" }}>
                  {t("top_givers_this_live_tap_a_member_to_see")}</p>
                {lbLoading ? (
                  <p className="muted">{t("imagePickerLoading")}</p>
                ) : lbMembers.length === 0 ? (
                  <p className="muted">{t("the_leader_board_is_empty_right_now")}</p>
                ) : (
                  <>
                    <div className="lb-members">
                      {lbMembers.map((m) => (
                        <button key={m.user_id} type="button" className={"lb-member" + (lbSelected?.user_id === m.user_id ? " selected" : "")}
                          onClick={() => selectLbMember(m)}>
                          <Avatar user={{ fullname: m.fullname, username: m.username, profile_image: m.profile_image } as Partial<UserSummary>} />
                          <span className="lb-name">{displayName({ fullname: m.fullname, username: m.username } as Partial<UserSummary>)}</span>
                          <span className="lb-coins">🪙 {m.coins.toLocaleString()}</span>
                        </button>
                      ))}
                    </div>
                    {lbSelected && (
                      <>
                        <h4 style={{ color: "var(--gold)", margin: "14px 0 8px", textAlign: "center" }}>
                          {lbTotal > 0
                            ? t("gifts_for_count", displayName({ fullname: lbSelected.fullname, username: lbSelected.username } as Partial<UserSummary>), lbTotal.toLocaleString())
                            : t("gifts_for", displayName({ fullname: lbSelected.fullname, username: lbSelected.username } as Partial<UserSummary>))}
                        </h4>
                        {lbSenders === null ? (
                          <p className="muted">{t("imagePickerLoading")}</p>
                        ) : lbSenders.length === 0 ? (
                          <p className="muted">{t("no_gifts_yet")}</p>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "45vh", overflowY: "auto" }}>
                            {lbSenders.map((s) => (
                              <div key={s.user_id} className="row" style={{ padding: "8px 10px", border: "1px solid var(--gold-border)", borderRadius: 10, background: "#111" }}>
                                <Avatar user={{ fullname: s.fullname, username: s.username, profile_image: s.profile_image } as Partial<UserSummary>} />
                                <div style={{ flex: 1, minWidth: 0, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {displayName({ fullname: s.fullname, username: s.username } as Partial<UserSummary>)}
                                </div>
                                <div style={{ color: "var(--gold)", fontWeight: 800, whiteSpace: "nowrap" }}>🪙 {s.coins.toLocaleString()}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
                <button className="btn" style={{ marginTop: 12 }} onClick={() => setLbMembers(null)}>{t("close")}</button>
              </div>
            </div>
          )}

          {favExplainer && (
            <div className="modal-backdrop" onClick={() => setFavExplainer(false)}>
              <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
                <h3 style={{ color: "var(--gold)", marginTop: 0 }}>{t("favourite")}</h3>
                <p>{t("click_the_heart_to_save_a_streamer_as_a")}</p>
                <p>{t("your_favourites_always_show_first_when_y")}</p>
                <p>{t("this_is_just_for_you_nobody_is_told_and")}</p>
                <button className="btn" onClick={() => setFavExplainer(false)}>{t("got_it")}</button>
              </div>
            </div>
          )}

          {isPublisher && (
            <div className="row" style={{ marginTop: 12, flexWrap: "wrap" }}>
              <button className="btn small" onClick={live.toggleCamera}>{live.cameraOn ? "📷 Camera off" : "📷 Camera on"}</button>
              <button className="btn small" onClick={live.toggleMic}>{live.micOn ? "🎤 Mute" : "🎤 Unmute"}</button>
              <button className="btn small" onClick={live.flipCamera}>{t("flip")}</button>
              {!anyBattleOpen && (
                <button className="btn small" onClick={() => setMenuOpen(true)}>{t("battle")}</button>
              )}
              {/* The phones' (G) menu — anyone broadcasting in the room can set its game,
                  which is what setActiveTapGameForRoom itself allows. */}
              {/* Steve, 2026-10-02: "Just add a gold border around Games, Who's playing and
                  invite." The ghost variant swaps the gold border for a grey one, which is what
                  made these three look unfinished next to Battle and Mute. Games keeps its
                  "a game is running" signal in the SHADE of gold instead of by losing the border. */}
              <button className="btn small" onClick={() => setGamesMenuOpen(true)}
                style={activeGame ? { borderColor: "var(--gold-bright)", color: "var(--gold-bright)" } : undefined}>
                {t("games")}</button>
              {/* Every role gets this one, as on the phones — a plain viewer most of all. */}
              <button
                className={`btn small${mtLang ? "" : " ghost"}`}
                title={mtLang ? `Chat is being translated into ${languageName(mtLang)}` : "Translate chat messages into your language"}
                onClick={() => setMtOpen(true)}
              >
                🌐 {mtLang ? languageName(mtLang) : "Translate"}
              </button>
              {role === "host" && (
                <button className="btn small" title={t("who_is_playing_a_game_in_your_room_right")} onClick={() => setWhosPlayingOpen(true)}>{t("who_s_playing")}</button>
              )}
              {role === "host" && (
                <button className="btn small" title={t("invite_someone_you_follow_into_an_open_s")}
                  onClick={() => { if (live.tiles.length >= 4) setToast(tt("the_room_is_full")); else setInviteOpen(true); }}>{t("invite_2")}</button>
              )}
              {role === "host" && (
                <button
                  className={`btn small${voiceThanksGift ? "" : " ghost"}`}
                  title={t("say_thanks_for_the_gift_out_loud_when_so")}
                  onClick={() => { const next = !voiceThanksGift; setVoiceThanksGift(next); saveVoiceThanksGift(next); }}
                >{t("voice_thanks")}</button>
              )}
              <span className="spacer" />
              {role === "host"
                ? <button className="btn small" style={{ borderColor: "var(--red)", color: "var(--red)" }} onClick={endLive}>{t("end_live")}</button>
                : <button className="btn small ghost" onClick={leaveAsGuest}>{t("leave")}</button>}
            </div>
          )}

          {role === "host" && joinRequests.length > 0 && (
            <div className="card" style={{ marginTop: 12 }}>
              <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--line)" }}><b style={{ color: "var(--gold)" }}>{t("wants_to_join_your_live")}</b></div>
              {joinRequests.map((r) => (
                <div key={r.request_id} className="row" style={{ padding: "10px 12px" }}>
                  <Avatar user={r as Partial<UserSummary>} />
                  <div style={{ flex: 1, fontWeight: 700 }}>{displayName(r as Partial<UserSummary>)}</div>
                  <button className="btn small" onClick={() => answerRequest(r, true)}>{t("accept")}</button>
                  <button className="btn small ghost" onClick={() => answerRequest(r, false)}>{t("decline")}</button>
                </div>
              ))}
            </div>
          )}

          {soloBattle && (
            <SoloBattleStrip
              battle={soloBattle}
              myUserId={user?.id ?? null}
              onOpenStandings={() => setSoloStandingsOpen(true)}
              onToast={setToast}
              onJoined={() => { if (hostUserId) fetchActiveSoloBattle(hostUserId, user?.id).then(setSoloBattle).catch(() => undefined); }}
            />
          )}
          {activeGame && (
            <div className="card row" style={{ marginTop: 12, padding: "10px 12px" }}>
              <div style={{ flex: 1 }}>
                <b style={{ color: "var(--gold)" }}>🎮 {gameTitle(activeGame)}</b>
                <div className="muted" style={{ fontSize: 12 }}>{role === "host" ? "Running in your room — viewers can play now." : "The host started a game. 50 coins to join, and your score becomes a gift to the host."}</div>
              </div>
              <button className="btn small" onClick={() => setGameOpen(true)}>{t("play_now")}</button>
            </div>
          )}
          <div className="row" style={{ marginTop: 12, flexWrap: "wrap" }}>
            {role === "viewer" && live.status === "live" && (
              joinState === "requested"
                ? <span className="pill">{t("waiting_for_the_host_to_accept")}</span>
                : <button className="btn small" onClick={requestToJoin}>{t("ask_to_join")}</button>
            )}
            {broadcasters.filter((b) => b.user_id !== user?.id).map((b) => (
              <button key={b.user_id} className="btn small" onClick={() => setGiftTarget(b.user_id)}>{t("gift_someone", displayName(b as Partial<UserSummary>))}</button>
            ))}
            <span className="spacer" />
            <span className="muted" style={{ fontSize: 13 }}>{tn("your_coins_and_buy_more", <b style={{ color: "var(--gold)" }}>{user?.no_redeem_wallet ?? 0}</b>, <Link to="/wallet">{t("buy_more")}</Link>)}</span>
          </div>

          {giftTarget && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="row" style={{ padding: "10px 12px", borderBottom: "1px solid var(--line)" }}>
                <b style={{ color: "var(--gold)" }}>{t("send_a_gift_to", nameOfId(giftTarget) || (virtualGiftTarget ? personName(virtualGiftTarget) : ""))}</b>
                <span className="spacer" />
                <button className="btn small ghost" onClick={() => setGiftTarget(null)}>{t("close")}</button>
              </div>
              <div className="gifts">
                {gifts.map((g) => (
                  <button key={g.id} onClick={() => sendGift(g)}>
                    {g.image ? <img src={mediaUrl(g.image)} alt="" /> : <span style={{ fontSize: 28 }}>🎁</span>}
                    <span>{g.name ?? ""}</span>
                    <b>{giftPrice(g)}</b>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="card chat">
          <div className="row" style={{ padding: "10px 12px", borderBottom: "1px solid var(--line)" }}><b style={{ color: "var(--gold)" }}>{t("live_chat")}</b></div>
          <div className="log" ref={logRef}>
            {messages.map((m) => (
              <ChatLine key={m.id} m={m} translation={translations[m.id]} targetLanguage={mtLang} />
            ))}
            {messages.length === 0 && <p className="muted">{t("say_hello")}</p>}
          </div>
          <form className="compose" onSubmit={submitChat}>
            <input className="input" placeholder={t("say_something")} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={300} />
            <button className="btn small" type="submit" disabled={!draft.trim()}>{t("send")}</button>
          </form>
        </div>
      </div>
      {soloStandingsOpen && soloBattle && (
        <SoloBattleStandingsSheet battle={soloBattle} myUserId={user?.id ?? null} onClose={() => setSoloStandingsOpen(false)} />
      )}
      {whosPlayingOpen && <WhosPlayingOverlay roomName={roomName} onClose={() => setWhosPlayingOpen(false)} />}
      {mtOpen && (
        <PickerSheet
          title={t("message_translation")}
          noun="language"
          selected={mtLang ?? ""}
          items={[{ code: "", name: "None — show messages exactly as sent" },
                  ...TRANSLATION_LANGUAGES.map((l) => ({ code: l.code, name: `${l.name} · ${l.native}` }))]}
          onPick={pickMtLang}
          onClose={() => setMtOpen(false)}
        />
      )}
      {inviteOpen && myId !== null && (
        <InviteOverlay myUserId={myId} roomName={roomName} onToast={setToast} onClose={() => setInviteOpen(false)}
          excludeIds={new Set([myId, ...live.tiles.map((t) => t.userId).filter((id): id is number => id !== null)])} />
      )}
      {gamesMenuOpen && user && (
        <HostGamesMenu
          userId={user.id}
          roomName={roomName}
          activeGame={activeGame}
          onClose={() => setGamesMenuOpen(false)}
          onChanged={() => fetchActiveTapGame(roomName).then(setActiveGame).catch(() => undefined)}
          onToast={setToast}
        />
      )}
      {gameOpen && activeGame && (
        activeGame.game_mode === "one_stroke"
          // Steve, 2026-10-12: "Create this game." — a fifth engine with its own overlay, since
          // nothing about tracing a shape shares the spawn-and-tap machinery the other modes do.
          ? <OneStrokeOverlay onClose={() => setGameOpen(false)} />
          : activeGame.game_mode === "block_escape"
          // Steve, 2026-10-12: the sixth engine — drag a block, it slides until something stops
          // it, match it to its own gate to get it out. Its own overlay for the same reason.
          ? <BlockEscapeOverlay onClose={() => setGameOpen(false)} />
          : <TapGameOverlay game={activeGame} roomName={roomName} onClose={() => setGameOpen(false)} onToast={setToast} />
      )}
      {bingoOpen && bingoGame && myId !== null && (
        <BingoOverlay
          game={bingoGame}
          myUserId={myId}
          isHost={role === "host"}
          // The live faces above the card. The room's own tiles are attached to a SECOND
          // video element each — LiveKit allows one track on several elements, and the
          // browser shares the decoded frames, so this costs a draw rather than a decode.
          strip={orderedTiles.map((t) => (
            <BingoStripTile key={t.identity} tile={t} label={t.isLocal ? displayName(user) : displayName(nameOf(t.userId) as Partial<UserSummary> ?? { fullname: t.name })} />
          ))}
          onBuy={async (card, cell) => {
            // One at a time: a fast double-double-click would otherwise fire two charges for
            // one square, and only the second would be refused — after the first had been paid.
            if (bingoBuying.current) return;
            if (card.user_id === myId) {
              // sendCoinsToUser has refused a self-gift app-wide since long before bingo, and
              // the card this opens on is YOUR OWN — so answer it here, in bingo's own words,
              // rather than letting the server reply about votes.
              setToast(bingoGame.cards.length > 1
                ? "That's your own card — pick another player's card to gift."
                : "This is your card — the people watching buy your squares.");
              return;
            }
            bingoBuying.current = true;
            const problem = await buyBingoSquare(myId, card.user_id, card.bingo_card_id, cell, roomName);
            bingoBuying.current = false;
            if (problem) setToast(problem);
            // Straight back to the server for the truth rather than painting the cover
            // locally: the same call brings back anything that just fell, and any square
            // somebody else bought while this one was in flight.
            await refreshBingo();
          }}
          onEndGame={async () => {
            const problem = await cancelBingoBattle(myId, bingoGame.bingo_game_id);
            setToast(problem ?? tt("bingo_game_ended"));
            await refreshBingo();
          }}
          onClose={() => setBingoOpen(false)}
        />
      )}
      {pyramidOpen && pyramidGame && myId !== null && (
        <PyramidOverlay
          game={pyramidGame}
          myUserId={myId}
          onSend={async (playerId, flowers) => {
            if (playerId === myId) { setToast("That's you — the people watching send your Flowers."); return; }
            if (pyramidSending.current) return;
            pyramidSending.current = true;
            const problem = await sendPyramidFlowers(myId, playerId, pyramidGame.pyramid_game_id, flowers, roomName);
            pyramidSending.current = false;
            setToast(problem ?? (flowers === 1 ? "🌹 Sent!" : `🌹 x${flowers} sent!`));
            await refreshPyramid();
          }}
          onEnd={async () => {
            const problem = await cancelPyramidBattle(myId, pyramidGame.pyramid_game_id);
            if (problem) setToast(problem);
            await refreshPyramid();
          }}
          onClose={() => { pyramidClosedId.current = pyramidGame.pyramid_game_id; setPyramidOpen(false); }}
        />
      )}
      {pyramidStartOpen && myId !== null && (
        <PyramidStartDialog
          candidates={broadcasters.filter((b) => b.user_id !== myId).map((b) => ({ userId: b.user_id, name: personName(b) }))}
          onClose={() => setPyramidStartOpen(false)}
          onStart={async (others, price, minutes) => {
            setPyramidStartOpen(false);
            const { game, message } = await startPyramidBattle(myId, roomName, others, price, minutes);
            if (!game) { setToast(message ?? "Couldn't start the Pyramid game."); return; }
            pyramidClosedId.current = null;
            setPyramidGame(game);
            setPyramidOpen(true);
          }}
        />
      )}
      {boardOpen && boardGame && myId !== null && (
        <BoardGameOverlay
          game={boardGame}
          myUserId={myId}
          tileFor={(id) => orderedTiles.find((t) => (t.isLocal ? id === myId : t.userId === id))}
          onMove={async (key) => {
            if (boardBusy.current) return;
            boardBusy.current = true;
            const { game, message } = await makeBoardMove(myId, boardGame.board_game_id, key);
            boardBusy.current = false;
            if (message) setToast(message);
            if (game) setBoardGame(game); else await refreshBoard();
          }}
          onBuy={async (recipientId, powerup, move) => {
            if (boardBusy.current) return;
            boardBusy.current = true;
            const { game, message } = await buyBoardPowerup(myId, recipientId, boardGame.board_game_id, powerup, roomName, move);
            boardBusy.current = false;
            setToast(message ?? (powerup === "vote" ? "🗳 Vote counted!" : powerup === "time" ? "⏱ +30 seconds sent!" : powerup === "freeze" ? "❄ Frozen!" : "💡 Hint sent!"));
            if (game) setBoardGame(game); else await refreshBoard();
          }}
          onResign={async () => {
            const problem = await resignBoardGame(myId, boardGame.board_game_id);
            if (problem) setToast(problem);
            await refreshBoard();
          }}
          onEnd={async () => {
            const problem = await cancelBoardGame(myId, boardGame.board_game_id);
            if (problem) setToast(problem);
            await refreshBoard();
          }}
          onClose={() => { boardClosedId.current = boardGame.board_game_id; setBoardOpen(false); }}
        />
      )}
      {boardStartKind !== null && myId !== null && (
        <BoardGameStartDialog
          kind={boardStartKind}
          candidates={broadcasters.filter((b) => b.user_id !== myId).map((b) => ({ userId: b.user_id, name: personName(b) }))}
          onClose={() => setBoardStartKind(null)}
          onStart={async (s) => {
            setBoardStartKind(null);
            const { game, message } = await startBoardGame(myId, roomName, s);
            if (!game) { setToast(message ?? "Couldn't start the game."); return; }
            boardClosedId.current = null;
            setBoardGame(game);
            setBoardOpen(true);
          }}
        />
      )}
      {bingoBoardOpen && <BingoBoardOverlay onClose={() => setBingoBoardOpen(false)} />}
      {bingoFinishedId !== null && (
        <BingoWinnersOverlay bingoGameId={bingoFinishedId} onClose={() => setBingoFinishedId(null)} />
      )}
      {bingoStartOpen && myId !== null && (
        <BingoStartDialog
          defaultPrice={bingoClamp(BINGO_FALLBACK)}
          candidates={broadcasters.filter((b) => b.user_id !== myId).map((b) => ({ userId: b.user_id, name: personName(b) }))}
          onClose={() => setBingoStartOpen(false)}
          onStart={async (others, price) => {
            setBingoStartOpen(false);
            const { game, message } = await startBingoBattle(myId, roomName, others, price);
            if (!game) { setToast(message ?? tt("couldn_t_start_the_bingo_game")); return; }
            bingoAutoOpened.current = game.bingo_game_id;
            setBingoGame(game);
            setBingoOpen(true);
          }}
        />
      )}
      {menuOpen && (
        <BattleMenu peopleOnScreen={broadcasters.length} onClose={() => setMenuOpen(false)} onNotice={setToast} onPick={(k) => {
          setMenuOpen(false);
          if (k === "virtual") { if (role === "host") setPicker("virtual"); else setToast(tt("only_the_live_host_can_start_a_virtual_b")); return; }
          if (k === "1v1") setBattlePicker(true);
          else if (k === "gameLimit") setGameLimitPicker(true);
          else if (k === "hideSeek") setHideSeekMode("choose");
          else if (k === "solo") startSolo();
          else if (k === "bingo") openBingo();
          else if (k === "pyramid") openPyramid();
          else if (k === "checkers" || k === "chess") openBoard(k);
          else if (k === "bingoBoard") setBingoBoardOpen(true);
          // The 31-day challenge and the three reference rows open their own overlay off the
          // same `picker` state — they start nothing, so they need no people-picker step.
          else setPicker(k);
        }} />
      )}
      {picker === "challenge31" && myId && (
        <Challenge31Overlay userId={myId} onClose={() => setPicker(null)} onNotice={setToast} />
      )}
      {picker === "pkContests" && myId && (
        <PkContestsOverlay userId={myId} onClose={() => setPicker(null)} />
      )}
      {picker === "lifetimeBoard" && (
        <LifetimeBoardOverlay onClose={() => setPicker(null)} />
      )}
      {picker === "punishments" && (
        <PunishmentsOverlay onClose={() => setPicker(null)} />
      )}
      {hideSeekMode === "choose" && (
        <Overlay title={t("hide_seek")} onClose={() => setHideSeekMode(null)}>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>{t("n5_minutes_most_gift_coins_wins_but_nobod")}</p>
          {/* Steve, 2026-09-27: "1v1 on top, 2v2 below, 3 members below, 4 members last." */}
          <div style={{ display: "grid", gap: 8 }}>
            <button className="btn" style={{ background: "var(--gold-border)", color: "#000", borderColor: "#000" }} onClick={() => setHideSeekMode(1)}>1v1</button>
            <button className="btn" style={{ background: "var(--gold-border)", color: "#000", borderColor: "#000" }} onClick={() => setHideSeekMode("2v2")}>2v2</button>
            <button className="btn" style={{ background: "var(--gold-border)", color: "#000", borderColor: "#000" }} onClick={() => setHideSeekMode(2)}>{t("n3_members")}</button>
            <button className="btn" style={{ background: "var(--gold-border)", color: "#000", borderColor: "#000" }} onClick={() => setHideSeekMode(3)}>{t("n4_members")}</button>
          </div>
        </Overlay>
      )}
      {typeof hideSeekMode === "number" && myId && (
        <MultiPicker title={`🙈 Hide & Seek · ${hideSeekMode === 1 ? "1v1" : `${hideSeekMode + 1} members`}`} blurb={t("one_5_minute_round_scores_hidden_until_t")} exact={hideSeekMode}
          people={broadcasters.filter((b) => b.user_id !== myId)} onClose={() => setHideSeekMode(null)}
          onSubmit={async (ids) => {
            try { await createSeries(myId, roomName, 1, ids, true); setHideSeekMode(null); setToast(tt("hide_seek_invites_sent")); }
            catch (e) { setToast((e as Error).message); }
          }} />
      )}
      {hideSeekMode === "2v2" && myId && (
        <TwoVTwoPicker people={broadcasters.filter((b) => b.user_id !== myId)} onClose={() => setHideSeekMode(null)}
          onSubmit={async (teammate, o1, o2) => {
            try { await invite2v2(myId, roomName, teammate, o1, o2, true); setHideSeekMode(null); setToast(tt("hide_seek_2v2_invites_sent")); }
            catch (e) { setToast((e as Error).message); }
          }} />
      )}
      {picker === "series" && myId && (
        <MultiPicker title={t("best_out_of")} blurb={t("n5_minute_rounds_first_to_win_more_than_h")} lengths={[3, 5, 7, 9, 11]}
          people={broadcasters.filter((b) => b.user_id !== myId)} onClose={() => setPicker(null)}
          onSubmit={async (ids, length) => {
            try { await createSeries(myId, roomName, length ?? 5, ids); setPicker(null); setToast(`Best Out Of ${length} invites sent.`); }
            catch (e) { setToast((e as Error).message); }
          }} />
      )}
      {picker === "virtual" && myId && (
        <VirtualPicker myUserId={myId} guests={broadcasters.filter((b) => b.user_id !== myId)} onClose={() => setPicker(null)}
          onSubmit={async (ids) => {
            await startVirtualBattle(myId, roomName, ids); setPicker(null); setToast(tt("virtual_battle_started_5_minutes_on_the"));
          }} />
      )}
      {virtualRecord && (
        <VirtualGiftRecordOverlay record={virtualRecord} myUserId={myId} onClose={() => setVirtualRecord(null)}
          onThank={async (to, message) => {
            if (!myId) return;
            try { setToast(await sendVirtualThankYou(myId, virtualRecord.battle.virtual_battle_id, to, message)); }
            catch (e) { setToast((e as Error).message); }
          }} />
      )}
      {picker === "2v2" && myId && (
        <TwoVTwoPicker people={broadcasters.filter((b) => b.user_id !== myId)} onClose={() => setPicker(null)}
          onSubmit={async (teammate, o1, o2) => {
            try { await invite2v2(myId, roomName, teammate, o1, o2); setPicker(null); setToast(tt("n2v2_invites_sent")); }
            catch (e) { setToast((e as Error).message); }
          }} />
      )}
      {picker === "marathon" && myId && (
        <MultiPicker title={t("no_time_limit")} blurb={t("no_clock_the_first_player_to_reach_100_0")}
          people={broadcasters.filter((b) => b.user_id !== myId)} onClose={() => setPicker(null)}
          onSubmit={async (ids) => {
            try { await inviteMarathon(myId, roomName, ids); setPicker(null); setToast(tt("no_time_limit_invites_sent")); }
            catch (e) { setToast((e as Error).message); }
          }} />
      )}
      {picker === "555" && myId && (
        <MultiPicker title="5-5-5" blurb={t("n5_games_5_minutes_reach_5000_coins_and_w")}
          people={broadcasters.filter((b) => b.user_id !== myId)} onClose={() => setPicker(null)}
          onSubmit={async (ids) => {
            try { await invite555(myId, roomName, ids); setPicker(null); setToast(tt("n5_5_5_invites_sent")); }
            catch (e) { setToast((e as Error).message); }
          }} />
      )}
      {series.invite && (
        <InviteCard title={series.invite.hide_scores ? t("hide_seek") : t("best_out_of")} onClose={series.dismissInvite} onAnswer={(ok) => series.respond(series.invite!.series_id, ok).catch((e) => setToast((e as Error).message))}
          body={series.invite.hide_scores
            ? t("invites_you_to_hide_and_seek", displayName({ fullname: series.invite.host_fullname, username: series.invite.host_username } as Partial<UserSummary>))
            : t("invites_you_to_best_out_of", displayName({ fullname: series.invite.host_fullname, username: series.invite.host_username } as Partial<UserSummary>), series.invite.length)} />
      )}
      {two.invite && (
        <InviteCard title={two.invite.hide_scores ? t("hide_seek_2v2") : t("n2v2_battle")} onClose={two.dismissInvite} onAnswer={(ok) => two.respond(two.invite!.battle_id, ok).catch((e) => setToast((e as Error).message))} body={`${describe2v2Invite(two.invite)}${two.invite.hide_scores ? ` ${t("hide_seek_nobody_sees_scores")}` : ""}`} />
      )}
      {marathon.invite && (
        <InviteCard title={t("no_time_limit")} onClose={marathon.dismissInvite} onAnswer={(ok) => marathon.respond(marathon.invite!.marathon_id, ok).catch((e) => setToast((e as Error).message))}
          body={t("invites_you_to_no_time_limit", displayName({ fullname: marathon.invite.host_fullname, username: marathon.invite.host_username } as Partial<UserSummary>), marathon.invite.target_points.toLocaleString())} />
      )}
      {b555.invite && (
        <InviteCard title={t("n5_5_5")} onClose={b555.dismissInvite} onAnswer={(ok) => b555.respond(b555.invite!.battle_555_id, ok).catch((e) => setToast((e as Error).message))}
          body={t("invites_you_to_555", displayName({ fullname: b555.invite.host_fullname, username: b555.invite.host_username } as Partial<UserSummary>), b555.invite.coins_per_game.toLocaleString())} />
      )}
      {result && (
        <ResultOverlay
          title={result.title}
          rows={result.rows}
          onClose={() => setResult(null)}
          sharing={sharingRecap}
          onShare={result.recap ? () => shareBattleRecap(result.recap!.id, result.recap!.engine) : undefined}
        />
      )}
      {battlePicker && (
        <Overlay title={t("bingg_bongg_battle_who_do_you_challenge")} onClose={() => setBattlePicker(false)}>
          {broadcasters.filter((b) => b.user_id !== user?.id).map((b) => (
            <button key={b.user_id} className="btn block" style={{ marginBottom: 8 }} onClick={async () => {
              setBattlePicker(false);
              try { await battle.inviteOpponent(b.user_id); setToast(`Battle invite sent to ${displayName(b as Partial<UserSummary>)}.`); }
              catch (e) { setToast((e as Error).message); }
            }}>{displayName(b as Partial<UserSummary>)}</button>
          ))}
          <p className="muted" style={{ fontSize: 12 }}>{t("n5_minute_battle_whoever_receives_more_gi")}</p>
        </Overlay>
      )}
      {gameLimitPicker && (
        <Overlay title={t("game_limit_who_do_you_challenge")} onClose={() => { setGameLimitPicker(false); setGameLimitTarget(""); }}>
          <label className="soft" style={{ fontSize: 13 }}>{t("coins_to_win")}</label>
          <input className="input" inputMode="numeric" value={gameLimitTarget} placeholder="e.g. 5000"
            onChange={(e) => setGameLimitTarget(e.target.value.replace(/[^0-9]/g, ""))}
            style={{ width: "100%", marginBottom: 12 }} />
          {broadcasters.filter((b) => b.user_id !== user?.id).map((b) => (
            <button key={b.user_id} className="btn block" style={{ marginBottom: 8 }} onClick={async () => {
              const target = Number(gameLimitTarget);
              if (!target || target <= 0) { setToast(tt("enter_how_many_coins_wins_it")); return; }
              setGameLimitPicker(false);
              setGameLimitTarget("");
              try { await battle.inviteOpponent(b.user_id, target); setToast(`Game Limit invite sent to ${displayName(b as Partial<UserSummary>)} — first to ${target.toLocaleString()} coins.`); }
              catch (e) { setToast((e as Error).message); }
            }}>{displayName(b as Partial<UserSummary>)}</button>
          ))}
          <p className="muted" style={{ fontSize: 12 }}>{t("first_to_your_coin_target_wins_instantly")}</p>
        </Overlay>
      )}
      {battle.invite && (
        <Overlay title={t("bingg_bongg_battle")} onClose={battle.dismissInvite}>
          <p className="soft">{battle.invite.target_coins
    ? t("challenges_you_target", battle.invite.opponent_fullname ?? battle.invite.opponent_username ?? t("a_streamer"), battle.invite.target_coins)
    : t("challenges_you", battle.invite.opponent_fullname ?? battle.invite.opponent_username ?? t("a_streamer"))}</p>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" style={{ flex: 1 }} onClick={() => battle.respond(battle.invite!.battle_id, true).catch((e) => setToast((e as Error).message))}>{t("accept")}</button>
            <button className="btn ghost" style={{ flex: 1 }} onClick={() => battle.respond(battle.invite!.battle_id, false).catch((e) => setToast((e as Error).message))}>{t("decline")}</button>
          </div>
        </Overlay>
      )}
      {battleResult && user && (
        <Overlay title={battleResult.winner_user_id === null ? "It's a tie" : battleResult.winner_user_id === user.id ? "🏆 You won!" : "You lost this one"} onClose={() => setBattleResult(null)}>
          <p className="soft" style={{ textAlign: "center", fontSize: 18 }}>
            {displayName(nameOf(battleResult.player_one_user_id) as Partial<UserSummary>)} {battleResult.player_one_score} — {battleResult.player_two_score} {displayName(nameOf(battleResult.player_two_user_id) as Partial<UserSummary>)}
          </p>
          {/* Battle Recap (Steve, 2026-10-07). Shown to the LOSER exactly as to the winner —
              "the loser has as much reason to post it as the winner" is the whole mechanic. */}
          <button
            className="btn block"
            style={{ marginTop: 12 }}
            disabled={sharingRecap}
            onClick={() => shareBattleRecap(battleResult.battle_id)}
          >
            {sharingRecap ? "Getting your recap…" : "Share this result"}
          </button>
          <button className="btn block ghost" style={{ marginTop: 8 }} onClick={() => setBattleResult(null)}>{t("close")}</button>
        </Overlay>
      )}
      {introQueue > 0 && <BattleIntro onDone={() => setIntroQueue((n) => Math.max(0, n - 1))} />}
      {toast && <div className="notice" style={{ position: "fixed", left: 16, right: 16, bottom: 16, maxWidth: 480, margin: "0 auto", zIndex: 30 }}>{toast}</div>}
    </div>
  );
}

function BattleStrip({ b, secondsLeft, nameOf }: { b: BattleData; secondsLeft: number | null; nameOf: (id: number) => string }) {
  const clock = secondsLeft === null ? "" : `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;
  const p1 = b.player_one_score ?? 0, p2 = b.player_two_score ?? 0;
  const total = p1 + p2;
  const pct = total > 0 ? Math.round((p1 / total) * 100) : 50;
  return (
    <div className="card" style={{ marginBottom: 8, padding: "8px 12px" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b style={{ color: "var(--gold)" }}>{b.target_coins ? "Game Limit" : "Bingg Bongg Battle"}</b>
        <span className="pill">{b.status === "pending" ? "Waiting for answer…" : clock}</span>
      </div>
      <div className="row" style={{ justifyContent: "space-between", marginTop: 6, fontSize: 13 }}>
        <span><b>{nameOf(b.player_one_user_id)}</b> <span style={{ color: "var(--gold)" }}>{p1.toLocaleString()}</span></span>
        <span><span style={{ color: "var(--gold)" }}>{p2.toLocaleString()}</span> <b>{nameOf(b.player_two_user_id)}</b></span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "#2a2a2a", overflow: "hidden", marginTop: 6 }}>
        <div style={{ width: `${pct}%`, height: 6, background: "var(--gold)" }} />
      </div>
    </div>
  );
}

/** Full-screen battle-start clip (same file the phones bundle). Ends on its own; a browser
 *  that refuses sound falls back to muted playback, and a stalled load never blocks the room. */
function BattleIntro({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const done = useRef(false);
  const finish = useCallback(() => { if (!done.current) { done.current = true; onDone(); } }, [onDone]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.play().catch(() => { el.muted = true; el.play().catch(finish); });
    const t = setTimeout(finish, 15000);
    return () => clearTimeout(t);
  }, [finish]);
  return (
    <div className="battle-intro" onClick={finish}>
      <video ref={ref} src="/battle_start.mp4" playsInline onEnded={finish} onError={finish} />
    </div>
  );
}

// Steve, 2026-09-26: "the camera supposed to shut off and their image supposed to show if image
// is available, if the image is not available please add their initials in the circle." While a
// tile's camera is off (own or anyone's — LiveKit's TrackMuted), the video is covered by a black
// plate with the member's Avatar (photo, else initials on gold) in the middle.
/** One face in the bingo card's strip: a SECOND video element on a track the room's own grid
 *  is already showing. LiveKit allows a track on several elements and the browser shares the
 *  decoded frames, so this costs a draw, not a decode — which is why the web (like iOS, and
 *  unlike Android) never has to move the room's real tiles into the overlay. */
function BingoStripTile({ tile, label }: { tile: LiveTile; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return tile.attach(el);
  }, [tile]);
  return (
    <>
      <video ref={ref} autoPlay playsInline muted style={tile.isLocal ? { transform: "scaleX(-1)" } : undefined} />
      <span className="name" style={{ position: "absolute", left: 6, top: 6 }}>{label || "Guest"}</span>
    </>
  );
}

function VideoTile({ tile, label, user }: { tile: LiveTile; label: string; user?: Partial<UserSummary> | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return tile.attach(el);
  }, [tile]);
  return (
    <div className={`tile${tile.speaking ? " speaking" : ""}`}>
      <video ref={ref} autoPlay playsInline muted={tile.isLocal} style={tile.isLocal ? { transform: "scaleX(-1)" } : undefined} />
      {tile.muted && (
        <div style={{ position: "absolute", inset: 0, background: "#000", display: "grid", placeItems: "center" }}>
          <div style={{ transform: "scale(2.2)" }}><Avatar user={user ?? { fullname: label }} size="lg" /></div>
        </div>
      )}
      <span className="name">{label || "Guest"}{tile.muted ? " · camera off" : ""}</span>
    </div>
  );
}

/**
 * One line of live chat, with the phones' translation layout.
 *
 * LiveChatAdapter on Android builds `Name: [Source: ]original` and, only when the translation
 * genuinely differs, a second line `Target: translated`. The "only when it differs" check is the
 * important half: without it an English room shows every line twice, which is what makes the
 * feature feel broken rather than helpful.
 */
function ChatLine({ m, translation, targetLanguage }: {
  m: ChatMessage;
  translation?: TranslationResult;
  targetLanguage: string | null;
}) {
  const { t } = useT();
  const original = m.message;
  const translated = translation?.translated;
  const differs = !!translated && translated.trim().toLowerCase() !== original.trim().toLowerCase();
  const sourceLabel = differs ? languageName(translation?.detectedSource) : "";
  const targetLabel = differs && targetLanguage ? languageName(targetLanguage) : "";

  return (
    <div>
      <div>
        <span className="who">{m.senderName || "Member"}: </span>
        {m.stickerUrl ? (
          <img src={mediaUrl(m.stickerUrl)} alt={t("sticker")} style={{ width: 64, display: "inline-block" }} />
        ) : (
          <span className="soft">
            {sourceLabel && <span style={{ color: "var(--gold)" }}>{sourceLabel}: </span>}
            {original}
          </span>
        )}
      </div>
      {differs && (
        <div style={{ paddingLeft: 2 }}>
          <span className="soft">
            {targetLabel && <span style={{ color: "var(--gold)" }}>{targetLabel}: </span>}
            {translated}
          </span>
        </div>
      )}
    </div>
  );
}
