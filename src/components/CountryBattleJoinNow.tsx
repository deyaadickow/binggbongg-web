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
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useT } from "../lib/i18n";
import { countryFlag } from "../lib/allCountryBattles";
import { myBattleCountries, sameCountry } from "../lib/fromCountry";
import {
  cbText, countryBattlePath, joinNowParts, refreshCountryBattleJoinNow, useCountryBattleJoinNow, useTick,
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
  // "Battle Is Underway" while it runs (Steve, 2026-11-21).
  const battling = d.phase === "battle";
  if (battling) sub = t("cbp_battle_underway");
  else if (join && d.phase === "joining" && toStart > 0) sub = cbText(t("cb_join_now_open"), { time: waitText(t, toStart) });
  else if (join) sub = t("cb_join_now_live");
  else sub = Number.isNaN(toStart) || toStart <= 0 ? "" : cbText(t("cb_join_now_next"), { time: waitText(t, toStart) });

  const open = () => {
    if (join && d.day_id) navigate(countryBattlePath(d.day_id, { join: true }));
    else navigate(`/country-battle?country=${encodeURIComponent(d.country)}`);
  };

  const btn = (
    <button type="button" className={`cb-join-now ${variant}${join ? " live" : ""}`} onClick={open}>
      {/* A blinking dot on each side: neon green while the battle is on, red otherwise (Steve, 2026-11-21:
          "add two blinking neon green dots on each side of the banner. when the battle is over turn the green
          blinking dots into red blinking dots"). */}
      <span className={`cb-join-now-side l${battling ? " green" : ""}`} aria-hidden />
      <span className={`cb-join-now-side r${battling ? " green" : ""}`} aria-hidden />
      <span className="cb-join-now-title">
        {cbText(t("cb_join_now_title"), { country: countryWord(d, lang) })}
      </span>
      {sub && <span className="cb-join-now-sub">{sub}</span>}
    </button>
  );
  if (variant !== "banner") return btn;
  // The country dropdown under the banner (Steve, 2026-11-21): every country running a battle; the
  // member's own country by default. It opens our black and gold list with "Battles Start In" and each
  // country's own countdown, or "Under Way" while its battle runs.
  return (
    <div className="cb-join-now-wrap">
      {btn}
      <CountryBattlePicker d={d} now={now} />
    </div>
  );
}

/** 45:58 / 1:05:03. */
function clockText(ms: number): string {
  const p = joinNowParts(ms);
  const two = (n: number) => String(n).padStart(2, "0");
  return p.h > 0 ? `${p.h}:${two(p.m)}:${two(p.s)}` : `${p.m}:${two(p.s)}`;
}

function CountryBattlePicker({ d, now }: { d: CbJoinNow; now: number }) {
  const { t } = useT();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = d.countries.length ? d.countries : [{ country: d.country, country_adjective: d.country_adjective }];
  const shown = q.trim() ? list.filter((c) => c.country.toLowerCase().includes(q.trim().toLowerCase())) : list;
  // Both of my countries are marked (where I live and where I'm from, 2026-11-23); an older server: the banner's one.
  const mine = myBattleCountries(d.my_countries, d.country);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);
  return (
    <>
      <button type="button" className="cb-join-now-pickbtn" aria-label={t("choose_a_country")} onClick={() => setOpen(true)}>
        {countryFlag(d.country)} {d.country} <span aria-hidden>▾</span>
      </button>
      {open && createPortal(
        <div className="cbp-overlay" role="dialog" aria-modal="true" aria-label={t("cbp_title")} onClick={() => setOpen(false)}>
          <div className="cbp-panel" onClick={(e) => e.stopPropagation()}>
            <div className="cbp-head">
              <button type="button" className="cbp-close" aria-label={t("close")} onClick={() => setOpen(false)}>‹</button>
              <h2>{t("cbp_title")}</h2>
            </div>
            {list.length > 8 && (
              <input className="cbp-search" type="search" value={q} placeholder={t("search")} onChange={(e) => setQ(e.target.value)} autoFocus />
            )}
            <div className="cbp-list">
              {shown.map((c) => {
                const rank = list.indexOf(c) + 1;
                const live = !!c.live && (!c.ends_at || Date.parse(c.ends_at) > now);
                const at = Date.parse(c.starts_at ?? "");
                const left = Number.isNaN(at) ? NaN : at - now;
                return (
                  <button type="button" key={c.country} className={`cbp-row${mine.some((m) => sameCountry(m, c.country)) ? " on" : ""}`}
                    onClick={() => { setOpen(false); navigate(`/country-battle?country=${encodeURIComponent(c.country)}`); }}>
                    <span className="cbp-rank">#{rank}</span>
                    <span className="cbp-flag" aria-hidden>{countryFlag(c.country)}</span>
                    <span className="cbp-name">{c.country}</span>
                    <span className="cbp-dots" aria-hidden />
                    <span className={`cbp-time${live ? " live" : ""}`}>
                      {live ? t("cbp_under_way") : Number.isNaN(left) ? "" : clockText(Math.max(0, left))}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>, document.body)}
    </>
  );
}
