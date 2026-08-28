// Returns / exchanges — script Section 9 / [PHASE 2]. The `returns` table
// existed in schema.sql with no route. Refund math reuses bookings.js's
// cancellation rule exactly: fixed platform 5% + the business's own
// configurable refund_fee_business_percent, shown to the customer as one
// combined total — see bookings.js's PATCH /:id/cancel for the original.
//
// Not built here (flagged honestly, in scope for a later pass): actually
// deducting a processed return's refund_business_credit from the
// business's next payout — returns.deducted_from_payout_id exists for
// this but payoutRun.js isn't touched, per this batch's "don't touch
// escrow core logic" scope. The credit is computed and stored on the
// return row now, ready for that to pick up later.

import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { stripe } from '../config/stripe.js';
import { notify } from '../services/notifications.js';
import { recordRefundFailure } from '../services/refundFailures.js';

const router = Router();

// How long after an order is marked completed a buyer can still request a
// return/exchange on it. Not spec-mandated — a reasonable e-commerce
// default. orders has no separate "delivered_at" column, so this reads
// updated_at, which reflects the completed transition as long as nothing
// else has touched the order since (true for the normal flow).
const RETURN_WINDOW_DAYS = 14;

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * POST /api/returns
 * body: { order_id, type: 'return'|'exchange', reason }
 */
router.post('/', authenticate, async (req, res) => {
  const { order_id, type, reason } = req.body;
  if (!order_id || !type || !reason) {
    return res.status(400).json({ error: 'order_id, type, and reason are required.' });
  }
  if (!['return', 'exchange'].includes(type)) {
    return res.status(400).json({ error: "type must be 'return' or 'exchange'." });
  }

  const orderResult = await query(
    `SELECT id, user_id, status, updated_at FROM orders WHERE id = $1`,
    [order_id]
  );
  if (!orderResult.rows.length || orderResult.rows[0].user_id !== req.user.id) {
    return res.status(404).json({ error: 'Order not found for this account.' });
  }
  const order = orderResult.rows[0];
  if (order.status !== 'completed') {
    return res.status(400).json({ error: 'Only a completed (delivered) order can be returned or exchanged.' });
  }
  const daysSinceCompleted = (Date.now() - new Date(order.updated_at).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceCompleted > RETURN_WINDOW_DAYS) {
    return res.status(400).json({ error: `The return window (${RETURN_WINDOW_DAYS} days) for this order has passed.` });
  }

  const existing = await query(
    `SELECT id FROM returns WHERE order_id = $1 AND status IN ('requested', 'approved')`,
    [order_id]
  );
  if (existing.rows.length) {
    return res.status(409).json({ error: 'A return/exchange is already in progress for this order.' });
  }

  const result = await query(
    `INSERT INTO returns (order_id, user_id, reason, type, status)
     VALUES ($1, $2, $3, $4, 'requested')
     RETURNING id, order_id, type, status, created_at`,
    [order_id, req.user.id, reason, type]
  );

  res.status(201).json({
    return: result.rows[0],
    message: "We've sent your request to the business — you'll hear back once they review it.",
  });
});

/**
 * GET /api/returns/mine
 */
router.get('/mine', authenticate, async (req, res) => {
  const result = await query(
    `SELECT r.id, r.order_id, r.type, r.reason, r.status, r.refund_amount, r.created_at, biz.name AS business_name
     FROM returns r
     JOIN orders o ON o.id = r.order_id
     JOIN businesses biz ON biz.id = o.business_id
     WHERE r.user_id = $1
     ORDER BY r.created_at DESC`,
    [req.user.id]
  );
  res.json({ returns: result.rows });
});

/**
 * GET /api/returns/business/:businessId
 * Owner-only queue of returns/exchanges on this business's orders.
 */
router.get('/business/:businessId', authenticate, async (req, res) => {
  const ownerCheck = await query(
    'SELECT id FROM businesses WHERE id = $1 AND owner_user_id = $2',
    [req.params.businessId, req.user.id]
  );
  if (!ownerCheck.rows.length) {
    return res.status(404).json({ error: 'Business not found for this account.' });
  }

  const result = await query(
    `SELECT r.id, r.order_id, r.type, r.reason, r.status, r.refund_amount, r.created_at, u.name AS customer_name
     FROM returns r
     JOIN orders o ON o.id = r.order_id
     JOIN users u ON u.id = r.user_id
     WHERE o.business_id = $1
     ORDER BY r.created_at DESC`,
    [req.params.businessId]
  );
  res.json({ returns: result.rows });
});

// Shared ownership check for the three business actions below.
async function loadOwnedReturn(returnId, ownerUserId) {
  const result = await query(
    `SELECT r.*, o.price_charged, o.payment_method, o.stripe_payment_intent_id, biz.owner_user_id, biz.refund_fee_business_percent
     FROM returns r
     JOIN orders o ON o.id = r.order_id
     JOIN businesses biz ON biz.id = o.business_id
     WHERE r.id = $1`,
    [returnId]
  );
  if (!result.rows.length || result.rows[0].owner_user_id !== ownerUserId) return null;
  return result.rows[0];
}

/**
 * POST /api/returns/:id/approve
 * Business accepts the request — doesn't move any money yet, that's /process.
 */
router.post('/:id/approve', authenticate, async (req, res) => {
  const ret = await loadOwnedReturn(req.params.id, req.user.id);
  if (!ret) {
    return res.status(404).json({ error: 'Return not found for a business you own.' });
  }
  if (ret.status !== 'requested') {
    return res.status(400).json({ error: `Cannot approve a ${ret.status} return.` });
  }

  const result = await query(
    `UPDATE returns SET status = 'approved' WHERE id = $1 RETURNING id, status`,
    [req.params.id]
  );
  await notify({
    recipientType: 'user',
    recipientId: ret.user_id,
    type: 'return_update',
    title: `${ret.type === 'exchange' ? 'Exchange' : 'Return'} approved`,
    body: `Your ${ret.type} request was approved by the business.`,
  });
  res.json({ return: result.rows[0] });
});

/**
 * POST /api/returns/:id/reject
 * body: { reason }
 */
router.post('/:id/reject', authenticate, async (req, res) => {
  const { reason } = req.body;
  if (!reason) {
    return res.status(400).json({ error: 'A reason is required when rejecting.' });
  }
  const ret = await loadOwnedReturn(req.params.id, req.user.id);
  if (!ret) {
    return res.status(404).json({ error: 'Return not found for a business you own.' });
  }
  if (ret.status !== 'requested') {
    return res.status(400).json({ error: `Cannot reject a ${ret.status} return.` });
  }

  const result = await query(
    `UPDATE returns SET status = 'declined' WHERE id = $1 RETURNING id, status`,
    [req.params.id]
  );
  await notify({
    recipientType: 'user',
    recipientId: ret.user_id,
    type: 'return_update',
    title: `${ret.type === 'exchange' ? 'Exchange' : 'Return'} declined`,
    body: `Your ${ret.type} request was declined: ${reason}`,
  });
  res.json({ return: result.rows[0] });
});

/**
 * POST /api/returns/:id/process
 * Business confirms the item's been received back (return) or the swap's
 * done (exchange) — this is where a 'return' actually gets refunded, using
 * the same fee split as bookings.js's cancellation.
 */
router.post('/:id/process', authenticate, async (req, res) => {
  const ret = await loadOwnedReturn(req.params.id, req.user.id);
  if (!ret) {
    return res.status(404).json({ error: 'Return not found for a business you own.' });
  }
  if (ret.status !== 'approved') {
    return res.status(400).json({ error: 'Only an approved return/exchange can be processed.' });
  }

  let refundFields = {};
  let refundAmount = 0;
  if (ret.type === 'return') {
    const grossRefundAmount = Number(ret.price_charged);
    const refundAppFee = round2(grossRefundAmount * 0.05); // fixed platform 5%, same as bookings.js
    const refundBusinessCredit = round2(grossRefundAmount * (ret.refund_fee_business_percent / 100));
    refundAmount = round2(grossRefundAmount - refundAppFee - refundBusinessCredit);

    if (ret.payment_method === 'online' && ret.stripe_payment_intent_id) {
      try {
        await stripe.refunds.create({
          payment_intent: ret.stripe_payment_intent_id,
          amount: Math.round(refundAmount * 100),
        });
      } catch (err) {
        await recordRefundFailure({
          orderId: ret.order_id, source: 'return', amount: refundAmount,
          stripePaymentIntentId: ret.stripe_payment_intent_id, error: err,
        });
      }
    }

    refundFields = {
      refund_fee_applicable: true,
      gross_refund_amount: grossRefundAmount,
      refund_app_fee: refundAppFee,
      refund_business_credit: refundBusinessCredit,
      refund_amount: refundAmount,
    };
  }

  const result = await query(
    `UPDATE returns SET
       status = 'completed',
       refund_fee_applicable = COALESCE($1, refund_fee_applicable),
       gross_refund_amount = $2, refund_app_fee = $3,
       refund_business_credit = $4, refund_amount = $5
     WHERE id = $6
     RETURNING id, status, refund_amount`,
    [
      refundFields.refund_fee_applicable ?? null,
      refundFields.gross_refund_amount ?? null,
      refundFields.refund_app_fee ?? null,
      refundFields.refund_business_credit ?? null,
      refundFields.refund_amount ?? null,
      req.params.id,
    ]
  );

  await notify({
    recipientType: 'user',
    recipientId: ret.user_id,
    type: 'return_update',
    title: `${ret.type === 'exchange' ? 'Exchange' : 'Return'} completed`,
    body: ret.type === 'return'
      ? `Your return is complete — you'll receive $${refundAmount} back.`
      : `Your exchange is complete.`,
  });

  res.json({ return: result.rows[0] });
});

export default router;
