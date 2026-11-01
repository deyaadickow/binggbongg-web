// Country Battle pieces shared by the profile, the Country Battle home and the board.
//
// Steve, 2026-11-01: "Every member that is in this battle will have a bullseye on his page, when
// clicked it will give a daily score of every member participating in this battle, host on top
// after the host will be member in alphabetical order no one will knows the score leader ...
// until the end of the battle friday". Chosen: the list shows a ✓ for each day played; a member
// sees only THEIR OWN numbers; everyone's are revealed Friday night with the 12 for Saturday.
// The server enforces that (daily is null unless it is your row or revealed) — this only draws.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar, Loading, Notice } from "./Common";
import { useT, type StringKey } from "../lib/i18n";
import { useSession } from "../lib/session";
import {
  cbText, fetchCountryBattleParticipants,
  type CbBadge, type CbParticipantRow, type CbPerson,
} from "../lib/countryBattle";

export function BullseyeIcon({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="#F0C420" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="5.2" fill="none" stroke="#F0C420" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="2.6" fill="#F0C420" />
    </svg>
  );
}

/** The ◎ beside the name on the profile of anyone who took part in their country's current or
 *  most recent battle. */
export function CountryBattleBullseye({ onClick }: { onClick: () => void }) {
  const { t } = useT();
  return (
    <button type="button" className="cb-bullseye" onClick={onClick} title={t("cb_bullseye")} aria-label={t("cb_bullseye")}>
      <BullseyeIcon />
    </button>
  );
}

/** 🥇/🥈/🥉 pills, newest first, the newest few. */
export function CountryBattleBadges({ badges, max = 3 }: { badges?: CbBadge[] | null; max?: number }) {
  const { t } = useT();
  if (!Array.isArray(badges) || badges.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
      {badges.filter((b) => b.place >= 1 && b.place <= 3).slice(0, max).map((b, i) => {
        const label = b.place === 1
          ? `${t("cb_badge_1")}${b.month_label ? ` · ${b.month_label}` : ""}`
          : t(b.place === 2 ? "cb_badge_2" : "cb_badge_3");
        return (
          <span key={`${b.battle_id ?? i}-${b.place}`} className={`cb-badge p${b.place}`}
            title={[b.country, b.month_label].filter(Boolean).join(" · ")}>
            <span aria-hidden>{b.place === 1 ? "🥇" : b.place === 2 ? "🥈" : "🥉"}</span>{label}
          </span>
        );
      })}
    </div>
  );
}

export function PlacePill({ place }: { place: number }) {
  const { t } = useT();
  const label = place >= 1 && place <= 3 ? t(`cb_place_${place}` as StringKey) : `#${place}`;
  return <span className={`cb-place p${place}`}>{label}</span>;
}

/** One member in a ranked list — the 12, the 6, the champions. */
export function CbPersonRow({ p, place, num }: { p: CbPerson; place?: number | null; num?: number | null }) {
  return (
    <Link to={`/profile/${p.user_id}`} className="cb-person">
      {place ? <PlacePill place={place} /> : null}
      <Avatar user={{ id: p.user_id, fullname: p.name ?? undefined, username: p.username ?? undefined, profile_image: p.profile_image ?? undefined }} />
      <div style={{ minWidth: 0 }}>
        <b style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name || p.username}</b>
        {p.username && <span className="muted" style={{ fontSize: 12 }}>@{p.username}</span>}
      </div>
      {num != null && <span className="cb-num">{num.toLocaleString()}</span>}
    </Link>
  );
}

const DAY_KEYS: StringKey[] = ["cb_d1", "cb_d2", "cb_d3", "cb_d4", "cb_d5", "cb_d6", "cb_d7"];

/** The participants of one battle: the profile owner first, then A–Z (the server's order). */
export function CountryBattleParticipants({ battleId, profileUserId }: { battleId: number; profileUserId?: number }) {
  const { t } = useT();
  const { user } = useSession();
  const [data, setData] = useState<{ revealed: boolean; rows: CbParticipantRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setData(null);
    fetchCountryBattleParticipants(user?.id ?? 0, battleId, profileUserId)
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) setError((e as Error).message); });
    return () => { live = false; };
  }, [battleId, profileUserId, user?.id]);

  if (error) return <Notice error>{error}</Notice>;
  if (!data) return <Loading />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="muted" style={{ textAlign: "center", fontSize: 13 }}>
        {cbText(t("cb_participants_count"), { n: data.rows.length })}
      </div>
      {!data.revealed && <div className="notice" style={{ textAlign: "center", fontSize: 13 }}>{t("cb_secret")}</div>}
      {data.rows.map((r) => {
        const mine = r.user_id === user?.id;
        const played = new Set(r.days_played ?? []);
        const daily = Array.isArray(r.daily) ? r.daily : null;
        return (
          <div key={r.user_id} className={`cb-prow${mine ? " me" : ""}`}>
            <Link to={`/profile/${r.user_id}`} className="cb-prow-top">
              {r.place ? <PlacePill place={r.place} /> : null}
              <Avatar user={{ id: r.user_id, fullname: r.name ?? undefined, username: r.username ?? undefined, profile_image: r.profile_image ?? undefined }} />
              <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
                <b>{r.name || r.username}</b>
                {r.username && <span className="muted" style={{ fontSize: 12 }}>@{r.username}</span>}
              </div>
            </Link>
            <div className="cb-days">
              {DAY_KEYS.map((k, i) => {
                const on = played.has(i + 1);
                const n = daily?.[i];
                return (
                  <span key={k} className={on ? "on" : ""} title={on ? t("cb_played") : undefined}>
                    {t(k)}
                    <em>{n != null ? n.toLocaleString() : on ? "✓" : ""}</em>
                  </span>
                );
              })}
            </div>
            {(r.week_total != null || r.saturday_score != null || r.sunday_score != null) && (
              <div className="cb-totals">
                {r.week_total != null && <span>{t("cb_week_total")}: <b>{r.week_total.toLocaleString()}</b></span>}
                {r.saturday_score != null && <span>{t("cb_sat")}: <b>{r.saturday_score.toLocaleString()}</b></span>}
                {r.sunday_score != null && <span>{t("cb_sun")}: <b>{r.sunday_score.toLocaleString()}</b></span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function CountryBattleParticipantsModal({ battleId, profileUserId, title, onClose }: { battleId: number; profileUserId?: number; title?: string; onClose: () => void }) {
  const { t } = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t("cb_participants")}>
        <div className="row" style={{ marginBottom: 12 }}>
          <BullseyeIcon size={24} />
          <h3 style={{ margin: 0, flex: 1, textAlign: "left" }}>{title ?? t("cb_title")} · {t("cb_participants")}</h3>
          <button className="btn small ghost" onClick={onClose}>{t("close")}</button>
        </div>
        <CountryBattleParticipants battleId={battleId} profileUserId={profileUserId} />
      </div>
    </div>
  );
}
