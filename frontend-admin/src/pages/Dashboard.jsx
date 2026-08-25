import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getApprovalQueue, approve, reject, getDisputes, resolveDispute, suspendBusiness, reinstateBusiness,
  getBusinessDirectory, getBusinessDetail, getBusinessListingsDetail, getBusinessStaff, runPayouts,
  getSupportTickets, getSupportTicket, replyToSupportTicket, closeSupportTicket,
} from '../api/client';
import { useTheme } from '../theme';

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

      <AppearanceSection />

      <ApprovalQueueSection queue={queue} onApprove={handleApprove} onReject={handleReject} />
      <PayoutsSection />
      <DisputesSection disputes={disputes} onResolved={loadAll} />
      <BusinessDirectorySection />
      <SupportTicketsSection />
    </div>
  );
}

function ApprovalQueueSection({ queue, onApprove, onReject }) {
  const [expanded, setExpanded] = useState(null); // `${item_type}-${item.id}` or null

  const items = [
    ...queue.businesses.map((b) => ({ ...b, item_type: 'business', label: `${b.name} (${b.type})`, business_id: b.id })),
    ...queue.listings.map((l) => ({ ...l, item_type: 'listing', label: `${l.name} (${l.type})` })),
    ...queue.local_verifications.map((u) => ({ ...u, item_type: 'local_verification', label: `${u.name} — Local ID verification` })),
    ...(queue.agents || []).map((a) => ({ ...a, item_type: 'agent', label: `${a.name} — Agent account` })),
  ];

  return (
    <section style={{ marginBottom: 28 }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 10 }}>
        Approval queue ({items.length})
      </p>

      {items.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nothing pending right now.</p>
      )}

      {items.map((item) => {
        const key = `${item.item_type}-${item.id}`;
        const isExpanded = expanded === key;
        return (
          <div key={key} className="card" style={{ padding: 12, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: 13, color: 'var(--navy)', margin: 0 }}>{item.label}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>{item.item_type}</p>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {item.business_id && (
                  <button
                    className="btn-secondary"
                    style={{ padding: '4px 10px', fontSize: 12 }}
                    onClick={() => setExpanded(isExpanded ? null : key)}
                  >
                    {isExpanded ? 'Hide details' : 'View details'}
                  </button>
                )}
                <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => onReject(item.item_type, item.id)}>
                  Reject
                </button>
                <button className="btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => onApprove(item.item_type, item.id)}>
                  Approve
                </button>
              </div>
            </div>
            {isExpanded && (
              <BusinessDetailPreview businessId={item.business_id} />
            )}
          </div>
        );
      })}
    </section>
  );
}

// Read-only preview of a business's full settings, listings, and staff —
// backed by the business's own management endpoints (business.js,
// businessSettings.js), which previously 403'd for an admin token. Shared
// between the approval queue and the business directory below.
function BusinessDetailPreview({ businessId }) {
  const [detail, setDetail] = useState(null);
  const [listings, setListings] = useState(null);
  const [staff, setStaff] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getBusinessDetail(businessId),
      getBusinessListingsDetail(businessId),
      getBusinessStaff(businessId),
    ])
      .then(([detailData, listingsData, staffData]) => {
        if (cancelled) return;
        setDetail(detailData.business);
        setListings(listingsData.listings || []);
        setStaff(staffData.staff || []);
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => { cancelled = true; };
  }, [businessId]);

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
      {error && <p className="error-text">{error}</p>}
      {!error && !detail && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading…</p>}

      {detail && (
        <>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 4px' }}>
            {detail.location_island || 'No island set'} · {detail.account_status}
            {detail.contact_info && Object.keys(detail.contact_info).length > 0 && (
              <> · {JSON.stringify(detail.contact_info)}</>
            )}
          </p>

          <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--navy)', margin: '10px 0 4px' }}>
            Listings ({listings?.length ?? 0})
          </p>
          {listings && listings.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>None yet.</p>
          )}
          {listings && listings.map((l) => (
            <p key={l.id} style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0' }}>
              {l.title} — ${l.tourist_price} tourist / ${l.local_price} local · {l.approval_status}
            </p>
          ))}

          <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--navy)', margin: '10px 0 4px' }}>
            Staff ({staff?.length ?? 0})
          </p>
          {staff && staff.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>None yet.</p>
          )}
          {staff && staff.map((s) => (
            <p key={s.id} style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0' }}>
              {s.name} — {s.login_email} · {s.permission_level} · {s.status}
            </p>
          ))}
        </>
      )}
    </div>
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

// GET /api/admin/businesses — replaces the old manual "type in a Business
// ID you'd have to already know" box with an actual browsable/searchable
// directory. Suspend/reinstate and the detail preview both live inline per
// row now instead of needing a separately-copied id.
function BusinessDirectorySection() {
  const [data, setData] = useState({ businesses: [], total: 0, page: 1, limit: 20 });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  function load(page = 1) {
    setLoading(true);
    getBusinessDirectory({ search, status, page })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(1); }, []);

  function handleFilterSubmit(e) {
    e.preventDefault();
    load(1);
  }

  async function handleSuspend(id) {
    const reason = window.prompt('Reason for suspending (required):');
    if (!reason) return;
    try {
      await suspendBusiness(id, reason);
      load(data.page);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleReinstate(id) {
    try {
      await reinstateBusiness(id, 'Reinstated via admin console');
      load(data.page);
    } catch (err) {
      setError(err.message);
    }
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.limit));

  return (
    <section style={{ marginBottom: 28 }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 10 }}>
        Business directory ({data.total})
      </p>

      <form onSubmit={handleFilterSubmit} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input
          className="input-field"
          placeholder="Search by name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1 }}
        />
        <select className="input-field" value={status} onChange={(e) => setStatus(e.target.value)} style={{ maxWidth: 150 }}>
          <option value="">Any status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <button className="btn-secondary" type="submit">Search</button>
      </form>

      {error && <p className="error-text">{error}</p>}
      {loading && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>}
      {!loading && data.businesses.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No businesses match.</p>
      )}

      {data.businesses.map((b) => {
        const isExpanded = expandedId === b.id;
        return (
          <div key={b.id} className="card" style={{ padding: 12, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: 13, color: 'var(--navy)', margin: 0 }}>{b.name} ({b.type})</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                  Owner {b.owner_name} · {b.location_island || 'no island'} · {b.approval_status} · {b.account_status}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setExpandedId(isExpanded ? null : b.id)}>
                  {isExpanded ? 'Hide details' : 'View details'}
                </button>
                {b.account_status === 'active' ? (
                  <button
                    className="btn-secondary"
                    style={{ padding: '4px 10px', fontSize: 12, background: 'var(--coral)', color: '#fff' }}
                    onClick={() => handleSuspend(b.id)}
                  >
                    Suspend
                  </button>
                ) : (
                  <button className="btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => handleReinstate(b.id)}>
                    Reinstate
                  </button>
                )}
              </div>
            </div>
            {isExpanded && <BusinessDetailPreview businessId={b.id} />}
          </div>
        );
      })}

      {data.total > data.limit && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
          <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} disabled={data.page <= 1} onClick={() => load(data.page - 1)}>
            ← Prev
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Page {data.page} of {totalPages}</span>
          <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} disabled={data.page >= totalPages} onClick={() => load(data.page + 1)}>
            Next →
          </button>
        </div>
      )}
    </section>
  );
}

// POST /api/payouts/run — was already correctly gated server-side, just had
// no trigger anywhere. Confirms before running (it moves real money/escrow
// state) and keeps the last run's result on screen since there's no
// separate "last run" endpoint to read it back from after a reload.
function PayoutsSection() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function handleRun() {
    const confirmed = window.confirm(
      'Run a payout batch now? This pays out every business with a released, not-yet-paid-out booking or order.'
    );
    if (!confirmed) return;
    setRunning(true);
    setError('');
    try {
      const data = await runPayouts();
      setResult({ ...data, ranAt: new Date().toLocaleString() });
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="card" style={{ padding: 16, marginBottom: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', margin: 0 }}>Payout run</p>
        <button className="btn-primary" onClick={handleRun} disabled={running}>
          {running ? 'Running…' : 'Run payouts'}
        </button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
        Aggregates every released booking/order per business into a payout, deducting the 1% commission.
      </p>

      {error && <p className="error-text">{error}</p>}

      {result && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 6px' }}>
            Last run {result.ranAt} — {result.payouts_created} payout{result.payouts_created === 1 ? '' : 's'} created.
          </p>
          {result.results.map((r) => (
            <p key={r.payout_id} style={{ fontSize: 12, color: 'var(--navy)', margin: '2px 0' }}>
              ${r.amount} to business {r.business_id} ({r.items} item{r.items === 1 ? '' : 's'})
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

// GET /api/admin/support-tickets — admin-side queue. Reply/close reuse the
// same routes the ticket's own submitter uses (routes/support.js).
function SupportTicketsSection() {
  const [data, setData] = useState({ tickets: [], total: 0, page: 1, limit: 20 });
  const [status, setStatus] = useState('open');
  const [expandedId, setExpandedId] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  function load(page = 1, statusFilter = status) {
    setLoading(true);
    getSupportTickets({ status: statusFilter || undefined, page })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(1); }, []);

  function handleStatusChange(next) {
    setStatus(next);
    load(1, next);
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.limit));

  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', margin: 0 }}>
          Support tickets ({data.total})
        </p>
        <select className="input-field" value={status} onChange={(e) => handleStatusChange(e.target.value)} style={{ maxWidth: 140 }}>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="">All</option>
        </select>
      </div>

      {error && <p className="error-text">{error}</p>}
      {loading && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>}
      {!loading && data.tickets.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No tickets.</p>
      )}

      {data.tickets.map((t) => (
        <SupportTicketRow
          key={t.id}
          ticket={t}
          expanded={expandedId === t.id}
          onToggle={() => setExpandedId(expandedId === t.id ? null : t.id)}
          onChanged={() => load(data.page)}
        />
      ))}

      {data.total > data.limit && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
          <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} disabled={data.page <= 1} onClick={() => load(data.page - 1)}>
            ← Prev
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Page {data.page} of {totalPages}</span>
          <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} disabled={data.page >= totalPages} onClick={() => load(data.page + 1)}>
            Next →
          </button>
        </div>
      )}
    </section>
  );
}

function SupportTicketRow({ ticket, expanded, onToggle, onChanged }) {
  const [thread, setThread] = useState(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!expanded) return;
    getSupportTicket(ticket.id).then(setThread).catch((err) => setError(err.message));
  }, [expanded, ticket.id]);

  async function handleReply(e) {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    setError('');
    try {
      await replyToSupportTicket(ticket.id, reply.trim());
      setReply('');
      const data = await getSupportTicket(ticket.id);
      setThread(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleClose() {
    setBusy(true);
    setError('');
    try {
      await closeSupportTicket(ticket.id);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ padding: 12, marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ fontSize: 13, color: 'var(--navy)', margin: 0 }}>{ticket.subject}</p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
            {ticket.submitted_by} ({ticket.is_business ? 'business' : 'user'}) · {ticket.status}
          </p>
        </div>
        <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={onToggle}>
          {expanded ? 'Hide' : 'Open'}
        </button>
      </div>

      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          {!thread && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading…</p>}
          {thread && thread.messages.map((m) => (
            <p key={m.id} style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 6px' }}>
              <strong style={{ color: 'var(--navy)' }}>{m.sender}:</strong> {m.text}
            </p>
          ))}

          {error && <p className="error-text">{error}</p>}

          {ticket.status !== 'closed' && (
            <>
              <form onSubmit={handleReply} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input
                  className="input-field"
                  placeholder="Reply…"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  style={{ flex: 1 }}
                  disabled={busy}
                />
                <button className="btn-primary" type="submit" disabled={busy}>Send</button>
              </form>
              <button
                className="btn-secondary"
                style={{ padding: '4px 10px', fontSize: 12, marginTop: 8 }}
                onClick={handleClose}
                disabled={busy}
              >
                Close ticket
              </button>
            </>
          )}
        </div>
      )}
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
// back to following prefers-color-scheme. No dedicated Settings/Profile
// page exists in the admin console, so this lives on the dashboard itself.
function AppearanceSection() {
  const { override, setOverride } = useTheme();

  return (
    <section className="card" style={{ padding: 16, marginBottom: 28 }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 10 }}>
        Appearance
      </p>
      <div style={{ display: 'flex', gap: 6, maxWidth: 320 }}>
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
    </section>
  );
}
