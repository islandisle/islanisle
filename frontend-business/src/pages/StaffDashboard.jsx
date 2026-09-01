import { useNavigate, Navigate } from 'react-router-dom';
import CheckInSection from '../components/CheckInSection';

function getStaffUser() {
  const raw = localStorage.getItem('atollisle_business_user');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed.role === 'staff' ? parsed : null;
  } catch {
    return null;
  }
}

// The entire staff-facing app: check-in, and nothing else. Front-desk
// staff were never meant to see the owner's financials, settings, or
// listings (see businessSettings.js's staff-login comment on why the
// backend enforces this too, not just this screen) — so rather than a
// cut-down copy of the owner Dashboard with things hidden, this is its
// own small page built around the one task the role exists for.
export default function StaffDashboard() {
  const navigate = useNavigate();
  const staff = getStaffUser();

  if (!staff) {
    return <Navigate to="/staff-login" replace />;
  }

  function handleLogout() {
    localStorage.removeItem('atollisle_business_token');
    localStorage.removeItem('atollisle_business_user');
    navigate('/staff-login');
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', margin: '0 0 2px' }}>
            {staff.business_name}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
            Signed in as {staff.name} · Front desk
          </p>
        </div>
        <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }} onClick={handleLogout}>
          Log out
        </button>
      </div>

      <CheckInSection businessId={staff.business_id} />
    </div>
  );
}
