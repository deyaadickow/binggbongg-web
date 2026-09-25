import { BrowserRouter, Route, Routes } from "react-router-dom";
import { SessionProvider } from "./lib/session";
import { Nav } from "./components/Nav";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { VideoPage } from "./pages/VideoPage";
import { ProfilePage } from "./pages/ProfilePage";
import { SearchPage } from "./pages/SearchPage";
import { LiveNowPage } from "./pages/LiveNowPage";
import { LiveViewerPage } from "./pages/LiveViewerPage";
import { WalletPage } from "./pages/WalletPage";
import { GoLivePage } from "./pages/GoLivePage";
import { Sidebar } from "./components/Sidebar";
import { AdReferralEarningsPage, AllVideosEarningsPage, PayoutHistoryPage, RedeemPage, RepostEarningsPage, RewardingActionsPage, StatementsPage } from "./pages/WalletPages";
import { AccountSettingsPage, AdvertisePage, BlockedProfilesPage, ComingSoonPage, ContestRequestsPage, DeleteAccountPage, FindABattlePage, ModeratorsPage, QrCodePage, ReferralsPage, SettingsHubPage, ShareProfilePage, SimulcastPage, SupportPage, TermsOfUsePage, PrivacyPolicyPage, ContactUsPage, AboutUsPage } from "./pages/SettingsPages";

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Nav />
        <div className="shell">
        <Sidebar />
        <main className="content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/video/:id" element={<VideoPage />} />
          <Route path="/profile/:id" element={<ProfilePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/live" element={<LiveNowPage />} />
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
          <Route path="/settings/advertise" element={<AdvertisePage />} />
          <Route path="/settings/shop" element={<ComingSoonPage title="Bingg Bongg Shop" note="Products from members and partners, right inside Bingg Bongg." />} />
          <Route path="/settings/verification" element={<ComingSoonPage title="Request verification" note="Send your ID and a selfie to get the verified badge." />} />
          <Route path="/settings/language" element={<ComingSoonPage title="Change language" note="The web app is in English for now. The phone apps speak 53 languages." />} />
          <Route path="/settings/support" element={<SupportPage />} />
          <Route path="/settings/terms" element={<TermsOfUsePage />} />
          <Route path="/settings/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/settings/contact" element={<ContactUsPage />} />
          <Route path="/settings/about" element={<AboutUsPage />} />
          <Route path="/settings/delete-account" element={<DeleteAccountPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
        </main>
        </div>
      </BrowserRouter>
    </SessionProvider>
  );
}
