import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import {
  getMyGroup, removeGroupMember, getCurrentStay,
  getWebauthnRegisterOptions, submitWebauthnRegistration, getMyWebauthnCredentials, removeWebauthnCredential,
  getNotificationPreferences, updateNotificationPreferences,
  exportMyData, deleteAccount, getMyProfile,
} from '../api/client';
import QRPopup from '../components/QRPopup';
import { useTheme } from '../theme';
import { useTextSize, TEXT_SIZE_OPTIONS } from '../textSize';
import { useLanguage, SUPPORTED_LANGUAGES } from '../i18n';
import { useModalA11y } from '../useModalA11y';

export default function Profile() {
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showQR, setShowQR] = useState(false);
  const [error, setError] = useState('');
  const [currentStay, setCurrentStay] = useState(null);

  const user = JSON.parse(localStorage.getItem('atollisle_user') || 'null');

  useEffect(() => {
    if (!localStorage.getItem('atollisle_token')) {
      navigate('/login');
      return;
    }
    loadGroup();
    getCurrentStay()
      .then((data) => setCurrentStay(data.current_stay))
      .catch(() => {});
  }, []);

  function loadGroup() {
    setLoading(true);
    getMyGroup()
      .then((data) => setGroup(data.group))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  function handleLogout() {
    localStorage.removeItem('atollisle_token');
    localStorage.removeItem('atollisle_user');
    navigate('/login');
  }

  async function handleRemoveMember(memberId) {
    if (!group) return;
    try {
      await removeGroupMember(group.id, memberId);
      loadGroup();
    } catch (err) {
      setError(err.message);
    }
  }

  const isGroupAdmin = group?.my_role === 'admin';

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <button className="btn-secondary" onClick={() => navigate('/')} style={{ marginBottom: 16 }}>
        ← Back
      </button>

      <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>
        {user?.name || 'Profile'}
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>
        {user?.type === 'local' ? 'Local account' : 'Tourist account'}
      </p>

      {currentStay && (
        <div className="card" style={{ padding: 16, marginBottom: 20, background: 'var(--lagoon-tint)', border: 'none' }}>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 4px' }}>
            Currently staying at
          </p>
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--navy)', margin: 0 }}>
            {currentStay.business_name}
          </p>
          {currentStay.room_number && (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
              Room {currentStay.room_number}
            </p>
          )}
        </div>
      )}

      <Link
        to="/bookings"
        className="btn-secondary"
        style={{ display: 'block', textAlign: 'center', width: '100%', marginBottom: 12, textDecoration: 'none' }}
      >
        My bookings &amp; orders
      </Link>

      <Link
        to="/trips"
        className="btn-secondary"
        style={{ display: 'block', textAlign: 'center', width: '100%', marginBottom: 12, textDecoration: 'none' }}
      >
        My trips
      </Link>

      <Link
        to="/favorites"
        className="btn-secondary"
        style={{ display: 'block', textAlign: 'center', width: '100%', marginBottom: 12, textDecoration: 'none' }}
      >
        My favorites
      </Link>

      <Link
        to="/support"
        className="btn-secondary"
        style={{ display: 'block', textAlign: 'center', width: '100%', marginBottom: 12, textDecoration: 'none' }}
      >
        Contact support
      </Link>

      <button
        className="btn-primary"
        style={{ width: '100%', marginBottom: 24 }}
        onClick={() => setShowQR(true)}
      >
        My QR code
      </button>

      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 12 }}>
          Travel group
        </p>

        {loading && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading…</p>}
        {error && <p className="error-text">{error}</p>}

        {!loading && !group && (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            You're not in a group yet. Use "My QR code" above to start one or join with a code.
          </p>
        )}

        {group && (
          <div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
              {group.members.length} of {group.max_members} members
            </p>
            {group.members.map((m) => (
              <div
                key={m.id}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 0', borderBottom: '1px solid var(--border)',
                }}
              >
                <div>
                  <span style={{ fontSize: 13, color: 'var(--navy)' }}>{m.name}</span>
                  {m.role === 'admin' && (
                    <span style={{ fontSize: 11, color: 'var(--lagoon)', marginLeft: 6 }}>Admin</span>
                  )}
                  {!m.is_signed_up && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>Not signed up</span>
                  )}
                </div>
                {isGroupAdmin && m.role !== 'admin' && (
                  <button
                    className="btn-secondary"
                    style={{ padding: '4px 10px', fontSize: 12 }}
                    onClick={() => handleRemoveMember(m.id)}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <WalletReferralSection />

      <NotificationPreferencesSection />

      {user?.type === 'tourist' && <LanguageSection />}

      <AppearanceSection />

      <TextSizeSection />

      <BiometricSection />

      <AccountDataSection onDeleted={handleLogout} />

      <button className="btn-secondary" style={{ width: '100%' }} onClick={handleLogout}>
        Log out
      </button>

      {showQR && (
        <QRPopup
          qrValue={group?.group_code}
          onClose={() => setShowQR(false)}
          onJoinSuccess={loadGroup}
        />
      )}
    </div>
  );
}

// Registers this device's fingerprint/face unlock (routes/webauthn.js) as
// an additional login option — see Login.jsx's "Sign in with biometrics".
function BiometricSection() {
  const [credentials, setCredentials] = useState([]);
  const [supported, setSupported] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState('');

  function load() {
    getMyWebauthnCredentials().then((d) => setCredentials(d.credentials || [])).catch(() => {});
  }

  useEffect(() => {
    setSupported(browserSupportsWebAuthn());
    load();
  }, []);

  async function handleRegister() {
    setRegistering(true);
    setError('');
    try {
      const options = await getWebauthnRegisterOptions();
      const response = await startRegistration({ optionsJSON: options });
      const label = window.prompt('Name this device (optional):', navigator.platform || 'This device');
      await submitWebauthnRegistration(response, label || undefined);
      load();
    } catch (err) {
      setError(err.name === 'NotAllowedError' ? 'Cancelled.' : err.message);
    } finally {
      setRegistering(false);
    }
  }

  async function handleRemove(id) {
    try {
      await removeWebauthnCredential(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!supported) return null;

  return (
    <div className="card" style={{ padding: 16, marginBottom: 20 }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 10 }}>
        Biometric login
      </p>
      {credentials.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
          No devices registered yet — enable fingerprint/face unlock so you don't have to type your password next time.
        </p>
      )}
      {credentials.map((c) => (
        <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 13, color: 'var(--navy)' }}>{c.device_label || 'Unnamed device'}</span>
          <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => handleRemove(c.id)}>
            Remove
          </button>
        </div>
      ))}
      {error && <p className="error-text">{error}</p>}
      <button className="btn-secondary" style={{ width: '100%', marginTop: 10 }} onClick={handleRegister} disabled={registering}>
        {registering ? 'Waiting for fingerprint/face…' : '+ Register this device'}
      </button>
    </div>
  );
}

// Section 7.5: "every account can export their own data" and delete it.
// The backend (routes/legal.js) and even the api/client.js wrappers
// (exportMyData/deleteAccount) already existed — nothing in the UI ever
// called them. Delete requires typing DELETE plus the password, matching
// legal.js's own confirmation requirement (it 400s without both).
function AccountDataSection({ onDeleted }) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  async function handleExport() {
    setExporting(true);
    setError('');
    try {
      const data = await exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'atollisle-my-data.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="card" style={{ padding: 16, marginBottom: 20 }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 10 }}>
        Your data
      </p>
      {error && <p className="error-text">{error}</p>}
      <button className="btn-secondary" style={{ width: '100%', marginBottom: 10 }} onClick={handleExport} disabled={exporting}>
        {exporting ? 'Preparing export…' : 'Export my data'}
      </button>
      <button
        className="btn-secondary"
        style={{ width: '100%', color: 'var(--coral)' }}
        onClick={() => setShowDeleteConfirm(true)}
      >
        Delete my account
      </button>

      {showDeleteConfirm && (
        <DeleteAccountPopup onClose={() => setShowDeleteConfirm(false)} onDeleted={onDeleted} />
      )}
    </div>
  );
}

function DeleteAccountPopup({ onClose, onDeleted }) {
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const modalRef = useModalA11y(onClose);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await deleteAccount(password);
      onDeleted(); // handleLogout — clears the stored token/user and redirects
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(11, 46, 61, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
      onClick={onClose}
    >
      <form
        ref={modalRef}
        onSubmit={handleSubmit}
        className="card"
        role="dialog"
        aria-modal="true"
        aria-label="Delete account"
        style={{ width: '100%', maxWidth: 380, padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--navy)', marginBottom: 8 }}>
          Delete your account?
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
          This is permanent. Your bookings and orders stay on record for the businesses involved, but your
          profile is anonymized and you'll be logged out everywhere.
        </p>
        <input
          className="input-field"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ marginBottom: 8 }}
        />
        <input
          className="input-field"
          placeholder='Type "DELETE" to confirm'
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          style={{ marginBottom: 10 }}
        />
        {error && <p className="error-text">{error}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            style={{ flex: 1, background: 'var(--coral)' }}
            disabled={busy || confirmText !== 'DELETE' || !password}
          >
            {busy ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
      </form>
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
// Section 11's per-category notification mute controls — tourists
// previously had none at all. Checked by the shared
// services/notifications.js's notify() before a notification is even
// written, not just filtered client-side.
const NOTIFICATION_CATEGORIES = [
  { key: 'booking_updates', label: 'Bookings, cancellations, and check-ins' },
  { key: 'chat_messages', label: 'Chat messages' },
  { key: 'deals_promos', label: 'Deals and promos' },
  { key: 'boarding_reminders', label: 'Boarding reminders and ETA updates' },
];

// Batch 19 — referral/loyalty. wallet_balance was [PHASE 2] and unused
// until now; not yet spendable at checkout (services/loyalty.js explains
// why), so this is display-and-share only for the moment.
function WalletReferralSection() {
  const [profile, setProfile] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getMyProfile().then((d) => setProfile(d.user)).catch((err) => setError(err.message));
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(profile.referral_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable — the code is still shown on screen to copy manually
    }
  }

  if (!profile) return null;

  return (
    <div className="card" style={{ padding: 16, marginBottom: 20 }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 10 }}>
        Wallet & referrals
      </p>
      {error && <p className="error-text">{error}</p>}
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
        Credit balance: <strong style={{ color: 'var(--lagoon)' }}>${Number(profile.wallet_balance).toFixed(2)}</strong>
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
        Share your code — you and your friend each get a $5 credit when they sign up.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <span
          className="input-field"
          style={{ flex: 1, display: 'flex', alignItems: 'center', fontWeight: 600, letterSpacing: 1 }}
        >
          {profile.referral_code}
        </span>
        <button className="btn-secondary" onClick={handleCopy}>{copied ? 'Copied!' : 'Copy'}</button>
      </div>
    </div>
  );
}

function NotificationPreferencesSection() {
  const [preferences, setPreferences] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getNotificationPreferences()
      .then((d) => setPreferences(d.preferences || {}))
      .catch((err) => setError(err.message));
  }, []);

  async function handleToggle(key, checked) {
    const next = { ...preferences, [key]: checked };
    setPreferences(next); // optimistic — this is a low-stakes preference toggle
    try {
      await updateNotificationPreferences(next);
    } catch (err) {
      setError(err.message);
    }
  }

  if (!preferences) return null;

  return (
    <div className="card" style={{ padding: 16, marginBottom: 20 }}>
      <p id="notif-prefs-label" style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 10 }}>
        Notifications
      </p>
      <div role="group" aria-labelledby="notif-prefs-label">
        {NOTIFICATION_CATEGORIES.map((cat) => (
          <label key={cat.key} htmlFor={`notif-pref-${cat.key}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 8 }}>
            <input
              id={`notif-pref-${cat.key}`}
              type="checkbox"
              checked={preferences[cat.key] !== false}
              onChange={(e) => handleToggle(cat.key, e.target.checked)}
            />
            {cat.label}
          </label>
        ))}
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

// Section 11: "let the user change language later from Profile, not just
// at signup." Tourist-only — Local accounts stay English-only (see
// backend/src/routes/auth.js's PATCH /language, which no-ops for them).
function LanguageSection() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className="card" style={{ padding: 16, marginBottom: 20 }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 10 }}>
        {t('profile.language')}
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {SUPPORTED_LANGUAGES.map((opt) => (
          <button
            key={opt.code}
            type="button"
            onClick={() => setLanguage(opt.code)}
            style={{
              flex: '1 0 auto',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              border: language === opt.code ? 'none' : '1px solid var(--border)',
              background: language === opt.code ? 'var(--lagoon)' : 'var(--surface)',
              color: language === opt.code ? '#fff' : 'var(--text-secondary)',
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

function TextSizeSection() {
  const { scale, setScale } = useTextSize();

  return (
    <div className="card" style={{ padding: 16, marginBottom: 20 }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 10 }}>
        Text size
      </p>
      <div style={{ display: 'flex', gap: 6 }}>
        {TEXT_SIZE_OPTIONS.map((opt) => (
          <button
            key={opt.label}
            type="button"
            onClick={() => setScale(opt.value)}
            style={{
              flex: 1,
              padding: '8px 0',
              borderRadius: 'var(--radius-sm)',
              border: scale === opt.value ? 'none' : '1px solid var(--border)',
              background: scale === opt.value ? 'var(--lagoon)' : 'var(--surface)',
              color: scale === opt.value ? '#fff' : 'var(--text-secondary)',
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

function AppearanceSection() {
  const { override, setOverride } = useTheme();

  return (
    <div className="card" style={{ padding: 16, marginBottom: 20 }}>
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