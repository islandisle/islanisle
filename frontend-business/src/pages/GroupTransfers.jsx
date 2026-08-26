import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createGroupTransfer, getMyGroupTransfers, getGroupTransferManifest,
  boardGroupTransferGuestByBooking, boardGroupTransferGuest, markGroupTransferGuestNoShow,
} from '../api/client';
import CheckInScanner from '../components/CheckInScanner';
import GuestPicker from '../components/GuestPicker';

const BOARDED_STATUS_LABEL = { pending: 'Pending', boarded: 'Boarded', 'no-show': 'No-show' };

// Batch 19 — guesthouse-arranged guest transfers. Shows one of two views
// depending on this account's business type: a guesthouse arranges a
// shared speedboat transfer for its guests; a speedboat operator sees the
// resulting manifest and boards guests (QR scan for a registered guest's
// existing booking id, manual for a placeholder guest with no account).
//
// Batch 21: guest selection now uses the shared GuestPicker component
// (also used by B2B.jsx) instead of two separate raw comma-separated
// text fields (one for user ids, one for plain names) — it sources real
// guest names from this guesthouse's current guests, with manual-add
// still available here (unlike B2B) since group_booking_guests.plain_name
// genuinely supports a no-account guest.
export default function GroupTransfers() {
  const navigate = useNavigate();
  const [business] = useState(() => {
    const saved = localStorage.getItem('atollisle_business');
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    if (!localStorage.getItem('atollisle_business_token')) {
      navigate('/login');
    }
  }, []);

  if (!business) return null;

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: 16 }}>
      <button className="btn-secondary" onClick={() => navigate('/dashboard')} style={{ marginBottom: 16 }}>
        ← Back
      </button>

      <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', marginBottom: 16 }}>
        Group transfers
      </h1>

      {business.type === 'guesthouse' && <GuesthouseView business={business} />}
      {business.type === 'speedboat' && <SpeedboatView business={business} />}
      {business.type !== 'guesthouse' && business.type !== 'speedboat' && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Group transfers are for guesthouses (arranging one) and speedboat operators (boarding one).
        </p>
      )}
    </div>
  );
}

function GuesthouseView({ business }) {
  const [transfers, setTransfers] = useState([]);
  const [error, setError] = useState('');

  function load() {
    getMyGroupTransfers(business.id).then((d) => setTransfers(d.group_bookings || [])).catch((err) => setError(err.message));
  }

  useEffect(() => { load(); }, []);

  return (
    <>
      <NewTransferForm businessId={business.id} businessType={business.type} onCreated={load} />

      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', margin: '20px 0 10px' }}>
        Your arranged transfers
      </p>
      {error && <p className="error-text">{error}</p>}
      {transfers.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>None yet.</p>}
      {transfers.map((t) => (
        <div key={t.id} className="card" style={{ padding: 12, marginBottom: 8 }}>
          <p style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 2px' }}>
            {t.listing_title} — {t.speedboat_business_name}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 6px' }}>
            {new Date(t.eta).toLocaleString()} · payer: {t.payer}
            {t.discount_percent != null && ` · ${t.discount_percent}% off`}
          </p>
          {(t.guests || []).map((g) => (
            <p key={g.id} style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0' }}>
              • {g.name} — {BOARDED_STATUS_LABEL[g.boarded_status] || g.boarded_status}
            </p>
          ))}
        </div>
      ))}
    </>
  );
}

function NewTransferForm({ businessId, businessType, onCreated }) {
  const [routeId, setRouteId] = useState('');
  const [eta, setEta] = useState('');
  const [payer, setPayer] = useState('guesthouse');
  const [discountPercent, setDiscountPercent] = useState('');
  const [guests, setGuests] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      // Strip the display-only `name` field GuestPicker adds — the
      // backend only wants user_id/plain_name.
      const guestPayload = guests.map(({ user_id, plain_name }) => (user_id ? { user_id } : { plain_name }));
      await createGroupTransfer(businessId, {
        route_id: routeId,
        eta: new Date(eta).toISOString(),
        payer,
        discount_percent: discountPercent ? Number(discountPercent) : null,
        guests: guestPayload,
      });
      setRouteId(''); setEta(''); setDiscountPercent(''); setGuests([]);
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
      <button className="btn-primary" onClick={() => setOpen(true)}>
        + Arrange a transfer
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)' }}>Arrange a transfer</p>
      <input className="input-field" placeholder="Speedboat listing ID" value={routeId} onChange={(e) => setRouteId(e.target.value)} />
      <input className="input-field" type="datetime-local" value={eta} onChange={(e) => setEta(e.target.value)} />
      <select className="input-field" value={payer} onChange={(e) => setPayer(e.target.value)}>
        <option value="guesthouse">Guesthouse pays</option>
        <option value="tourist">Guest pays</option>
      </select>
      <input className="input-field" type="number" placeholder="Discount % (optional)" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} />
      <GuestPicker
        businessId={businessId}
        businessType={businessType}
        selectedGuests={guests}
        onChange={setGuests}
      />
      {error && <p className="error-text">{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)} disabled={submitting}>Cancel</button>
        <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={submitting || guests.length === 0}>
          {submitting ? 'Arranging…' : 'Arrange transfer'}
        </button>
      </div>
    </form>
  );
}

function SpeedboatView({ business }) {
  const [manifest, setManifest] = useState([]);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState('');

  function load() {
    getGroupTransferManifest(business.id).then((d) => setManifest(d.group_bookings || [])).catch((err) => setError(err.message));
  }

  useEffect(() => { load(); }, []);

  async function handleScan(code, resumeScanning) {
    try {
      await boardGroupTransferGuestByBooking(code);
      setScanMessage('Boarded.');
      load();
    } catch (err) {
      setScanMessage(err.message);
      resumeScanning();
    }
  }

  async function handleManualBoard(guestId) {
    try {
      await boardGroupTransferGuest(guestId);
      load();
    } catch (err) {
      window.alert(err.message);
    }
  }

  async function handleNoShow(guestId) {
    try {
      await markGroupTransferGuestNoShow(guestId);
      load();
    } catch (err) {
      window.alert(err.message);
    }
  }

  return (
    <>
      <button className="btn-secondary" style={{ marginBottom: 16 }} onClick={() => setScanning((v) => !v)}>
        {scanning ? 'Stop scanning' : 'Scan to board'}
      </button>
      {scanning && (
        <div style={{ marginBottom: 16 }}>
          <CheckInScanner onScan={handleScan} />
          {scanMessage && <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{scanMessage}</p>}
        </div>
      )}

      {error && <p className="error-text">{error}</p>}
      {manifest.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No group transfers arranged against your listings yet.</p>}
      {manifest.map((t) => (
        <div key={t.id} className="card" style={{ padding: 12, marginBottom: 8 }}>
          <p style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 2px' }}>
            {t.listing_title} — arranged by {t.guesthouse_name}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
            {new Date(t.eta).toLocaleString()}
          </p>
          {(t.guests || []).map((g) => (
            <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
              <span style={{ fontSize: 12, color: 'var(--navy)' }}>
                {g.user_name || g.plain_name} — {BOARDED_STATUS_LABEL[g.boarded_status] || g.boarded_status}
              </span>
              {g.boarded_status === 'pending' && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-secondary" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => handleNoShow(g.id)}>
                    No-show
                  </button>
                  <button className="btn-primary" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => handleManualBoard(g.id)}>
                    Board
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
