// Booking engine — script Section 9.
//
// Implements: the document-upload gate, dual pricing (tourist/local rate
// selection), and the unified commission rule (business always pays 1%,
// tourist additionally pays 2% when paying online).
//
// NOT yet implemented (flagged honestly rather than faked):
//   - Real timed slot-holds. This does a simple "no exact duplicate booking"
//     check, but the script's "held for a few minutes while paying, then
//     auto-releases" behavior needs a scheduled job or a TTL store (Redis),
//     which isn't part of this stack yet. Fine for early testing, not for
//     real concurrent traffic.
//   - Actual payment processing. price_charged is calculated correctly but
//     no payment gateway is wired in — see README.

import { Router } from 'express';
import { query, pool } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireDocumentOnFile } from '../middleware/documentGate.js';
import { stripe } from '../config/stripe.js';
import { notify } from '../services/notifications.js';

const router = Router();

const BUSINESS_COMMISSION_RATE = 0.01; // 1%, always applies (Section 9)
const TOURIST_COMMISSION_RATE = 0.02;  // 2%, only when payer is Tourist paying online

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
    const { listing_id, slot_start, slot_end } = req.body;
    if (!listing_id || !slot_start) {
      return res.status(400).json({ error: 'listing_id and slot_start are required.' });
    }

    const userResult = await query('SELECT type FROM users WHERE id = $1', [req.user.id]);
    if (!userResult.rows.length) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const payerType = userResult.rows[0].type; // 'tourist' | 'local'

    const listingResult = await query(
      'SELECT tourist_price, local_price, approval_status FROM listings WHERE id = $1',
      [listing_id]
    );
    if (!listingResult.rows.length) {
      return res.status(404).json({ error: 'Listing not found.' });
    }
    const listing = listingResult.rows[0];
    if (listing.approval_status !== 'approved') {
      return res.status(400).json({ error: 'This listing is not currently bookable.' });
    }

    // Dual pricing (Section 3.4): tourist sees tourist_price, local sees local_price.
    const basePrice = payerType === 'tourist' ? listing.tourist_price : listing.local_price;

    // Simplified conflict check — see README re: real timed slot-holds.
    // Only checks against already-confirmed bookings; a still-pending-payment
    // booking on the same slot does NOT block others yet (see README's known
    // simplification — a proper hold needs a TTL/expiry mechanism).
    const conflict = await query(
      `SELECT id FROM bookings WHERE listing_id = $1 AND slot_start = $2 AND status = 'confirmed'`,
      [listing_id, slot_start]
    );
    if (conflict.rows.length) {
      return res.status(409).json({ error: 'That slot was just taken. Please pick another.' });
    }

    // Unified commission rule (Section 9): business always 1%; tourist +2% online only.
    const businessCommission = round2(basePrice * BUSINESS_COMMISSION_RATE);
    const touristCommissionApplicable = payerType === 'tourist';
    const touristCommission = touristCommissionApplicable ? round2(basePrice * TOURIST_COMMISSION_RATE) : 0;
    const priceCharged = round2(basePrice + touristCommission);

    await client.query('BEGIN');

    const bookingResult = await client.query(
      `INSERT INTO bookings (
         listing_id, user_id, slot_start, slot_end, base_price, payer_type, payment_method,
         business_commission, tourist_commission_applicable, tourist_commission, price_charged,
         status, escrow_status
       ) VALUES ($1,$2,$3,$4,$5,$6,'online',$7,$8,$9,$10,'pending_payment','not_applicable')
       RETURNING id, base_price, price_charged, status, escrow_status`,
      [
        listing_id, req.user.id, slot_start, slot_end || null, basePrice, payerType,
        businessCommission, touristCommissionApplicable, touristCommission, priceCharged,
      ]
    );
    const booking = bookingResult.rows[0];

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
        total_charged: priceCharged,
      },
      client_secret: paymentIntent.client_secret,
      message: 'Booking created — confirm payment on the client to finalize it.',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Booking creation error:', err);
    res.status(500).json({ error: 'Could not create booking.' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/bookings/mine
 */
router.get('/mine', authenticate, async (req, res) => {
  const result = await query(
    `SELECT b.id, b.slot_start, b.status, b.price_charged, l.title, biz.name AS business_name
     FROM bookings b
     JOIN listings l ON l.id = b.listing_id
     JOIN businesses biz ON biz.id = l.business_id
     WHERE b.user_id = $1
     ORDER BY b.slot_start DESC`,
    [req.user.id]
  );
  res.json({ bookings: result.rows });
});

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * PATCH /api/bookings/:id/complete
 * Business marks a confirmed booking as fulfilled (guest checked in, table
 * seated, excursion run, etc.) — Section 7.2: this is what makes the booking
 * eligible for the next payout run. Business-only, and only on their own listings.
 */
router.patch('/:id/complete', authenticate, async (req, res) => {
  const { id } = req.params;

  const ownerCheck = await query(
    `SELECT b.id FROM bookings b
     JOIN listings l ON l.id = b.listing_id
     JOIN businesses biz ON biz.id = l.business_id
     WHERE b.id = $1 AND biz.owner_user_id = $2 AND b.status = 'confirmed'`,
    [id, req.user.id]
  );
  if (!ownerCheck.rows.length) {
    return res.status(404).json({ error: 'Confirmed booking not found for a business you own.' });
  }

  const result = await query(
    `UPDATE bookings SET status = 'completed', escrow_status = 'released', updated_at = now()
     WHERE id = $1 RETURNING id, status, escrow_status`,
    [id]
  );

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
  const { cancelled_by } = req.body; // 'user' | 'business'

  const bookingResult = await query(
    `SELECT b.*, biz.refund_fee_business_percent, biz.id AS business_id
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

  if (booking.status === 'cancelled') {
    return res.status(400).json({ error: 'Booking is already cancelled.' });
  }

  // Section 7.1: operator-fault cancellation = full refund, no fee at all.
  const isOperatorFault = cancelled_by === 'business';
  const grossRefundAmount = booking.price_charged; // Phase 1: full policy amount; partial-window % is a later refinement

  let refundAppFee = 0;
  let refundBusinessCredit = 0;
  let refundAmount = grossRefundAmount;

  if (!isOperatorFault && booking.payment_method === 'online') {
    refundAppFee = round2(grossRefundAmount * 0.05); // fixed platform 5%
    refundBusinessCredit = round2(grossRefundAmount * (booking.refund_fee_business_percent / 100));
    refundAmount = round2(grossRefundAmount - refundAppFee - refundBusinessCredit);
  }

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

  res.json({
    status: 'cancelled',
    refund_breakdown: { gross: grossRefundAmount, app_fee: refundAppFee, business_fee: refundBusinessCredit, net_refund: refundAmount },
  });
});

export default router;
