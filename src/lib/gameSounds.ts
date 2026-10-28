// Game Show sounds (Steve, 2026-10-27: "make these games more exciting"). Synthesized with Web Audio
// — no audio files, no licences — the same idea as the phones' TapGameSoundPlayer. One mute switch,
// remembered in this browser, shared by Guessing Games and Trivia Night.
const MUTE_KEY = "bb_game_show_muted";
let ctx: AudioContext | null = null;

export function isMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; }
}
export function setMuted(m: boolean) {
  try { localStorage.setItem(MUTE_KEY, m ? "1" : "0"); } catch { /* private mode: stays as is */ }
}

function audio(): AudioContext | null {
  if (isMuted()) return null;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = ctx ?? new Ctx();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch { return null; }
}

/** One tone: a wave sliding f0 -> f1 over `ms`, starting `at` ms from now, with a quick fade. */
function tone(f0: number, f1: number, ms: number, at = 0, type: OscillatorType = "sine", gain = 0.18) {
  const a = audio(); if (!a) return;
  const t = a.currentTime + at / 1000;
  const o = a.createOscillator(); const g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + ms / 1000);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + ms / 1000 + 0.02);
}

function noise(ms: number, at = 0, gain = 0.12) {
  const a = audio(); if (!a) return;
  const len = Math.floor(a.sampleRate * ms / 1000);
  const buf = a.createBuffer(1, len, a.sampleRate); const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-6 * i / len);
  const s = a.createBufferSource(); const g = a.createGain(); g.gain.value = gain;
  s.buffer = buf; s.connect(g).connect(a.destination); s.start(a.currentTime + at / 1000);
}

export const sfx = {
  tick: () => tone(1500, 1400, 40, 0, "square", 0.05),
  lock: () => { tone(500, 900, 70, 0, "triangle", 0.15); tone(900, 900, 60, 70, "triangle", 0.12); },
  drumroll: () => { for (let i = 0; i < 14; i++) noise(45, i * 55, 0.09 + i * 0.006); },
  correct: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 160, i * 110, "triangle", 0.16)),
  wrong: () => { tone(330, 300, 260, 0, "sawtooth", 0.07); tone(300, 220, 420, 250, "sawtooth", 0.07); },
  reveal: () => { tone(392, 392, 140, 0, "triangle", 0.14); tone(523, 523, 220, 120, "triangle", 0.14); },
  fanfare: () => [[523, 0], [659, 140], [784, 280], [1047, 420], [784, 620], [1047, 760]].forEach(([f, at]) => tone(f, f, 220, at, "triangle", 0.15)),
  // Board games (Steve, 2026-10-27: "like a slap on the board"). A wooden clack is a click of noise,
  // a short knock and a low thump; the same recipe on the phones.
  clack: () => clack(0),
  capture: () => { clack(0, 1.15); clack(110, 1.3); },
  knock: () => { tone(220, 120, 90, 0, "sine", 0.3); noise(15, 0, 0.18); tone(220, 120, 90, 160, "sine", 0.3); noise(15, 160, 0.18); },
  drop: () => { tone(1200, 500, 180, 0, "sine", 0.08); tone(1500, 1200, 30, 190, "triangle", 0.18); noise(10, 190, 0.12); },
  rattle: () => [0, 40, 70, 115, 150, 200].forEach((at, i) => { noise(30, at, 0.1 + (i % 2) * 0.04); tone(2200 + i * 90, 2000, 12, at, "sine", 0.05); }),
  /** Getting a King: a long ringing bell. */
  ding: () => { tone(1046, 1046, 2200, 0, "sine", 0.22); tone(2092, 2092, 1600, 0, "sine", 0.09); tone(2887, 2887, 1000, 0, "sine", 0.05); tone(523, 523, 2400, 0, "sine", 0.08); },
  // Water Sort (Steve, 2026-10-27). A pour is a splash of band-passed noise under three rising
  // "bloops" — the glug of water finding its level; the phones' TapGameSoundPlayer WATER voice.
  pour: () => {
    swish(420, 120, 1400, 520);
    [0, 120, 250].forEach((at, i) => tone(180 + i * 70, 420 + i * 90, 90, at + 40, "sine", 0.16));
  },
  /** A bottle filled with one colour: a bright little sparkle run. */
  sparkle: () => [1568, 2093, 2637, 3136].forEach((f, i) => tone(f, f * 1.01, 260, i * 70, "sine", 0.09)),
  /** That pour isn't allowed: a short, soft buzz — softer than a wrong answer. */
  nope: () => { tone(150, 130, 120, 0, "square", 0.045); tone(140, 110, 140, 130, "square", 0.04); },
};

/** Noise through a band-pass filter whose centre slides f0 -> f1: water, wind, a whoosh. */
function swish(ms: number, at: number, f0: number, f1: number, gain = 0.2) {
  const a = audio(); if (!a) return;
  const t = a.currentTime + at / 1000;
  const len = Math.floor(a.sampleRate * ms / 1000);
  const buf = a.createBuffer(1, len, a.sampleRate); const d = buf.getChannelData(0);
  // A soft attack and a long tail, with a slow wobble so it gurgles rather than hisses.
  for (let i = 0; i < len; i++) {
    const x = i / len;
    d[i] = (Math.random() * 2 - 1) * Math.min(1, x * 12) * (1 - x) * (0.65 + 0.35 * Math.sin(x * 38));
  }
  const s = a.createBufferSource(); s.buffer = buf;
  const f = a.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 6;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + ms / 1000);
  const g = a.createGain(); g.gain.value = gain;
  s.connect(f).connect(g).connect(a.destination); s.start(t);
}

function clack(at: number, loud = 1) {
  noise(12, at, 0.22 * loud);
  tone(1100, 850, 35, at, "sine", 0.14 * loud);
  tone(160, 90, 70, at, "sine", 0.22 * loud);
}

/** A short buzz on phones that support it (web). */
export function haptic(pattern: number | number[] = 30) {
  // Only after the member has touched the page: before that Chrome refuses the call and logs it
  // as a console error (seen in the web preview, 2026-10-27).
  try {
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (ua && !ua.hasBeenActive) return;
    navigator.vibrate?.(pattern);
  } catch { /* not supported */ }
}
