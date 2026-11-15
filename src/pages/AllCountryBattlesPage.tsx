// All Country Battles (Steve, 2026-11-16): "Next to for you page add 'All Country Battles' when i
// click on it, it will link me to a page where all the country battles are there with search on top
// incase there is 100 battles. and anyone can click on any battle from any country to watch and
// support anyone."
//
// /country-battles — every country's battle, search on top, a card each. A card opens that day's
// battle screen to WATCH (anyone, any country, and gift from the tiles); "Join live" only where the
// server says can_battle. A finished day opens its top 100; no day yet opens that country's page.
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PageTitle } from "../components/PageTitle";
import { Avatar, Loading, Notice } from "../components/Common";
import { useT } from "../lib/i18n";
import { useSession } from "../lib/session";
import { cbText, clock, countryBattlePath, localTime, useTick } from "../lib/countryBattle";
import { countryFlag, fetchAllCountryBattles, type AcbBattle } from "../lib/allCountryBattles";

type T = ReturnType<typeof useT>["t"];

/** Where a card goes: the live screen to watch, a finished day's top 100, or the country's page. */
function cardPath(b: AcbBattle): string {
  if (!b.day_id) return `/country-battle?country=${encodeURIComponent(b.country)}`;
  if (b.phase === "ended") return `/country-battle/board/${b.day_id}`;
  return countryBattlePath(b.day_id);
}

/** The status line under the country, and the countdown to the next turn. */
function statusLines(t: T, b: AcbBattle, now: number): { status: React.ReactNode; count: string } {
  const target = b.phase_ends_at ? Date.parse(b.phase_ends_at) : NaN;
  const left = Number.isNaN(target) || target <= now ? "" : clock(target - now);
  switch (b.phase) {
    case "battle":
      return { status: <span className="pill live">● {t("acb_live_now")}</span>, count: left ? cbText(t("cb_time_left"), { time: left }) : "" };
    case "joining":
      return { status: <b style={{ color: "var(--gold-bright, #FFD84D)" }}>{t("acb_opening")}</b>, count: left ? cbText(t("cb_starts_in"), { time: left }) : "" };
    case "upcoming":
    case "scheduled": {
      const at = localTime(b.starts_at ?? b.next_starts_at);
      return {
        status: at ? <span>🕗 {cbText(t("acb_starts_at"), { time: at })}</span> : null,
        count: left ? cbText(b.phase === "upcoming" && b.opens_at ? t("cb2_opens_in") : t("cb_starts_in"), { time: left }) : "",
      };
    }
    default:
      return { status: <span className="muted">{t("acb_ended")}</span>, count: "" };
  }
}

function BattleCard({ b, now }: { b: AcbBattle; now: number }) {
  const { t } = useT();
  const { isLoggedIn } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const { status, count } = statusLines(t, b, now);
  const live = b.phase === "battle" || b.phase === "joining";
  const lead = b.phase === "ended" ? null : b.leader;
  const showJoin = b.can_battle && !!b.day_id && live;
  const join = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isLoggedIn) { navigate("/login", { state: { from: location.pathname } }); return; }
    navigate(countryBattlePath(b.day_id!, { join: true }));
  };
  const open = () => navigate(cardPath(b));
  return (
    <div className="card pad acb-card" role="link" tabIndex={0} onClick={open}
      onKeyDown={(e) => { if (e.key === "Enter") open(); }}
      style={{ cursor: "pointer", display: "flex", flexDirection: "column", gap: 8, borderColor: b.phase === "battle" ? "var(--red)" : b.is_my_country ? "var(--gold)" : undefined }}>
      <div className="row" style={{ gap: 10, alignItems: "center" }}>
        <span style={{ fontSize: 30, lineHeight: 1 }} aria-hidden>{countryFlag(b.country) || "🌍"}</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <b style={{ color: "var(--gold)", fontSize: 17 }}>{b.country}</b>
            {b.is_test && <span className="pill" style={{ borderColor: "#ff8a65", color: "#ffcc80" }}>{t("acb_test")}</span>}
          </div>
          <div style={{ fontSize: 13, color: "#fff" }}>{status}</div>
        </div>
        {b.room_open && b.phase !== "ended" && b.live_count > 0 && (
          <span className="pill" style={{ whiteSpace: "nowrap", flex: "0 0 auto" }}>{cbText(t("cb_live_count"), { n: b.live_count.toLocaleString() })}</span>
        )}
      </div>
      {count && <div style={{ color: "var(--gold)", fontWeight: 800, fontSize: 20, fontVariantNumeric: "tabular-nums" }}>{count}</div>}
      {lead && (
        <div className="row" style={{ gap: 8, fontSize: 14 }}>
          <Avatar user={{ id: lead.user_id, fullname: lead.name, username: lead.username, profile_image: lead.profile_image }} />
          <span style={{ color: "#fff" }}>{cbText(t("acb_leading"), { name: lead.name, n: lead.score.toLocaleString() })}</span>
        </div>
      )}
      {b.phase === "ended" && b.winner && (
        <div className="row" style={{ gap: 8, fontSize: 14 }}>
          <span aria-hidden>🏆</span>
          <span style={{ color: "#fff" }}>{cbText(t("acb_winner"), { name: b.winner.name })}</span>
        </div>
      )}
      {b.phase !== "ended" && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {showJoin && <button className="btn gold" style={{ flex: "1 1 140px" }} onClick={join}>🔴 {t("cb_join")}</button>}
          <button className="btn" style={{ flex: "1 1 140px" }} onClick={(e) => { e.stopPropagation(); open(); }}>👀 {t("acb_watch")}</button>
        </div>
      )}
    </div>
  );
}

export function AllCountryBattlesPage() {
  const { t } = useT();
  const { user } = useSession();
  const now = useTick();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [battles, setBattles] = useState<AcbBattle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  // ~300 ms after the last keystroke.
  useEffect(() => {
    const h = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(h);
  }, [query]);

  const load = useCallback(() => {
    const mine = ++seq.current;
    fetchAllCountryBattles(search)
      .then((d) => { if (mine === seq.current) { setBattles(d.battles); setError(null); } })
      .catch((e) => { if (mine === seq.current) setError((e as Error).message || t("acb_empty")); });
  }, [search, t]);

  // Every 20 s while the tab is in view; at once when it comes back.
  useEffect(() => {
    load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") load(); }, 20000);
    const vis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", vis); };
  }, [load, user?.id]);

  return (
    <div className="page acb-page" style={{ maxWidth: 760 }}>
      <PageTitle>{t("acb_tab")}</PageTitle>
      <div style={{ position: "sticky", top: 0, zIndex: 2, background: "#000", padding: "4px 0 10px" }}>
        <input className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder={t("acb_search")} aria-label={t("acb_search")} />
      </div>
      {battles === null && !error ? <Loading /> : null}
      {error && battles === null && <Notice error>{error}</Notice>}
      {battles !== null && battles.length === 0 && (
        <div className="notice" style={{ textAlign: "center" }}>{search ? t("acb_no_match") : t("acb_empty")}</div>
      )}
      {battles !== null && battles.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {battles.map((b, i) => <BattleCard key={b.day_id ?? `c-${b.country}-${i}`} b={b} now={now} />)}
        </div>
      )}
    </div>
  );
}
