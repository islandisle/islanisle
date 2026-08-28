import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createBusiness, getMyListings, createListing, markBookingFulfilled,
  getBusinessBookings, getBusinessOrders, markOrderStatus,
  getArrivals, checkInBooking, getBookingDocuments, getBusinessReviews, getNotifications,
  getBusinessReturns, approveReturn, rejectReturn, processReturn,
  fileDispute, approveReservation, rejectReservation, sendEtaUpdate,
  getExternalPlaces, claimExternalPlace,
} from '../api/client';
import CheckInScanner from '../components/CheckInScanner';
import IslandPicker from '../components/IslandPicker';
import NavMenu from '../components/NavMenu';
import { SectionArt } from '../components/SectionArt';

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

  function handleLogout() {
    localStorage.removeItem('atollisle_business_token');
    localStorage.removeItem('atollisle_business');
    localStorage.removeItem('atollisle_business_user');
    navigate('/login');
  }

  if (!business) {
    return (
      <>
        <CreateBusinessForm onCreated={handleBusinessCreated} />
        <ClaimBusinessSection />
      </>
    );
  }

  const navItems = [
    { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { to: '/analytics', label: 'Analytics', icon: 'analytics' },
    { to: '/payouts', label: 'Payouts', icon: 'payouts' },
    { to: '/b2b', label: 'B2B partnerships', icon: 'b2b' },
    ...((business.type === 'guesthouse' || business.type === 'speedboat')
      ? [{ to: '/group-transfers', label: 'Group transfers', icon: 'transfers' }] : []),
    { to: '/notifications', label: 'Notifications', icon: 'messages' },
    { to: '/settings', label: 'Settings', icon: 'settings' },
    { to: '/support', label: 'Support', icon: 'support' },
    { onClick: handleLogout, label: 'Log out', icon: 'logout', danger: true },
  ];

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 0.3 }}>Atoll Isle · Business</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--navy)' }}>
          <NotificationBellButton businessId={business.id} onClick={() => navigate('/notifications')} />
          <NavMenu items={navItems} buttonStyle={{ background: 'var(--surface)', border: '1px solid var(--border)' }} />
        </div>
      </div>

      <div style={{ background: 'var(--lagoon)', color: '#fff', padding: 16, borderRadius: 12, marginBottom: 20 }}>
        <p style={{ fontSize: 12, opacity: 0.8, margin: '0 0 4px' }}>{business.type}</p>
        <p style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{business.name}</p>
        <p style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>
          Approval: {business.approval_status || 'pending'}
        </p>
      </div>

      {error && <p className="error-text">{error}</p>}

      <SectionArt type={business.type} title="Your listings" compact />

      <AddListingForm businessType={business.type} businessId={business.id} onCreated={loadListings} />

      <div style={{ margin: '24px 0 10px' }}>
        <SectionArt type={business.type} title="Your listings" compact />
      </div>
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

      {business.type === 'guesthouse' && <CheckInSection businessId={business.id} />}

      <IncomingActivity businessId={business.id} businessType={business.type} />

      {business.type === 'shop' && <ReturnsSection businessId={business.id} />}

      <ReviewsSection businessId={business.id} />
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
        <label htmlFor="create-business-type" style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
          What kind of business are you?
        </label>
        <select id="create-business-type" className="input-field" value={type} onChange={(e) => setType(e.target.value)} style={{ marginBottom: 14 }}>
          {BUSINESS_TYPES.map((t) => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>

        <label htmlFor="create-business-name" style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
          Business name
        </label>
        <input id="create-business-name" className="input-field" value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 14 }} />

        <label htmlFor="create-business-island" style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
          Island
        </label>
        <div style={{ marginBottom: 20 }}>
          <IslandPicker value={locationIsland} onChange={setLocationIsland} id="create-business-island" />
        </div>

        {error && <p className="error-text">{error}</p>}
        <button className="btn-primary" type="submit" style={{ width: '100%' }} disabled={submitting}>
          {submitting ? 'Creating…' : 'Create business'}
        </button>
      </form>
    </div>
  );
}

// Batch 25 (not in the original spec) — Ministry of Tourism lodging
// categories all map to our single 'guesthouse' business type (the only
// lodging category we have); a disclosed simplification, not a precise
// equivalence.
const EXTERNAL_PLACE_TYPE_TO_BUSINESS_TYPE = {
  'Guest House': 'guesthouse',
  'Home Stay': 'guesthouse',
  Hotel: 'guesthouse',
};

// Batch 25 — lets a business owner search real Ministry of Tourism
// registered places by island and claim theirs instead of typing a new
// business from scratch. Shown alongside CreateBusinessForm since both are
// ways to get from "no business yet" to a real one.
function ClaimBusinessSection() {
  const [island, setIsland] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [claimingPlace, setClaimingPlace] = useState(null);
  const [submittedMessage, setSubmittedMessage] = useState('');

  useEffect(() => {
    if (!island) { setData(null); return; }
    let cancelled = false;
    getExternalPlaces(island).then((d) => { if (!cancelled) setData(d); }).catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [island]);

  const groups = data
    ? [
        { label: 'Guest houses', places: data.guesthouses },
        { label: 'Home stays', places: data.home_stays },
        { label: 'Hotels', places: data.hotels },
      ].filter((g) => g.places && g.places.length > 0)
    : [];

  return (
    <div style={{ maxWidth: 420, margin: '32px auto 0', padding: '0 20px 32px', borderTop: '1px solid var(--border)' }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--navy)', margin: '20px 0 4px' }}>
        Already registered with the Ministry of Tourism?
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
        Search your island — if we already have your place listed, claim it instead of starting from scratch.
      </p>

      <label htmlFor="claim-island" style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
        Island
      </label>
      <div style={{ marginBottom: 16 }}>
        <IslandPicker value={island} onChange={setIsland} id="claim-island" />
      </div>

      {error && <p className="error-text">{error}</p>}
      {submittedMessage && <p style={{ fontSize: 13, color: 'var(--lagoon)' }}>{submittedMessage}</p>}

      {island && groups.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No unclaimed places found on {island}.</p>
      )}

      {groups.map((group) => (
        <div key={group.label} style={{ marginBottom: 14 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            {group.label}
          </p>
          {group.places.map((place) => (
            <div key={place.id} className="card" style={{ padding: 12, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: 13, color: 'var(--navy)', margin: 0 }}>{place.name}</p>
              <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => { setClaimingPlace(place); setSubmittedMessage(''); }}>
                Claim this business
              </button>
            </div>
          ))}
        </div>
      ))}

      {claimingPlace && (
        <ClaimForm
          place={claimingPlace}
          island={island}
          onClose={() => setClaimingPlace(null)}
          onSubmitted={(message) => {
            setClaimingPlace(null);
            setSubmittedMessage(message);
            setData((prev) => prev && {
              ...prev,
              guesthouses: prev.guesthouses.filter((p) => p.id !== claimingPlace.id),
              home_stays: prev.home_stays.filter((p) => p.id !== claimingPlace.id),
              hotels: prev.hotels.filter((p) => p.id !== claimingPlace.id),
            });
          }}
        />
      )}
    </div>
  );
}

function ClaimForm({ place, island, onClose, onSubmitted }) {
  const [businessName, setBusinessName] = useState(place.name);
  const [businessType, setBusinessType] = useState(EXTERNAL_PLACE_TYPE_TO_BUSINESS_TYPE[place.type] || BUSINESS_TYPES[0]);
  const [contactEmail, setContactEmail] = useState('');
  const [contactMobile, setContactMobile] = useState('');
  const [documentFile, setDocumentFile] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!documentFile) {
      setError('A verification document (business registration certificate) is required.');
      return;
    }
    // Batch 31 — a formal ownership assertion reviewed by Super Admin, so
    // confirm what's being submitted before it goes.
    if (!window.confirm(
      `Submit a claim that you own "${place.name}"?\n\n`
      + `Super Admin will review your verification document. If approved, `
      + `"${businessName}" becomes a live business under your account and this `
      + `place stops showing as unclaimed. Submitting a false claim can get your account suspended.`
    )) {
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await claimExternalPlace(place.id, {
        business_name: businessName,
        business_type: businessType,
        location_island: island,
        contact_email: contactEmail || undefined,
        contact_mobile: contactMobile || undefined,
        document: documentFile,
      });
      onSubmitted(`Claim for "${place.name}" submitted — you'll be notified once Super Admin reviews it.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card" style={{ padding: 16, marginTop: 8 }}>
      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)', margin: '0 0 10px' }}>
        Claim "{place.name}"
      </p>
      <form onSubmit={handleSubmit}>
        <label htmlFor="claim-business-name" style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
          Business name
        </label>
        <input id="claim-business-name" className="input-field" value={businessName} onChange={(e) => setBusinessName(e.target.value)} style={{ marginBottom: 12 }} />

        <label htmlFor="claim-business-type" style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
          Business type
        </label>
        <select id="claim-business-type" className="input-field" value={businessType} onChange={(e) => setBusinessType(e.target.value)} style={{ marginBottom: 12 }}>
          {BUSINESS_TYPES.map((t) => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>

        <label htmlFor="claim-contact-email" style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
          Contact email (optional)
        </label>
        <input id="claim-contact-email" type="email" className="input-field" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} style={{ marginBottom: 12 }} />

        <label htmlFor="claim-contact-mobile" style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
          Contact mobile (optional)
        </label>
        <input id="claim-contact-mobile" className="input-field" value={contactMobile} onChange={(e) => setContactMobile(e.target.value)} style={{ marginBottom: 12 }} />

        <label htmlFor="claim-document" style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
          Verification document (business registration certificate)
        </label>
        <input id="claim-document" type="file" accept="image/*,.pdf" onChange={(e) => setDocumentFile(e.target.files?.[0] || null)} style={{ marginBottom: 14 }} />

        {error && <p className="error-text">{error}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" type="button" onClick={onClose} style={{ flex: 1 }}>
            Cancel
          </button>
          <button className="btn-primary" type="submit" disabled={submitting} style={{ flex: 1 }}>
            {submitting ? 'Submitting…' : 'Submit claim'}
          </button>
        </div>
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

// Kept in sync manually with database/schema.sql's comment above
// listings.accessibility_features — same duplication pattern as
// BUSINESS_TYPES above (no shared-constants file yet). Self-reported by the
// business, not verified; a tourist filters on these via Home.jsx.
const ACCESSIBILITY_FEATURES = [
  { key: 'wheelchair_accessible', label: 'Wheelchair accessible' },
  { key: 'step_free_access', label: 'Step-free access' },
  { key: 'accessible_bathroom', label: 'Accessible bathroom' },
  { key: 'elevator_available', label: 'Elevator available' },
  { key: 'braille_signage', label: 'Braille signage' },
  { key: 'hearing_loop', label: 'Hearing loop' },
  { key: 'service_animal_friendly', label: 'Service animal friendly' },
  { key: 'accessible_parking', label: 'Accessible parking' },
];

// Batch 19 — same self-reported tag pattern as ACCESSIBILITY_FEATURES,
// kept in sync manually with schema.sql's comment above
// listings.dietary_tags. Shown for restaurant listings, where it's most
// actually useful, though the backend doesn't restrict it to that type.
const DIETARY_TAGS = [
  { key: 'vegetarian', label: 'Vegetarian options' },
  { key: 'vegan', label: 'Vegan options' },
  { key: 'halal', label: 'Halal' },
  { key: 'gluten_free', label: 'Gluten-free options' },
  { key: 'dairy_free', label: 'Dairy-free options' },
  { key: 'nut_free', label: 'Nut-free options' },
  { key: 'pescatarian', label: 'Pescatarian options' },
];

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
  const [accessibilityFeatures, setAccessibilityFeatures] = useState([]);
  const [dietaryTags, setDietaryTags] = useState([]);
  const [payAtVisitEnabled, setPayAtVisitEnabled] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);

  const fieldConfig = TYPE_FIELD_CONFIG[businessType] || [];

  function setTypeField(key, value) {
    setTypeFields((prev) => ({ ...prev, [key]: value }));
  }

  function toggleAccessibilityFeature(key, checked) {
    setAccessibilityFeatures((prev) =>
      checked ? [...prev, key] : prev.filter((k) => k !== key)
    );
  }

  function toggleDietaryTag(key, checked) {
    setDietaryTags((prev) =>
      checked ? [...prev, key] : prev.filter((k) => k !== key)
    );
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
    setAccessibilityFeatures([]);
    setDietaryTags([]);
    setPayAtVisitEnabled(false);
    setPhotos([]);
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
        accessibility_features: accessibilityFeatures,
        dietary_tags: dietaryTags,
        pay_at_visit_enabled: payAtVisitEnabled,
        photos,
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

      const created = await createListing(businessId, payload);
      resetForm();
      onCreated();
      // Duplicate-listing detection (Batch 19) — non-blocking, so the
      // listing is already saved by the time this fires; just a heads-up.
      if (created.duplicate_warning) {
        window.alert(created.duplicate_warning);
      }
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
      <label htmlFor="listing-photos" style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
        Photos (optional, up to 6)
      </label>
      <input
        id="listing-photos"
        className="input-field"
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => setPhotos(Array.from(e.target.files || []).slice(0, 6))}
        style={{ marginBottom: 10 }}
      />
      {photos.length > 0 && (
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
          {photos.length} photo{photos.length > 1 ? 's' : ''} selected
        </p>
      )}
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
              <label htmlFor={`listing-field-${field.key}`} style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
                {field.label}
              </label>
              <input
                id={`listing-field-${field.key}`}
                className="input-field"
                type={field.type}
                value={typeFields[field.key] || ''}
                onChange={(e) => setTypeField(field.key, e.target.value)}
              />
            </div>
          ))}
        </>
      )}

      <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0 12px' }} />
      <p id="listing-accessibility-label" style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
        Accessibility features
      </p>
      <div role="group" aria-labelledby="listing-accessibility-label" style={{ marginBottom: 10 }}>
        {ACCESSIBILITY_FEATURES.map((feature) => (
          <label key={feature.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 6 }}>
            <input
              type="checkbox"
              checked={accessibilityFeatures.includes(feature.key)}
              onChange={(e) => toggleAccessibilityFeature(feature.key, e.target.checked)}
            />
            {feature.label}
          </label>
        ))}
      </div>

      {businessType === 'restaurant' && (
        <>
          <p id="listing-dietary-label" style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Dietary options
          </p>
          <div role="group" aria-labelledby="listing-dietary-label" style={{ marginBottom: 10 }}>
            {DIETARY_TAGS.map((tag) => (
              <label key={tag.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={dietaryTags.includes(tag.key)}
                  onChange={(e) => toggleDietaryTag(tag.key, e.target.checked)}
                />
                {tag.label}
              </label>
            ))}
          </div>
        </>
      )}

      <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0 12px' }} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 4 }}>
        <input
          type="checkbox"
          checked={payAtVisitEnabled}
          onChange={(e) => setPayAtVisitEnabled(e.target.checked)}
        />
        Accept Pay at Visit for this listing
      </label>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
        Lets a guest reserve without paying online, settling with you in person instead. Forced on
        automatically while your account is still building trust, regardless of this setting.
      </p>

      {businessType === 'shop' && (
        <>
          <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0 12px' }} />
          <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Inventory &amp; fulfillment
          </p>
          <div style={{ marginBottom: 10 }}>
            <label htmlFor="listing-stock-count" style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
              Stock count
            </label>
            <input
              id="listing-stock-count"
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
function IncomingActivity({ businessId, businessType }) {
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

  // paymentCollected (Batch 23) defaults true — the normal case. Passing
  // false is an explicit, separate action (see the "Payment not collected"
  // button below), not a silent side-effect of the regular fulfill button.
  async function handleMarkBookingFulfilled(id, paymentCollected = true) {
    if (!paymentCollected && !window.confirm('Mark this fulfilled with payment NOT collected? This is tracked against the guest\'s account and reported for review.')) {
      return;
    }
    try {
      const res = await markBookingFulfilled(id, paymentCollected);
      if (res.queued) window.alert(res.message);
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAdvanceOrder(id, nextStatus, paymentCollected = true) {
    if (nextStatus === 'completed' && !paymentCollected && !window.confirm('Mark this order completed with payment NOT collected? This is tracked against the buyer\'s account and reported for review.')) {
      return;
    }
    try {
      const res = await markOrderStatus(id, nextStatus, paymentCollected);
      if (res.queued) window.alert(res.message);
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleApproveReservation(id) {
    try {
      await approveReservation(id);
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRejectReservation(id) {
    const reason = window.prompt('Reason for declining (optional):') || '';
    try {
      await rejectReservation(id, reason);
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  const pendingApproval = bookings.filter((b) => b.status === 'pending_approval');
  const openBookings = bookings.filter((b) => b.status === 'confirmed');
  const openOrders = orders.filter((o) => !['completed', 'cancelled'].includes(o.status));

  return (
    <div style={{ marginTop: 20 }}>
      {pendingApproval.length > 0 && (
        <>
          <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 10 }}>
            Reservation requests ({pendingApproval.length})
          </p>
          {pendingApproval.map((b) => (
            <div key={b.id} className="card" style={{ padding: 12, marginBottom: 8 }}>
              <p style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 2px' }}>
                {b.title} — {b.customer_name}
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
                {new Date(b.slot_start).toLocaleString()} · ${b.price_charged}
                {b.party_size > 1 && ` · Party of ${b.party_size}`}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => handleRejectReservation(b.id)}>
                  Decline
                </button>
                <button className="btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => handleApproveReservation(b.id)}>
                  Accept
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', margin: '20px 0 10px' }}>
        Incoming bookings
      </p>
      {loading && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>}
      {!loading && openBookings.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Nothing pending right now.</p>
      )}
      {businessType === 'speedboat' ? (
        <DepartureManifest bookings={openBookings} businessId={businessId} onMarkFulfilled={handleMarkBookingFulfilled} />
      ) : (
        openBookings.map((b) => (
          <div key={b.id} className="card" style={{ padding: 12, marginBottom: 8 }}>
            <p style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 2px' }}>
              {b.title} — {b.customer_name}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
              {new Date(b.slot_start).toLocaleString()} · ${b.price_charged} ({b.payer_type})
              {b.party_size > 1 && ` · Party of ${b.party_size}`}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                className="btn-primary"
                style={{ padding: '4px 10px', fontSize: 12 }}
                onClick={() => handleMarkBookingFulfilled(b.id)}
              >
                Mark fulfilled
              </button>
              {b.payment_method === 'pay_at_visit' && (
                <button
                  className="btn-secondary"
                  style={{ padding: '4px 10px', fontSize: 12, color: 'var(--coral)' }}
                  onClick={() => handleMarkBookingFulfilled(b.id, false)}
                >
                  Payment not collected
                </button>
              )}
            </div>
            <ReportProblem businessId={businessId} bookingId={b.id} />
          </div>
        ))
      )}

      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', margin: '20px 0 10px' }}>
        Incoming orders
      </p>
      {!loading && openOrders.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nothing pending right now.</p>
      )}
      {openOrders.map((o) => (
        <OrderRow key={o.id} order={o} businessId={businessId} onAdvance={handleAdvanceOrder} />
      ))}

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

// Section 4.4's "manage manifest per departure" — groups a speedboat's
// confirmed bookings by slot_start (one group per departure) instead of the
// flat list every other business type uses, so an operator can see who's on
// which specific boat rather than scanning the whole day's list.
function DepartureManifest({ bookings, businessId, onMarkFulfilled }) {
  const byDeparture = {};
  for (const b of bookings) {
    (byDeparture[b.slot_start] ??= []).push(b);
  }
  const departures = Object.keys(byDeparture).sort();

  if (departures.length === 0) return null;

  return (
    <>
      {departures.map((slot) => {
        const passengers = byDeparture[slot];
        const totalPax = passengers.reduce((sum, p) => sum + (p.party_size || 1), 0);
        return (
          <div key={slot} className="card" style={{ padding: 12, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', margin: 0 }}>
                {new Date(slot).toLocaleString()} · {totalPax} passenger{totalPax === 1 ? '' : 's'}
              </p>
              <EtaUpdateButton listingId={passengers[0].listing_id} slotStart={slot} />
            </div>
            {passengers.map((p) => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {p.customer_name}{p.party_size > 1 && ` (+${p.party_size - 1})`} · ${p.price_charged}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-secondary" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => onMarkFulfilled(p.id)}>
                    Boarded
                  </button>
                  {p.payment_method === 'pay_at_visit' && (
                    <button
                      className="btn-secondary"
                      style={{ padding: '3px 8px', fontSize: 11, color: 'var(--coral)' }}
                      onClick={() => onMarkFulfilled(p.id, false)}
                    >
                      Boarded, unpaid
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}

// Section 6.5's ETA-update — sends one free-text update to every confirmed
// passenger on this specific departure.
function EtaUpdateButton({ listingId, slotStart }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleClick() {
    const message = window.prompt('ETA update to send to all passengers on this departure:');
    if (!message || !message.trim()) return;
    setSending(true);
    try {
      const res = await sendEtaUpdate(listingId, slotStart, message.trim());
      window.alert(`Sent to ${res.recipients} passenger${res.recipients === 1 ? '' : 's'}.`);
      setSent(true);
    } catch (err) {
      window.alert(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <button className="btn-secondary" style={{ padding: '3px 8px', fontSize: 11 }} onClick={handleClick} disabled={sending}>
      {sending ? 'Sending…' : sent ? 'Update sent' : 'Send ETA update'}
    </button>
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

function OrderRow({ order, businessId, onAdvance }) {
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
        {order.party_size > 1 && ` · Party of ${order.party_size}`}
      </p>
      {nextStatus && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="btn-primary"
            style={{ padding: '4px 10px', fontSize: 12 }}
            onClick={() => onAdvance(order.id, nextStatus)}
          >
            Mark {ORDER_STATUS_LABEL[nextStatus].toLowerCase()}
          </button>
          {nextStatus === 'completed' && order.payment_method === 'pay_at_visit' && (
            <button
              className="btn-secondary"
              style={{ padding: '4px 10px', fontSize: 12, color: 'var(--coral)' }}
              onClick={() => onAdvance(order.id, nextStatus, false)}
            >
              Payment not collected
            </button>
          )}
        </div>
      )}
      <ReportProblem businessId={businessId} orderId={order.id} />
    </div>
  );
}

const BUSINESS_DISPUTE_REASONS = [
  { value: 'guest_no_show', label: 'Guest was a no-show' },
  { value: 'payment_dispute', label: 'Payment dispute' },
  { value: 'abusive_behavior', label: 'Abusive behavior' },
  { value: 'other', label: 'Other' },
];

// Section 7.1 "Report a problem" — mirrors frontend-tourist's MyActivity.jsx
// version, but files as the business (raised_by: 'business' — see
// disputes.js) rather than as the owner's own user account.
function ReportProblem({ businessId, bookingId, orderId }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(BUSINESS_DISPUTE_REASONS[0].value);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await fileDispute(businessId, { booking_id: bookingId, order_id: orderId, reason, description });
      setSuccess(res.message || "We've received your report. You'll hear back once it's reviewed.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return <p style={{ fontSize: 12, color: 'var(--lagoon)', marginTop: 8 }}>{success}</p>;
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
    <form onSubmit={handleSubmit} style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
      <label htmlFor={`biz-dispute-reason-${bookingId || orderId}`} style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
        What went wrong?
      </label>
      <select
        id={`biz-dispute-reason-${bookingId || orderId}`}
        className="input-field"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        style={{ fontSize: 13, marginBottom: 8 }}
      >
        {BUSINESS_DISPUTE_REASONS.map((r) => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>

      <label htmlFor={`biz-dispute-desc-${bookingId || orderId}`} style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
        Details (optional)
      </label>
      <textarea
        id={`biz-dispute-desc-${bookingId || orderId}`}
        className="input-field"
        rows={3}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        style={{ fontSize: 13, marginBottom: 8, resize: 'vertical' }}
      />

      {error && <p className="error-text">{error}</p>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setOpen(false)} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit report'}
        </button>
      </div>
    </form>
  );
}

// Guesthouse check-in. Front desk can either scan a guest's personal QR
// (the QR shown on their booking in the tourist app — see
// frontend-tourist/src/pages/MyActivity.jsx — which encodes the booking id)
// or pick them straight off today's arrivals list without scanning; either
// way it ends at the same CheckInForm, matching backend/src/routes/checkin.js.
function CheckInSection({ businessId }) {
  const [arrivals, setArrivals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanError, setScanError] = useState('');
  const [openBookingId, setOpenBookingId] = useState(null);
  const [openViaQr, setOpenViaQr] = useState(false);

  function loadArrivals() {
    setLoading(true);
    getArrivals(businessId)
      .then((data) => setArrivals(data.arrivals || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadArrivals();
  }, [businessId]);

  function handleScan(code, resumeScanning) {
    const match = arrivals.find((a) => a.id === code && a.check_in_status !== 'checked_in');
    if (!match) {
      setScanError("That code doesn't match a pending arrival today.");
      resumeScanning();
      return;
    }
    setScanError('');
    setScannerOpen(false);
    setOpenViaQr(true);
    setOpenBookingId(match.id);
  }

  const pending = arrivals.filter((a) => a.check_in_status !== 'checked_in');
  const checkedIn = arrivals.filter((a) => a.check_in_status === 'checked_in');

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', margin: 0 }}>
          Today's arrivals
        </p>
        <button
          className="btn-secondary"
          style={{ padding: '4px 10px', fontSize: 12 }}
          onClick={() => { setScanError(''); setScannerOpen((open) => !open); }}
        >
          {scannerOpen ? 'Close scanner' : 'Scan to check in'}
        </button>
      </div>

      {scannerOpen && (
        <>
          <CheckInScanner onScan={handleScan} />
          {scanError && <p className="error-text">{scanError}</p>}
        </>
      )}

      {error && <p className="error-text">{error}</p>}
      {loading && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>}
      {!loading && arrivals.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          No arrivals scheduled for today.
        </p>
      )}

      {pending.map((a) => (
        <ArrivalRow
          key={a.id}
          arrival={a}
          open={openBookingId === a.id}
          viaQr={openBookingId === a.id && openViaQr}
          onOpen={() => { setOpenViaQr(false); setOpenBookingId(a.id); }}
          onClose={() => setOpenBookingId(null)}
          onCheckedIn={() => { setOpenBookingId(null); loadArrivals(); }}
        />
      ))}

      {checkedIn.length > 0 && (
        <>
          <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', margin: '16px 0 8px' }}>
            Already checked in
          </p>
          {checkedIn.map((a) => (
            <ArrivalRow key={a.id} arrival={a} open={false} viaQr={false} onOpen={() => {}} onClose={() => {}} onCheckedIn={() => {}} />
          ))}
        </>
      )}
    </div>
  );
}

const CHECK_IN_STATUS_LABEL = {
  pending: 'Not checked in',
  partially_checked_in: 'Partially checked in',
  checked_in: 'Checked in',
};

function ArrivalRow({ arrival, open, viaQr, onOpen, onClose, onCheckedIn }) {
  const isCheckedIn = arrival.check_in_status === 'checked_in';

  return (
    <div className="card" style={{ padding: 12, marginBottom: 8 }}>
      <p style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 2px' }}>
        {arrival.customer_name} — {arrival.title}
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
        {CHECK_IN_STATUS_LABEL[arrival.check_in_status] || arrival.check_in_status}
        {arrival.room_number && ` · Room ${arrival.room_number}`}
        {arrival.group_members && ` · Party of ${arrival.group_members.length}`}
      </p>

      {!isCheckedIn && !open && (
        <button className="btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={onOpen}>
          Check in
        </button>
      )}

      {isCheckedIn && <ViewDocumentsButton bookingId={arrival.id} />}

      {open && <CheckInForm arrival={arrival} viaQr={viaQr} onDone={onCheckedIn} onCancel={onClose} />}
    </div>
  );
}

// document_access_grants (Batch 19) — checkin.js grants this the moment a
// guest is checked in, and revokes it if the booking is later cancelled;
// this is the only place that reads it back. Photo URLs are the same
// local-dev-storage:// placeholders used everywhere else in this
// environment (no real object storage wired up) — the onError fallback
// mirrors frontend-tourist's ListingDetail.jsx PhotoGallery pattern.
function ViewDocumentsButton({ bookingId }) {
  const [open, setOpen] = useState(false);
  const [documents, setDocuments] = useState(null);
  const [error, setError] = useState('');

  function handleOpen() {
    setOpen(true);
    if (documents) return;
    getBookingDocuments(bookingId)
      .then((data) => setDocuments(data.documents))
      .catch((err) => setError(err.message));
  }

  return (
    <>
      <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={handleOpen}>
        View ID
      </button>
      {open && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          {error && <p className="error-text">{error}</p>}
          {!documents && !error && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading…</p>}
          {documents && documents.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No document on file for this guest.</p>
          )}
          {documents && documents.map((doc) => (
            <div key={doc.user_id} style={{ marginBottom: 8 }}>
              <p style={{ fontSize: 12, color: 'var(--navy)', margin: '0 0 4px' }}>
                {doc.name} — {doc.uploaded_document_type === 'passport' ? 'Passport' : 'ID card'}
              </p>
              <div
                style={{
                  width: 160, height: 100, borderRadius: 6, background: 'var(--surface-alt, #eee)',
                  border: '1px solid var(--border)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', overflow: 'hidden',
                }}
              >
                <img
                  src={doc.document_image_url}
                  alt="Document on file"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'block';
                  }}
                />
                <span style={{ display: 'none', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: 8 }}>
                  Document image unavailable
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function CheckInForm({ arrival, viaQr, onDone, onCancel }) {
  const [mode, setMode] = useState(viaQr ? 'qr' : 'manual'); // 'manual' | 'qr'
  const [roomNumber, setRoomNumber] = useState(arrival.room_number || '');
  const hasGroup = Array.isArray(arrival.group_members) && arrival.group_members.length > 0;
  const [wholeGroup, setWholeGroup] = useState(true);
  const [selectedMembers, setSelectedMembers] = useState(
    () => new Set((arrival.group_members || []).map((m) => m.member_id))
  );
  // Reaching this form via the outer "Scan to check in" flow already
  // matched a scanned code against this exact booking (see CheckInSection's
  // handleScan) — no need to make the guest scan a second time.
  const [scanned, setScanned] = useState(viaQr);
  const [scanError, setScanError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function toggleMember(memberId, checked) {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (checked) next.add(memberId); else next.delete(memberId);
      return next;
    });
  }

  function handleScan(code, resumeScanning) {
    if (code !== arrival.id) {
      setScanError("That code doesn't match this guest's booking.");
      resumeScanning();
      return;
    }
    setScanError('');
    setScanned(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!roomNumber.trim()) {
      setError('Room number is required.');
      return;
    }
    if (mode === 'qr' && !scanned) {
      setError("Scan the guest's QR code first, or switch to manual.");
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await checkInBooking(arrival.id, {
        method: mode,
        room_number: roomNumber.trim(),
        whole_group: hasGroup ? wholeGroup : false,
        member_ids: hasGroup && !wholeGroup ? Array.from(selectedMembers) : undefined,
      });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <ModePill label="Manual" active={mode === 'manual'} onClick={() => setMode('manual')} />
        <ModePill label="Scan QR" active={mode === 'qr'} onClick={() => { setMode('qr'); setScanError(''); }} />
      </div>

      {mode === 'qr' && !scanned && (
        <>
          <CheckInScanner onScan={handleScan} />
          {scanError && <p className="error-text">{scanError}</p>}
        </>
      )}
      {mode === 'qr' && scanned && (
        <p style={{ fontSize: 12, color: 'var(--lagoon)', marginBottom: 8 }}>QR code matched — ready to check in.</p>
      )}

      <label htmlFor="checkin-room-number" style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
        Room number
      </label>
      <input
        id="checkin-room-number"
        className="input-field"
        value={roomNumber}
        onChange={(e) => setRoomNumber(e.target.value)}
        style={{ marginBottom: 10 }}
      />

      {hasGroup && (
        <>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 6 }}>
            <input type="checkbox" checked={wholeGroup} onChange={(e) => setWholeGroup(e.target.checked)} />
            Check in whole group ({arrival.group_members.length} people)
          </label>
          {!wholeGroup && (
            <div style={{ marginBottom: 10 }}>
              {arrival.group_members.map((m) => (
                <label key={m.member_id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 4 }}>
                  <input
                    type="checkbox"
                    checked={selectedMembers.has(m.member_id)}
                    onChange={(e) => toggleMember(m.member_id, e.target.checked)}
                  />
                  {m.name}
                </label>
              ))}
            </div>
          )}
        </>
      )}

      {error && <p className="error-text">{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} disabled={submitting}>
          {submitting ? 'Checking in…' : 'Confirm check-in'}
        </button>
      </div>
    </form>
  );
}

// GET /api/notifications?business_id= — polled once on mount just for its
// unread_count, same call the Notifications page itself uses for the list.
function NotificationBellButton({ businessId, onClick }) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    getNotifications(businessId)
      .then((data) => setUnreadCount(data.unread_count || 0))
      .catch(() => {});
  }, [businessId]);

  return (
    <button
      className="btn-secondary"
      onClick={onClick}
      style={{ position: 'relative', padding: '4px 12px', fontSize: 12 }}
    >
      Notifications
      {unreadCount > 0 && (
        <span
          style={{
            position: 'absolute',
            top: -6,
            right: -6,
            minWidth: 16,
            height: 16,
            padding: '0 3px',
            borderRadius: 8,
            background: 'var(--coral)',
            color: '#fff',
            fontSize: 10,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );
}

// Returns/exchanges queue (routes/returns.js) — shop businesses only.
function ReturnsSection({ businessId }) {
  const [returns, setReturns] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    getBusinessReturns(businessId)
      .then((data) => setReturns(data.returns || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [businessId]);

  const open = returns.filter((r) => r.status === 'requested' || r.status === 'approved');

  return (
    <div style={{ marginTop: 20 }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 10 }}>
        Returns &amp; exchanges
      </p>
      {loading && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && open.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nothing pending.</p>
      )}
      {open.map((r) => (
        <ReturnRow key={r.id} ret={r} onChanged={load} />
      ))}
    </div>
  );
}

function ReturnRow({ ret, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleApprove() {
    setBusy(true);
    setError('');
    try {
      await approveReturn(ret.id);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    const reason = window.prompt('Reason for declining (required):');
    if (!reason) return;
    setBusy(true);
    setError('');
    try {
      await rejectReturn(ret.id, reason);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleProcess() {
    setBusy(true);
    setError('');
    try {
      await processReturn(ret.id);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ padding: 12, marginBottom: 8 }}>
      <p style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 2px' }}>
        {ret.type === 'exchange' ? 'Exchange' : 'Return'} — {ret.customer_name}
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
        {ret.reason}
      </p>
      {error && <p className="error-text">{error}</p>}
      <div style={{ display: 'flex', gap: 6 }}>
        {ret.status === 'requested' && (
          <>
            <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={handleReject} disabled={busy}>
              Decline
            </button>
            <button className="btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={handleApprove} disabled={busy}>
              Approve
            </button>
          </>
        )}
        {ret.status === 'approved' && (
          <button className="btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={handleProcess} disabled={busy}>
            {ret.type === 'exchange' ? 'Mark exchange complete' : 'Process refund'}
          </button>
        )}
      </div>
    </div>
  );
}

// GET /api/reviews/business/:businessId — public endpoint, reused here so
// the owner can see their own average rating and recent reviews.
function ReviewsSection({ businessId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getBusinessReviews(businessId)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [businessId]);

  return (
    <div style={{ marginTop: 20 }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 10 }}>
        Reviews
        {data && data.total > 0 && (
          <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>
            {' '}· {data.average_rating.toFixed(1)} ★ ({data.total})
          </span>
        )}
      </p>
      {error && <p className="error-text">{error}</p>}
      {data && data.total === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No reviews yet.</p>
      )}
      {data && data.reviews.map((r) => (
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

function ModePill({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '4px 12px',
        borderRadius: 20,
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