import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMyBookings, getMyOrders, cancelBooking } from '../api/client';

// Same class of gap as the business dashboard's old "type in a Booking ID"
// box: a tourist could book or order something, but had no page anywhere
// showing what they'd booked or ordered, or any way to cancel. The backend
// (GET /api/bookings/mine, GET /api/orders/mine, PATCH /api/bookings/:id/cancel)
// has existed the whole time — this is the first UI to actually use it.
export default function MyActivity() {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function loadAll() {
    setLoading(true);
    Promise.all([
      getMyBookings().catch(() => ({ bookings: [] })),
      getMyOrders().catch(() => ({ orders: [] })),
    ])
      .then(([bookingsData, ordersData]) => {
        setBookings(bookingsData.bookings || []);
        setOrders(ordersData.orders || []);
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
        <BookingRow key={b.id} booking={b} onCancel={handleCancel} />
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
        <OrderRow key={o.id} order={o} />
      ))}
    </div>
  );
}

const BOOKING_STATUS_LABEL = {
  pending_payment: 'Payment pending',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function BookingRow({ booking, onCancel }) {
  const canCancel = booking.status === 'confirmed';
  return (
    <div className="card" style={{ padding: 12, marginBottom: 8 }}>
      <p style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 2px' }}>
        {booking.title} — {booking.business_name}
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
        {new Date(booking.slot_start).toLocaleString()} · ${booking.price_charged} ·{' '}
        {BOOKING_STATUS_LABEL[booking.status] || booking.status}
      </p>
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

function OrderRow({ order }) {
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
    </div>
  );
}