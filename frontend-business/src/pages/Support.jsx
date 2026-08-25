import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { openSupportTicket, getMySupportTickets, getSupportTicket, replyToSupportTicket } from '../api/client';

// Lightweight "Contact support" entry point — same as frontend-tourist's,
// opened as this business (support_tickets.business_id) rather than as the
// owner's user account. Admin views/responds/closes from the admin console.
export default function Support() {
  const navigate = useNavigate();
  const [business] = useState(() => {
    const saved = localStorage.getItem('atollisle_business');
    return saved ? JSON.parse(saved) : null;
  });
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  function load() {
    if (!business) return;
    setLoading(true);
    getMySupportTickets(business.id)
      .then((data) => setTickets(data.tickets || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!localStorage.getItem('atollisle_business_token')) {
      navigate('/login');
      return;
    }
    load();
  }, []);

  if (!business) {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Set up your business first.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <button className="btn-secondary" onClick={() => navigate('/settings')} style={{ marginBottom: 16 }}>
        ← Back
      </button>

      <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', marginBottom: 16 }}>
        Contact support
      </h1>

      <NewTicketForm businessId={business.id} onCreated={load} />

      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', margin: '24px 0 10px' }}>
        Your tickets
      </p>
      {loading && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading…</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && tickets.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No tickets yet.</p>
      )}

      {tickets.map((t) => (
        <TicketRow
          key={t.id}
          ticket={t}
          expanded={expandedId === t.id}
          onToggle={() => setExpandedId(expandedId === t.id ? null : t.id)}
        />
      ))}
    </div>
  );
}

function NewTicketForm({ businessId, onCreated }) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const res = await openSupportTicket(businessId, { subject, message });
      setSuccess(res.message || "We've received your message.");
      setSubject('');
      setMessage('');
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ padding: 16 }}>
      <label htmlFor="support-subject" style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
        Subject
      </label>
      <input
        id="support-subject"
        className="input-field"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        style={{ marginBottom: 10 }}
      />

      <label htmlFor="support-message" style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
        Message
      </label>
      <textarea
        id="support-message"
        className="input-field"
        rows={4}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        style={{ marginBottom: 10, resize: 'vertical' }}
      />

      {error && <p className="error-text">{error}</p>}
      {success && <p style={{ fontSize: 13, color: 'var(--lagoon)' }}>{success}</p>}

      <button className="btn-primary" type="submit" style={{ width: '100%' }} disabled={submitting || !subject || !message}>
        {submitting ? 'Sending…' : 'Send'}
      </button>
    </form>
  );
}

function TicketRow({ ticket, expanded, onToggle }) {
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

  return (
    <div className="card" style={{ padding: 12, marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ fontSize: 13, color: 'var(--navy)', margin: 0 }}>{ticket.subject}</p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>{ticket.status}</p>
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
              <strong style={{ color: 'var(--navy)' }}>{m.sender === 'admin' ? 'Support' : 'You'}:</strong> {m.text}
            </p>
          ))}

          {error && <p className="error-text">{error}</p>}

          {ticket.status !== 'closed' ? (
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
          ) : (
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>This ticket is closed.</p>
          )}
        </div>
      )}
    </div>
  );
}
