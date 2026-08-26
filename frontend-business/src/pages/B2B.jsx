import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getStandingDiscounts, createStandingDiscount, deleteStandingDiscount,
  createB2BRequest, getOutgoingB2BRequests, getIncomingB2BRequests,
  acceptB2BRequest, rejectB2BRequest,
} from '../api/client';

// Batch 19 — B2B requests + standing discounts. [PHASE 2] tables that had
// no frontend at all before this. Model: one business arranges something
// with another on behalf of its own guests (a guesthouse booking an
// excursion for guests staying with it, most typically), at either a
// pre-agreed "standing" rate or a one-off negotiated one.
//
// Guest selection is a plain comma-separated list of guest user ids here
// rather than a picker UI — this app has no single "my current guests"
// endpoint outside the guesthouse check-in flow (checkin.js), and a
// requesting business isn't necessarily a guesthouse, so a business
// already knows its guests' ids from its own bookings/arrivals lists.
export default function B2B() {
  const navigate = useNavigate();
  const [business] = useState(() => {
    const saved = localStorage.getItem('atollisle_business');
    return saved ? JSON.parse(saved) : null;
  });
  const [discounts, setDiscounts] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [error, setError] = useState('');

  function loadAll() {
    if (!business) return;
    getStandingDiscounts(business.id).then((d) => setDiscounts(d.standing_discounts || [])).catch((err) => setError(err.message));
    getOutgoingB2BRequests(business.id).then((d) => setOutgoing(d.requests || [])).catch((err) => setError(err.message));
    getIncomingB2BRequests(business.id).then((d) => setIncoming(d.requests || [])).catch((err) => setError(err.message));
  }

  useEffect(() => {
    if (!localStorage.getItem('atollisle_business_token')) {
      navigate('/login');
      return;
    }
    loadAll();
  }, [business]);

  async function handleAccept(id) {
    try {
      await acceptB2BRequest(id);
      loadAll();
    } catch (err) {
      window.alert(err.message);
    }
  }

  async function handleReject(id) {
    try {
      await rejectB2BRequest(id);
      loadAll();
    } catch (err) {
      window.alert(err.message);
    }
  }

  if (!business) return null;

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: 16 }}>
      <button className="btn-secondary" onClick={() => navigate('/dashboard')} style={{ marginBottom: 16 }}>
        ← Back
      </button>

      <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', marginBottom: 16 }}>
        B2B partnerships
      </h1>

      {error && <p className="error-text">{error}</p>}

      <StandingDiscountsSection businessId={business.id} discounts={discounts} onChanged={loadAll} />
      <NewRequestSection businessId={business.id} onCreated={loadAll} />

      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', margin: '24px 0 10px' }}>
        Incoming requests ({incoming.filter((r) => r.status === 'pending').length} pending)
      </p>
      {incoming.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>None yet.</p>}
      {incoming.map((r) => (
        <div key={r.id} className="card" style={{ padding: 12, marginBottom: 8 }}>
          <p style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 2px' }}>
            {r.requesting_business_name} — {r.listing_title} ({r.guest_count} guest{r.guest_count === 1 ? '' : 's'})
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
            {new Date(r.slot_start).toLocaleString()} · payer: {r.payer}
            {r.discount_percent != null && ` · ${r.discount_percent}% off (${r.discount_source})`}
            {' · '}{r.status}
          </p>
          {r.status === 'pending' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => handleReject(r.id)}>
                Reject
              </button>
              <button className="btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => handleAccept(r.id)}>
                Accept
              </button>
            </div>
          )}
        </div>
      ))}

      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', margin: '24px 0 10px' }}>
        Outgoing requests
      </p>
      {outgoing.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>None yet.</p>}
      {outgoing.map((r) => (
        <div key={r.id} className="card" style={{ padding: 12, marginBottom: 8 }}>
          <p style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 2px' }}>
            {r.receiving_business_name} — {r.listing_title} ({r.guest_count} guest{r.guest_count === 1 ? '' : 's'})
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
            {new Date(r.slot_start).toLocaleString()} · {r.status}
          </p>
        </div>
      ))}
    </div>
  );
}

function StandingDiscountsSection({ businessId, discounts, onChanged }) {
  const [partnerBusinessId, setPartnerBusinessId] = useState('');
  const [discountPercent, setDiscountPercent] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await createStandingDiscount(businessId, { partner_business_id: partnerBusinessId, discount_percent: Number(discountPercent) });
      setPartnerBusinessId('');
      setDiscountPercent('');
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(discountId) {
    try {
      await deleteStandingDiscount(businessId, discountId);
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 10 }}>
        Standing discounts you offer
      </p>
      {error && <p className="error-text">{error}</p>}
      {discounts.filter((d) => d.offering_business_id === businessId).length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>None yet.</p>
      )}
      {discounts.filter((d) => d.offering_business_id === businessId).map((d) => (
        <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 13, color: 'var(--navy)' }}>{d.partner_business_name} — {d.discount_percent}%</span>
          <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => handleDelete(d.id)}>
            Remove
          </button>
        </div>
      ))}
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input
          className="input-field"
          placeholder="Partner business ID"
          value={partnerBusinessId}
          onChange={(e) => setPartnerBusinessId(e.target.value)}
          style={{ flex: 2 }}
        />
        <input
          className="input-field"
          type="number"
          placeholder="%"
          value={discountPercent}
          onChange={(e) => setDiscountPercent(e.target.value)}
          style={{ flex: 1 }}
        />
        <button className="btn-primary" type="submit">Add</button>
      </form>
    </div>
  );
}

function NewRequestSection({ businessId, onCreated }) {
  const [receivingBusinessId, setReceivingBusinessId] = useState('');
  const [listingId, setListingId] = useState('');
  const [payer, setPayer] = useState('business');
  const [roomNumber, setRoomNumber] = useState('');
  const [slotStart, setSlotStart] = useState('');
  const [guestIds, setGuestIds] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await createB2BRequest(businessId, {
        receiving_business_id: receivingBusinessId,
        listing_id: listingId,
        payer,
        room_number: roomNumber || null,
        slot_start: new Date(slotStart).toISOString(),
        guest_user_ids: guestIds.split(',').map((s) => s.trim()).filter(Boolean),
      });
      setReceivingBusinessId(''); setListingId(''); setRoomNumber(''); setSlotStart(''); setGuestIds('');
      setOpen(false);
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button className="btn-primary" style={{ marginBottom: 16 }} onClick={() => setOpen(true)}>
        + New B2B request
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ padding: 16, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 4 }}>New B2B request</p>
      <input className="input-field" placeholder="Receiving business ID" value={receivingBusinessId} onChange={(e) => setReceivingBusinessId(e.target.value)} />
      <input className="input-field" placeholder="Listing ID" value={listingId} onChange={(e) => setListingId(e.target.value)} />
      <select className="input-field" value={payer} onChange={(e) => setPayer(e.target.value)}>
        <option value="business">Business pays</option>
        <option value="tourist">Guest pays</option>
      </select>
      <input className="input-field" placeholder="Room number (optional)" value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} />
      <input className="input-field" type="datetime-local" value={slotStart} onChange={(e) => setSlotStart(e.target.value)} />
      <input className="input-field" placeholder="Guest user IDs (comma-separated)" value={guestIds} onChange={(e) => setGuestIds(e.target.value)} />
      {error && <p className="error-text">{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)} disabled={submitting}>Cancel</button>
        <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={submitting}>
          {submitting ? 'Sending…' : 'Send request'}
        </button>
      </div>
    </form>
  );
}
