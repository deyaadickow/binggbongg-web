import type { MouseEvent } from "react";

/**
 * Steve, 2026-10-05: "(BBBB) Bingg Bongg Battle Badge — The more you battle the bigger the badge
 * #... please create just a round gold circle with the number that I add in gold. Very simple but
 * it's still a badge they will be willing to work for."
 *
 * Steve, 2026-10-05: "Everyone should have a badge, the ones that don't have a streak will be
 * (0)" — so a member who has never battled wears a (0) rather than nothing, and tapping it tells
 * them how to start.
 */
export function BattleBadge({
  badge,
  size = 26,
  onClick,
}: { badge?: number | null; size?: number; onClick?: (e: MouseEvent) => void }) {
  const count = badge ?? 0;

  // Three and four digits step the type down rather than growing the circle.
  const fontSize = count >= 1000 ? size * 0.32 : count >= 100 ? size * 0.38 : size * 0.46;

  return (
    <span
      onClick={onClick}
      title={onClick ? "What is this?" : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: size,
        height: size,
        padding: "0 4px",
        borderRadius: size,
        border: "2px solid var(--gold)",
        background: "rgba(0,0,0,.8)",
        color: "var(--gold)",
        fontWeight: 700,
        fontSize,
        lineHeight: 1,
        cursor: onClick ? "pointer" : undefined,
        flex: "0 0 auto",
      }}
    >
      {count}
    </span>
  );
}

/** What the gold circle means, for anyone seeing it for the first time. */
export function battleBadgeExplainer(name: string, badge: number): string {
  const who = name.trim() === "" ? "This member" : name;
  // "has battled 0 times" is not English, so a member with no battles gets their own line.
  const played =
    badge === 0 ? `${who} hasn't battled yet.`
      : badge === 1 ? `${who} has battled once.`
        : `${who} has battled ${badge} times.`;
  return (
    `${played}\n\n` +
    "The circle counts every battle, one by one, and goes up the moment a battle finishes." +
    (badge === 0 ? "\n\nBattle someone to start it." : "")
  );
}

/**
 * Steve, 2026-10-05: "How about if we add one flame every 30 days with their score. 60 days will
 * give them 2 flames 90 days will give them 3 flames. the flame mean the one free day."
 *
 * The pill carries the run of days; a flame is a free day off, one banked for every 30 days kept.
 * Lit (flames in hand) it is gold with dark text; unlit it matches the black badge beside it.
 */
export function BattleStreak({
  streak,
  flames,
  size = 26,
  onClick,
}: { streak?: number | null; flames?: number | null; size?: number; onClick?: (e: MouseEvent) => void }) {
  // Steve, 2026-10-05: a member with no streak shows (0), not nothing, so the pill is always
  // there to be tapped and explained.
  const days = streak ?? 0;

  const lit = (flames ?? 0) > 0;
  // 🔥 up to three — the cases Steve named — then ×N, so a long-running streak can never push
  // the member's name off the card.
  const label =
    !lit ? `${days}`
      : (flames ?? 0) <= 3 ? `${"🔥".repeat(flames ?? 0)} ${days}`
      : `🔥×${flames} ${days}`;

  return (
    <span
      onClick={onClick}
      title={onClick ? "What is this?" : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        height: size,
        // Wide enough that it always reads as a PILL. Once the zero state existed, a streak with
        // no flames yet drew a near-circle holding the same number as the badge circle beside it,
        // and the two were impossible to tell apart.
        minWidth: size * 2,
        padding: "0 8px",
        borderRadius: size,
        border: "2px solid var(--gold)",
        background: lit ? "var(--gold)" : "rgba(0,0,0,.8)",
        color: lit ? "#412402" : "var(--gold)",
        fontWeight: 700,
        fontSize: size * 0.44,
        lineHeight: 1,
        whiteSpace: "nowrap",
        cursor: onClick ? "pointer" : undefined,
        flex: "0 0 auto",
      }}
    >
      {label}
    </span>
  );
}

/** What the flames buy you, in the words Steve used. */
export function battleStreakExplainer(name: string, streak: number, flames: number): string {
  const who = name.trim() === "" ? "This member" : name;
  const banked =
    flames <= 0
      ? "No free days saved up yet — keep the streak to 30 days and you earn your first flame."
      : flames === 1
        ? "1 flame saved: one day off, and the streak keeps going."
        : `${flames} flames saved: ${flames} days off, and the streak keeps going.`;
  const run =
    streak === 0 ? `${who} has no streak going. Battle someone today to start it.`
      : streak === 1 ? `${who} has battled 1 day in a row.`
        : `${who} has battled ${streak} days in a row.`;
  return (
    `${run}\n\n` +
    "Battle at least once a day to keep it. Every 30 days in a row earns one flame 🔥 — 30 days is 1 flame, 60 days is 2, 90 days is 3.\n\n" +
    "A flame is one free day. Miss a day and a flame is spent instead of losing the streak.\n\n" +
    banked
  );
}

/**
 * Steve, 2026-10-05: "Make all popup into our design black and gold." The browser's own alert box
 * is white with a blue button; this is the app's popup, used for both circles' explainers.
 */
export function BattleInfoPopup({
  title,
  body,
  onClose,
}: { title: string; body: string; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9000,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 420,
          width: "100%",
          background: "#000",
          border: "2px solid var(--gold)",
          borderRadius: 18,
          padding: 22,
          color: "var(--gold)",
          textAlign: "center",
        }}
      >
        {/* Steve, 2026-10-06: "make the text even to both lines so it will look cleaner" — no
            more paragraphs ending in a lonely two words. Each paragraph is balanced on its own;
            balancing one block would even out the total and leave a paragraph just as lopsided. */}
        <div style={{ fontWeight: 800, fontSize: 19, marginBottom: 12, textWrap: "balance" }}>{title}</div>
        <div style={{ fontSize: 14, lineHeight: 1.5 }}>
          {body.split("\n\n").map((paragraph, i) => (
            <p key={i} style={{ margin: i === 0 ? "0 0 10px" : "10px 0 0", textWrap: "balance" }}>{paragraph}</p>
          ))}
        </div>
        <button
          onClick={onClose}
          style={{
            marginTop: 18,
            width: "100%",
            padding: "12px 0",
            background: "transparent",
            border: "1.5px solid var(--gold)",
            borderRadius: 999,
            color: "var(--gold)",
            fontWeight: 700,
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          OK
        </button>
      </div>
    </div>
  );
}
