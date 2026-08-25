import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { getMyBookings, getMyOrders, cancelBooking, fileDispute, getMyReviews, submitReview, getMyWaitlist } from '../api/client';

// Same class of gap as the business dashboard's old "type in a Booking ID"
// box: a tourist could book or order something, but had no page anywhere
// showing what they'd booked or ordered, or any way to cancel. The backend
// (GET /api/bookings/mine, GET /api/orders/mine, PATCH /api/bookings/:id/cancel)
// has existed the whole time — this is the first UI to actually use it.
export default function MyActivity() {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [orders, setOrders] = useState([]);
  const [waitlist, setWaitlist] = useState([]);
  const [reviewsByTarget, setReviewsByTarget] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function loadAll() {
    setLoading(true);
    Promise.all([
      getMyBookings().catch(() => ({ bookings: [] })),
      getMyOrders().catch(() => ({ orders: [] })),
      getMyReviews().catch(() => ({ reviews: [] })),
      getMyWaitlist().catch(() => ({ waitlist: [] })),
    ])
      .then(([bookingsData, ordersData, reviewsData, waitlistData]) => {
        setBookings(bookingsData.bookings || []);
        setOrders(ordersData.orders || []);
        setWaitlist(waitlistData.waitlist || []);
        const byTarget = {};
        for (const r of reviewsData.reviews || []) {
          if (r.booking_id) byTarget[`booking:${r.booking_id}`] = r;
          if (r.order_id) byTarget[`order:${r.order_id}`] = r;
        }
        setReviewsByTarget(byTarget);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!localStorage.getItem('atollisle_token')) {
      navigate('/login');
      return;
    }
    loadAll();
  }, []);

  async function handleCancel(id) {
    if (!window.confirm('Cancel this booking? Refund amount depends on the business\u2019s cancellation policy.')) {
      return;
    }
    try {
      await cancelBooking(id, 'user');
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <button className="btn-secondary" onClick={() => navigate('/')} style={{ marginBottom: 16 }}>
        ← Back
      </button>

      <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', marginBottom: 20 }}>
        My bookings &amp; orders
      </h1>

      {loading && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading…</p>}
      {error && <p className="error-text">{error}</p>}

      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 10 }}>
        Bookings
      </p>
      {!loading && bookings.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
          No bookings yet.
        </p>
      )}
      {bookings.map((b) => (
        <BookingRow
          key={b.id}
          booking={b}
          onCancel={handleCancel}
          review={reviewsByTarget[`booking:${b.id}`]}
          onReviewed={loadAll}
        />
      ))}

      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', margin: '24px 0 10px' }}>
        Orders
      </p>
      {!loading && orders.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          No orders yet.
        </p>
      )}
      {orders.map((o) => (
        <OrderRow key={o.id} order={o} review={reviewsByTarget[`order:${o.id}`]} onReviewed={loadAll} />
      ))}

      {waitlist.length > 0 && (
        <>
          <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', margin: '24px 0 10px' }}>
            Waitlist
          </p>
          {waitlist.map((w) => (
            <WaitlistRow key={w.id} entry={w} />
          ))}
        </>
      )}
    </div>
  );
}

const WAITLIST_STATUS_LABEL = {
  waiting: 'Waiting for a spot',
  notified: 'A spot opened — book now!',
};

function WaitlistRow({ entry }) {
  return (
    <div className="card" style={{ padding: 12, marginBottom: 8 }}>
      <p style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 2px' }}>
        {entry.title} — {entry.business_name}
      </p>
      <p style={{ fontSize: 12, color: entry.status === 'notified' ? 'var(--lagoon)' : 'var(--text-secondary)', margin: 0 }}>
        {new Date(entry.requested_slot).toLocaleString()} · {WAITLIST_STATUS_LABEL[entry.status] || entry.status}
      </p>
    </div>
  );
}

const BOOKING_STATUS_LABEL = {
  pending_payment: 'Payment pending',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function BookingRow({ booking, onCancel, review, onReviewed }) {
  const canCancel = booking.status === 'confirmed';
  const isGuesthouse = booking.business_type === 'guesthouse';
  const isCheckedIn = booking.check_in_status === 'checked_in';
  const canCheckIn = isGuesthouse && booking.status === 'confirmed' && !isCheckedIn;

  return (
    <div className="card" style={{ padding: 12, marginBottom: 8 }}>
      <p style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 2px' }}>
        {booking.title} — {booking.business_name}
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
        {new Date(booking.slot_start).toLocaleString()} · ${booking.price_charged} ·{' '}
        {BOOKING_STATUS_LABEL[booking.status] || booking.status}
        {isGuesthouse && isCheckedIn && ` · Checked in — Room ${booking.room_number}`}
        {isGuesthouse && !isCheckedIn && booking.status === 'confirmed' && ' · Not checked in yet'}
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        {canCancel && (
          <button
            className="btn-secondary"
            style={{ padding: '4px 10px', fontSize: 12, color: 'var(--coral)' }}
            onClick={() => onCancel(booking.id)}
          >
            Cancel booking
          </button>
        )}
      </div>
      {canCheckIn && <CheckInQR bookingId={booking.id} />}
      {booking.status === 'completed' && (
        <ReviewPrompt bookingId={booking.id} review={review} onReviewed={onReviewed} />
      )}
      <ReportProblem bookingId={booking.id} />
    </div>
  );
}

// The guest's "personal QR" for guesthouse check-in — encodes this specific
// booking's id, which backend/src/routes/checkin.js validates a scan against.
// Front desk scans this from frontend-business's CheckInScanner; distinct
// from the travel-group QR shown via Profile.jsx's "My QR code" (QRPopup),
// which is for joining a group, not checking in.
function CheckInQR({ bookingId }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        className="btn-secondary"
        style={{ padding: '4px 10px', fontSize: 12, marginTop: 8 }}
        onClick={() => setOpen(true)}
      >
        Show check-in QR
      </button>
    );
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', textAlign: 'center' }}>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
        Show this to the guesthouse front desk to check in.
      </p>
      <QRCodeSVG value={bookingId} size={140} fgColor="#0b2e3d" />
      <button
        className="btn-secondary"
        style={{ display: 'block', margin: '10px auto 0', padding: '4px 10px', fontSize: 12 }}
        onClick={() => setOpen(false)}
      >
        Hide
      </button>
    </div>
  );
}

const ORDER_STATUS_LABEL = {
  pending_payment: 'Payment pending',
  confirmed: 'Confirmed',
  ready: 'Ready',
  out_for_delivery: 'Out for delivery',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function OrderRow({ order, review, onReviewed }) {
  const itemsSummary = (order.items || []).map((i) => `${i.quantity}x ${i.title}`).join(', ');
  return (
    <div className="card" style={{ padding: 12, marginBottom: 8 }}>
      <p style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 2px' }}>
        {itemsSummary} — {order.business_name}
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
        ${order.price_charged} · {ORDER_STATUS_LABEL[order.status] || order.status}
        {order.fulfillment_method && ` · ${order.fulfillment_method}`}
      </p>
      {order.status === 'completed' && (
        <ReviewPrompt orderId={order.id} review={review} onReviewed={onReviewed} />
      )}
      <ReportProblem orderId={order.id} />
    </div>
  );
}

// "Leave a review" — POST /api/reviews. One review per completed
// booking/order, enforced backend-side; here we just reflect whether one
// already exists (passed down as `review`) instead of re-showing the form.
function ReviewPrompt({ bookingId, orderId, review, onReviewed }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (review) {
    return (
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
          Your review: {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
          {review.text && ` — ${review.text}`}
        </p>
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await submitReview({ booking_id: bookingId, order_id: orderId, rating, text });
      onReviewed();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        className="btn-secondary"
        style={{ padding: '4px 10px', fontSize: 12, marginTop: 8 }}
        onClick={() => setOpen(true)}
      >
        Leave a review
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}
    >
      <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
        Rating
      </label>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            type="button"
            key={n}
            onClick={() => setRating(n)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: 0, lineHeight: 1 }}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
          >
            {n <= rating ? '★' : '☆'}
          </button>
        ))}
      </div>

      <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
        Your review (optional)
      </label>
      <textarea
        className="input-field"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ fontSize: 13, marginBottom: 8, resize: 'vertical' }}
      />

      {error && <p className="error-text">{error}</p>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="btn-secondary"
          style={{ padding: '4px 10px', fontSize: 12 }}
          onClick={() => setOpen(false)}
          disabled={submitting}
        >
          Cancel
        </button>
        <button type="submit" className="btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit review'}
        </button>
      </div>
    </form>
  );
}

const DISPUTE_REASONS = [
  { value: 'no_show', label: 'Business was a no-show' },
  { value: 'item_not_delivered', label: 'Item not delivered' },
  { value: 'quality_issue', label: 'Quality issue' },
  { value: 'other', label: 'Other' },
];

// Section 7.1 "Report a problem" — files a Dispute via POST /api/disputes.
// Each row owns its own open/submit/success state so reporting one booking
// or order doesn't affect any other row on the page.
function ReportProblem({ bookingId, orderId }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(DISPUTE_REASONS[0].value);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await fileDispute({ booking_id: bookingId, order_id: orderId, reason, description });
      setSuccess(res.message || "We've received your report. You'll hear back once it's reviewed.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <p style={{ fontSize: 12, color: 'var(--lagoon)', marginTop: 8 }}>{success}</p>
    );
  }

  if (!open) {
    return (
      <button
        className="btn-secondary"
        style={{ padding: '4px 10px', fontSize: 12, color: 'var(--coral)', marginTop: 8 }}
        onClick={() => setOpen(true)}
      >
        Report a problem
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}
    >
      <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
        What went wrong?
      </label>
      <select
        className="input-field"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        style={{ fontSize: 13, marginBottom: 8 }}
      >
        {DISPUTE_REASONS.map((r) => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>

      <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
        Details (optional)
      </label>
      <textarea
        className="input-field"
        rows={3}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        style={{ fontSize: 13, marginBottom: 8, resize: 'vertical' }}
      />

      {error && <p className="error-text">{error}</p>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="btn-secondary"
          style={{ padding: '4px 10px', fontSize: 12 }}
          onClick={() => setOpen(false)}
          disabled={submitting}
        >
          Cancel
        </button>
        <button type="submit" className="btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit report'}
        </button>
      </div>
    </form>
  );
}
