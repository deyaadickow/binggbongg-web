// The LiveKit side of a Country Battle day. Unlike useLiveRoom (lib/live.ts), which subscribes to
// everyone in the room, this one connects with autoSubscribe OFF — a battle room can hold fifty
// people or more, and pulling fifty camera feeds into one browser would melt a phone. It
// subscribes to:
//   - the VIDEO of the members whose tiles are on screen right now, and
//   - the AUDIO of the tiles this screen hears: the one a viewer tapped ("other tiles are silent
//     until the viewer taps a tile"), or — on a battler's screen — the members they starred
//     (Steve, 2026-11-03: "They can also chat with each other, means their speaker will be on").
// It also carries the star signal ("cb_star": you starred me) as a LiveKit data message.
// A participant publishes their own camera and mic, exactly like a guest in a normal room; the
// token server already accepts role=guest for members joinCountryBattle approved.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Room, RoomEvent, Track,
  type LocalVideoTrack, type Participant, type RemoteParticipant, type RemoteTrack, type RemoteTrackPublication,
} from "livekit-client";
import { tokenServer } from "./api";

export type CbRoomStatus = "idle" | "connecting" | "live" | "ended" | "error";

function userIdOf(p: Participant): number | null {
  const m = p.identity.match(/^user_(\d+)/);
  return m ? Number(m[1]) : null;
}

/** A battler's identity exactly (`user_{id}`) — a viewer's `user_{id}_v…` never matches. */
export function battlerIdOf(identity: string | undefined | null): number | null {
  const m = (identity ?? "").match(/^user_(\d+)$/);
  return m ? Number(m[1]) : null;
}

export interface CbPublisher { userId: number; name: string }

export function useCountryBattleRoom(opts: {
  roomName: string | null;
  role: "guest" | "viewer";
  enabled: boolean;
  /** Members whose tiles are on screen — their video is subscribed, nobody else's. */
  visible: number[];
  /** The member(s) heard on this screen — one tapped tile, or a battler's starred members. */
  listen: number | null | number[];
  /** The camera or mic could not be opened (permission denied, no device). */
  onPublishFailed?: (err: Error) => void;
  /** A data message arrived (the star signal). `from` is the sender's battler id, or null. */
  onData?: (topic: string, payload: unknown, from: number | null) => void;
}) {
  const { roomName, role, enabled, visible, listen } = opts;
  const roomRef = useRef<Room | null>(null);
  const [status, setStatus] = useState<CbRoomStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  // Bumped whenever a track comes or goes, so tiles re-attach.
  const [version, setVersion] = useState(0);
  const [publishers, setPublishers] = useState<CbPublisher[]>([]);
  const visibleRef = useRef<Set<number>>(new Set());
  const listenRef = useRef<Set<number>>(new Set());
  const onFailRef = useRef(opts.onPublishFailed);
  onFailRef.current = opts.onPublishFailed;
  const onDataRef = useRef(opts.onData);
  onDataRef.current = opts.onData;
  visibleRef.current = new Set(visible);
  listenRef.current = new Set(Array.isArray(listen) ? listen : listen != null ? [listen] : []);
  const listenKey = Array.isArray(listen) ? [...listen].sort((a, b) => a - b).join(",") : String(listen);

  /** Make every remote subscription match what is on screen. Idempotent; cheap to call often. */
  const applyPolicy = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const pubs: CbPublisher[] = [];
    room.remoteParticipants.forEach((p: RemoteParticipant) => {
      const uid = userIdOf(p);
      const cam = p.getTrackPublication(Track.Source.Camera) as RemoteTrackPublication | undefined;
      const mic = p.getTrackPublication(Track.Source.Microphone) as RemoteTrackPublication | undefined;
      if (uid != null && cam) pubs.push({ userId: uid, name: p.name || "" });
      const wantVideo = uid != null && visibleRef.current.has(uid);
      const wantAudio = uid != null && listenRef.current.has(uid);
      if (cam && cam.isDesired !== wantVideo) cam.setSubscribed(wantVideo);
      if (mic && mic.isDesired !== wantAudio) mic.setSubscribed(wantAudio);
    });
    setPublishers((cur) => {
      const a = cur.map((x) => `${x.userId}:${x.name}`).join(",");
      const b = pubs.map((x) => `${x.userId}:${x.name}`).join(",");
      return a === b ? cur : pubs;
    });
  }, []);

  useEffect(() => { applyPolicy(); }, [visible.join(","), listenKey, applyPolicy]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled || !roomName) return;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    let cancelled = false;
    const bump = () => { if (!cancelled) setVersion((v) => v + 1); };
    const policy = () => { if (!cancelled) { applyPolicy(); bump(); } };
    // The one audio element: remote audio does not play until it is attached somewhere.
    const audioEls = new Map<string, HTMLMediaElement>();
    room
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          el.style.display = "none";
          document.body.appendChild(el);
          audioEls.set(track.sid ?? String(Math.random()), el);
        }
        bump();
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) {
          track.detach().forEach((el) => el.remove());
          if (track.sid) audioEls.delete(track.sid);
        }
        bump();
      })
      .on(RoomEvent.TrackPublished, policy)
      .on(RoomEvent.TrackUnpublished, policy)
      .on(RoomEvent.ParticipantConnected, policy)
      .on(RoomEvent.ParticipantDisconnected, policy)
      .on(RoomEvent.TrackMuted, bump)
      .on(RoomEvent.TrackUnmuted, bump)
      .on(RoomEvent.LocalTrackPublished, bump)
      .on(RoomEvent.LocalTrackUnpublished, bump)
      .on(RoomEvent.DataReceived, (payload: Uint8Array, participant?: RemoteParticipant, _kind?: unknown, topic?: string) => {
        if (cancelled || !topic) return;
        let data: unknown = null;
        try { data = JSON.parse(new TextDecoder().decode(payload)); } catch { return; }
        onDataRef.current?.(topic, data, battlerIdOf(participant?.identity));
      })
      .on(RoomEvent.Disconnected, () => { if (!cancelled) setStatus("ended"); });

    (async () => {
      setStatus("connecting");
      setError(null);
      try {
        const t = await tokenServer<{ token: string; wsUrl: string; role: string }>("token", { query: { room: roomName, role } });
        if (cancelled) return;
        if (role === "guest" && t.role !== "guest") throw new Error("Not approved to join yet.");
        await room.connect(t.wsUrl, t.token, { autoSubscribe: false });
        if (cancelled) return;
        if (role === "guest") {
          try {
            await room.localParticipant.enableCameraAndMicrophone();
          } catch (e) {
            onFailRef.current?.(e as Error);
          }
        }
        await room.startAudio().catch(() => undefined);
        applyPolicy();
        bump();
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
  }, [roomName, role, enabled, applyPolicy]);

  /** Attach a member's camera to a <video>; returns the detach. A no-op until it is subscribed. */
  const attachVideo = useCallback((userId: number, el: HTMLVideoElement): (() => void) => {
    const room = roomRef.current;
    if (!room) return () => undefined;
    let track: RemoteTrack | LocalVideoTrack | undefined;
    if (userIdOf(room.localParticipant) === userId) {
      track = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track as LocalVideoTrack | undefined;
    } else {
      room.remoteParticipants.forEach((p) => {
        if (userIdOf(p) === userId) track = p.getTrackPublication(Track.Source.Camera)?.track as RemoteTrack | undefined;
      });
    }
    if (!track) return () => undefined;
    const tr = track;
    tr.attach(el);
    return () => { tr.detach(el); };
  }, []);

  /** True when this member's camera is attached-ready (subscribed / published and not muted). */
  const hasVideo = useCallback((userId: number): boolean => {
    const room = roomRef.current;
    if (!room) return false;
    if (userIdOf(room.localParticipant) === userId) {
      const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
      return !!pub?.track && !pub.isMuted;
    }
    let ok = false;
    room.remoteParticipants.forEach((p) => {
      if (userIdOf(p) !== userId) return;
      const pub = p.getTrackPublication(Track.Source.Camera);
      ok = !!pub?.track && !pub.isMuted;
    });
    return ok;
  }, []);

  const disconnect = useCallback(() => { roomRef.current?.disconnect(); }, []);

  /** A reliable data message on the room: to one battler (`toUserId`), or to everyone. */
  const sendData = useCallback((topic: string, payload: unknown, toUserId?: number | null): boolean => {
    const room = roomRef.current;
    if (!room || room.state !== "connected") return false;
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    room.localParticipant.publishData(bytes, {
      reliable: true, topic, ...(toUserId ? { destinationIdentities: [`user_${toUserId}`] } : {}),
    }).catch(() => undefined);
    return true;
  }, []);
  /** This browser's LiveKit identity (`user_{id}` for a battler), once connected. */
  const identity = useCallback(() => roomRef.current?.localParticipant.identity ?? "", []);

  return { status, error, version, publishers, attachVideo, hasVideo, disconnect, sendData, identity };
}
