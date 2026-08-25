// Payout run — script Section 7.2.
//
// The actual batch logic (including Pay at Visit commission collection,
// Section 9 / [PHASE 2]) lives in services/payoutRun.js, shared with the
// monthly cron job in jobs/scheduler.js — this route is now just that
// service's manual, admin-triggered on-demand entry point (e.g. to catch
// up after a scheduler outage, or run an extra cycle ad hoc).

import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { runPayoutBatch } from '../services/payoutRun.js';

const router = Router();

/**
 * POST /api/payouts/run
 * Admin-only. Runs a payout batch for every business with at least one
 * released, not-yet-paid-out online booking/order, or outstanding Pay at
 * Visit commission dues.
 */
router.post('/run', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const result = await runPayoutBatch();
    res.json(result);
  } catch (err) {
    console.error('Payout run error:', err);
    res.status(500).json({ error: 'Payout run failed.' });
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
    `SELECT id, gross_amount, business_commission_deducted, pay_at_visit_dues_deducted,
            refund_fee_credits, amount, schedule_date, status
     FROM payouts WHERE business_id = $1 ORDER BY schedule_date DESC`,
    [businessId]
  );
  res.json({ payouts: result.rows });
});

export default router;
