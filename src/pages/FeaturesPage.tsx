// "Everything Bingg Bongg Does" (Steve, 2026-10-18).
//
// Steve: "Let's put a chip for every feature that we have, we need everyone to know how much our
// app has to offer." The goal is right; a chip row is the wrong instrument for it. There are 54
// headings in the App Features explainer and about 32 places a member can actually GO, and a row
// of fifty chips buries the seven people use — including Shop and Photo Styles, which were only
// just added. So: one tile per feature, on a page built to be browsed.
//
// Two rules this page lives by:
//
//  1. EVERY TILE IS HONEST ABOUT WHERE THE FEATURE IS. A tile either links somewhere real on the
//     web, or it says plainly that the feature is in the phone app. A grid of 40 tiles where a
//     third do nothing when tapped would be worse than no grid.
//  2. IT IS DATA, NOT MARKUP. Adding a feature is one row in FEATURES below. The same reasoning
//     as the Photo Styles table: the list is going to keep growing, and it must not need
//     redesigning to do it.
//
// Translated into Spanish, Filipino and Indonesian (2026-10-18), from ONE source shared with
// both phones: the same 109 key names exist in strings.xml, Localizable.strings and the web
// dictionary, so a feature's wording is written once and lands on all three.
import { Link } from "react-router-dom";
import { useT, type StringKey } from "../lib/i18n";

interface Feature {
  icon: string;
  nameKey: StringKey;
  blurbKey: StringKey;
  /** Where it lives on the web. Omitted means it is a phone-app feature. */
  to?: string;
  /** Where to find it on the phone, shown when there is no web route. */
  whereKey?: StringKey;
}

interface Section {
  titleKey: StringKey;
  features: Feature[];
}

const FEATURES: Section[] = [
  {
    titleKey: "fsec_going_live",
    features: [
      { icon: "🔴", nameKey: "fname_go_live", blurbKey: "fblurb_go_live", to: "/go-live" },
      { icon: "🖥️", nameKey: "fname_go_live_from_your_computer", blurbKey: "fblurb_go_live_from_your_computer", to: "/go-live/computer" },
      { icon: "📺", nameKey: "fname_live_now", blurbKey: "fblurb_live_now", to: "/live" },
      { icon: "👀", nameKey: "fname_watch_up_to_6_lives_at_once", blurbKey: "fblurb_watch_up_to_6_lives_at_once", whereKey: "fwhere_live_now_in_the_phone_app" },
      { icon: "🚪", nameKey: "fname_private_rooms", blurbKey: "fblurb_private_rooms", whereKey: "fwhere_the_phone_app" },
      { icon: "📡", nameKey: "fname_go_live_on_6_platforms", blurbKey: "fblurb_go_live_on_6_platforms", to: "/settings/simulcast" },
      { icon: "🎙️", nameKey: "fname_text_to_voice", blurbKey: "fblurb_text_to_voice", whereKey: "fwhere_the_live_room" },
      { icon: "🌐", nameKey: "fname_live_translation", blurbKey: "fblurb_live_translation", whereKey: "fwhere_the_live_room" },
      { icon: "🛡️", nameKey: "fname_your_moderators", blurbKey: "fblurb_your_moderators", to: "/settings/moderators" },
      { icon: "🔁", nameKey: "fname_a_message_that_repeats", blurbKey: "fblurb_a_message_that_repeats", whereKey: "fwhere_the_live_room" },
    ],
  },
  {
    titleKey: "fsec_battles",
    features: [
      { icon: "⚔️", nameKey: "fname_n11_battle_modes", blurbKey: "fblurb_n11_battle_modes", whereKey: "fwhere_the_live_room" },
      { icon: "🏆", nameKey: "fname_pk_battle_contests", blurbKey: "fblurb_pk_battle_contests", whereKey: "fwhere_the_live_room" },
      { icon: "💣", nameKey: "fname_power_ups", blurbKey: "fblurb_power_ups", whereKey: "fwhere_the_live_room" },
      { icon: "🔍", nameKey: "fname_find_a_battle", blurbKey: "fblurb_find_a_battle", to: "/settings/find-a-battle" },
      { icon: "📊", nameKey: "fname_battle_rankings", blurbKey: "fblurb_battle_rankings", whereKey: "fwhere_the_live_room" },
      { icon: "🥇", nameKey: "fname_lifetime_battle_board", blurbKey: "fblurb_lifetime_battle_board", whereKey: "fwhere_your_profile" },
      { icon: "🎖️", nameKey: "fname_battle_badge", blurbKey: "fblurb_battle_badge", whereKey: "fwhere_your_profile" },
      { icon: "🔥", nameKey: "fname_streak_and_flames", blurbKey: "fblurb_streak_and_flames", whereKey: "fwhere_your_profile" },
      { icon: "🌍", nameKey: "fname_country_vs_country", blurbKey: "fblurb_country_vs_country", to: "/cvc" },
      { icon: "🗓", nameKey: "fname_lives_and_battles_schedule", blurbKey: "fblurb_lives_and_battles_schedule", to: "/upcoming" },
      { icon: "🎲", nameKey: "fname_friendly_punishments", blurbKey: "fblurb_friendly_punishments", whereKey: "fwhere_the_live_room" },
    ],
  },
  {
    titleKey: "fsec_games",
    features: [
      { icon: "🎮", nameKey: "fname_n99_tap_games", blurbKey: "fblurb_n99_tap_games", whereKey: "fwhere_the_live_room" },
      { icon: "🎱", nameKey: "fname_bingg_bongg_bingo", blurbKey: "fblurb_bingg_bongg_bingo", whereKey: "fwhere_the_live_room" },
      { icon: "🏁", nameKey: "fname_race_games", blurbKey: "fblurb_race_games", whereKey: "fwhere_the_live_room" },
      { icon: "🧩", nameKey: "fname_one_stroke_and_block_escape", blurbKey: "fblurb_one_stroke_and_block_escape", whereKey: "fwhere_the_live_room" },
      { icon: "🏅", nameKey: "fname_game_leaderboards", blurbKey: "fblurb_game_leaderboards", whereKey: "fwhere_the_live_room" },
    ],
  },
  {
    titleKey: "fsec_videos_photos_and_news",
    features: [
      { icon: "🎬", nameKey: "fname_videos", blurbKey: "fblurb_videos", to: "/upload" },
      { icon: "🖼️", nameKey: "fname_photos", blurbKey: "fblurb_photos", to: "/photos" },
      { icon: "✨", nameKey: "fname_photo_styles", blurbKey: "fblurb_photo_styles", to: "/cartoon" },
      { icon: "📣", nameKey: "fname_exciting_news", blurbKey: "fblurb_exciting_news", to: "/exciting-news" },
      { icon: "📑", nameKey: "fname_playlists", blurbKey: "fblurb_playlists", whereKey: "fwhere_your_profile" },
      { icon: "🔮", nameKey: "fname_lucky_numbers_and_horoscope", blurbKey: "fblurb_lucky_numbers_and_horoscope", to: "/lucky" },
    ],
  },
  {
    titleKey: "fsec_money",
    features: [
      { icon: "🪙", nameKey: "fname_coins_and_gifts", blurbKey: "fblurb_coins_and_gifts", to: "/wallet" },
      { icon: "💸", nameKey: "fname_getting_paid_out", blurbKey: "fblurb_getting_paid_out", to: "/wallet/redeem" },
      { icon: "📅", nameKey: "fname_monthly_statement", blurbKey: "fblurb_monthly_statement", to: "/wallet/statements" },
      { icon: "🤝", nameKey: "fname_share_earn_10", blurbKey: "fblurb_share_earn_10", to: "/settings/referrals" },
      { icon: "💝", nameKey: "fname_who_supported_me", blurbKey: "fblurb_who_supported_me", to: "/support" },
      { icon: "🏪", nameKey: "fname_bingg_bongg_shop", blurbKey: "fblurb_bingg_bongg_shop", to: "/shop" },
      { icon: "🎥", nameKey: "fname_video_ad_gig", blurbKey: "fblurb_video_ad_gig", to: "/gigs" },
      { icon: "🎤", nameKey: "fname_your_own_live_show", blurbKey: "fblurb_your_own_live_show", to: "/my-show" },
    ],
  },
  {
    titleKey: "fsec_advertising",
    features: [
      { icon: "📢", nameKey: "fname_advertise_your_video", blurbKey: "fblurb_advertise_your_video", to: "/settings/advertise" },
      { icon: "🏬", nameKey: "fname_business_pages", blurbKey: "fblurb_business_pages", to: "/business" },
      { icon: "🖨️", nameKey: "fname_printable_flyers", blurbKey: "fblurb_printable_flyers", to: "/settings/printable-ads" },
    ],
  },
  {
    titleKey: "fsec_everything_else",
    features: [
      { icon: "🏆", nameKey: "fname_talent_contests", blurbKey: "fblurb_talent_contests", to: "/enter-contest" },
      { icon: "⭐", nameKey: "fname_vip_voter_badges", blurbKey: "fblurb_vip_voter_badges", whereKey: "fwhere_the_phone_app" },
      { icon: "💬", nameKey: "fname_direct_messages", blurbKey: "fblurb_direct_messages", to: "/messages" },
      { icon: "🔔", nameKey: "fname_notifications_kept", blurbKey: "fblurb_notifications_kept", to: "/notifications" },
      { icon: "🗣️", nameKey: "fname_n53_languages", blurbKey: "fblurb_n53_languages", to: "/settings/language" },
      { icon: "🆘", nameKey: "fname_support", blurbKey: "fblurb_support", to: "/settings/support" },
    ],
  },
  {
    titleKey: "fsec_browse_the_feed",
    features: [
      { icon: "📺", nameKey: "fname_all_shows", blurbKey: "fblurb_all_shows", to: "/shows" },
      { icon: "📣", nameKey: "fname_advertisers", blurbKey: "fblurb_advertisers", whereKey: "fwhere_the_phone_app" },
      { icon: "🗂", nameKey: "fname_categories_browse", blurbKey: "fblurb_categories_browse", whereKey: "fwhere_on_the_main_feed" },
      { icon: "⭐", nameKey: "fname_fav_categories_browse", blurbKey: "fblurb_fav_categories_browse", whereKey: "fwhere_on_the_main_feed" },
      { icon: "🗣", nameKey: "fname_by_language", blurbKey: "fblurb_by_language", whereKey: "fwhere_on_the_main_feed" },
      { icon: "🎂", nameKey: "fname_by_age_group", blurbKey: "fblurb_by_age_group", whereKey: "fwhere_on_the_main_feed" },
      { icon: "📍", nameKey: "fname_by_location", blurbKey: "fblurb_by_location", whereKey: "fwhere_on_the_main_feed" },
    ],
  },
];

function Tile({ f }: { f: Feature }) {
  const { t } = useT();
  const inner = (
    <div className="card pad" style={{
      borderColor: "var(--gold-border)", height: "100%",
      display: "flex", gap: 12, alignItems: "flex-start",
    }}>
      <span style={{ fontSize: 26, lineHeight: 1, flexShrink: 0 }} aria-hidden>{f.icon}</span>
      <span style={{ minWidth: 0 }}>
        <b style={{ color: "var(--gold)", display: "block", fontSize: 15 }}>{t(f.nameKey)}</b>
        <span className="muted" style={{ fontSize: 13, display: "block", marginTop: 3 }}>{t(f.blurbKey)}</span>
        {/* A tile that cannot take you anywhere says so, rather than looking broken. */}
        {!f.to && f.whereKey && (
          <span style={{ fontSize: 12, color: "var(--gold)", opacity: 0.75, display: "block", marginTop: 6 }}>
            📱 {t(f.whereKey)}
          </span>
        )}
      </span>
    </div>
  );
  return f.to
    ? <Link to={f.to} style={{ textDecoration: "none", display: "block", height: "100%" }}>{inner}</Link>
    : inner;
}

export function FeaturesPage() {
  const { t } = useT();
  const total = FEATURES.reduce((n, s) => n + s.features.length, 0);

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <h1 className="page-title">{t("everything_bingg_bongg_does")}</h1>
      <p className="muted" style={{ marginTop: -4 }}>
        {t("features_count_blurb", total)}
      </p>

      {FEATURES.map((section) => (
        <div key={section.titleKey} style={{ marginTop: 22 }}>
          <h2 style={{ color: "var(--gold)", fontSize: 17, margin: "0 0 10px" }}>{t(section.titleKey)}</h2>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 10,
          }}>
            {section.features.map((f) => <Tile key={f.nameKey} f={f} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
