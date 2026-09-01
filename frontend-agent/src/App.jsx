import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import { AmbientBackground } from './components/AmbientBackground';
import { LeafBackdrop } from './components/LeafBackdrop';

export default function App() {
  return (
    <BrowserRouter>
      {/* Same quiet background identity as the tourist app — a barely-there
          drifting wave pattern plus a tropical leaf backdrop in the
          corners. Both are fixed/pointer-events:none, so they render once
          here and sit behind every route rather than being added per-page.
          type="all" always, since this app has no category filter for
          AmbientBackground's other motifs to key off of. */}
      <AmbientBackground type="all" />
      <LeafBackdrop />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
