// A battle score that shows itself going up (Steve, 2026-11-24: "When getting BBs the score should be animating out and
// in larger number then smaller numbers to show everyone the score keep going up"): on every increase the number
// counts up from the old value and pops big with a gold glow, then settles. Decreases and the first value just show.
import { useEffect, useRef, useState } from "react";

export function PopNumber({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const [pop, setPop] = useState(0);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (!(value > from)) { setShown(value); return; }
    setPop((p) => p + 1);
    const start = performance.now();
    const dur = 700;
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(from + (value - from) * eased));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span key={pop} className={`pop-num${pop ? " popping" : ""}${className ? " " + className : ""}`}>{shown.toLocaleString()}</span>;
}
