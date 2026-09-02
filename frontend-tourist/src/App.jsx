import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LanguageProvider } from './i18n';
import { ToastProvider } from './components/Toast';
import OfflineIndicator from './components/OfflineIndicator';
import AppShell from './components/AppShell';
import Home from './pages/Home';
import Signup from './pages/Signup';
import Login from './pages/Login';
import Profile from './pages/Profile';
import ListingDetail from './pages/ListingDetail';
import MyActivity from './pages/MyActivity';
import Transfers from './pages/Transfers';
import Trips from './pages/Trips';
import Notifications from './pages/Notifications';
import Support from './pages/Support';
import EmergencyContacts from './pages/EmergencyContacts';
import LocalGuide from './pages/LocalGuide';
import Favorites from './pages/Favorites';
import Messages from './pages/Messages';
import FindAgent from './pages/FindAgent';
import Social from './pages/Social';
import SocialProfile from './pages/SocialProfile';
import SocialPost from './pages/SocialPost';
import SocialFriends from './pages/SocialFriends';

export default function App() {
  return (
    <LanguageProvider>
      <ToastProvider>
        <BrowserRouter>
          <OfflineIndicator />
          <Routes>
            {/* Auth screens and Home render their own headers — everything
                else renders inside AppShell, which puts the hamburger menu
                in the same fixed spot on every screen (fix #3). */}
            <Route path="/" element={<Home />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/login" element={<Login />} />

            <Route element={<AppShell />}>
              <Route path="/profile" element={<Profile />} />
              <Route path="/listing/:id" element={<ListingDetail />} />
              <Route path="/bookings" element={<MyActivity />} />
              <Route path="/transfers" element={<Transfers />} />
              <Route path="/trips" element={<Trips />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/support" element={<Support />} />
              <Route path="/emergency-contacts" element={<EmergencyContacts />} />
              <Route path="/local-guide" element={<LocalGuide />} />
              <Route path="/favorites" element={<Favorites />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/find-agent" element={<FindAgent />} />

              {/* Go Social (go-social-feature-brief.md) — built stage by
                  stage; the menu entry comes in the final stage. */}
              <Route path="/social" element={<Social />} />
              <Route path="/social/friends" element={<SocialFriends />} />
              {/* DMs live in the shared message bar's "Friends" tab now. */}
              <Route path="/social/messages" element={<Navigate to="/messages?tab=social" replace />} />
              <Route path="/social/me" element={<SocialProfile />} />
              <Route path="/social/u/:userId" element={<SocialProfile />} />
              <Route path="/social/post/:id" element={<SocialPost />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </LanguageProvider>
  );
}
