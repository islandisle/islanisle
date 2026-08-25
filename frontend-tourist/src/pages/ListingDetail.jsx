import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getListingDetail, createBooking, createOrder, getBusinessReviews, joinWaitlist, checkDelivery, getMyGroup } from '../api/client';
import { useModalA11y } from '../useModalA11y';

function getCurrentUser() {
  const raw = localStorage.getItem('atollisle_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Same tag set as Home.jsx's ACCESSIBILITY_FEATURES / frontend-business's
// Dashboard.jsx — just the human-readable label side, keyed by
// listing.accessibility_features's raw tag strings.
const ACCESSIBILITY_FEATURE_LABELS = {
  wheelchair_accessible: 'Wheelchair accessible',
  step_free_access: 'Step-free access',
  accessible_bathroom: 'Accessible bathroom',
  elevator_available: 'Elevator available',
  braille_signage: 'Braille signage',
  hearing_loop: 'Hearing loop',
  service_animal_friendly: 'Service animal friendly',
  accessible_parking: 'Accessible parking',
};

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

      {Array.isArray(listing.accessibility_features) && listing.accessibility_features.length > 0 && (
        <div className="card" style={{ padding: 12, marginBottom: 20 }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--navy)', margin: '0 0 6px' }}>
            Accessibility
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-secondary)' }}>
            {listing.accessibility_features.map((key) => (
              <li key={key}>{ACCESSIBILITY_FEATURE_LABELS[key] || key}</li>
            ))}
          </ul>
        </div>
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
  const [promoCode, setPromoCode] = useState('');
  const [memberIds, setMemberIds] = useState([]);
  const [booking, setBooking] = useState(false);
  const [slotFull, setSlotFull] = useState(false);
  const [showFailurePopup, setShowFailurePopup] = useState(false);

  function toggleMember(userId, checked) {
    setMemberIds((prev) => (checked ? [...prev, userId] : prev.filter((id) => id !== userId)));
  }

  async function handleBook() {
    if (!slotStart) {
      setError('Please choose a date/time.');
      return;
    }
    setBooking(true);
    setError('');
    setSlotFull(false);
    try {
      const res = await createBooking({
        listing_id: listing.id, slot_start: slotStart, payment_method: 'pay_at_visit', promo_code: promoCode,
        member_ids: memberIds,
      });
      // Offline (api/client.js's offlineQueue) — queued for auto-retry
      // rather than a real confirmation, so this isn't the same "success"
      // PendingPayment expects (no price_breakdown yet).
      if (res.queued) {
        setError('');
        window.alert(res.message);
      } else {
        onSuccess(res);
      }
    } catch (err) {
      // Section 9's "Payment failure" popup pattern — offer retry, not a dead end.
      // A 409 (slot just got taken) gets its own inline waitlist offer
      // instead of the modal, since "join the waitlist" is a more useful
      // next step than retrying the exact same slot.
      setError(err.message);
      if (err.status === 409) {
        setSlotFull(true);
      } else {
        setShowFailurePopup(true);
      }
    } finally {
      setBooking(false);
    }
  }

  return (
    <>
      <label htmlFor="slot-datetime" style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
        Date &amp; time
      </label>
      <input
        id="slot-datetime"
        className="input-field"
        type="datetime-local"
        value={slotStart}
        onChange={(e) => { setSlotStart(e.target.value); setSlotFull(false); }}
        style={{ marginBottom: 16 }}
      />

      <GroupMemberPicker selectedIds={memberIds} onToggle={toggleMember} />

      <label htmlFor="slot-promo" style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
        Promo code (optional)
      </label>
      <input
        id="slot-promo"
        className="input-field"
        placeholder="e.g. WELCOME10"
        value={promoCode}
        onChange={(e) => setPromoCode(e.target.value)}
        style={{ marginBottom: 16, textTransform: 'uppercase' }}
      />

      <PaymentMethodOptions />

      {error && <p className="error-text">{error}</p>}
      <button className="btn-primary" style={{ width: '100%' }} onClick={handleBook} disabled={booking}>
        {booking ? 'Booking…' : 'Book now'}
      </button>

      {slotFull && <WaitlistButton listingId={listing.id} slotStart={slotStart} />}

      {showFailurePopup && (
        <CheckoutFailurePopup
          message={error}
          onRetry={() => { setShowFailurePopup(false); handleBook(); }}
          onCancel={() => setShowFailurePopup(false)}
        />
      )}
    </>
  );
}

// Section 2.2's group booking: "any group member can book anything... for
// the whole group or a selected subset." One booking/order row still gets
// created (no per-headcount pricing/capacity model exists anywhere in this
// app — see schema.sql's comment on booking_members), covering the booker
// plus whichever OTHER signed-up group members are checked here; each
// covered member then sees it in their own "My bookings/orders" list
// (bookings.js/orders.js's GET /mine). Placeholder (not-signed-up) members
// have no account to surface it in, so they're excluded from the list.
function GroupMemberPicker({ selectedIds, onToggle }) {
  const [group, setGroup] = useState(null);

  useEffect(() => {
    if (!localStorage.getItem('atollisle_token')) return;
    getMyGroup().then((d) => setGroup(d.group)).catch(() => {});
  }, []);

  const currentUser = getCurrentUser();
  const others = (group?.members || []).filter(
    (m) => m.is_signed_up && m.user_id && m.user_id !== currentUser?.id
  );
  if (!others.length) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <p id="group-members-label" style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
        Book for your group (optional)
      </p>
      <div role="group" aria-labelledby="group-members-label" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {others.map((m) => (
          <label key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={selectedIds.includes(m.user_id)}
              onChange={(e) => onToggle(m.user_id, e.target.checked)}
            />
            {m.name}
          </label>
        ))}
      </div>
      {selectedIds.length > 0 && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          Booking for you + {selectedIds.length} other{selectedIds.length > 1 ? 's' : ''}.
        </p>
      )}
    </div>
  );
}

// Section 9's "Payment failure" popup — offers Try Again (same submission)
// or Cancel rather than leaving the error as a dead-end inline message.
// Currently reachable from any non-slot-conflict checkout failure (a
// rejected Pay at Visit attempt, a backend validation error); it's the same
// generic checkout-failure surface a declined online card would flow
// through once online payment is re-enabled (config/payments.js), so no
// separate payment-specific wiring is needed later.
function CheckoutFailurePopup({ message, onRetry, onCancel }) {
  const modalRef = useModalA11y(onCancel);
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(11, 46, 61, 0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16,
      }}
      onClick={onCancel}
    >
      <div
        ref={modalRef}
        className="card"
        role="dialog"
        aria-modal="true"
        aria-label="Checkout failed"
        style={{ width: '100%', maxWidth: 380, padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--navy)', marginBottom: 8 }}>
          Couldn't complete checkout
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 18 }}>
          {message || 'Something went wrong. You can try again or cancel.'}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>
          <button className="btn-primary" style={{ flex: 1 }} onClick={onRetry}>Try Again</button>
        </div>
      </div>
    </div>
  );
}

// Section 12's waitlist table — join when a slot's fully booked, get
// notified (see backend/src/routes/bookings.js's cancel handler) if it
// opens back up. Doesn't reserve the slot; still first-come at that point.
function WaitlistButton({ listingId, slotStart }) {
  const [status, setStatus] = useState('idle'); // idle | joining | joined | error
  const [message, setMessage] = useState('');

  async function handleJoin() {
    setStatus('joining');
    try {
      const res = await joinWaitlist({ listing_id: listingId, requested_slot: slotStart });
      setMessage(res.message || "You're on the waitlist.");
      setStatus('joined');
    } catch (err) {
      setMessage(err.message);
      setStatus('error');
    }
  }

  if (status === 'joined') {
    return <p style={{ fontSize: 13, color: 'var(--lagoon)', marginTop: 10 }}>{message}</p>;
  }

  return (
    <div style={{ marginTop: 10 }}>
      <button className="btn-secondary" style={{ width: '100%' }} onClick={handleJoin} disabled={status === 'joining'}>
        {status === 'joining' ? 'Joining…' : 'Join waitlist for this slot'}
      </button>
      {status === 'error' && <p className="error-text">{message}</p>}
    </div>
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
  const [promoCode, setPromoCode] = useState('');
  const [memberIds, setMemberIds] = useState([]);
  const [deliveryIsland, setDeliveryIsland] = useState('');
  const [handoverMethod, setHandoverMethod] = useState('buyer_pickup_at_boat');
  const [deliveryCheck, setDeliveryCheck] = useState(null); // null = not checked yet
  const [checkingDelivery, setCheckingDelivery] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [showFailurePopup, setShowFailurePopup] = useState(false);

  function toggleMember(userId, checked) {
    setMemberIds((prev) => (checked ? [...prev, userId] : prev.filter((id) => id !== userId)));
  }

  const fulfillmentOptions = Array.isArray(listing.fulfillment_options) ? listing.fulfillment_options : [];
  const outOfStock = listing.stock_count != null && listing.stock_count <= 0;
  const isDelivery = fulfillment === 'delivery';

  async function handleCheckDelivery() {
    if (!deliveryIsland.trim()) return;
    setCheckingDelivery(true);
    setDeliveryCheck(null);
    try {
      const res = await checkDelivery(listing.id, deliveryIsland.trim());
      setDeliveryCheck(res);
    } catch (err) {
      setDeliveryCheck({ available: false, error: err.message });
    } finally {
      setCheckingDelivery(false);
    }
  }

  async function handleOrder() {
    if (quantity < 1) {
      setError('Quantity must be at least 1.');
      return;
    }
    if (isDelivery && deliveryIsland.trim() && deliveryCheck?.cross_island && !deliveryCheck?.available) {
      setError('Delivery to that island is not currently possible — no speedboat route is listed yet.');
      return;
    }
    setOrdering(true);
    setError('');
    try {
      const res = await createOrder({
        items: [{ listing_id: listing.id, quantity }],
        fulfillment_method: fulfillment || undefined,
        payment_method: 'pay_at_visit',
        promo_code: promoCode,
        delivery_island: isDelivery ? deliveryIsland.trim() : undefined,
        handover_method: isDelivery && deliveryCheck?.cross_island ? handoverMethod : undefined,
        member_ids: memberIds,
      });
      if (res.queued) {
        window.alert(res.message);
      } else {
        onSuccess(res);
      }
    } catch (err) {
      setError(err.message);
      setShowFailurePopup(true);
    } finally {
      setOrdering(false);
    }
  }

  if (outOfStock) {
    return <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Currently out of stock.</p>;
  }

  return (
    <>
      <label htmlFor="shop-quantity" style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
        Quantity
      </label>
      <input
        id="shop-quantity"
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
          <label htmlFor="shop-fulfillment" style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
            How would you like it?
          </label>
          <select
            id="shop-fulfillment"
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

      {isDelivery && (
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="shop-delivery-island" style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
            Delivering to which island?
          </label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              id="shop-delivery-island"
              className="input-field"
              placeholder="e.g. Maafushi"
              value={deliveryIsland}
              onChange={(e) => { setDeliveryIsland(e.target.value); setDeliveryCheck(null); }}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={handleCheckDelivery}
              disabled={!deliveryIsland.trim() || checkingDelivery}
            >
              {checkingDelivery ? 'Checking…' : 'Check'}
            </button>
          </div>

          {deliveryCheck?.error && <p className="error-text">{deliveryCheck.error}</p>}

          {deliveryCheck && !deliveryCheck.error && !deliveryCheck.cross_island && (
            <p style={{ fontSize: 12, color: 'var(--lagoon)' }}>Same-island delivery — no boat transfer needed.</p>
          )}

          {deliveryCheck && !deliveryCheck.error && deliveryCheck.cross_island && !deliveryCheck.available && (
            <p style={{ fontSize: 12, color: 'var(--coral)' }}>
              No speedboat delivery is currently listed from {deliveryCheck.shop_island} to {deliveryCheck.delivery_island}.
            </p>
          )}

          {deliveryCheck && !deliveryCheck.error && deliveryCheck.cross_island && deliveryCheck.available && (
            <>
              <p style={{ fontSize: 12, color: 'var(--lagoon)', marginBottom: 8 }}>
                Deliverable via {deliveryCheck.boat_name} — departs {new Date(deliveryCheck.departure).toLocaleString()}.
              </p>
              <label htmlFor="shop-handover" style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                How should it be handed over?
              </label>
              <select
                id="shop-handover"
                className="input-field"
                value={handoverMethod}
                onChange={(e) => setHandoverMethod(e.target.value)}
              >
                <option value="buyer_pickup_at_boat">I'll pick it up at the boat</option>
                <option value="guesthouse_handover">Deliver to my guesthouse (requires active check-in)</option>
              </select>
            </>
          )}
        </div>
      )}

      <GroupMemberPicker selectedIds={memberIds} onToggle={toggleMember} />

      <label htmlFor="shop-promo" style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
        Promo code (optional)
      </label>
      <input
        id="shop-promo"
        className="input-field"
        placeholder="e.g. WELCOME10"
        value={promoCode}
        onChange={(e) => setPromoCode(e.target.value)}
        style={{ marginBottom: 16, textTransform: 'uppercase' }}
      />

      <PaymentMethodOptions />

      {error && <p className="error-text">{error}</p>}
      <button className="btn-primary" style={{ width: '100%' }} onClick={handleOrder} disabled={ordering}>
        {ordering ? 'Placing order…' : 'Buy now'}
      </button>

      {showFailurePopup && (
        <CheckoutFailurePopup
          message={error}
          onRetry={() => { setShowFailurePopup(false); handleOrder(); }}
          onCancel={() => setShowFailurePopup(false)}
        />
      )}
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
          {result.price_breakdown.promo_discount > 0 && (
            <PriceLine label="Promo discount" value={-result.price_breakdown.promo_discount} />
          )}
          <PriceLine label="Total to pay in person" value={result.price_breakdown.total_charged} bold />
        </div>
        {result.delivery && (
          <p style={{ fontSize: 13, color: 'var(--navy)', marginBottom: 16 }}>
            Delivery via {result.delivery.boat_name}, departing {new Date(result.delivery.departure).toLocaleString()}.{' '}
            {result.delivery.handover_method === 'guesthouse_handover'
              ? "It'll be handed to your guesthouse."
              : "Pick it up at the boat."}
          </p>
        )}
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

// Online payment (Stripe) is switched off platform-wide — see backend's
// config/payments.js's ONLINE_PAYMENTS_ENABLED — since Stripe isn't
// available as a merchant option in the Maldives yet. Pay at Visit is the
// only usable method; this shows the online option as visibly present but
// disabled rather than hiding it, so it's clear it's coming rather than
// missing. Shared by both SlotCheckout and ShopCheckout.
function PaymentMethodOptions() {
  return (
    <div style={{ marginBottom: 16 }}>
      <p id="payment-method-label" style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
        Payment method
      </p>
      <div role="group" aria-labelledby="payment-method-label" style={{ display: 'flex', gap: 8 }}>
        <div
          style={{
            flex: 1,
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--lagoon)',
            color: '#fff',
            fontSize: 13,
            fontWeight: 500,
            textAlign: 'center',
          }}
        >
          Pay at Visit
        </div>
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="Stripe isn't available as a merchant option in the Maldives yet"
          style={{
            flex: 1,
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text-muted)',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'not-allowed',
          }}
        >
          Online payment — coming soon
        </button>
      </div>
    </div>
  );
}

function PriceLine({ label, value, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: bold ? 600 : 400, marginBottom: 4 }}>
      <span>{label}</span>
      <span>{value < 0 ? `-$${Math.abs(value)}` : `$${value}`}</span>
    </div>
  );
}