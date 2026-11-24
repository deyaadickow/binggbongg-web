// All Country Battles (Steve, 2026-11-16): "Next to for you page add 'All Country Battles' when i
// click on it, it will link me to a page where all the country battles are there with search on top
// incase there is 100 battles. and anyone can click on any battle from any country to watch and
// support anyone."
//
// /country-battles — every country's battle, search on top, a card each. A card opens that day's
// battle screen to WATCH (anyone, any country, and gift from the tiles); "Join live" only where the
// server says can_battle. A finished day opens its top 100; no day yet opens that country's page.
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageTitle } from "../components/PageTitle";
import { Loading, Notice } from "../components/Common";
import { useT } from "../lib/i18n";
import { useSession } from "../lib/session";
import { countryBattlePath, useTick } from "../lib/countryBattle";
import { useAllCountryBattles, useRunningBattles, type AcbKind } from "../lib/allCountryBattles";
import { FromCountryAsk } from "../components/FromCountry";
import { CountryBattleCard } from "../components/CountryBattleCard";

export function AllCountryBattlesPage({ startKind }: { startKind?: AcbKind } = {}) {
  const { t } = useT();
  const { user } = useSession();
  const now = useTick();
  const [query, setQuery] = useState("");
  // Two chips, the same size side to side (Steve, 2026-11-23: "Remove the "All" only show "Country VS
  // Country" and "Whole Country Battle" buttons and make both button same size from side to side").
  // Opens on Whole Country Battle; ?kind=rival (the Information Center's Country VS Country button)
  // opens on Country VS Country.
  const [params] = useSearchParams();
  const [kind, setKind] = useState<AcbKind>(startKind === "rival" || params.get("kind") === "rival" ? "rival" : "country");
  const { battles, error, search } = useAllCountryBattles(query, kind, user?.id, t("acb_empty"));
  const chips: [AcbKind, string][] = [["rival", t("acb_filter_vs")], ["country", t("acb_tab")]];
  // The red Live button (Steve, 2026-11-24) sits on the top-right corner of the right chip while any battle is
  // under way; a tap opens the first one, and that screen's bar steps through the rest.
  const running = useRunningBattles();
  const navigate = useNavigate();

  return (
    <div className="page acb-page" style={{ maxWidth: 760 }}>
      <PageTitle>{t("acb_tab")}</PageTitle>
      {user && <FromCountryAsk />}
      <div style={{ position: "sticky", top: 0, zIndex: 2, background: "#000", padding: "4px 0 10px" }}>
        <input className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder={t("acb_search")} aria-label={t("acb_search")} />
        <div className={`acb-chips${running.length ? " has-live" : ""}`} role="tablist">
          {chips.map(([k, label], i) => (
            <div key={label} className="acb-chip-wrap">
              <button type="button" role="tab" aria-selected={kind === k} className={`acb-filter ${k === "rival" ? "red" : "blue"}${kind === k ? " on" : ""}`} onClick={() => setKind(k)}>{label}</button>
              {i === chips.length - 1 && running.length > 0 && (
                <button type="button" className="acb-live-btn" onClick={() => navigate(countryBattlePath(running[0].day_id!, { live: true }))}>Live</button>
              )}
            </div>
          ))}
        </div>
      </div>
      {battles === null && !error ? <Loading /> : null}
      {error && battles === null && <Notice error>{error}</Notice>}
      {battles !== null && battles.length === 0 && (
        <div className="notice" style={{ textAlign: "center" }}>{search ? t("acb_no_match") : t("acb_empty")}</div>
      )}
      {battles !== null && battles.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {battles.map((b, i) => (
            <CountryBattleCard key={b.day_id ?? `c-${b.country}-${i}`} b={b} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}
