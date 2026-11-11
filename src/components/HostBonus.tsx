// Battle Host Bonus +10% (Steve, 2026-11-10) — the card at the top of /battles and the explainer
// video that plays once, full screen, when the member's own live starts. See lib/hostBonus.ts.
// Both render nothing unless the server says the promotion is on.
import { useCallback, useEffect, useState } from "react";
import { useSession } from "../lib/session";
import { useT } from "../lib/i18n";
import type { Announcement, AnnouncementLang } from "../lib/announcements";
import { Player } from "../pages/AnnouncementsPage";
import {
  fetchHostBonus, hostBonusVideoSeen, markHostBonusVideoSeen, prefersTagalog, useHostBonus, type HostBonus,
} from "../lib/hostBonus";

const pct = (n: number) => String(Number.isInteger(n) ? n : Number(n.toFixed(1)));

/** The bonus as an announcement, so the Inbox announcements player can play it as it is. */
function asAnnouncement(b: HostBonus, title: string): Announcement {
  return {
    id: 0, title, message: "", titleFil: null, messageFil: null, image: "",
    videoEn: b.videoEn, videoFil: b.videoFil, poster: b.poster, createdAt: null,
  };
}

/** Tagalog when the member reads it, else English — whichever of the two exists. */
function firstLang(b: HostBonus, tagalog: boolean): AnnouncementLang | null {
  const order: AnnouncementLang[] = tagalog ? ["fil", "en"] : ["en", "fil"];
  return order.find((l) => (l === "fil" ? b.videoFil : b.videoEn)) ?? null;
}

function HostBonusPlayer({ b, tagalog, skip, onClose }: {
  b: HostBonus; tagalog: boolean; skip?: boolean; onClose: () => void;
}) {
  const { t } = useT();
  const [lang, setLang] = useState<AnnouncementLang | null>(() => firstLang(b, tagalog));
  if (!lang) return null;
  return (
    <Player a={asAnnouncement(b, t("hb_title", pct(b.percent)))} lang={lang} filipino={tagalog}
      onLang={setLang} onClose={onClose} onEnded={onClose} skip={skip} />
  );
}

/** The black card with the gold border at the top of /battles, next to the Sunday Bonus card. */
export function HostBonusCard() {
  const { t, lang } = useT();
  const { user } = useSession();
  const b = useHostBonus(user?.id);
  const [playing, setPlaying] = useState(false);
  if (!b) return null;
  const tagalog = prefersTagalog(lang, user?.country);
  const hasVideo = !!(b.videoEn || b.videoFil);
  return (
    <div className="card pad sb-card">
      <b className="sb-card-title">{t("hb_title", pct(b.percent))}</b>
      <span className="sb-card-line">{t("hb_body", pct(b.percent))}</span>
      {hasVideo && (
        <button type="button" className="btn" style={{ alignSelf: "center", marginTop: 4 }} onClick={() => setPlaying(true)}>
          ▶ {t("hb_watch")}
        </button>
      )}
      {playing && <HostBonusPlayer b={b} tagalog={tagalog} onClose={() => setPlaying(false)} />}
    </div>
  );
}

/** On Go Live (the member's OWN room, as host): the explainer video, once per member, full screen
 *  over the live room. The room underneath joins and publishes as normal — nothing waits on this. */
export function HostBonusIntro({ userId }: { userId: number }) {
  const { lang } = useT();
  const { user } = useSession();
  const [b, setB] = useState<HostBonus | null>(null);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    fetchHostBonus(userId).then((d) => {
      const v = d ? (d.videoEn || d.videoFil || "") : "";
      if (alive && d && v && !hostBonusVideoSeen(userId, v)) setB(d);
    });
    return () => { alive = false; };
  }, [userId]);
  const close = useCallback(() => {
    if (b) markHostBonusVideoSeen(userId, b.videoEn || b.videoFil || "");
    setB(null);
  }, [userId, b]);
  if (!b) return null;
  return <HostBonusPlayer b={b} tagalog={prefersTagalog(lang, user?.country)} skip onClose={close} />;
}
