// A country's Country Battle page for search (Steve, 2026-11-23, free marketing: "All the free ideas"
// → "Go"): /country-battle/philippines — "Philippines Country Battle — every hour, 10 minutes".
// The build writes the same words as plain HTML for search engines (seo.config.ts); this is what a
// person sees once the app starts: the country's battle card (live / next, Watch + Join), when it
// runs on that country's clock and in the viewer's, how to join, and the download buttons.
// English only (plus a Tagalog / Indonesian paragraph for PH / ID), like the crawled copy.
import { Link, useParams } from "react-router-dom";
import { PageTitle } from "../components/PageTitle";
import { Loading, StoreBadges } from "../components/Common";
import { CountryBattleCard } from "../components/CountryBattleCard";
import { useTick } from "../lib/countryBattle";
import { useSession } from "../lib/session";
import { useAllCountryBattles } from "../lib/allCountryBattles";
import {
  COUNTRY_PAGES, countryPageBySlug, inSentence, countryPagePath, countryPageText, flagEmoji, relatedCountries, zoneNames,
} from "../lib/countryPages";
import { HomePage } from "./HomePage";

const gold = "var(--gold-bright, #FFD84D)";

/** The next :00 in the country's clock, as the viewer's own time ("9:00 PM"). */
function nextHourText(tz: string, now: number): { there: string; here: string } {
  // Every battle country's offset is whole or half/quarter hours; the battle is at the country's :00.
  const there = (ms: number) => new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(ms);
  const minute = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, minute: "numeric" }).format(now));
  const next = now + ((60 - minute) % 60 || 60) * 60000 - (now % 60000);
  return { there: there(next), here: new Date(next).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) };
}

export function CountryLandingPage() {
  const { slug = "" } = useParams();
  const c = countryPageBySlug(slug);
  const { user } = useSession();
  const now = useTick(15000);
  const { battles } = useAllCountryBattles(c?.name ?? "", "country", user?.id, "");
  if (!c) return <HomePage />;
  const t = countryPageText(c, zoneNames(c.tz));
  const mine = (battles ?? []).filter((b) => b.kind === "country" && b.country.toLowerCase() === c.name.toLowerCase());
  const next = nextHourText(c.tz, now);
  const h2: React.CSSProperties = { color: gold, fontSize: 18, margin: "22px 0 8px" };

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <PageTitle backTo="/country-battles">{flagEmoji(c.code)} {c.display}</PageTitle>
      <h1 style={{ color: gold, fontSize: 24, lineHeight: 1.25, margin: "4px 0 10px" }}>{t.h1}</h1>
      <p style={{ margin: "0 0 14px" }}>{t.intro}</p>

      {battles === null ? <Loading /> : mine.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {mine.map((b, i) => <CountryBattleCard key={b.day_id ?? i} b={b} now={now} />)}
        </div>
      ) : (
        <div className="notice" style={{ textAlign: "center" }}>
          Next {c.display} Country Battle: <b style={{ color: gold }}>{next.there}</b> in {inSentence(c)} ({next.here} your time).{" "}
          <Link to="/country-battles">See every Country Battle</Link>
        </div>
      )}

      <div style={{ margin: "16px 0" }}><StoreBadges /></div>

      <h2 style={h2}>When the {c.display} Country Battle runs</h2>
      <ul style={{ paddingLeft: 20, margin: 0 }}>
        {t.when.map((x) => <li key={x}>{x}</li>)}
        <li>Next one: <b style={{ color: gold }}>{next.there}</b> in {inSentence(c)} — {next.here} where you are.</li>
      </ul>

      <h2 style={h2}>How to join</h2>
      <ol style={{ paddingLeft: 20, margin: 0 }}>{t.how.map((x) => <li key={x}>{x}</li>)}</ol>

      <h2 style={h2}>Who can battle</h2>
      <p style={{ margin: 0 }}>{t.who} <Link to="/country-vs-country">See Country VS Country</Link>.</p>

      {t.local && (
        <>
          <h2 style={h2} lang={t.local.lang}>{t.local.title}</h2>
          <p style={{ margin: 0 }} lang={t.local.lang}>{t.local.text}</p>
        </>
      )}

      <h2 style={h2}>More Country Battles</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {relatedCountries(c).map((r) => (
          <Link key={r.slug} to={countryPagePath(r)} className="acb-filter" style={{ textDecoration: "none", flex: "0 0 auto" }}>
            {flagEmoji(r.code)} {r.display}
          </Link>
        ))}
        <Link to="/country-battles" className="acb-filter on" style={{ textDecoration: "none", flex: "0 0 auto" }}>All {COUNTRY_PAGES.length} countries</Link>
      </div>
    </div>
  );
}
