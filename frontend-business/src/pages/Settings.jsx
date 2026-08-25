import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  getSettings, updateSettings, getPromoCodes, createPromoCode, updatePromoCode,
  getStaff, addStaff, revokeStaff, getClosures, addClosure, removeClosure,
} from '../api/client';
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
        <label htmlFor="settings-name" style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
          Business name
        </label>
        <input
          id="settings-name"
          className="input-field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ marginBottom: 14 }}
        />

        <label htmlFor="settings-island" style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
          Island
        </label>
        <input
          id="settings-island"
          className="input-field"
          value={locationIsland}
          onChange={(e) => setLocationIsland(e.target.value)}
          style={{ marginBottom: 14 }}
        />

        <label htmlFor="settings-refund-fee" style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
          Refund fee — your share (%)
        </label>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
          When a tourist cancels a booking, this is the percentage of the refund amount that comes out of
          your side rather than the platform's — on top of the platform's own fixed 5% fee.
        </p>
        <input
          id="settings-refund-fee"
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

        <label htmlFor="settings-notify-booking" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 14 }}>
          <input
            id="settings-notify-booking"
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

      <PromoCodesSection businessId={business.id} />

      <StaffSection businessId={business.id} />

      <ClosuresSection businessId={business.id} />

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

// Promo code management — POST/GET/PATCH /api/business/:businessId/promo-codes.
// Applies at checkout in frontend-tourist's ListingDetail.jsx.
function PromoCodesSection({ businessId }) {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  function load() {
    setLoading(true);
    getPromoCodes(businessId)
      .then((data) => setCodes(data.promo_codes || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [businessId]);

  async function handleEndNow(codeId) {
    try {
      await updatePromoCode(businessId, codeId, { valid_to: new Date().toISOString() });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', margin: 0 }}>
          Promo codes
        </p>
        <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setOpen((v) => !v)}>
          {open ? 'Close' : '+ New code'}
        </button>
      </div>

      {open && <NewPromoCodeForm businessId={businessId} onCreated={() => { setOpen(false); load(); }} />}

      {error && <p className="error-text">{error}</p>}
      {loading && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>}
      {!loading && codes.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No promo codes yet.</p>
      )}

      {codes.map((c) => {
        const isExpired = new Date(c.valid_to) <= new Date();
        const isExhausted = c.usage_limit != null && c.times_used >= c.usage_limit;
        const isActive = !isExpired && !isExhausted;
        return (
          <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', margin: '0 0 2px' }}>
                  {c.code}
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
                  {c.discount_type === 'percentage' ? `${c.discount}% off` : `$${c.discount} off`}
                  {' · '}
                  {c.times_used}{c.usage_limit != null ? `/${c.usage_limit}` : ''} used
                  {' · '}
                  {isActive ? 'active' : isExhausted ? 'exhausted' : 'expired'}
                </p>
              </div>
              {isActive && (
                <button
                  className="btn-secondary"
                  style={{ padding: '4px 10px', fontSize: 12 }}
                  onClick={() => handleEndNow(c.id)}
                >
                  End now
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NewPromoCodeForm({ businessId, onCreated }) {
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState('percentage');
  const [discount, setDiscount] = useState('');
  const [validTo, setValidTo] = useState('');
  const [usageLimit, setUsageLimit] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await createPromoCode(businessId, {
        code,
        discount_type: discountType,
        discount: Number(discount),
        valid_from: new Date().toISOString(),
        valid_to: new Date(validTo).toISOString(),
        usage_limit: usageLimit ? Number(usageLimit) : null,
      });
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', marginBottom: 10 }}>
      <input
        className="input-field"
        placeholder="Code (e.g. WELCOME10)"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        style={{ marginBottom: 8, textTransform: 'uppercase' }}
      />
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <select className="input-field" value={discountType} onChange={(e) => setDiscountType(e.target.value)}>
          <option value="percentage">% off</option>
          <option value="fixed">$ off</option>
        </select>
        <input
          className="input-field"
          type="number"
          min="0"
          step="0.01"
          placeholder={discountType === 'percentage' ? '10' : '5.00'}
          value={discount}
          onChange={(e) => setDiscount(e.target.value)}
        />
      </div>
      <label htmlFor="promo-expires" style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
        Expires
      </label>
      <input
        id="promo-expires"
        className="input-field"
        type="datetime-local"
        value={validTo}
        onChange={(e) => setValidTo(e.target.value)}
        style={{ marginBottom: 8 }}
      />
      <label htmlFor="promo-usage-limit" style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
        Usage limit (optional)
      </label>
      <input
        id="promo-usage-limit"
        className="input-field"
        type="number"
        min="1"
        placeholder="Unlimited"
        value={usageLimit}
        onChange={(e) => setUsageLimit(e.target.value)}
        style={{ marginBottom: 8 }}
      />

      {error && <p className="error-text">{error}</p>}

      <button
        className="btn-primary"
        type="submit"
        style={{ width: '100%' }}
        disabled={submitting || !code || !discount || !validTo}
      >
        {submitting ? 'Creating…' : 'Create promo code'}
      </button>
    </form>
  );
}

// Staff accounts (Section 4.8) — backend CRUD (businessSettings.js) already
// existed with no frontend. Credentials are shown once, right after
// creation, since the backend never returns a password hash again.
function StaffSection({ businessId }) {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  function load() {
    setLoading(true);
    getStaff(businessId)
      .then((data) => setStaff(data.staff || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [businessId]);

  async function handleRevoke(staffId) {
    if (!window.confirm('Revoke this staff account? They will no longer be able to log in.')) return;
    try {
      await revokeStaff(businessId, staffId);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', margin: 0 }}>Staff accounts</p>
        <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setOpen((v) => !v)}>
          {open ? 'Close' : '+ Add staff'}
        </button>
      </div>

      {open && <NewStaffForm businessId={businessId} onCreated={() => { setOpen(false); load(); }} />}

      {error && <p className="error-text">{error}</p>}
      {loading && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>}
      {!loading && staff.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No staff accounts yet.</p>
      )}

      {staff.map((s) => (
        <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
          <div>
            <p style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 2px' }}>{s.name}</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
              {s.login_email} · {s.permission_level} · {s.status}
            </p>
          </div>
          {s.status === 'active' && (
            <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12, color: 'var(--coral)' }} onClick={() => handleRevoke(s.id)}>
              Revoke
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function NewStaffForm({ businessId, onCreated }) {
  const [name, setName] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await addStaff(businessId, { name, login_email: loginEmail, temp_password: tempPassword, permission_level: 'front_desk' });
      // The credentials only ever exist here — show them once before
      // handing off to the list, since there's no way to retrieve them again.
      setCreated({ loginEmail, tempPassword });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', marginBottom: 10 }}>
        <p style={{ fontSize: 13, color: 'var(--lagoon)', marginBottom: 8 }}>
          Staff account created — share these credentials now, they won't be shown again:
        </p>
        <p style={{ fontSize: 12, color: 'var(--navy)', margin: '0 0 2px' }}>Email: {created.loginEmail}</p>
        <p style={{ fontSize: 12, color: 'var(--navy)', margin: '0 0 10px' }}>Password: {created.tempPassword}</p>
        <button className="btn-primary" style={{ width: '100%' }} onClick={onCreated}>Done</button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', marginBottom: 10 }}>
      <label htmlFor="staff-name" style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Name</label>
      <input id="staff-name" className="input-field" value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 8 }} />

      <label htmlFor="staff-email" style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Login email</label>
      <input id="staff-email" className="input-field" type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} style={{ marginBottom: 8 }} />

      <label htmlFor="staff-password" style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Temporary password</label>
      <input id="staff-password" className="input-field" type="text" value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} style={{ marginBottom: 8 }} />

      {error && <p className="error-text">{error}</p>}

      <button className="btn-primary" type="submit" style={{ width: '100%' }} disabled={submitting || !name || !loginEmail || !tempPassword}>
        {submitting ? 'Creating…' : 'Create staff account'}
      </button>
    </form>
  );
}

// Business closures (Section 8.4) — closures table existed with no route or
// UI. A closure doesn't hide the listing, just blocks new bookings across
// the date range (bookings.js checks this) and shows the reason to tourists
// (ListingDetail.jsx's ClosureBanner).
function ClosuresSection({ businessId }) {
  const [closures, setClosures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  function load() {
    setLoading(true);
    getClosures(businessId)
      .then((data) => setClosures(data.closures || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [businessId]);

  async function handleRemove(id) {
    try {
      await removeClosure(businessId, id);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', margin: 0 }}>Closures</p>
        <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setOpen((v) => !v)}>
          {open ? 'Close' : '+ Add closure'}
        </button>
      </div>

      {open && <NewClosureForm businessId={businessId} onCreated={() => { setOpen(false); load(); }} />}

      {error && <p className="error-text">{error}</p>}
      {loading && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>}
      {!loading && closures.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No upcoming closures.</p>
      )}

      {closures.map((c) => (
        <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
          <div>
            <p style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 2px' }}>
              {new Date(c.start_date).toLocaleDateString()} – {new Date(c.end_date).toLocaleDateString()}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>{c.reason}</p>
          </div>
          <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => handleRemove(c.id)}>
            End early
          </button>
        </div>
      ))}
    </div>
  );
}

function NewClosureForm({ businessId, onCreated }) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await addClosure(businessId, { start_date: startDate, end_date: endDate, reason });
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="closure-start" style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Start</label>
          <input id="closure-start" className="input-field" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="closure-end" style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>End</label>
          <input id="closure-end" className="input-field" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>
      <label htmlFor="closure-reason" style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Reason</label>
      <input
        id="closure-reason"
        className="input-field"
        placeholder="e.g. Closed for maintenance"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        style={{ marginBottom: 8 }}
      />

      {error && <p className="error-text">{error}</p>}

      <button className="btn-primary" type="submit" style={{ width: '100%' }} disabled={submitting || !startDate || !endDate || !reason}>
        {submitting ? 'Saving…' : 'Add closure'}
      </button>
    </form>
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
