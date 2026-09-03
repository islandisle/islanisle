import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getListingDetail, createBooking, createOrder, getBusinessReviews, joinWaitlist, checkDelivery, getMyGroup, getBusinessClosures, uploadFlightTicket } from '../api/client';
import { useModalA11y } from '../useModalA11y';
import ChatPanel from '../components/ChatPanel';
import Hint from '../components/Hint';
import { SectionArt } from '../components/SectionArt';
import { AmbientBackground } from '../components/AmbientBackground';
import { friendlyError } from '../friendlyError';
import { useLanguage } from '../i18n';
import { formatPrice } from '../utils/currency';

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

// Batch 19 — same pattern, for listing.dietary_tags.
const DIETARY_TAG_LABELS = {
  vegetarian: 'Vegetarian options',
  vegan: 'Vegan options',
  halal: 'Halal',
  gluten_free: 'Gluten-free options',
  dairy_free: 'Dairy-free options',
  nut_free: 'Nut-free options',
  pescatarian: 'Pescatarian options',
};

export default function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // shared pending-payment result for both bookings and orders
  const [showChat, setShowChat] = useState(false);

  const user = getCurrentUser();
  const isLocal = user?.type === 'local';
  const { t } = useLanguage();

  useEffect(() => {
    getListingDetail(id)
      .then((data) => setListing(data.listing))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  // Batch 30 — tint the page background (styles/theme.css's --page-bg) to
  // this listing's category while it's open; reset on leave.
  useEffect(() => {
    if (listing?.business_type) document.body.dataset.category = listing.business_type;
  }, [listing]);
  useEffect(() => () => { delete document.body.dataset.category; }, []);

  if (loading) return <p style={{ padding: 20 }}>{t('common.loading')}</p>;
  if (!listing) return <p style={{ padding: 20 }} className="error-text">{t('checkout.listing_not_found')}</p>;

  if (result) {
    return <PendingPayment result={result} isLocal={isLocal} onDone={() => navigate('/')} />;
  }

  const price = isLocal ? listing.local_price : listing.tourist_price;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <AmbientBackground type={listing.business_type || 'all'} />
      <button className="btn-secondary" onClick={() => navigate(-1)} style={{ marginBottom: 16 }}>
        ← Back
      </button>

      <SectionArt type={listing.business_type} title={listing.business_name} compact />

      <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>
        {listing.title}
      </h1>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
          {listing.business_name}
          {listing.verified_badge && <span style={{ color: 'var(--lagoon)' }}> · {t('checkout.verified')}</span>}
        </p>
        {localStorage.getItem('atollisle_token') && (
          <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setShowChat(true)}>
            {t('checkout.message_business')}
          </button>
        )}
      </div>

      {showChat && (
        <>
          <Hint id="listing-chat" text={t('hint.chat')} />
          <ChatPanel otherRole="business" otherId={listing.business_id} otherName={listing.business_name} onClose={() => setShowChat(false)} />
        </>
      )}

      <PhotoGallery photos={listing.photos} />

      {listing.description && (
        <p style={{ fontSize: 14, color: 'var(--navy)', marginBottom: 20 }}>{listing.description}</p>
      )}

      <ClosureBanner businessId={listing.business_id} />

      {listing.business_type === 'speedboat' && <LuggageInfo listing={listing} />}

      {listing.business_type === 'excursion' && <ExcursionInfo listing={listing} />}

      {Array.isArray(listing.accessibility_features) && listing.accessibility_features.length > 0 && (
        <div className="card" style={{ padding: 12, marginBottom: 20 }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--navy)', margin: '0 0 6px' }}>
            {t('checkout.accessibility')}
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-secondary)' }}>
            {listing.accessibility_features.map((key) => (
              <li key={key}>{ACCESSIBILITY_FEATURE_LABELS[key] || key}</li>
            ))}
          </ul>
        </div>
      )}

      {Array.isArray(listing.dietary_tags) && listing.dietary_tags.length > 0 && (
        <div className="card" style={{ padding: 12, marginBottom: 20 }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--navy)', margin: '0 0 6px' }}>
            {t('checkout.dietary_options')}
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-secondary)' }}>
            {listing.dietary_tags.map((key) => (
              <li key={key}>{DIETARY_TAG_LABELS[key] || key}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
          {isLocal ? t('checkout.local_price') : t('checkout.tourist_price')}
        </p>
        <p style={{ fontSize: 22, fontWeight: 600, color: 'var(--lagoon)', margin: 0 }}>
          {formatPrice(price, isLocal)}
        </p>
      </div>

      <RefundFeeDisclosure listing={listing} />

      {listing.business_type === 'shop' ? (
        <ShopCheckout listing={listing} isLocal={isLocal} onSuccess={setResult} error={error} setError={setError} />
      ) : (
        <SlotCheckout listing={listing} onSuccess={setResult} error={error} setError={setError} />
      )}

      <Reviews businessId={listing.business_id} />
    </div>
  );
}

// Section 8.4: "the listing stays visible but is shown as closed with the
// stated reason rather than being hidden." Only shows current/upcoming
// closures (the backend already filters to end_date >= today).
function ClosureBanner({ businessId }) {
  const [closures, setClosures] = useState([]);

  useEffect(() => {
    getBusinessClosures(businessId).then((d) => setClosures(d.closures || [])).catch(() => {});
  }, [businessId]);

  if (!closures.length) return null;

  return (
    <div className="card" style={{ padding: 12, marginBottom: 20, background: 'var(--coral-light)', border: 'none' }}>
      {closures.map((c) => (
        <p key={c.id} style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 4px' }}>
          Closed {new Date(c.start_date).toLocaleDateString()}–{new Date(c.end_date).toLocaleDateString()}: {c.reason}
        </p>
      ))}
    </div>
  );
}

// Section 4.4's luggage limits: "shown to the tourist at booking time so
// there are no surprises at boarding." listing.type_specific_fields was
// already captured at listing creation but never rendered anywhere.
// Section 6.4's photo galleries. listings.photos are placeholder
// dev-storage URLs right now (no real object storage wired up yet — see
// business.js's savePhotoPlaceholder / auth.js's identical TODO for
// documents), so a plain <img> would just 404 in any real browser; this
// attempts the real <img> first and falls back to a labeled placeholder
// tile rather than a broken-image icon, so the gallery reads as "photo not
// available yet" instead of looking like a bug once real storage lands.
function PhotoGallery({ photos }) {
  if (!Array.isArray(photos) || photos.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 20, paddingBottom: 4 }}>
      {photos.map((url, i) => (
        <GalleryTile key={url + i} url={url} index={i} />
      ))}
    </div>
  );
}

function GalleryTile({ url, index }) {
  const [failed, setFailed] = useState(false);
  const boxStyle = { width: 120, height: 90, borderRadius: 10, flexShrink: 0, overflow: 'hidden' };

  if (failed) {
    return (
      <div style={{ ...boxStyle, background: 'var(--sand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Photo {index + 1}</span>
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={`Listing photo ${index + 1}`}
      style={{ ...boxStyle, objectFit: 'cover' }}
      onError={() => setFailed(true)}
    />
  );
}

function LuggageInfo({ listing }) {
  const fields = listing.type_specific_fields || {};
  const hasRoute = fields.origin || fields.destination;
  const hasLuggage = fields.luggage_bags != null || fields.luggage_weight_kg != null;
  if (!hasRoute && !hasLuggage) return null;

  return (
    <div className="card" style={{ padding: 12, marginBottom: 20 }}>
      {hasRoute && (
        <p style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 4px' }}>
          {fields.origin || '—'} → {fields.destination || '—'}
          {fields.days_running && ` · ${fields.days_running}`}
        </p>
      )}
      {hasLuggage && (
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
          Luggage allowance: {fields.luggage_bags != null ? `${fields.luggage_bags} bag${fields.luggage_bags === 1 ? '' : 's'}` : 'not specified'}
          {fields.luggage_weight_kg != null && `, up to ${fields.luggage_weight_kg}kg`}
        </p>
      )}
    </div>
  );
}

// Section 4.3 — an excursion's duration, meeting point and what's-included
// are captured on the business listing form (frontend-business Dashboard's
// TYPE_FIELD_CONFIG.excursion) but were never surfaced to the tourist.
// Same card treatment as speedboat's LuggageInfo. whats_included is stored
// as an array (comma-split on save) but tolerate a bare string too.
function ExcursionInfo({ listing }) {
  const { t } = useLanguage();
  const fields = listing.type_specific_fields || {};
  const included = Array.isArray(fields.whats_included)
    ? fields.whats_included
    : fields.whats_included
      ? [fields.whats_included]
      : [];
  if (!fields.duration && !fields.meeting_point && !included.length) return null;

  return (
    <div className="card" style={{ padding: 12, marginBottom: 20 }}>
      {fields.duration && (
        <p style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 4px' }}>
          {t('checkout.duration')}: {fields.duration}
        </p>
      )}
      {fields.meeting_point && (
        <p style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 4px' }}>
          {t('checkout.meeting_point')}: {fields.meeting_point}
        </p>
      )}
      {included.length > 0 && (
        <>
          <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--navy)', margin: '4px 0 4px' }}>
            {t('checkout.whats_included')}
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-secondary)' }}>
            {included.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// Batch 20 fix — Section 7.1 requires the combined refund-fee percentage
// (platform's fixed 5% + the business's own configurable share, default
// 5%) to be disclosed "both at booking time... and again at the point of
// an actual refund." The cancel-confirmation popup (MyActivity.jsx)
// already covers the second half with exact computed dollar amounts; this
// covers the first half, before the tourist ever commits to a booking.
// PLATFORM_REFUND_FEE_PERCENT is kept in sync manually with the fixed 5%
// in backend/src/services/refunds.js — same duplication pattern as this
// file's other spec-derived constants (no shared-constants file yet).
const PLATFORM_REFUND_FEE_PERCENT = 5;

function RefundFeeDisclosure({ listing }) {
  const { t } = useLanguage();
  const businessPercent = Number(listing.refund_fee_business_percent ?? 5);
  const combinedPercent = PLATFORM_REFUND_FEE_PERCENT + businessPercent;
  return (
    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 0, marginBottom: 20 }}>
      {t('checkout.refund_fee_disclosure', { percent: combinedPercent })}
    </p>
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
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 8px' }}>{r.text}</p>
          )}
          {Array.isArray(r.photos) && r.photos.length > 0 && (
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
              {r.photos.map((url, i) => (
                <GalleryTile key={url + i} url={url} index={i} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Guesthouse / restaurant / excursion / speedboat — date/time slot booking.
function SlotCheckout({ listing, onSuccess, error, setError }) {
  const { t } = useLanguage();
  const [slotStart, setSlotStart] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [memberIds, setMemberIds] = useState([]);
  const [booking, setBooking] = useState(false);
  const [slotFull, setSlotFull] = useState(false);
  const [showFailurePopup, setShowFailurePopup] = useState(false);
  const [flightTicketNeeded, setFlightTicketNeeded] = useState(false);

  function toggleMember(userId, checked) {
    setMemberIds((prev) => (checked ? [...prev, userId] : prev.filter((id) => id !== userId)));
  }

  async function handleBook() {
    if (!slotStart) {
      setError(t('checkout.choose_date_time'));
      return;
    }
    setBooking(true);
    setError('');
    setSlotFull(false);
    setFlightTicketNeeded(false);
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
      // Cross-island flight-ticket gate (backend middleware/flightTicketGate.js):
      // handled inline below with an upload prompt that re-submits this same
      // booking on success — not the generic failure modal.
      if (err.code === 'flight_ticket_required') {
        setFlightTicketNeeded(true);
      } else {
        // Section 9's "Payment failure" popup pattern — offer retry, not a dead end.
        // A 409 (slot just got taken) gets its own inline waitlist offer
        // instead of the modal, since "join the waitlist" is a more useful
        // next step than retrying the exact same slot.
        setError(friendlyError(err, { t }));
        if (err.status === 409) {
          setSlotFull(true);
        } else {
          setShowFailurePopup(true);
        }
      }
    } finally {
      setBooking(false);
    }
  }

  return (
    <>
      <label htmlFor="slot-datetime" style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
        {t('checkout.date_time')}
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
        {t('checkout.promo_code')}
      </label>
      <input
        id="slot-promo"
        className="input-field"
        placeholder={t('checkout.promo_placeholder')}
        value={promoCode}
        onChange={(e) => setPromoCode(e.target.value)}
        style={{ marginBottom: 16, textTransform: 'uppercase' }}
      />

      <PaymentMethodOptions />

      {error && <p className="error-text">{error}</p>}
      <button className="btn-primary" style={{ width: '100%' }} onClick={handleBook} disabled={booking}>
        {booking ? t('checkout.booking') : t('common.book_now')}
      </button>

      {slotFull && <WaitlistButton listingId={listing.id} slotStart={slotStart} />}

      {flightTicketNeeded && (
        <FlightTicketPrompt onUploaded={() => { setFlightTicketNeeded(false); handleBook(); }} />
      )}

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

// Cross-island flight-ticket gate (backend middleware/flightTicketGate.js)
// rejected the submission with code 'flight_ticket_required'. Rather than a
// dead-end error, take the upload inline and re-run the exact same
// booking/order on success — the same retry-on-success shape as
// CheckoutFailurePopup's "Try again", just with an upload step first.
function FlightTicketPrompt({ onUploaded }) {
  const { t } = useLanguage();
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      await uploadFlightTicket(file);
      onUploaded();
    } catch (err) {
      setError(friendlyError(err, { t }));
      setUploading(false);
    }
  }

  return (
    <div className="card" style={{ padding: 16, marginTop: 12, background: 'var(--coral-light)', border: 'none' }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', margin: '0 0 6px' }}>
        Flight ticket needed
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 10px' }}>
        You're checked in on another island. Upload your flight ticket to confirm you've flown into the Maldives, and we'll finish this for you.
      </p>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        style={{ fontSize: 13, marginBottom: 10, display: 'block' }}
      />
      {error && <p className="error-text">{error}</p>}
      <button className="btn-primary" style={{ width: '100%' }} onClick={handleUpload} disabled={!file || uploading}>
        {uploading ? 'Uploading…' : 'Upload and continue'}
      </button>
    </div>
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
  const { t } = useLanguage();
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
        {t('checkout.book_for_group')}
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
          {t('checkout.booking_for_group_note', { count: selectedIds.length })}
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
  const { t } = useLanguage();
  const modalRef = useModalA11y(onCancel);
  return (
    <div
      className="glass-scrim"
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
        aria-label={t('checkout.failed_title')}
        style={{ width: '100%', maxWidth: 380, padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--navy)', marginBottom: 8 }}>
          {t('checkout.failed_title')}
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 18 }}>
          {message || t('checkout.failed_body')}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={onCancel}>{t('common.cancel')}</button>
          <button className="btn-primary" style={{ flex: 1 }} onClick={onRetry}>{t('checkout.try_again')}</button>
        </div>
      </div>
    </div>
  );
}

// Section 12's waitlist table — join when a slot's fully booked, get
// notified (see backend/src/routes/bookings.js's cancel handler) if it
// opens back up. Doesn't reserve the slot; still first-come at that point.
function WaitlistButton({ listingId, slotStart }) {
  const { t } = useLanguage();
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
        {status === 'joining' ? t('checkout.joining') : t('checkout.join_waitlist')}
      </button>
      {status === 'error' && <p className="error-text">{message}</p>}
    </div>
  );
}

// Shop — stock-based purchase: quantity + pickup/delivery, not a time slot.
// A shop listing page is a single product; multi-item carts across several
// listings from the same shop aren't built on the frontend yet even though
// POST /api/orders' items array supports it — that's a real, separate gap.
function ShopCheckout({ listing, isLocal, onSuccess, error, setError }) {
  const { t } = useLanguage();
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
  const [flightTicketNeeded, setFlightTicketNeeded] = useState(false);

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
    setFlightTicketNeeded(false);
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
      // Cross-island flight-ticket gate — handled inline, same as SlotCheckout.
      if (err.code === 'flight_ticket_required') {
        setFlightTicketNeeded(true);
      } else {
        setError(friendlyError(err, { t }));
        setShowFailurePopup(true);
      }
    } finally {
      setOrdering(false);
    }
  }

  if (outOfStock) {
    return <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>{t('checkout.out_of_stock')}</p>;
  }

  return (
    <>
      <label htmlFor="shop-quantity" style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
        {t('checkout.quantity')}
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
            {t('checkout.how_fulfill')}
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
                {opt === 'pickup' ? t('checkout.pickup') : t('checkout.delivery')}
              </option>
            ))}
          </select>
        </>
      )}

      {listing.stock_count != null && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
          {t('checkout.left_in_stock', { count: listing.stock_count })}
        </p>
      )}

      {isDelivery && (
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="shop-delivery-island" style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
            {t('checkout.delivering_where')}
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
              {checkingDelivery ? t('checkout.checking') : t('checkout.check')}
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
                {' '}{deliveryCheck.delivery_fee > 0 ? `Delivery fee: ${formatPrice(deliveryCheck.delivery_fee, isLocal)}.` : 'Free delivery.'}
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
        {t('checkout.promo_code')}
      </label>
      <input
        id="shop-promo"
        className="input-field"
        placeholder={t('checkout.promo_placeholder')}
        value={promoCode}
        onChange={(e) => setPromoCode(e.target.value)}
        style={{ marginBottom: 16, textTransform: 'uppercase' }}
      />

      <PaymentMethodOptions />

      {error && <p className="error-text">{error}</p>}
      <button className="btn-primary" style={{ width: '100%' }} onClick={handleOrder} disabled={ordering}>
        {ordering ? t('checkout.placing_order') : t('common.buy_now')}
      </button>

      {flightTicketNeeded && (
        <FlightTicketPrompt onUploaded={() => { setFlightTicketNeeded(false); handleOrder(); }} />
      )}

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
function PendingPayment({ result, isLocal, onDone }) {
  const { t } = useLanguage();
  const isOrder = Boolean(result.order);
  // Section 4.2: a restaurant reservation lands in 'pending_approval'
  // rather than 'confirmed' until the business accepts it.
  const isPendingApproval = result.booking?.status === 'pending_approval';
  return (
    <div style={{ maxWidth: 420, margin: '60px auto', padding: 20, textAlign: 'center' }}>
      <div className="card" style={{ padding: 24 }}>
        <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--navy)', marginBottom: 8 }}>
          {isPendingApproval ? t('pay.reservation_requested') : isOrder ? t('pay.order_confirmed') : t('pay.booking_confirmed')}
        </p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
          {result.message}
        </p>
        <div style={{ background: 'var(--sand)', borderRadius: 8, padding: 12, marginBottom: 16, textAlign: 'left' }}>
          <PriceLine label={t('pay.base_price')} value={result.price_breakdown.base_price} isLocal={isLocal} />
          {result.price_breakdown.promo_discount > 0 && (
            <PriceLine label={t('pay.promo_discount')} value={-result.price_breakdown.promo_discount} isLocal={isLocal} />
          )}
          <PriceLine label={t('pay.total_in_person')} value={result.price_breakdown.total_charged} isLocal={isLocal} bold />
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
          {t('pay.find_in_activity')}
        </p>
        <button className="btn-primary" onClick={onDone} style={{ width: '100%' }}>
          {t('pay.done')}
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
  const { t } = useLanguage();
  return (
    <div style={{ marginBottom: 16 }}>
      <p id="payment-method-label" style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
        {t('pay.method')}
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
          {t('pay.pay_at_visit')}
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
          {t('pay.online_coming_soon')}
        </button>
      </div>
    </div>
  );
}

function PriceLine({ label, value, bold, isLocal }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: bold ? 600 : 400, marginBottom: 4 }}>
      <span>{label}</span>
      <span>{value < 0 ? `-${formatPrice(Math.abs(value), isLocal)}` : formatPrice(value, isLocal)}</span>
    </div>
  );
}