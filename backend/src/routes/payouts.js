// Payout run — script Section 7.2.
//
// Aggregates every 'released' (fulfilled, not-yet-paid-out) booking/order per
// business into a single Payout, deducting the 1% business commission and
// adding back any refund fee credits earned, per the unified commission rule
// in Section 9.
//
// Intended to run on a schedule (daily/weekly per business preference —
// Section 4.8). For now this is a manually-triggered admin endpoint; wiring
// it to an actual cron scheduler is a deployment-time decision (Render Cron
// Jobs, or a simple node-cron process) not built here.

import { Router } from 'express';
import { query, pool } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { notify } from '../services/notifications.js';

const router = Router();

/**
 * POST /api/payouts/run
 * Admin-only for now (see file header re: scheduling). Runs a payout batch
 * for every business with at least one released, not-yet-paid-out booking/order.
 */
router.post('/run', authenticate, requireRole('admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    // Businesses with something eligible to pay out.
    const eligibleBusinesses = await client.query(`
      SELECT DISTINCT l.business_id AS id FROM bookings b
      JOIN listings l ON l.id = b.listing_id
      WHERE b.escrow_status = 'released'
        AND b.id NOT IN (SELECT booking_id FROM payout_line_items WHERE booking_id IS NOT NULL)
      UNION
      SELECT DISTINCT o.business_id AS id FROM orders o
      WHERE o.escrow_status = 'released'
        AND o.id NOT IN (SELECT order_id FROM payout_line_items WHERE order_id IS NOT NULL)
    `);

    const results = [];

    for (const { id: businessId } of eligibleBusinesses.rows) {
      await client.query('BEGIN');

      const eligibleBookings = await client.query(
        `SELECT b.id, b.base_price, b.business_commission FROM bookings b
         JOIN listings l ON l.id = b.listing_id
         WHERE l.business_id = $1 AND b.escrow_status = 'released'
           AND b.id NOT IN (SELECT booking_id FROM payout_line_items WHERE booking_id IS NOT NULL)`,
        [businessId]
      );
      const eligibleOrders = await client.query(
        `SELECT id, base_price, business_commission FROM orders
         WHERE business_id = $1 AND escrow_status = 'released'
           AND id NOT IN (SELECT order_id FROM payout_line_items WHERE order_id IS NOT NULL)`,
        [businessId]
      );

      const items = [...eligibleBookings.rows, ...eligibleOrders.rows];
      if (!items.length) {
        await client.query('ROLLBACK');
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

      const netAmount = round2(grossAmount - commissionDeducted + refundFeeCredits);

      const payoutResult = await client.query(
        `INSERT INTO payouts (business_id, gross_amount, business_commission_deducted, refund_fee_credits, amount, schedule_date, status)
         VALUES ($1,$2,$3,$4,$5, CURRENT_DATE, 'pending')
         RETURNING id, amount`,
        [businessId, grossAmount, commissionDeducted, refundFeeCredits, netAmount]
      );
      const payoutId = payoutResult.rows[0].id;

      for (const b of eligibleBookings.rows) {
        await client.query('INSERT INTO payout_line_items (payout_id, booking_id) VALUES ($1, $2)', [payoutId, b.id]);
      }
      for (const o of eligibleOrders.rows) {
        await client.query('INSERT INTO payout_line_items (payout_id, order_id) VALUES ($1, $2)', [payoutId, o.id]);
      }

      await client.query('COMMIT');

      await notify({
        recipientType: 'business',
        recipientId: businessId,
        type: 'payout',
        title: 'Payout processed',
        body: `A payout of $${netAmount} has been scheduled.`,
      });

      results.push({ business_id: businessId, payout_id: payoutId, amount: netAmount, items: items.length });
    }

    res.json({ payouts_created: results.length, results });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Payout run error:', err);
    res.status(500).json({ error: 'Payout run failed.' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/payouts/mine
 * Business's own payout history — Section 4.8's Payout History feature.
 */
router.get('/mine', authenticate, async (req, res) => {
  const bizResult = await query('SELECT id FROM businesses WHERE owner_user_id = $1', [req.user.id]);
  if (!bizResult.rows.length) {
    return res.status(404).json({ error: 'No business found for this account.' });
  }
  const businessId = bizResult.rows[0].id;

  const result = await query(
    `SELECT id, gross_amount, business_commission_deducted, refund_fee_credits, amount, schedule_date, status
     FROM payouts WHERE business_id = $1 ORDER BY schedule_date DESC`,
    [businessId]
  );
  res.json({ payouts: result.rows });
});

function round2(n) {
  return Math.round(n * 100) / 100;
}

export default router;
