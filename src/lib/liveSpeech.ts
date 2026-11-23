// Speech to text in the browser, for the live bar's Voice to Text (dictate into the chat box)
// and Captions (the speaker's words to liveCaptions, for everyone's CC) — the phones'
// LiveCaptionRecognizer. Chrome, Edge and Safari have it (webkitSpeechRecognition); Firefox does
// not, and the bar says so instead of doing nothing.

interface Rec {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecCtor = new () => Rec;

function ctor(): RecCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const speechSupported = () => typeof window !== "undefined" && !!ctor();

/** Listens until stopped (`continuous`: Captions) or until the first final sentence (Voice to
 *  Text). `onText(text, isFinal)` gets every partial and final result. Returns the stop. */
export function listen(opts: { continuous: boolean; lang?: string; onText: (text: string, isFinal: boolean) => void; onStop?: () => void }): (() => void) | null {
  const C = ctor();
  if (!C) return null;
  let stopped = false;
  let rec: Rec | null = null;
  const start = () => {
    if (stopped) return;
    const r = new C();
    rec = r;
    r.lang = opts.lang || navigator.language || "en-US";
    r.continuous = opts.continuous;
    r.interimResults = true;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0]?.transcript ?? "";
        if (text.trim()) opts.onText(text.trim(), res.isFinal);
        if (res.isFinal && !opts.continuous) { stop(); return; }
      }
    };
    r.onerror = (e) => {
      // Permission refused or no microphone: give up. Silence ("no-speech") just restarts.
      if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture") stop();
    };
    // The browser ends a session after a pause; Captions keep going until switched off.
    r.onend = () => { if (!stopped && opts.continuous) window.setTimeout(start, 250); else if (!stopped) stop(); };
    try { r.start(); } catch { stop(); }
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    try { rec?.abort(); } catch { /* ignore */ }
    opts.onStop?.();
  };
  start();
  return stop;
}
