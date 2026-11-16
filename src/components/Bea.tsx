// Bea, the talking Bingg Bongg Assistant. Steve, 2026-11-16: "Can we make our advertising girl our
// Bingg Bongg Assistance? to make it look like some one is talking to them for real?" -> "Can we
// create our own virtual talking assistance that won't cost anything?" -> "Yes, build Bea".
//
// Two silent loops of her (listening / talking, made once from the English ad's woman) sit on top
// of each other; while her voice plays — the server's TTS of the answer in the ads' own woman's
// voice (supportReplyVoice / beaGreeting) — the talking loop shows, else the listening one. A
// browser may refuse sound before the visitor has clicked anything: then she just stays listening.
import { useCallback, useEffect, useRef, useState } from "react";
import { UPLOAD_BASE, post } from "../lib/api";

const IDLE = UPLOAD_BASE + "uploads/assistant/bea_idle.mp4";
const TALK = UPLOAD_BASE + "uploads/assistant/bea_talk.mp4";
const POSTER = UPLOAD_BASE + "uploads/assistant/bea_poster.jpg";
const MUTE_KEY = "bea_muted";
let greeted = false;

/** Bea's languages on Support (Steve, 2026-11-16: "Add a language picker next to Archive button as
 *  well, once they change the language, it will stay until they change it again"). Codes match the
 *  server's SupportAssistant::LANGUAGES; "" = Auto (she answers in the language they type in). */
export const BEA_LANGUAGES: { value: string; label: string }[] = [
  { value: "", label: "🌐 Auto" }, { value: "en", label: "🌐 English" },
  { value: "fil", label: "🌐 Filipino (Tagalog)" }, { value: "id", label: "🌐 Bahasa Indonesia" },
  { value: "es", label: "🌐 Español" }, { value: "pt", label: "🌐 Português" }, { value: "fr", label: "🌐 Français" },
  { value: "de", label: "🌐 Deutsch" }, { value: "it", label: "🌐 Italiano" }, { value: "ar", label: "🌐 العربية" },
  { value: "hi", label: "🌐 हिन्दी" }, { value: "ja", label: "🌐 日本語" }, { value: "ko", label: "🌐 한국어" },
  { value: "zh", label: "🌐 中文" }, { value: "vi", label: "🌐 Tiếng Việt" }, { value: "th", label: "🌐 ไทย" },
  { value: "ms", label: "🌐 Bahasa Melayu" }, { value: "tr", label: "🌐 Türkçe" }, { value: "ru", label: "🌐 Русский" },
  { value: "nl", label: "🌐 Nederlands" }, { value: "pl", label: "🌐 Polski" },
];

export function beaLanguage(): string {
  try { return localStorage.getItem("bea_language") ?? ""; } catch { return ""; }
}

export function setBeaLanguage(code: string) {
  try { localStorage.setItem("bea_language", code); } catch { /* private window: this visit only */ }
}

function readMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; }
}

export interface BeaVoice {
  talking: boolean;
  /** Steve, 2026-11-16: "After the welcome message let Bea disappear" — the face shows only for her hello. */
  faceVisible: boolean;
  /** The last answer's voice, for "Repeat the Answer". */
  lastAnswer: string | null;
  repeatAnswer: () => void;
  /** Her HeyGen hello video (with sound) while it plays, else null. */
  hello: string | null;
  endHello: () => void;
  muted: boolean;
  play: (key: string) => void;
  stop: () => void;
  toggleMute: () => void;
  greetOnce: (language: string) => void;
  /** Her hello once more, after the member picks another language. */
  greetAgain: (language: string) => void;
}

export function useBea(): BeaVoice {
  const [talking, setTalking] = useState(false);
  const [hello, setHello] = useState<string | null>(null);
  const [greetingVoice, setGreetingVoice] = useState(false);
  const [lastAnswer, setLastAnswer] = useState<string | null>(null);
  const [muted, setMuted] = useState(readMuted);
  const audio = useRef<HTMLAudioElement | null>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const endHello = useCallback(() => setHello(null), []);
  const stop = useCallback(() => {
    setHello(null);
    setGreetingVoice(false);
    const a = audio.current;
    if (a) { a.pause(); a.src = ""; }
    audio.current = null;
    setTalking(false);
  }, []);

  const play = useCallback((key: string, greeting = false) => {
    stop();
    if (!key) return;
    if (!greeting) setLastAnswer(key);
    if (mutedRef.current) return;
    if (greeting) setGreetingVoice(true);
    const done = () => { setTalking(false); if (greeting) setGreetingVoice(false); };
    const a = new Audio(key.startsWith("http") ? key : UPLOAD_BASE + key);
    a.onplaying = () => setTalking(true);
    a.onpause = () => setTalking(false);
    a.onended = done;
    a.onerror = done;
    audio.current = a;
    a.play().catch(done);
  }, [stop]);

  const repeatAnswer = useCallback(() => { if (lastAnswer) play(lastAnswer); }, [lastAnswer, play]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      try { localStorage.setItem(MUTE_KEY, next ? "1" : "0"); } catch { /* private window */ }
      if (next) stop();
      return next;
    });
  }, [stop]);

  const greetOnce = useCallback((language: string) => {
    if (greeted) return;
    greeted = true;
    post<{ audio?: string | null; video?: string | null }>("beaGreeting", { language, user_id: 0 })
      .then((r) => {
        if (!r.status || mutedRef.current) return;
        // Steve, 2026-11-16: "If a welcome message is better from heygen we can get it and pay for it once."
        if (r.data?.video) setHello(UPLOAD_BASE + r.data.video);
        else if (r.data?.audio) play(r.data.audio, true);
      })
      .catch(() => undefined);
  }, [play]);

  const greetAgain = useCallback((language: string) => {
    stop();
    greeted = false;
    greetOnce(language);
  }, [stop, greetOnce]);

  useEffect(() => stop, [stop]);
  const faceVisible = hello !== null || greetingVoice;
  return { talking, faceVisible, lastAnswer, repeatAnswer, hello, endHello, muted, play, stop, toggleMute, greetOnce, greetAgain };
}

function BeaVideo({ talking, hello, onHelloEnd, width, height }: { talking: boolean; hello?: string | null; onHelloEnd?: () => void; width: number; height: number }) {
  const box: React.CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" };
  return (
    <div style={{ position: "relative", width, height, borderRadius: 14, overflow: "hidden", border: "2px solid var(--gold)", background: "#000", flex: "0 0 auto" }}>
      <video src={IDLE} poster={POSTER} autoPlay loop muted playsInline style={box} />
      <video src={TALK} autoPlay loop muted playsInline style={{ ...box, opacity: talking ? 1 : 0, transition: "opacity .18s" }} />
      {hello && (
        // With sound; a browser that refuses sound before any click plays nothing and she stays listening.
        <video key={hello} src={hello} autoPlay playsInline style={box}
          onEnded={onHelloEnd} onError={onHelloEnd}
          ref={(el) => { el?.play().catch(() => onHelloEnd?.()); }} />
      )}
    </div>
  );
}

function VoiceButton({ bea }: { bea: BeaVoice }) {
  return (
    <button type="button" className="btn small" onClick={bea.toggleMute}
      style={{ background: "#000", color: "var(--gold)", borderColor: "var(--gold)" }}>
      {bea.muted ? "🔇 Voice off" : "🔊 Voice on"}
    </button>
  );
}

/** Top of the Support form: Bea on camera, her name, online/talking, and the voice switch. */
export function BeaCard({ bea }: { bea: BeaVoice }) {
  if (!bea.faceVisible) {
    // After her hello: just her name and the voice switch.
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#000", border: "2px solid var(--gold)", borderRadius: 14, padding: "10px 14px", marginBottom: 12 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: "var(--gold)" }}>Bea</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#fff", flex: 1 }}>Bingg Bongg Assistant</span>
        <VoiceButton bea={bea} />
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, background: "#000", border: "2px solid var(--gold)", borderRadius: 16, padding: 12, marginBottom: 12 }}>
      <BeaVideo talking={bea.talking} hello={bea.hello} onHelloEnd={bea.endHello} width={112} height={196} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <div style={{ fontSize: 30, fontWeight: 800, color: "var(--gold)", lineHeight: 1 }}>Bea</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>Bingg Bongg Assistant</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,.75)" }}>🟢 {bea.talking ? "Talking…" : "Online now"}</div>
        <div style={{ marginTop: 4 }}><VoiceButton bea={bea} /></div>
      </div>
    </div>
  );
}

/** "Repeat the Answer" (Steve, 2026-11-16). */
export function BeaRepeatButton({ bea }: { bea: BeaVoice }) {
  if (!bea.lastAnswer) return null;
  return (
    <button type="button" className="btn small" onClick={bea.repeatAnswer}
      style={{ marginTop: 10, background: "#000", color: "var(--gold)", borderColor: "var(--gold)" }}>
      ↻ Repeat the Answer
    </button>
  );
}

/** The answer: Bea big and centred above it. */
export function BeaPortrait({ bea }: { bea: BeaVoice }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <BeaVideo talking={bea.talking} width={180} height={315} />
      <div style={{ fontSize: 15, fontWeight: 800, color: "var(--gold)" }}>Bea · Bingg Bongg Assistant</div>
      <VoiceButton bea={bea} />
    </div>
  );
}
