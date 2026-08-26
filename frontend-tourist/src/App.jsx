import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LanguageProvider } from './i18n';
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

export default function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/login" element={<Login />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/listing/:id" element={<ListingDetail />} />
          <Route path="/bookings" element={<MyActivity />} />
          <Route path="/transfers" element={<Transfers />} />
          <Route path="/trips" element={<Trips />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/support" element={<Support />} />
          <Route path="/emergency-contacts" element={<EmergencyContacts />} />
          <Route path="/local-guide" element={<LocalGuide />} />
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  );
}