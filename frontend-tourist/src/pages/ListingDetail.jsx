import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getListingDetail, createBooking } from '../api/client';

export default function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [slotStart, setSlotStart] = useState('');
  const [booking, setBooking] = useState(false);
  const [bookingResult, setBookingResult] = useState(null);

  useEffect(() => {
    getListingDetail(id)
      .then((data) => setListing(data.listing))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleBook() {
    if (!slotStart) {
      setError('Please choose a date/time.');
      return;
    }
    setBooking(true);
    setError('');
    try {
      const result = await createBooking({ listing_id: id, slot_start: slotStart });
      setBookingResult(result);
      // In a real checkout, result.client_secret goes to Stripe Elements
      // here to actually collect payment. That UI isn't built in this pass
      // — see README's "genuinely not here yet" list.
    } catch (err) {
      // Section 9's "Payment failure" popup pattern — offer retry, not a dead end.
      setError(err.message);
    } finally {
      setBooking(false);
    }
  }

  if (loading) return <p style={{ padding: 20 }}>Loading…</p>;
  if (!listing) return <p style={{ padding: 20 }} className="error-text">Listing not found.</p>;

  if (bookingResult) {
    return <BookingPendingPayment result={bookingResult} onDone={() => navigate('/')} />;
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <button className="btn-secondary" onClick={() => navigate(-1)} style={{ marginBottom: 16 }}>
        ← Back
      </button>

      <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>
        {listing.title}
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
        {listing.business_name}
      </p>

      {listing.description && (
        <p style={{ fontSize: 14, color: 'var(--navy)', marginBottom: 20 }}>{listing.description}</p>
      )}

      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>Tourist price</p>
        <p style={{ fontSize: 22, fontWeight: 600, color: 'var(--lagoon)', margin: 0 }}>
          ${listing.tourist_price}
        </p>
      </div>

      <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
        Date &amp; time
      </label>
      <input
        className="input-field"
        type="datetime-local"
        value={slotStart}
        onChange={(e) => setSlotStart(e.target.value)}
        style={{ marginBottom: 16 }}
      />

      {error && <p className="error-text">{error}</p>}

      <button className="btn-primary" style={{ width: '100%' }} onClick={handleBook} disabled={booking}>
        {booking ? 'Booking…' : 'Book now'}
      </button>
    </div>
  );
}

function BookingPendingPayment({ result, onDone }) {
  return (
    <div style={{ maxWidth: 420, margin: '60px auto', padding: 20, textAlign: 'center' }}>
      <div className="card" style={{ padding: 24 }}>
        <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--navy)', marginBottom: 8 }}>
          Almost there
        </p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
          {result.message}
        </p>
        <div style={{ background: 'var(--sand)', borderRadius: 8, padding: 12, marginBottom: 16, textAlign: 'left' }}>
          <PriceLine label="Base price" value={result.price_breakdown.base_price} />
          <PriceLine label="Service fee (2%)" value={result.price_breakdown.tourist_service_fee} />
          <PriceLine label="Total" value={result.price_breakdown.total_charged} bold />
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          Payment collection UI (Stripe Elements) isn't built in this pass —
          the backend already issued a real PaymentIntent (client_secret
          below) for whoever wires up that final step.
        </p>
        <button className="btn-primary" onClick={onDone} style={{ width: '100%' }}>
          Done
        </button>
      </div>
    </div>
  );
}

function PriceLine({ label, value, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: bold ? 600 : 400, marginBottom: 4 }}>
      <span>{label}</span>
      <span>${value}</span>
    </div>
  );
}
