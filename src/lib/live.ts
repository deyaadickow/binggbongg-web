// Bingg Bongg web — LiveKit room session for every role (viewer, guest, host), same token
// server and identities the phones use: `user_<id>` for publishers, random-suffixed for viewers.
import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type LocalTrackPublication, type RemoteParticipant, type RemoteTrack, type Participant } from "livekit-client";
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
}

function userIdOf(p: Participant): number | null {
  const m = p.identity.match(/^user_(\d+)/);
  return m ? Number(m[1]) : null;
}

export function useLiveRoom(roomName: string, role: LiveRole, enabled: boolean) {
  const roomRef = useRef<Room | null>(null);
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
      .on(RoomEvent.Disconnected, () => { if (!cancelled) setStatus("ended"); });

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
            await room.localParticipant.enableCameraAndMicrophone();
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
      room.disconnect();
      roomRef.current = null;
    };
  }, [roomName, role, enabled, rebuildTiles]);

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
    try {
      await room.localParticipant.setMicrophoneEnabled(next);
      setMicOn(next);
      setPublishError(null);
    } catch (e) {
      setPublishError(`Microphone unavailable: ${(e as Error).message}`);
    }
  }, [micOn]);

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

  return { status, error, publishError, tiles, cameraOn, micOn, grantedRole, toggleCamera, toggleMic, flipCamera, disconnect };
}
