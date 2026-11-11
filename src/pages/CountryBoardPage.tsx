// The Country Board (Steve, 2026-11-11): "Make every country fight for its pride" — every
// country's points (1 for every BB or FBB its members send, +100 for every new member), my
// country's big gold card with "Philippines is losing to 🇬🇧 United Kingdom by 2,310 points",
// Invite friends (the referral share, code = username) and Share (the card picture).
//
// /country-board                the board (fetchCountryBoard, period today | week | all)
// /country-board?demo=1         sample numbers, no server: &demo=leader | tie | out | empty | error
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageTitle } from "../components/PageTitle";
import { Loading } from "../components/Common";
import { hookLine, sayShareOutcome } from "../components/CountryBoardBits";
import { useT, type StringKey } from "../lib/i18n";
import { useSession } from "../lib/session";
import {
  COUNTRY_PERIODS, demoCountryBoard, demoKind, fetchCountryBoard, prefetchCard, shareCard, shareInvite,
  type CountryBoard, type CountryPeriod,
} from "../lib/countryBoard";

const PERIOD_KEY: Record<CountryPeriod, StringKey> = { today: "cbd_today", week: "cbd_week", all: "cbd_all" };

export function CountryBoardPage() {
  const { t } = useT();
  const { isLoggedIn } = useSession();
  const [sp] = useSearchParams();
  const demo = demoKind(sp.get("demo"));
  const [period, setPeriod] = useState<CountryPeriod>("today");
  const [board, setBoard] = useState<CountryBoard | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback((p: CountryPeriod) => {
    setBusy(true);
    setError(false);
    (demo ? demoCountryBoard(demo, p) : fetchCountryBoard(p))
      .then((b) => { setBoard(b); prefetchCard(b.share?.card_url); })
      .catch(() => { setBoard(null); setError(true); })
      .finally(() => setBusy(false));
  }, [demo]);
  useEffect(() => { setBoard(null); load(period); }, [period, load]);
  // Refresh when the tab comes back to the front (the phones refresh on appear).
  useEffect(() => {
    const vis = () => { if (document.visibilityState === "visible") load(period); };
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, [period, load]);

  const me = board?.me ?? null;
  const share = board?.share ?? null;
  const signedOut = demo === "out" || (!demo && !isLoggedIn);

  return (
    <div className="page cbd-page" style={{ maxWidth: 760 }}>
      <PageTitle right={
        <button className="cbd-refresh" onClick={() => load(period)} disabled={busy} aria-label={t("cbd_refresh")} title={t("cbd_refresh")}>↻</button>
      }>{t("cbd_title")}</PageTitle>
      <p className="cbd-sub">{t("cbd_subtitle")}</p>
      {demo && <div className="cbd-demo">🧪 {t("cbd_demo")}</div>}

      {me && (
        <div className="cbd-mine">
          <span className="cbd-mine-flag" aria-hidden>{me.flag}</span>
          <b className="cbd-mine-name">{me.country}</b>
          <b className="cbd-mine-rank">{t("cbd_rank_world", me.rank)}</b>
          <span className="cbd-mine-points">{t("cbd_points", me.points.toLocaleString())}</span>
          <p className="cbd-hook">{hookLine(t, me)}</p>
          {share && (
            <div className="cbd-mine-btns">
              <button className="btn gold cbd-big-btn" onClick={async () => sayShareOutcome(t, await shareInvite(share.text, share.page_url))}>
                🤝 {t("cbd_invite")}
              </button>
              <button className="btn cbd-big-btn" onClick={async () => sayShareOutcome(t, await shareCard({
                cardUrl: share.card_url, text: share.text, pageUrl: share.page_url, fileName: `country-board-${me.country.toLowerCase().replace(/\W+/g, "-")}.png`,
              }))}>
                📤 {t("cbd_share")}
              </button>
            </div>
          )}
        </div>
      )}
      {board && !me && (
        <div className="cbd-state">{signedOut ? t("cbd_signin") : t("cbd_no_country")}</div>
      )}

      <div className="tabs cbd-tabs" role="tablist">
        {COUNTRY_PERIODS.map((p) => (
          <button key={p} role="tab" aria-selected={period === p} className={period === p ? "active" : ""} onClick={() => setPeriod(p)}>
            {t(PERIOD_KEY[p])}
          </button>
        ))}
      </div>

      {!board && !error && <Loading />}
      {error && (
        <button className="cbd-state cbd-state-btn" onClick={() => load(period)}>{t("cbd_error")}</button>
      )}
      {board && board.countries.length === 0 && <div className="cbd-state">{t("cbd_empty")}</div>}
      {board && board.countries.length > 0 && (
        <ol className="cbd-list">
          {board.countries.map((c) => {
            const mine = !!me && c.country === me.country;
            return (
              <li key={c.country} className={`cbd-row${mine ? " me" : ""}`}>
                <span className="cbd-rank">#{c.rank}</span>
                <span className="cbd-flag" aria-hidden>{c.flag}</span>
                <span className="cbd-name">
                  <b>{c.country}</b>
                  <span className="cbd-members">{t("cbd_members", c.members.toLocaleString())}{c.new_members > 0 ? ` · ${t("cbd_new_members", c.new_members.toLocaleString())}` : ""}</span>
                </span>
                <b className="cbd-pts">{c.points.toLocaleString()}</b>
              </li>
            );
          })}
        </ol>
      )}

      <p className="cbd-how">{t("cbd_how")}</p>
    </div>
  );
}
