import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import StaffLogin from './pages/StaffLogin';
import StaffDashboard from './pages/StaffDashboard';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Payouts from './pages/Payouts';
import Analytics from './pages/Analytics';
import B2B from './pages/B2B';
import GroupTransfers from './pages/GroupTransfers';
import Notifications from './pages/Notifications';
import Support from './pages/Support';
import { AmbientBackground } from './components/AmbientBackground';
import { LeafBackdrop } from './components/LeafBackdrop';

export default function App() {
  return (
    <BrowserRouter>
      {/* Same quiet background identity as the tourist app — see
          frontend-agent/src/App.jsx's identical comment for why type="all"
          and why both are rendered once here rather than per-page. */}
      <AmbientBackground type="all" />
      <LeafBackdrop />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/staff-login" element={<StaffLogin />} />
        <Route path="/staff-dashboard" element={<StaffDashboard />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/payouts" element={<Payouts />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/b2b" element={<B2B />} />
        <Route path="/group-transfers" element={<GroupTransfers />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/support" element={<Support />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}