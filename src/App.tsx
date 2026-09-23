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

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Nav />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/video/:id" element={<VideoPage />} />
          <Route path="/profile/:id" element={<ProfilePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/live" element={<LiveNowPage />} />
          <Route path="/live/:room" element={<LiveViewerPage />} />
          <Route path="/wallet" element={<WalletPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  );
}
