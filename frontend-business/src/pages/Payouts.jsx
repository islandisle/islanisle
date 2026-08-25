import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPayouts, getPayoutItems } from '../api/client';

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

// Section 4.8's Payout History requirement: itemized gross/commission/dues/
// credits/net, plus the specific bookings/orders that payout aggregates —
// previously only ever showed the net amount and date.
function PayoutRow({ payout }) {
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState(null);
  const [itemsError, setItemsError] = useState('');

  function toggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    if (next && items === null) {
      getPayoutItems(payout.id)
        .then((d) => setItems(d.items || []))
        .catch((err) => setItemsError(err.message));
    }
  }

  return (
    <div className="card" style={{ padding: 12, marginBottom: 8 }}>
      <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--navy)', margin: '0 0 2px' }}>
        ${payout.amount}
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
        {new Date(payout.schedule_date).toLocaleDateString()} · {STATUS_LABEL[payout.status] || payout.status}
      </p>

      <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8 }}>
        <PayoutLine label="Gross amount" value={payout.gross_amount} />
        <PayoutLine label="Business commission (1%)" value={-payout.business_commission_deducted} />
        {Number(payout.pay_at_visit_dues_deducted) > 0 && (
          <PayoutLine label="Pay at Visit dues deducted" value={-payout.pay_at_visit_dues_deducted} />
        )}
        {Number(payout.refund_fee_credits) > 0 && (
          <PayoutLine label="Refund fee credits" value={payout.refund_fee_credits} />
        )}
        <PayoutLine label="Net paid to you" value={payout.amount} bold />
      </div>

      <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={toggleExpanded}>
        {expanded ? 'Hide items' : 'View items'}
      </button>

      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          {itemsError && <p className="error-text">{itemsError}</p>}
          {items === null && !itemsError && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading…</p>}
          {items?.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No items linked.</p>}
          {items?.map((item) => (
            <p key={`${item.type}-${item.id}`} style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 4px' }}>
              {item.title} — {new Date(item.date).toLocaleDateString()} · ${item.base_price} (${item.business_commission} commission)
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function PayoutLine({ label, value, bold }) {
  const num = Number(value);
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: bold ? 600 : 400, color: bold ? 'var(--navy)' : undefined }}>
      <span>{label}</span>
      <span>{num < 0 ? `-$${Math.abs(num)}` : `$${num}`}</span>
    </div>
  );
}
