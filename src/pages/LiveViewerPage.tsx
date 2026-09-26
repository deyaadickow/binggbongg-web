import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { displayName, giftPrice, mediaUrl, post, type Gift, type UserSummary } from "../lib/api";
import { useSession } from "../lib/session";
import { chatChannel, ensureFirebaseSignIn, observeChat, sendChat, type ChatMessage } from "../lib/firebase";
import { useLiveRoom, type LiveRole, type LiveTile } from "../lib/live";
import { activeBoxingWindow, useBattle, type BattleData } from "../lib/battle";
import { FIVE_FIVE_FIVE, MARATHON, SERIES, TWO_V_TWO, cancel555, createSeries, finalize2v2, finalizeSeriesRound, invite2v2, invite555, inviteMarathon, secondsUntil, useEngine, voteMarathonCancel, type B555Data, type Battle2v2Data, type MarathonData, type SeriesData } from "../lib/battles";
import { B555Strip, BattleMenu, InviteCard, MarathonStrip, MultiPicker, Overlay, ResultOverlay, SeriesStrip, TwoVTwoPicker, TwoVTwoStrip, describe2v2Invite, personName, resultTitle, type BattleKind } from "../components/BattleEngines";
import { Challenge31Overlay, LifetimeBoardOverlay, PkContestsOverlay, PunishmentsOverlay } from "../components/BattleReference";
import { fetchActiveTapGame, gameTitle, type TapGameType } from "../lib/tapgame";
import { TapGameOverlay } from "../components/TapGameOverlay";
import { HostGamesMenu } from "../components/HostGamesMenu";
import { SoloBattleStandingsSheet, SoloBattleStrip } from "../components/SoloBattle";
import { fetchActiveSoloBattle, startSoloBattle, type SoloBattle } from "../lib/solobattle";
import { Avatar, Notice } from "../components/Common";

interface Member { user_id: number; fullname?: string; username?: string; profile_image?: string; country?: string }
interface RoomMembers { host_user_id: number; host_fullname?: string; host_username?: string; host_profile_image?: string; host_country?: string; guests: Member[] }
interface JoinRequest { request_id: number; user_id: number; fullname?: string; username?: string; profile_image?: string }

const HEARTBEAT_MS = 20000;
const MEMBERS_POLL_MS = 5000;

/** One page for every role: viewer (default), guest (after the host approves), host (?host=1). */
export function LiveViewerPage() {
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
  const logRef = useRef<HTMLDivElement>(null);

  // Auto Voice Thanks — TTS settings loaded from the backend for the host.
  const [voiceThanksGift, setVoiceThanksGift] = useState(true);
  // Raw TTS voice settings needed to call synthesizeSpeech with the host's own voice preference.
  const ttsVoiceRef = useRef<{ voiceType: string; language: string; volume: number; enabled: boolean; filter: string; minCoins: number; blacklistWords: string }>({ voiceType: "male_deep", language: "en-US", volume: 1, enabled: true, filter: "", minCoins: 0, blacklistWords: "[]" });
  // Tracks the sentAt watermark so we only fire for NEW gift messages, not replayed history.
  const lastSeenGiftSentAtRef = useRef<number>(Date.now());

  const live = useLiveRoom(roomName, role, isLoggedIn && !roomClosed);
  const isPublisher = role !== "viewer" && live.status === "live";

  // Bingg Bongg Battle (1v1). Result overlay for the two battlers, a toast for everyone else.
  const [battleResult, setBattleResult] = useState<BattleData | null>(null);
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
    else setToast(b.winner_user_id ? "Battle over!" : "Battle over — it's a tie!");
    refresh();
  }, [user, refresh]);
  // Steve, 2026-09-06 (phones) / 2026-09-24 (web): the battle-start clip plays for everyone in
  // the room the moment any battle goes active. Queued if one is already playing.
  const [introQueue, setIntroQueue] = useState(0);
  const onAnyBattleStarted = useCallback(() => setIntroQueue((n) => n + 1), []);
  const battle = useBattle(roomName, user?.id ?? null, isPublisher, isLoggedIn && !roomClosed, onBattleCompleted, onAnyBattleStarted);

  // The other four engines: Best Out Of, 2v2, No Time Limit, 5-5-5. One result overlay at a time.
  const [result, setResult] = useState<{ title: string; rows: { label: string; value: string; win?: boolean }[] } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [picker, setPicker] = useState<BattleKind | null>(null);
  const myId = user?.id ?? null;
  const nameOfId = useCallback((id: number | null | undefined) => {
    const m = broadcastersRef.current.find((b) => b.user_id === id);
    return m ? displayName(m as Partial<UserSummary>) : "";
  }, []);
  const onSeriesFinished = useCallback((d: SeriesData) => {
    const acc = d.participants.filter((p) => p.invite_status === "accepted");
    setResult({
      title: resultTitle(d.winner_user_id, myId, acc.some((p) => p.user_id === myId), d.status === "cancelled"),
      rows: acc.map((p) => ({ label: nameOfId(p.user_id) || personName(p), value: `${p.rounds_won ?? 0} round${p.rounds_won === 1 ? "" : "s"}`, win: p.user_id === d.winner_user_id })),
    });
    refresh();
  }, [myId, nameOfId, refresh]);
  const on2v2Finished = useCallback((d: Battle2v2Data) => {
    const mine = d.participants.find((p) => p.user_id === myId);
    const iPlayed = !!mine && mine.invite_status === "accepted";
    const iWon = !!mine && d.winning_team === mine.team;
    const team = (t: "A" | "B") => d.participants.filter((p) => p.team === t).map((p) => nameOfId(p.user_id) || personName(p)).join(" & ");
    setResult({
      title: d.status === "cancelled" ? "Battle cancelled" : !d.winning_team ? "It's a tie" : !iPlayed ? "Battle over!" : iWon ? "🏆 Your team won!" : "Your team lost this one",
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
  const enginesOn = isLoggedIn && !roomClosed;
  const series = useEngine(SERIES, roomName, myId, isPublisher, enginesOn, onSeriesFinished, onAnyBattleStarted);
  const two = useEngine(TWO_V_TWO, roomName, myId, isPublisher, enginesOn, on2v2Finished, onAnyBattleStarted);
  const marathon = useEngine(MARATHON, roomName, myId, isPublisher, enginesOn, onMarathonFinished, onAnyBattleStarted);
  const b555 = useEngine(FIVE_FIVE_FIVE, roomName, myId, isPublisher, enginesOn, on555Finished, onAnyBattleStarted);
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
    if (role !== "host" || !user) { setToast("Only the host can start a Solo Battle."); return; }
    try {
      const b = await startSoloBattle(user.id);
      setSoloBattle(b);
      setToast("Solo Battle started — viewers have a couple of minutes to join.");
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
  broadcastersRef.current = broadcasters;

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
  }, [role, user]);

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
      const res = await post("sendCoinsToUser", { my_user_id: user.id, user_id: giftTarget, coins: giftPrice(gift), gift_id: gift.id, room_name: roomName, ...tag });
      if (!res.status) throw new Error(res.message ?? "Couldn't send that gift.");
      setToast(`Sent ${gift.name ?? "a gift"} (${giftPrice(gift)} coins) to ${displayName(nameOf(giftTarget) as Partial<UserSummary>)}`);
      setGiftTarget(null);
      refresh();
    } catch (err) { setToast((err as Error).message); }
  }

  async function requestToJoin() {
    if (!user) return;
    try {
      const res = await post<unknown>("requestToJoinLive", { user_id: user.id, room_name: roomName });
      if (!res.status) throw new Error(res.message ?? "Couldn't send the request.");
      const st = (res as { member_status?: string }).member_status;
      setJoinState(st === "approved" ? "approved" : "requested");
      setToast(st === "approved" ? "You're in — joining as a guest." : "Request sent. The host will see it in a moment.");
    } catch (err) { setToast((err as Error).message); }
  }

  async function answerRequest(r: JoinRequest, approve: boolean) {
    if (!user) return;
    try {
      const res = await post("respondToJoinRequest", { user_id: user.id, request_id: r.request_id, approve });
      if (!res.status) throw new Error(res.message ?? "Couldn't answer that request.");
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
    live.disconnect();
    navigate("/live", { replace: true });
  }

  const hostCard = members ? { fullname: members.host_fullname, username: members.host_username, profile_image: members.host_profile_image } : null;
  const orderedTiles = [...live.tiles].sort((a, b) => (a.userId === hostUserId ? -1 : b.userId === hostUserId ? 1 : 0));
  const statusLabel = roomClosed || live.status === "ended" ? "ENDED" : live.status === "live" ? "● LIVE" : live.status === "error" ? "ERROR" : "CONNECTING";

  if (!isLoggedIn) {
    return <div className="page"><Notice>Sign in to watch this live, chat and send gifts. <Link to="/login">Sign in</Link></Notice></div>;
  }

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
      {(roomClosed || live.status === "ended") && <Notice>This live has ended. <Link to="/live">See who else is live</Link></Notice>}

      <div className="live-layout">
        <div>
          {battle.battle && battle.battle.status !== "completed" && (
            <BattleStrip b={battle.battle} secondsLeft={battle.secondsLeft} nameOf={(id) => displayName(nameOf(id) as Partial<UserSummary>)} />
          )}
          {series.data && <SeriesStrip d={series.data} now={series.now} nameOf={nameOfId} />}
          {two.data && <TwoVTwoStrip d={two.data} now={two.now} nameOf={nameOfId} />}
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
          <div className={`video-grid count-${Math.min(4, Math.max(1, orderedTiles.length))}`}>
            {orderedTiles.length === 0 && (
              <div className="tile" style={{ display: "grid", placeItems: "center" }}>
                <span className="muted">{live.status === "live" ? "Waiting for video…" : "Connecting…"}</span>
              </div>
            )}
            {orderedTiles.map((t) => <VideoTile key={t.identity} tile={t} user={t.isLocal ? user : (nameOf(t.userId) as Partial<UserSummary> | undefined) ?? { fullname: t.name }} label={t.isLocal ? `${displayName(user)} (you)` : displayName(nameOf(t.userId) as Partial<UserSummary> ?? { fullname: t.name })} />)}
            {boxing && (
              <div className="boxing-gloves" title="Boxing gloves: every gift counts double">
                <img src="/boxing_gloves.png" alt="Boxing gloves — double points" />
                <span className="clock">{boxingLeft}s</span>
              </div>
            )}
          </div>

          {isPublisher && (
            <div className="row" style={{ marginTop: 12, flexWrap: "wrap" }}>
              <button className="btn small" onClick={live.toggleCamera}>{live.cameraOn ? "📷 Camera off" : "📷 Camera on"}</button>
              <button className="btn small" onClick={live.toggleMic}>{live.micOn ? "🎤 Mute" : "🎤 Unmute"}</button>
              <button className="btn small" onClick={live.flipCamera}>🔄 Flip</button>
              {!anyBattleOpen && (
                <button className="btn small" onClick={() => setMenuOpen(true)}>⚔️ Battle</button>
              )}
              {/* The phones' (G) menu — anyone broadcasting in the room can set its game,
                  which is what setActiveTapGameForRoom itself allows. */}
              <button className={`btn small${activeGame ? "" : " ghost"}`} onClick={() => setGamesMenuOpen(true)}>
                🎮 Games
              </button>
              {role === "host" && (
                <button
                  className={`btn small${voiceThanksGift ? "" : " ghost"}`}
                  title="Say 'Thanks for the gift' out loud when someone sends a gift"
                  onClick={() => { const next = !voiceThanksGift; setVoiceThanksGift(next); saveVoiceThanksGift(next); }}
                >🔊 Voice Thanks</button>
              )}
              <span className="spacer" />
              {role === "host"
                ? <button className="btn small" style={{ borderColor: "var(--red)", color: "var(--red)" }} onClick={endLive}>End live</button>
                : <button className="btn small ghost" onClick={leaveAsGuest}>Leave</button>}
            </div>
          )}

          {role === "host" && joinRequests.length > 0 && (
            <div className="card" style={{ marginTop: 12 }}>
              <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--line)" }}><b style={{ color: "var(--gold)" }}>Wants to join your live</b></div>
              {joinRequests.map((r) => (
                <div key={r.request_id} className="row" style={{ padding: "10px 12px" }}>
                  <Avatar user={r as Partial<UserSummary>} />
                  <div style={{ flex: 1, fontWeight: 700 }}>{displayName(r as Partial<UserSummary>)}</div>
                  <button className="btn small" onClick={() => answerRequest(r, true)}>Accept</button>
                  <button className="btn small ghost" onClick={() => answerRequest(r, false)}>Decline</button>
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
              <button className="btn small" onClick={() => setGameOpen(true)}>Play Now</button>
            </div>
          )}
          <div className="row" style={{ marginTop: 12, flexWrap: "wrap" }}>
            {role === "viewer" && live.status === "live" && (
              joinState === "requested"
                ? <span className="pill">Waiting for the host to accept…</span>
                : <button className="btn small" onClick={requestToJoin}>🙋 Ask to join</button>
            )}
            {broadcasters.filter((b) => b.user_id !== user?.id).map((b) => (
              <button key={b.user_id} className="btn small" onClick={() => setGiftTarget(b.user_id)}>🎁 Gift {displayName(b as Partial<UserSummary>)}</button>
            ))}
            <span className="spacer" />
            <span className="muted" style={{ fontSize: 13 }}>Your coins: <b style={{ color: "var(--gold)" }}>{user?.no_redeem_wallet ?? 0}</b> · <Link to="/wallet">Buy more</Link></span>
          </div>

          {giftTarget && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="row" style={{ padding: "10px 12px", borderBottom: "1px solid var(--line)" }}>
                <b style={{ color: "var(--gold)" }}>Send a gift to {displayName(nameOf(giftTarget) as Partial<UserSummary>)}</b>
                <span className="spacer" />
                <button className="btn small ghost" onClick={() => setGiftTarget(null)}>Close</button>
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
          <div className="row" style={{ padding: "10px 12px", borderBottom: "1px solid var(--line)" }}><b style={{ color: "var(--gold)" }}>Live chat</b></div>
          <div className="log" ref={logRef}>
            {messages.map((m) => (
              <div key={m.id}>
                <span className="who">{m.senderName || "Member"}: </span>
                {m.stickerUrl ? <img src={mediaUrl(m.stickerUrl)} alt="sticker" style={{ width: 64, display: "inline-block" }} /> : <span className="soft">{m.message}</span>}
              </div>
            ))}
            {messages.length === 0 && <p className="muted">Say hello 👋</p>}
          </div>
          <form className="compose" onSubmit={submitChat}>
            <input className="input" placeholder="Say something" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={300} />
            <button className="btn small" type="submit" disabled={!draft.trim()}>Send</button>
          </form>
        </div>
      </div>
      {soloStandingsOpen && soloBattle && (
        <SoloBattleStandingsSheet battle={soloBattle} myUserId={user?.id ?? null} onClose={() => setSoloStandingsOpen(false)} />
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
        <TapGameOverlay game={activeGame} roomName={roomName} onClose={() => setGameOpen(false)} onToast={setToast} />
      )}
      {menuOpen && (
        <BattleMenu peopleOnScreen={broadcasters.length} onClose={() => setMenuOpen(false)} onNotice={setToast} onPick={(k) => {
          setMenuOpen(false);
          if (k === "1v1") setBattlePicker(true);
          else if (k === "gameLimit") setGameLimitPicker(true);
          else if (k === "solo") startSolo();
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
      {picker === "series" && myId && (
        <MultiPicker title="Best Out Of" blurb="5-minute rounds. First to win more than half the rounds takes the series." lengths={[3, 5, 7, 9, 11]}
          people={broadcasters.filter((b) => b.user_id !== myId)} onClose={() => setPicker(null)}
          onSubmit={async (ids, length) => {
            try { await createSeries(myId, roomName, length ?? 5, ids); setPicker(null); setToast(`Best Out Of ${length} invites sent.`); }
            catch (e) { setToast((e as Error).message); }
          }} />
      )}
      {picker === "2v2" && myId && (
        <TwoVTwoPicker people={broadcasters.filter((b) => b.user_id !== myId)} onClose={() => setPicker(null)}
          onSubmit={async (teammate, o1, o2) => {
            try { await invite2v2(myId, roomName, teammate, o1, o2); setPicker(null); setToast("2v2 invites sent."); }
            catch (e) { setToast((e as Error).message); }
          }} />
      )}
      {picker === "marathon" && myId && (
        <MultiPicker title="No Time Limit" blurb="No clock. The first player to reach 100,000 gift coins wins. Everyone in the battle can vote to end it early."
          people={broadcasters.filter((b) => b.user_id !== myId)} onClose={() => setPicker(null)}
          onSubmit={async (ids) => {
            try { await inviteMarathon(myId, roomName, ids); setPicker(null); setToast("No Time Limit invites sent."); }
            catch (e) { setToast((e as Error).message); }
          }} />
      )}
      {picker === "555" && myId && (
        <MultiPicker title="5-5-5" blurb="5 Games / 5 Minutes / Reach 5000 coins and win. Each game ends at 5,000 coins or when its 5 minutes run out; first to finish 5 games wins."
          people={broadcasters.filter((b) => b.user_id !== myId)} onClose={() => setPicker(null)}
          onSubmit={async (ids) => {
            try { await invite555(myId, roomName, ids); setPicker(null); setToast("5-5-5 invites sent."); }
            catch (e) { setToast((e as Error).message); }
          }} />
      )}
      {series.invite && (
        <InviteCard title="Best Out Of" onClose={series.dismissInvite} onAnswer={(ok) => series.respond(series.invite!.series_id, ok).catch((e) => setToast((e as Error).message))}
          body={`${displayName({ fullname: series.invite.host_fullname, username: series.invite.host_username } as Partial<UserSummary>)} invites you to a Best Out Of ${series.invite.length} battle — 5-minute rounds, most gift coins wins each round.`} />
      )}
      {two.invite && (
        <InviteCard title="2v2 Battle" onClose={two.dismissInvite} onAnswer={(ok) => two.respond(two.invite!.battle_id, ok).catch((e) => setToast((e as Error).message))} body={describe2v2Invite(two.invite)} />
      )}
      {marathon.invite && (
        <InviteCard title="No Time Limit" onClose={marathon.dismissInvite} onAnswer={(ok) => marathon.respond(marathon.invite!.marathon_id, ok).catch((e) => setToast((e as Error).message))}
          body={`${displayName({ fullname: marathon.invite.host_fullname, username: marathon.invite.host_username } as Partial<UserSummary>)} invites you to a No Time Limit battle — first to ${marathon.invite.target_points.toLocaleString()} gift coins wins.`} />
      )}
      {b555.invite && (
        <InviteCard title="5-5-5" onClose={b555.dismissInvite} onAnswer={(ok) => b555.respond(b555.invite!.battle_555_id, ok).catch((e) => setToast((e as Error).message))}
          body={`${displayName({ fullname: b555.invite.host_fullname, username: b555.invite.host_username } as Partial<UserSummary>)} invites you to 5-5-5 — 5 Games / 5 Minutes / Reach ${b555.invite.coins_per_game.toLocaleString()} coins and win.`} />
      )}
      {result && <ResultOverlay title={result.title} rows={result.rows} onClose={() => setResult(null)} />}
      {battlePicker && (
        <Overlay title="Bingg Bongg Battle — who do you challenge?" onClose={() => setBattlePicker(false)}>
          {broadcasters.filter((b) => b.user_id !== user?.id).map((b) => (
            <button key={b.user_id} className="btn block" style={{ marginBottom: 8 }} onClick={async () => {
              setBattlePicker(false);
              try { await battle.inviteOpponent(b.user_id); setToast(`Battle invite sent to ${displayName(b as Partial<UserSummary>)}.`); }
              catch (e) { setToast((e as Error).message); }
            }}>{displayName(b as Partial<UserSummary>)}</button>
          ))}
          <p className="muted" style={{ fontSize: 12 }}>5-minute battle. Whoever receives more gift coins when time runs out wins.</p>
        </Overlay>
      )}
      {gameLimitPicker && (
        <Overlay title="Game Limit — who do you challenge?" onClose={() => { setGameLimitPicker(false); setGameLimitTarget(""); }}>
          <label className="soft" style={{ fontSize: 13 }}>Coins to win</label>
          <input className="input" inputMode="numeric" value={gameLimitTarget} placeholder="e.g. 5000"
            onChange={(e) => setGameLimitTarget(e.target.value.replace(/[^0-9]/g, ""))}
            style={{ width: "100%", marginBottom: 12 }} />
          {broadcasters.filter((b) => b.user_id !== user?.id).map((b) => (
            <button key={b.user_id} className="btn block" style={{ marginBottom: 8 }} onClick={async () => {
              const target = Number(gameLimitTarget);
              if (!target || target <= 0) { setToast("Enter how many coins wins it."); return; }
              setGameLimitPicker(false);
              setGameLimitTarget("");
              try { await battle.inviteOpponent(b.user_id, target); setToast(`Game Limit invite sent to ${displayName(b as Partial<UserSummary>)} — first to ${target.toLocaleString()} coins.`); }
              catch (e) { setToast((e as Error).message); }
            }}>{displayName(b as Partial<UserSummary>)}</button>
          ))}
          <p className="muted" style={{ fontSize: 12 }}>First to your coin target wins instantly. If neither of you gets there in 5 minutes, whoever has the most coins wins.</p>
        </Overlay>
      )}
      {battle.invite && (
        <Overlay title="Bingg Bongg Battle" onClose={battle.dismissInvite}>
          <p className="soft">{battle.invite.opponent_fullname ?? battle.invite.opponent_username ?? "A streamer"} challenges you to a 5-minute battle{battle.invite.target_coins ? ` — first to ${battle.invite.target_coins} coins` : ""}.</p>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" style={{ flex: 1 }} onClick={() => battle.respond(battle.invite!.battle_id, true).catch((e) => setToast((e as Error).message))}>Accept</button>
            <button className="btn ghost" style={{ flex: 1 }} onClick={() => battle.respond(battle.invite!.battle_id, false).catch((e) => setToast((e as Error).message))}>Decline</button>
          </div>
        </Overlay>
      )}
      {battleResult && user && (
        <Overlay title={battleResult.winner_user_id === null ? "It's a tie" : battleResult.winner_user_id === user.id ? "🏆 You won!" : "You lost this one"} onClose={() => setBattleResult(null)}>
          <p className="soft" style={{ textAlign: "center", fontSize: 18 }}>
            {displayName(nameOf(battleResult.player_one_user_id) as Partial<UserSummary>)} {battleResult.player_one_score} — {battleResult.player_two_score} {displayName(nameOf(battleResult.player_two_user_id) as Partial<UserSummary>)}
          </p>
          <button className="btn block" style={{ marginTop: 12 }} onClick={() => setBattleResult(null)}>Close</button>
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
