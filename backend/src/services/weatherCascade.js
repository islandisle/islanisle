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

export async function triggerWeatherCascade(atoll, dateStr) {
  const affected = await query(
    `SELECT b.id, b.user_id, b.price_charged, b.payment_method, b.stripe_payment_intent_id,
            biz.refund_fee_business_percent, biz.name AS business_name, l.title
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
      await stripe.refunds.create({
        payment_intent: booking.stripe_payment_intent_id,
        amount: Math.round(refundAmount * 100),
      });
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
  }

  return affected.rows.length;
}
