// Payment confirmation via Stripe webhook — script Section 9 / 7.2.
//
// This is the ONLY place a booking flips from 'pending_payment' to
// 'confirmed' with escrow_status 'held'. Never done optimistically at
// booking-creation time (see bookings.js) — the escrow model only makes
// sense if 'held' actually means money has been collected.
//
// IMPORTANT: this route needs the RAW request body (not JSON-parsed) to
// verify Stripe's signature. It must be mounted in index.js BEFORE the
// global express.json() middleware, using express.raw() for this path only.

import { Router } from 'express';
import { query, pool } from '../config/db.js';
import { stripe } from '../config/stripe.js';
import { notify } from '../services/notifications.js';

const router = Router();

router.post('/webhook', async (req, res) => {
  const signature = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const client = await pool.connect();
  try {
    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object;
      const bookingId = intent.metadata?.booking_id;
      if (!bookingId) {
        // Not one of ours (e.g. a different flow using the same Stripe account) — ignore.
        return res.json({ received: true });
      }

      await client.query('BEGIN');

      const bookingResult = await client.query(
        `UPDATE bookings SET status = 'confirmed', escrow_status = 'held', updated_at = now()
         WHERE id = $1 AND stripe_payment_intent_id = $2
         RETURNING id, listing_id, user_id, base_price, tourist_commission, price_charged, payment_method`,
        [bookingId, intent.id]
      );

      if (bookingResult.rows.length) {
        const booking = bookingResult.rows[0];

        // Generate the invoice now that real payment has actually happened
        // (Section 6.3's required content).
        await client.query(
          `INSERT INTO invoices (
             booking_id, business_id, buyer_user_id, service_description, base_price,
             tourist_commission_line, total_charged, payment_method, booking_date, payment_date, status
           ) VALUES (
             $1, (SELECT business_id FROM listings WHERE id = $2), $3,
             (SELECT title FROM listings WHERE id = $2), $4, $5, $6, $7, now(), now(), 'confirmed'
           )`,
          [
            booking.id, booking.listing_id, booking.user_id, booking.base_price,
            booking.tourist_commission, booking.price_charged, booking.payment_method,
          ]
        );

        // Section 6.5: booking confirmation notification.
        await notify({
          recipientType: 'user',
          recipientId: booking.user_id,
          type: 'booking_confirmation',
          title: 'Booking confirmed',
          body: `Your booking is confirmed — total charged $${booking.price_charged}.`,
        });

        const businessRow = await client.query(
          'SELECT business_id FROM listings WHERE id = $1',
          [booking.listing_id]
        );
        if (businessRow.rows.length) {
          await notify({
            recipientType: 'business',
            recipientId: businessRow.rows[0].business_id,
            type: 'new_booking',
            title: 'New booking received',
            body: `A new booking just came in and was paid.`,
          });
        }
      }

      await client.query('COMMIT');
    }

    if (event.type === 'payment_intent.payment_failed') {
      const intent = event.data.object;
      const bookingId = intent.metadata?.booking_id;
      if (bookingId) {
        // Leave status as 'pending_payment' so the user can retry (Section 9's
        // "Payment failure" popup — Try Again or Cancel). A separate cleanup
        // job for stale pending-payment bookings is still needed (not built yet).
        console.log(`Payment failed for booking ${bookingId}: ${intent.last_payment_error?.message}`);
      }
    }

    res.json({ received: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Webhook processing error:', err);
    res.status(500).json({ error: 'Webhook processing failed.' });
  } finally {
    client.release();
  }
});

export default router;
