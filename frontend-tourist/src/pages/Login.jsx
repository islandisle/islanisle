import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { login } from '../api/client';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [contactEmail, setContactEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const justSignedUp = location.state?.justSignedUp;
  const signupMessage = location.state?.message;

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const result = await login({ contact_email: contactEmail, password });
      localStorage.setItem('atollisle_token', result.token);
      localStorage.setItem('atollisle_user', JSON.stringify(result.user));
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 380, margin: '0 auto', padding: '48px 20px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>
        Welcome back
      </h1>

      {justSignedUp && (
        <p style={{ fontSize: 13, color: 'var(--lagoon)', background: 'var(--lagoon-light)', padding: 10, borderRadius: 8, marginTop: 12 }}>
          {signupMessage || 'Account created — log in to continue.'}
        </p>
      )}

      <form onSubmit={handleSubmit} style={{ marginTop: 20 }}>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
            Email
          </label>
          <input
            className="input-field"
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
            Password
          </label>
          <input
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
    </div>
  );
}
