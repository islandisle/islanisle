import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApprovalQueue, approve, reject, getDisputes, resolveDispute, suspendBusiness, reinstateBusiness } from '../api/client';

export default function Dashboard() {
  const navigate = useNavigate();
  const [queue, setQueue] = useState({ businesses: [], listings: [], local_verifications: [] });
  const [disputes, setDisputes] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!localStorage.getItem('atollisle_admin_token')) {
      navigate('/login');
      return;
    }
    loadAll();
  }, []);

  function loadAll() {
    getApprovalQueue().then(setQueue).catch((err) => setError(err.message));
    getDisputes().then((data) => setDisputes(data.disputes)).catch((err) => setError(err.message));
  }

  function handleLogout() {
    localStorage.removeItem('atollisle_admin_token');
    localStorage.removeItem('atollisle_admin');
    navigate('/login');
  }

  async function handleApprove(targetType, targetId) {
    try {
      await approve(targetType, targetId);
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleReject(targetType, targetId) {
    const reason = window.prompt('Reason for rejecting (required, so the submitter can fix and resubmit):');
    if (!reason) return; // Section 10.2: a reason is required for every rejection
    try {
      await reject(targetType, targetId, reason);
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', margin: 0 }}>Admin Console</h1>
        <button className="btn-secondary" onClick={handleLogout}>Log out</button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <ApprovalQueueSection queue={queue} onApprove={handleApprove} onReject={handleReject} />
      <DisputesSection disputes={disputes} onResolved={loadAll} />
      <BusinessModerationSection onDone={loadAll} />
    </div>
  );
}

function ApprovalQueueSection({ queue, onApprove, onReject }) {
  const items = [
    ...queue.businesses.map((b) => ({ ...b, item_type: 'business', label: `${b.name} (${b.type})` })),
    ...queue.listings.map((l) => ({ ...l, item_type: 'listing', label: `${l.name} (${l.type})` })),
    ...queue.local_verifications.map((u) => ({ ...u, item_type: 'local_verification', label: `${u.name} — Local ID verification` })),
  ];

  return (
    <section style={{ marginBottom: 28 }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 10 }}>
        Approval queue ({items.length})
      </p>

      {items.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nothing pending right now.</p>
      )}

      {items.map((item) => (
        <div key={`${item.item_type}-${item.id}`} className="card" style={{ padding: 12, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: 13, color: 'var(--navy)', margin: 0 }}>{item.label}</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>{item.item_type}</p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => onReject(item.item_type, item.id)}>
              Reject
            </button>
            <button className="btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => onApprove(item.item_type, item.id)}>
              Approve
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

function DisputesSection({ disputes, onResolved }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 10 }}>
        Open disputes ({disputes.length})
      </p>

      {disputes.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No open disputes.</p>
      )}

      {disputes.map((d) => (
        <DisputeRow key={d.id} dispute={d} onResolved={onResolved} />
      ))}
    </section>
  );
}

function DisputeRow({ dispute, onResolved }) {
  const [resolving, setResolving] = useState(false);

  async function handleResolve(outcome) {
    const note = window.prompt(`Resolution note for "${outcome}":`, '');
    setResolving(true);
    try {
      await resolveDispute(dispute.id, outcome, note || outcome);
      onResolved();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="card" style={{ padding: 12, marginBottom: 8 }}>
      <p style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 4px' }}>{dispute.reason}</p>
      {dispute.description && (
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px' }}>{dispute.description}</p>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} disabled={resolving} onClick={() => handleResolve('no_action')}>
          No action
        </button>
        <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} disabled={resolving} onClick={() => handleResolve('warning')}>
          Warning
        </button>
        <button className="btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} disabled={resolving} onClick={() => handleResolve('refund')}>
          Refund
        </button>
        <button className="btn-primary" style={{ padding: '4px 10px', fontSize: 12, background: 'var(--coral)' }} disabled={resolving} onClick={() => handleResolve('suspension')}>
          Suspension
        </button>
      </div>
    </div>
  );
}

function BusinessModerationSection({ onDone }) {
  const [businessId, setBusinessId] = useState('');
  const [status, setStatus] = useState('');

  async function handleSuspend() {
    const reason = window.prompt('Reason for suspending (required):');
    if (!reason) return;
    try {
      await suspendBusiness(businessId, reason);
      setStatus('Suspended.');
      onDone();
    } catch (err) {
      setStatus(err.message);
    }
  }

  async function handleReinstate() {
    try {
      await reinstateBusiness(businessId, 'Reinstated via admin console');
      setStatus('Reinstated.');
      onDone();
    } catch (err) {
      setStatus(err.message);
    }
  }

  return (
    <section className="card" style={{ padding: 16 }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 8 }}>
        Suspend / reinstate a business
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
        A full business directory view isn't built yet — this is a manual
        stand-in, same pattern as the business dashboard's "mark fulfilled"
        action. Existing confirmed bookings are always honored regardless of
        suspension (Section 7.2) — this only blocks new ones.
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input className="input-field" placeholder="Business ID" value={businessId} onChange={(e) => setBusinessId(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-secondary" style={{ background: 'var(--coral)', color: '#fff' }} onClick={handleSuspend}>
          Suspend
        </button>
        <button className="btn-primary" onClick={handleReinstate}>
          Reinstate
        </button>
      </div>
      {status && <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>{status}</p>}
    </section>
  );
}
