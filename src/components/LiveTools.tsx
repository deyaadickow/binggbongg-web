// The live room's tools on the website's bottom bar — Captions, Voice to Text, Sounds, Stickers,
// Backgrounds, Filters, Music, Text to Voice, Pause Chat (Steve, 2026-11-23: "Missing I-cons from
// the bottom. Caption, Voice to text, Sound, Music, Stickers, Background, Filters, Text to Voice,
// Pause Chat."). The phones' LiveBarTools + LiveRoomActivity, the same server calls and the same
// Firestore paths, so phone viewers see and hear exactly what a phone battler would give them:
//   - Captions write liveCaptions/{room}__{me} (the phones' LiveCaptionsManager) — everyone's CC.
//   - Voice to Text dictates into the chat box and sends the sentence (every role).
//   - Sounds (settings.soundButtons), Music (fetchMusicLibrary / fetchMyMusic) and Text to Voice
//     (synthesizeSpeech) are mixed into the mic that is published (lib/liveFx MixedMic).
//   - Stickers (the sticker catalog), Backgrounds (settings.virtualBackgrounds) and Filters (the
//     phones' 52 face filters, hair colour aside) are drawn into the camera that is published.
//   - Pause Chat: setChatPaused on the battler's own chat; fetchMutedChatUsers every 10 s says
//     whether the chat on screen is paused.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { LocalAudioTrack, LocalVideoTrack } from "livekit-client";
import { giftPrice, mediaUrl, post, type Gift } from "../lib/api";
import { useT } from "../lib/i18n";
import { showGoldAlert } from "./GoldToast";
import { StickerPicker } from "./StickerPicker";
import { PickerSheet } from "./PickerSheet";
import { liveCaptionWriter, ensureFirebaseSignIn, type ChatMessage } from "../lib/firebase";
import { listen, speechSupported } from "../lib/liveSpeech";
import { FACE_FILTERS, LiveFx, filterImageUrl, type FaceFilter } from "../lib/liveFx";
import { loadGifts } from "../lib/gifts";
import { translateChatMessage } from "../lib/translate";
import type { BarItem } from "./BattleActionBar";

// ------------------------------------------------------------------ icons (the phones' drawables + tints)

const Svg = ({ children }: { children: ReactNode }) => <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>{children}</svg>;
const CaptionsIcon = ({ color }: { color: string }) => <Svg><path fill={color} d="M19,4H5C3.89,4 3,4.89 3,6V18C3,19.1 3.89,20 5,20H19C20.1,20 21,19.1 21,18V6C21,4.89 20.1,4 19,4M19,18H5V6H19V18M14.5,11H16V10H13V14H16V13H14.5V11M8,11H9.5V10H6.5V14H9.5V13H8V11Z" /></Svg>;
const MicIcon = ({ color }: { color: string }) => (
  <Svg><rect x="8.5" y="2.5" width="7" height="12" rx="3.5" fill={color} /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" /></Svg>
);
const MusicIcon = ({ color }: { color: string }) => <Svg><path fill={color} d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" /></Svg>;
const StickerIcon = ({ color }: { color: string }) => (
  <Svg><g fill={color}>
    <path d="M12,2C6.48,2 2,6.48 2,12s4.48,10 10,10 10,-4.48 10,-10S17.52,2 12,2zM12,20c-4.41,0 -8,-3.59 -8,-8s3.59,-8 8,-8 8,3.59 8,8 -3.59,8 -8,8z" />
    <path d="M8.5,11.5m-1.5,0a1.5,1.5 0,1 1,3 0a1.5,1.5 0,1 1,-3 0" /><path d="M15.5,11.5m-1.5,0a1.5,1.5 0,1 1,3 0a1.5,1.5 0,1 1,-3 0" />
    <path d="M12,17.5c2.33,0 4.31,-1.46 5.11,-3.5H6.89c0.8,2.04 2.78,3.5 5.11,3.5z" />
  </g></Svg>
);
const BackgroundIcon = ({ color }: { color: string }) => (
  <Svg><g fill={color}>
    <path d="M19,5v14H5V5h14zM19,3H5C3.9,3 3,3.9 3,5v14c0,1.1 0.9,2 2,2h14c1.1,0 2,-0.9 2,-2V5C21,3.9 20.1,3 19,3z" />
    <path d="M13.96,12.29l-2.75,3.54 -1.96,-2.36L6.5,17h11l-3.54,-4.71z" /><path d="M8.5,9.5m-1.5,0a1.5,1.5 0,1 1,3 0a1.5,1.5 0,1 1,-3 0" />
  </g></Svg>
);
const FilterIcon = ({ color }: { color: string }) => (
  <Svg><g fill={color}>
    <path d="M12,2C6.48,2 2,6.48 2,12s4.48,10 10,10 10,-4.48 10,-10S17.52,2 12,2zM12,20c-4.41,0 -8,-3.59 -8,-8s3.59,-8 8,-8 8,3.59 8,8 -3.59,8 -8,8z" />
    <path d="M7,11m-2.3,0a2.3,2.3 0,1 1,4.6 0a2.3,2.3 0,1 1,-4.6 0" /><path d="M17,11m-2.3,0a2.3,2.3 0,1 1,4.6 0a2.3,2.3 0,1 1,-4.6 0" />
    <path d="M12,17.5c2.33,0 4.31,-1.46 5.11,-3.5H6.89c0.8,2.04 2.78,3.5 5.11,3.5z" />
  </g><path d="M4.7,10.4L2,10.4M9.3,11L7,11M14.7,11L17,11M22,10.4L19.3,10.4" stroke={color} strokeWidth="1.4" /></Svg>
);
const BarsIcon = ({ color }: { color: string }) => <Svg><path fill={color} d="M4,12v8h4v-8H4zM10,4v16h4V4h-4zM16,9v11h4V9h-4z" /></Svg>;
const SpeakerIcon = ({ color }: { color: string }) => <Svg><path fill={color} d="M3,10v4c0,0.55 0.45,1 1,1h3l3.29,3.29c0.63,0.63 1.71,0.18 1.71,-0.71L12,6.41c0,-0.89 -1.08,-1.34 -1.71,-0.71L7,9L4,9c-0.55,0 -1,0.45 -1,1zM16.5,12c0,-1.77 -1.02,-3.29 -2.5,-4.03v8.05c1.48,-0.73 2.5,-2.25 2.5,-4.02zM14,4.45v0.2c0,0.38 0.25,0.71 0.6,0.85C17.18,6.53 19,9.06 19,12s-1.82,5.47 -4.4,6.5c-0.36,0.14 -0.6,0.47 -0.6,0.85v0.2c0,0.63 0.63,1.07 1.21,0.85C18.6,19.11 21,15.84 21,12s-2.4,-7.11 -5.79,-8.4c-0.58,-0.23 -1.21,0.22 -1.21,0.85z" /></Svg>;
const MuteIcon = ({ color }: { color: string }) => (
  <Svg><path fill={color} d="M3 9v6h4l5 5V4L7 9H3z" /><path d="M16 9l5 6M21 9l-5 6" stroke={color} strokeWidth="2" strokeLinecap="round" /></Svg>
);

// ------------------------------------------------------------------ data

interface SoundButton { id: number; button?: string | null; sound?: string | null; title?: string | null }
interface VirtualBg { id: number; user_id?: number | null; title?: string | null; file?: string | null }
interface Station { playlist?: string; label?: string; group?: string | null; image?: string | null; tracks?: { url?: string | null }[] }
interface MusicRow { key: string; label: string; image: string | null; category: string; urls: string[]; mine?: boolean }
interface TtsSettings {
  enabled: boolean; voice_type: string; language: string; volume: number; filter: string;
  min_coins: number; blacklist_words: string[]; voice_thanks_follow: boolean; voice_thanks_gift: boolean; added_languages: string[];
}
const TTS_DEFAULTS: TtsSettings = {
  enabled: false, voice_type: "male_deep", language: "en-US", volume: 1, filter: "all", min_coins: 10,
  blacklist_words: [], voice_thanks_follow: true, voice_thanks_gift: true, added_languages: ["en-US", "es-ES", "ar-SA"],
};

let settingsCache: Promise<{ soundButtons: SoundButton[]; virtualBackgrounds: VirtualBg[] }> | null = null;
function loadToolSettings() {
  settingsCache ??= post<{ soundButtons?: SoundButton[]; virtualBackgrounds?: VirtualBg[] }>("fetchSettings", { x: 1 })
    .then((r) => ({ soundButtons: r.data?.soundButtons ?? [], virtualBackgrounds: r.data?.virtualBackgrounds ?? [] }))
    .catch((e) => { settingsCache = null; throw e; });
  return settingsCache;
}

const VIDEO_EXT = /\.(mp4|webm)$/i;
const BG_EXT = /\.(png|gif|webp|jpe?g|mp4|webm)$/i;
const FAV_KEY = "bb.musicFav";
const readFavs = (): string[] => { try { return JSON.parse(localStorage.getItem(FAV_KEY) || "[]") as string[]; } catch { return []; } };
const bool = (v: unknown) => v === true || v === 1 || v === "1" || v === "true";

type Panel = null | "sounds" | "backgrounds" | "filters" | "music";

// ------------------------------------------------------------------ the hook

export interface LiveToolsInput {
  myId: number;
  /** On camera here (battler / host / guest): the camera and mic tools. */
  publishing: boolean;
  /** An audio-only podcast: no camera tools. */
  audioOnly?: boolean;
  micOn: boolean;
  /** The published camera and mic right now. */
  tracks: () => { camera?: LocalVideoTrack | null; mic?: LocalAudioTrack | null };
  /** Where my Captions are written (my own chat room: the CC of my viewers reads it there). */
  captionRoom: string | null;
  /** Pause Chat: shown at all, and the chat it pauses (null: not my own chat — the popup). */
  showPauseChat: boolean;
  pauseRoom: string | null;
  /** The chat on this screen, whose paused flag is read; and whether it is mine to talk in anyway. */
  chatRoom: string | null;
  ownsChat: boolean;
  /** My own chat, read out loud by Text to Voice while it is on (null: nothing to read). */
  ownMessages: ChatMessage[] | null;
  /** Voice to Text: the words so far, then `final` = send them. */
  onDictate: (text: string, final: boolean) => void;
  /** Signed in (Voice to Text needs a chat to type into). */
  canChat: boolean;
}

export function useLiveTools(input: LiveToolsInput) {
  const { t } = useT();
  const inRef = useRef(input);
  inRef.current = input;
  const { myId, publishing, audioOnly, micOn, captionRoom, chatRoom } = input;

  const fx = useMemo(() => new LiveFx(() => inRef.current.tracks()), []);
  useEffect(() => () => { void fx.dispose(); }, [fx]);
  // Leaving the camera (back to watching): everything off.
  useEffect(() => {
    if (publishing) return;
    void fx.dispose();
    setBg(null); setFilter(null); setStickers(0); setSoundId(null); setPlaying(null);
  }, [publishing, fx]);
  useEffect(() => { fx.mic?.setLive(micOn); }, [micOn, fx]);

  const [panel, setPanel] = useState<Panel>(null);
  const togglePanel = (p: Exclude<Panel, null>) => setPanel((cur) => {
    if (cur === "sounds" && p !== "sounds") { fx.mic?.stopSound(); setSoundId(null); }
    return cur === p ? null : p;
  });
  const closePanel = useCallback(() => {
    setPanel((cur) => { if (cur === "sounds") { fx.mic?.stopSound(); setSoundId(null); } return null; });
  }, [fx]);

  // ---- Captions + Voice to Text (one microphone listener at a time, as on the phones) ----
  const [captionsOn, setCaptionsOn] = useState(false);
  const [vttOn, setVttOn] = useState(false);
  const stopCaptions = useRef<(() => void) | null>(null);
  const stopVtt = useRef<(() => void) | null>(null);
  const toggleCaptions = () => {
    if (captionsOn) { stopCaptions.current?.(); stopCaptions.current = null; setCaptionsOn(false); return; }
    if (!speechSupported()) { showGoldAlert(t("lt_speech_unsupported")); return; }
    if (vttOn) { stopVtt.current?.(); stopVtt.current = null; setVttOn(false); }
    const room = captionRoom;
    if (!room || !myId) return;
    const writer = liveCaptionWriter(room, myId);
    void ensureFirebaseSignIn().catch(() => undefined);
    const stop = listen({ continuous: true, onText: (text, fin) => writer.update(text, fin), onStop: () => { writer.reset(); setCaptionsOn(false); } });
    if (!stop) { showGoldAlert(t("lt_speech_unsupported")); return; }
    stopCaptions.current = stop;
    setCaptionsOn(true);
    showGoldAlert(t("lt_captions_on"));
  };
  // Mic Off ends Captions too (the phones' toggleMic).
  useEffect(() => { if (!micOn && stopCaptions.current) { stopCaptions.current(); stopCaptions.current = null; setCaptionsOn(false); } }, [micOn]);
  useEffect(() => { if (!publishing && stopCaptions.current) { stopCaptions.current(); stopCaptions.current = null; } }, [publishing]);
  const toggleVtt = () => {
    if (vttOn) { stopVtt.current?.(); stopVtt.current = null; setVttOn(false); return; }
    if (!speechSupported()) { showGoldAlert(t("lt_speech_unsupported")); return; }
    if (captionsOn) { showGoldAlert(t("lt_one_mic")); return; }
    const stop = listen({
      continuous: false,
      onText: (text, fin) => inRef.current.onDictate(text, fin),
      onStop: () => { stopVtt.current = null; setVttOn(false); },
    });
    if (!stop) { showGoldAlert(t("lt_speech_unsupported")); return; }
    stopVtt.current = stop;
    setVttOn(true);
  };
  useEffect(() => () => { stopCaptions.current?.(); stopVtt.current?.(); }, []);

  // ---- Pause Chat ----
  const [chatPaused, setChatPaused] = useState(false);
  const pauseVersion = useRef(0);
  useEffect(() => {
    setChatPaused(false);
    if (!chatRoom) return;
    let alive = true;
    const poll = async () => {
      const asked = pauseVersion.current;
      const r = await post<unknown>("fetchMutedChatUsers", { room_name: chatRoom }).catch(() => null);
      if (alive && r && r.status && asked === pauseVersion.current) setChatPaused(bool(r.chat_paused));
    };
    void poll();
    const id = window.setInterval(poll, 10_000);
    return () => { alive = false; window.clearInterval(id); };
  }, [chatRoom]);
  const togglePause = async () => {
    const room = inRef.current.pauseRoom;
    if (!room) { showGoldAlert(t("pause_chat_own_live_only")); return; }
    const next = !chatPaused;
    pauseVersion.current++;
    try {
      const r = await post<unknown>("setChatPaused", { room_name: room, my_user_id: myId, paused: next ? "true" : "false" });
      pauseVersion.current++;
      if (r.status) { setChatPaused(next); showGoldAlert(t(next ? "lt_chat_paused" : "lt_chat_resumed")); }
      else showGoldAlert(r.message || t("lt_couldnt_update_chat"));
    } catch { showGoldAlert(t("lt_couldnt_update_chat")); }
  };

  // ---- Sounds ----
  const [sounds, setSounds] = useState<SoundButton[] | null>(null);
  const [bgs, setBgs] = useState<VirtualBg[] | null>(null);
  const [soundId, setSoundId] = useState<number | null>(null);
  useEffect(() => {
    if (!publishing) return;
    loadToolSettings().then((s) => {
      setSounds(s.soundButtons.filter((b) => b.sound));
      setBgs(s.virtualBackgrounds.filter((b) => b.file && BG_EXT.test(b.file) && (!b.user_id || b.user_id === myId)));
    }).catch(() => { setSounds([]); setBgs([]); });
  }, [publishing, myId]);
  const openSounds = () => {
    if (sounds && sounds.length === 0) { showGoldAlert(t("lt_no_sounds")); return; }
    togglePanel("sounds");
  };
  const tapSound = async (s: SoundButton) => {
    if (soundId === s.id) { fx.mic?.stopSound(); setSoundId(null); return; }
    const mic = await fx.ensureMic();
    if (!mic || !s.sound) { showGoldAlert(t("lt_sound_failed")); return; }
    setSoundId(s.id);
    const ok = await mic.playSound(mediaUrl(s.sound));
    if (!ok) { setSoundId(null); showGoldAlert(t("lt_sound_failed")); }
  };

  // ---- Backgrounds / Filters / Stickers: the camera ----
  const [bg, setBg] = useState<number | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<FaceFilter["tab"]>("classic");
  const [stickers, setStickers] = useState(0);
  const [stickerMenu, setStickerMenu] = useState(false);
  const [stickerPick, setStickerPick] = useState(false);
  const cam = async () => {
    const c = await fx.ensureCam();
    if (!c) { showGoldAlert(t("lt_camera_off")); return null; }
    c.onError = (what) => showGoldAlert(t(what === "background" ? "lt_bg_failed" : "lt_fx_failed"));
    return c;
  };
  const pickBg = async (b: VirtualBg | null) => {
    if (!b) {
      setBg(null);
      fx.cam?.setBackground(null);
      await fx.releaseCamIfIdle();
      closePanel();
      return;
    }
    const c = await cam();
    if (!c || !b.file) return;
    setBg(b.id);
    c.setBackground({ url: mediaUrl(b.file), isVideo: VIDEO_EXT.test(b.file) });
  };
  const pickFilter = async (f: FaceFilter | null) => {
    if (!f) {
      setFilter(null);
      fx.cam?.setFilter(null);
      await fx.releaseCamIfIdle();
      closePanel();
      return;
    }
    const c = await cam();
    if (!c) return;
    setFilter(f.id);
    c.setFilter(f);
  };
  const openStickers = () => { if (stickers === 0) setStickerPick(true); else setStickerMenu(true); };
  const addSticker = async (file: string) => {
    setStickerPick(false);
    const c = await cam();
    if (!c) return;
    const ok = await c.addSticker(mediaUrl(file));
    if (!ok) { showGoldAlert(t("lt_fx_failed")); await fx.releaseCamIfIdle(); return; }
    setStickers(c.stickerCount);
  };
  const removeStickers = async (all: boolean) => {
    setStickerMenu(false);
    const c = fx.cam;
    if (!c) { setStickers(0); return; }
    if (all) c.clearStickers(); else c.removeLastSticker();
    setStickers(c.stickerCount);
    await fx.releaseCamIfIdle();
  };
  // A new camera track (a reconnect) starts plain: show nothing as on.
  const camLost = !publishing;
  useEffect(() => { if (camLost) { setBg(null); setFilter(null); setStickers(0); } }, [camLost]);

  // ---- Music ----
  const [music, setMusic] = useState<MusicRow[] | null>(null);
  const [mine, setMine] = useState<MusicRow[]>([]);
  const [musicCat, setMusicCat] = useState("__all");
  const [musicQuery, setMusicQuery] = useState("");
  const [favs, setFavs] = useState<string[]>(readFavs);
  const [playing, setPlaying] = useState<string | null>(null);
  const rotation = useRef<{ key: string; urls: string[]; i: number } | null>(null);
  const openMusic = () => {
    togglePanel("music");
    if (music || !myId) return;
    post<unknown>("fetchMusicLibrary", { user_id: myId }).then((r) => {
      const cat = (r.catalogue ?? []) as { category?: string; channels?: Station[] }[];
      setMusic(cat.flatMap((c) => (c.channels ?? []).map((s) => ({
        key: s.playlist || `${c.category}-${s.label}`, label: s.label || "", image: s.image ?? null, category: c.category || "",
        urls: (s.tracks ?? []).map((x) => x.url || "").filter(Boolean),
      }))));
    }).catch(() => setMusic([]));
    post<{ id: number; title?: string; url?: string }[]>("fetchMyMusic", { user_id: myId }).then((r) => {
      setMine((r.data ?? []).filter((s) => s.url).map((s) => ({ key: `mine-${s.id}`, label: s.title || "", image: null, category: "", urls: [s.url!], mine: true })));
    }).catch(() => undefined);
  };
  const playNext = useCallback(async () => {
    const rot = rotation.current;
    const mic = fx.mic;
    if (!rot || !mic) return;
    const url = rot.urls[rot.i % rot.urls.length];
    await mic.playMusic(url, () => {
      if (rotation.current !== rot) return;
      rot.i = (rot.i + 1) % rot.urls.length;
      void playNext();
    }, () => {
      if (rotation.current !== rot) return;
      rotation.current = null;
      setPlaying(null);
      showGoldAlert(t("lt_station_failed"));
    });
  }, [fx, t]);
  const playStation = async (row: MusicRow) => {
    if (!row.urls.length) { showGoldAlert(t("lt_station_failed")); return; }
    const mic = await fx.ensureMic();
    if (!mic) { showGoldAlert(t("lt_station_failed")); return; }
    // The first song first, the rest shuffled (the phones' playStation).
    const rest = row.urls.slice(1).sort(() => Math.random() - 0.5);
    rotation.current = { key: row.key, urls: [row.urls[0], ...rest], i: 0 };
    setPlaying(row.key);
    void playNext();
  };
  const stopMusic = () => { rotation.current = null; fx.mic?.stopMusic(); setPlaying(null); };
  const toggleFav = (key: string) => setFavs((cur) => {
    const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
    try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* this page only */ }
    return next;
  });
  useEffect(() => { if (!publishing) { rotation.current = null; setPlaying(null); } }, [publishing]);

  // ---- Text to Voice: my own chat, read out loud into the room ----
  const [ttsOpen, setTtsOpen] = useState(false);
  const [tts, setTts] = useState<TtsSettings | null>(null);
  const ttsRef = useRef<TtsSettings | null>(null);
  ttsRef.current = tts;
  const [ttsLangs, setTtsLangs] = useState<{ code: string; label: string }[]>([]);
  const loadTts = useCallback(async (): Promise<TtsSettings> => {
    if (ttsRef.current) return ttsRef.current;
    let s = TTS_DEFAULTS;
    try {
      const r = await post<unknown>("getTextToVoiceSettings", { user_id: myId });
      const x = (r.settings ?? {}) as Record<string, unknown>;
      if (r.status) {
        let words: string[] = [];
        try { words = Array.isArray(x.blacklist_words) ? x.blacklist_words as string[] : JSON.parse(String(x.blacklist_words || "[]")); } catch { /* none */ }
        s = {
          enabled: bool(x.enabled), voice_type: String(x.voice_type || s.voice_type), language: String(x.language || s.language),
          volume: Number(x.volume ?? 1), filter: String(x.filter || "all"), min_coins: Number(x.min_coins ?? 10),
          blacklist_words: words, voice_thanks_follow: x.voice_thanks_follow === undefined ? true : bool(x.voice_thanks_follow),
          voice_thanks_gift: x.voice_thanks_gift === undefined ? true : bool(x.voice_thanks_gift),
          added_languages: Array.isArray(x.added_languages) ? x.added_languages as string[] : s.added_languages,
        };
      }
    } catch { /* defaults */ }
    setTts(s);
    ttsRef.current = s;
    return s;
  }, [myId]);
  useEffect(() => { if (publishing && myId) void loadTts(); }, [publishing, myId, loadTts]);
  const openTts = async () => {
    await loadTts();
    if (!ttsLangs.length) {
      post<unknown>("fetchTtsLanguages", { user_id: myId })
        .then((r) => { if (r.status && Array.isArray(r.languages)) setTtsLangs(r.languages as { code: string; label: string }[]); })
        .catch(() => undefined);
    }
    setTtsOpen(true);
  };
  /** Speak one line in the member's voice into the room (bypassing the filters: the Test button). */
  const speak = useCallback(async (text: string, s: TtsSettings) => {
    const r = await post<unknown>("synthesizeSpeech", { text, voice_type: s.voice_type, language: s.language, volume: s.volume }).catch(() => null);
    const audio = r && r.status ? String(r.audio_base64 || "") : "";
    if (!audio) return;
    const mic = await fx.ensureMic();
    await mic?.playVoice(audio, s.volume);
  }, [fx]);
  const saveTts = async (next: TtsSettings) => {
    setTts(next);
    setTtsOpen(false);
    if (!next.added_languages.includes(next.language)) {
      void post("addTtsLanguage", { user_id: myId, language: next.language }).catch(() => undefined);
      next = { ...next, added_languages: [...next.added_languages, next.language] };
      setTts(next);
    }
    try {
      const r = await post("saveTextToVoiceSettings", {
        user_id: myId, enabled: next.enabled ? "true" : "false", voice_type: next.voice_type, language: next.language,
        volume: next.volume, filter: next.filter, min_coins: next.min_coins, blacklist_words: JSON.stringify(next.blacklist_words),
        voice_thanks_follow: next.voice_thanks_follow ? "true" : "false", voice_thanks_gift: next.voice_thanks_gift ? "true" : "false",
      });
      showGoldAlert(r.status ? t("lt_tts_saved") : (r.message || t("lt_save_failed")));
    } catch { showGoldAlert(t("lt_save_failed")); }
  };
  // The reading queue (TtsEngine): 3 s between lines, 100 characters, 20 waiting at most.
  const lastRead = useRef(Date.now());
  const queue = useRef<string[]>([]);
  const busy = useRef(false);
  const lastQueued = useRef(0);
  const giftsRef = useRef<Promise<Gift[]> | null>(null);
  const drain = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      while (queue.current.length) {
        const text = queue.current.shift()!;
        const s = ttsRef.current;
        if (s?.enabled) await speak(text, s);
      }
    } finally { busy.current = false; }
  }, [speak]);
  const own = input.ownMessages;
  useEffect(() => {
    if (!own || !publishing) return;
    const fresh = own.filter((m) => m.sentAt > lastRead.current && m.senderUserId !== 0 && m.senderUserId !== myId);
    if (!fresh.length) return;
    lastRead.current = Math.max(...fresh.map((m) => m.sentAt));
    const s = ttsRef.current;
    if (!s?.enabled) return;
    for (const m of fresh) {
      void (async () => {
        const isGift = m.senderUserId < 0;
        let text = (m.message || "").trim();
        if (!text) return;
        if (s.filter === "gifted_only" && !isGift) return;
        if (s.filter === "min_coins") {
          if (!isGift) return;
          giftsRef.current ??= loadGifts().catch(() => []);
          const g = (await giftsRef.current).find((x) => x.id === -m.senderUserId);
          if (!g || giftPrice(g) < s.min_coins) return;
        }
        const lower = text.toLowerCase();
        if (s.blacklist_words.some((w) => w && lower.includes(w.toLowerCase()))) return;
        const now = Date.now();
        if (now - lastQueued.current < 3000) return;
        lastQueued.current = now;
        const target = s.language.split("-")[0];
        if (!isGift && target) {
          const tr = await translateChatMessage(text, target).catch(() => null);
          if (tr?.translated) text = tr.translated;
        }
        if (queue.current.length >= 20) queue.current.shift();
        queue.current.push(text.slice(0, 100));
        void drain();
      })();
    }
  }, [own, publishing, myId, drain]);

  // ---- the buttons, in the phones' order ----
  const cams = publishing && !audioOnly;
  const afterCc: BarItem[] = input.canChat
    ? [{ key: "vtt", icon: <MicIcon color={vttOn ? "#FF3B30" : "#FFD54F"} />, label: t("lt_voice_to_text"), onClick: toggleVtt, active: vttOn }]
    : [];
  const afterMic: BarItem[] = publishing
    ? [{ key: "captions", icon: <CaptionsIcon color={captionsOn ? "#FF3B30" : "#FFD54F"} />, label: t("lt_captions"), onClick: toggleCaptions, active: captionsOn }]
    : [];
  const tail: BarItem[] = publishing ? [
    { key: "sounds", icon: <MusicIcon color="#FF3B30" />, label: t("lt_sounds"), onClick: openSounds, active: panel === "sounds" },
    ...(cams ? [
      { key: "stickers", icon: <StickerIcon color="#FFD54A" />, label: t("lt_stickers"), onClick: openStickers, active: stickers > 0 },
      { key: "bgs", icon: <BackgroundIcon color="#4FC3F7" />, label: t("lt_backgrounds"), onClick: () => togglePanel("backgrounds"), active: bg != null },
      { key: "filters", icon: <FilterIcon color="#FF80AB" />, label: t("lt_filters"), onClick: () => togglePanel("filters"), active: filter != null },
    ] : []),
    { key: "music", icon: <BarsIcon color="#7C4DFF" />, label: t("lt_music"), onClick: openMusic, active: playing != null },
    { key: "tts", icon: <SpeakerIcon color="#FFFFFF" />, label: t("fname_text_to_voice"), onClick: () => { void openTts(); }, active: !!tts?.enabled },
    ...(input.showPauseChat ? [{ key: "pause", icon: <MuteIcon color="#FFFFFF" />, label: t(chatPaused && input.pauseRoom ? "lt_resume_chat" : "lt_pause_chat"), onClick: () => { void togglePause(); }, active: chatPaused && !!input.pauseRoom }] : []),
  ] : [];

  // ---- the panels ----
  const musicRows = useMemo(() => {
    const q = musicQuery.trim().toLowerCase();
    let rows = musicCat === "__mine" ? mine : musicCat === "__saved" ? (music ?? []).filter((r) => favs.includes(r.key))
      : musicCat === "__all" ? (music ?? []) : (music ?? []).filter((r) => r.category === musicCat);
    if (q) rows = rows.filter((r) => r.label.toLowerCase().includes(q) || r.category.toLowerCase().includes(q));
    return rows;
  }, [music, mine, musicCat, musicQuery, favs]);
  const categories = useMemo(() => [...new Set((music ?? []).map((r) => r.category).filter(Boolean))], [music]);

  const overlay = (
    <>
      {panel && (
        <div className="lt-panel" role="dialog" aria-label={t(panel === "sounds" ? "lt_sounds" : panel === "backgrounds" ? "lt_backgrounds" : panel === "filters" ? "lt_filters" : "lt_music")}>
          <div className="lt-head">
            <b>{panel === "sounds" ? `🔊 ${t("lt_sounds")}` : panel === "backgrounds" ? `🖼️ ${t("lt_backgrounds")}` : panel === "filters" ? `✨ ${t("lt_filters")}` : `🎵 ${t("lt_music")}`}</b>
            {panel === "music" && playing && <button type="button" className="lt-chip" onClick={stopMusic}>■ {t("lt_stop")}</button>}
            <button type="button" className="lt-chip" onClick={closePanel} aria-label={t("close")}>✕</button>
          </div>
          {panel === "sounds" && (
            <div className="lt-strip">
              {(sounds ?? []).map((s) => (
                <button key={s.id} type="button" className={`lt-tile${soundId === s.id ? " on" : ""}`} onClick={() => { void tapSound(s); }} title={s.title ?? ""}>
                  {s.button ? <img src={mediaUrl(s.button)} alt="" /> : <span className="lt-emoji">🔊</span>}
                  <span>{s.title}</span>
                </button>
              ))}
            </div>
          )}
          {panel === "backgrounds" && (
            <div className="lt-strip">
              <button type="button" className={`lt-tile${bg == null ? " on" : ""}`} onClick={() => { void pickBg(null); }}><span className="lt-emoji">🚫</span><span>{t("none")}</span></button>
              {(bgs ?? []).map((b) => (
                <button key={b.id} type="button" className={`lt-tile wide${bg === b.id ? " on" : ""}`} onClick={() => { void pickBg(b); }} title={b.title ?? ""}>
                  {b.file && VIDEO_EXT.test(b.file)
                    ? <video src={mediaUrl(b.file)} muted playsInline preload="metadata" />
                    : <img src={mediaUrl(b.file)} alt="" loading="lazy" />}
                  <span>{b.title}</span>
                </button>
              ))}
            </div>
          )}
          {panel === "filters" && (
            <>
              <div className="lt-tabs">
                {(["classic", "funny", "makeup"] as const).map((tab) => (
                  <button key={tab} type="button" className={`lt-chip${filterTab === tab ? " on" : ""}`} onClick={() => setFilterTab(tab)}>
                    {t(tab === "classic" ? "lt_tab_classic" : tab === "funny" ? "lt_tab_funny" : "lt_tab_makeup")}
                  </button>
                ))}
              </div>
              <div className="lt-strip">
                <button type="button" className={`lt-tile${filter == null ? " on" : ""}`} onClick={() => { void pickFilter(null); }}><span className="lt-emoji">🚫</span><span>{t("none")}</span></button>
                {FACE_FILTERS.filter((f) => f.tab === filterTab).map((f) => (
                  <button key={f.id} type="button" className={`lt-tile${filter === f.id ? " on" : ""}`} onClick={() => { void pickFilter(f); }} title={f.label}>
                    {f.anchor ? <img src={filterImageUrl(f)} alt="" /> : <span className="lt-swatch" style={{ background: f.color }} />}
                    <span>{f.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {panel === "music" && (
            <>
              <input className="input" value={musicQuery} onChange={(e) => setMusicQuery(e.target.value)} placeholder={t("search")} style={{ width: "100%", margin: "4px 0 6px" }} />
              <div className="lt-tabs scroll">
                {[["__mine", t("lt_my_music")], ["__saved", t("lt_saved")], ["__all", t("all")], ...categories.map((c) => [c, c])].map(([k, label]) => (
                  <button key={k} type="button" className={`lt-chip${musicCat === k ? " on" : ""}`} onClick={() => setMusicCat(k)}>{label}</button>
                ))}
              </div>
              <div className="lt-list">
                {music && musicRows.length === 0 && (
                  <p className="soft" style={{ textAlign: "center", fontSize: 13 }}>{musicCat === "__mine" && !musicQuery ? t("lt_my_music_empty") : t("lt_no_stations")}</p>
                )}
                {musicRows.map((r) => (
                  <div key={r.key} className={`lt-row${playing === r.key ? " on" : ""}`}>
                    <button type="button" className="lt-row-main" onClick={() => { if (playing === r.key) stopMusic(); else void playStation(r); }}>
                      <span className="lt-cover" style={r.image ? { backgroundImage: `url(${JSON.stringify(mediaUrl(r.image))})` } : undefined}>{playing === r.key ? "■" : "▶"}</span>
                      <span className="lt-row-text"><b>{r.label}</b><small>{r.category}</small></span>
                    </button>
                    {!r.mine && <button type="button" className="lt-fav" onClick={() => toggleFav(r.key)} aria-label={t("lt_saved")}>{favs.includes(r.key) ? "★" : "☆"}</button>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      {stickerPick && <StickerPicker onPick={(s) => { void addSticker(s.file); }} onClose={() => setStickerPick(false)} />}
      {stickerMenu && (
        <div className="cb-menu-backdrop" onClick={() => setStickerMenu(false)} role="dialog" aria-modal="true">
          <div className="cb-menu" onClick={(e) => e.stopPropagation()}>
            <div className="cb-menu-title">{t("lt_stickers")}</div>
            <button type="button" className="cb-menu-row" onClick={() => { setStickerMenu(false); setStickerPick(true); }}><span>{t("add_sticker")}</span><b>›</b></button>
            <button type="button" className="cb-menu-row" onClick={() => { void removeStickers(false); }}><span>{t("lt_remove_last_sticker")}</span><b>›</b></button>
            <button type="button" className="cb-menu-row" onClick={() => { void removeStickers(true); }}><span>{t("lt_remove_all_stickers")}</span><b>›</b></button>
            <button type="button" className="btn ghost" style={{ width: "100%", marginTop: 4 }} onClick={() => setStickerMenu(false)}>{t("close")}</button>
          </div>
        </div>
      )}
      {ttsOpen && tts && <TtsSheet initial={tts} languages={ttsLangs} onTest={(s) => { void speak(testPhrase(s.language), s); }} onSave={(s) => { void saveTts(s); }} onClose={() => setTtsOpen(false)} />}
    </>
  );

  return { afterCc, afterMic, tail, overlay, chatPaused };
}

// ------------------------------------------------------------------ Text to Voice settings

const VOICES = ["male_deep", "female_soft", "robot", "chipmunk"] as const;

function TtsSheet({ initial, languages, onTest, onSave, onClose }: {
  initial: TtsSettings;
  languages: { code: string; label: string }[];
  onTest: (s: TtsSettings) => void;
  onSave: (s: TtsSettings) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [s, setS] = useState(initial);
  const [langOpen, setLangOpen] = useState(false);
  const set = <K extends keyof TtsSettings>(k: K, v: TtsSettings[K]) => setS((cur) => ({ ...cur, [k]: v }));
  const langs = languages.length ? languages : initial.added_languages.map((code) => ({ code, label: code }));
  const voiceKey = { male_deep: "lt_tts_v_male", female_soft: "lt_tts_v_female", robot: "lt_tts_v_robot", chipmunk: "lt_tts_v_chipmunk" } as const;
  return (
    <div className="cb-menu-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="cb-menu lt-tts" onClick={(e) => e.stopPropagation()}>
        <div className="cb-menu-title">🔊 {t("fname_text_to_voice")}</div>
        <label className="lt-switch"><input type="checkbox" checked={s.enabled} onChange={(e) => set("enabled", e.target.checked)} /> {t("lt_tts_read_out")}</label>
        <div className="lt-label">{t("lt_tts_voice")}</div>
        <div className="lt-tabs">
          {VOICES.map((v) => <button key={v} type="button" className={`lt-chip${s.voice_type === v ? " on" : ""}`} onClick={() => set("voice_type", v)}>{t(voiceKey[v])}</button>)}
        </div>
        <div className="lt-label">{t("lt_tts_language")}</div>
        <button type="button" className="cb-menu-row" style={{ marginBottom: 0 }} onClick={() => setLangOpen(true)}>
          <span>{langs.find((l) => l.code === s.language)?.label ?? s.language}</span><b>›</b>
        </button>
        {langOpen && (
          <PickerSheet title={t("lt_tts_language")} noun="language" selected={s.language}
            items={langs.map((l) => ({ code: l.code, name: l.label }))}
            onPick={(code) => { set("language", code); setLangOpen(false); }} onClose={() => setLangOpen(false)} />
        )}
        <div className="lt-label">{t("lt_tts_volume")} · {Math.round(s.volume * 100)}%</div>
        <input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => set("volume", Number(e.target.value))} style={{ width: "100%", accentColor: "#D4AF37" }} />
        <div className="lt-label">{t("lt_tts_which")}</div>
        {(["all", "gifted_only", "min_coins"] as const).map((f) => (
          <label key={f} className="lt-switch"><input type="radio" name="tts-filter" checked={s.filter === f} onChange={() => set("filter", f)} /> {t(f === "all" ? "lt_tts_f_all" : f === "gifted_only" ? "lt_tts_f_gifted" : "lt_tts_f_min")}</label>
        ))}
        {s.filter === "min_coins" && (
          <input className="input" type="number" min={1} value={s.min_coins} onChange={(e) => set("min_coins", Math.max(1, Number(e.target.value) || 1))} placeholder={t("lt_tts_min_bbs")} aria-label={t("lt_tts_min_bbs")} style={{ width: "100%" }} />
        )}
        <button type="button" className="btn ghost" style={{ width: "100%", marginTop: 10 }} onClick={() => onTest(s)}>🔊 {t("lt_tts_test")}</button>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button type="button" className="btn ghost" style={{ flex: 1 }} onClick={onClose}>{t("cancel")}</button>
          <button type="button" className="btn" style={{ flex: 1 }} onClick={() => onSave(s)}>{t("save")}</button>
        </div>
      </div>
    </div>
  );
}

/** The Test button speaks a sentence in the language picked (the phones' testPhraseFor). */
function testPhrase(language: string): string {
  const p: Record<string, string> = {
    af: "Hallo, dit is 'n toets.", am: "ሰላም, ይህ ሙከራ ነው።", ar: "هكذا سيبدو صوت النص الخاص بك.", bg: "Здравейте, това е тест.",
    bn: "হ্যালো, এটি একটি পরীক্ষা।", ca: "Hola, això és una prova.", "cmn-CN": "你好，这是一个测试。", "cmn-TW": "你好，這是一個測試。",
    cs: "Ahoj, toto je test.", da: "Hej, dette er en test.", de: "Hallo, dies ist ein Test.", el: "Γεια σας, αυτό είναι ένα τεστ.",
    es: "Así es como sonará tu texto a voz.", et: "Tere, see on test.", eu: "Kaixo, hau proba bat da.", fi: "Hei, tämä on testi.",
    fil: "Kumusta, ito ay isang pagsubok.", fr: "Bonjour, ceci est un test.", gl: "Ola, isto é unha proba.", gu: "નમસ્તે, આ એક પરીક્ષણ છે.",
    he: "שלום, זהו מבחן.", hi: "नमस्ते, यह एक परीक्षण है।", hu: "Helló, ez egy teszt.", id: "Halo, ini adalah tes.", is: "Halló, þetta er próf.",
    it: "Ciao, questo è un test.", ja: "こんにちは、これはテストです。", kn: "ನಮಸ್ಕಾರ, ಇದು ಒಂದು ಪರೀಕ್ಷೆ.", ko: "안녕하세요, 이것은 테스트입니다.",
    lt: "Labas, tai yra testas.", lv: "Sveiki, šis ir tests.", ml: "ഹലോ, ഇത് ഒരു പരീക്ഷണമാണ്.", mr: "नमस्कार, ही एक चाचणी आहे.",
    ms: "Helo, ini adalah ujian.", nb: "Hei, dette er en test.", nl: "Hallo, dit is een test.", pa: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ, ਇਹ ਇੱਕ ਟੈਸਟ ਹੈ।",
    pl: "Cześć, to jest test.", pt: "Olá, este é um teste.", ro: "Bună, acesta este un test.", ru: "Привет, это тест.", sk: "Ahoj, toto je test.",
    sr: "Здраво, ово је тест.", sv: "Hej, det här är ett test.", ta: "வணக்கம், இது ஒரு சோதனை.", te: "నమస్కారం, ఇది ఒక పరీక్ష.",
    th: "สวัสดี นี่คือการทดสอบ", tr: "Merhaba, bu bir testtir.", uk: "Привіт, це тест.", ur: "ہیلو، یہ ایک ٹیسٹ ہے۔",
    vi: "Xin chào, đây là một bài kiểm tra.", yue: "你好，呢個係測試。",
  };
  return p[language] ?? p[language.split("-")[0]] ?? "This is how your text to voice will sound.";
}
