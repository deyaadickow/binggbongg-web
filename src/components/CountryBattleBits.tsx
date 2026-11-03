// Country Battle pieces shared by the profile, the Country Battle page and the Bragging Rights
// board. v2 (Steve, 2026-11-03): one battle a day, so the badges are DAILY 1st/2nd/3rd ("keep daily
// 1st/2nd/3rd badges") — the v1 bullseye and its hidden-score list are gone.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "./Common";
import { showGoldAlert } from "./GoldToast";
import { useT, type StringKey } from "../lib/i18n";
import { useSession } from "../lib/session";
import {
  badgeCountsText, cbText, fetchCountryBattleReminder, setCountryBattleReminder,
  type CbBadge, type CbBadgeCounts, type CbReminder,
} from "../lib/countryBattle";
import type { ChbPerson } from "../lib/chatBattle";

const MEDAL = ["", "🥇", "🥈", "🥉"];

/** "🥇 Country Battle · Nov 2, 2026" pills, newest first, the newest few, each opening that day's
 *  top 100; then the lifetime counts "🥇×2 🥉×5" when there are more than the pills show. */
export function CountryBattleBadges({ badges, counts, max = 3 }: { badges?: CbBadge[] | null; counts?: CbBadgeCounts | null; max?: number }) {
  const { t } = useT();
  const list = (Array.isArray(badges) ? badges : []).filter((b) => b.place >= 1 && b.place <= 3);
  const total = counts ? Number(counts.first || 0) + Number(counts.second || 0) + Number(counts.third || 0) : list.length;
  if (list.length === 0 && total === 0) return null;
  const countText = total > Math.min(max, list.length) ? badgeCountsText(counts) : "";
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
      {list.slice(0, max).map((b, i) => {
        const when = b.date_label || b.month_label || "";
        const pill = (
          <>
            <span aria-hidden>{MEDAL[b.place]}</span>
            {t("cb_title")}{when ? ` · ${when}` : ""}
          </>
        );
        const title = [t(`cb_place_${b.place}` as StringKey), b.country, when].filter(Boolean).join(" · ");
        return b.day_id
          ? <Link key={`${b.day_id}-${b.place}`} to={`/country-battle/board/${b.day_id}`} className={`cb-badge p${b.place}`} title={title}>{pill}</Link>
          : <span key={`${b.battle_id ?? i}-${b.place}`} className={`cb-badge p${b.place}`} title={title}>{pill}</span>;
      })}
      {countText && <span className="cb-badge-counts" title={t("cb2_badges")}>{countText}</span>}
    </div>
  );
}

export function PlacePill({ place }: { place: number }) {
  const { t } = useT();
  const label = place >= 1 && place <= 3 ? t(`cb_place_${place}` as StringKey) : `#${place}`;
  return <span className={`cb-place p${place}`}>{label}</span>;
}

/** One member in a ranked list — yesterday's top 3, a day's top 100. */
export function CbPersonRow({ p, place, num, me, medal }: { p: ChbPerson; place?: number | null; num?: number | null; me?: boolean; medal?: number | null }) {
  return (
    <Link to={`/profile/${p.user_id}`} className={`cb-person${me ? " me" : ""}`}>
      {place ? <PlacePill place={place} /> : null}
      <Avatar user={{ id: p.user_id, fullname: p.name ?? undefined, username: p.username ?? undefined, profile_image: p.profile_image ?? undefined }} />
      <div style={{ minWidth: 0 }}>
        <b style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{medal ? `${MEDAL[medal]} ` : ""}{p.name || p.username}</b>
        {p.username && <span className="muted" style={{ fontSize: 12 }}>@{p.username}</span>}
      </div>
      {num != null && <span className="cb-num">{num.toLocaleString()}</span>}
    </Link>
  );
}

/** The "Country Battle reminders" switch (§8): the 7:55 PM push is phone-only, but members can set
 *  it here. Hidden until the server answers (signed out, or not deployed yet). `row` = the Settings
 *  list's row style; otherwise a card for the Country Battle page. */
export function CountryBattleReminderToggle({ row, initial }: { row?: boolean; initial?: boolean | null }) {
  const { t } = useT();
  const { user } = useSession();
  const uid = user?.id ?? 0;
  const [rem, setRem] = useState<CbReminder | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!uid) return;
    let live = true;
    fetchCountryBattleReminder(uid).then((r) => { if (live) setRem(r); });
    return () => { live = false; };
  }, [uid]);
  const enabled = rem ? rem.enabled : initial;
  if (!uid || enabled == null) return null;
  async function toggle(on: boolean) {
    setBusy(true);
    const r = await setCountryBattleReminder(uid, on);
    setBusy(false);
    if (r.ok && r.reminder) {
      setRem(r.reminder);
      showGoldAlert(r.message || t(r.reminder.enabled ? "cb2_reminders_on_done" : "cb2_reminders_off_done"));
    } else showGoldAlert(r.message || t("couldn_t_save"));
  }
  const hint = rem && !rem.available
    ? t("cb2_reminders_none")
    : rem?.remind_at_local && rem.country
      ? cbText(t("cb2_reminders_hint_at"), { time: hhmm(rem.remind_at_local), country: rem.country })
      : t("cb2_reminders_hint");
  return (
    <label className={row ? "row" : "card pad row"} style={row
      ? { padding: "12px 14px", borderBottom: "1px solid var(--line)", cursor: "pointer" }
      : { cursor: "pointer", marginBottom: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700 }}>🔔 {t("cb2_reminders")}</div>
        <div className="muted" style={{ fontSize: 12 }}>{hint}</div>
      </div>
      <input type="checkbox" className="switch" disabled={busy} checked={!!enabled} onChange={(e) => toggle(e.target.checked)} aria-label={t("cb2_reminders")} />
    </label>
  );
}

/** "19:55" (the battle country's local clock) -> "7:55 PM" in the viewer's own clock format. */
function hhmm(v: string): string {
  const m = v.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return v;
  return new Date(2000, 0, 1, Number(m[1]), Number(m[2])).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
