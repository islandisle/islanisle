import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMySettings, updateMySettings, updateMyProfile, setup2FA, confirm2FA, disable2FA } from '../api/client';
import { useTheme } from '../theme';
import { useGlass } from '../glass';

// Batch 19 — frontend-agent had no Settings page at all: payout bank
// details could only ever be set once at signup, with no way to review or
// change them, and 2FA (routes/twoFactor.js) had no frontend anywhere in
// the app yet.
export default function Settings() {
  const navigate = useNavigate();
  const [agent, setAgent] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!localStorage.getItem('atollisle_agent_token')) {
      navigate('/login');
      return;
    }
    getMySettings().then((d) => setAgent(d.agent)).catch((err) => setError(err.message));
  }, []);

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <button className="btn-secondary" onClick={() => navigate('/dashboard')} style={{ marginBottom: 16 }}>
        ← Back
      </button>

      <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', marginBottom: 16 }}>
        Settings
      </h1>

      {error && <p className="error-text">{error}</p>}
      {!agent && !error && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading…</p>}

      {agent && (
        <>
          <DiscoveryProfileSection agent={agent} onSaved={setAgent} />
          <PayoutDetailsSection agent={agent} onSaved={setAgent} />
          <TwoFactorSection agent={agent} onChanged={setAgent} />
          <AppearanceSection />
        </>
      )}
    </div>
  );
}

const SPECIALTY_OPTIONS = [
  { value: '', label: 'Not set' },
  { value: 'guesthouse', label: 'Guesthouse' },
  { value: 'tour_guide', label: 'Tour guide' },
  { value: 'excursion', label: 'Excursion' },
  { value: 'shopping', label: 'Shopping' },
];

// The discovery profile tourists filter on in the "Find an agent" screen
// (backend GET /api/agents/search). Service islands are entered as a plain
// comma-separated list rather than forcing the tourist app's single-value
// IslandPicker into a multi-select — the backend matches them
// case/whitespace-insensitively.
function DiscoveryProfileSection({ agent, onSaved }) {
  const [specialty, setSpecialty] = useState(agent.specialty || '');
  const [islandsText, setIslandsText] = useState((agent.service_islands || []).join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const service_islands = islandsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const data = await updateMyProfile({ specialty: specialty || null, service_islands });
      onSaved((prev) => ({ ...prev, specialty: data.agent.specialty, service_islands: data.agent.service_islands }));
      setIslandsText((data.agent.service_islands || []).join(', '));
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="card" style={{ padding: 16, marginBottom: 20 }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 4 }}>
        Discovery profile
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
        How tourists find you when searching for an agent.
      </p>

      <label htmlFor="agent-specialty" style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
        Specialty
      </label>
      <select
        id="agent-specialty"
        className="input-field"
        value={specialty}
        onChange={(e) => setSpecialty(e.target.value)}
        style={{ marginBottom: 10 }}
      >
        {SPECIALTY_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <label htmlFor="agent-islands" style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
        Islands you serve (comma-separated)
      </label>
      <input
        id="agent-islands"
        className="input-field"
        placeholder="e.g. Maafushi, Malé, Dhigurah"
        value={islandsText}
        onChange={(e) => setIslandsText(e.target.value)}
        style={{ marginBottom: 10 }}
      />

      {error && <p className="error-text">{error}</p>}
      {saved && <p style={{ fontSize: 12, color: 'var(--lagoon)', margin: '0 0 8px' }}>Saved.</p>}
      <button className="btn-primary" type="submit" disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </button>
    </form>
  );
}

function PayoutDetailsSection({ agent, onSaved }) {
  const details = agent.payout_bank_details || {};
  const [bankName, setBankName] = useState(details.bank_name || '');
  const [accountNumber, setAccountNumber] = useState(details.account_number || '');
  const [accountHolder, setAccountHolder] = useState(details.account_holder || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const data = await updateMySettings({
        payout_bank_details: { bank_name: bankName, account_number: accountNumber, account_holder: accountHolder },
      });
      onSaved((prev) => ({ ...prev, payout_bank_details: data.agent.payout_bank_details }));
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="card" style={{ padding: 16, marginBottom: 20 }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 10 }}>
        Payout bank details
      </p>
      <input
        className="input-field"
        placeholder="Bank name"
        value={bankName}
        onChange={(e) => setBankName(e.target.value)}
        style={{ marginBottom: 8 }}
      />
      <input
        className="input-field"
        placeholder="Account holder name"
        value={accountHolder}
        onChange={(e) => setAccountHolder(e.target.value)}
        style={{ marginBottom: 8 }}
      />
      <input
        className="input-field"
        placeholder="Account number"
        value={accountNumber}
        onChange={(e) => setAccountNumber(e.target.value)}
        style={{ marginBottom: 10 }}
      />
      {error && <p className="error-text">{error}</p>}
      {saved && <p style={{ fontSize: 12, color: 'var(--lagoon)', margin: '0 0 8px' }}>Saved.</p>}
      <button className="btn-primary" type="submit" disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </button>
    </form>
  );
}

// TOTP 2FA setup — backed by routes/twoFactor.js, generalized to agents in
// Batch 19. Note: enabling this does not yet change what agents.js's login
// route accepts (see twoFactor.js's own file-level comment) — it's a real
// working authenticator enrollment, just not enforced at login yet.
function TwoFactorSection({ agent, onChanged }) {
  const [pending, setPending] = useState(null); // { secret, otpauth_url } while mid-setup
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleStart() {
    setError('');
    setBusy(true);
    try {
      const data = await setup2FA();
      setPending(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await confirm2FA(code);
      setPending(null);
      setCode('');
      onChanged((prev) => ({ ...prev, two_factor_enabled: true }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    if (!window.confirm('Turn off 2FA for this account?')) return;
    setBusy(true);
    setError('');
    try {
      await disable2FA();
      onChanged((prev) => ({ ...prev, two_factor_enabled: false }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ padding: 16, marginBottom: 20 }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 10 }}>
        Two-factor authentication
      </p>

      {error && <p className="error-text">{error}</p>}

      {agent.two_factor_enabled && !pending && (
        <>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>Enabled.</p>
          <button className="btn-secondary" onClick={handleDisable} disabled={busy}>Turn off</button>
        </>
      )}

      {!agent.two_factor_enabled && !pending && (
        <>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
            Not enabled. Set up an authenticator app for extra login security.
          </p>
          <button className="btn-primary" onClick={handleStart} disabled={busy}>Set up 2FA</button>
        </>
      )}

      {pending && (
        <form onSubmit={handleConfirm}>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Scan this in your authenticator app, or enter the code manually:
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', wordBreak: 'break-all', marginBottom: 10 }}>
            {pending.secret}
          </p>
          <input
            className="input-field"
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={{ marginBottom: 10 }}
          />
          <button className="btn-primary" type="submit" disabled={busy}>Confirm</button>
        </form>
      )}
    </div>
  );
}

const THEME_OPTIONS = [
  { value: null, label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function AppearanceSection() {
  const { override, setOverride } = useTheme();
  const { on: glassOn, setOn: setGlassOn } = useGlass();

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

      {/* Glass mode — a frosted-glass surface style, on/off independently of
          light/dark (glass.js). */}
      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 14, cursor: 'pointer' }}>
        <span>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--navy)' }}>Glass mode</span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)' }}>
            Frosted, translucent panels. Works with any theme.
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={glassOn}
          onChange={(e) => setGlassOn(e.target.checked)}
          style={{ width: 20, height: 20, accentColor: 'var(--lagoon)', flexShrink: 0, cursor: 'pointer' }}
        />
      </label>
    </div>
  );
}
