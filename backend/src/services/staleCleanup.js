// Stale pending_payment cleanup — a booking/order that never gets its
// Stripe payment confirmed (abandoned checkout, failed card, browser
// closed) is left in 'pending_payment' forever with nothing to expire it.
// Run periodically from jobs/scheduler.js.
//
// Since Batch 13's slot-hold, a pending_payment booking DOES count against
// capacity — but only for as long as PENDING_PAYMENT_TIMEOUT_MINUTES, the
// same window this job uses to expire it (bookings.js's capacity check is
// bounded by that interval, so a hold self-releases even between runs).
// This job is the tidy-up that flips the row to 'cancelled' once the hold
// has lapsed; the slot was already effectively free. Orders are the more
// urgent case: stock_count is decremented immediately at order creation
// (see orders.js), before payment ever confirms, so an abandoned order
// really is holding real stock hostage until it's expired here and that
// stock is given back.
//
// Not handled here (a known, narrow gap, not silently ignored): an expired
// order/booking that had a promo code applied leaves that code's
// times_used claimed rather than releasing it back — out of scope for this
// pass, which is specifically about payments/payouts.

import { pool } from '../config/db.js';

// How long a booking/order can sit unpaid before it's considered
// abandoned. Not spec-mandated — long enough that a slow checkout or a
// brief Stripe hiccup doesn't get caught, short enough that stock/slots
// don't stay wrongly held for long. Tune freely.
export const PENDING_PAYMENT_TIMEOUT_MINUTES = 60;

export async function expireStalePendingPayments() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const staleBookings = await client.query(
      `UPDATE bookings SET status = 'cancelled', cancellation_status = 'expired', updated_at = now()
       WHERE status = 'pending_payment'
         AND created_at < now() - make_interval(mins => $1)
       RETURNING id`,
      [PENDING_PAYMENT_TIMEOUT_MINUTES]
    );

    const staleOrderItems = await client.query(
      `SELECT o.id, oi.listing_id, oi.quantity
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE o.status = 'pending_payment'
         AND o.created_at < now() - make_interval(mins => $1)`,
      [PENDING_PAYMENT_TIMEOUT_MINUTES]
    );

    for (const item of staleOrderItems.rows) {
      await client.query(
        `UPDATE listings SET stock_count = stock_count + $1 WHERE id = $2 AND stock_count IS NOT NULL`,
        [item.quantity, item.listing_id]
      );
    }

    const staleOrderIds = [...new Set(staleOrderItems.rows.map((r) => r.id))];
    if (staleOrderIds.length) {
      await client.query(
        `UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = ANY($1::uuid[])`,
        [staleOrderIds]
      );
    }

    await client.query('COMMIT');
    return { bookings_expired: staleBookings.rows.length, orders_expired: staleOrderIds.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
