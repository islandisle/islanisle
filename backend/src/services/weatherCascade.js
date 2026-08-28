// Weather-cancellation cascade (Batch 19) — the `alerts` table existed
// (schema.sql's own comment even lists 'cascade_affected' as one of its
// intended types) with nothing ever writing to it. Speedboat and excursion
// trips are the ones actually exposed to sea/weather conditions — a
// guesthouse stay or a shop order isn't cancelled by a storm the way a boat
// trip or an outdoor excursion is.
//
// Triggered from routes/weather.js the moment an atoll's cached condition
// for today is first written as 'thundery' — see that file for why this
// only ever fires once per (atoll, date).

import { query } from '../config/db.js';
import { stripe } from '../config/stripe.js';
import { notify } from './notifications.js';
import { computeRefund } from './refunds.js';
import { recordRefundFailure } from './refundFailures.js';

// Batch 22 — the cascade previously only ever cancelled the directly-hit
// speedboat/excursion booking; it never walked the rest of the trip for
// anything that depended on the cancelled transport actually running.
// Only a speedboat cancellation can strand something downstream — an
// excursion cancellation doesn't transport anyone anywhere else, so this
// is only called for those.
//
// Two dependency signals, since there's no explicit "this booking depends
// on that transfer" link in the schema for bookings:
//   - Orders: a DIRECT link already exists — orders.matched_route_id is
//     the exact speedboat listing services/deliveryMatch.js matched a
//     cross-island delivery to (Section 4.5). An exact match, not a guess.
//   - Bookings: no direct link, so this uses the best signal actually
//     available — the same user, at a business on the transport's
//     destination island, starting on or shortly after the transport's
//     own date (a 2-day window: long enough to catch "I was arriving
//     today for tomorrow's excursion," not so long it starts flagging
//     unrelated later-trip plans).
// Flagged, not cancelled — the tourist may still make other arrangements,
// so this only alerts rather than assuming the downstream item is lost.
async function flagDownstreamDependents(transportBooking, destination) {
  if (!destination) return;

  // Batch 37 — routes/weather.js re-runs the cascade on every fresh fetch
  // while conditions stay 'thundery' (roughly every 15 min). The
  // directly-hit bookings above are naturally idempotent (they get
  // cancelled), but downstream items are only *flagged* and stay
  // 'confirmed', so without this guard each run re-inserted a
  // cascade_affected alert and re-sent the push. A cascade_affected alert
  // already on the row means it's been flagged for this event — skip it.
  const affectedOrders = await query(
    `SELECT id, user_id FROM orders
     WHERE matched_route_id = $1 AND status NOT IN ('cancelled', 'completed')
       AND NOT EXISTS (
         SELECT 1 FROM alerts a WHERE a.order_id = orders.id AND a.type = 'cascade_affected'
       )`,
    [transportBooking.listing_id]
  );
  for (const order of affectedOrders.rows) {
    const message = `Your delivery may be delayed — the speedboat it was scheduled on was cancelled due to weather.`;
    await query(`INSERT INTO alerts (order_id, type, message) VALUES ($1, 'cascade_affected', $2)`, [order.id, message]);
    await notify({
      recipientType: 'user', recipientId: order.user_id, type: 'cancellation',
      title: 'Delivery may be delayed — severe weather', body: message,
    });
  }

  const affectedBookings = await query(
    `SELECT b.id, b.user_id, l.title, biz.name AS business_name
     FROM bookings b
     JOIN listings l ON l.id = b.listing_id
     JOIN businesses biz ON biz.id = l.business_id
     WHERE b.user_id = $1 AND b.id != $2 AND b.status = 'confirmed'
       AND LOWER(TRIM(biz.location_island)) = LOWER(TRIM($3))
       AND b.slot_start::date BETWEEN $4::date AND $4::date + INTERVAL '2 days'
       AND NOT EXISTS (
         SELECT 1 FROM alerts a WHERE a.booking_id = b.id AND a.type = 'cascade_affected'
       )`,
    [transportBooking.user_id, transportBooking.id, destination, transportBooking.slot_start]
  );
  for (const booking of affectedBookings.rows) {
    const message = `Your booking for "${booking.title}" at ${booking.business_name} may be affected — a speedboat transfer to ${destination} was cancelled due to weather.`;
    await query(`INSERT INTO alerts (booking_id, type, message) VALUES ($1, 'cascade_affected', $2)`, [booking.id, message]);
    await notify({
      recipientType: 'user', recipientId: booking.user_id, type: 'cancellation',
      title: 'Booking may be affected — severe weather', body: message,
    });
  }
}

export async function triggerWeatherCascade(atoll, dateStr) {
  const affected = await query(
    `SELECT b.id, b.user_id, b.price_charged, b.payment_method, b.stripe_payment_intent_id, b.slot_start,
            biz.refund_fee_business_percent, biz.name AS business_name, l.id AS listing_id, l.title,
            l.type_specific_fields, biz.type AS business_type
     FROM bookings b
     JOIN listings l ON l.id = b.listing_id
     JOIN businesses biz ON biz.id = l.business_id
     WHERE biz.type IN ('speedboat', 'excursion')
       AND LOWER(TRIM(biz.location_island)) = LOWER(TRIM($1))
       AND b.status = 'confirmed'
       AND b.slot_start::date = $2::date`,
    [atoll, dateStr]
  );

  for (const booking of affected.rows) {
    // Weather is nobody's fault, but the tourist shouldn't eat a
    // cancellation fee for a storm — treated the same as an operator-fault
    // cancellation (full refund, no fee) for refund-math purposes.
    const { grossRefundAmount, refundAppFee, refundBusinessCredit, refundAmount } = computeRefund({
      priceCharged: booking.price_charged,
      paymentMethod: booking.payment_method,
      refundFeeBusinessPercent: booking.refund_fee_business_percent,
      isOperatorFault: true,
    });

    await query(
      `UPDATE bookings SET
         status = 'cancelled', escrow_status = 'refunded',
         cancellation_status = 'weather_cascade', refund_fee_applicable = false,
         gross_refund_amount = $1, refund_app_fee = $2,
         refund_business_credit = $3, refund_amount = $4, updated_at = now()
       WHERE id = $5`,
      [grossRefundAmount, refundAppFee, refundBusinessCredit, refundAmount, booking.id]
    );

    if (booking.stripe_payment_intent_id) {
      try {
        await stripe.refunds.create({
          payment_intent: booking.stripe_payment_intent_id,
          amount: Math.round(refundAmount * 100),
        });
      } catch (err) {
        // Booking is already cancelled — record the refund failure for
        // admin follow-up (Batch 36) and keep the cascade going.
        await recordRefundFailure({
          bookingId: booking.id, source: 'weather_cascade', amount: refundAmount,
          stripePaymentIntentId: booking.stripe_payment_intent_id, error: err,
        });
      }
    }

    const message = `Severe weather forced cancellation of "${booking.title}" at ${booking.business_name} — refunded in full ($${refundAmount}).`;

    await query(
      `INSERT INTO alerts (booking_id, type, message) VALUES ($1, 'cascade_affected', $2)`,
      [booking.id, message]
    );

    await notify({
      recipientType: 'user',
      recipientId: booking.user_id,
      type: 'cancellation',
      title: 'Booking cancelled — severe weather',
      body: message,
    });

    if (booking.business_type === 'speedboat') {
      const destination = booking.type_specific_fields?.destination;
      await flagDownstreamDependents(booking, destination);
    }
  }

  return affected.rows.length;
}
