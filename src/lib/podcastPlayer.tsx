// The one podcast player for the whole site (Bingg Bongg Podcast, Steve 2026-11-10).
//
// One HTML5 <audio> lives here, ABOVE the routes, so an episode keeps playing while the member
// moves around the site — the mini bar (components/PodcastMiniBar) is its remote control on every
// other page. The Media Session API puts the episode on the phone's lock screen / the OS media
// controls, with the same -15 s / +30 s the page has.
//
// Progress: savePodcastProgress every ~15 s while playing, on pause, on close and when the tab is
// hidden (keepalive, so a closed tab still saves). recordPodcastPlay once per episode opened.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { mediaUrl } from "./api";
import { hostName, recordPodcastPlay, savePodcastProgress, type PodcastEpisodeDetail } from "./podcast";

export const PODCAST_RATES = [1, 1.25, 1.5, 2] as const;
const SAVE_EVERY_MS = 15000;

interface PlayerState {
  episode: PodcastEpisodeDetail | null;
  playing: boolean;
  position: number;
  duration: number;
  rate: number;
  error: boolean;
}

interface PodcastPlayer extends PlayerState {
  /** Start an episode (from resume_at). Must be called from a tap so the browser allows sound. */
  load: (episode: PodcastEpisodeDetail, myUserId: number) => void;
  toggle: () => void;
  play: () => void;
  pause: () => void;
  skip: (deltaSeconds: number) => void;
  seekTo: (seconds: number) => void;
  setRate: (rate: number) => void;
  close: () => void;
}

const Ctx = createContext<PodcastPlayer | null>(null);

export function PodcastPlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const userRef = useRef<number>(0);
  const playedRef = useRef<number>(0); // the episode recordPodcastPlay was sent for
  const lastSaveRef = useRef<number>(0);
  const [state, setState] = useState<PlayerState>({ episode: null, playing: false, position: 0, duration: 0, rate: 1, error: false });
  const episodeRef = useRef<PodcastEpisodeDetail | null>(null);
  episodeRef.current = state.episode;

  const audio = useCallback((): HTMLAudioElement => {
    if (!audioRef.current) {
      const a = new Audio();
      a.preload = "metadata";
      audioRef.current = a;
    }
    return audioRef.current;
  }, []);

  const save = useCallback((keepalive = false) => {
    const ep = episodeRef.current;
    const a = audioRef.current;
    if (!ep || !a || !userRef.current) return;
    lastSaveRef.current = Date.now();
    void savePodcastProgress(userRef.current, ep.episode_id, a.currentTime || 0, keepalive);
  }, []);

  // Wire the element's events once.
  useEffect(() => {
    const a = audio();
    const sync = () => setState((s) => ({
      ...s,
      playing: !a.paused && !a.ended,
      position: a.currentTime || 0,
      duration: Number.isFinite(a.duration) && a.duration > 0 ? a.duration : Number(episodeRef.current?.duration_s ?? 0),
      rate: a.playbackRate,
    }));
    const onPlaying = () => {
      sync();
      const ep = episodeRef.current;
      if (ep && userRef.current && playedRef.current !== ep.episode_id) {
        playedRef.current = ep.episode_id;
        void recordPodcastPlay(userRef.current, ep.episode_id);
      }
    };
    const onTime = () => {
      sync();
      if (!a.paused && Date.now() - lastSaveRef.current >= SAVE_EVERY_MS) save();
    };
    const onPause = () => { sync(); save(); };
    const onError = () => setState((s) => ({ ...s, playing: false, error: !!episodeRef.current }));
    a.addEventListener("playing", onPlaying);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onPause);
    a.addEventListener("loadedmetadata", sync);
    a.addEventListener("ratechange", sync);
    a.addEventListener("error", onError);
    const onHide = () => { if (document.visibilityState === "hidden") save(true); };
    const onPageHide = () => save(true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      a.removeEventListener("playing", onPlaying);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onPause);
      a.removeEventListener("loadedmetadata", sync);
      a.removeEventListener("ratechange", sync);
      a.removeEventListener("error", onError);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [audio, save]);

  const play = useCallback(() => { audio().play().catch(() => undefined); }, [audio]);
  const pause = useCallback(() => { audio().pause(); }, [audio]);
  const toggle = useCallback(() => { const a = audio(); if (a.paused) play(); else pause(); }, [audio, play, pause]);
  const seekTo = useCallback((sec: number) => {
    const a = audio();
    const max = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : Number(episodeRef.current?.duration_s ?? 0) || Infinity;
    a.currentTime = Math.max(0, Math.min(max, sec));
    setState((s) => ({ ...s, position: a.currentTime }));
  }, [audio]);
  const skip = useCallback((d: number) => seekTo((audio().currentTime || 0) + d), [audio, seekTo]);
  const setRate = useCallback((r: number) => { const a = audio(); a.playbackRate = r; a.defaultPlaybackRate = r; setState((s) => ({ ...s, rate: r })); }, [audio]);

  const load = useCallback((ep: PodcastEpisodeDetail, myUserId: number) => {
    const a = audio();
    const same = episodeRef.current?.episode_id === ep.episode_id && !!a.getAttribute("src");
    // The episode being replaced keeps its place (saved while episodeRef still names it).
    if (!same && episodeRef.current && a.getAttribute("src")) save();
    userRef.current = myUserId;
    episodeRef.current = ep;
    setState((s) => ({ ...s, episode: ep, error: false, duration: Number(ep.duration_s ?? 0) }));
    if (same) { play(); return; }
    const rate = a.playbackRate || 1;
    a.src = mediaUrl(ep.media_url);
    a.playbackRate = rate;
    const resume = Number(ep.resume_at ?? 0);
    const dur = Number(ep.duration_s ?? 0);
    // Resume unless it was finished (or nearly) — then start over.
    const startAt = resume > 0 && (!dur || resume < dur - 5) ? resume : 0;
    if (startAt > 0) {
      const once = () => { a.currentTime = startAt; a.removeEventListener("loadedmetadata", once); };
      a.addEventListener("loadedmetadata", once);
    }
    setState((s) => ({ ...s, position: startAt }));
    play();
  }, [audio, play, save]);

  const close = useCallback(() => {
    const a = audio();
    save();
    a.pause();
    a.removeAttribute("src");
    a.load();
    episodeRef.current = null;
    setState({ episode: null, playing: false, position: 0, duration: 0, rate: a.playbackRate || 1, error: false });
    if ("mediaSession" in navigator) navigator.mediaSession.metadata = null;
  }, [audio, save]);

  // Lock screen / OS controls.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const ep = state.episode;
    if (!ep) return;
    const art = mediaUrl(ep.cover_url || ep.poster_url || ep.host?.profile_image || "");
    try {
      ms.metadata = new MediaMetadata({
        title: ep.title,
        artist: hostName(ep.host),
        album: "Bingg Bongg Podcast",
        artwork: art ? [{ src: art, sizes: "512x512" }] : [],
      });
    } catch { /* an old browser without MediaMetadata */ }
    const set = (action: MediaSessionAction, fn: MediaSessionActionHandler | null) => {
      try { ms.setActionHandler(action, fn); } catch { /* action not supported here */ }
    };
    set("play", () => play());
    set("pause", () => pause());
    set("seekbackward", (d) => skip(-(d.seekOffset || 15)));
    set("seekforward", (d) => skip(d.seekOffset || 30));
    set("seekto", (d) => { if (typeof d.seekTime === "number") seekTo(d.seekTime); });
    set("stop", () => close());
    return () => {
      (["play", "pause", "seekbackward", "seekforward", "seekto", "stop"] as MediaSessionAction[]).forEach((a) => set(a, null));
    };
  }, [state.episode, play, pause, skip, seekTo, close]);

  useEffect(() => {
    if (!("mediaSession" in navigator) || !state.episode) return;
    navigator.mediaSession.playbackState = state.playing ? "playing" : "paused";
    if (state.duration > 0 && "setPositionState" in navigator.mediaSession) {
      try {
        navigator.mediaSession.setPositionState({ duration: state.duration, playbackRate: state.rate, position: Math.min(state.position, state.duration) });
      } catch { /* position briefly past duration while seeking */ }
    }
  }, [state.episode, state.playing, state.position, state.duration, state.rate]);

  const value = useMemo<PodcastPlayer>(() => ({ ...state, load, toggle, play, pause, skip, seekTo, setRate, close }),
    [state, load, toggle, play, pause, skip, seekTo, setRate, close]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The player, or a no-op one outside the provider (so a stray render never crashes). */
export function usePodcastPlayer(): PodcastPlayer {
  const ctx = useContext(Ctx);
  if (ctx) return ctx;
  const noop = () => undefined;
  return { episode: null, playing: false, position: 0, duration: 0, rate: 1, error: false, load: noop, toggle: noop, play: noop, pause: noop, skip: noop, seekTo: noop, setRate: noop, close: noop };
}
