import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createBusiness, getMyListings, createListing, markBookingFulfilled,
  getBusinessBookings, getBusinessOrders, markOrderStatus,
} from '../api/client';

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

      <AddListingForm businessType={business.type} businessId={business.id} onCreated={loadListings} />

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

      <IncomingActivity businessId={business.id} />
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

// Script Sections 4.1-4.5: each business type has its own fields on top of
// the shared title/description/tourist_price/local_price/photos. These are
// stored in the listings.type_specific_fields JSONB column, which the
// backend already accepts (backend/src/routes/business.js) but which this
// form previously never populated — meaning, for example, a "speedboat"
// listing had nowhere to record its origin/destination, so it could never
// surface on the tourist Arrival/Island Transfers screens (Sections 3.1,
// 3.2), which filter directly on those two fields.
//
// NOT covered by this form (separate, larger pieces not built yet):
//   - Real-time slot/capacity enforcement (Section 9's booking engine) —
//     this form captures the *numbers* the business sets (capacity, seats,
//     table count) but nothing yet checks or decrements them as bookings
//     come in.
//   - Availability calendars (open/blocked dates, closure days) — Section
//     4.8/8.4.
//   - Guesthouse check-in, manifests, cross-island delivery matching — all
//     Section 4.1/4.4/4.5 features that depend on real bookings existing
//     first.
const TYPE_FIELD_CONFIG = {
  guesthouse: [
    { key: 'room_type', label: 'Room type (e.g. Double, Dorm bed)', type: 'text' },
    { key: 'capacity', label: 'Guests per room', type: 'number' },
    { key: 'amenities', label: 'Amenities (comma-separated)', type: 'text' },
  ],
  restaurant: [
    { key: 'category', label: 'Category (e.g. Main, Dessert, Drink)', type: 'text' },
    { key: 'time_slots', label: 'Available time slots (comma-separated, e.g. 12:00, 13:00, 19:00)', type: 'text' },
    { key: 'table_capacity', label: 'Table capacity per slot', type: 'number' },
  ],
  excursion: [
    { key: 'duration', label: 'Duration (e.g. 3 hours, Half day)', type: 'text' },
    { key: 'time_slots', label: 'Available time slots (comma-separated)', type: 'text' },
    { key: 'capacity_per_slot', label: 'Capacity per slot', type: 'number' },
  ],
  speedboat: [
    { key: 'origin', label: 'Origin (island or "Airport")', type: 'text' },
    { key: 'destination', label: 'Destination island', type: 'text' },
    { key: 'departure_times', label: 'Departure times (comma-separated, e.g. 08:00, 14:00)', type: 'text' },
    { key: 'days_running', label: 'Days running (e.g. Daily, Mon-Fri)', type: 'text' },
    { key: 'seat_capacity', label: 'Seat capacity per departure', type: 'number' },
    { key: 'luggage_bags', label: 'Luggage allowance — bags per passenger', type: 'number' },
    { key: 'luggage_weight_kg', label: 'Luggage allowance — weight limit (kg)', type: 'number' },
  ],
  shop: [
    { key: 'category', label: 'Product category', type: 'text' },
  ],
};

function AddListingForm({ businessType, businessId, onCreated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [touristPrice, setTouristPrice] = useState('');
  const [localPrice, setLocalPrice] = useState('');
  const [typeFields, setTypeFields] = useState({});
  const [stockCount, setStockCount] = useState('');
  const [pickupAvailable, setPickupAvailable] = useState(true);
  const [deliveryAvailable, setDeliveryAvailable] = useState(false);
  const [freeDelivery, setFreeDelivery] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);

  const fieldConfig = TYPE_FIELD_CONFIG[businessType] || [];

  function setTypeField(key, value) {
    setTypeFields((prev) => ({ ...prev, [key]: value }));
  }

  function resetForm() {
    setTitle('');
    setDescription('');
    setTouristPrice('');
    setLocalPrice('');
    setTypeFields({});
    setStockCount('');
    setPickupAvailable(true);
    setDeliveryAvailable(false);
    setFreeDelivery(false);
    setOpen(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      // Comma-separated fields (amenities, time_slots, departure_times) get
      // split into arrays; everything else stays as typed.
      const processedTypeFields = {};
      for (const field of fieldConfig) {
        const raw = typeFields[field.key];
        if (raw == null || raw === '') continue;
        if (field.key === 'amenities' || field.key === 'time_slots' || field.key === 'departure_times') {
          processedTypeFields[field.key] = raw.split(',').map((s) => s.trim()).filter(Boolean);
        } else if (field.type === 'number') {
          processedTypeFields[field.key] = Number(raw);
        } else {
          processedTypeFields[field.key] = raw;
        }
      }

      const payload = {
        title,
        description,
        tourist_price: Number(touristPrice),
        local_price: Number(localPrice),
        type_specific_fields: processedTypeFields,
      };

      if (businessType === 'shop') {
        payload.stock_count = stockCount === '' ? null : Number(stockCount);
        // fulfillment_options is a Postgres fulfillment_method[] column
        // (CREATE TYPE fulfillment_method AS ENUM ('pickup', 'delivery')) —
        // it needs an array of those exact strings, not an object of
        // booleans. Sending the wrong shape here is what caused every shop
        // listing save to fail with a 500.
        const options = [];
        if (pickupAvailable) options.push('pickup');
        if (deliveryAvailable) options.push('delivery');
        payload.fulfillment_options = options;
        payload.free_delivery = freeDelivery;
      }

      await createListing(businessId, payload);
      resetForm();
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

      <input
        className="input-field"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{ marginBottom: 10 }}
      />
      <input
        className="input-field"
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        style={{ marginBottom: 10 }}
      />
      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <input
          className="input-field"
          type="number"
          placeholder="Tourist price"
          value={touristPrice}
          onChange={(e) => setTouristPrice(e.target.value)}
        />
        <input
          className="input-field"
          type="number"
          placeholder="Local price"
          value={localPrice}
          onChange={(e) => setLocalPrice(e.target.value)}
        />
      </div>

      {fieldConfig.length > 0 && (
        <>
          <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0 12px' }} />
          <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
            {businessType.charAt(0).toUpperCase() + businessType.slice(1)} details
          </p>
          {fieldConfig.map((field) => (
            <div key={field.key} style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
                {field.label}
              </label>
              <input
                className="input-field"
                type={field.type}
                value={typeFields[field.key] || ''}
                onChange={(e) => setTypeField(field.key, e.target.value)}
              />
            </div>
          ))}
        </>
      )}

      {businessType === 'shop' && (
        <>
          <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0 12px' }} />
          <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Inventory &amp; fulfillment
          </p>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
              Stock count
            </label>
            <input
              className="input-field"
              type="number"
              value={stockCount}
              onChange={(e) => setStockCount(e.target.value)}
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 6 }}>
            <input type="checkbox" checked={pickupAvailable} onChange={(e) => setPickupAvailable(e.target.checked)} />
            In-store pickup available
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 6 }}>
            <input type="checkbox" checked={deliveryAvailable} onChange={(e) => setDeliveryAvailable(e.target.checked)} />
            Delivery available
          </label>
          {deliveryAvailable && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 10 }}>
              <input type="checkbox" checked={freeDelivery} onChange={(e) => setFreeDelivery(e.target.checked)} />
              Delivery is free
            </label>
          )}
        </>
      )}

      {error && <p className="error-text">{error}</p>}
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button type="button" className="btn-secondary" onClick={resetForm}>Cancel</button>
        <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={submitting}>
          {submitting ? 'Saving…' : 'Save listing'}
        </button>
      </div>
    </form>
  );
}

// Real incoming bookings/orders list — replaces the previous "type in a
// Booking ID you'd have to already know from somewhere else" stand-in.
// Pulls from the new GET /api/bookings/business/:id and
// GET /api/orders/business/:id endpoints (owner-only, built alongside this).
function IncomingActivity({ businessId }) {
  const [bookings, setBookings] = useState([]);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  function loadAll() {
    setLoading(true);
    Promise.all([
      getBusinessBookings(businessId).catch(() => ({ bookings: [] })),
      getBusinessOrders(businessId).catch(() => ({ orders: [] })),
    ])
      .then(([bookingsData, ordersData]) => {
        setBookings(bookingsData.bookings || []);
        setOrders(ordersData.orders || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadAll();
  }, [businessId]);

  async function handleMarkBookingFulfilled(id) {
    try {
      await markBookingFulfilled(id);
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAdvanceOrder(id, nextStatus) {
    try {
      await markOrderStatus(id, nextStatus);
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  const openBookings = bookings.filter((b) => b.status === 'confirmed');
  const openOrders = orders.filter((o) => !['completed', 'cancelled'].includes(o.status));

  return (
    <div style={{ marginTop: 20 }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 10 }}>
        Incoming bookings
      </p>
      {loading && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>}
      {!loading && openBookings.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Nothing pending right now.</p>
      )}
      {openBookings.map((b) => (
        <div key={b.id} className="card" style={{ padding: 12, marginBottom: 8 }}>
          <p style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 2px' }}>
            {b.title} — {b.customer_name}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
            {new Date(b.slot_start).toLocaleString()} · ${b.price_charged} ({b.payer_type})
          </p>
          <button
            className="btn-primary"
            style={{ padding: '4px 10px', fontSize: 12 }}
            onClick={() => handleMarkBookingFulfilled(b.id)}
          >
            Mark fulfilled
          </button>
        </div>
      ))}

      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', margin: '20px 0 10px' }}>
        Incoming orders
      </p>
      {!loading && openOrders.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nothing pending right now.</p>
      )}
      {openOrders.map((o) => (
        <OrderRow key={o.id} order={o} onAdvance={handleAdvanceOrder} />
      ))}

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

const NEXT_ORDER_STATUS = {
  confirmed: 'ready',
  ready: 'out_for_delivery',
  out_for_delivery: 'completed',
};

const ORDER_STATUS_LABEL = {
  confirmed: 'Confirmed',
  ready: 'Ready',
  out_for_delivery: 'Out for delivery',
  completed: 'Completed',
};

function OrderRow({ order, onAdvance }) {
  const nextStatus = NEXT_ORDER_STATUS[order.status];
  const itemsSummary = (order.items || []).map((i) => `${i.quantity}x ${i.title}`).join(', ');

  return (
    <div className="card" style={{ padding: 12, marginBottom: 8 }}>
      <p style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 2px' }}>
        {itemsSummary} — {order.customer_name}
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
        ${order.price_charged} · {ORDER_STATUS_LABEL[order.status] || order.status}
        {order.fulfillment_method && ` · ${order.fulfillment_method}`}
      </p>
      {nextStatus && (
        <button
          className="btn-primary"
          style={{ padding: '4px 10px', fontSize: 12 }}
          onClick={() => onAdvance(order.id, nextStatus)}
        >
          Mark {ORDER_STATUS_LABEL[nextStatus].toLowerCase()}
        </button>
      )}
    </div>
  );
}