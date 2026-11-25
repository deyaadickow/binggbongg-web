// A battle score that shows itself going up.
// Steve, 2026-11-24: "When getting BBs the score should be animating out and in larger number then smaller numbers to
// show everyone the score keep going up" — then: "We need to make the BBs # Bigger. when some one gives a gift let make
// it more exiting and make the number turn and TikTikTikTik…" On every increase each digit spins on its own little
// reel from the old number to the new one (the right-hand digits spin longest and stop last), with a tick for every
// digit that rolls past, and the number pops big with a gold glow. Decreases and the first value just show.
import { useEffect, useRef, useState } from "react";

const ROLL_MS = 1300;      // the right-hand reel's whole spin
const EXTRA_SPINS = 2;     // full turns the right-hand reel adds, one fewer per place to the left

type Roll = { from: number; to: number; key: number };

export function PopNumber({ value, className }: { value: number; className?: string }) {
  const [roll, setRoll] = useState<Roll>({ from: value, to: value, key: 0 });
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (!(value > from)) { setRoll((r) => ({ from: value, to: value, key: r.key })); return; }
    setRoll((r) => ({ from, to: value, key: r.key + 1 }));
    ticks(from, value);
  }, [value]);

  const text = roll.to.toLocaleString();
  if (roll.key === 0 || roll.from === roll.to) {
    return <span className={`pop-num${className ? " " + className : ""}`}>{text}</span>;
  }
  // The old number's digits lined up under the new one's, right to left.
  const toDigits = String(roll.to);
  const fromDigits = String(roll.from).padStart(toDigits.length, "0");
  const firstChange = [...toDigits].findIndex((d, i) => d !== fromDigits[i]);
  let digitIndex = 0;
  const reels = [...text].map((ch, i) => {
    if (ch < "0" || ch > "9") return <span key={i}>{ch}</span>;
    const di = digitIndex++;
    const place = toDigits.length - 1 - di;           // 0 = ones
    const end = Number(ch);
    const start = Number(fromDigits[di]);
    if (di < firstChange || firstChange < 0) return <span key={i} className="roll-col still">{ch}</span>;
    const spins = Math.max(0, EXTRA_SPINS - place) + (end < start ? 1 : 0);
    const steps = spins * 10 + end - start;           // digits the reel rolls past
    const dur = ROLL_MS * (0.55 + 0.45 / (place + 1));
    const strip: number[] = [];
    for (let k = 0; k <= steps; k++) strip.push((start + k) % 10);
    return (
      <span key={i} className="roll-col">
        <span className="roll-strip" style={{ ["--steps" as string]: steps, animationDuration: `${dur}ms` }}>
          {strip.map((d, k) => <span key={k}>{d}</span>)}
        </span>
        <span className="roll-ghost" aria-hidden>{ch}</span>
      </span>
    );
  });
  return (
    <span key={roll.key} className={`pop-num popping rolling${className ? " " + className : ""}`} aria-label={text}>
      {reels}
    </span>
  );
}

// ---- The tick ----------------------------------------------------------------------------------------------------
// A short click from Web Audio (no file), one per digit the ones reel rolls past, slowing down as it lands. All the
// numbers on screen share one clock so a burst on many tiles at once is a fast patter, never a wall of noise.
let ctx: AudioContext | null = null;
let lastTick = 0;

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx.state === "running" ? ctx : null;
  } catch {
    return null;
  }
}

function click(ac: AudioContext, at: number) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(2100, at);
  osc.frequency.exponentialRampToValueAtTime(900, at + 0.018);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.18, at + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.03);
  osc.connect(gain).connect(ac.destination);
  osc.start(at);
  osc.stop(at + 0.035);
}

function ticks(from: number, to: number) {
  const ac = audio();
  if (!ac) return;
  const onesStart = from % 10;
  const steps = EXTRA_SPINS * 10 + ((to % 10) - onesStart + 10) % 10 || 10;
  const n = Math.min(steps, 30);
  const dur = ROLL_MS / 1000;
  const now = ac.currentTime;
  for (let k = 1; k <= n; k++) {
    // The reel eases out (cubic), so tick k lands where the eased position passes k/n.
    const t = now + dur * (1 - Math.cbrt(1 - k / n));
    if (t - lastTick < 0.035) continue;
    lastTick = t;
    click(ac, t);
  }
}
