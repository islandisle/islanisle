import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMyTrips } from '../api/client';

// Trip/itinerary view — script Section 12's Trip/TripIslandStay, populated
// entirely from checkin.js's guesthouse check-in flow (there's no manual
// "start a trip" action anywhere). A vertical timeline per trip, since that
// reads naturally as a sequence of island stays without needing a real
// calendar-grid component this codebase doesn't otherwise have.
const BUSINESS_TYPE_LABEL = {
  guesthouse: 'Stay',
  restaurant: 'Dining',
  excursion: 'Excursion',
  speedboat: 'Transfer',
  shop: 'Shop',
};

function formatDate(d) {
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function isStayOngoing(stay) {
  if (!stay.end_date) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(stay.end_date) >= today;
}

export default function Trips() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!localStorage.getItem('atollisle_token')) {
      navigate('/login');
      return;
    }
    getMyTrips()
      .then((data) => setTrips(data.trips || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const mostRecentFirst = [...trips].reverse();

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <button className="btn-secondary" onClick={() => navigate('/profile')} style={{ marginBottom: 16 }}>
        ← Back
      </button>

      <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>
        My trips
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
        Your itinerary fills in automatically as you check in to guesthouses.
      </p>

      {loading && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading…</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && trips.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          No trips yet — checking in to a guesthouse starts one.
        </p>
      )}

      {mostRecentFirst.map((trip) => (
        <TripCard key={trip.id} trip={trip} />
      ))}
    </div>
  );
}

function TripCard({ trip }) {
  const isCurrent = trip.stays.some(isStayOngoing);

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)', margin: 0 }}>
          Trip started {formatDate(trip.created_at)}
        </p>
        {isCurrent && (
          <span
            style={{
              fontSize: 11, fontWeight: 500, color: '#fff', background: 'var(--lagoon)',
              padding: '2px 8px', borderRadius: 'var(--radius-pill)',
            }}
          >
            Current
          </span>
        )}
      </div>

      {trip.stays.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No island stays recorded yet.</p>
      ) : (
        <div style={{ position: 'relative', paddingLeft: 18 }}>
          <div style={{ position: 'absolute', left: 4, top: 6, bottom: 6, width: 2, background: 'var(--border)' }} />
          {trip.stays.map((stay, i) => (
            <StayItem key={stay.id} stay={stay} isLast={i === trip.stays.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function StayItem({ stay, isLast }) {
  const dateRange = stay.end_date
    ? `${formatDate(stay.start_date)} – ${formatDate(stay.end_date)}`
    : `${formatDate(stay.start_date)} – ongoing`;
  const items = [...stay.bookings, ...stay.orders].sort(
    (a, b) => new Date(a.slot_start || a.created_at) - new Date(b.slot_start || b.created_at)
  );

  return (
    <div style={{ position: 'relative', marginBottom: isLast ? 0 : 18 }}>
      <div
        style={{
          position: 'absolute', left: -18, top: 4, width: 10, height: 10, borderRadius: '50%',
          background: 'var(--lagoon)', border: '2px solid var(--surface)', boxShadow: '0 0 0 1px var(--border)',
        }}
      />
      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', margin: '0 0 2px' }}>
        {stay.island}
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
        {dateRange}
      </p>

      {items.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nothing else booked for this stay.</p>
      )}
      {items.map((item) => (
        <StayItemRow key={item.id} item={item} />
      ))}
    </div>
  );
}

function StayItemRow({ item }) {
  const isOrder = 'items' in item;
  const label = isOrder
    ? item.items.map((i) => `${i.quantity}x ${i.title}`).join(', ') || 'Order'
    : `${item.title} (${BUSINESS_TYPE_LABEL[item.business_type] || item.business_type})`;
  const date = isOrder ? item.created_at : item.slot_start;

  return (
    <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 4px' }}>
      • {label} — {item.business_name}, {formatDate(date)} · ${item.price_charged}
    </p>
  );
}
