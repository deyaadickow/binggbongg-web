// Bingg Bongg web — LiveKit room session for every role (viewer, guest, host), same token
// server and identities the phones use: `user_<id>` for publishers, random-suffixed for viewers.
import { useCallback, useEffect, useRef, useState } from "react";
/// Must match Android's LiveStreamManager.TOPIC_HEART and iOS's LiveStreamViewModel.heartTopic
/// byte for byte — it is the literal topic on the wire, and a typo would just mean the web
/// silently never sees anyone else's hearts.
const HEART_TOPIC = "bb_heart";
/// Multi-live 24 (2026-11-05): the server's "room state changed" poke, sent on the room by the
/// token server after every seat / sound / hand / battle change. Payload {"type":"ml_state","v":17}.
/// Only ever a reason to refetch fetchLiveRoomMembers — never trusted beyond that.
const ML_STATE_TOPIC = "ml_state";

import { ConnectionState, Room, RoomEvent, Track, type LocalTrackPublication, type RemoteParticipant, type RemoteTrack, type Participant } from "livekit-client";
import { tokenServer } from "./api";

export type LiveRole = "viewer" | "guest" | "host";
export type LiveStatus = "idle" | "connecting" | "live" | "ended" | "error";

export interface LiveTile {
  identity: string;
  name: string;
  userId: number | null;
  attach: (el: HTMLVideoElement) => () => void;
  isLocal: boolean;
  muted: boolean;
  /** LiveKit's own active-speaker detection — the phones turn the tile border green on this. */
  speaking: boolean;
  /** An audio-podcast speaker: no video at all, just the photo and the speaking ring. */
  audioOnly?: boolean;
}

function userIdOf(p: Participant): number | null {
  const m = p.identity.match(/^user_(\d+)/);
  return m ? Number(m[1]) : null;
}

export function useLiveRoom(roomName: string, role: LiveRole, enabled: boolean, opts: {
  /** Multi-live 24: may this guest publish a microphone? false = a muted member of a room over 4
   *  (the token server grants camera only, so asking for the mic would just be refused). null /
   *  undefined = today's behaviour (camera and mic). Read when connecting, and followed live. */
  micAllowed?: boolean | null;
  /** Bingg Bongg Podcast, audio kind (2026-11-10): host + guests publish the microphone ONLY and
   *  every speaker gets a tile anyway (avatar + speaking ring, no video). Read when connecting. */
  audioOnly?: boolean;
} = {}) {
  const roomRef = useRef<Room | null>(null);
  const audioOnlyRef = useRef<boolean>(!!opts.audioOnly);
  audioOnlyRef.current = !!opts.audioOnly;
  const micAllowedRef = useRef<boolean | null | undefined>(opts.micAllowed);
  micAllowedRef.current = opts.micAllowed;
  // A refetch nudge: bumps on the server's ml_state message (with its version) and when LiveKit
  // changes this participant's own permissions (the host gave or took our sound).
  const [mlSignal, setMlSignal] = useState<{ v: number | null; seq: number }>({ v: null, seq: 0 });
  const mlSeq = useRef(0);
  // Steve, 2026-10-14: "the hearts should show on eddie's screen not my own screen." A heart
  // somebody tapped, as {identity it is for, seq}. The seq is what makes two in a row register
  // as two — the identity alone would not change, and a consumer watching the value would see
  // one event.
  const [incomingHeart, setIncomingHeart] = useState<{ identity: string; seq: number } | null>(null);
  const heartSeq = useRef(0);
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [tiles, setTiles] = useState<LiveTile[]>([]);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [grantedRole, setGrantedRole] = useState<LiveRole | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  const rebuildTiles = useCallback((room: Room) => {
    const next: LiveTile[] = [];
    const local = room.localParticipant;
    const localPub = local.getTrackPublication(Track.Source.Camera) as LocalTrackPublication | undefined;
    const audioOnly = audioOnlyRef.current;
    if (audioOnly && !localPub?.track && local.getTrackPublication(Track.Source.Microphone)) {
      // An audio podcast: no camera, so the tile is the member's photo with the speaking ring.
      next.push({
        identity: local.identity, name: local.name || "You", userId: userIdOf(local), isLocal: true,
        muted: true, speaking: local.isSpeaking, audioOnly: true, attach: () => () => undefined,
      });
    }
    if (localPub?.track) {
      const track = localPub.track;
      next.push({
        identity: local.identity,
        name: local.name || "You",
        userId: userIdOf(local),
        isLocal: true,
        muted: localPub.isMuted,
        speaking: local.isSpeaking,
        attach: (el) => { track.attach(el); return () => { track.detach(el); }; },
      });
    }
    room.remoteParticipants.forEach((p: RemoteParticipant) => {
      const pub = p.getTrackPublication(Track.Source.Camera);
      const track = pub?.track as RemoteTrack | undefined;
      if (!pub && audioOnly && p.getTrackPublication(Track.Source.Microphone)) {
        next.push({
          identity: p.identity, name: p.name || "", userId: userIdOf(p), isLocal: false,
          muted: true, speaking: p.isSpeaking, audioOnly: true, attach: () => () => undefined,
        });
        return;
      }
      if (!pub) return; // a viewer publishes nothing — no tile
      next.push({
        identity: p.identity,
        name: p.name || "",
        userId: userIdOf(p),
        isLocal: false,
        muted: pub.isMuted,
        speaking: p.isSpeaking,
        attach: (el) => { if (track) { track.attach(el); return () => { track.detach(el); }; } return () => undefined; },
      });
    });
    setTiles(next);
  }, []);

  useEffect(() => {
    if (!enabled || !roomName || role === undefined) return;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    let cancelled = false;
    const refresh = () => { if (!cancelled) rebuildTiles(room); };
    room
      .on(RoomEvent.TrackSubscribed, refresh)
      .on(RoomEvent.TrackUnsubscribed, refresh)
      .on(RoomEvent.TrackMuted, refresh)
      .on(RoomEvent.TrackUnmuted, refresh)
      .on(RoomEvent.TrackPublished, refresh)
      .on(RoomEvent.TrackUnpublished, refresh)
      .on(RoomEvent.LocalTrackPublished, refresh)
      .on(RoomEvent.LocalTrackUnpublished, refresh)
      .on(RoomEvent.ParticipantConnected, refresh)
      .on(RoomEvent.ParticipantDisconnected, refresh)
      .on(RoomEvent.ActiveSpeakersChanged, refresh)
      .on(RoomEvent.ParticipantPermissionsChanged, (_prev: unknown, p?: Participant) => {
        if (cancelled || (p && p !== room.localParticipant)) return;
        mlSeq.current += 1;
        setMlSignal({ v: null, seq: mlSeq.current });
      })
      .on(RoomEvent.DataReceived, (payload: Uint8Array, _p?: RemoteParticipant, _k?: unknown, topic?: string) => {
        if (cancelled) return;
        if (topic === ML_STATE_TOPIC) {
          let v: number | null = null;
          try { const j = JSON.parse(new TextDecoder().decode(payload)); if (typeof j?.v === "number") v = j.v; } catch { /* still a poke */ }
          mlSeq.current += 1;
          setMlSignal({ v, seq: mlSeq.current });
          return;
        }
        if (topic !== HEART_TOPIC) return;
        const identity = new TextDecoder().decode(payload);
        if (!identity) return;
        heartSeq.current += 1;
        setIncomingHeart({ identity, seq: heartSeq.current });
      })
      .on(RoomEvent.Disconnected, () => { if (!cancelled) setStatus("ended"); });
    // Remote sound. A remote audio track plays only once it is attached to an element; the room
    // never did that, so the web heard nobody. One hidden <audio> per microphone track. Only
    // speakers publish a microphone (the server enforces it), so this is "hear the speakers".
    const audioEls = new Map<string, HTMLMediaElement>();
    room
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (cancelled || track.kind !== Track.Kind.Audio) return;
        const el = track.attach();
        el.style.display = "none";
        document.body.appendChild(el);
        audioEls.set(track.sid ?? String(Math.random()), el);
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        if (track.kind !== Track.Kind.Audio) return;
        track.detach().forEach((el) => el.remove());
        if (track.sid) audioEls.delete(track.sid);
      });

    (async () => {
      setStatus("connecting");
      setError(null);
      try {
        const t = await tokenServer<{ token: string; wsUrl: string; role: string }>("token", { query: { room: roomName, role } });
        if (cancelled) return;
        if (role !== "viewer" && t.role !== role) throw new Error(role === "host" ? "You're not the host of this room." : "Not approved to join yet.");
        setGrantedRole(t.role as LiveRole);
        await room.connect(t.wsUrl, t.token);
        if (cancelled) return;
        if (role !== "viewer") {
          // A missing/blocked camera must not kill the session: the room stays up (chat, gifts,
          // heartbeat) and the publisher can retry from the Camera button.
          try {
            if (audioOnlyRef.current) {
              // Audio podcast: microphone only, the camera never turns on.
              await room.localParticipant.setMicrophoneEnabled(true);
              setCameraOn(false);
            } else if (role === "guest" && micAllowedRef.current === false) {
              // A muted member of a big room: camera only (Multi-live 24).
              await room.localParticipant.setCameraEnabled(true);
              setMicOn(false);
            } else {
              await room.localParticipant.enableCameraAndMicrophone();
            }
          } catch (e) {
            setPublishError(`Camera or microphone unavailable: ${(e as Error).message}`);
            setCameraOn(false);
            setMicOn(false);
          }
        }
        await room.startAudio().catch(() => undefined);
        refresh();
        setStatus("live");
      } catch (e) {
        if (!cancelled) { setStatus("error"); setError((e as Error).message); }
      }
    })();

    return () => {
      cancelled = true;
      audioEls.forEach((el) => el.remove());
      room.disconnect();
      roomRef.current = null;
    };
  }, [roomName, role, enabled, rebuildTiles]);

  // Multi-live 24: follow the server's word on this guest's sound. Given sound -> publish the mic
  // (retried when LiveKit widens our permission, which may land a moment after the state);
  // sound taken -> stop the mic here too (the server has already unpublished it).
  const micAllowed = opts.micAllowed;
  const appliedMic = useRef<boolean | null | undefined>(undefined);
  const micRetry = useRef(false);
  useEffect(() => {
    const room = roomRef.current;
    if (!room || status !== "live" || role !== "guest" || micAllowed == null || room.state !== ConnectionState.Connected) return;
    // Only on a CHANGE of the server's word (or a retry after a refused publish) — a speaker who
    // muted their own mic stays muted through every later refetch.
    if (appliedMic.current === micAllowed && !micRetry.current) return;
    appliedMic.current = micAllowed;
    if (micAllowed === false) {
      micRetry.current = false;
      if (room.localParticipant.isMicrophoneEnabled) room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
      setMicOn(false);
    } else if (!room.localParticipant.isMicrophoneEnabled) {
      room.localParticipant.setMicrophoneEnabled(true)
        .then(() => { micRetry.current = false; setMicOn(true); })
        .catch(() => { micRetry.current = true; }); // permission not widened yet: next signal retries
    }
  }, [micAllowed, status, role, mlSignal.seq]);
  // A fresh connection (role change) starts from what it published, so re-apply from scratch.
  useEffect(() => { appliedMic.current = role === "guest" ? micAllowedRef.current : undefined; micRetry.current = false; }, [role, roomName]);

  const toggleCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !cameraOn;
    try {
      await room.localParticipant.setCameraEnabled(next);
      setCameraOn(next);
      setPublishError(null);
    } catch (e) {
      setPublishError(`Camera unavailable: ${(e as Error).message}`);
    }
    rebuildTiles(room);
  }, [cameraOn, rebuildTiles]);

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !micOn;
    if (next && role === "guest" && micAllowedRef.current === false) return; // no sound in a big room yet
    try {
      await room.localParticipant.setMicrophoneEnabled(next);
      setMicOn(next);
      setPublishError(null);
    } catch (e) {
      setPublishError(`Microphone unavailable: ${(e as Error).message}`);
    }
  }, [micOn, role]);

  const flipCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
    const track = pub?.track;
    if (!track || !("restartTrack" in track)) return;
    const facing = (track.mediaStreamTrack.getSettings().facingMode === "environment") ? "user" : "environment";
    await (track as unknown as { restartTrack: (c: { facingMode: string }) => Promise<void> }).restartTrack({ facingMode: facing });
    rebuildTiles(room);
  }, [rebuildTiles]);

  const disconnect = useCallback(() => { roomRef.current?.disconnect(); }, []);

  /// Fan a heart out to everyone in the room.
  ///
  /// A data message, not participant metadata: a heart is an EVENT — ten in a row are ten
  /// hearts — and metadata is state that would collapse a burst. Lossy, because a dropped heart
  /// is one missing petal in a shower and re-sending one that is seconds late is worse than
  /// losing it. The payload is the identity the heart is FOR, so each receiver can tell which
  /// tile it belongs to.
  const sendHeart = useCallback((targetIdentity: string) => {
    const room = roomRef.current;
    if (!room || !targetIdentity) return;
    room.localParticipant
      .publishData(new TextEncoder().encode(targetIdentity), { reliable: false, topic: HEART_TOPIC })
      .catch(() => { /* best-effort, same as the phones */ });
  }, []);

  /// Steve, 2026-11-03: the watch-time timer in the watchers list. When each member joined THIS
  /// room, as user id -> epoch ms, read from LiveKit's own `participant.joinedAt` (set by the SFU,
  /// so every client agrees on it). A getter rather than state: the open list reads it once per
  /// tick, and a closed list costs nothing. A member on two devices keeps the earlier join.
  /// Participants whose identity carries no user id (or no joinedAt) are simply left out — the
  /// list falls back to when this client first saw them.
  const joinTimes = useCallback((): Map<number, number> => {
    const out = new Map<number, number>();
    const room = roomRef.current;
    if (!room) return out;
    const add = (p: Participant) => {
      const uid = userIdOf(p);
      const at = p.joinedAt?.getTime();
      if (uid === null || !at || !Number.isFinite(at)) return;
      const prev = out.get(uid);
      if (prev === undefined || at < prev) out.set(uid, at);
    };
    add(room.localParticipant);
    room.remoteParticipants.forEach(add);
    return out;
  }, []);

  return { status, error, publishError, tiles, cameraOn, micOn, grantedRole, toggleCamera, toggleMic, flipCamera, disconnect, sendHeart, incomingHeart, joinTimes, mlSignal };
}
