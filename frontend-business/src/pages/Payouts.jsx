import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPayouts } from '../api/client';

const STATUS_LABEL = {
  pending: 'Pending',
  paid: 'Paid',
};

export default function Payouts() {
  const navigate = useNavigate();
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!localStorage.getItem('atollisle_business_token')) {
      navigate('/login');
      return;
    }
    getPayouts()
      .then((data) => setPayouts(data.payouts || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <button className="btn-secondary" onClick={() => navigate('/dashboard')} style={{ marginBottom: 16 }}>
        ← Back
      </button>

      <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', marginBottom: 16 }}>
        Payout history
      </h1>

      {loading && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading…</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && payouts.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No payouts yet.</p>
      )}

      {payouts.map((p) => (
        <PayoutRow key={p.id} payout={p} />
      ))}
    </div>
  );
}

function PayoutRow({ payout }) {
  return (
    <div className="card" style={{ padding: 12, marginBottom: 8 }}>
      <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--navy)', margin: '0 0 2px' }}>
        ${payout.amount}
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
        {new Date(payout.schedule_date).toLocaleDateString()} · {STATUS_LABEL[payout.status] || payout.status}
      </p>
    </div>
  );
}
