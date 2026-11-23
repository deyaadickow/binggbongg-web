// One card of All Country Battles — a single country's battle or a Country VS Country (Rival) battle —
// with Watch + Join. Shared by All Country Battles, the CvC page's live list and the "Your rival
// battle" box on a country's page (Steve, 2026-11-23: "I don't see the Country VS Country battles
// anywhere, Where did you add them?").
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Avatar, Loading, Notice } from "./Common";
import { useT } from "../lib/i18n";
import { useSession } from "../lib/session";
import { cbText, clock, countryBattlePath, localTime } from "../lib/countryBattle";
import { countryFlag, useAllCountryBattles, type AcbBattle } from "../lib/allCountryBattles";
import { RivalBar } from "./RivalBar";

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

export function CountryBattleCard({ b, now }: { b: AcbBattle; now: number }) {
  const { t } = useT();
  const { isLoggedIn } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const { status, count } = statusLines(t, b, now);
  const live = b.phase === "battle" || b.phase === "joining";
  const lead = b.phase === "ended" ? null : b.leader;
  const showJoin = b.can_battle && !!b.day_id && live;
  // Steve, 2026-11-23: "We need to add 2 Buttons for all! countries and country VS country "Watch" "Join"".
  // Join on every card: open now → join (a rival card lets the server pick the side); not open yet → the battle
  // screen, where its own Join appears when the room opens; no day yet → the country's page.
  const join = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isLoggedIn) { navigate("/login", { state: { from: location.pathname } }); return; }
    if (showJoin) navigate(countryBattlePath(b.day_id!, { join: true }));
    else navigate(cardPath(b));
  };
  const open = () => navigate(cardPath(b));
  // A Rival Battle (Steve, 2026-11-23): both flags, the two-country score bar, Join for either side.
  const rivalJoin = (country: string) => {
    if (!isLoggedIn) { navigate("/login", { state: { from: location.pathname } }); return; }
    navigate(countryBattlePath(b.day_id!, { join: true, side: country }));
  };
  const rival = b.kind === "rival" ? b.rival : null;
  return (
    <div className="card pad acb-card" role="link" tabIndex={0} onClick={open}
      onKeyDown={(e) => { if (e.key === "Enter") open(); }}
      style={{ cursor: "pointer", display: "flex", flexDirection: "column", gap: 8, borderColor: b.phase === "battle" ? "var(--red)" : b.is_my_country ? "var(--gold)" : undefined }}>
      {rival ? (
        // Country VS Country: everything centred side to side (Steve, 2026-11-23: "center all the text from side to side").
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, textAlign: "center" }}>
          <div className="row" style={{ gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
            <b style={{ color: "var(--gold)", fontSize: 18 }}>⚔️ {b.country}</b>
            {b.is_test && <span className="pill" style={{ borderColor: "#ff8a65", color: "#ffcc80" }}>{t("acb_test")}</span>}
          </div>
          <div style={{ fontSize: 13, color: "#fff" }}>{status}</div>
          {b.room_open && b.phase !== "ended" && b.live_count > 0 && (
            <span className="pill" style={{ whiteSpace: "nowrap" }}>{cbText(t("cb_live_count"), { n: b.live_count.toLocaleString() })}</span>
          )}
        </div>
      ) : (
      <div className="row" style={{ gap: 10, alignItems: "center" }}>
        <span style={{ fontSize: 30, lineHeight: 1 }} aria-hidden>{rival ? "⚔️" : countryFlag(b.country) || "🌍"}</span>
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
      )}
      {count && <div style={{ color: "var(--gold)", fontWeight: 800, fontSize: 20, fontVariantNumeric: "tabular-nums", textAlign: rival ? "center" : undefined }}>{count}</div>}
      {/* No gold border round the score box on the card (Steve, 2026-11-23: "remove the yellow border"). */}
      {rival && <RivalBar bordered={false} rival={rival} finished={b.phase === "ended"} onJoin={showJoin ? rivalJoin : undefined} />}
      {lead && !rival && (
        <div className="row" style={{ gap: 8, fontSize: 14 }}>
          <Avatar user={{ id: lead.user_id, fullname: lead.name, username: lead.username, profile_image: lead.profile_image }} />
          <span style={{ color: "#fff" }}>{cbText(t("acb_leading"), { name: lead.name, n: lead.score.toLocaleString() })}</span>
        </div>
      )}
      {b.phase === "ended" && b.winner && !rival && (
        <div className="row" style={{ gap: 8, fontSize: 14 }}>
          <span aria-hidden>🏆</span>
          <span style={{ color: "#fff" }}>{cbText(t("acb_winner"), { name: b.winner.name })}</span>
        </div>
      )}
      {b.phase !== "ended" && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" style={{ flex: "1 1 140px" }} onClick={(e) => { e.stopPropagation(); open(); }}>👀 {t("cb_watch")}</button>
          <button className="btn gold" style={{ flex: "1 1 140px" }} onClick={join}>🔴 {t("cbd_join")}</button>
        </div>
      )}
    </div>
  );
}

/** The live list of Country VS Country battles, with its own search box (the CvC page). */
export function RivalBattlesList({ now }: { now: number }) {
  const { t } = useT();
  const { user } = useSession();
  const [query, setQuery] = useState("");
  const { battles, error, search } = useAllCountryBattles(query, "rival", user?.id, t("acb_empty"));
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
      <input className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder={t("acb_search")} aria-label={t("acb_search")} />
      {battles === null && !error ? <Loading /> : null}
      {error && battles === null && <Notice error>{error}</Notice>}
      {battles !== null && battles.length === 0 && (
        <div className="notice" style={{ textAlign: "center" }}>{search ? t("acb_no_match") : t("acb_empty")}</div>
      )}
      {(battles ?? []).map((b, i) => <CountryBattleCard key={b.day_id ?? `r-${b.country}-${i}`} b={b} now={now} />)}
    </section>
  );
}
