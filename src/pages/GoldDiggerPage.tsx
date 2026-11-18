// Gold Digger board (Steve, 2026-11-17): "Gold Digger leader board for every one with their score
// showing at all times." / "Game Starts from 1st of the month till the end of the month." / "The
// winner will have the bragging rights forever, the winner is one of the best Gold diggers on
// Bingg Bongg." / "3 prizes at the end of the game 1st place 1000 BBs 2nd Place 500 BBs 3rd Place
// 200 BBs."
//
// Open to everyone (lib/publicRoutes.ts): signed out it shows the board and a sign-up prompt in
// place of the pinned "You" card.
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { PageTitle } from "../components/PageTitle";
import { Avatar, Loading } from "../components/Common";
import { Podium } from "../components/GameShow";
import { GoldNugget } from "../components/GoldDigger";
import { displayName, type UserSummary } from "../lib/api";
import { useSession } from "../lib/session";
import { useT } from "../lib/i18n";
import { countryFlag } from "../lib/allCountryBattles";
import { countdownParts, fetchGoldDigger, MEDALS, type GdBoard, type GdUser } from "../lib/goldDigger";

const asUser = (u: GdUser) => ({ ...u, profile_image: u.profile_image ?? undefined }) as Partial<UserSummary>;
const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString();

export function GoldDiggerPage() {
  const { t } = useT();
  const location = useLocation();
  const { user, isLoggedIn } = useSession();
  const userId = isLoggedIn ? user?.id ?? 0 : 0;
  const [board, setBoard] = useState<GdBoard | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"month" | "hall">("month");
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const b = await fetchGoldDigger(userId || null);
      setBoard(b);
      setFailed(!b);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);
  // Back to this tab: fresh numbers, the same as pull-to-refresh on the phones.
  useEffect(() => {
    const onVis = () => { if (!document.hidden) void load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const secondsLeft = board ? Math.max(0, (Date.parse(board.ends_at) - now) / 1000) : 0;
  const c = countdownParts(Number.isFinite(secondsLeft) ? secondsLeft : board?.seconds_left ?? 0);
  const left = c.d > 0 ? t("gd_d_h", c.d, c.h) : c.h > 0 ? t("gd_h_m", c.h, c.m) : t("gd_m", c.m);
  const me = board?.me ?? null;
  const cap = board?.daily_cap_grams ?? 100;

  const tabBtn = (k: "month" | "hall", label: string) => (
    <button type="button" onClick={() => setTab(k)} style={{
      flex: 1, minHeight: 42, borderRadius: 999, fontWeight: 800, fontSize: 15, cursor: "pointer",
      border: "2px solid #D4AF37", background: tab === k ? "linear-gradient(90deg,#F0C420,#D4AF37)" : "#000",
      color: tab === k ? "#000" : "#F0C420",
    }}>{label}</button>
  );

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <PageTitle backTo="/features">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <GoldNugget size={34} />
          {t("gd_title")}
        </span>
      </PageTitle>

      {/* The month, the clock and the prizes */}
      <div className="card pad" style={{ background: "#000", textAlign: "center", borderWidth: 2 }}>
        {loading && !board ? <Loading /> : failed && !board ? (
          <div>
            <p style={{ color: "#fff", margin: "4px 0 12px" }}>{t("gd_load_failed")}</p>
            <button className="btn gold" onClick={() => void load()}>{t("gd_refresh")}</button>
          </div>
        ) : board && (
          <>
            <div style={{ color: "#FFDD55", fontSize: 22, fontWeight: 900 }}>{board.month_label}</div>
            <div style={{ color: "#F0C420", fontSize: 15, fontWeight: 700, marginTop: 2 }}>⏳ {t("gd_ends_in", left)}</div>
            <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              {board.prizes.slice(0, 3).map((p, i) => (
                <span key={i} style={{
                  border: "1.5px solid #D4AF37", borderRadius: 999, padding: "5px 12px", background: "#141005",
                  color: "#FFDD55", fontWeight: 800, fontSize: 14, whiteSpace: "nowrap",
                }}>{MEDALS[i]} {t("gd_bbs", fmt(p))}</span>
              ))}
            </div>
            {!board.prizes_paid && board.first_paid_month_label && (
              <div style={{ color: "#fff", fontSize: 13, marginTop: 10 }}>{t("gd_prizes_start", board.first_paid_month_label)}</div>
            )}
            {!board.enabled && !board.switch_on && (
              <div style={{ color: "#FFDD55", fontSize: 15, fontWeight: 800, marginTop: 10 }}>⛏️ {t("gd_starts_soon")}</div>
            )}
            {board.total_diggers > 0 && (
              <div style={{ color: "rgba(255,255,255,.75)", fontSize: 12.5, marginTop: 8 }}>{t("gd_diggers", fmt(board.total_diggers))}</div>
            )}
          </>
        )}
      </div>

      {/* "You" — pinned while the list scrolls under it. Signed out: the sign-up prompt. */}
      {board && (userId && me ? (
        <div style={{ position: "sticky", top: "calc(var(--nav-h) + 6px)", zIndex: 5, marginTop: 12 }}>
          <div className="card" style={{
            display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#141005",
            borderWidth: 2, borderColor: "#F0C420", boxShadow: "0 6px 18px rgba(0,0,0,.6)",
          }}>
            <Avatar user={user ?? asUser(me.user)} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "#FFDD55", fontWeight: 900, fontSize: 17 }}>
                {t("gd_you")} · {me.rank > 0 ? `${MEDALS[me.rank - 1] ?? ""} #${me.rank}` : t("gd_no_gold_yet")}
              </div>
              <div style={{ color: "rgba(255,255,255,.85)", fontSize: 13 }}>{t("gd_today", fmt(me.today_grams), fmt(cap))}</div>
            </div>
            <div style={{ color: "#FFDD55", fontWeight: 900, fontSize: 26, whiteSpace: "nowrap", textShadow: "0 0 8px rgba(240,196,32,.5)" }}>
              {fmt(me.grams)} g
            </div>
          </div>
        </div>
      ) : !userId ? (
        <div className="card pad" style={{ marginTop: 12, background: "#000", textAlign: "center" }}>
          <p style={{ color: "#fff", margin: "0 0 12px", fontSize: 15 }}>{t("gd_signup_prompt")}</p>
          <Link to="/login" state={{ from: location.pathname }} className="btn gold">{t("gd_sign_up")}</Link>
        </div>
      ) : null)}

      {board && (
        <>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            {tabBtn("month", t("gd_this_month"))}
            {tabBtn("hall", t("gd_hall_of_fame"))}
          </div>

          {tab === "month" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
              {board.leaders.length === 0 && (
                <div className="card pad" style={{ background: "#000", color: "#fff", textAlign: "center" }}>{t("gd_board_empty")}</div>
              )}
              {board.leaders.map((r) => {
                const mine = userId > 0 && r.user.id === userId;
                const flag = r.user.country ? countryFlag(r.user.country) : "";
                return (
                  <Link key={r.user.id} to={`/profile/${r.user.id}`} className="card" style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", textDecoration: "none",
                    background: mine ? "#1d1606" : "#000", borderColor: mine ? "#F0C420" : "var(--gold-border)",
                  }}>
                    <div style={{ width: 38, textAlign: "center", flex: "none", color: "#F0C420", fontWeight: 900, fontSize: r.rank <= 3 ? 26 : 16 }}>
                      {r.rank <= 3 ? MEDALS[r.rank - 1] : `#${r.rank}`}
                    </div>
                    <Avatar user={asUser(r.user)} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: "var(--gold)", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {displayName(asUser(r.user))}
                        {r.champion_wins > 0 && (
                          <span title={t("gd_champion_times", r.champion_wins)} style={{ marginLeft: 6, fontSize: 12, color: "#FFDD55" }}>👑 ×{r.champion_wins}</span>
                        )}
                      </div>
                      {(flag || r.user.country) && (
                        <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.75)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {flag} {r.user.country}
                        </div>
                      )}
                    </div>
                    <div style={{ color: "#FFDD55", fontWeight: 900, fontSize: 22, whiteSpace: "nowrap" }}>{fmt(r.grams)} g</div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
              {board.hall_of_fame.length === 0 && (
                <div className="card pad" style={{ background: "#000", color: "#fff", textAlign: "center" }}>{t("gd_hall_empty")}</div>
              )}
              {board.hall_of_fame.map((m) => {
                const byPlace = [1, 2, 3].map((p) => m.winners.find((w) => w.place === p));
                return (
                  <div key={m.month} className="card pad" style={{ background: "#000", textAlign: "center", borderWidth: 2 }}>
                    <div style={{ color: "#FFDD55", fontWeight: 900, fontSize: 18 }}>🏆 {m.month_label}</div>
                    <div style={{ color: "rgba(255,255,255,.75)", fontSize: 12.5, marginBottom: 6 }}>{t("gd_bragging")}</div>
                    <div style={{ color: "#fff" }}>
                      <Podium rows={byPlace.filter(Boolean).length ? byPlace.map((w) => w
                        ? { name: displayName(asUser(w.user)), value: `${fmt(w.grams)} g · ${t("gd_bbs", fmt(w.prize_bbs))}` }
                        : { name: "", value: "" }) : []} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="card pad" style={{ marginTop: 16, background: "#000" }}>
            <div style={{ color: "#FFDD55", fontWeight: 900, fontSize: 17, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <GoldNugget size={26} twinkle={false} /> {t("gd_how_title")}
            </div>
            <p style={{ color: "#fff", margin: 0, lineHeight: 1.5, fontSize: 14.5 }}>{t("gd_how_body", fmt(cap))}</p>
          </div>
          <div style={{ textAlign: "center", margin: "14px 0 24px" }}>
            <button className="btn small" onClick={() => void load()} disabled={loading}>↻ {t("gd_refresh")}</button>
          </div>
        </>
      )}
    </div>
  );
}
