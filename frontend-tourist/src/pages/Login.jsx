import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { login, getWebauthnLoginOptions, submitWebauthnLogin } from '../api/client';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [contactEmail, setContactEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [webauthnSupported, setWebauthnSupported] = useState(false);

  const justSignedUp = location.state?.justSignedUp;
  const signupMessage = location.state?.message;

  useEffect(() => {
    setWebauthnSupported(browserSupportsWebAuthn());
  }, []);

  function storeSession(result) {
    localStorage.setItem('atollisle_token', result.token);
    localStorage.setItem('atollisle_user', JSON.stringify(result.user));
    navigate('/');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const result = await login({ contact_email: contactEmail, password });
      storeSession(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // Biometric login (WebAuthn) — an additional option alongside the
  // password form above, not a replacement. Requires an email so the
  // server knows which account's registered devices to offer.
  async function handleBiometricLogin() {
    if (!contactEmail.trim()) {
      setError('Enter your email above first, then tap "Sign in with biometrics".');
      return;
    }
    setBiometricBusy(true);
    setError('');
    try {
      const { options, user_id } = await getWebauthnLoginOptions({ contact_email: contactEmail.trim() });
      const response = await startAuthentication({ optionsJSON: options });
      const result = await submitWebauthnLogin(user_id, response);
      storeSession(result);
    } catch (err) {
      setError(err.name === 'NotAllowedError' ? 'Biometric login was cancelled.' : err.message);
    } finally {
      setBiometricBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 380, margin: '0 auto', padding: '48px 20px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>
        Welcome back
      </h1>

      {justSignedUp && (
        <p style={{ fontSize: 13, color: 'var(--lagoon)', background: 'var(--lagoon-tint)', padding: 10, borderRadius: 8, marginTop: 12 }}>
          {signupMessage || 'Account created — log in to continue.'}
        </p>
      )}

      <form onSubmit={handleSubmit} style={{ marginTop: 20 }}>
        <div style={{ marginBottom: 14 }}>
          <label htmlFor="login-email" style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
            Email
          </label>
          <input
            id="login-email"
            className="input-field"
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label htmlFor="login-password" style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
            Password
          </label>
          <input
            id="login-password"
            className="input-field"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn-primary" type="submit" style={{ width: '100%' }} disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>

      {webauthnSupported && (
        <button
          type="button"
          className="btn-secondary"
          style={{ width: '100%', marginTop: 10 }}
          onClick={handleBiometricLogin}
          disabled={biometricBusy}
        >
          {biometricBusy ? 'Waiting for fingerprint/face…' : 'Sign in with biometrics'}
        </button>
      )}
    </div>
  );
}
