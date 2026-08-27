// Booking engine — script Section 9.
//
// Implements: the document-upload gate, dual pricing (tourist/local rate
// selection), the unified commission rule (business always pays 1%,
// tourist additionally pays 2% when paying online), real capacity-aware
// slot booking, and two payment paths — 'online' (Stripe PaymentIntent,
// stays pending_payment until the webhook in payments.js confirms a real
// charge) and 'pay_at_visit' (settle with the business in person; no
// payment processor involved, booking is confirmed immediately, no 2%
// online fee applies).
//
// Pay at Visit (Section 9 / [PHASE 2]) is gated by trust tier: a 'new',
// unverified business can ONLY take Pay at Visit (pay_at_visit_enabled is
// forced true for its listings — see business.js's listing-creation
// route), and can't use 'online' until it graduates to 'graduated'. A
// graduated business can use either, but pay_at_visit still requires the
// listing to have opted in.
//
// The 'online' path itself is currently switched off platform-wide — see
// config/payments.js's ONLINE_PAYMENTS_ENABLED — since Stripe isn't
// available as a merchant option in the Maldives yet. Every request is
// forced onto pay_at_visit regardless of trust tier while that flag is
// false; the Stripe/PaymentIntent code below stays in place, untouched,
// for when a supported processor is integrated.
//
// The 1% commission on a pay_at_visit booking is accrued (not collected
// directly — no payment ever flows through the platform for these) when
// the booking is marked complete, and actually collected in the monthly
// payout run — see services/payAtVisit.js and services/payoutRun.js.
//
// Slot-hold on conflict (Section 9): a 'pending_payment' booking now counts
// against capacity for as long as services/staleCleanup.js's
// PENDING_PAYMENT_TIMEOUT_MINUTES window still has it eligible to be
// expired — the same window the cleanup job itself uses to release it. This
// makes them the same real hold, not two independently-tuned numbers that
// could drift apart. A capacity check bounded by that window self-corrects
// even between the cleanup job's hourly runs, rather than a hold silently
// outliving its own expiry until the next cron tick clears it.
//
// NOT yet implemented (flagged honestly rather than faked):
//   - Shop purchases. Shops are stock-based (product + quantity), not
//     slot-based (date/time) — see orders.js instead, which already holds
//     stock_count for real, immediately at order creation.

import { Router } from 'express';
import { query, pool } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireDocumentOnFile } from '../middleware/documentGate.js';
import { stripe } from '../config/stripe.js';
import { ONLINE_PAYMENTS_ENABLED, ONLINE_PAYMENTS_DISABLED_MESSAGE } from '../config/payments.js';
import { notify } from '../services/notifications.js';
import { applyPromoCode } from '../services/promoCodes.js';
import { accruePayAtVisitCommission, isPayAtVisitEligible } from '../services/payAtVisit.js';
import { PENDING_PAYMENT_TIMEOUT_MINUTES } from '../services/staleCleanup.js';
import { round2, computeRefund } from '../services/refunds.js';
import { awardLoyaltyCreditForCompletion } from '../services/loyalty.js';
import { reportUnpaidPayAtVisit } from '../services/payAtVisitIncidents.js';

const router = Router();

const BUSINESS_COMMISSION_RATE = 0.01; // 1%, always applies (Section 9)
const TOURIST_COMMISSION_RATE = 0.02;  // 2%, only when payer is Tourist paying online

// CAPACITY: which type_specific_fields key holds the per-slot capacity for
// each business type that books by time slot. Guesthouse rooms and any type
// without a matching field default to a capacity of 1 (a room, once booked
// for a given night, is not double-bookable) — this preserves the previous
// exact-duplicate-blocking behavior for those cases rather than silently
// allowing overbooking if a field is missing.
const CAPACITY_FIELD_BY_TYPE = {
  restaurant: 'table_capacity',
  excursion: 'capacity_per_slot',
  speedboat: 'seat_capacity',
};

function getSlotCapacity(businessType, typeSpecificFields) {
  const fieldName = CAPACITY_FIELD_BY_TYPE[businessType];
  if (!fieldName) return 1;
  const value = typeSpecificFields?.[fieldName];
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * POST /api/bookings
 * body: { listing_id, slot_start, slot_end }
 *
 * Creates the booking in 'pending_payment' status and a matching Stripe
 * PaymentIntent, and returns the client_secret for the frontend to confirm
 * payment with. The booking only flips to 'confirmed' / escrow 'held' once
 * Stripe's webhook confirms the charge actually succeeded (see payments.js)
 * — never optimistically before that, since a booking marked confirmed
 * with no real payment behind it would break the escrow model entirely.
 */
router.post('/', authenticate, requireDocumentOnFile, async (req, res) => {
  const client = await pool.connect();
  try {
    const { listing_id, slot_start, slot_end, payment_method, promo_code, member_ids } = req.body;
    if (!listing_id || !slot_start) {
      return res.status(400).json({ error: 'listing_id and slot_start are required.' });
    }

    // Group bookings (Section 2.2): member_ids is an optional array of
    // OTHER travel-group members' users.id (not the caller's own — they're
    // covered by bookings.user_id already) to also cover with this one
    // booking. Every id must actually share a travel_group with the caller
    // — same roster-lookup shape checkin.js already uses — so a tourist
    // can't add an arbitrary stranger's account to their booking.
    let coveredMemberIds = [];
    if (Array.isArray(member_ids) && member_ids.length > 0) {
      const rosterResult = await query(
        `SELECT DISTINCT tgm2.user_id
         FROM travel_group_members tgm
         JOIN travel_group_members tgm2 ON tgm2.travel_group_id = tgm.travel_group_id
         WHERE tgm.user_id = $1 AND tgm2.user_id = ANY($2::uuid[]) AND tgm2.user_id != $1`,
        [req.user.id, member_ids]
      );
      const validIds = new Set(rosterResult.rows.map((r) => r.user_id));
      const invalid = member_ids.filter((id) => !validIds.has(id));
      if (invalid.length) {
        return res.status(400).json({ error: 'One or more selected members are not in your travel group.' });
      }
      coveredMemberIds = [...validIds];
    }
    // payment_method: 'online' (Stripe, default) or 'pay_at_visit' (schema's
    // payment_method enum already supports this — settle with the business
    // in person, no payment processor involved). pay_at_visit skips the 2%
    // tourist online-payment fee entirely (that fee is explicitly tied to
    // paying online), and the booking is confirmed immediately rather than
    // waiting on a Stripe webhook that will never fire for it.
    const isPayAtVisit = payment_method === 'pay_at_visit';

    const userResult = await query('SELECT type, pay_at_visit_eligible FROM users WHERE id = $1', [req.user.id]);
    if (!userResult.rows.length) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const payerType = userResult.rows[0].type; // 'tourist' | 'local'

    const listingResult = await query(
      `SELECT l.title, l.tourist_price, l.local_price, l.approval_status, l.type_specific_fields,
              l.pay_at_visit_enabled, b.id AS business_id, b.type AS business_type, b.trust_tier,
              b.approval_status AS business_approval_status, b.account_status
       FROM listings l
       JOIN businesses b ON b.id = l.business_id
       WHERE l.id = $1`,
      [listing_id]
    );
    if (!listingResult.rows.length) {
      return res.status(404).json({ error: 'Listing not found.' });
    }
    const listing = listingResult.rows[0];
    if (listing.approval_status !== 'approved') {
      return res.status(400).json({ error: 'This listing is not currently bookable.' });
    }
    // Business suspension (Section 7.2) — listings.js's browse query and
    // orders.js's checkout both already filter a suspended business out;
    // this route never did, so hitting a still-known listing_id directly
    // on a suspended business bypassed it entirely. approval_status is
    // checked too since a business awaiting/denied approval shouldn't be
    // bookable either, matching the same posture as listings.js's browse
    // query (`b.approval_status = 'approved' AND b.account_status = 'active'`).
    if (listing.business_approval_status !== 'approved' || listing.account_status !== 'active') {
      return res.status(400).json({ error: 'This business is not currently available.' });
    }

    // Business closures (Section 8.4): a listing "stays visible but is shown
    // as closed with the stated reason rather than being hidden" — the
    // frontend already surfaces this before checkout, this is the
    // defensive backend check that actually blocks it.
    const closureResult = await query(
      `SELECT reason FROM closures WHERE business_id = $1 AND $2::date BETWEEN start_date AND end_date`,
      [listing.business_id, slot_start]
    );
    if (closureResult.rows.length) {
      return res.status(400).json({ error: `This business is closed on that date: ${closureResult.rows[0].reason}` });
    }

    // Pay at Visit enforcement (Section 9 / [PHASE 2]) — see this file's
    // top comment for the trust-tier rule.
    const isNewBusiness = listing.trust_tier === 'new';
    if (!isPayAtVisit) {
      // Online payment is off platform-wide right now (Stripe isn't
      // available as a merchant option in the Maldives yet) — reject this
      // before the trust-tier check even runs, so it can't be bypassed by
      // pointing at a graduated business. See config/payments.js.
      if (!ONLINE_PAYMENTS_ENABLED) {
        return res.status(400).json({ error: ONLINE_PAYMENTS_DISABLED_MESSAGE });
      }
      if (isNewBusiness) {
        return res.status(400).json({
          error: 'This business is still building trust — only Pay at Visit is available until it graduates.',
        });
      }
    }
    // Only enforced while online payment is actually available — with it
    // globally disabled, Pay at Visit must never be blocked for anyone,
    // regardless of trust tier or whether the listing itself opted in.
    if (isPayAtVisit && ONLINE_PAYMENTS_ENABLED && !(listing.pay_at_visit_enabled === true || isNewBusiness)) {
      return res.status(400).json({ error: 'Pay at Visit is not available for this listing.' });
    }

    // Pay at Visit eligibility (Section 9 / [PHASE 2]) — see
    // services/payAtVisit.js's isPayAtVisitEligible for the full rationale,
    // including why a user's very first-ever booking/order is exempted.
    if (isPayAtVisit && !(await isPayAtVisitEligible(req.user.id, userResult.rows[0].pay_at_visit_eligible))) {
      return res.status(403).json({
        error: payerType === 'tourist'
          ? "Pay at Visit isn't available on this account yet — it unlocks after your first guesthouse or hotel check-in."
          : "Pay at Visit isn't available on this account yet — it unlocks once your Local ID verification is approved.",
      });
    }

    // Dual pricing (Section 3.4): tourist sees tourist_price, local sees local_price.
    const basePrice = payerType === 'tourist' ? listing.tourist_price : listing.local_price;

    // Capacity-aware conflict check: count CONFIRMED bookings, plus any
    // still-within-hold-window PENDING_PAYMENT booking (the slot-hold — see
    // this file's top comment), already on this exact slot, and compare
    // against the listing's capacity for its business type (table_capacity /
    // capacity_per_slot / seat_capacity, or 1 for guesthouse/anything else —
    // see CAPACITY_FIELD_BY_TYPE above).
    const capacity = getSlotCapacity(listing.business_type, listing.type_specific_fields);
    const existingCount = await query(
      `SELECT COUNT(*)::int AS count FROM bookings
       WHERE listing_id = $1 AND slot_start = $2
         AND (status IN ('confirmed', 'pending_approval')
              OR (status = 'pending_payment' AND created_at > now() - make_interval(mins => $3)))`,
      [listing_id, slot_start, PENDING_PAYMENT_TIMEOUT_MINUTES]
    );
    if (existingCount.rows[0].count >= capacity) {
      return res.status(409).json({
        error: capacity === 1
          ? 'That slot was just taken. Please pick another.'
          : `That slot is fully booked (${capacity} spots taken). Please pick another.`,
      });
    }

    // Unified commission rule (Section 9): business always 1%; tourist +2%
    // only when paying online. pay_at_visit never applies the tourist fee.
    // Commissions are computed on the pre-discount basePrice — a promo code
    // is the business's own marketing spend, it doesn't change what the
    // platform's cut is calculated from, only what the tourist ends up paying.
    const businessCommission = round2(basePrice * BUSINESS_COMMISSION_RATE);
    const touristCommissionApplicable = !isPayAtVisit && payerType === 'tourist';
    const touristCommission = touristCommissionApplicable ? round2(basePrice * TOURIST_COMMISSION_RATE) : 0;

    await client.query('BEGIN');

    // Promo codes (Phase 2): validated and claimed atomically inside this
    // transaction, so a later rollback (capacity conflict, Stripe error)
    // also un-claims the use — see services/promoCodes.js.
    let promoCodeId = null;
    let promoDiscountAmount = 0;
    if (promo_code) {
      ({ promoCodeId, discountAmount: promoDiscountAmount } = await applyPromoCode(client, {
        businessId: listing.business_id,
        code: promo_code,
        basePrice,
      }));
    }
    const priceCharged = round2(basePrice + touristCommission - promoDiscountAmount);

    // Restaurant manual accept/reject (Section 4.2): "Accept/reject
    // reservation requests based on real-time availability" — every other
    // business type still auto-confirms within capacity, same as before.
    const requiresApproval = isPayAtVisit && listing.business_type === 'restaurant';

    const bookingResult = await client.query(
      `INSERT INTO bookings (
         listing_id, user_id, slot_start, slot_end, base_price, payer_type, payment_method,
         business_commission, tourist_commission_applicable, tourist_commission, price_charged,
         promo_code_id, promo_discount_amount, status, escrow_status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING id, base_price, price_charged, status, escrow_status`,
      [
        listing_id, req.user.id, slot_start, slot_end || null, basePrice, payerType,
        isPayAtVisit ? 'pay_at_visit' : 'online',
        businessCommission, touristCommissionApplicable, touristCommission, priceCharged,
        promoCodeId, promoDiscountAmount,
        isPayAtVisit ? (requiresApproval ? 'pending_approval' : 'confirmed') : 'pending_payment',
        'not_applicable',
      ]
    );
    const booking = bookingResult.rows[0];

    // Group bookings: fan the booking out to every covered member so it
    // surfaces in their own GET /mine too (see that route below).
    for (const memberId of coveredMemberIds) {
      await client.query(
        `INSERT INTO booking_members (booking_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [booking.id, memberId]
      );
    }

    // pay_at_visit: no Stripe involved at all — the booking is already
    // confirmed (or, for a restaurant, awaiting approval) above, so return
    // immediately. Section 6.5's confirmation notification, normally sent
    // from the webhook once Stripe confirms a real charge, is sent here
    // instead since there's no webhook to send it.
    if (isPayAtVisit) {
      // Digital receipt (Section 6.3) — the Stripe webhook (payments.js) is
      // the only other place an invoice row is ever created, and it only
      // ever fires for the 'online' path. Since that path never applies to
      // a pay_at_visit booking (and, with ONLINE_PAYMENTS_ENABLED off, is
      // currently the platform's ONLY confirmed booking outcome), this is
      // the only place a Pay at Visit invoice can be written. payment_date
      // is left NULL — no payment has actually happened yet, it happens in
      // person when the business marks this fulfilled. Still written even
      // for a pending_approval reservation — it's a receipt of the request,
      // same as the script's "booking_date" isn't the same as "payment_date."
      await client.query(
        `INSERT INTO invoices (
           booking_id, business_id, buyer_user_id, service_description, base_price,
           tourist_commission_line, total_charged, payment_method, booking_date, payment_date, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now(), NULL, $9)`,
        [
          booking.id, listing.business_id, req.user.id, listing.title,
          basePrice, touristCommission, priceCharged, 'pay_at_visit',
          requiresApproval ? 'pending_approval' : 'confirmed',
        ]
      );

      await client.query('COMMIT');

      if (requiresApproval) {
        await notify({
          recipientType: 'user',
          recipientId: req.user.id,
          type: 'reservation_requested',
          title: 'Reservation request sent',
          body: `Your table request at ${new Date(slot_start).toLocaleString()} is awaiting the restaurant's confirmation.`,
        });
        await notify({
          recipientType: 'business',
          recipientId: listing.business_id,
          type: 'new_booking',
          title: 'New reservation request',
          body: `A new table reservation request needs your approval.`,
        });
        return res.status(201).json({
          booking,
          price_breakdown: { base_price: basePrice, tourist_service_fee: 0, promo_discount: promoDiscountAmount, total_charged: priceCharged },
          capacity_remaining: capacity - existingCount.rows[0].count - 1,
          message: `Reservation request sent — awaiting the restaurant's confirmation.`,
        });
      }

      await notify({
        recipientType: 'user',
        recipientId: req.user.id,
        type: 'booking_confirmation',
        title: 'Booking confirmed',
        body: `Your booking is confirmed — pay $${priceCharged} in person when you arrive.`,
      });
      return res.status(201).json({
        booking,
        price_breakdown: { base_price: basePrice, tourist_service_fee: 0, promo_discount: promoDiscountAmount, total_charged: priceCharged },
        capacity_remaining: capacity - existingCount.rows[0].count - 1,
        message: `Booking confirmed. Pay $${priceCharged} in person when you arrive.`,
      });
    }

    // Stripe amount is in the smallest currency unit (cents for USD).
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(priceCharged * 100),
      currency: 'usd',
      metadata: { booking_id: booking.id, user_id: req.user.id, listing_id },
      automatic_payment_methods: { enabled: true },
    });

    await client.query(
      'UPDATE bookings SET stripe_payment_intent_id = $1 WHERE id = $2',
      [paymentIntent.id, booking.id]
    );

    await client.query('COMMIT');

    res.status(201).json({
      booking: { ...booking, status: 'pending_payment' },
      price_breakdown: {
        base_price: basePrice,
        tourist_service_fee: touristCommission,
        promo_discount: promoDiscountAmount,
        total_charged: priceCharged,
      },
      capacity_remaining: capacity - existingCount.rows[0].count - 1,
      client_secret: paymentIntent.client_secret,
      message: 'Booking created — confirm payment on the client to finalize it.',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Booking creation error:', err);
    // Same NODE_ENV gate as config/db.js's query logging — a generic
    // "Could not create booking." for every unexpected failure (a schema
    // drift, a bad env var, a genuine bug) was indistinguishable from an
    // expected 4xx, which made outages like a stale schema (columns this
    // route expects but a database created before they existed doesn't
    // have) look identical to "something's wrong with your request."
    res.status(500).json({
      error: process.env.NODE_ENV === 'production'
        ? 'Could not create booking.'
        : `Could not create booking: ${err.message}`,
    });
  } finally {
    client.release();
  }
});

/**
 * POST /api/bookings/departure/eta-update
 * body: { listing_id, slot_start, message }
 * Section 6.5's ETA-update notification, operator-triggered rather than
 * scheduled (unlike the boarding-reminder job above) — a speedboat operator
 * sends a free-text update to every confirmed passenger on one specific
 * departure. Reuses the same (listing_id, slot_start) shape
 * DepartureManifest (frontend-business's Dashboard.jsx) already groups by.
 */
router.post('/departure/eta-update', authenticate, async (req, res) => {
  const { listing_id, slot_start, message } = req.body;
  if (!listing_id || !slot_start || !message) {
    return res.status(400).json({ error: 'listing_id, slot_start, and message are required.' });
  }
  const ownerCheck = await query(
    `SELECT biz.owner_user_id FROM listings l JOIN businesses biz ON biz.id = l.business_id WHERE l.id = $1`,
    [listing_id]
  );
  if (!ownerCheck.rows.length || ownerCheck.rows[0].owner_user_id !== req.user.id) {
    return res.status(403).json({ error: 'You do not manage this listing.' });
  }

  const passengers = await query(
    `SELECT user_id FROM bookings WHERE listing_id = $1 AND slot_start = $2 AND status = 'confirmed'`,
    [listing_id, slot_start]
  );
  await Promise.all(passengers.rows.map((p) =>
    notify({
      recipientType: 'user', recipientId: p.user_id,
      type: 'eta_update', title: 'Departure update', body: message,
    })
  ));
  res.json({ status: 'sent', recipients: passengers.rows.length });
});

/**
 * GET /api/bookings/mine
 */
router.get('/mine', authenticate, async (req, res) => {
  const result = await query(
    `SELECT b.id, b.slot_start, b.status, b.price_charged, b.check_in_status, b.room_number,
            l.title, biz.name AS business_name, biz.type AS business_type,
            (b.user_id != $1) AS booked_by_someone_else,
            booker.name AS booked_by_name
     FROM bookings b
     JOIN listings l ON l.id = b.listing_id
     JOIN businesses biz ON biz.id = l.business_id
     JOIN users booker ON booker.id = b.user_id
     WHERE b.user_id = $1
        OR b.id IN (SELECT booking_id FROM booking_members WHERE user_id = $1)
     ORDER BY b.slot_start DESC`,
    [req.user.id]
  );
  res.json({ bookings: result.rows });
});


/**
 * GET /api/bookings/:id/cancel-preview
 * Section 7.1's cancellation confirmation popup: "You'll receive $X back —
 * $Y total was withheld" needs to be computed and shown BEFORE the tourist
 * confirms, using the exact same math the actual cancel below applies —
 * see computeRefund. Always previews as a user-initiated (not
 * operator-fault) cancellation, since this is the tourist's own
 * "Cancel booking" button — an operator-cancelled booking is refunded in
 * full automatically and never reaches this confirm-first flow at all.
 */
router.get('/:id/cancel-preview', authenticate, async (req, res) => {
  const bookingResult = await query(
    `SELECT b.price_charged, b.payment_method, b.status, b.user_id, biz.refund_fee_business_percent
     FROM bookings b
     JOIN listings l ON l.id = b.listing_id
     JOIN businesses biz ON biz.id = l.business_id
     WHERE b.id = $1`,
    [req.params.id]
  );
  if (!bookingResult.rows.length) {
    return res.status(404).json({ error: 'Booking not found.' });
  }
  const booking = bookingResult.rows[0];
  if (booking.user_id !== req.user.id) {
    return res.status(403).json({ error: 'This is not your booking.' });
  }
  if (booking.status === 'cancelled') {
    return res.status(400).json({ error: 'Booking is already cancelled.' });
  }

  const refund = computeRefund({
    priceCharged: booking.price_charged,
    paymentMethod: booking.payment_method,
    refundFeeBusinessPercent: booking.refund_fee_business_percent,
    isOperatorFault: false,
  });
  res.json({
    gross_refund_amount: refund.grossRefundAmount,
    refund_app_fee: refund.refundAppFee,
    refund_business_credit: refund.refundBusinessCredit,
    refund_amount: refund.refundAmount,
    fee_applicable: booking.payment_method === 'online',
  });
});

/**
 * GET /api/bookings/business/:businessId
 * Owner-only view of everything booked on a business's listings — the
 * business-frontend Dashboard previously had no way to see this at all; the
 * only booking-related control was a manual "type in a Booking ID" box with
 * no list backing it. This is what that list is queried from.
 */
router.get('/business/:businessId', authenticate, async (req, res) => {
  const ownerCheck = await query(
    'SELECT id FROM businesses WHERE id = $1 AND owner_user_id = $2',
    [req.params.businessId, req.user.id]
  );
  if (!ownerCheck.rows.length) {
    return res.status(404).json({ error: 'Business not found for this account.' });
  }

  const result = await query(
    `SELECT b.id, b.slot_start, b.status, b.escrow_status, b.price_charged, b.payer_type, b.payment_method,
            l.id AS listing_id, l.title,
            COALESCE(u.name, abg.plain_name, 'Guest') AS customer_name,
            1 + (SELECT COUNT(*)::int FROM booking_members bm WHERE bm.booking_id = b.id) AS party_size
     FROM bookings b
     JOIN listings l ON l.id = b.listing_id
     LEFT JOIN users u ON u.id = b.user_id
     LEFT JOIN agent_bookings ab ON ab.resulting_booking_id = b.id
     LEFT JOIN agent_booking_guests abg ON abg.agent_booking_id = ab.id
     WHERE l.business_id = $1
     ORDER BY b.slot_start DESC`,
    [req.params.businessId]
  );
  res.json({ bookings: result.rows });
});

/**
 * PATCH /api/bookings/:id/approve-reservation
 * PATCH /api/bookings/:id/reject-reservation
 * Section 4.2: manual accept/reject for a restaurant reservation sitting in
 * 'pending_approval'. Owner-only, and only meaningful on that status —
 * everything else (guesthouse/excursion/speedboat) never reaches it.
 */
async function requireOwnedPendingApprovalBooking(req, res) {
  const result = await query(
    `SELECT b.id, b.user_id, b.status, l.title, biz.id AS business_id, biz.owner_user_id
     FROM bookings b
     JOIN listings l ON l.id = b.listing_id
     JOIN businesses biz ON biz.id = l.business_id
     WHERE b.id = $1`,
    [req.params.id]
  );
  if (!result.rows.length) {
    res.status(404).json({ error: 'Booking not found.' });
    return null;
  }
  const booking = result.rows[0];
  if (booking.owner_user_id !== req.user.id) {
    res.status(403).json({ error: 'You do not manage this booking.' });
    return null;
  }
  if (booking.status !== 'pending_approval') {
    res.status(400).json({ error: 'This reservation is not awaiting approval.' });
    return null;
  }
  return booking;
}

router.patch('/:id/approve-reservation', authenticate, async (req, res) => {
  const booking = await requireOwnedPendingApprovalBooking(req, res);
  if (!booking) return;

  await query(`UPDATE bookings SET status = 'confirmed', updated_at = now() WHERE id = $1`, [booking.id]);
  await notify({
    recipientType: 'user',
    recipientId: booking.user_id,
    type: 'booking_confirmation',
    title: 'Reservation confirmed',
    body: `Your table reservation for ${booking.title} has been confirmed.`,
  });
  res.json({ status: 'confirmed' });
});

router.patch('/:id/reject-reservation', authenticate, async (req, res) => {
  const booking = await requireOwnedPendingApprovalBooking(req, res);
  if (!booking) return;
  const { reason } = req.body;

  await query(
    `UPDATE bookings SET status = 'cancelled', cancellation_status = 'declined_by_business', updated_at = now() WHERE id = $1`,
    [booking.id]
  );
  await notify({
    recipientType: 'user',
    recipientId: booking.user_id,
    type: 'cancellation',
    title: 'Reservation declined',
    body: reason
      ? `Your table reservation for ${booking.title} couldn't be accommodated: ${reason}`
      : `Your table reservation for ${booking.title} couldn't be accommodated.`,
  });
  res.json({ status: 'cancelled' });
});

/**
 * PATCH /api/bookings/:id/complete
 * body: { payment_collected? } — Batch 23: only meaningful for a
 * pay_at_visit booking; defaults true (the normal case) when omitted, so
 * every pre-existing caller of this route keeps working unchanged.
 * Business marks a confirmed booking as fulfilled (guest checked in, table
 * seated, excursion run, etc.) — Section 7.2: this is what makes the booking
 * eligible for the next payout run. Business-only, and only on their own listings.
 */
router.patch('/:id/complete', authenticate, async (req, res) => {
  const { id } = req.params;
  const paymentCollected = req.body?.payment_collected !== false;

  const ownerCheck = await query(
    `SELECT b.id, b.payment_method, b.business_commission, b.user_id, b.price_charged, biz.id AS business_id
     FROM bookings b
     JOIN listings l ON l.id = b.listing_id
     JOIN businesses biz ON biz.id = l.business_id
     WHERE b.id = $1 AND biz.owner_user_id = $2 AND b.status = 'confirmed'`,
    [id, req.user.id]
  );
  if (!ownerCheck.rows.length) {
    return res.status(404).json({ error: 'Confirmed booking not found for a business you own.' });
  }
  const booking = ownerCheck.rows[0];
  const isPayAtVisit = booking.payment_method === 'pay_at_visit';

  // pay_at_visit never had funds held in escrow, so there's nothing to
  // mark 'released' — stays 'not_applicable'. Its commission is accrued
  // below instead of being deducted from an escrow balance.
  const result = await query(
    `UPDATE bookings SET status = 'completed', escrow_status = $1, updated_at = now()
     WHERE id = $2 RETURNING id, status, escrow_status`,
    [isPayAtVisit ? 'not_applicable' : 'released', id]
  );

  // Batch 23: an unpaid Pay at Visit transaction owes no commission (there
  // was no revenue to take 1% of) and gets no graduation credit — it's
  // tracked as a reliability incident against the guest instead. Not
  // possible for an online-paid booking, since payment already happened
  // before it could ever reach 'confirmed'.
  if (isPayAtVisit && !paymentCollected && booking.user_id) {
    // No guest account (agent name-only booking) — nothing to record a
    // reliability incident against, so this is simply skipped.
    await reportUnpaidPayAtVisit({
      businessId: booking.business_id, userId: booking.user_id, bookingId: id, amount: booking.price_charged,
    });
  } else if (isPayAtVisit) {
    await accruePayAtVisitCommission(booking.business_id, booking.business_commission, { bookingId: id });
  }

  // Agent bookings (Section 12 / [PHASE 2]): if an agent made this booking
  // on a guest's behalf (routes/agents.js), completion is what releases
  // their commission — same "accrue on completion" shape as Pay at Visit
  // dues above, just into agent_commissions instead of
  // pay_at_visit_commission_owed.
  const agentBookingResult = await query(
    `SELECT id, agent_id, commission_amount FROM agent_bookings WHERE resulting_booking_id = $1`,
    [id]
  );
  if (agentBookingResult.rows.length) {
    const agentBooking = agentBookingResult.rows[0];
    await query(
      `INSERT INTO agent_commissions (agent_id, agent_booking_id, amount, schedule_date, status)
       VALUES ($1, $2, $3, CURRENT_DATE, 'held_in_escrow')`,
      [agentBooking.agent_id, agentBooking.id, agentBooking.commission_amount]
    );
    await query(`UPDATE agent_bookings SET status = 'completed' WHERE id = $1`, [agentBooking.id]);
  }

  // No loyalty credit for a transaction the guest never actually paid for,
  // or one with no guest account to credit (agent name-only booking).
  if (paymentCollected && booking.user_id) {
    await awardLoyaltyCreditForCompletion(booking.user_id, booking.price_charged);
  }

  res.json({ booking: result.rows[0], message: 'Marked fulfilled — eligible for the next payout run.' });
});

/**
 * PATCH /api/bookings/:id/cancel
 * Section 7.1: no-penalty rule for operator-fault cancellations (full refund,
 * no fee) vs. the standard refund fee (fixed 5% platform + business's own
 * configurable rate, shown to the customer as one combined total) for a
 * tourist-initiated cancellation. body: { cancelled_by: 'user' | 'business' }
 */
router.patch('/:id/cancel', authenticate, async (req, res) => {
  const { id } = req.params;

  const bookingResult = await query(
    `SELECT b.*, biz.refund_fee_business_percent, biz.id AS business_id, biz.owner_user_id
     FROM bookings b
     JOIN listings l ON l.id = b.listing_id
     JOIN businesses biz ON biz.id = l.business_id
     WHERE b.id = $1`,
    [id]
  );
  if (!bookingResult.rows.length) {
    return res.status(404).json({ error: 'Booking not found.' });
  }
  const booking = bookingResult.rows[0];

  // Ownership check — previously missing entirely, meaning any logged-in
  // account that knew a booking id could cancel it, and could pick its own
  // refund treatment via the (client-supplied, now removed) cancelled_by
  // field. cancelled_by is derived from who's actually calling instead:
  // the booking's own tourist, or the business that owns the listing.
  const isOwnBooking = booking.user_id === req.user.id;
  const isBusinessOwner = booking.owner_user_id === req.user.id;
  if (!isOwnBooking && !isBusinessOwner) {
    return res.status(403).json({ error: 'You cannot cancel this booking.' });
  }

  if (booking.status === 'cancelled') {
    return res.status(400).json({ error: 'Booking is already cancelled.' });
  }

  // Section 7.1: operator-fault cancellation = full refund, no fee at all.
  const isOperatorFault = isBusinessOwner;
  const { grossRefundAmount, refundAppFee, refundBusinessCredit, refundAmount } = computeRefund({
    priceCharged: booking.price_charged,
    paymentMethod: booking.payment_method,
    refundFeeBusinessPercent: booking.refund_fee_business_percent,
    isOperatorFault,
  });

  await query(
    `UPDATE bookings SET
       status = 'cancelled', escrow_status = 'refunded',
       cancellation_status = $1, refund_fee_applicable = $2,
       gross_refund_amount = $3, refund_app_fee = $4,
       refund_business_credit = $5, refund_amount = $6, updated_at = now()
     WHERE id = $7`,
    [
      isOperatorFault ? 'operator_fault' : 'user_cancelled',
      !isOperatorFault, grossRefundAmount, refundAppFee, refundBusinessCredit, refundAmount, id,
    ]
  );

  // document_access_grants (Batch 19) — a cancelled booking is no longer
  // "an active booking", so any ID-viewing access checkin.js granted the
  // guesthouse for it ends here too.
  await query(
    `UPDATE document_access_grants SET revoked_at = now() WHERE booking_id = $1 AND revoked_at IS NULL`,
    [id]
  );

  // Refund the actual charge via Stripe.
  if (booking.stripe_payment_intent_id) {
    await stripe.refunds.create({
      payment_intent: booking.stripe_payment_intent_id,
      amount: Math.round(refundAmount * 100),
    });
  }

  await notify({
    recipientType: 'user',
    recipientId: booking.user_id,
    type: 'cancellation',
    title: 'Booking cancelled',
    body: isOperatorFault
      ? `Your booking was cancelled by the business — you've been refunded in full, no fee.`
      : `Your booking was cancelled. You'll receive $${refundAmount} back.`,
  });

  // Waitlist (Phase 2): this cancellation just freed up listing_id +
  // slot_start — notify everyone still 'waiting' on that exact slot. The
  // slot itself isn't reserved for them; they still book normally, this
  // just tells them it's open again.
  const waitlisted = await query(
    `SELECT id, user_id FROM waitlist
     WHERE listing_id = $1 AND requested_slot = $2 AND status = 'waiting'`,
    [booking.listing_id, booking.slot_start]
  );
  for (const entry of waitlisted.rows) {
    await query(`UPDATE waitlist SET status = 'notified' WHERE id = $1`, [entry.id]);
    await notify({
      recipientType: 'user',
      recipientId: entry.user_id,
      type: 'waitlist_spot_open',
      title: 'A spot just opened up',
      body: `A slot you were waitlisted for is available again — book it before it's gone.`,
    });
  }

  res.json({
    status: 'cancelled',
    refund_breakdown: { gross: grossRefundAmount, app_fee: refundAppFee, business_fee: refundBusinessCredit, net_refund: refundAmount },
  });
});

export default router;