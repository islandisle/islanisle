// Pay at Visit commission accrual — script Section 9 / [PHASE 2]. A
// pay_at_visit booking/order never has real money flow through the
// platform (the customer pays the business directly), so the business's 1%
// commission on it can't be deducted from an escrow balance the way an
// online booking's can — see payoutRun.js's file header for how it's
// actually collected. This is just the accrual side: called once, at the
// moment a pay_at_visit booking/order is marked completed, from both
// bookings.js's PATCH /:id/complete and orders.js's PATCH /:id/status.

import { query } from '../config/db.js';
import { notify } from './notifications.js';

// Pay at Visit eligibility (Section 9 / [PHASE 2]) — users.pay_at_visit_eligible
// is set true the first time a tourist checks in anywhere (checkin.js) or a
// Local's ID is verified (admin.js's approve route), matching the schema's
// own documented rule (see database/schema.sql's comment on the column).
// Neither of those has happened yet for a brand-new account.
//
// The script's own reasoning for the pure-online-payment world is "a
// tourist's very first guesthouse/hotel booking is therefore always paid
// online, since there's no prior check-in yet to establish eligibility" —
// eligibility unlocks starting with whatever they book *next*. With online
// payment switched off platform-wide (config/payments.js), there is no
// "paid online instead" fallback for that first booking — so this
// translates the same idea directly: a user's very first-ever booking or
// order (across both tables) is exempted from the gate and always allowed,
// and every one after that is gated normally. Without this exemption, a
// brand-new tourist or a Local still awaiting verification would have no
// way to ever make a first booking at all.
export async function isPayAtVisitEligible(userId, payAtVisitEligible) {
  if (payAtVisitEligible) return true;
  const result = await query(
    `SELECT
       (SELECT COUNT(*) FROM bookings WHERE user_id = $1) +
       (SELECT COUNT(*) FROM orders WHERE user_id = $1) AS total`,
    [userId]
  );
  return Number(result.rows[0].total) === 0;
}

// Not spec-mandated — a reasonable Phase 2 default for how many completed
// Pay at Visit transactions it takes for a 'new' business to prove itself
// and graduate to full trust (online payments unlocked, Pay at Visit
// becomes optional rather than forced). Tune freely.
const GRADUATION_THRESHOLD = 10;

export async function accruePayAtVisitCommission(businessId, commissionAmount) {
  const amount = Math.round((Number(commissionAmount) || 0) * 100) / 100;
  if (amount <= 0) return;

  const result = await query(
    `UPDATE businesses SET
       pay_at_visit_commission_owed = pay_at_visit_commission_owed + $1,
       successful_pay_at_visit_count = successful_pay_at_visit_count + 1
     WHERE id = $2
     RETURNING trust_tier, successful_pay_at_visit_count`,
    [amount, businessId]
  );
  if (!result.rows.length) return;

  const { trust_tier, successful_pay_at_visit_count } = result.rows[0];
  if (trust_tier === 'new' && successful_pay_at_visit_count >= GRADUATION_THRESHOLD) {
    await query(`UPDATE businesses SET trust_tier = 'graduated' WHERE id = $1`, [businessId]);
    await notify({
      recipientType: 'business',
      recipientId: businessId,
      type: 'trust_tier_graduated',
      title: "You've graduated!",
      body: 'Your account is now trusted — online (Stripe) payments are available for your listings, and Pay at Visit is now optional rather than required.',
    });
  }
}
