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

function readMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; }
}

export interface BeaVoice {
  talking: boolean;
  /** Her HeyGen hello video (with sound) while it plays, else null. */
  hello: string | null;
  endHello: () => void;
  muted: boolean;
  play: (key: string) => void;
  stop: () => void;
  toggleMute: () => void;
  greetOnce: (language: string) => void;
}

export function useBea(): BeaVoice {
  const [talking, setTalking] = useState(false);
  const [hello, setHello] = useState<string | null>(null);
  const [muted, setMuted] = useState(readMuted);
  const audio = useRef<HTMLAudioElement | null>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const endHello = useCallback(() => setHello(null), []);
  const stop = useCallback(() => {
    setHello(null);
    const a = audio.current;
    if (a) { a.pause(); a.src = ""; }
    audio.current = null;
    setTalking(false);
  }, []);

  const play = useCallback((key: string) => {
    stop();
    if (mutedRef.current || !key) return;
    const a = new Audio(key.startsWith("http") ? key : UPLOAD_BASE + key);
    a.onplaying = () => setTalking(true);
    a.onpause = () => setTalking(false);
    a.onended = () => setTalking(false);
    a.onerror = () => setTalking(false);
    audio.current = a;
    a.play().catch(() => setTalking(false));
  }, [stop]);

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
        else if (r.data?.audio) play(r.data.audio);
      })
      .catch(() => undefined);
  }, [play]);

  useEffect(() => stop, [stop]);
  return { talking, hello, endHello, muted, play, stop, toggleMute, greetOnce };
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
