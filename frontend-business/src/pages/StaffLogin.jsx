import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { staffLogin } from '../api/client';

// A staff_accounts row (created by the owner on Settings > Staff) previously
// had no way to actually log in anywhere — this is that missing screen.
// Stores its token under the same 'atollisle_business_token' key the owner
// login uses, so the existing check-in API calls work without changes; the
// 'atollisle_business_user' record carries a role flag StaffDashboard (and
// nothing else) checks to show the cut-down view instead of the full
// owner Dashboard.
export default function StaffLogin() {
  const navigate = useNavigate();
  const [loginEmail, setLoginEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const result = await staffLogin({ login_email: loginEmail, password });
      localStorage.setItem('atollisle_business_token', result.token);
      localStorage.setItem('atollisle_business_user', JSON.stringify({ ...result.staff, role: 'staff' }));
      navigate('/staff-dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 380, margin: '0 auto', padding: '48px 20px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>
        Staff login
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
        For front-desk team members — use the email and password your manager gave you.
      </p>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 14 }}>
          <label htmlFor="staff-login-email" style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
            Email
          </label>
          <input
            id="staff-login-email"
            className="input-field"
            type="email"
            value={loginEmail}
            onChange={(e) => setLoginEmail(e.target.value)}
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label htmlFor="staff-login-password" style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
            Password
          </label>
          <input
            id="staff-login-password"
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

      <Link to="/login" style={{ display: 'block', textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--lagoon)' }}>
        Business owner? Log in here
      </Link>
    </div>
  );
}
