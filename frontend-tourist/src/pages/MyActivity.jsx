import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { getMyBookings, getMyOrders, cancelBooking, getCancelPreview, fileDispute, getMyReviews, submitReview, getMyWaitlist, getMyReturns, requestReturn } from '../api/client';
import { useModalA11y } from '../useModalA11y';

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
  const [returnsByOrder, setReturnsByOrder] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Section 6.4's auto-prompt review popup: "a prompt appears on the
  // completed booking/order... Submit or Skip." Dismissal (Submit or Skip)
  // is remembered in localStorage so it only ever auto-pops once per item —
  // "reached later from the invoice/booking history for anyone who skips"
  // still works via the inline "Leave a review" button on the row itself.
  const [autoPromptTarget, setAutoPromptTarget] = useState(null);

  function getDismissedPrompts() {
    try {
      return new Set(JSON.parse(localStorage.getItem('atollisle_review_prompt_dismissed') || '[]'));
    } catch {
      return new Set();
    }
  }

  function dismissPrompt(key) {
    const dismissed = getDismissedPrompts();
    dismissed.add(key);
    try {
      localStorage.setItem('atollisle_review_prompt_dismissed', JSON.stringify([...dismissed]));
    } catch {
      // ignore — worst case the popup reappears next visit
    }
  }

  function loadAll() {
    setLoading(true);
    Promise.all([
      getMyBookings().catch(() => ({ bookings: [] })),
      getMyOrders().catch(() => ({ orders: [] })),
      getMyReviews().catch(() => ({ reviews: [] })),
      getMyWaitlist().catch(() => ({ waitlist: [] })),
      getMyReturns().catch(() => ({ returns: [] })),
    ])
      .then(([bookingsData, ordersData, reviewsData, waitlistData, returnsData]) => {
        const loadedBookings = bookingsData.bookings || [];
        const loadedOrders = ordersData.orders || [];
        setBookings(loadedBookings);
        setOrders(loadedOrders);
        setWaitlist(waitlistData.waitlist || []);
        const byTarget = {};
        for (const r of reviewsData.reviews || []) {
          if (r.booking_id) byTarget[`booking:${r.booking_id}`] = r;
          if (r.order_id) byTarget[`order:${r.order_id}`] = r;
        }
        setReviewsByTarget(byTarget);
        const byOrder = {};
        for (const r of returnsData.returns || []) {
          byOrder[r.order_id] = r;
        }
        setReturnsByOrder(byOrder);

        const dismissed = getDismissedPrompts();
        const dueBooking = loadedBookings.find(
          (b) => b.status === 'completed' && !byTarget[`booking:${b.id}`] && !dismissed.has(`booking:${b.id}`)
        );
        if (dueBooking) {
          setAutoPromptTarget({ type: 'booking', id: dueBooking.id, label: dueBooking.title });
        } else {
          const dueOrder = loadedOrders.find(
            (o) => o.status === 'completed' && !byTarget[`order:${o.id}`] && !dismissed.has(`order:${o.id}`)
          );
          if (dueOrder) {
            setAutoPromptTarget({ type: 'order', id: dueOrder.id, label: dueOrder.business_name });
          }
        }
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

  const [cancelTargetId, setCancelTargetId] = useState(null);

  // Section 7.1's cancellation confirmation popup replaces the old generic
  // window.confirm() \u2014 opening it here doesn't cancel anything yet, it just
  // shows CancelConfirmPopup, which fetches the real computed refund numbers
  // before the tourist commits.
  function handleCancel(id) {
    setCancelTargetId(id);
  }

  async function confirmCancel(id) {
    try {
      await cancelBooking(id);
      loadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setCancelTargetId(null);
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
        <OrderRow
          key={o.id}
          order={o}
          review={reviewsByTarget[`order:${o.id}`]}
          onReviewed={loadAll}
          existingReturn={returnsByOrder[o.id]}
          onReturned={loadAll}
        />
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

      {cancelTargetId && (
        <CancelConfirmPopup
          bookingId={cancelTargetId}
          onConfirm={() => confirmCancel(cancelTargetId)}
          onClose={() => setCancelTargetId(null)}
        />
      )}

      {autoPromptTarget && (
        <ReviewPopup
          target={autoPromptTarget}
          onDone={() => {
            dismissPrompt(`${autoPromptTarget.type}:${autoPromptTarget.id}`);
            setAutoPromptTarget(null);
            loadAll();
          }}
          onSkip={() => {
            dismissPrompt(`${autoPromptTarget.type}:${autoPromptTarget.id}`);
            setAutoPromptTarget(null);
          }}
        />
      )}
    </div>
  );
}

// Section 6.4's auto-prompt: "How was your stay at [Business]?" — Submit or
// Skip. Shares submitReview with the inline ReviewPrompt fallback below.
function ReviewPopup({ target, onDone, onSkip }) {
  const modalRef = useModalA11y(onSkip);
  const [rating, setRating] = useState(5);
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await submitReview({
        booking_id: target.type === 'booking' ? target.id : undefined,
        order_id: target.type === 'order' ? target.id : undefined,
        rating, text, photos,
      });
      onDone();
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(11, 46, 61, 0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16,
      }}
      onClick={onSkip}
    >
      <form
        ref={modalRef}
        onSubmit={handleSubmit}
        className="card"
        role="dialog"
        aria-modal="true"
        aria-label="Leave a review"
        style={{ width: '100%', maxWidth: 380, padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--navy)', marginBottom: 14 }}>
          How was {target.label}?
        </p>

        <div role="group" aria-label="Rating" style={{ display: 'flex', gap: 6, marginBottom: 14, justifyContent: 'center' }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              type="button"
              key={n}
              onClick={() => setRating(n)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 26, padding: 0, lineHeight: 1 }}
              aria-label={`${n} star${n > 1 ? 's' : ''}`}
            >
              {n <= rating ? '★' : '☆'}
            </button>
          ))}
        </div>

        <label htmlFor="review-popup-text" style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
          Your review (optional)
        </label>
        <textarea
          id="review-popup-text"
          className="input-field"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ fontSize: 13, marginBottom: 8, resize: 'vertical' }}
        />

        <label htmlFor="review-popup-photos" style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
          Photos (optional, up to 4)
        </label>
        <input
          id="review-popup-photos"
          className="input-field"
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setPhotos(Array.from(e.target.files || []).slice(0, 4))}
          style={{ marginBottom: 14 }}
        />

        {error && <p className="error-text">{error}</p>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={onSkip} disabled={submitting}>
            Skip
          </button>
          <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </form>
    </div>
  );
}

// Section 7.1's cancellation confirmation popup: fetches the exact refund
// math (bookings.js's GET /:id/cancel-preview, the same computeRefund() the
// actual cancel applies) so the tourist sees real numbers before
// committing, instead of the old generic window.confirm().
function CancelConfirmPopup({ bookingId, onConfirm, onClose }) {
  const modalRef = useModalA11y(onClose);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    getCancelPreview(bookingId).then(setPreview).catch((err) => setError(err.message));
  }, [bookingId]);

  async function handleConfirm() {
    setConfirming(true);
    await onConfirm();
  }

  const withheld = preview ? Math.round((preview.gross_refund_amount - preview.refund_amount) * 100) / 100 : 0;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(11, 46, 61, 0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16,
      }}
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="card"
        role="dialog"
        aria-modal="true"
        aria-label="Confirm cancellation"
        style={{ width: '100%', maxWidth: 380, padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--navy)', marginBottom: 8 }}>
          Cancel this booking?
        </p>

        {error && <p className="error-text">{error}</p>}
        {!preview && !error && (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Calculating your refund…</p>
        )}

        {preview && (
          <div style={{ background: 'var(--sand)', borderRadius: 8, padding: 12, marginBottom: 18, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>Amount paid</span>
              <span>${preview.gross_refund_amount}</span>
            </div>
            {withheld > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: 'var(--coral)' }}>
                <span>Refund charge withheld</span>
                <span>-${withheld}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, paddingTop: 6, marginTop: 4, borderTop: '1px solid var(--border)' }}>
              <span>You'll receive back</span>
              <span>${preview.refund_amount}</span>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={onClose} disabled={confirming}>
            Go Back
          </button>
          <button
            className="btn-primary"
            style={{ flex: 1, background: 'var(--coral)' }}
            onClick={handleConfirm}
            disabled={confirming || !preview}
          >
            {confirming ? 'Cancelling…' : 'Confirm Cancellation'}
          </button>
        </div>
      </div>
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
  // A booking made by another travel-group member for you (Section 2.2)
  // shows up here too (bookings.js's GET /mine), but only the actual
  // booker can cancel it — the backend enforces this too (PATCH /:id/cancel).
  const canCancel = booking.status === 'confirmed' && !booking.booked_by_someone_else;
  const isGuesthouse = booking.business_type === 'guesthouse';
  const isCheckedIn = booking.check_in_status === 'checked_in';
  const canCheckIn = isGuesthouse && booking.status === 'confirmed' && !isCheckedIn;

  return (
    <div className="card" style={{ padding: 12, marginBottom: 8 }}>
      <p style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 2px' }}>
        {booking.title} — {booking.business_name}
      </p>
      {booking.booked_by_someone_else && (
        <p style={{ fontSize: 11, color: 'var(--lagoon)', margin: '0 0 4px' }}>
          Booked by {booking.booked_by_name} for your group
        </p>
      )}
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

function OrderRow({ order, review, onReviewed, existingReturn, onReturned }) {
  const itemsSummary = (order.items || []).map((i) => `${i.quantity}x ${i.title}`).join(', ');
  return (
    <div className="card" style={{ padding: 12, marginBottom: 8 }}>
      <p style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 2px' }}>
        {itemsSummary} — {order.business_name}
      </p>
      {order.booked_by_someone_else && (
        <p style={{ fontSize: 11, color: 'var(--lagoon)', margin: '0 0 4px' }}>
          Ordered by {order.booked_by_name} for your group
        </p>
      )}
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
        ${order.price_charged} · {ORDER_STATUS_LABEL[order.status] || order.status}
        {order.fulfillment_method && ` · ${order.fulfillment_method}`}
      </p>
      {order.status === 'completed' && (
        <ReviewPrompt orderId={order.id} review={review} onReviewed={onReviewed} />
      )}
      {order.status === 'completed' && (
        <ReturnPrompt orderId={order.id} existingReturn={existingReturn} onReturned={onReturned} />
      )}
      <ReportProblem orderId={order.id} />
    </div>
  );
}

const RETURN_STATUS_LABEL = {
  requested: 'Requested — waiting on the business',
  approved: 'Approved — awaiting processing',
  declined: 'Declined',
  completed: 'Completed',
};

// POST /api/returns — request a return or exchange on a completed order,
// within the backend's 14-day window. Business approves/rejects/processes
// from frontend-business's Dashboard.
function ReturnPrompt({ orderId, existingReturn, onReturned }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('return');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (existingReturn) {
    return (
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
        {existingReturn.type === 'exchange' ? 'Exchange' : 'Return'}: {RETURN_STATUS_LABEL[existingReturn.status] || existingReturn.status}
        {existingReturn.status === 'completed' && existingReturn.refund_amount > 0 && ` — $${existingReturn.refund_amount} refunded`}
      </p>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please describe why.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await requestReturn({ order_id: orderId, type, reason: reason.trim() });
      onReturned();
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
        Request return / exchange
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="radio" checked={type === 'return'} onChange={() => setType('return')} /> Return
        </label>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="radio" checked={type === 'exchange'} onChange={() => setType('exchange')} /> Exchange
        </label>
      </div>
      <textarea
        className="input-field"
        rows={2}
        placeholder="Why are you requesting this?"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        style={{ marginBottom: 8, resize: 'vertical' }}
      />
      {error && <p className="error-text">{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setOpen(false)} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit request'}
        </button>
      </div>
    </form>
  );
}

// "Leave a review" — POST /api/reviews. One review per completed
// booking/order, enforced backend-side; here we just reflect whether one
// already exists (passed down as `review`) instead of re-showing the form.
function ReviewPrompt({ bookingId, orderId, review, onReviewed }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState([]);
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
      await submitReview({ booking_id: bookingId, order_id: orderId, rating, text, photos });
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
      <label id="review-rating-label" style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
        Rating
      </label>
      <div role="group" aria-labelledby="review-rating-label" style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
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

      <label htmlFor="review-text" style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
        Your review (optional)
      </label>
      <textarea
        id="review-text"
        className="input-field"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ fontSize: 13, marginBottom: 8, resize: 'vertical' }}
      />

      <label htmlFor="review-photos" style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
        Photos (optional, up to 4)
      </label>
      <input
        id="review-photos"
        className="input-field"
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => setPhotos(Array.from(e.target.files || []).slice(0, 4))}
        style={{ marginBottom: 8 }}
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
      <label htmlFor="dispute-reason" style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
        What went wrong?
      </label>
      <select
        id="dispute-reason"
        className="input-field"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        style={{ fontSize: 13, marginBottom: 8 }}
      >
        {DISPUTE_REASONS.map((r) => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>

      <label htmlFor="dispute-description" style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
        Details (optional)
      </label>
      <textarea
        id="dispute-description"
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
