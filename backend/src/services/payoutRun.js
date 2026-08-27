// Payout run — script Section 7.2. Extracted from routes/payouts.js so the
// monthly cron (jobs/scheduler.js) and the admin-triggered POST /run route
// share one implementation rather than drifting apart.
//
// Aggregates every 'released' online booking/order per business into a
// single Payout, deducting the 1% business commission and adding back any
// refund fee credits earned, per the unified commission rule in Section 9.
// Only payment_method = 'online' items ever contribute to gross_amount —
// a pay_at_visit booking/order never had the platform hold that money, so
// there's nothing to pay the business back out of for it.
//
// Pay at Visit commission collection (Section 9 / [PHASE 2]) is bundled
// into this same run: whatever a business has accrued in
// businesses.pay_at_visit_commission_owed (see services/payAtVisit.js) is
// deducted from its payout here first (payouts.pay_at_visit_dues_deducted
// — the column that already existed for exactly this), before anything is
// paid out. Whatever doesn't fit — no payout this cycle, or the payout was
// smaller than what's owed — stays on pay_at_visit_commission_owed and the
// business is notified directly, i.e. billed, rather than the balance
// silently carrying with no signal.

import { pool } from '../config/db.js';
import { notify } from './notifications.js';

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Not spec-mandated — a reasonable placeholder Pro subscription price for
// Tier 2's bundled bill (Section 9). Tune freely; there's no real payment
// collection wired up for it yet (see bundleTier2SubscriptionBilling's own
// comment) so the number itself doesn't need to be exact right now.
const PRO_MONTHLY_FEE = 10;

// Tier 2 of Pay at Visit collection (Section 9): "whatever owed balance
// remains uncollected by month-end is billed directly, bundled with the
// business's Pro subscription renewal charge... one combined bill."
// Previously this never actually happened — a business with no payout to
// deduct from just got a notification asking it to "settle directly," with
// nothing recorded and the balance sitting on pay_at_visit_commission_owed
// forever. Only called for the actual monthly cycle (isMonthlyBillingRun),
// never an ad-hoc admin-triggered catch-up run, since billing_month is a
// once-a-month concept.
//
// NOT yet implemented (flagged honestly rather than faked): there's no
// real payment collection for this bill — no Stripe subscription/invoice
// charge, consistent with online payment being disabled platform-wide
// (config/payments.js). This records the bill (subscription_billing,
// status 'unpaid') and business.js's listing-cap check treats an unpaid
// past-month bill as a lapsed subscription (Section 7.2's consequence),
// but nothing here actually collects the money — an admin would need to
// mark it paid once settled outside the app, which also isn't built yet.
async function bundleTier2SubscriptionBilling() {
  const billingMonth = new Date();
  billingMonth.setDate(1);
  const billingMonthStr = billingMonth.toISOString().slice(0, 10);

  const owingBusinesses = await pool.query(
    `SELECT id, subscription_tier FROM businesses WHERE pay_at_visit_commission_owed > 0`
  );

  for (const biz of owingBusinesses.rows) {
    const businessRow = await pool.query(
      `SELECT pay_at_visit_commission_owed FROM businesses WHERE id = $1 FOR UPDATE`,
      [biz.id]
    );
    const duesOwed = round2(Number(businessRow.rows[0]?.pay_at_visit_commission_owed || 0));
    if (duesOwed <= 0) continue;

    const subscriptionFee = biz.subscription_tier === 'pro' ? PRO_MONTHLY_FEE : 0;
    const totalCharged = round2(subscriptionFee + duesOwed);

    await pool.query(
      `INSERT INTO subscription_billing (business_id, billing_month, subscription_fee, pay_at_visit_dues, total_charged, status)
       VALUES ($1, $2, $3, $4, $5, 'unpaid')
       ON CONFLICT (business_id, billing_month)
       DO UPDATE SET pay_at_visit_dues = EXCLUDED.pay_at_visit_dues, total_charged = EXCLUDED.total_charged`,
      [biz.id, billingMonthStr, subscriptionFee, duesOwed, totalCharged]
    );
    await pool.query(`UPDATE businesses SET pay_at_visit_commission_owed = 0 WHERE id = $1`, [biz.id]);

    await notify({
      recipientType: 'business',
      recipientId: biz.id,
      type: 'pay_at_visit_bill',
      title: 'Monthly bill ready',
      body: subscriptionFee > 0
        ? `Your monthly bill is $${totalCharged} ($${subscriptionFee} subscription + $${duesOwed} Pay at Visit dues) — paying this keeps your account in good standing.`
        : `Your monthly bill is $${totalCharged} in Pay at Visit dues — paying this keeps your account in good standing.`,
    });
  }
}

export async function runPayoutBatch({ isMonthlyBillingRun = false } = {}) {
  const client = await pool.connect();
  try {
    // Businesses with something eligible to pay out, or Pay at Visit dues
    // to collect even with nothing else to pay out this cycle.
    const eligibleBusinesses = await client.query(`
      SELECT DISTINCT l.business_id AS id FROM bookings b
      JOIN listings l ON l.id = b.listing_id
      WHERE b.payment_method = 'online' AND b.escrow_status = 'released'
        AND b.id NOT IN (SELECT booking_id FROM payout_line_items WHERE booking_id IS NOT NULL)
      UNION
      SELECT DISTINCT o.business_id AS id FROM orders o
      WHERE o.payment_method = 'online' AND o.escrow_status = 'released'
        AND o.id NOT IN (SELECT order_id FROM payout_line_items WHERE order_id IS NOT NULL)
      UNION
      SELECT id FROM businesses WHERE pay_at_visit_commission_owed > 0
    `);

    const results = [];

    for (const { id: businessId } of eligibleBusinesses.rows) {
      await client.query('BEGIN');

      const eligibleBookings = await client.query(
        `SELECT b.id, b.base_price, b.business_commission FROM bookings b
         JOIN listings l ON l.id = b.listing_id
         WHERE l.business_id = $1 AND b.payment_method = 'online' AND b.escrow_status = 'released'
           AND b.id NOT IN (SELECT booking_id FROM payout_line_items WHERE booking_id IS NOT NULL)`,
        [businessId]
      );
      const eligibleOrders = await client.query(
        `SELECT id, base_price, business_commission FROM orders
         WHERE business_id = $1 AND payment_method = 'online' AND escrow_status = 'released'
           AND id NOT IN (SELECT order_id FROM payout_line_items WHERE order_id IS NOT NULL)`,
        [businessId]
      );
      const items = [...eligibleBookings.rows, ...eligibleOrders.rows];

      // Locked for the duration of this business's payout so a pay-at-visit
      // completion landing mid-run can't accrue between the read and the
      // write below.
      const businessRow = await client.query(
        `SELECT pay_at_visit_commission_owed FROM businesses WHERE id = $1 FOR UPDATE`,
        [businessId]
      );
      const duesOwed = round2(Number(businessRow.rows[0]?.pay_at_visit_commission_owed || 0));

      if (!items.length) {
        await client.query('ROLLBACK');
        // Nothing to pay out this cycle to deduct dues from — bill directly.
        if (duesOwed > 0) {
          await notify({
            recipientType: 'business',
            recipientId: businessId,
            type: 'pay_at_visit_bill',
            title: 'Pay at Visit commission due',
            body: `You have $${duesOwed} in outstanding Pay at Visit commission, with no payout this cycle to deduct it from — please settle this directly.`,
          });
        }
        continue;
      }

      const grossAmount = round2(items.reduce((sum, i) => sum + Number(i.base_price), 0));
      const commissionDeducted = round2(items.reduce((sum, i) => sum + Number(i.business_commission), 0));

      // Refund fee credits (Section 7.1) not yet settled to this business.
      // Batch 28 fix: the old query filtered on payout_line_items, which a
      // cancelled booking is NEVER added to (only escrow-released ones are),
      // so every run re-summed every historical credit — the business was
      // paid its refund-fee share again on each payout batch. Now each row
      // is stamped with the payout id that settled it (bookings/orders'
      // refund_credit_payout_id, returns' existing deducted_from_payout_id)
      // and filtered out of later runs. Also extended to cover cancelled
      // shop orders and processed returns, which weren't counted at all.
      const creditBookings = await client.query(
        `SELECT b.id, b.refund_business_credit FROM bookings b
         JOIN listings l ON l.id = b.listing_id
         WHERE l.business_id = $1 AND b.status = 'cancelled'
           AND b.refund_business_credit IS NOT NULL AND b.refund_business_credit > 0
           AND b.refund_credit_payout_id IS NULL`,
        [businessId]
      );
      const creditOrders = await client.query(
        `SELECT id, refund_business_credit FROM orders
         WHERE business_id = $1 AND status = 'cancelled'
           AND refund_business_credit IS NOT NULL AND refund_business_credit > 0
           AND refund_credit_payout_id IS NULL`,
        [businessId]
      );
      const creditReturns = await client.query(
        `SELECT r.id, r.refund_business_credit FROM returns r
         JOIN orders o ON o.id = r.order_id
         WHERE o.business_id = $1 AND r.status = 'completed' AND r.type = 'return'
           AND r.refund_business_credit IS NOT NULL AND r.refund_business_credit > 0
           AND r.deducted_from_payout_id IS NULL`,
        [businessId]
      );
      const refundFeeCredits = round2(
        [...creditBookings.rows, ...creditOrders.rows, ...creditReturns.rows]
          .reduce((sum, r) => sum + Number(r.refund_business_credit), 0)
      );

      const availableBeforeDues = round2(grossAmount - commissionDeducted + refundFeeCredits);

      // Pay at Visit dues, deducted from the payout before anything else —
      // whatever doesn't fit stays owed for next cycle (see the bill
      // notification below).
      const duesDeducted = Math.max(0, Math.min(duesOwed, availableBeforeDues));
      const remainingDues = round2(duesOwed - duesDeducted);
      const netAmount = round2(availableBeforeDues - duesDeducted);

      const payoutResult = await client.query(
        `INSERT INTO payouts (business_id, gross_amount, business_commission_deducted, pay_at_visit_dues_deducted, refund_fee_credits, amount, schedule_date, status)
         VALUES ($1,$2,$3,$4,$5,$6, CURRENT_DATE, 'pending')
         RETURNING id, amount`,
        [businessId, grossAmount, commissionDeducted, duesDeducted, refundFeeCredits, netAmount]
      );
      const payoutId = payoutResult.rows[0].id;

      for (const b of eligibleBookings.rows) {
        await client.query('INSERT INTO payout_line_items (payout_id, booking_id) VALUES ($1, $2)', [payoutId, b.id]);
      }
      for (const o of eligibleOrders.rows) {
        await client.query('INSERT INTO payout_line_items (payout_id, order_id) VALUES ($1, $2)', [payoutId, o.id]);
      }

      // Stamp each refund credit with this payout so it's never paid again.
      if (creditBookings.rows.length) {
        await client.query(
          `UPDATE bookings SET refund_credit_payout_id = $1 WHERE id = ANY($2::uuid[])`,
          [payoutId, creditBookings.rows.map((r) => r.id)]
        );
      }
      if (creditOrders.rows.length) {
        await client.query(
          `UPDATE orders SET refund_credit_payout_id = $1 WHERE id = ANY($2::uuid[])`,
          [payoutId, creditOrders.rows.map((r) => r.id)]
        );
      }
      if (creditReturns.rows.length) {
        await client.query(
          `UPDATE returns SET deducted_from_payout_id = $1 WHERE id = ANY($2::uuid[])`,
          [payoutId, creditReturns.rows.map((r) => r.id)]
        );
      }

      if (duesOwed > 0) {
        await client.query(`UPDATE businesses SET pay_at_visit_commission_owed = $1 WHERE id = $2`, [remainingDues, businessId]);
      }

      await client.query('COMMIT');

      await notify({
        recipientType: 'business',
        recipientId: businessId,
        type: 'payout',
        title: 'Payout processed',
        body: duesDeducted > 0
          ? `A payout of $${netAmount} has been scheduled ($${duesDeducted} of your Pay at Visit commission dues was deducted).`
          : `A payout of $${netAmount} has been scheduled.`,
      });

      if (remainingDues > 0) {
        await notify({
          recipientType: 'business',
          recipientId: businessId,
          type: 'pay_at_visit_bill',
          title: 'Pay at Visit commission due',
          body: `This payout didn't fully cover your Pay at Visit commission — $${remainingDues} is still outstanding and will be deducted from your next payout, or billed directly.`,
        });
      }

      results.push({
        business_id: businessId, payout_id: payoutId, amount: netAmount,
        pay_at_visit_dues_deducted: duesDeducted, items: items.length,
      });
    }

    if (isMonthlyBillingRun) {
      await bundleTier2SubscriptionBilling();
    }

    return { payouts_created: results.length, results };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
