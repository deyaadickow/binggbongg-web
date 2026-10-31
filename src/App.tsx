import { BrowserRouter, Route, Routes } from "react-router-dom";
import { RouteMeta } from "./lib/seo";
import { SessionProvider } from "./lib/session";
import { LanguageProvider } from "./lib/i18n";
import { Nav } from "./components/Nav";
import { UploadVideoPage } from "./pages/UploadVideoPage";
import { GreenScreenPage } from "./pages/GreenScreenPage";
import { CreateVideoAdPage } from "./pages/CreateVideoAdPage";
import { UploadPhotosPage } from "./pages/UploadPhotosPage";
import { CartoonPage } from "./pages/CartoonPage";
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
import { HomePage } from "./pages/HomePage";
import { LanguagePage } from "./pages/LanguagePage";
import { FeaturesPage } from "./pages/FeaturesPage";
import { FeatureVideosPage } from "./pages/FeatureVideosPage";
import { ReferralProgramPage } from "./pages/ReferralProgramPage";
import { VipReferralPage } from "./pages/VipReferralPage";
import { FeaturedContestPage } from "./pages/FeaturedContestPage";
import { ExcitingNewsPage } from "./pages/ExcitingNewsPage";
import { BusinessPage, BusinessTabPage, CreateBusinessPage, MyBusinessesPage } from "./pages/BusinessPages";
import { LoginPage } from "./pages/LoginPage";
import { VideoPage } from "./pages/VideoPage";
import { ProfilePage } from "./pages/ProfilePage";
import { UpcomingPage } from "./pages/UpcomingPage";
import { MessagesPage } from "./pages/MessagesPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { ChatPage } from "./pages/ChatPage";
import { DailyFortunePage } from "./pages/DailyFortunePage";
import { BirthdayPage } from "./pages/BirthdayPage";
import { SupporterBreakdownPage, SupportersPage } from "./pages/SupportersPage";
import { SearchPage } from "./pages/SearchPage";
import { LiveNowPage } from "./pages/LiveNowPage";
import { MyShowPage, ShowsPage } from "./pages/ShowsPages";
import { VideoAdGigPage, MyVideoAdGigsPage } from "./pages/VideoAdGigPages";
import { CvCPage, CvCBattlePage } from "./pages/CvCPages";
import { LiveViewerPage } from "./pages/LiveViewerPage";
import { WalletPage } from "./pages/WalletPage";
import { GoLivePage } from "./pages/GoLivePage";
import { StreamFromPcPage } from "./pages/StreamFromPcPage";
import { Sidebar } from "./components/Sidebar";
import { AdReferralEarningsPage, AllVideosEarningsPage, PayoutHistoryPage, RedeemPage, RepostEarningsPage, RewardingActionsPage, StatementsPage } from "./pages/WalletPages";
import { PrintableAdsPage } from "./pages/PrintableAdsPage";
import { ShopPage, ShopProductPage } from "./pages/ShopPage";
import { AccountSettingsPage, AdvertisePage, BlockedProfilesPage, ComingSoonPage, ContestRequestsPage, DeleteAccountPage, FindABattlePage, ModeratorsPage, QrCodePage, ReferralsPage, SettingsHubPage, ShareProfilePage, SimulcastPage, SupportArchivePage, SupportPage, VirtualLookPage, MyVirtualBattlesPage, TermsOfUsePage, PrivacyPolicyPage, ContactUsPage, AboutUsPage, FaqPage, AppFeaturesPage, ToDoListPage } from "./pages/SettingsPages";
import { SellerPage } from "./pages/SellerPage";
import { AgentPage } from "./pages/AgentPage";
import { VaultPage } from "./pages/VaultPage";

export default function App() {
  return (
    <SessionProvider>
      <LanguageProvider>
      <BrowserRouter>
        <RouteMeta />
        <Nav />
        <div className="shell">
        <Sidebar />
        {/* Steve, 2026-10-17: "Please add our cosmic backgrounds to all pages." Applied ONCE
            here rather than to thirty page files: .cosmic-page's backdrop is position:fixed, so
            one element covers every route and nothing can be missed or drift later. */}
        <main className="content cosmic-page">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/exciting-news" element={<ExcitingNewsPage />} />
          <Route path="/business" element={<BusinessTabPage />} />
          <Route path="/business/:id" element={<BusinessPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/video/:id" element={<VideoPage />} />
          <Route path="/profile/:id" element={<ProfilePage />} />
          <Route path="/upcoming" element={<UpcomingPage />} />
          {/* Steve, 2026-10-11: direct messages — the same Firestore conversations the phones use. */}
          <Route path="/messages" element={<MessagesPage />} />
          {/* Steve, 2026-10-18: "Add the notification record so members can read it later." */}
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/messages/:id" element={<ChatPage />} />
          {/* Lucky numbers + daily horoscope (Steve, 2026-10-09). */}
          <Route path="/lucky" element={<DailyFortunePage />} />
          <Route path="/birthdays" element={<BirthdayPage />} />
          <Route path="/support" element={<SupportersPage />} />
          <Route path="/support/:id" element={<SupporterBreakdownPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/live" element={<LiveNowPage />} />
          {/* Your own live Bingg Bongg show (Steve, 2026-10-17). */}
          <Route path="/shows" element={<ShowsPage />} />
          <Route path="/my-show" element={<MyShowPage />} />
          {/* Video Ad Gig (Steve, 2026-10-17) — the feed tab, and both sides of a gig. */}
          <Route path="/gigs" element={<VideoAdGigPage />} />
          <Route path="/my-gigs" element={<MyVideoAdGigsPage />} />
          {/* CvC — country vs country (Steve, 2026-10-17). The board, and one battle. */}
          <Route path="/cvc" element={<CvCPage />} />
          <Route path="/cvc/:id" element={<CvCBattlePage />} />
          <Route path="/live/:room" element={<LiveViewerPage />} />
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
          <Route path="/settings/account" element={<AccountSettingsPage />} />
          <Route path="/settings/share" element={<ShareProfilePage />} />
          <Route path="/settings/qr" element={<QrCodePage />} />
          <Route path="/settings/referrals" element={<ReferralsPage />} />
          <Route path="/settings/contest-requests" element={<ContestRequestsPage />} />
          <Route path="/settings/blocked" element={<BlockedProfilesPage />} />
          <Route path="/settings/moderators" element={<ModeratorsPage />} />
          <Route path="/settings/find-a-battle" element={<FindABattlePage />} />
          <Route path="/settings/simulcast" element={<SimulcastPage />} />
          <Route path="/settings/virtual-look" element={<VirtualLookPage />} />
          <Route path="/settings/virtual-battles" element={<MyVirtualBattlesPage />} />
          <Route path="/settings/printable-ads" element={<PrintableAdsPage />} />
          <Route path="/settings/advertise" element={<AdvertisePage />} />
          <Route path="/settings/advertise/new" element={<CreateVideoAdPage />} />
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
          <Route path="/features" element={<FeaturesPage />} />
          {/* Every feature's 60-second video under its own heading (Steve, 2026-10-29). */}
          <Route path="/feature-videos" element={<FeatureVideosPage />} />
          <Route path="/referral-program" element={<ReferralProgramPage />} />
          <Route path="/vip-referral" element={<VipReferralPage />} />
          {/* The member's own notepad (Steve, 2026-10-19). */}
          <Route path="/settings/todo" element={<ToDoListPage />} />
          <Route path="/settings/vault" element={<VaultPage />} />
          <Route path="/settings/support" element={<SupportPage />} />
          <Route path="/settings/support/archive" element={<SupportArchivePage />} />
          <Route path="/settings/terms" element={<TermsOfUsePage />} />
          <Route path="/settings/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/settings/contact" element={<ContactUsPage />} />
          <Route path="/settings/about" element={<AboutUsPage />} />
          <Route path="/settings/faq" element={<FaqPage />} />
          <Route path="/settings/app-features" element={<AppFeaturesPage />} />
          <Route path="/settings/delete-account" element={<DeleteAccountPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
        </main>
        </div>
      </BrowserRouter>
      </LanguageProvider>
    </SessionProvider>
  );
}
