// "Join the Philippine whole country battle Now" (Steve, 2026-11-20): "We have to make it easier to
// join the battle ... First add another button here under the live button ... Another way, same
// banner above the information center and the search section. show it only for the philippine
// country. when they click it, they will go right in the battle."
//
// One black and gold button, two places: under Go Live (the sidebar and the Go Live page — the web
// has no Bingg Bongg button menu) and on top of the Home feed. The server decides everything
// (fetchCountryBattleJoinNow): show=false renders nothing. While a join would work, one tap opens
// the live battle with ?join=1 — the same path as the Country Battle page's "Join live": camera and
// mic, joinCountryBattleDay, the grid; a refusal shows the server's own message there. Otherwise
// the tap opens that country's Country Battle page and its countdown.
//
// Countdown (Steve, 2026-11-20: "Show the countdown between battles 'Next battle in 23 min 55
// seconds', Open all rooms 5 minutes before the battle"): between battles it ticks to starts_at;
// once the room is open (phase joining) it says "Room is open — battle starts in …".
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useT } from "../lib/i18n";
import { GoldSelect } from "./GoldSelect";
import { countryFlag } from "../lib/allCountryBattles";
import {
  cbText, countryBattlePath, setCountryBattlePick, joinNowParts, refreshCountryBattleJoinNow, useCountryBattleJoinNow, useTick,
  type CbJoinNow,
} from "../lib/countryBattle";

type T = ReturnType<typeof useT>["t"];

/** The country as it reads in a sentence of this language: English says "the Philippine whole
 *  country battle", every other language names the country ("ng Pilipinas", "de Filipinas"). */
function countryWord(d: CbJoinNow, lang: string): string {
  if (lang === "en" || lang.startsWith("en-")) return d.country_adjective || d.country;
  if (d.country === "Philippines") {
    try {
      const name = new Intl.DisplayNames([lang === "tl" ? "fil" : lang], { type: "region" }).of("PH");
      if (name && name !== "PH") return name;
    } catch { /* an engine without DisplayNames: the server's name */ }
    if (lang === "fil" || lang === "tl") return "Pilipinas";
  }
  return d.country;
}

/** "23 min 55 seconds", "1 h 5 min 3 seconds". */
function waitText(t: T, ms: number): string {
  const p = joinNowParts(ms);
  return p.h > 0 ? cbText(t("cb_join_now_hms"), p) : cbText(t("cb_join_now_ms"), p);
}

export function CountryBattleJoinNow({ variant }: { variant: "button" | "banner" }) {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const d = useCountryBattleJoinNow();
  const now = useTick();

  // Ask again the moment a boundary passes (the room opens, the battle starts or ends), so
  // `joinable` flips without waiting for the 30-second poll. Once per boundary.
  const asked = useRef(new Set<string>());
  const boundaries = d?.show ? [d.opens_at, d.starts_at, d.ends_at].filter((x): x is string => !!x) : [];
  const passed = boundaries.find((b) => {
    const at = Date.parse(b);
    return !Number.isNaN(at) && now >= at + 500 && now - at < 60_000 && !asked.current.has(b);
  });
  useEffect(() => {
    if (!passed) return;
    asked.current.add(passed);
    refreshCountryBattleJoinNow();
  }, [passed]);

  if (!d?.show) return null;

  const join = d.joinable && d.day_id;
  const startsAt = Date.parse(d.starts_at ?? d.opens_at ?? "");
  const toStart = Number.isNaN(startsAt) ? NaN : startsAt - now;
  let sub: string;
  if (join && d.phase === "joining" && toStart > 0) sub = cbText(t("cb_join_now_open"), { time: waitText(t, toStart) });
  else if (join) sub = t("cb_join_now_live");
  else sub = Number.isNaN(toStart) || toStart <= 0 ? "" : cbText(t("cb_join_now_next"), { time: waitText(t, toStart) });

  const open = () => {
    if (join && d.day_id) navigate(countryBattlePath(d.day_id, { join: true }));
    else navigate(`/country-battle?country=${encodeURIComponent(d.country)}`);
  };

  const btn = (
    <button type="button" className={`cb-join-now ${variant}${join ? " live" : ""}`} onClick={open}>
      <span className="cb-join-now-title">
        {/* Always blinking, so members notice it (Steve, 2026-11-21: "Please make the red dot blink"). */}
        <span className="cb-join-now-dot" aria-hidden />
        {cbText(t("cb_join_now_title"), { country: countryWord(d, lang) })}
      </span>
      {sub && <span className="cb-join-now-sub">{sub}</span>}
    </button>
  );
  if (variant !== "banner") return btn;
  // The country dropdown under the banner (Steve, 2026-11-21): every country running a battle; the
  // member's own country by default, else the server's (the hourly Philippine one).
  const list = d.countries.length ? d.countries : [{ country: d.country, country_adjective: d.country_adjective }];
  return (
    <div className="cb-join-now-wrap">
      {btn}
      <div className="cb-join-now-pick">
        <GoldSelect value={d.country} ariaLabel={t("choose_a_country")} searchable={list.length > 8}
          options={list.map((c) => ({ value: c.country, label: `${countryFlag(c.country)} ${c.country}` }))}
          onChange={(c) => setCountryBattlePick(c)} />
      </div>
    </div>
  );
}
