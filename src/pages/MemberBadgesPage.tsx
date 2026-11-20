// The Bullseye page (Steve, 2026-11-20): "when they click the bullseye, It will link them to another
// page with these 4 items inside that page each with explanation for each item. Add another item for
// how many videos they have watched today, this month, this year and of all time from day one."
// Backend: MemberBadgesController::fetchMemberBadges. The four badges are public; videos watched is
// filled in only when the signed-in member is looking at their own page.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { displayName, post } from "../lib/api";
import { useSession } from "../lib/session";
import { Avatar, Loading, Notice } from "../components/Common";
import { BattleBadge, BattleStreak } from "../components/BattleBadge";
import { BullseyeSvg } from "../components/MemberBullseye";
import { useT } from "../lib/i18n";

interface MemberBadges {
  user: { id: number; username?: string; fullname?: string; profile_image?: string; is_verified?: number };
  is_self: boolean;
  battle_badge: number;
  battle_streak: number;
  battle_streak_best: number;
  battle_flames: number;
  vip: { name?: string | null; image?: string | null; votes?: number; spent?: number; next_name?: string | null; next_votes?: number | null } | null;
  watched: { today: number; month: number; year: number; all: number } | null;
  watched_private: boolean;
}

const gold = "var(--gold)";

function Card({ icon, title, value, body, extra }: { icon: React.ReactNode; title: string; value?: React.ReactNode; body: string; extra?: React.ReactNode }) {
  return (
    <section className="card" style={{ padding: "14px 16px", background: "#000", border: "1.5px solid var(--gold-border, #F0C420)", display: "grid", gap: 8 }}>
      {/* Steve, 2026-11-20: the heading of every box bigger and centred. */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center" }}>
        <div style={{ minHeight: 52, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</div>
        <div style={{ color: gold, fontWeight: 800, fontSize: 24, lineHeight: 1.15 }}>{title}</div>
        {value !== undefined && <div style={{ color: gold, fontWeight: 800, fontSize: 22, fontVariantNumeric: "tabular-nums" }}>{value}</div>}
      </div>
      <div style={{ height: 1, background: gold, opacity: 0.35 }} />
      <div style={{ color: gold, opacity: 0.9, lineHeight: 1.45 }}>{body}</div>
      {extra}
    </section>
  );
}

export function MemberBadgesPage() {
  const { id } = useParams();
  const userId = Number(id ?? 0);
  const { t, lang } = useT();
  const { user: me } = useSession();
  const [data, setData] = useState<MemberBadges | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    let tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { /* old browser */ }
    post<MemberBadges>("fetchMemberBadges", { user_id: userId, tz: tz || undefined, ...(me?.id ? { my_user_id: me.id } : {}) })
      .then((r) => { if (live) { if (r.status && r.data) setData(r.data); else setError(r.message || t("ma_load_error")); } })
      .catch(() => { if (live) setError(t("ma_load_error")); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, me?.id]);

  const n = (v: number | undefined | null) => Number(v ?? 0).toLocaleString(lang);
  const flames = data?.battle_flames ?? 0;

  return (
    <div className="page" style={{ maxWidth: 560, margin: "0 auto", padding: "12px 16px 40px", background: "#000", minHeight: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <BullseyeSvg size={26} />
        <h1 style={{ margin: 0, color: gold, fontSize: 22 }}>{t("mb_title")}</h1>
      </div>
      {error && <Notice error>{error}</Notice>}
      {!data && !error && <Loading />}
      {data && (
        <div style={{ display: "grid", gap: 14 }}>
          <Link to={`/profile/${data.user.id}`} style={{ display: "flex", alignItems: "center", gap: 12, color: gold, textDecoration: "none" }}>
            <Avatar user={data.user} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 17 }}>{displayName(data.user)}</div>
              {data.user.username && <div style={{ opacity: 0.75 }}>@{data.user.username}</div>}
            </div>
          </Link>

          <Card icon={<BattleBadge badge={data.battle_badge} size={40} />} title={t("mb_battle_badge")} body={t("mb_battle_badge_body")} />

          <Card icon={<BattleStreak streak={data.battle_streak} flames={0} size={30} />} title={t("mb_streak")} body={t("mb_streak_body")}
            extra={<div style={{ color: gold, fontWeight: 700 }}>{t("mb_best_streak", n(data.battle_streak_best))}</div>} />

          <Card icon={<span style={{ fontSize: 34, lineHeight: 1, opacity: flames > 0 ? 1 : 0.35 }}>🔥</span>} title={t("mb_flames")} value={n(flames)} body={t("mb_flames_body")} />

          <Card
            icon={data.vip?.image ? <img src={data.vip.image} alt="" style={{ width: 52, height: 52, objectFit: "contain" }} /> : <span style={{ color: gold, fontWeight: 800 }}>VIP</span>}
            title={t("mb_vip")}
            value={data.vip?.name ? <span style={{ fontSize: 15 }}>{data.vip.name}</span> : undefined}
            body={t("mb_vip_body")}
            extra={<>
              {!data.vip?.name && <div style={{ color: gold, fontWeight: 700 }}>{t("mb_vip_none")}</div>}
              {data.is_self && data.vip?.spent !== undefined && <div style={{ color: gold, fontWeight: 700 }}>{t("mb_vip_spent", n(data.vip.spent))}</div>}
              {data.is_self && data.vip?.next_name && <div style={{ color: gold, opacity: 0.85 }}>{t("mb_vip_next", data.vip.next_name, n(data.vip.next_votes))}</div>}
            </>} />

          <Card icon={<svg viewBox="0 0 24 24" width="40" height="40" aria-hidden><circle cx="12" cy="12" r="10.5" fill="none" stroke="#F0C420" strokeWidth="1.8" /><path d="M10 7.8v8.4l6.6-4.2z" fill="#F0C420" /></svg>} title={t("mb_watched")} body={t("mb_watched_body")}
            extra={data.watched ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 4 }}>
                {([["mb_today", data.watched.today], ["mb_month", data.watched.month], ["mb_year", data.watched.year], ["mb_all", data.watched.all]] as const).map(([k, v]) => (
                  <div key={k} style={{ border: "1.5px solid var(--gold)", borderRadius: 12, padding: "10px 4px", textAlign: "center" }}>
                    <div style={{ color: gold, fontWeight: 800, fontSize: 20, fontVariantNumeric: "tabular-nums" }}>{n(v)}</div>
                    <div style={{ color: gold, opacity: 0.8, fontSize: 12, marginTop: 2 }}>{t(k)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: gold, fontWeight: 700 }}>🔒 {t("mb_watched_private")}</div>
            )} />
        </div>
      )}
    </div>
  );
}
