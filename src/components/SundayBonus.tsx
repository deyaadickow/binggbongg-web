// Sunday Battle Bonus banner (Battles and Games page) and pill (every battle screen).
// See lib/sundayBonus.ts. Both render nothing unless the server says the promotion is on.
import { useSession } from "../lib/session";
import { useT } from "../lib/i18n";
import { formatSunday, money, useSundayBonus } from "../lib/sundayBonus";

const pct = (n: number) => String(Number.isInteger(n) ? n : Number(n.toFixed(1)));

/** The black card with the gold border at the top of /battles. */
export function SundayBonusCard() {
  const { t, lang } = useT();
  const { user } = useSession();
  const b = useSundayBonus(user?.id, 60000);
  if (!b) return null;
  if (b.today) {
    return (
      <div className="card pad sb-card">
        <b className="sb-card-title">{t("sb_title_on")}</b>
        <span className="sb-card-big">{t("sb_extra_today", money(b.bonus_today))}</span>
        <span className="sb-card-line">{t("sb_coins_line", b.coins_today.toLocaleString(lang === "tl" ? "fil" : lang), pct(b.percent))}</span>
        <span className="sb-card-small">{t("sb_ends")}</span>
      </div>
    );
  }
  return (
    <div className="card pad sb-card">
      <b className="sb-card-title">{t("sb_title")}</b>
      <span className="sb-card-line">{t("sb_rules", pct(b.percent), money(b.per_1000))}</span>
      {b.next_sunday && <span className="sb-card-big">{t("sb_next", formatSunday(b.next_sunday, lang))}</span>}
      <span className="sb-card-small">{t("sb_jump")}</span>
    </div>
  );
}

/** "Sunday Bonus +5% · $4.20" — only on a bonus Sunday, refreshed every 30 s (and when `bump` changes). */
export function SundayBonusPill({ bump }: { bump?: unknown }) {
  const { t } = useT();
  const { user } = useSession();
  const b = useSundayBonus(user?.id, 30000, bump);
  if (!b || !b.today) return null;
  return (
    <div className="sb-pill-row">
      <span className="sb-pill">🔥 {t("sb_pill", pct(b.percent), money(b.bonus_today))}</span>
    </div>
  );
}
