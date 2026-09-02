import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getMyTrips } from '../api/client';
import EmptyState from '../components/EmptyState';
import IslandPicker from '../components/IslandPicker';
import { rememberIslandScope, rememberNationwideScope } from '../homeScope';
import { formatPrice } from '../utils/currency';

// Section 3.4 pricing visibility — a Local is charged a listing's MVR
// local_price, a tourist its USD tourist_price (independent values,
// utils/currency.js). These already-charged amounts are in the account's
// own currency; formatPrice just labels them. Payment is deferred.
function currentUserIsLocal() {
  try {
    return JSON.parse(localStorage.getItem('atollisle_user') || 'null')?.type === 'local';
  } catch {
    return false;
  }
}

// Trip/itinerary view — script Section 12's Trip/TripIslandStay, populated
// entirely from checkin.js's guesthouse check-in flow (there's no manual
// "start a trip" action anywhere). Two views over the same data: the
// original vertical timeline (a sequence of island stays reads naturally
// that way), and a Batch 19 month-calendar view for "what do I have on the
// 14th" at a glance. Both link every entry to MyActivity.jsx (see
// StayItemRow) rather than duplicating booking/order detail here.
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
  const [view, setView] = useState('timeline');
  const [switchingIsland, setSwitchingIsland] = useState(false);

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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', margin: 0 }}>
          My trips
        </h1>
        <div style={{ display: 'flex', gap: 4 }}>
          <ViewToggleButton active={view === 'timeline'} onClick={() => setView('timeline')} label="Timeline" />
          <ViewToggleButton active={view === 'calendar'} onClick={() => setView('calendar')} label="Calendar" />
        </div>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
        Your itinerary fills in automatically as you check in to guesthouses.
      </p>

      {/* Island switcher (home-menu-pricing brief item 1) — moved here from
          the Home header. Opens the same island-search popup; picking an
          island stores it and drops the user back on Home showing that
          island's listings. */}
      <button
        type="button"
        className="btn-secondary"
        onClick={() => setSwitchingIsland(true)}
        style={{ fontSize: 13, padding: '9px 14px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}
      >
        <span aria-hidden="true">🏝️</span> Change island
      </button>
      {switchingIsland && (
        <IslandPicker
          hideTrigger
          autoOpen
          value=""
          onChange={(isl, atl) => { rememberIslandScope(isl, atl || ''); navigate('/'); }}
          onNotInMaldives={() => { rememberNationwideScope(); navigate('/'); }}
          onClose={() => setSwitchingIsland(false)}
        />
      )}

      {loading && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading…</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && trips.length === 0 && (
        <EmptyState
          message="No trips yet. Your itinerary builds itself once you check in at a guesthouse — book a stay to get started."
          actionLabel="Find a place to stay"
          actionTo="/"
        />
      )}

      {!loading && !error && trips.length > 0 && view === 'calendar' && (
        <CalendarView trips={trips} />
      )}

      {!loading && !error && trips.length > 0 && view === 'timeline' && (
        mostRecentFirst.map((trip) => (
          <TripCard key={trip.id} trip={trip} />
        ))
      )}
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

      {!isCurrent && trip.stays.length > 0 && <TripSummary trip={trip} />}

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

// Batch 19 — post-trip summary. Shown once every stay in a trip has ended
// (the same isStayOngoing check TripCard already uses for "Current"),
// computed client-side from data GET /api/trips/mine already returns —
// no separate summary endpoint needed.
function TripSummary({ trip }) {
  const islands = [...new Set(trip.stays.map((s) => s.island))];
  const allItems = trip.stays.flatMap((s) => [...s.bookings, ...s.orders]);
  const totalSpent = allItems.reduce((sum, item) => sum + Number(item.price_charged || 0), 0);
  const lastStay = trip.stays[trip.stays.length - 1];
  const tripEnd = lastStay?.end_date || lastStay?.start_date;

  return (
    <div style={{ background: 'var(--lagoon-tint)', borderRadius: 'var(--radius-sm)', padding: 12, marginBottom: 14 }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', margin: '0 0 6px' }}>
        Trip summary
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 2px' }}>
        {islands.length} island{islands.length > 1 ? 's' : ''} · {islands.join(', ')}
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 2px' }}>
        {allItems.length} booking{allItems.length === 1 ? '' : 's'}/order{allItems.length === 1 ? '' : 's'} · {formatPrice(totalSpent, currentUserIsLocal())} total
      </p>
      {tripEnd && (
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
          Wrapped up {formatDate(tripEnd)}
        </p>
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

// Batch 19: tappable timeline entries — previously just plain text with no
// way to reach the full booking/order (cancellation, review, check-in QR,
// etc.). There's no separate single-booking detail page in this app (see
// MyActivity.jsx), so this jumps there and scrolls straight to the row,
// highlighted via the :target CSS rule (theme.css) rather than duplicating
// that detail view here.
function StayItemRow({ item }) {
  const isOrder = 'items' in item;
  const label = isOrder
    ? item.items.map((i) => `${i.quantity}x ${i.title}`).join(', ') || 'Order'
    : `${item.title} (${BUSINESS_TYPE_LABEL[item.business_type] || item.business_type})`;
  const date = isOrder ? item.created_at : item.slot_start;
  const anchor = isOrder ? `order-${item.id}` : `booking-${item.id}`;

  return (
    <Link
      to={`/bookings#${anchor}`}
      style={{
        display: 'block', fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 4px',
        textDecoration: 'none',
      }}
    >
      • <span style={{ color: 'var(--lagoon)' }}>{label}</span> — {item.business_name}, {formatDate(date)} · {formatPrice(item.price_charged, currentUserIsLocal())}
    </Link>
  );
}

function ViewToggleButton({ active, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '5px 10px',
        borderRadius: 'var(--radius-pill)',
        fontSize: 12,
        border: active ? 'none' : '1px solid var(--border)',
        background: active ? 'var(--lagoon)' : 'var(--surface)',
        color: active ? '#fff' : 'var(--text-secondary)',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function dateKey(d) {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Flattens every trip's bookings/orders into one date → entries map, keyed
// by local calendar day, so the month grid below doesn't need to know
// anything about trips/stays — just "what happened on this day".
function buildEventsByDate(trips) {
  const map = {};
  for (const trip of trips) {
    for (const stay of trip.stays) {
      for (const item of [...stay.bookings, ...stay.orders]) {
        const isOrder = 'items' in item;
        const date = isOrder ? item.created_at : item.slot_start;
        const key = dateKey(date);
        (map[key] ??= []).push(item);
      }
    }
  }
  return map;
}

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Batch 19 — a month-grid alternative to the vertical timeline, for
// "what do I have going on this day" at a glance. Defaults to the month of
// the most recent activity (or today, if somehow there's none) rather than
// always opening on the current calendar month, since most trips are in
// the past or near-future relative to whenever this is opened.
function CalendarView({ trips }) {
  const eventsByDate = buildEventsByDate(trips);
  const allDates = Object.keys(eventsByDate).sort();
  const [initialYear, initialMonthNum] = allDates.length
    ? allDates[allDates.length - 1].split('-').map(Number)
    : [new Date().getFullYear(), new Date().getMonth() + 1];

  const [monthCursor, setMonthCursor] = useState(new Date(initialYear, initialMonthNum - 1, 1));
  const [selectedKey, setSelectedKey] = useState(null);

  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = monthCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(day);

  const selectedEvents = selectedKey ? eventsByDate[selectedKey] || [] : [];

  return (
    <div>
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <button
            type="button"
            className="btn-secondary"
            style={{ padding: '4px 10px', fontSize: 12 }}
            onClick={() => setMonthCursor(new Date(year, month - 1, 1))}
          >
            ←
          </button>
          <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', margin: 0 }}>{monthLabel}</p>
          <button
            type="button"
            className="btn-secondary"
            style={{ padding: '4px 10px', fontSize: 12 }}
            onClick={() => setMonthCursor(new Date(year, month + 1, 1))}
          >
            →
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
          {WEEKDAY_LABELS.map((w, i) => (
            <p key={i} style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>{w}</p>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {cells.map((day, i) => {
            if (day == null) return <div key={i} />;
            const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const hasEvents = Boolean(eventsByDate[key]);
            const isSelected = selectedKey === key;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setSelectedKey(hasEvents ? key : null)}
                disabled={!hasEvents}
                style={{
                  aspectRatio: '1', border: 'none', borderRadius: 'var(--radius-sm)',
                  background: isSelected ? 'var(--lagoon)' : hasEvents ? 'var(--lagoon-tint)' : 'transparent',
                  color: isSelected ? '#fff' : hasEvents ? 'var(--navy)' : 'var(--text-muted)',
                  fontSize: 12, fontWeight: hasEvents ? 600 : 400,
                  cursor: hasEvents ? 'pointer' : 'default',
                }}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>

      {selectedKey && (
        <div className="card" style={{ padding: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--navy)', marginBottom: 8 }}>
            {(() => {
              const [y, m, d] = selectedKey.split('-').map(Number);
              return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
            })()}
          </p>
          {selectedEvents.map((item) => (
            <StayItemRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
