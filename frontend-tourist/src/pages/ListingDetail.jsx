import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getListingDetail, createBooking, createOrder, getBusinessReviews } from '../api/client';

function getCurrentUser() {
  const raw = localStorage.getItem('atollisle_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // shared pending-payment result for both bookings and orders

  const user = getCurrentUser();
  const isLocal = user?.type === 'local';

  useEffect(() => {
    getListingDetail(id)
      .then((data) => setListing(data.listing))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p style={{ padding: 20 }}>Loading…</p>;
  if (!listing) return <p style={{ padding: 20 }} className="error-text">Listing not found.</p>;

  if (result) {
    return <PendingPayment result={result} onDone={() => navigate('/')} />;
  }

  const price = isLocal ? listing.local_price : listing.tourist_price;

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
        {listing.verified_badge && <span style={{ color: 'var(--lagoon)' }}> · Verified</span>}
      </p>

      {listing.description && (
        <p style={{ fontSize: 14, color: 'var(--navy)', marginBottom: 20 }}>{listing.description}</p>
      )}

      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
          {isLocal ? 'Local price' : 'Tourist price'}
        </p>
        <p style={{ fontSize: 22, fontWeight: 600, color: 'var(--lagoon)', margin: 0 }}>
          ${price}
        </p>
      </div>

      {listing.business_type === 'shop' ? (
        <ShopCheckout listing={listing} onSuccess={setResult} error={error} setError={setError} />
      ) : (
        <SlotCheckout listing={listing} onSuccess={setResult} error={error} setError={setError} />
      )}

      <Reviews businessId={listing.business_id} />
    </div>
  );
}

// GET /api/reviews/business/:businessId — public, no auth required. Shown
// on the listing page since a listing's reviews are really the business's
// reviews (reviews.business_id, not listing_id — see schema.sql).
function Reviews({ businessId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getBusinessReviews(businessId)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [businessId]);

  if (error || !data) return null;

  return (
    <div style={{ marginTop: 24 }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 8 }}>
        Reviews
        {data.total > 0 && (
          <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>
            {' '}· {data.average_rating.toFixed(1)} ★ ({data.total})
          </span>
        )}
      </p>
      {data.total === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No reviews yet.</p>
      )}
      {data.reviews.map((r) => (
        <div key={r.id} className="card" style={{ padding: 12, marginBottom: 8 }}>
          <p style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 2px' }}>
            {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)} — {r.reviewer_name}
          </p>
          {r.text && (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>{r.text}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// Guesthouse / restaurant / excursion / speedboat — date/time slot booking.
function SlotCheckout({ listing, onSuccess, error, setError }) {
  const [slotStart, setSlotStart] = useState('');
  const [booking, setBooking] = useState(false);

  async function handleBook() {
    if (!slotStart) {
      setError('Please choose a date/time.');
      return;
    }
    setBooking(true);
    setError('');
    try {
      const res = await createBooking({ listing_id: listing.id, slot_start: slotStart, payment_method: 'pay_at_visit' });
      onSuccess(res);
    } catch (err) {
      // Section 9's "Payment failure" popup pattern — offer retry, not a dead end.
      setError(err.message);
    } finally {
      setBooking(false);
    }
  }

  return (
    <>
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
    </>
  );
}

// Shop — stock-based purchase: quantity + pickup/delivery, not a time slot.
// A shop listing page is a single product; multi-item carts across several
// listings from the same shop aren't built on the frontend yet even though
// POST /api/orders' items array supports it — that's a real, separate gap.
function ShopCheckout({ listing, onSuccess, error, setError }) {
  const [quantity, setQuantity] = useState(1);
  const [fulfillment, setFulfillment] = useState(
    Array.isArray(listing.fulfillment_options) && listing.fulfillment_options.length > 0
      ? listing.fulfillment_options[0]
      : ''
  );
  const [ordering, setOrdering] = useState(false);

  const fulfillmentOptions = Array.isArray(listing.fulfillment_options) ? listing.fulfillment_options : [];
  const outOfStock = listing.stock_count != null && listing.stock_count <= 0;

  async function handleOrder() {
    if (quantity < 1) {
      setError('Quantity must be at least 1.');
      return;
    }
    setOrdering(true);
    setError('');
    try {
      const res = await createOrder({
        items: [{ listing_id: listing.id, quantity }],
        fulfillment_method: fulfillment || undefined,
        payment_method: 'pay_at_visit',
      });
      onSuccess(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setOrdering(false);
    }
  }

  if (outOfStock) {
    return <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Currently out of stock.</p>;
  }

  return (
    <>
      <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
        Quantity
      </label>
      <input
        className="input-field"
        type="number"
        min="1"
        max={listing.stock_count ?? undefined}
        value={quantity}
        onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
        style={{ marginBottom: 16 }}
      />

      {fulfillmentOptions.length > 0 && (
        <>
          <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
            How would you like it?
          </label>
          <select
            className="input-field"
            value={fulfillment}
            onChange={(e) => setFulfillment(e.target.value)}
            style={{ marginBottom: 16 }}
          >
            {fulfillmentOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt === 'pickup' ? 'In-store pickup' : 'Delivery'}
              </option>
            ))}
          </select>
        </>
      )}

      {listing.stock_count != null && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
          {listing.stock_count} left in stock
        </p>
      )}

      {error && <p className="error-text">{error}</p>}
      <button className="btn-primary" style={{ width: '100%' }} onClick={handleOrder} disabled={ordering}>
        {ordering ? 'Placing order…' : 'Buy now'}
      </button>
    </>
  );
}

// Pay at Visit — the schema's payment_method enum already supported this
// alongside 'online', but nothing used it. Bookings/orders created this way
// go straight to 'confirmed' on the backend (see bookings.js / orders.js),
// no payment processor involved at all — settle with the business in
// person. This is deliberately the only path wired up in this pass; the
// 'online' Stripe path still exists on the backend for later, but isn't
// exposed here.
function PendingPayment({ result, onDone }) {
  const isOrder = Boolean(result.order);
  return (
    <div style={{ maxWidth: 420, margin: '60px auto', padding: 20, textAlign: 'center' }}>
      <div className="card" style={{ padding: 24 }}>
        <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--navy)', marginBottom: 8 }}>
          {isOrder ? 'Order confirmed' : 'Booking confirmed'}
        </p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
          {result.message}
        </p>
        <div style={{ background: 'var(--sand)', borderRadius: 8, padding: 12, marginBottom: 16, textAlign: 'left' }}>
          <PriceLine label="Base price" value={result.price_breakdown.base_price} />
          <PriceLine label="Total to pay in person" value={result.price_breakdown.total_charged} bold />
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          You'll find this in "My bookings &amp; orders" on your profile.
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