// Pay at Visit non-payment tracking (Batch 23) — not in the original
// spec, built on explicit request. Called from bookings.js's PATCH
// /:id/complete and orders.js's PATCH /:id/status when a business marks a
// Pay at Visit transaction fulfilled with payment_collected: false,
// instead of the normal accruePayAtVisitCommission path (services/
// payAtVisit.js) — there's no revenue to take a 1% commission from, and
// no loyalty credit to award someone who didn't pay.
//
// Assumption, flagged: PAY_AT_VISIT_UNPAID_THRESHOLD is an invented
// number (2 — one incident allows for an honest miscommunication before
// it costs the guest their eligibility), not a documented rule. Once
// revoked, nothing in this app automatically restores it — an admin does
// that manually (routes/admin.js's POST /users/:id/restore-pay-at-visit),
// the same "a human decides" pattern as mark-business-trusted.

import { query } from '../config/db.js';
import { notify } from './notifications.js';

const PAY_AT_VISIT_UNPAID_THRESHOLD = 2;

export async function reportUnpaidPayAtVisit({ businessId, userId, bookingId, orderId, amount }) {
  await query(
    `INSERT INTO pay_at_visit_incidents (booking_id, order_id, business_id, user_id, amount)
     VALUES ($1, $2, $3, $4, $5)`,
    [bookingId || null, orderId || null, businessId, userId, amount]
  );

  const result = await query(
    `UPDATE users SET pay_at_visit_unpaid_count = pay_at_visit_unpaid_count + 1
     WHERE id = $1 RETURNING pay_at_visit_unpaid_count, pay_at_visit_eligible`,
    [userId]
  );
  const { pay_at_visit_unpaid_count: unpaidCount, pay_at_visit_eligible: wasEligible } = result.rows[0];

  let revoked = false;
  if (wasEligible && unpaidCount >= PAY_AT_VISIT_UNPAID_THRESHOLD) {
    await query(`UPDATE users SET pay_at_visit_eligible = false WHERE id = $1`, [userId]);
    revoked = true;
  }

  await notify({
    recipientType: 'user',
    recipientId: userId,
    type: 'pay_at_visit_bill',
    title: 'Payment marked uncollected',
    body: revoked
      ? `A business reported that a $${amount} Pay at Visit payment wasn't collected. Your Pay at Visit eligibility has been paused pending review.`
      : `A business reported that a $${amount} Pay at Visit payment wasn't collected. Please make sure to settle up directly with businesses when paying at visit.`,
  });

  return { unpaidCount, revoked };
}
