// The directory's battle-modes tile (Steve, 2026-11-01): "In this room please mention every battle
// we have available. bellow that we can show the live battles they can click and watch." It used
// to open Live Now, which is empty when nobody is live and never said what the battles are.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageTitle } from "../components/PageTitle";
import { BingoCardIcon } from "../components/BingoCardIcon";
import { BattleIcon } from "../components/ArtIcon";
import { Avatar } from "../components/Common";
import { LiveRoomsList } from "../components/LiveRoomsList";
import { SundayBonusCard } from "../components/SundayBonus";
import { post } from "../lib/api";
import { useT, type StringKey } from "../lib/i18n";
import { BATTLE_MODES } from "../lib/battleModes";
import { chatBattlePath } from "../lib/chatBattle";
import { countryBattlePath } from "../lib/countryBattle";

interface LiveBattle {
  room_name: string;
  host_user_id: number;
  host_fullname?: string | null;
  host_username?: string | null;
  host_profile_image?: string | null;
  battle: string;
  players: { user_id: number; name: string; username?: string | null; profile_image?: string | null }[];
  /** A Chat Battle's shared room: open the Chat Battle screen, not the live room. */
  chat_battle_contest_id?: number | null;
  /** The Country Battle's shared room: open the Country Battle screen as a viewer. */
  country_battle_day_id?: number | null;
}

function LiveBattles() {
  const { t } = useT();
  // null = loading; "fallback" = the server does not have fetchLiveBattles yet, show who is live
  const [battles, setBattles] = useState<LiveBattle[] | null | "fallback">(null);
  useEffect(() => {
    let alive = true;
    const load = () => post<LiveBattle[]>("fetchLiveBattles", {})
      .then((res) => { if (alive) setBattles(res.status ? res.data ?? [] : "fallback"); })
      .catch(() => { if (alive) setBattles("fallback"); });
    load();
    const timer = setInterval(load, 15000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  if (battles === null) return null;
  if (battles === "fallback") return <LiveRoomsList />;
  if (battles.length === 0) {
    return (
      <div className="card pad" style={{ borderColor: "var(--gold-border)", textAlign: "center" }}>
        <span className="muted">{t("fx_no_live_battles")}</span>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {battles.map((b, i) => (
        <Link key={b.room_name + b.battle + i} to={b.chat_battle_contest_id ? chatBattlePath(b.chat_battle_contest_id) : b.country_battle_day_id ? countryBattlePath(b.country_battle_day_id) : `/live/${encodeURIComponent(b.room_name)}`} className="card pad"
          style={{ borderColor: "var(--gold-border)", color: "inherit", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="pill" style={{ borderColor: "#E53935", color: "#ff6b6b" }}>● LIVE</span>
            <b style={{ color: "var(--gold)", flex: 1 }}>{b.battle}</b>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {(b.players.length ? b.players : [{ user_id: b.host_user_id, name: b.host_fullname || b.host_username || "", profile_image: b.host_profile_image }]).map((p) => (
              <span key={p.user_id} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Avatar user={{ id: p.user_id, fullname: p.name, profile_image: p.profile_image ?? undefined }} />
                <span>{p.name}</span>
              </span>
            ))}
          </div>
        </Link>
      ))}
    </div>
  );
}

export function BattlesPage() {
  const { t } = useT();
  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <PageTitle>{t("fx_battles_title")}</PageTitle>
      <SundayBonusCard />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {BATTLE_MODES.map((m, i) => (
          <div key={m.name} className="card pad" style={{ borderColor: "var(--gold-border)", display: "flex", gap: 12 }}>
            <span style={{ fontSize: 26, lineHeight: 1, width: 34, textAlign: "center", flexShrink: 0 }} aria-hidden>
              <BattleIcon artKey={m.art} size={32}>{m.icon === "bingo_card" ? <BingoCardIcon size={30} /> : m.icon}</BattleIcon>
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <b style={{ color: "var(--gold)", fontSize: 16 }}>#{i + 1} {m.name}</b>
              <span style={{ fontSize: 14, color: "rgba(255,255,255,0.85)" }}>{t(`bm_${i + 1}` as StringKey)}</span>
            </div>
          </div>
        ))}
      </div>
      <h2 style={{ color: "var(--gold)", fontSize: 18, margin: "22px 0 10px" }}>{t("fx_live_battles")}</h2>
      <LiveBattles />
    </div>
  );
}
