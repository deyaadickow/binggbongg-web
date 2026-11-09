import { useState } from "react";
import { useT } from "../lib/i18n";
import { isFilipinoLang, type Announcement, type AnnouncementLang } from "../lib/announcements";
import { Player, PlayDisc } from "../pages/AnnouncementsPage";

/**
 * Steve, 2026-11-09: "I love the video! we need to put this video in front and center at-least
 * until December 1st." The "Country Battle starts December 1" video (English + Tagalog, the same
 * files as Featured Videos rows 80/81) at the top of For You, playing in the site's own full-screen
 * announcement player. Disappears by itself after December 1 (Philippine time).
 */
const CDN = "https://d32kgcvh9dqf5h.cloudfront.net/uploads/";
const VIDEO: Announcement = {
  id: -1201,
  title: "Country Battle starts December 1",
  message: "",
  titleFil: "Country Battle simula Disyembre 1",
  messageFil: null,
  image: "",
  videoEn: CDN + "1794225734_6af1b646c2f13_fv_country_battle_dec1_gold_en.mp4",
  videoFil: CDN + "1794225737_6af1b6493a0e4_fv_country_battle_dec1_gold_tl.mp4",
  poster: CDN + "1794225734_6af1b646c2f13_fv_country_battle_dec1_gold_en.jpg",
  createdAt: null,
};
const POSTER_FIL = CDN + "1794225737_6af1b6493a0e4_fv_country_battle_dec1_gold_tl.jpg";
// The end of December 1 in the Philippines (UTC+8).
const SHOW_UNTIL = Date.parse("2026-12-02T00:00:00+08:00");

export function CountryBattleDec1Banner() {
  const { t, lang } = useT();
  const filipino = isFilipinoLang(lang);
  const [playing, setPlaying] = useState<AnnouncementLang | null>(null);
  if (Date.now() >= SHOW_UNTIL) return null;
  const first: AnnouncementLang = filipino ? "fil" : "en";
  const second: AnnouncementLang = filipino ? "en" : "fil";
  const label = (l: AnnouncementLang) => (l === "fil" ? "Tagalog" : "English");
  return (
    <>
      <div style={{
        display: "flex", gap: 14, alignItems: "center", margin: "0 0 16px", padding: 12,
        background: "#000", border: "2px solid #D4AF37", borderRadius: 16,
        boxShadow: "0 0 24px rgba(240,196,32,.25)",
      }}>
        <button type="button" onClick={() => setPlaying(first)} aria-label={t("cbd1_watch")}
          style={{ position: "relative", flex: "0 0 auto", width: 96, aspectRatio: "9 / 16", padding: 0,
            border: "1px solid #D4AF37", borderRadius: 10, overflow: "hidden", background: "#000", cursor: "pointer" }}>
          <img src={filipino ? POSTER_FIL : (VIDEO.poster ?? "")} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}><PlayDisc size={40} /></span>
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: "#F0C420", fontWeight: 900, fontSize: 19, lineHeight: 1.2 }}>{t("cbd1_title")}</div>
          <div style={{ color: "#fff", opacity: 0.85, fontSize: 14, margin: "4px 0 10px" }}>{t("cbd1_sub")}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[first, second].map((l) => (
              <button key={l} type="button" onClick={() => setPlaying(l)} style={{
                background: l === first ? "linear-gradient(180deg,#FFDD55,#D4AF37)" : "#000",
                color: l === first ? "#000" : "#F0C420", border: "1.5px solid #D4AF37", borderRadius: 999,
                padding: "7px 14px", fontWeight: 800, cursor: "pointer",
              }}>▶ {label(l)}</button>
            ))}
          </div>
        </div>
      </div>
      {playing && (
        <Player a={VIDEO} lang={playing} filipino={filipino} onLang={setPlaying} onClose={() => setPlaying(null)} />
      )}
    </>
  );
}
