/**
 * Steve, 2026-10-05: "(BBBB) Bingg Bongg Battle Badge — The more you battle the bigger the badge
 * #... please create just a round gold circle with the number that I add in gold. Very simple but
 * it's still a badge they will be willing to work for."
 *
 * Nothing is drawn for a member who hasn't battled yet — nobody wears an empty badge.
 */
export function BattleBadge({ badge, size = 26, onClick }: { badge?: number | null; size?: number; onClick?: () => void }) {
  if (!badge || badge < 1) return null;

  // Three and four digits step the type down rather than growing the circle.
  const fontSize = badge >= 1000 ? size * 0.32 : badge >= 100 ? size * 0.38 : size * 0.46;

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
      {badge}
    </span>
  );
}

/** What the gold circle means, for anyone seeing it for the first time. */
export function battleBadgeExplainer(name: string, badge: number): string {
  const who = name.trim() === "" ? "This member" : name;
  return (
    `${who} has Badge #${badge}.\n\n` +
    "The more you battle, the bigger your badge number. Every 25 battles earns the next one: " +
    "1 to 25 battles is Badge #25, 26 to 50 is Badge #50, 51 to 75 is Badge #75, and so on.\n\n" +
    "Battle someone to earn yours."
  );
}
