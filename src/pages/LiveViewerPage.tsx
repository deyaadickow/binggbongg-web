import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Room, RoomEvent, Track, type RemoteParticipant, type RemoteTrack } from "livekit-client";
import { displayName, giftPrice, mediaUrl, post, tokenServer, type Gift, type LiveStream, type UserSummary } from "../lib/api";
import { useSession } from "../lib/session";
import { chatChannel, ensureFirebaseSignIn, observeChat, sendChat, type ChatMessage } from "../lib/firebase";
import { Avatar, Notice } from "../components/Common";

interface Tile { identity: string; name: string; userId: number | null; track: RemoteTrack | null }

export function LiveViewerPage() {
  const { room: roomParam } = useParams();
  const roomName = decodeURIComponent(roomParam ?? "");
  const { user, isLoggedIn, refresh } = useSession();
  const hostUserId = useMemo(() => Number(roomName.match(/^bb-(?:live|priv)-(\d+)-\d+$/)?.[1] ?? 0), [roomName]);

  const [broadcasters, setBroadcasters] = useState<LiveStream[]>([]);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [status, setStatus] = useState<"connecting" | "live" | "ended" | "error">("connecting");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [giftTarget, setGiftTarget] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const namesByUserId = useMemo(() => {
    const m = new Map<number, LiveStream>();
    broadcasters.forEach((b) => m.set(b.host_user_id, b));
    return m;
  }, [broadcasters]);

  // Who is in this room (host + approved guests) — same list the Live Now page reads.
  useEffect(() => {
    let alive = true;
    async function load() {
      const res = await post<LiveStream[]>("fetchActiveLiveStreams", { user_id: user?.id ?? 0, connections_only: false }).catch(() => null);
      if (!alive || !res) return;
      const mine = (res.data ?? []).filter((s) => s.room_name === roomName);
      setBroadcasters(mine);
      if (mine.length === 0 && status === "live") setStatus("ended");
    }
    load();
    const t = setInterval(load, 10000);
    return () => { alive = false; clearInterval(t); };
  }, [roomName, user, status]);

  // LiveKit: viewer token from the token server, then subscribe to every publisher's camera.
  useEffect(() => {
    if (!isLoggedIn) return;
    const room = new Room({ adaptiveStream: true });
    let cancelled = false;
    const upsert = (p: RemoteParticipant, track: RemoteTrack | null) => {
      const userId = Number(p.identity.match(/^user_(\d+)/)?.[1] ?? 0) || null;
      setTiles((prev) => {
        const others = prev.filter((t) => t.identity !== p.identity);
        return [...others, { identity: p.identity, name: p.name || "", userId, track }];
      });
    };
    room
      .on(RoomEvent.TrackSubscribed, (track, _pub, p) => { if (track.kind === Track.Kind.Video) upsert(p, track); })
      .on(RoomEvent.TrackUnsubscribed, (track, _pub, p) => { if (track.kind === Track.Kind.Video) upsert(p, null); })
      .on(RoomEvent.ParticipantDisconnected, (p) => setTiles((prev) => prev.filter((t) => t.identity !== p.identity)))
      .on(RoomEvent.Disconnected, () => { if (!cancelled) setStatus("ended"); });
    (async () => {
      try {
        const t = await tokenServer<{ token: string; wsUrl: string }>("token", { query: { room: roomName, role: "viewer" } });
        if (cancelled) return;
        await room.connect(t.wsUrl, t.token);
        await room.startAudio().catch(() => undefined);
        setStatus("live");
      } catch (e) {
        if (!cancelled) { setStatus("error"); setError((e as Error).message); }
      }
    })();
    return () => { cancelled = true; room.disconnect(); };
  }, [roomName, isLoggedIn]);

  // Chat: Firestore, same channel the phones use.
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
    post<{ livestreamGifts?: Gift[]; gifts?: Gift[] }>("fetchSettings", { x: 1 })
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
    try {
      await sendChat(chatChannel(roomName, hostUserId), user.id, displayName(user), text, user.profile_image ?? "");
    } catch (err) {
      setToast(`Couldn't send: ${(err as Error).message}`);
    }
  }

  async function sendGift(gift: Gift) {
    if (!user || !giftTarget) return;
    try {
      const res = await post("sendCoinsToUser", { my_user_id: user.id, user_id: giftTarget, coins: giftPrice(gift), gift_id: gift.id, room_name: roomName });
      if (!res.status) throw new Error(res.message ?? "Couldn't send that gift.");
      const to = namesByUserId.get(giftTarget);
      setToast(`Sent ${gift.name ?? "a gift"} (${giftPrice(gift)} coins) to ${to?.host_fullname ?? "them"}`);
      setGiftTarget(null);
      refresh();
    } catch (err) {
      setToast((err as Error).message);
    }
  }

  const host = namesByUserId.get(hostUserId);
  const orderedTiles = [...tiles].sort((a, b) => (a.userId === hostUserId ? -1 : b.userId === hostUserId ? 1 : 0));

  if (!isLoggedIn) {
    return (
      <div className="page">
        <Notice>Sign in to watch this live, chat and send gifts. <Link to="/login">Sign in</Link></Notice>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 12 }}>
        <Avatar user={host ? { fullname: host.host_fullname, username: host.host_username, profile_image: host.host_profile_image } : null} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800 }}>{host?.host_fullname ?? host?.host_username ?? "Live"}</div>
          <div className="muted" style={{ fontSize: 13 }}>{broadcasters.length > 1 ? `${broadcasters.length} on screen` : ""}</div>
        </div>
        <span className={`pill ${status === "live" ? "live" : ""}`}>{status === "live" ? "● LIVE" : status === "ended" ? "ENDED" : status === "error" ? "ERROR" : "CONNECTING"}</span>
      </div>
      {error && <Notice error>{error}</Notice>}
      {status === "ended" && <Notice>This live has ended. <Link to="/live">See who else is live</Link></Notice>}

      <div className="live-layout">
        <div>
          <div className={`video-grid count-${Math.min(4, Math.max(1, orderedTiles.length))}`}>
            {orderedTiles.length === 0 && <div className="tile" style={{ display: "grid", placeItems: "center" }} ><span className="muted">{status === "live" ? "Waiting for video…" : "Connecting…"}</span></div>}
            {orderedTiles.map((t) => (
              <VideoTile key={t.identity} tile={t} label={t.userId ? (namesByUserId.get(t.userId)?.host_fullname ?? t.name) : t.name} />
            ))}
          </div>
          <div className="row" style={{ marginTop: 12, flexWrap: "wrap" }}>
            {broadcasters.map((b) => (
              <button key={b.host_user_id} className="btn small" onClick={() => setGiftTarget(b.host_user_id)}>🎁 Gift {b.host_fullname ?? b.host_username}</button>
            ))}
            <span className="spacer" />
            <span className="muted" style={{ fontSize: 13 }}>Your coins: <b style={{ color: "var(--gold)" }}>{user?.no_redeem_wallet ?? 0}</b> · <Link to="/wallet">Buy more</Link></span>
          </div>
          {giftTarget && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="row" style={{ padding: "10px 12px", borderBottom: "1px solid var(--line)" }}>
                <b style={{ color: "var(--gold)" }}>Send a gift to {namesByUserId.get(giftTarget)?.host_fullname ?? "them"}</b>
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
                {gifts.length === 0 && <p className="muted" style={{ gridColumn: "1 / -1" }}>No gifts available.</p>}
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
      {toast && <div className="notice" style={{ position: "fixed", left: 16, right: 16, bottom: 16, maxWidth: 480, margin: "0 auto", zIndex: 30 }}>{toast}</div>}
    </div>
  );
}

function VideoTile({ tile, label }: { tile: Tile; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !tile.track) return;
    tile.track.attach(el);
    return () => { tile.track?.detach(el); };
  }, [tile.track]);
  return (
    <div className="tile">
      <video ref={ref} autoPlay playsInline muted={false} />
      <span className="name">{label || "Guest"}</span>
    </div>
  );
}

export type { UserSummary };
