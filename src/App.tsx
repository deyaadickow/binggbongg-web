import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { RouteMeta } from "./lib/seo";
import { SessionProvider } from "./lib/session";
import { LanguageProvider } from "./lib/i18n";
import { Nav } from "./components/Nav";
import { UploadVideoPage } from "./pages/UploadVideoPage";
import { GreenScreenPage } from "./pages/GreenScreenPage";
import { SoundPage } from "./pages/SoundPage";
import { RemixRecorderPage } from "./pages/RemixRecorderPage";
import { EditorPage } from "./pages/EditorPage";
import { TextPostPage } from "./pages/TextPostPage";
import { SlideshowPage } from "./pages/SlideshowPage";
import { MySongsPage, SharedSongPage, SongPage, SongQuestionsPage, SongStartPage, SongVideoPage } from "./pages/SongPages";
import { AdPage, AdQuestionsPage, AdStartPage, MyAdsPage, SharedAdPage } from "./pages/AdMakerPages";
import { CreateVideoAdPage } from "./pages/CreateVideoAdPage";
import { UploadPhotosPage } from "./pages/UploadPhotosPage";
import { CartoonPage } from "./pages/CartoonPage";
import { TextBehindPhotoPage } from "./pages/TextBehindPhotoPage";
import { MonsterPage } from "./pages/MonsterPage";
import { MyPhotosPage } from "./pages/MyPhotosPage";
import { PhotosDirectoryPage } from "./pages/PhotosDirectoryPage";
// The eight ways of browsing the feed the phones have always had (Steve, 2026-10-20).
import {
  AdvertisersPage, ByAgeGroupPage, ByLanguagePage, ByLocationPage, CategoriesPage,
  CategoryVideosPage, FavouriteCategoriesPage, PrivateRoomsPage, VipVoterBadgesPage,
} from "./pages/BrowsePages";
import { MemberAlbumPage } from "./pages/MemberAlbumPage";
import { ContestUploadPage } from "./pages/ContestUploadPage";
import { ContestsPage, ContestBoardPage } from "./pages/ContestsPage";
import { HelpListPage, HelpCampaignPage, StartHelpPage } from "./pages/HelpPages";
import { AddYoursPage, StoriesPage } from "./pages/SocialPages";
import { DraftsPage } from "./pages/DraftsPage";
import { HomePage } from "./pages/HomePage";
import { LanguagePage } from "./pages/LanguagePage";
import { FeaturesPage } from "./pages/FeaturesPage";
import { FreeCoinsPage } from "./pages/FreeCoinsPage";
import { PrelaunchPage } from "./pages/PrelaunchPage";
import { HousesPage } from "./pages/HousesPage";
import { FeatureVideosPage } from "./pages/FeatureVideosPage";
import { OneVideoPage } from "./pages/OneVideoPage";
import { ReferralProgramPage } from "./pages/ReferralProgramPage";
import { FeaturedContestPage } from "./pages/FeaturedContestPage";
import { ExcitingNewsPage } from "./pages/ExcitingNewsPage";
import { InformationCenterPage } from "./pages/InformationCenterPage";
import { BusinessPage, BusinessTabPage, CreateBusinessPage, MyBusinessesPage } from "./pages/BusinessPages";
import { LoginPage } from "./pages/LoginPage";
import { VideoPage } from "./pages/VideoPage";
import { ProfilePage } from "./pages/ProfilePage";
import { UpcomingPage } from "./pages/UpcomingPage";
import { MessagesPage } from "./pages/MessagesPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { AnnouncementsPage } from "./pages/AnnouncementsPage";
import { ChatPage } from "./pages/ChatPage";
import { DailyFortunePage } from "./pages/DailyFortunePage";
import { BirthdayPage } from "./pages/BirthdayPage";
import { SupporterBreakdownPage, SupportersPage } from "./pages/SupportersPage";
import { MyAnalyticsPage } from "./pages/MyAnalyticsPage";
import { MemberBadgesPage } from "./pages/MemberBadgesPage";
import { PostAnalyticsPage } from "./pages/PostAnalyticsPage";
import { AdAnalyticsPage } from "./pages/AdAnalyticsPage";
import { LandingPage } from "./pages/LandingPage";
import { useEffect, type ReactNode } from "react";
import { post } from "./lib/api";
import { pixelPageView } from "./lib/pixel";
import { DiscoverPage, FilterKeywordsPage, HashtagPage, TopicPage } from "./pages/FindingPages";
import { SearchPage } from "./pages/SearchPage";
import { LiveNowPage, LiveVideoPage } from "./pages/LiveNowPage";
import { MyShowPage, ShowsPage } from "./pages/ShowsPages";
import { VideoAdGigPage, MyVideoAdGigsPage } from "./pages/VideoAdGigPages";
import { CvCPage, CvCBattlePage } from "./pages/CvCPages";
import { LiveViewerRoute } from "./pages/LiveViewerPage";
import { MySeriesPage, ScheduledPage, SeriesEditPage, SeriesPage, SubscriptionsPage } from "./pages/CreatorPages";
import { FamilyPairingPage, FamilyTeenPage, RestrictedModePage, ScreenTimePage } from "./pages/WellbeingPages";
import { WellbeingGate } from "./components/Wellbeing";
import { WalletPage } from "./pages/WalletPage";
import { GoLivePage } from "./pages/GoLivePage";
import { StreamFromPcPage } from "./pages/StreamFromPcPage";
import { Sidebar } from "./components/Sidebar";
import { InboxCountsSync } from "./components/InboxCountsSync";
import { AdReferralEarningsPage, AllVideosEarningsPage, PayoutHistoryPage, RedeemPage, RepostEarningsPage, RewardingActionsPage, StatementsPage } from "./pages/WalletPages";
import { PrintableAdsPage } from "./pages/PrintableAdsPage";
import { ShopPage, ShopProductPage } from "./pages/ShopPage";
import { MyRemindersPage } from "./pages/MyRemindersPage";
import { AccountSettingsPage, AdvertisePage, BlockedProfilesPage, MessagesFromMembersPage, ComingSoonPage, ContestRequestsPage, DeleteAccountPage, FindABattlePage, ModeratorsPage, QrCodePage, ReferralsPage, SettingsHubPage, ShareProfilePage, SimulcastPage, SupportArchivePage, SupportPage, VirtualLookPage, MyVirtualBattlesPage, TermsOfUsePage, PrivacyPolicyPage, ContactUsPage, AboutUsPage, SafetyCenterPage, FaqPage, AppFeaturesPage, ToDoListPage } from "./pages/SettingsPages";
import { SellerPage } from "./pages/SellerPage";
import { AgentPage } from "./pages/AgentPage";
import { VaultPage } from "./pages/VaultPage";
import { GetAppBar } from "./components/GetAppBar";
import { FallbackBack } from "./components/FallbackBack";
import { BattlesPage } from "./pages/BattlesPage";
import { LiveFeaturePage } from "./pages/LiveFeaturePage";
import { PkContestsPage } from "./pages/PkContestsPage";
import { CountryBattleBoardPage, CountryBattleDayPage, CountryBattlePage } from "./pages/CountryBattlePages";
import { CountryBattleLivePage } from "./pages/CountryBattleLivePage";
import { AllCountryBattlesPage } from "./pages/AllCountryBattlesPage";
import { CountryLandingPage } from "./pages/CountryLandingPage";
import { CountryBoardPage } from "./pages/CountryBoardPage";
import { AdsForReferralsPage } from "./pages/AdsForReferralsPage";
import { InvitePage } from "./pages/InvitePage";
import { ChatBattleLivePage } from "./pages/ChatBattleLivePage";
import { rememberAdSource } from "./lib/getApp";
import { PageTracking } from "./components/PageTracking";
import { SignupNudges } from "./components/SignupNudges";
import { VerifyEmailModal } from "./components/VerifyEmailModal";
import { PodcastEpisodePage, PodcastsPage, StartPodcastPage } from "./pages/PodcastPages";
import { PodcastPlayerProvider } from "./lib/podcastPlayer";
import { PodcastMiniBar } from "./components/PodcastBits";
import SplashIntro from "./components/SplashIntro";
import { SignupWall } from "./components/SignupWall";
import { GoldDiggerManager } from "./components/GoldDigger";
import { FeedAssistantHost } from "./components/FeedAssistant";
import { GoldDiggerPage } from "./pages/GoldDiggerPage";

/** The ads' landing page (/ph) stands alone — no menu, no sidebar, nothing but the contest and the
 *  download button (Steve, 2026-10-31). Everything else gets the normal site. */
function LandingSwitch({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return pathname.replace(/\/+$/, "") === "/ph" ? <LandingPage /> : <>{children}</>;
}

/** Someone arriving on the website from one of our ads (Facebook adds fbclid, TikTok ttclid; our own links add
 *  src) is counted once per visit as "Ad → our website" on the admin dashboard (AdLinkController).
 *  Also tells the Meta Pixel about every page as the visitor moves around. */
function AdArrival() {
  const { pathname } = useLocation();
  useEffect(() => { pixelPageView(); }, [pathname]);
  useEffect(() => {
    let q: URLSearchParams;
    try { q = new URLSearchParams(window.location.search); } catch { return; }
    const fbclid = q.get("fbclid");
    const ttclid = q.get("ttclid"); // TikTok's click id (Steve, 2026-11-23)
    const src = q.get("src") || q.get("utm_campaign") || (ttclid ? "tiktok" : "");
    // Kept for the visit's store links (GetAppBar, the sign-in page), so an install is credited to its ad.
    rememberAdSource((src || (fbclid ? "facebook" : "")).toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 60));
    if (window.location.pathname.replace(/\/+$/, "") === "/ph") return; // the landing page counts itself
    if (!fbclid && !src && !q.get("utm_source")) return;
    try {
      if (sessionStorage.getItem("bb.adArrival") === "1") return;
      sessionStorage.setItem("bb.adArrival", "1");
    } catch { /* private mode: count it anyway */ }
    post("recordAdLinkEvent", { event: "website", src, ...(fbclid ? { fbclid } : {}) }).catch(() => undefined);
  }, []);
  return null;
}

export default function App() {
  return (
    <SessionProvider>
      <LanguageProvider>
      {/* Bingg Bongg Podcast (2026-11-10): one audio player above the routes, so an episode keeps
          playing while the member browses. */}
      <PodcastPlayerProvider>
      <BrowserRouter>
        <SplashIntro />
        <RouteMeta />
        <AdArrival />
        {/* Member page history (Steve, 2026-11-02): one row per page a signed-in member opens. */}
        <PageTracking />
        {/* Inbox counts (2026-11-10): one loader for the tabs and the header's "Inbox (N)". */}
        <InboxCountsSync />
        {/* Safety and wellbeing (Steve, 2026-11-17): the one screen-time tracker (visible tab only)
            and its Time's up / Take a break pages, over every route. */}
        <WellbeingGate />
        {/* Gold Digger (Steve, 2026-11-17: "Find gold where ever you are on the app. On any page on any
            live stream, on any battle, at any time."): one manager, the nugget over every route. */}
        <GoldDiggerManager />
        {/* Bingg Bongg AI Assistant (Steve, 2026-11-18): the Bingg / Bongg icon on the Home feed + its
            popup of questions whose YES opens that feature. */}
        <FeedAssistantHost />
        {/* The sign-up wall (Steve, 2026-11-17: "If they install and don't signup they are not
            allowed to go in the app."). Signed out, only lib/publicRoutes.ts's pages open;
            every other address shows the sign-up screen alone. Unverified email: "Check your email". */}
        <SignupWall>
        <LandingSwitch>
        <Nav />
        <div className="shell">
        <Sidebar />
        {/* Steve, 2026-10-17: "Please add our cosmic backgrounds to all pages." Applied ONCE
            here rather than to thirty page files: .cosmic-page's backdrop is position:fixed, so
            one element covers every route and nothing can be missed or drift later. */}
        <main className="content cosmic-page">
        <FallbackBack />
        {/* Easy sign-up (Steve, 2026-11-03): the later, dismissible "verify your email" and
            "add your name & photo" reminders. The wall itself is SignupWall above. */}
        <SignupNudges />
        <VerifyEmailModal />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/exciting-news" element={<ExcitingNewsPage />} />
          <Route path="/business" element={<BusinessTabPage />} />
          <Route path="/business/:id" element={<BusinessPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/video/:id" element={<VideoPage />} />
          <Route path="/video/:id/analytics" element={<PostAnalyticsPage />} />
          {/* Social (Steve, 2026-11-17): Stories and the "Add Yours" chains. */}
          <Route path="/stories" element={<StoriesPage />} />
          <Route path="/add-yours/:id" element={<AddYoursPage />} />
          {/* Drafts (Steve, 2026-11-17): videos saved on this browser to post later. */}
          <Route path="/drafts" element={<DraftsPage />} />
          {/* Creators and money (Steve, 2026-11-17): subscriptions, paid series, scheduled posts. */}
          <Route path="/subscriptions" element={<SubscriptionsPage />} />
          <Route path="/series" element={<MySeriesPage />} />
          <Route path="/series/new" element={<SeriesEditPage />} />
          <Route path="/series/:id/edit" element={<SeriesEditPage />} />
          <Route path="/series/:id" element={<SeriesPage />} />
          <Route path="/scheduled" element={<ScheduledPage />} />
          <Route path="/profile/:id" element={<ProfilePage />} />
          <Route path="/upcoming" element={<UpcomingPage />} />
          {/* Steve, 2026-10-11: direct messages — the same Firestore conversations the phones use. */}
          <Route path="/messages" element={<MessagesPage />} />
          {/* Steve, 2026-10-18: "Add the notification record so members can read it later." */}
          <Route path="/notifications" element={<NotificationsPage />} />
          {/* Steve, 2026-11-09: Inbox -> Announcements, the daily video announcement (English + Tagalog).
              /announcements/:id opens that announcement's video directly — the emails link there. */}
          <Route path="/announcements" element={<AnnouncementsPage />} />
          <Route path="/announcements/:id" element={<AnnouncementsPage />} />
          <Route path="/messages/:id" element={<ChatPage />} />
          {/* Lucky numbers + daily horoscope (Steve, 2026-10-09). */}
          <Route path="/lucky" element={<DailyFortunePage />} />
          <Route path="/birthdays" element={<BirthdayPage />} />
          <Route path="/support" element={<SupportersPage />} />
          <Route path="/support/:id" element={<SupporterBreakdownPage />} />
          {/* My Analytics (Steve, 2026-10-31: "Can we add analytics for all members?"). */}
          <Route path="/my-analytics" element={<MyAnalyticsPage />} />
          <Route path="/badges/:id" element={<MemberBadgesPage />} />
          <Route path="/search" element={<SearchPage />} />
          {/* Finding videos (Steve, 2026-11-16): Discover, a hashtag's videos, a topic's videos, Filter keywords. */}
          <Route path="/discover" element={<DiscoverPage />} />
          <Route path="/hashtag/:tag" element={<HashtagPage />} />
          <Route path="/topic/:id" element={<TopicPage />} />
          <Route path="/settings/filter-keywords" element={<FilterKeywordsPage />} />
          <Route path="/live" element={<LiveNowPage />} />
          {/* Steve, 2026-11-01: the directory's live-room tiles open their own pages, not an empty Live Now. */}
          <Route path="/battles" element={<BattlesPage />} />
          <Route path="/pk-contests" element={<PkContestsPage />} />
          {/* Country Battle v2 (Steve, 2026-11-03) — the page, the daily battle screen, the lifetime
              Bragging Rights board (every day) and one day's top 100. */}
          <Route path="/country-battle" element={<CountryBattlePage />} />
          {/* All Country Battles (Steve, 2026-11-16): every country's battle, search on top, watch any. */}
          <Route path="/country-battles" element={<AllCountryBattlesPage key="all" />} />
          {/* The same page on its Country VS Country chip — its own address so the sidebar lights the right button. */}
          <Route path="/country-vs-country" element={<AllCountryBattlesPage key="vs" startKind="rival" />} />
          <Route path="/country-battle/live/:dayId" element={<CountryBattleLivePage />} />
          <Route path="/country-battle/board" element={<CountryBattleBoardPage />} />
          <Route path="/country-battle/board/:id" element={<CountryBattleDayPage />} />
          {/* A country's page for search (2026-11-23): /country-battle/philippines. The fixed paths above win. */}
          <Route path="/country-battle/:slug" element={<CountryLandingPage />} />
          {/* Country Board (Steve, 2026-11-11): every country's points, "your country is losing to X". */}
          <Route path="/country-board" element={<CountryBoardPage />} />
          {/* Chat Battle (#9, Steve 2026-11-03) — the shared 24-tile battle screen. */}
          <Route path="/chat-battle/:contestId" element={<ChatBattleLivePage />} />
          <Route path="/feature/:slug" element={<LiveFeaturePage />} />
          {/* Bingg Bongg Podcast (Steve, 2026-11-10). */}
          <Route path="/podcasts" element={<PodcastsPage />} />
          <Route path="/podcasts/start" element={<StartPodcastPage />} />
          <Route path="/podcasts/episode/:id" element={<PodcastEpisodePage />} />
          {/* Your own live Bingg Bongg show (Steve, 2026-10-17). */}
          <Route path="/shows" element={<ShowsPage />} />
          <Route path="/my-show" element={<MyShowPage />} />
          {/* Video Ad Gig (Steve, 2026-10-17) — the feed tab, and both sides of a gig. */}
          <Route path="/gigs" element={<VideoAdGigPage />} />
          <Route path="/my-gigs" element={<MyVideoAdGigsPage />} />
          {/* CvC — country vs country (Steve, 2026-10-17). The board, and one battle. */}
          <Route path="/cvc" element={<CvCPage />} />
          <Route path="/cvc/:id" element={<CvCBattlePage />} />
          <Route path="/live/:room" element={<LiveViewerRoute />} />
          {/* A Live Section Video reached by the feed Live button's swipe (Steve, 2026-11-12). */}
          <Route path="/live-video/:id" element={<LiveVideoPage />} />
          <Route path="/wallet" element={<WalletPage />} />
          <Route path="/wallet/redeem" element={<RedeemPage />} />
          <Route path="/wallet/payout-history" element={<PayoutHistoryPage />} />
          <Route path="/wallet/statements" element={<StatementsPage />} />
          <Route path="/wallet/ad-referrals" element={<AdReferralEarningsPage />} />
          <Route path="/wallet/all-videos" element={<AllVideosEarningsPage />} />
          <Route path="/wallet/reposts" element={<RepostEarningsPage />} />
          <Route path="/wallet/rewards" element={<RewardingActionsPage />} />
          <Route path="/go-live" element={<GoLivePage />} />
          <Route path="/go-live/computer" element={<StreamFromPcPage />} />
          <Route path="/upload" element={<UploadVideoPage />} />
          <Route path="/green-screen" element={<GreenScreenPage />} />
          <Route path="/sound/:id" element={<SoundPage />} />
          <Route path="/record/:mode/:id" element={<RemixRecorderPage />} />
          <Route path="/editor" element={<EditorPage />} />
          <Route path="/text-post" element={<TextPostPage />} />
          <Route path="/slideshow" element={<SlideshowPage />} />
          {/* Bingg Bongg Song (Steve, 2026-11-16): the member's songs, and the public share page. */}
          <Route path="/bingg-bongg-song" element={<SongStartPage />} />
          <Route path="/bingg-bongg-song/new" element={<SongQuestionsPage />} />
          <Route path="/bingg-bongg-song/my" element={<MySongsPage />} />
          <Route path="/bingg-bongg-song/:id" element={<SongPage />} />
          <Route path="/bingg-bongg-song/:id/video" element={<SongVideoPage />} />
          <Route path="/song/:code" element={<SharedSongPage />} />
          {/* Bingg Bongg Video Ad (Steve, 2026-11-17): the member's 60-second ads, and the public ad page. */}
          <Route path="/bingg-bongg-video-ad" element={<AdStartPage />} />
          <Route path="/bingg-bongg-video-ad/new" element={<AdQuestionsPage />} />
          <Route path="/bingg-bongg-video-ad/my" element={<MyAdsPage />} />
          <Route path="/bingg-bongg-video-ad/:id" element={<AdPage />} />
          <Route path="/bingg-bongg-video-ad/:id/edit" element={<AdQuestionsPage edit />} />
          <Route path="/ad/:code" element={<SharedAdPage />} />
          <Route path="/photos" element={<MyPhotosPage />} />
          <Route path="/photos-directory" element={<PhotosDirectoryPage />} />

          {/* Browsing the feed. Each of these is the web half of a chip on the phones' home
              feed, so the Bingg Bongg Features tile that names it opens the same thing on
              every platform. */}
          <Route path="/browse/categories" element={<CategoriesPage />} />
          <Route path="/browse/favourite-categories" element={<FavouriteCategoriesPage />} />
          <Route path="/browse/category/:id" element={<CategoryVideosPage />} />
          <Route path="/browse/language" element={<ByLanguagePage />} />
          <Route path="/browse/age" element={<ByAgeGroupPage />} />
          <Route path="/browse/location" element={<ByLocationPage />} />
          <Route path="/browse/advertisers" element={<AdvertisersPage />} />
          <Route path="/browse/vip-badges" element={<VipVoterBadgesPage />} />
          <Route path="/browse/private-rooms" element={<PrivateRoomsPage />} />
          <Route path="/photos/:id" element={<MemberAlbumPage />} />
          <Route path="/upload-photos" element={<UploadPhotosPage />} />
          {/* Cartoon Me (Steve, 2026-10-12) */}
          <Route path="/cartoon" element={<CartoonPage />} />
          <Route path="/text-behind-photo" element={<TextBehindPhotoPage />} />
          <Route path="/monster" element={<MonsterPage />} />
          <Route path="/enter-contest" element={<ContestUploadPage />} />
          {/* The board the site never had. Open to everyone, every country — entering is the
              only country-locked half, and that lives on /enter-contest. */}
          {/* Help (Steve, 2026-10-23). /help/start is reached from Settings, as he specified;
              the tab in the directory and the feed cards both land on /help. */}
          <Route path="/help" element={<HelpListPage />} />
          <Route path="/help/start" element={<StartHelpPage />} />
          <Route path="/help/:id" element={<HelpCampaignPage />} />
          <Route path="/contests" element={<ContestsPage />} />
          <Route path="/featured-contest" element={<FeaturedContestPage />} />
          <Route path="/contests/:id" element={<ContestBoardPage />} />
          <Route path="/settings" element={<SettingsHubPage />} />
          {/* Safety and wellbeing (Steve, 2026-11-17). */}
          <Route path="/settings/screen-time" element={<ScreenTimePage />} />
          <Route path="/settings/restricted-mode" element={<RestrictedModePage />} />
          <Route path="/settings/family-pairing" element={<FamilyPairingPage />} />
          <Route path="/settings/family-pairing/teen/:id" element={<FamilyTeenPage />} />
          <Route path="/settings/account" element={<AccountSettingsPage />} />
          <Route path="/settings/share" element={<ShareProfilePage />} />
          <Route path="/settings/qr" element={<QrCodePage />} />
          <Route path="/settings/referrals" element={<ReferralsPage />} />
          <Route path="/settings/contest-requests" element={<ContestRequestsPage />} />
          <Route path="/settings/blocked" element={<BlockedProfilesPage />} />
          <Route path="/settings/messages" element={<MessagesFromMembersPage />} />
          <Route path="/settings/moderators" element={<ModeratorsPage />} />
          <Route path="/settings/find-a-battle" element={<FindABattlePage />} />
          <Route path="/settings/simulcast" element={<SimulcastPage />} />
          <Route path="/settings/virtual-look" element={<VirtualLookPage />} />
          <Route path="/settings/virtual-battles" element={<MyVirtualBattlesPage />} />
          <Route path="/settings/reminders" element={<MyRemindersPage />} />
          <Route path="/settings/printable-ads" element={<PrintableAdsPage />} />
          <Route path="/settings/advertise" element={<AdvertisePage />} />
          <Route path="/settings/advertise/new" element={<CreateVideoAdPage />} />
          <Route path="/settings/advertise/:id/analytics" element={<AdAnalyticsPage />} />
          <Route path="/settings/business" element={<MyBusinessesPage />} />
          <Route path="/settings/business/new" element={<CreateBusinessPage />} />
          <Route path="/settings/business/edit/:id" element={<CreateBusinessPage />} />
          {/* Bingg Bongg Shop — the marketplace (Steve, 2026-10-15). */}
          <Route path="/shop" element={<ShopPage tab="shop" />} />
          <Route path="/shop/showcase" element={<ShopPage tab="showcase" />} />
          {/* The two business-side portals (Steve, 2026-10-16). Both are desk work — loading a
              catalogue, working through a day's orders — so they live on the web. */}
          <Route path="/shop/seller" element={<SellerPage />} />
          <Route path="/shop/agent" element={<AgentPage />} />
          <Route path="/shop/orders" element={<ShopPage tab="orders" />} />
          <Route path="/shop/earnings" element={<ShopPage tab="earnings" />} />
          <Route path="/shop/showcase/:userId" element={<ShopPage />} />
          <Route path="/shop/product/:id" element={<ShopProductPage />} />
          <Route path="/settings/shop" element={<ShopPage tab="shop" />} />
          <Route path="/settings/verification" element={<ComingSoonPage titleKey="request_verification" noteKey="verification_note" />} />
          <Route path="/settings/language" element={<LanguagePage />} />
          {/* The feature directory (Steve, 2026-10-18) — one tile per feature, grouped. */}
          {/* Build Your Houses (Steve, 2026-11-05): your own houses, anyone's, and the boards. */}
          <Route path="/houses" element={<HousesPage />} />
          <Route path="/houses/:userId" element={<HousesPage />} />
          <Route path="/features" element={<FeaturesPage />} />
          {/* Gold Digger (Steve, 2026-11-17): the monthly board + Hall of Fame. Open signed out too. */}
          <Route path="/gold-digger" element={<GoldDiggerPage />} />
          <Route path="/free-coins" element={<FreeCoinsPage />} />
          {/* Pre-Launch Special (Steve, 2026-11-10; 2026-11-11: 100 FBBs for every member, no refill). */}
          <Route path="/pre-launch" element={<PrelaunchPage />} />
          {/* Every feature's 60-second video under its own heading (Steve, 2026-10-29). */}
          {/* Information Center (Steve, 2026-11-17): the one button on the feed leads here. */}
          <Route path="/information-center" element={<InformationCenterPage />} />
          <Route path="/feature-videos" element={<FeatureVideosPage />} />
          <Route path="/our-ads" element={<FeatureVideosPage kind="ads" />} />
          <Route path="/one-video" element={<OneVideoPage />} />
          <Route path="/referral-program" element={<ReferralProgramPage />} />
          {/* Ads for Referrals (Steve, 2026-11-11): downloadable video ads + the $100 offer video. */}
          <Route path="/ads-for-referrals" element={<AdsForReferralsPage />} />
          <Route path="/invite/:code" element={<InvitePage />} />
          {/* VIP Referral Members ended 2026-11-14: everyone gets up to $100 now, so old links go to the Referral Program. */}
          <Route path="/vip-agent" element={<Navigate to="/referral-program" replace />} />
          <Route path="/vip-referral" element={<Navigate to="/referral-program" replace />} />
          {/* The member's own notepad (Steve, 2026-10-19). */}
          <Route path="/settings/todo" element={<ToDoListPage />} />
          <Route path="/settings/vault" element={<VaultPage />} />
          <Route path="/settings/support" element={<SupportPage />} />
          <Route path="/settings/support/archive" element={<SupportArchivePage />} />
          <Route path="/settings/terms" element={<TermsOfUsePage />} />
          <Route path="/settings/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/settings/contact" element={<ContactUsPage />} />
          <Route path="/settings/about" element={<AboutUsPage />} />
          <Route path="/settings/safety" element={<SafetyCenterPage />} />
          <Route path="/safety" element={<SafetyCenterPage />} />
          <Route path="/settings/faq" element={<FaqPage />} />
          <Route path="/settings/app-features" element={<AppFeaturesPage />} />
          <Route path="/settings/delete-account" element={<DeleteAccountPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
        </main>
        </div>
        </LandingSwitch>
        </SignupWall>
        <PodcastMiniBar />
        <GetAppBar />
      </BrowserRouter>
      </PodcastPlayerProvider>
      </LanguageProvider>
    </SessionProvider>
  );
}
