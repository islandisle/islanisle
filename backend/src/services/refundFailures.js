// Batch 36 — records a Stripe refund the database already treated as done
// but the processor rejected. Every refund path (routes/bookings.js's
// cancel, routes/admin.js's dispute resolution, services/weatherCascade.js,
// routes/returns.js) calls this on a caught Stripe error instead of
// swallowing it to console.error, so an admin has a follow-up queue
// (GET /api/admin/refund-failures) and the DB state and the money state
// never disagree without a record.

import { query } from '../config/db.js';

export async function recordRefundFailure({
  bookingId = null,
  orderId = null,
  disputeId = null,
  source,
  amount,
  stripePaymentIntentId = null,
  error,
}) {
  const message = error?.message || (typeof error === 'string' ? error : 'Unknown Stripe error');
  try {
    await query(
      `INSERT INTO refund_failures
         (booking_id, order_id, dispute_id, source, amount, stripe_payment_intent_id, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [bookingId, orderId, disputeId, source, amount, stripePaymentIntentId, message]
    );
  } catch (err) {
    // Last-resort: if even recording the failure fails, at least log loudly
    // — but never let this throw back into the caller and undo a
    // cancellation/resolution that's already committed.
    console.error('recordRefundFailure — could not persist refund failure:', err, { source, bookingId, orderId, amount });
  }
}
