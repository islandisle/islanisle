import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getConnectedBusinesses, connectToBusiness, checkAvailability, createAgentBooking,
  getMyAgentBookings, getMyCommissions, getThread, sendMessage,
} from '../api/client';
import { useModalA11y } from '../useModalA11y';

// MVP agent portal — script Section 12's Agent account type. Scoped down
// per explicit direction: connect to businesses, check availability, book
// on behalf of a guest, track bookings/commission, and chat (reusing the
// generic messages API — see backend/src/routes/messages.js) with either
// a connected business or a guest from a past booking. Deferred: a real
// business directory to connect to (this is a manual ID box, the same
// starting point bookings/admin moderation both had before a browsable
// list was built later) and payout of held commissions.
export default function Dashboard() {
  const navigate = useNavigate();
  const [agent] = useState(() => {
    const saved = localStorage.getItem('atollisle_agent');
    return saved ? JSON.parse(saved) : null;
  });
  const [businesses, setBusinesses] = useState([]);
  const [agentBookings, setAgentBookings] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [error, setError] = useState('');
  const [chatWith, setChatWith] = useState(null); // { role, id, label } or null

  useEffect(() => {
    if (!localStorage.getItem('atollisle_agent_token')) {
      navigate('/login');
      return;
    }
    loadAll();
  }, []);

  function loadAll() {
    getConnectedBusinesses().then((d) => setBusinesses(d.businesses || [])).catch((err) => setError(err.message));
    getMyAgentBookings().then((d) => setAgentBookings(d.agent_bookings || [])).catch((err) => setError(err.message));
    getMyCommissions().then((d) => setCommissions(d.commissions || [])).catch((err) => setError(err.message));
  }

  function handleLogout() {
    localStorage.removeItem('atollisle_agent_token');
    localStorage.removeItem('atollisle_agent');
    navigate('/login');
  }

  if (!agent) {
    navigate('/login');
    return null;
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', margin: 0 }}>{agent.name}</h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Approval: {agent.approval_status}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={() => navigate('/settings')}>Settings</button>
          <button className="btn-secondary" onClick={handleLogout}>Log out</button>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      {agent.approval_status !== 'approved' ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Your account is pending Super Admin approval — connecting to businesses and making bookings will be available once approved.
        </p>
      ) : (
        <>
          <ConnectSection onConnected={loadAll} />
          <BusinessesSection businesses={businesses} onChat={(b) => setChatWith({ role: 'business', id: b.id, label: b.name })} />
          <BookingForm businesses={businesses} onBooked={loadAll} />
          <BookingsSection agentBookings={agentBookings} onChat={setChatWith} />
          <CommissionsSection commissions={commissions} />
        </>
      )}

      {chatWith && <ChatPanel with={chatWith} onClose={() => setChatWith(null)} />}
    </div>
  );
}

function ConnectSection({ onConnected }) {
  const [businessId, setBusinessId] = useState('');
  const [status, setStatus] = useState('');

  async function handleConnect() {
    if (!businessId.trim()) return;
    try {
      const res = await connectToBusiness(businessId.trim());
      setStatus(`Connected to ${res.business.name}.`);
      setBusinessId('');
      onConnected();
    } catch (err) {
      setStatus(err.message);
    }
  }

  return (
    <div className="card" style={{ padding: 16, marginBottom: 20 }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 8 }}>Connect to a business</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="input-field" placeholder="Business ID" value={businessId} onChange={(e) => setBusinessId(e.target.value)} />
        <button className="btn-primary" onClick={handleConnect}>Connect</button>
      </div>
      {status && <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>{status}</p>}
    </div>
  );
}

function BusinessesSection({ businesses, onChat }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 10 }}>
        Connected businesses ({businesses.length})
      </p>
      {businesses.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>None yet — connect above.</p>}
      {businesses.map((b) => (
        <div key={b.id} className="card" style={{ padding: 12, marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: 13, color: 'var(--navy)', margin: 0 }}>{b.name} ({b.type})</p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                {b.listings?.length || 0} bookable listing{b.listings?.length === 1 ? '' : 's'} · {b.location_island || 'no island'}
              </p>
            </div>
            <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => onChat(b)}>
              Chat
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function BookingForm({ businesses, onBooked }) {
  const [businessId, setBusinessId] = useState('');
  const [listingId, setListingId] = useState('');
  const [slotStart, setSlotStart] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestUserId, setGuestUserId] = useState('');
  const [commissionRate, setCommissionRate] = useState('10');
  const [availability, setAvailability] = useState(null);
  const [checking, setChecking] = useState(false);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const listings = businesses.find((b) => b.id === businessId)?.listings || [];

  async function handleCheck() {
    if (!listingId || !slotStart) return;
    setChecking(true);
    setAvailability(null);
    try {
      const res = await checkAvailability(listingId, slotStart);
      setAvailability(res);
    } catch (err) {
      setAvailability({ available: false, error: err.message });
    } finally {
      setChecking(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!businessId || !listingId || !slotStart || (!guestName.trim() && !guestUserId.trim())) {
      setError('Business, listing, date/time, and a guest (name or account id) are required.');
      return;
    }
    setBooking(true);
    setError('');
    setSuccess('');
    try {
      const res = await createAgentBooking({
        business_id: businessId, listing_id: listingId, slot_start: slotStart,
        guest_user_id: guestUserId.trim() || undefined, guest_name: guestName.trim() || undefined,
        commission_rate: Number(commissionRate) || 0,
      });
      setSuccess(res.message);
      setListingId(''); setSlotStart(''); setGuestName(''); setGuestUserId(''); setAvailability(null);
      onBooked();
    } catch (err) {
      setError(err.message);
    } finally {
      setBooking(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ padding: 16, marginBottom: 20 }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 10 }}>Book on behalf of a guest</p>

      <label htmlFor="booking-business" style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Business</label>
      <select id="booking-business" className="input-field" value={businessId} onChange={(e) => { setBusinessId(e.target.value); setListingId(''); setAvailability(null); }} style={{ marginBottom: 10 }}>
        <option value="">Select a connected business…</option>
        {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>

      <label htmlFor="booking-listing" style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Listing</label>
      <select id="booking-listing" className="input-field" value={listingId} onChange={(e) => { setListingId(e.target.value); setAvailability(null); }} disabled={!businessId} style={{ marginBottom: 10 }}>
        <option value="">Select a listing…</option>
        {listings.map((l) => <option key={l.id} value={l.id}>{l.title} — ${l.tourist_price}</option>)}
      </select>

      <label htmlFor="booking-slot" style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Date &amp; time</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input
          id="booking-slot"
          className="input-field"
          type="datetime-local"
          value={slotStart}
          onChange={(e) => { setSlotStart(e.target.value); setAvailability(null); }}
          style={{ flex: 1 }}
        />
        <button type="button" className="btn-secondary" onClick={handleCheck} disabled={!listingId || !slotStart || checking}>
          {checking ? 'Checking…' : 'Check'}
        </button>
      </div>
      {availability && (
        <p style={{ fontSize: 12, color: availability.available ? 'var(--lagoon)' : 'var(--coral)', marginBottom: 10 }}>
          {availability.error || (availability.available
            ? `Available — ${availability.capacity_remaining} of ${availability.capacity} spot(s) left.`
            : 'Fully booked for that slot.')}
        </p>
      )}

      <label htmlFor="booking-guest-user-id" style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
        Guest — existing account ID (optional)
      </label>
      <input id="booking-guest-user-id" className="input-field" placeholder="User ID, if they have an account" value={guestUserId} onChange={(e) => setGuestUserId(e.target.value)} style={{ marginBottom: 10 }} />

      <label htmlFor="booking-guest-name" style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
        Guest — name (if no account)
      </label>
      <input id="booking-guest-name" className="input-field" placeholder="Guest name" value={guestName} onChange={(e) => setGuestName(e.target.value)} style={{ marginBottom: 10 }} />

      <label htmlFor="booking-commission-rate" style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
        Your commission (%)
      </label>
      <input id="booking-commission-rate" className="input-field" type="number" min="0" max="100" step="0.5" value={commissionRate} onChange={(e) => setCommissionRate(e.target.value)} style={{ marginBottom: 10 }} />

      {error && <p className="error-text">{error}</p>}
      {success && <p style={{ fontSize: 13, color: 'var(--lagoon)' }}>{success}</p>}

      <button className="btn-primary" type="submit" style={{ width: '100%' }} disabled={booking}>
        {booking ? 'Booking…' : 'Confirm booking'}
      </button>
    </form>
  );
}

const AGENT_BOOKING_STATUS_LABEL = { confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled' };

function BookingsSection({ agentBookings, onChat }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 10 }}>
        Your bookings ({agentBookings.length})
      </p>
      {agentBookings.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>None yet.</p>}
      {agentBookings.map((b) => (
        <div key={b.id} className="card" style={{ padding: 12, marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 2px' }}>
                {b.listing_title} — {b.guest_account_name || b.guest_name} ({b.business_name})
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
                {b.slot_start && new Date(b.slot_start).toLocaleString()} · {AGENT_BOOKING_STATUS_LABEL[b.status] || b.status}
                {' · commission '}{b.commission_rate}% (${b.commission_amount})
              </p>
            </div>
            {b.guest_account_name && (
              <button
                className="btn-secondary"
                style={{ padding: '4px 10px', fontSize: 12 }}
                onClick={() => onChat({ role: 'user', id: b.guest_user_id, label: b.guest_account_name })}
              >
                Chat
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function CommissionsSection({ commissions }) {
  const total = commissions.reduce((sum, c) => sum + Number(c.amount), 0);
  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 10 }}>
        Commissions (${total.toFixed(2)} total)
      </p>
      {commissions.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>None yet — commission is recorded once a booking is marked fulfilled.</p>}
      {commissions.map((c) => (
        <div key={c.id} className="card" style={{ padding: 12, marginBottom: 8 }}>
          <p style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 2px' }}>${c.amount} — {c.business_name}</p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>{c.status}{c.schedule_date && ` · ${c.schedule_date}`}</p>
        </div>
      ))}
    </div>
  );
}

// Reuses the generic messages API (backend/src/routes/messages.js) shared
// with tourist<->business chat — this is just a UI over the same table.
function ChatPanel({ with: target, onClose }) {
  const modalRef = useModalA11y(onClose);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    getThread(target.role, target.id)
      .then((d) => setMessages(d.messages || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [target.role, target.id]);

  async function handleSend(e) {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      await sendMessage(target.role, target.id, text.trim());
      setText('');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(11,46,61,0.5)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="card"
        role="dialog"
        aria-modal="true"
        aria-label={`Chat with ${target.label}`}
        style={{ width: '100%', maxWidth: 480, borderRadius: '20px 20px 0 0', padding: 16, maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', margin: 0 }}>Chat with {target.label}</p>
          <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={onClose} aria-label="Close chat">Close</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', marginBottom: 10 }}>
          {loading && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>}
          {error && <p className="error-text">{error}</p>}
          {!loading && messages.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No messages yet.</p>}
          {messages.map((m) => (
            <p key={m.id} style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 8px' }}>
              <strong>{m.sender_role === 'agent' ? 'You' : m.sender_role}:</strong> {m.text}
            </p>
          ))}
        </div>

        <form onSubmit={handleSend} style={{ display: 'flex', gap: 8 }}>
          <input className="input-field" placeholder="Message…" value={text} onChange={(e) => setText(e.target.value)} style={{ flex: 1 }} />
          <button className="btn-primary" type="submit">Send</button>
        </form>
      </div>
    </div>
  );
}
