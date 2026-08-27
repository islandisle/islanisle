// Batch 21 — shared "a business arranges a Pay at Visit booking on a named
// guest's behalf" path, used by both routes/b2b.js's accept handler and
// routes/groupTransfers.js's create handler. Before this, both routes
// independently duplicated the same discount-then-commission math and the
// same bookings INSERT shape — this is that shared piece, pulled out once
// the duplication was actually identical rather than merely similar.
//
// Deliberately NOT used by bookings.js's own tourist-facing checkout,
// which has materially different requirements this shape doesn't cover:
// capacity holds, promo codes, online-payment/escrow, and restaurant
// approval-gating. Forcing that into this minimal shape would blur two
// genuinely different flows together rather than share one real one — the
// part that's actually identical between the B2B and guesthouse-transfer
// callers is exactly this: a business (not the guest) initiates the
// booking, always at pay_at_visit, always pre-confirmed, optionally at a
// discount, with the payer being either that business or the guest
// themselves.

import { round2 } from './refunds.js';

const BUSINESS_COMMISSION_RATE = 0.01; // same flat rate as bookings.js's checkout

// Which type_specific_fields key holds the per-slot capacity, per business
// type — kept identical to bookings.js / agents.js's own copies (no shared
// constants module). Guesthouse rooms and anything without a matching
// field are capacity 1.
const CAPACITY_FIELD_BY_TYPE = {
  restaurant: 'table_capacity',
  excursion: 'capacity_per_slot',
  speedboat: 'seat_capacity',
};

export function getSlotCapacity(businessType, typeSpecificFields) {
  const fieldName = CAPACITY_FIELD_BY_TYPE[businessType];
  if (!fieldName) return 1;
  const parsed = Number(typeSpecificFields?.[fieldName]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

// Throws a { statusCode: 409 } error if placing `seats` more bookings on
// this listing+slot would exceed capacity. Batch 28: b2b.js's accept
// handler and groupTransfers.js both create one booking per guest and
// previously skipped this check entirely, so a guesthouse could arrange an
// excursion or a boat seat that direct tourist checkout (bookings.js) or an
// agent booking (agents.js) — both of which do enforce it — would have
// rejected as full. Counts the same statuses bookings.js's own checkout
// does. Must be called inside the caller's open transaction.
export async function assertSlotCapacity(client, { listingId, slotStart, businessType, typeSpecificFields, seats }) {
  if (!seats || seats < 1) return;
  const capacity = getSlotCapacity(businessType, typeSpecificFields);
  const existing = await client.query(
    `SELECT COUNT(*)::int AS count FROM bookings
     WHERE listing_id = $1 AND slot_start = $2 AND status IN ('confirmed', 'pending_approval')`,
    [listingId, slotStart]
  );
  const taken = existing.rows[0].count;
  if (taken + seats > capacity) {
    const err = new Error(
      capacity === 1
        ? 'That slot is already booked.'
        : `That slot doesn't have room for ${seats} more — ${taken} of ${capacity} already taken.`
    );
    err.statusCode = 409;
    throw err;
  }
}

// `payer` is whatever string the caller's own vocabulary uses for "the
// business pays" (b2b.js: 'business'; groupTransfers.js: 'guesthouse') —
// anything else is treated as "the guest pays their own tourist rate".
export function computeArrangedBookingCharge({ basePrice, discountPercent, payer, businessPayerLabel }) {
  const discountedPrice = round2(Number(basePrice) * (1 - (Number(discountPercent) || 0) / 100));
  const businessCommission = round2(discountedPrice * BUSINESS_COMMISSION_RATE);
  const payerType = payer === businessPayerLabel ? 'business' : 'tourist';
  return { priceCharged: discountedPrice, businessCommission, payerType };
}

// Must be called inside an already-open transaction (`client` is a
// pool.connect()'d client with BEGIN already issued) — both callers create
// several of these per request and need them to all commit or all roll
// back together.
export async function insertArrangedBooking(client, {
  listingId, userId, slotStart, slotEnd = null, basePrice, discountPercent, payer, businessPayerLabel, payerBusinessId,
}) {
  const { priceCharged, businessCommission, payerType } = computeArrangedBookingCharge({
    basePrice, discountPercent, payer, businessPayerLabel,
  });
  const result = await client.query(
    `INSERT INTO bookings (
       listing_id, user_id, slot_start, slot_end, base_price, payer_type, payer_business_id,
       payment_method, business_commission, tourist_commission_applicable, tourist_commission,
       price_charged, status, escrow_status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,'pay_at_visit',$8,false,0,$9,'confirmed','not_applicable')
     RETURNING id`,
    [
      listingId, userId, slotStart, slotEnd, basePrice, payerType,
      payerType === 'business' ? payerBusinessId : null,
      businessCommission, priceCharged,
    ]
  );
  return result.rows[0].id;
}
