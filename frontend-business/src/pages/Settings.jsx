import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getSettings, updateSettings } from '../api/client';
import { useTheme } from '../theme';

export default function Settings() {
  const navigate = useNavigate();
  const [business] = useState(() => {
    const saved = localStorage.getItem('atollisle_business');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [name, setName] = useState('');
  const [locationIsland, setLocationIsland] = useState('');
  const [refundFeeBusinessPercent, setRefundFeeBusinessPercent] = useState('');
  const [notificationPreferences, setNotificationPreferences] = useState({});

  useEffect(() => {
    if (!localStorage.getItem('atollisle_business_token')) {
      navigate('/login');
      return;
    }
    if (!business) return;
    getSettings(business.id)
      .then((data) => {
        const b = data.business;
        setName(b.name || '');
        setLocationIsland(b.location_island || '');
        setRefundFeeBusinessPercent(b.refund_fee_business_percent ?? '');
        setNotificationPreferences(b.notification_preferences || {});
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await updateSettings(business.id, {
        name,
        location_island: locationIsland,
        refund_fee_business_percent: Number(refundFeeBusinessPercent),
        notification_preferences: notificationPreferences,
      });
      setSuccess('Settings saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!business) {
    return <p style={{ padding: 20 }} className="error-text">No business found — set up your business first.</p>;
  }

  if (loading) return <p style={{ padding: 20 }}>Loading…</p>;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <button className="btn-secondary" onClick={() => navigate('/dashboard')} style={{ marginBottom: 16 }}>
        ← Back
      </button>

      <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', marginBottom: 16 }}>
        Business settings
      </h1>

      <form onSubmit={handleSubmit} className="card" style={{ padding: 16 }}>
        <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
          Business name
        </label>
        <input
          className="input-field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ marginBottom: 14 }}
        />

        <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
          Island
        </label>
        <input
          className="input-field"
          value={locationIsland}
          onChange={(e) => setLocationIsland(e.target.value)}
          style={{ marginBottom: 14 }}
        />

        <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
          Refund fee — your share (%)
        </label>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
          When a tourist cancels a booking, this is the percentage of the refund amount that comes out of
          your side rather than the platform's — on top of the platform's own fixed 5% fee.
        </p>
        <input
          className="input-field"
          type="number"
          min="0"
          max="100"
          step="0.1"
          value={refundFeeBusinessPercent}
          onChange={(e) => setRefundFeeBusinessPercent(e.target.value)}
          style={{ marginBottom: 14 }}
        />

        <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0 14px' }} />

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 14 }}>
          <input
            type="checkbox"
            checked={Boolean(notificationPreferences.new_booking)}
            onChange={(e) =>
              setNotificationPreferences((prev) => ({ ...prev, new_booking: e.target.checked }))
            }
          />
          Email me on new bookings
        </label>

        {error && <p className="error-text">{error}</p>}
        {success && <p style={{ fontSize: 13, color: 'var(--lagoon)' }}>{success}</p>}

        <button className="btn-primary" type="submit" style={{ width: '100%' }} disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </form>

      <AppearanceSection />

      <Link
        to="/support"
        className="btn-secondary"
        style={{ display: 'block', textAlign: 'center', width: '100%', textDecoration: 'none' }}
      >
        Contact support
      </Link>
    </div>
  );
}

const THEME_OPTIONS = [
  { value: null, label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

// Manual override for the system-preference dark mode set up in
// src/theme.js / styles/theme.css. "System" clears the override and goes
// back to following prefers-color-scheme.
function AppearanceSection() {
  const { override, setOverride } = useTheme();

  return (
    <div className="card" style={{ padding: 16, marginTop: 16, marginBottom: 16 }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 10 }}>
        Appearance
      </p>
      <div style={{ display: 'flex', gap: 6 }}>
        {THEME_OPTIONS.map((opt) => (
          <button
            key={opt.label}
            type="button"
            onClick={() => setOverride(opt.value)}
            style={{
              flex: 1,
              padding: '8px 0',
              borderRadius: 'var(--radius-sm)',
              border: override === opt.value ? 'none' : '1px solid var(--border)',
              background: override === opt.value ? 'var(--lagoon)' : 'var(--surface)',
              color: override === opt.value ? '#fff' : 'var(--text-secondary)',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
