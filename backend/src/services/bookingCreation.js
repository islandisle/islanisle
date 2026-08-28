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
const TOURIST_COMMISSION_RATE = 0.02;  // same as bookings.js — only when a Tourist pays online

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
//
// Batch 37 — the commission math now matches bookings.js's direct
// checkout and Section 4.7:
//   - The B2B discount is a courtesy to the *requesting business*. When the
//     TOURIST pays their own rate, the discount is NOT passed through —
//     they're charged the full listed price (Section 4.7: "the full,
//     undiscounted rate"). Only a business payer is charged the discounted
//     rate.
//   - The tourist's separate 2% applies when a Tourist is the payer AND the
//     booking is paid online — the same gate bookings.js uses. Arranged
//     bookings settle 'pay_at_visit' today (b2b.js / groupTransfers.js) so
//     this is 0 in practice, which is correct per Section 9 ("no fee is
//     ever charged to the user for Pay at Visit") — but it's no longer a
//     blanket `false` that would be wrong once an arranged booking is paid
//     online.
//   - business_commission is 1% of whatever base is actually charged, so
//     payoutRun.js's `gross - commission` stays consistent (previously the
//     stored base_price was undiscounted while the 1% was on the discount).
export function computeArrangedBookingCharge({ basePrice, discountPercent, payer, businessPayerLabel, paymentMethod = 'pay_at_visit' }) {
  const payerType = payer === businessPayerLabel ? 'business' : 'tourist';
  const chargedBase = payerType === 'business'
    ? round2(Number(basePrice) * (1 - (Number(discountPercent) || 0) / 100))
    : round2(Number(basePrice));
  const businessCommission = round2(chargedBase * BUSINESS_COMMISSION_RATE);
  const touristCommissionApplicable = payerType === 'tourist' && paymentMethod === 'online';
  const touristCommission = touristCommissionApplicable ? round2(chargedBase * TOURIST_COMMISSION_RATE) : 0;
  const priceCharged = round2(chargedBase + touristCommission);
  return { priceCharged, chargedBase, businessCommission, payerType, touristCommissionApplicable, touristCommission };
}

// Must be called inside an already-open transaction (`client` is a
// pool.connect()'d client with BEGIN already issued) — both callers create
// several of these per request and need them to all commit or all roll
// back together.
export async function insertArrangedBooking(client, {
  listingId, userId, slotStart, slotEnd = null, basePrice, discountPercent, payer, businessPayerLabel, payerBusinessId,
  paymentMethod = 'pay_at_visit',
}) {
  const { priceCharged, chargedBase, businessCommission, payerType, touristCommissionApplicable, touristCommission } =
    computeArrangedBookingCharge({ basePrice, discountPercent, payer, businessPayerLabel, paymentMethod });
  const result = await client.query(
    `INSERT INTO bookings (
       listing_id, user_id, slot_start, slot_end, base_price, payer_type, payer_business_id,
       payment_method, business_commission, tourist_commission_applicable, tourist_commission,
       price_charged, status, escrow_status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'confirmed',$13)
     RETURNING id`,
    [
      listingId, userId, slotStart, slotEnd, chargedBase, payerType,
      payerType === 'business' ? payerBusinessId : null,
      paymentMethod, businessCommission, touristCommissionApplicable, touristCommission,
      priceCharged, paymentMethod === 'online' ? 'held' : 'not_applicable',
    ]
  );
  return result.rows[0].id;
}
