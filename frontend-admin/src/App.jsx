import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
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
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
