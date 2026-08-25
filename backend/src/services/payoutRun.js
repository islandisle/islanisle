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

export async function runPayoutBatch() {
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

      // Refund fee credits earned since the last payout for this business.
      const refundCreditsResult = await client.query(
        `SELECT COALESCE(SUM(refund_business_credit), 0) AS total FROM bookings b
         JOIN listings l ON l.id = b.listing_id
         WHERE l.business_id = $1 AND b.status = 'cancelled' AND b.refund_business_credit IS NOT NULL
           AND b.id NOT IN (SELECT booking_id FROM payout_line_items WHERE booking_id IS NOT NULL)`,
        [businessId]
      );
      const refundFeeCredits = round2(Number(refundCreditsResult.rows[0].total));

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

    return { payouts_created: results.length, results };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
