import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createBusiness, getMyListings, createListing, markBookingFulfilled } from '../api/client';

const BUSINESS_TYPES = ['guesthouse', 'restaurant', 'excursion', 'speedboat', 'shop'];

export default function Dashboard() {
  const navigate = useNavigate();
  const [business, setBusiness] = useState(() => {
    const saved = localStorage.getItem('atollisle_business');
    return saved ? JSON.parse(saved) : null;
  });
  const [listings, setListings] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!localStorage.getItem('atollisle_business_token')) {
      navigate('/login');
    }
  }, []);

  useEffect(() => {
    if (business) loadListings();
  }, [business]);

  function loadListings() {
    getMyListings(business.id)
      .then((data) => setListings(data.listings))
      .catch((err) => setError(err.message));
  }

  function handleBusinessCreated(newBusiness) {
    setBusiness(newBusiness);
    localStorage.setItem('atollisle_business', JSON.stringify(newBusiness));
  }

  if (!business) {
    return <CreateBusinessForm onCreated={handleBusinessCreated} />;
  }

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: 16 }}>
      <div style={{ background: 'var(--lagoon)', color: '#fff', padding: 16, borderRadius: 12, marginBottom: 20 }}>
        <p style={{ fontSize: 12, opacity: 0.8, margin: '0 0 4px' }}>{business.type}</p>
        <p style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{business.name}</p>
        <p style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>
          Approval: {business.approval_status || 'pending'}
        </p>
      </div>

      {error && <p className="error-text">{error}</p>}

      <AddListingForm businessId={business.id} onCreated={loadListings} />

      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', margin: '24px 0 10px' }}>
        Your listings
      </p>
      {listings.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No listings yet — add one above.</p>
      )}
      {listings.map((l) => (
        <div key={l.id} className="card" style={{ padding: 12, marginBottom: 10 }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', margin: '0 0 2px' }}>{l.title}</p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
            ${l.tourist_price} tourist · ${l.local_price} local · {l.approval_status}
          </p>
        </div>
      ))}

      <BookingFulfillment />
    </div>
  );
}

function CreateBusinessForm({ onCreated }) {
  const [type, setType] = useState(BUSINESS_TYPES[0]);
  const [name, setName] = useState('');
  const [locationIsland, setLocationIsland] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const result = await createBusiness({ type, name, location_island: locationIsland });
      onCreated(result.business);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '32px 20px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>
        Set up your business
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
        You only pay 1% when a guest pays and gets their stay/service — nothing upfront, nothing if they don't book.
      </p>

      <form onSubmit={handleSubmit}>
        <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
          What kind of business are you?
        </label>
        <select className="input-field" value={type} onChange={(e) => setType(e.target.value)} style={{ marginBottom: 14 }}>
          {BUSINESS_TYPES.map((t) => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>

        <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
          Business name
        </label>
        <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 14 }} />

        <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
          Island
        </label>
        <input className="input-field" value={locationIsland} onChange={(e) => setLocationIsland(e.target.value)} style={{ marginBottom: 20 }} />

        {error && <p className="error-text">{error}</p>}
        <button className="btn-primary" type="submit" style={{ width: '100%' }} disabled={submitting}>
          {submitting ? 'Creating…' : 'Create business'}
        </button>
      </form>
    </div>
  );
}

function AddListingForm({ businessId, onCreated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [touristPrice, setTouristPrice] = useState('');
  const [localPrice, setLocalPrice] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await createListing(businessId, {
        title,
        description,
        tourist_price: Number(touristPrice),
        local_price: Number(localPrice),
      });
      setTitle('');
      setDescription('');
      setTouristPrice('');
      setLocalPrice('');
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
        + Add listing
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ padding: 16 }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 12 }}>New listing</p>
      <input className="input-field" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} style={{ marginBottom: 10 }} />
      <input className="input-field" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} style={{ marginBottom: 10 }} />
      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <input className="input-field" type="number" placeholder="Tourist price" value={touristPrice} onChange={(e) => setTouristPrice(e.target.value)} />
        <input className="input-field" type="number" placeholder="Local price" value={localPrice} onChange={(e) => setLocalPrice(e.target.value)} />
      </div>
      {error && <p className="error-text">{error}</p>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
        <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={submitting}>
          {submitting ? 'Saving…' : 'Save listing'}
        </button>
      </div>
    </form>
  );
}

function BookingFulfillment() {
  const [bookingId, setBookingId] = useState('');
  const [status, setStatus] = useState('');

  async function handleMark() {
    try {
      await markBookingFulfilled(bookingId);
      setStatus('Marked fulfilled — eligible for the next payout run.');
      setBookingId('');
    } catch (err) {
      setStatus(err.message);
    }
  }

  return (
    <div className="card" style={{ padding: 16, marginTop: 20 }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 8 }}>
        Mark a booking fulfilled
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
        A proper bookings list view isn't built yet — this is a manual
        stand-in for the "Mark fulfilled" action described in Section 7.2,
        so the escrow-release payout flow (already built on the backend) has
        something real to trigger against.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="input-field" placeholder="Booking ID" value={bookingId} onChange={(e) => setBookingId(e.target.value)} />
        <button className="btn-primary" onClick={handleMark}>Mark fulfilled</button>
      </div>
      {status && <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>{status}</p>}
    </div>
  );
}
