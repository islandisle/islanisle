import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAnalytics } from '../api/client';

// Batch 19 — a business previously had no at-a-glance performance view.
// A simple CSS bar chart rather than a charting library (no new
// dependency available in this environment — see i18n.jsx's own note on
// the same constraint).
export default function Analytics() {
  const navigate = useNavigate();
  const [business] = useState(() => {
    const saved = localStorage.getItem('atollisle_business');
    return saved ? JSON.parse(saved) : null;
  });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!localStorage.getItem('atollisle_business_token')) {
      navigate('/login');
      return;
    }
    if (!business) return;
    getAnalytics(business.id)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [business]);

  const maxDaily = data ? Math.max(1, ...data.daily_revenue.map((d) => Number(d.revenue))) : 1;

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: 16 }}>
      <button className="btn-secondary" onClick={() => navigate('/dashboard')} style={{ marginBottom: 16 }}>
        ← Back
      </button>

      <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', marginBottom: 16 }}>
        Analytics
      </h1>

      {error && <p className="error-text">{error}</p>}
      {!data && !error && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading…</p>}

      {data && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <SummaryCard label="Revenue (all time)" value={`$${Number(data.summary.total_revenue).toFixed(2)}`} />
            <SummaryCard label="Completed" value={data.summary.completed_count} />
            <SummaryCard label="Cancelled" value={data.summary.cancelled_count} />
          </div>

          <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 10 }}>
            Revenue, last 30 days
          </p>
          <div className="card" style={{ padding: 16, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 100 }}>
              {data.daily_revenue.map((d) => (
                <div
                  key={d.day}
                  title={`${d.day.slice(0, 10)}: $${Number(d.revenue).toFixed(2)}`}
                  style={{
                    flex: 1,
                    height: `${Math.max(2, (Number(d.revenue) / maxDaily) * 100)}%`,
                    background: 'var(--lagoon)',
                    borderRadius: '2px 2px 0 0',
                  }}
                />
              ))}
            </div>
          </div>

          <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 10 }}>
            Top listings
          </p>
          {data.top_listings.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No bookings yet.</p>
          )}
          {data.top_listings.map((l) => (
            <div key={l.id} className="card" style={{ padding: 12, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: 'var(--navy)' }}>{l.title}</span>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {l.booking_count} bookings · ${Number(l.revenue).toFixed(2)}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="card" style={{ flex: 1, padding: 12, textAlign: 'center' }}>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 4px' }}>{label}</p>
      <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--navy)', margin: 0 }}>{value}</p>
    </div>
  );
}
