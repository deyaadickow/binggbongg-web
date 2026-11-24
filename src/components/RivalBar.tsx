// Rival Battle score bar (Steve, 2026-11-23: "Find ever country's rival and let's set up a 10 minutes battle in
// between their own whole country battle"). Two countries, their flags and points, a bar that leans to whoever is
// ahead, and — once it is over — who won. Used on the battle screen and on the All Country Battles card.
import { useT } from "../lib/i18n";
import { cbText, type CbRival } from "../lib/countryBattle";
import { countryFlag } from "../lib/allCountryBattles";
import { PopNumber } from "./PopNumber";

export function RivalBar({ rival, finished, onJoin, bordered = true }: { rival: CbRival; finished: boolean; onJoin?: (country: string) => void; bordered?: boolean }) {
  const { t } = useT();
  const { a, b } = rival;
  const total = a.score + b.score;
  const share = total > 0 ? Math.round((a.score / total) * 100) : 50;
  const flagOf = (s: { country: string; flag: string }) => s.flag || countryFlag(s.country) || "🌍";
  const side = (s: typeof a, align: "left" | "right") => (
    <div className="rival-side" style={{ textAlign: align }}>
      <div className="rival-flag" aria-hidden>{flagOf(s)}</div>
      <div className="rival-name">{s.country}</div>
      <div className="rival-score"><PopNumber value={s.score} /></div>
    </div>
  );
  return (
    <div className="rival-bar card" style={bordered ? undefined : { borderColor: "transparent" }} role="group" aria-label={rival.label}>
      <div className="rival-title">⚔️ {t("rival_battle")}</div>
      <div className="rival-row">
        {side(a, "left")}
        <div className="rival-vs">VS</div>
        {side(b, "right")}
      </div>
      <div className="rival-meter" aria-hidden>
        <div className="rival-meter-a" style={{ width: `${share}%` }} />
      </div>
      {finished && (
        <div className="rival-result">🏆 {rival.winner ? cbText(t("rival_wins"), { country: rival.winner }) : t("rival_tie")}</div>
      )}
      {!finished && onJoin && (
        <div className="rival-join">
          {[a, b].map((s) => (
            <button key={s.country} type="button" className="btn gold small" onClick={(e) => { e.stopPropagation(); onJoin(s.country); }}>
              {flagOf(s)} {cbText(t("rival_join_for"), { country: s.country })}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
