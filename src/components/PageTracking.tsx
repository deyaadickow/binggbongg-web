// Member page history (Steve, 2026-11-02): the router's half. Every route change becomes one row in
// the member's page history (lib/pageTracker.ts), named with the same snake_case screen names
// Android and iOS send, so the admin page reads the same whichever platform a member used.
//
// Routes whose subject is only known once the page has loaded (a profile's @username, a video's
// caption, a live room's host, who a chat is with, a feature's name) record the id here and wait
// for the page itself to supply the label with trackPage().
import { useEffect } from "react";
import { matchPath, useLocation } from "react-router-dom";
import { trackRoute, type RefType } from "../lib/pageTracker";
import { useSession } from "../lib/session";

interface ScreenRoute {
  path: string;
  screen: string;
  /** The route param that names the subject, and what kind of thing it is. */
  ref?: { param: string; type: RefType; awaitLabel?: boolean };
}

// Most specific first: matchPath takes the first hit.
const ROUTES: ScreenRoute[] = [
  // The feed and what it opens.
  { path: "/", screen: "feed_for_you" },
  { path: "/video/:id", screen: "video", ref: { param: "id", type: "video", awaitLabel: true } },
  // /profile/:id is profile_self when :id is the member themself — decided below.
  { path: "/profile/:id", screen: "profile", ref: { param: "id", type: "member", awaitLabel: true } },
  { path: "/search", screen: "search" },
  { path: "/upcoming", screen: "upcoming" },
  { path: "/exciting-news", screen: "exciting_news" },

  // Messages and notifications. Chat names the other member only, never what was said.
  { path: "/messages", screen: "inbox" },
  { path: "/messages/:id", screen: "chat", ref: { param: "id", type: "member", awaitLabel: true } },
  { path: "/notifications", screen: "notifications" },
  { path: "/announcements", screen: "announcements" },
  { path: "/announcements/:id", screen: "announcement" },

  // Live.
  { path: "/live", screen: "live_now" },
  { path: "/live/:room", screen: "live_room", ref: { param: "room", type: "live", awaitLabel: true } },
  { path: "/go-live", screen: "go_live" },
  { path: "/go-live/computer", screen: "go_live_computer" },
  { path: "/podcasts", screen: "podcasts" },
  { path: "/podcasts/start", screen: "podcast_start" },
  { path: "/podcasts/episode/:id", screen: "podcast_episode" },
  { path: "/battles", screen: "battles" },
  { path: "/pk-contests", screen: "pk_contests" },
  { path: "/country-battle", screen: "country_battle" },
  { path: "/country-battle/live/:dayId", screen: "country_battle_live" },
  { path: "/country-battle/board", screen: "country_battle_board" },
  { path: "/country-battle/board/:id", screen: "country_battle_board" },
  { path: "/country-board", screen: "country_board" },
  { path: "/cvc", screen: "cvc" },
  { path: "/cvc/:id", screen: "cvc_battle" },
  { path: "/shows", screen: "shows" },
  { path: "/my-show", screen: "my_show" },

  // The directory and the pages its tiles open.
  { path: "/features", screen: "features" },
  { path: "/feature/:slug", screen: "feature", ref: { param: "slug", type: "feature", awaitLabel: true } },
  { path: "/feature-videos", screen: "feature_videos" },
  { path: "/photos", screen: "photos" },
  { path: "/photos-directory", screen: "photos_directory" },
  { path: "/photos/:id", screen: "photo_album", ref: { param: "id", type: "member" } },
  { path: "/upload-photos", screen: "upload_photos" },
  { path: "/upload", screen: "upload_video" },
  { path: "/green-screen", screen: "green_screen" },
  { path: "/cartoon", screen: "cartoon" },
  { path: "/text-behind-photo", screen: "text_behind_photo" },
  { path: "/monster", screen: "monster" },
  { path: "/lucky", screen: "lucky_numbers" },
  { path: "/birthdays", screen: "birthdays" },
  { path: "/support", screen: "who_supported_me" },
  { path: "/support/:id", screen: "who_supported_me" },
  { path: "/my-analytics", screen: "my_analytics" },
  { path: "/gigs", screen: "video_ad_gigs" },
  { path: "/my-gigs", screen: "my_video_ad_gigs" },
  { path: "/referral-program", screen: "referral_program" },
  { path: "/ads-for-referrals", screen: "ads_for_referrals" },
  { path: "/pre-launch", screen: "pre_launch" },
  { path: "/vip-referral", screen: "vip_referral" },
  { path: "/help", screen: "help" },
  { path: "/help/start", screen: "help_start" },
  { path: "/help/:id", screen: "help" },
  { path: "/contests", screen: "contest" },
  { path: "/featured-contest", screen: "contest" },
  { path: "/contests/:id", screen: "contest", ref: { param: "id", type: "contest" } },
  { path: "/enter-contest", screen: "contest_entry" },
  { path: "/browse/categories", screen: "browse_categories" },
  { path: "/browse/favourite-categories", screen: "browse_favourite_categories" },
  { path: "/browse/category/:id", screen: "browse_category" },
  { path: "/browse/language", screen: "browse_language" },
  { path: "/browse/age", screen: "browse_age" },
  { path: "/browse/location", screen: "browse_location" },
  { path: "/browse/advertisers", screen: "browse_advertisers" },
  { path: "/browse/vip-badges", screen: "browse_vip_badges" },
  { path: "/browse/private-rooms", screen: "private_rooms" },

  // Business and the shop.
  { path: "/business", screen: "business" },
  { path: "/business/:id", screen: "business_page", ref: { param: "id", type: "business" } },
  { path: "/shop", screen: "shop" },
  { path: "/shop/showcase", screen: "shop_showcase" },
  { path: "/shop/showcase/:userId", screen: "shop_showcase", ref: { param: "userId", type: "member" } },
  { path: "/shop/product/:id", screen: "shop_product", ref: { param: "id", type: "product" } },
  { path: "/shop/seller", screen: "shop_seller" },
  { path: "/shop/agent", screen: "shop_agent" },
  { path: "/shop/orders", screen: "shop_orders" },
  { path: "/shop/earnings", screen: "shop_earnings" },

  // Wallet.
  { path: "/wallet", screen: "wallet" },
  { path: "/wallet/redeem", screen: "redeem" },
  { path: "/wallet/payout-history", screen: "payout_history" },
  { path: "/wallet/statements", screen: "statements" },
  { path: "/wallet/ad-referrals", screen: "wallet_ad_referrals" },
  { path: "/wallet/all-videos", screen: "wallet_all_videos" },
  { path: "/wallet/reposts", screen: "wallet_reposts" },
  { path: "/wallet/rewards", screen: "wallet_rewards" },

  // Settings. The bare hub is "settings"; its pages are settings_<page> unless the phones have a
  // name of their own for it.
  { path: "/settings", screen: "settings" },
  { path: "/settings/account", screen: "edit_profile" },
  { path: "/settings/reminders", screen: "my_reminders" },
  { path: "/settings/support", screen: "support" },
  { path: "/settings/support/archive", screen: "support" },
  { path: "/settings/shop", screen: "shop" },
  { path: "/settings/advertise", screen: "settings_advertise" },
  { path: "/settings/advertise/new", screen: "settings_advertise_new" },
  { path: "/settings/advertise/:id/analytics", screen: "ad_analytics" },
  { path: "/settings/business", screen: "settings_business" },
  { path: "/settings/business/new", screen: "settings_business_new" },
  { path: "/settings/business/edit/:id", screen: "settings_business_edit" },
  ...[
    "share", "qr", "referrals", "contest-requests", "blocked", "moderators", "find-a-battle",
    "simulcast", "virtual-look", "virtual-battles", "printable-ads", "verification", "language",
    "todo", "vault", "terms", "privacy", "contact", "about", "faq", "app-features", "delete-account",
  ].map((p) => ({ path: `/settings/${p}`, screen: `settings_${p.replace(/-/g, "_")}` })),

  // The ads' landing page. Signed-out visitors record nothing, so this is a member who came back
  // through an ad.
  { path: "/ph", screen: "landing" },
];

function screenFor(pathname: string, myId: string): { screen: string; refType?: RefType; refId?: string; awaitLabel?: boolean } | null {
  if (pathname === "/login") return null; // nobody signed in to record
  for (const r of ROUTES) {
    const m = matchPath({ path: r.path, end: true }, pathname);
    if (!m) continue;
    if (!r.ref) return { screen: r.screen };
    const refId = m.params[r.ref.param];
    if (!refId) return { screen: r.screen };
    if (r.path === "/profile/:id" && refId === myId) return { screen: "profile_self" };
    return { screen: r.screen, refType: r.ref.type, refId: decodeURIComponent(refId), awaitLabel: r.ref.awaitLabel };
  }
  return { screen: "other" };
}

/** Mounted once inside the router. Records each page a signed-in member opens. */
export function PageTracking() {
  const { pathname } = useLocation();
  // Keyed on the id, never the user object: the session replaces the object on every balance
  // refresh, and that must not count as opening the page again.
  const { user, token } = useSession();
  const myId = user && token ? String(user.id) : "";
  useEffect(() => {
    if (!myId) return;
    const s = screenFor(pathname.replace(/\/+$/, "") || "/", myId);
    if (s) trackRoute(s.screen, s.refType, s.refId, s.awaitLabel);
  }, [pathname, myId]);
  return null;
}
