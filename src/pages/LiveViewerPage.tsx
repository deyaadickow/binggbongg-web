import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { displayName, giftPrice, mediaUrl, post, type Gift, type UserSummary } from "../lib/api";
import { useSession } from "../lib/session";
import { chatChannel, ensureFirebaseSignIn, observeChat, sendChat, type ChatMessage } from "../lib/firebase";
import { useLiveRoom, type LiveRole, type LiveTile } from "../lib/live";
import { useBattle, type BattleData } from "../lib/battle";
import { fetchActiveTapGame, type TapGameType } from "../lib/tapgame";
import { TapGameOverlay } from "../components/TapGameOverlay";
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

  const live = useLiveRoom(roomName, role, isLoggedIn && !roomClosed);
  const isPublisher = role !== "viewer" && live.status === "live";

  // Bingg Bongg Battle (1v1). Result overlay for the two battlers, a toast for everyone else.
  const [battleResult, setBattleResult] = useState<BattleData | null>(null);
  const [battlePicker, setBattlePicker] = useState(false);
  const onBattleCompleted = useCallback((b: BattleData) => {
    if (user && (b.player_one_user_id === user.id || b.player_two_user_id === user.id)) setBattleResult(b);
    else setToast(b.winner_user_id ? "Battle over!" : "Battle over — it's a tie!");
    refresh();
  }, [user, refresh]);
  const battle = useBattle(roomName, user?.id ?? null, isPublisher, isLoggedIn && !roomClosed, onBattleCompleted);

  // Tap games: the host activates one from the phone (or later, here); everyone gets a Play button.
  const [activeGame, setActiveGame] = useState<TapGameType | null>(null);
  const [gameOpen, setGameOpen] = useState(false);
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
      const inBattle = b && b.status === "active" && (b.player_one_user_id === giftTarget || b.player_two_user_id === giftTarget);
      const res = await post("sendCoinsToUser", { my_user_id: user.id, user_id: giftTarget, coins: giftPrice(gift), gift_id: gift.id, room_name: roomName, ...(inBattle ? { battle_id: b.battle_id } : {}) });
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
          <div className={`video-grid count-${Math.min(4, Math.max(1, orderedTiles.length))}`}>
            {orderedTiles.length === 0 && (
              <div className="tile" style={{ display: "grid", placeItems: "center" }}>
                <span className="muted">{live.status === "live" ? "Waiting for video…" : "Connecting…"}</span>
              </div>
            )}
            {orderedTiles.map((t) => <VideoTile key={t.identity} tile={t} label={t.isLocal ? `${displayName(user)} (you)` : displayName(nameOf(t.userId) as Partial<UserSummary> ?? { fullname: t.name })} />)}
          </div>

          {isPublisher && (
            <div className="row" style={{ marginTop: 12, flexWrap: "wrap" }}>
              <button className="btn small" onClick={live.toggleCamera}>{live.cameraOn ? "📷 Camera off" : "📷 Camera on"}</button>
              <button className="btn small" onClick={live.toggleMic}>{live.micOn ? "🎤 Mute" : "🎤 Unmute"}</button>
              <button className="btn small" onClick={live.flipCamera}>🔄 Flip</button>
              {(!battle.battle || battle.battle.status === "completed") && broadcasters.length > 1 && (
                <button className="btn small" onClick={() => setBattlePicker(true)}>⚔️ Battle</button>
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

          {activeGame && (
            <div className="card row" style={{ marginTop: 12, padding: "10px 12px" }}>
              <div style={{ flex: 1 }}>
                <b style={{ color: "var(--gold)" }}>🎮 {activeGame.name ?? "Tap game"}</b>
                <div className="muted" style={{ fontSize: 12 }}>{role === "host" ? "Running in your room — viewers can play now." : "The host started a game. 50 coins to play, keep or gift what you win."}</div>
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
      {gameOpen && activeGame && (
        <TapGameOverlay game={activeGame} roomName={roomName} onClose={() => setGameOpen(false)} onToast={setToast} />
      )}
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

function Overlay({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "grid", placeItems: "center", zIndex: 40, padding: 16 }} onClick={onClose}>
      <div className="card pad" style={{ width: "min(420px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <h2 className="card-title" style={{ marginBottom: 10 }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function VideoTile({ tile, label }: { tile: LiveTile; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return tile.attach(el);
  }, [tile]);
  return (
    <div className="tile">
      <video ref={ref} autoPlay playsInline muted={tile.isLocal} style={tile.isLocal ? { transform: "scaleX(-1)" } : undefined} />
      <span className="name">{label || "Guest"}{tile.muted ? " · camera off" : ""}</span>
    </div>
  );
}
