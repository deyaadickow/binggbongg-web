// Bingo's icon: a little Bingo card — B I N G O, each letter in its own square coloured box, four
// rows of squares and a free star (Steve, 2026-10-27: "Bingo Icon should look like a Bingo card, Each letter
// in a box"). The same drawing as Android's ic_bingo_card.png and iOS's BingoCardIcon.
import type { ReactNode } from "react";

const COLORS = ["#2563EB", "#E0312F", "#8E4FD6", "#1E9E4A", "#F28C28"];

export function BingoCardIcon({ size = 26 }: { size?: number }) {
  const cells = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    const x = 6.5 + c * 17.6, y = 6.5 + r * 17.6, key = `${r}-${c}`;
    if (r === 0) cells.push(
      <g key={key}><rect x={x} y={y} width="16" height="16" rx="3" fill={COLORS[c]} />
        <text x={x + 8} y={y + 13} textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="14" fill="#fff">{"BINGO"[c]}</text></g>);
    else if (r === 2 && c === 2) cells.push(
      <g key={key}><rect x={x} y={y} width="16" height="16" rx="3" fill="#F0C420" />
        <text x={x + 8} y={y + 12.3} textAnchor="middle" fontSize="11" fill="#fff">★</text></g>);
    else cells.push(<rect key={key} x={x} y={y} width="16" height="16" rx="3" fill="#EEF0F5" stroke="#C9CED6" strokeWidth="1.1" />);
  }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}>
      <rect x="2" y="2" width="96" height="96" rx="13" fill="#fff" stroke="#F0C420" strokeWidth="4" />
      {cells}
    </svg>
  );
}

/** A title with the Bingo card in front, in place of the old 🎱 that's still in the translated strings. */
export function bingoTitle(text: string, size = 24): ReactNode {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><BingoCardIcon size={size} />{text.replace(/🎱\s*/u, "")}</span>;
}
