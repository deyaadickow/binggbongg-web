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
//     Steve, 2026-10-20: "Make all 8 tiles open the same as the phones. each tile will link to
//     the same page as on the phones." The eight that still said "the phone app" were the feed
//     filters — categories, favourites, language, age, location, advertisers, VIP badges — plus
//     Private Rooms. They are now built on the web too (pages/BrowsePages.tsx), so EVERY tile
//     in this directory opens something.
//  2. IT IS DATA, NOT MARKUP. Adding a feature is one row in FEATURES below. The same reasoning
//     as the Photo Styles table: the list is going to keep growing, and it must not need
//     redesigning to do it.
//
// Translated into Spanish, Filipino and Indonesian (2026-10-18), from ONE source shared with
// both phones: the same 109 key names exist in strings.xml, Localizable.strings and the web
// dictionary, so a feature's wording is written once and lands on all three.
import { Link } from "react-router-dom";
import { useT, type StringKey } from "../lib/i18n";
import { PageTitle } from "../components/PageTitle";
import { useSession } from "../lib/session";
import { useEffect, useState } from "react";
import { fetchFeatureVideos, featureVideoLabels } from "../lib/featureVideos";
import { IDEA_SUPPORT_REASON } from "../lib/ideas";

interface Feature {
  icon: string;
  nameKey: StringKey;
  blurbKey: StringKey;
  /** Where it lives on the web. Omitted means it is a phone-app feature. */
  to?: string;
  /** Where to find it on the phone, shown when there is no web route. */
  whereKey?: StringKey;
  /** Your OWN profile, whose id is only known once somebody is signed in. */
  myProfile?: true;
}

interface Section {
  titleKey: StringKey;
  features: Feature[];
}

const FEATURES: Section[] = [
  {
    // Steve, 2026-10-25: these two were tabs at the top; they are #1 and #2 here now.
    titleKey: "fsec_featured",
    features: [
      { icon: "🎤", nameKey: "fname_philippine_singing_contest", blurbKey: "fblurb_philippine_singing_contest", to: "/featured-contest" },
      { icon: "📣", nameKey: "fname_exciting_news", blurbKey: "fblurb_exciting_news", to: "/exciting-news" },
      // Steve, 2026-10-25: Share Your Idea — Support with the idea reason picked; the page shows
      // the $100 bonus rules above the form when it arrives this way.
      { icon: "💡", nameKey: "fname_share_your_idea", blurbKey: "fblurb_share_your_idea", to: "/settings/support?reason=" + encodeURIComponent(IDEA_SUPPORT_REASON) },
    ],
  },
  {
    titleKey: "fsec_going_live",
    features: [
      { icon: "🔴", nameKey: "fname_go_live", blurbKey: "fblurb_go_live", to: "/go-live" },
      { icon: "🖥️", nameKey: "fname_go_live_from_your_computer", blurbKey: "fblurb_go_live_from_your_computer", to: "/go-live/computer" },
      { icon: "📺", nameKey: "fname_live_now", blurbKey: "fblurb_live_now", to: "/live" },
      { icon: "👀", nameKey: "fname_watch_up_to_6_lives_at_once", blurbKey: "fblurb_watch_up_to_6_lives_at_once", to: "/live", whereKey: "fwhere_the_phone_app" },
      { icon: "🚪", nameKey: "fname_private_rooms", blurbKey: "fblurb_private_rooms", to: "/browse/private-rooms" },
      { icon: "📡", nameKey: "fname_go_live_on_6_platforms", blurbKey: "fblurb_go_live_on_6_platforms", to: "/settings/simulcast" },
      { icon: "🎙️", nameKey: "fname_text_to_voice", blurbKey: "fblurb_text_to_voice", to: "/live", whereKey: "fwhere_the_live_room" },
      { icon: "🌐", nameKey: "fname_live_translation", blurbKey: "fblurb_live_translation", to: "/live", whereKey: "fwhere_the_live_room" },
      { icon: "🛡️", nameKey: "fname_your_moderators", blurbKey: "fblurb_your_moderators", to: "/settings/moderators" },
      { icon: "🔁", nameKey: "fname_a_message_that_repeats", blurbKey: "fblurb_a_message_that_repeats", to: "/live", whereKey: "fwhere_the_live_room" },
    ],
  },
  {
    titleKey: "fsec_battles",
    features: [
      { icon: "⚔️", nameKey: "fname_n11_battle_modes", blurbKey: "fblurb_n11_battle_modes", to: "/live", whereKey: "fwhere_the_live_room" },
      { icon: "🏆", nameKey: "fname_pk_battle_contests", blurbKey: "fblurb_pk_battle_contests", to: "/live", whereKey: "fwhere_the_live_room" },
      { icon: "💣", nameKey: "fname_power_ups", blurbKey: "fblurb_power_ups", to: "/live", whereKey: "fwhere_the_live_room" },
      { icon: "🔍", nameKey: "fname_find_a_battle", blurbKey: "fblurb_find_a_battle", to: "/settings/find-a-battle" },
      { icon: "📊", nameKey: "fname_battle_rankings", blurbKey: "fblurb_battle_rankings", to: "/live", whereKey: "fwhere_the_live_room" },
      { icon: "🥇", nameKey: "fname_lifetime_battle_board", blurbKey: "fblurb_lifetime_battle_board", myProfile: true, whereKey: "fwhere_your_profile" },
      { icon: "🎖️", nameKey: "fname_battle_badge", blurbKey: "fblurb_battle_badge", myProfile: true, whereKey: "fwhere_your_profile" },
      { icon: "🔥", nameKey: "fname_streak_and_flames", blurbKey: "fblurb_streak_and_flames", myProfile: true, whereKey: "fwhere_your_profile" },
      { icon: "🌍", nameKey: "fname_country_vs_country", blurbKey: "fblurb_country_vs_country", to: "/cvc" },
      { icon: "🗓", nameKey: "fname_lives_and_battles_schedule", blurbKey: "fblurb_lives_and_battles_schedule", to: "/upcoming" },
      { icon: "🎲", nameKey: "fname_friendly_punishments", blurbKey: "fblurb_friendly_punishments", to: "/live", whereKey: "fwhere_the_live_room" },
    ],
  },
  {
    titleKey: "fsec_games",
    features: [
      { icon: "🎮", nameKey: "fname_n99_tap_games", blurbKey: "fblurb_n99_tap_games", to: "/live", whereKey: "fwhere_the_live_room" },
      { icon: "🎱", nameKey: "fname_bingg_bongg_bingo", blurbKey: "fblurb_bingg_bongg_bingo", to: "/live", whereKey: "fwhere_the_live_room" },
      { icon: "🏁", nameKey: "fname_race_games", blurbKey: "fblurb_race_games", to: "/live", whereKey: "fwhere_the_live_room" },
      { icon: "🧩", nameKey: "fname_one_stroke_and_block_escape", blurbKey: "fblurb_one_stroke_and_block_escape", to: "/live", whereKey: "fwhere_the_live_room" },
      { icon: "🏅", nameKey: "fname_game_leaderboards", blurbKey: "fblurb_game_leaderboards", to: "/live", whereKey: "fwhere_the_live_room" },
    ],
  },
  {
    titleKey: "fsec_videos_photos_and_news",
    features: [
      { icon: "🎬", nameKey: "fname_videos", blurbKey: "fblurb_videos", to: "/upload" },
      { icon: "🖼️", nameKey: "fname_photos", blurbKey: "fblurb_photos", to: "/photos" },
      { icon: "✨", nameKey: "fname_photo_styles", blurbKey: "fblurb_photo_styles", to: "/cartoon" },
      { icon: "📑", nameKey: "fname_playlists", blurbKey: "fblurb_playlists", myProfile: true, whereKey: "fwhere_your_profile" },
      { icon: "🔮", nameKey: "fname_lucky_numbers_and_horoscope", blurbKey: "fblurb_lucky_numbers_and_horoscope", to: "/lucky" },
    ],
  },
  {
    titleKey: "fsec_money",
    features: [
      { icon: "🪙", nameKey: "fname_coins_and_gifts", blurbKey: "fblurb_coins_and_gifts", to: "/wallet" },
      // Steve, 2026-10-19: "Add another box for Purchase Coins and link them to the website."
      // On the web the website IS here, so it goes to the Wallet, where the checkout lives.
      { icon: "💳", nameKey: "fname_purchase_coins", blurbKey: "fblurb_purchase_coins", to: "/wallet" },
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

      { icon: "🎂", nameKey: "fname_birthdays", blurbKey: "fblurb_birthdays", to: "/birthdays" },

      { icon: "✅", nameKey: "fname_get_verified", blurbKey: "fblurb_get_verified", to: "/settings/verification" },

      { icon: "📱", nameKey: "fname_my_qr_code", blurbKey: "fblurb_my_qr_code", to: "/settings/qr" },

      { icon: "🔎", nameKey: "fname_search", blurbKey: "fblurb_search", to: "/search" },

      { icon: "🎭", nameKey: "fname_virtual_look", blurbKey: "fblurb_virtual_look", to: "/settings/virtual-look" },

      { icon: "⭐", nameKey: "fname_vip_voter_badges", blurbKey: "fblurb_vip_voter_badges", to: "/browse/vip-badges" },

      { icon: "💬", nameKey: "fname_direct_messages", blurbKey: "fblurb_direct_messages", to: "/messages" },

      { icon: "🔔", nameKey: "fname_notifications_kept", blurbKey: "fblurb_notifications_kept", to: "/notifications" },

      { icon: "🗣️", nameKey: "fname_n53_languages", blurbKey: "fblurb_n53_languages", to: "/settings/language" },

      { icon: "📝", nameKey: "fname_to_do_list", blurbKey: "fblurb_to_do_list", to: "/settings/todo", whereKey: "fwhere_settings" },

      { icon: "🆘", nameKey: "fname_support", blurbKey: "fblurb_support", to: "/settings/support" },

      // Web-only tiles, kept last so the numbers above match the phones.
      { icon: "🤖", nameKey: "fname_virtual_battles", blurbKey: "fblurb_virtual_battles", to: "/settings/virtual-battles" },

      { icon: "❓", nameKey: "fname_help_and_faq", blurbKey: "fblurb_help_and_faq", to: "/settings/faq" },

      { icon: "✉️", nameKey: "fname_contact_us", blurbKey: "fblurb_contact_us", to: "/settings/contact" },

      { icon: "ℹ️", nameKey: "fname_about_bingg_bongg", blurbKey: "fblurb_about_bingg_bongg", to: "/settings/about" },

    ],
  },
  {
    titleKey: "fsec_browse_the_feed",
    features: [
      { icon: "📺", nameKey: "fname_all_shows", blurbKey: "fblurb_all_shows", to: "/shows" },
      { icon: "📣", nameKey: "fname_advertisers", blurbKey: "fblurb_advertisers", to: "/browse/advertisers" },
      { icon: "🗂", nameKey: "fname_categories_browse", blurbKey: "fblurb_categories_browse", to: "/browse/categories" },
      { icon: "⭐", nameKey: "fname_fav_categories_browse", blurbKey: "fblurb_fav_categories_browse", to: "/browse/favourite-categories" },
      { icon: "🗣", nameKey: "fname_by_language", blurbKey: "fblurb_by_language", to: "/browse/language" },
      { icon: "🎂", nameKey: "fname_by_age_group", blurbKey: "fblurb_by_age_group", to: "/browse/age" },
      { icon: "📍", nameKey: "fname_by_location", blurbKey: "fblurb_by_location", to: "/browse/location" },
    ],
  },
  {
    // Steve, 2026-10-23: Help gets its own tab. 2026-10-25: moved to the bottom of the directory.
    titleKey: "fsec_help",
    features: [
      { icon: "🤝", nameKey: "fname_help", blurbKey: "fblurb_help", to: "/help" },
      // Password Protected Page (Steve, 2026-10-24). Added with Help, but its tile here was
      // missed — and every tile in this directory must OPEN something.
      { icon: "🔐", nameKey: "fname_vault", blurbKey: "fblurb_vault", to: "/settings/vault", whereKey: "fwhere_settings" },
    ],
  },
];

// Steve, 2026-10-25: "add a number on top right corner of each feature starting from #1". The
// number is the tile's place in the WHOLE directory, so a search keeps #12 as #12.
const FEATURE_NUMBER: Record<string, number> = {};
FEATURES.flatMap((sec) => sec.features).forEach((f, i) => { FEATURE_NUMBER[f.nameKey] = i + 1; });

function Tile({ f, video, onWatch, extras = [], onWatchExtra }: { f: Feature; video?: string; onWatch: () => void; extras?: { key: string; label: string }[]; onWatchExtra?: (key: string) => void }) {
  const { t } = useT();
  // The battle badge, the streak, the Lifetime Battle Board and Playlists all live on your own
  // profile, whose address needs the signed-in id. Signed out, the tile leads to the sign-in
  // page rather than nowhere.
  const { user } = useSession();
  const to = f.myProfile ? (user ? `/profile/${user.id}` : "/login") : f.to;
  const inner = (
    <div className="card pad" style={{
      borderColor: "var(--gold-border)", height: "100%",
      display: "flex", gap: 12, alignItems: "flex-start",
    }}>
      <span style={{ fontSize: 26, lineHeight: 1, flexShrink: 0 }} aria-hidden>{f.icon}</span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <b style={{ color: "var(--gold)", display: "block", fontSize: 15 }}>{t(f.nameKey)}</b>
        {/* Steve, 2026-10-19: "Make the white text readable... a little bolder." The dim grey
            was hardest to read on the phones, and the same line here was only a shade better
            over the artwork. Explicit rather than .muted, which is used site-wide. */}
        <span style={{ fontSize: 13, display: "block", marginTop: 3, color: "rgba(255,255,255,0.85)", fontWeight: 500 }}>{t(f.blurbKey)}</span>
        {/* Steve, 2026-10-19: "add all the links that you can to as many boxes that you can."
            Now that nearly every tile opens something, this line answers "where IS this?"
            rather than apologising for going nowhere — Bingg Bongg Bingo says "the live room"
            AND takes you to Live Now to find one. */}
        {f.whereKey && (
          <span style={{ fontSize: 12, color: "var(--gold)", opacity: 0.75, display: "block", marginTop: 6 }}>
            📱 {t(f.whereKey)}
          </span>
        )}
        {/* Room for the Watch video pill, which sits ON the card rather than in it: the card is
            inside the tile's link, and a button inside a link also follows the link. */}
        {video && <span style={{ display: "block", height: 42 }} aria-hidden />}
        {extras.length > 0 && <span style={{ display: "block", height: 42 }} aria-hidden />}
      </span>
      <span style={{
        flexShrink: 0, color: "var(--gold)", fontWeight: 700, fontSize: 15,
        border: "1px solid var(--gold-border)", borderRadius: 999, padding: "3px 10px",
        background: "rgba(0,0,0,0.9)", fontVariantNumeric: "tabular-nums",
      }}>#{FEATURE_NUMBER[f.nameKey]}</span>
    </div>
  );
  const tile = to
    ? <Link to={to} style={{ textDecoration: "none", display: "block", height: "100%" }}>{inner}</Link>
    : inner;
  if (!video && extras.length === 0) return tile;
  const pill: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 7, whiteSpace: "nowrap",
    background: "rgba(0,0,0,0.9)", color: "var(--gold)", fontWeight: 700, fontSize: 13,
    border: "2px solid var(--gold-border)", borderRadius: 999, padding: "6px 15px", cursor: "pointer",
  };
  return (
    <div style={{ position: "relative", height: "100%" }}>
      {tile}
      <div style={{ position: "absolute", left: 52, right: 14, bottom: 14, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
        {video && <button onClick={onWatch} style={pill}>▶ {t("watch_video")}</button>}
        {extras.length > 0 && (
          <div style={{ display: "flex", gap: 8, overflowX: "auto", maxWidth: "100%", scrollbarWidth: "none" }}>
            {extras.map((x) => (
              <button key={x.key} onClick={() => onWatchExtra?.(x.key)} style={pill}>▶ {x.label}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Full-screen player for one tile's video: plays with sound, the browser's own controls, a gold
 *  back button and the feature's name on top. Esc or the back button closes it. */
function FeatureVideoPlayer({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    // The bar sits ABOVE the video, not over it — over it, it covered the video's own logo.
    <div role="dialog" aria-modal="true" aria-label={title} style={{
      position: "fixed", inset: 0, zIndex: 2000, background: "#000",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <button onClick={onClose} aria-label="Back" style={{
          width: 40, height: 40, borderRadius: "50%", background: "#000", color: "var(--gold)",
          border: "2px solid var(--gold-border)", fontSize: 20, fontWeight: 700, cursor: "pointer", lineHeight: 1,
        }}>‹</button>
        <b style={{ color: "var(--gold)", fontSize: 17 }}>{title}</b>
      </div>
      <video src={url} controls autoPlay playsInline
        style={{ flex: 1, minHeight: 0, width: "100%", objectFit: "contain", background: "#000" }} />
    </div>
  );
}

export function FeaturesPage() {
  const { t, lang } = useT();
  // Feature Videos: tile key -> URL, in the member's language (English fallback on the server).
  const [videos, setVideos] = useState<Record<string, string>>({});
  const [playing, setPlaying] = useState<{ url: string; title: string } | null>(null);
  useEffect(() => {
    let live = true;
    fetchFeatureVideos(lang).then((v) => { if (live) setVideos(v); });
    return () => { live = false; };
  }, [lang]);
  // Steve, 2026-10-19: "Please add search on top of this page." Fifty-seven tiles is a lot to
  // scroll past when you already know what you are looking for. Matches the NAME and the
  // DESCRIPTION, both translated, so "coins" finds tiles that only mention coins in their blurb.
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const sections = q
    ? FEATURES.map((s) => ({
        ...s,
        features: s.features.filter(
          (f) => t(f.nameKey).toLowerCase().includes(q) || t(f.blurbKey).toLowerCase().includes(q),
        ),
      })).filter((s) => s.features.length > 0)
    : FEATURES;
  const total = sections.reduce((n, s) => n + s.features.length, 0);

  return (
    // Steve, 2026-10-18: "Please make it one banner at a time and not a 2 image thumbnail."
    // One column, and narrow enough that a banner still reads as a line of text rather than
    // stretching a dozen words across a desktop monitor. Same shape as the phones.
    <div className="page" style={{ maxWidth: 760 }}>
      <PageTitle backTo="/">{t("everything_bingg_bongg_does")}</PageTitle>
      {/* The plate comes from the stylesheet — see .cosmic-page .page > p.muted. */}
      <div style={{ position: "relative", marginBottom: 12 }}>
        <input
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          aria-label={t("search")}
          style={{ width: "100%", paddingRight: 36 }}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            aria-label={t("close")}
            style={{
              position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
              background: "none", border: 0, color: "var(--gold)", fontSize: 18, cursor: "pointer",
            }}
          >×</button>
        )}
      </div>
      <p className="muted" style={{ marginTop: -4 }}>
        {t("features_count_blurb", total)}
      </p>

      {sections.map((section) => (
        <div key={section.titleKey} style={{ marginTop: 22 }}>
          <h2 style={{ color: "var(--gold)", fontSize: 17, margin: "0 0 10px" }}>{t(section.titleKey)}</h2>
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 10,
          }}>
            {section.features.map((f) => (
              <Tile key={f.nameKey} f={f} video={videos[f.nameKey]}
                onWatch={() => setPlaying({ url: videos[f.nameKey], title: t(f.nameKey) })}
                extras={Object.keys(videos).filter((k) => k.startsWith(f.nameKey + "__")).sort()
                  .map((k) => ({ key: k, label: featureVideoLabels[k] ?? t("watch_video") }))}
                onWatchExtra={(k) => setPlaying({ url: videos[k], title: featureVideoLabels[k] ?? t(f.nameKey) })} />
            ))}
          </div>
        </div>
      ))}
      {playing && <FeatureVideoPlayer url={playing.url} title={playing.title} onClose={() => setPlaying(null)} />}
    </div>
  );
}
