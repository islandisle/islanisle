import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signup } from '../api/client';

export default function Signup() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const result = await signup({ name, contact_email: contactEmail, password });
      setSuccess(result.message);
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 380, margin: '0 auto', padding: '48px 20px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>
        Become an agent
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
        Your account needs Super Admin approval before you can connect to businesses or make bookings.
      </p>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 14 }}>
          <label htmlFor="signup-name" style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
            Name
          </label>
          <input id="signup-name" className="input-field" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label htmlFor="signup-email" style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
            Email
          </label>
          <input id="signup-email" className="input-field" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label htmlFor="signup-password" style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
            Password
          </label>
          <input id="signup-password" className="input-field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="error-text">{error}</p>}
        {success && <p style={{ fontSize: 13, color: 'var(--lagoon)' }}>{success}</p>}
        <button className="btn-primary" type="submit" style={{ width: '100%' }} disabled={submitting}>
          {submitting ? 'Creating…' : 'Create account'}
        </button>
      </form>

      <Link to="/login" style={{ display: 'block', textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--lagoon)' }}>
        Already have an account? Log in
      </Link>
    </div>
  );
}
