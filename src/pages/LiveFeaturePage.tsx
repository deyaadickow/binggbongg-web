// What a live-room feature is, how to use it, and who is live right now to try it with (Steve,
// 2026-11-01, on the directory's Power-ups tile: "Please add explanation for this feature in the
// room and a back button"). The directory's live-room tiles used to open Live Now, which explains
// nothing and is empty when nobody is live.
import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { PageTitle } from "../components/PageTitle";
import { BingoCardIcon } from "../components/BingoCardIcon";
import { FeatureIcon } from "../components/ArtIcon";
import { LiveRoomsList } from "../components/LiveRoomsList";
import { FeatureVideoPlayer } from "../components/FeatureVideoPlayer";
import { fetchFeatureVideos } from "../lib/featureVideos";
import { useT, type StringKey } from "../lib/i18n";

/** URL slug -> the tile's name key (also its feature-video key), its icon and its two texts. */
export const LIVE_FEATURES: Record<string, { nameKey: StringKey; labelKey?: StringKey; icon: string; what: StringKey; how: StringKey }> = {
  "power-ups": { nameKey: "fname_power_ups", icon: "💣", what: "fx_power_ups_what", how: "fx_power_ups_how" },
  "friendly-punishments": { nameKey: "fname_friendly_punishments", icon: "🎭", what: "fx_friendly_punishments_what", how: "fx_friendly_punishments_how" },
  "battle-rankings": { nameKey: "fname_battle_rankings", icon: "📊", what: "fx_battle_rankings_what", how: "fx_battle_rankings_how" },
  "tap-games": { nameKey: "fname_n99_tap_games", icon: "🎮", what: "fx_n99_tap_games_what", how: "fx_n99_tap_games_how" },
  "bingo": { nameKey: "fname_bingg_bongg_bingo", icon: "bingo_card", what: "fx_bingg_bongg_bingo_what", how: "fx_bingg_bongg_bingo_how" },
  "quiz-games": { nameKey: "fname_trivia_night", labelKey: "fname_quiz_games", icon: "🧠", what: "fx_quiz_games_what", how: "fx_quiz_games_how" },
  "word-search": { nameKey: "fname_word_search", icon: "🔤", what: "fx_word_search_what", how: "fx_word_search_how" },
  "whats-behind-me": { nameKey: "fname_whats_behind_me", icon: "🫣", what: "fx_whats_behind_me_what", how: "fx_whats_behind_me_how" },
  "race-games": { nameKey: "fname_race_games", icon: "🏁", what: "fx_race_games_what", how: "fx_race_games_how" },
  "puzzles": { nameKey: "fname_one_stroke_and_block_escape", icon: "🧩", what: "fx_one_stroke_and_block_escape_what", how: "fx_one_stroke_and_block_escape_how" },
  "game-leaderboards": { nameKey: "fname_game_leaderboards", icon: "🏅", what: "fx_game_leaderboards_what", how: "fx_game_leaderboards_how" },
  "text-to-voice": { nameKey: "fname_text_to_voice", icon: "🎙️", what: "fx_text_to_voice_what", how: "fx_text_to_voice_how" },
  "live-translation": { nameKey: "fname_live_translation", icon: "🌐", what: "fx_live_translation_what", how: "fx_live_translation_how" },
  "repeating-message": { nameKey: "fname_a_message_that_repeats", icon: "🔁", what: "fx_a_message_that_repeats_what", how: "fx_a_message_that_repeats_how" },
  "watch-6-lives": { nameKey: "fname_watch_up_to_6_lives_at_once", icon: "👀", what: "fx_watch_up_to_6_lives_at_once_what", how: "fx_watch_up_to_6_lives_at_once_how" },
};

export function LiveFeaturePage() {
  const { slug = "" } = useParams();
  const { t, lang } = useT();
  const f = LIVE_FEATURES[slug];
  const [video, setVideo] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!f) return;
    let live = true;
    fetchFeatureVideos(lang).then((v) => { if (live) setVideo(v[f.nameKey] ?? null); });
    return () => { live = false; };
  }, [f, lang]);
  if (!f) return <Navigate to="/features" replace />;
  const title = t(f.labelKey ?? f.nameKey);
  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <PageTitle>{title}</PageTitle>
      <div className="card pad" style={{ borderColor: "var(--gold-border)", display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
        <span style={{ fontSize: 34, lineHeight: 1 }} aria-hidden><FeatureIcon artKey={f.nameKey.replace(/^fname_/, "")} size={40}>{f.icon === "bingo_card" ? <BingoCardIcon size={40} /> : f.icon}</FeatureIcon></span>
        <div>
          <b style={{ color: "var(--gold)" }}>{t("fx_what")}</b>
          <p style={{ margin: "6px 0 0", color: "rgba(255,255,255,0.9)" }}>{t(f.what)}</p>
        </div>
        <div>
          <b style={{ color: "var(--gold)" }}>{t("fx_how")}</b>
          <p style={{ margin: "6px 0 0", color: "rgba(255,255,255,0.9)" }}>{t(f.how)}</p>
        </div>
        {video && <button className="btn" style={{ alignSelf: "flex-start" }} onClick={() => setPlaying(true)}>▶ {t("watch_video")}</button>}
      </div>
      <h2 style={{ color: "var(--gold)", fontSize: 18, margin: "0 0 10px" }}>{t("fx_live_now")}</h2>
      <LiveRoomsList />
      {playing && video && <FeatureVideoPlayer items={[{ url: video, title }]} onClose={() => setPlaying(false)} />}
    </div>
  );
}
