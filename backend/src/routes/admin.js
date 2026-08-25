// Super Admin console — script Section 10.
// Separate login from regular users (Section 10.1: "a separate Super Admin
// web app, access restricted to platform staff").

import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';
import { authenticate, requireRole, requireFullAdmin } from '../middleware/auth.js';
import { notify } from '../services/notifications.js';
import { computeRefund } from '../services/refunds.js';
import { stripe } from '../config/stripe.js';

const router = Router();

async function logAdminAction(adminId, actionType, targetType, targetId, reason) {
  await query(
    `INSERT INTO audit_log (admin_id, action_type, target_type, target_id, reason)
     VALUES ($1, $2, $3, $4, $5)`,
    [adminId, actionType, targetType, targetId, reason]
  );
}

/**
 * POST /api/admin/login
 * adminRole (admin_users.role: 'admin'|'moderator') is carried as a second
 * JWT claim alongside the generic role: 'admin' every admin token already
 * had — see middleware/auth.js's requireFullAdmin for why both exist.
 */
router.post('/login', async (req, res) => {
  const { contact_email, password } = req.body;
  const result = await query('SELECT * FROM admin_users WHERE contact_email = $1 AND status = $2', [contact_email, 'active']);
  if (!result.rows.length) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }
  const admin = result.rows[0];
  const valid = await bcrypt.compare(password, admin.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }
  const token = jwt.sign({ id: admin.id, role: 'admin', adminRole: admin.role }, process.env.JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, admin: { id: admin.id, name: admin.name, role: admin.role } });
});

/**
 * GET /api/admin/businesses?search=&status=&page=&limit=
 * Directory view — previously the only way to moderate a business was to
 * already know its id (see frontend-admin's old manual-entry box). search
 * matches on name; status matches either approval_status or account_status
 * (their value sets don't overlap, so one param covers both).
 */
router.get('/businesses', authenticate, requireRole('admin'), async (req, res) => {
  const { search, status } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const conditions = [];
  const params = [];
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`b.name ILIKE $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`(b.approval_status::text = $${params.length} OR b.account_status::text = $${params.length})`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rowsResult, countResult] = await Promise.all([
    query(
      `SELECT b.id, b.name, b.type, b.approval_status, b.account_status, b.location_island,
              b.trust_tier, b.created_at, u.name AS owner_name
       FROM businesses b
       JOIN users u ON u.id = b.owner_user_id
       ${where}
       ORDER BY b.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    query(`SELECT COUNT(*)::int AS total FROM businesses b ${where}`, params),
  ]);

  res.json({ businesses: rowsResult.rows, total: countResult.rows[0].total, page, limit });
});

/**
 * GET /api/admin/agents?search=&status=&page=&limit=
 * Agent equivalent of the business directory above — needed so admin has
 * somewhere to actually reach an approved agent's suspend/reinstate action
 * from (the approval queue only ever shows 'pending' ones).
 */
router.get('/agents', authenticate, requireRole('admin'), async (req, res) => {
  const { search, status } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const conditions = [];
  const params = [];
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`a.name ILIKE $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`(a.approval_status::text = $${params.length} OR a.account_status::text = $${params.length})`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rowsResult, countResult] = await Promise.all([
    query(
      `SELECT a.id, a.name, a.contact_email, a.approval_status, a.account_status, a.created_at
       FROM agents a
       ${where}
       ORDER BY a.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    query(`SELECT COUNT(*)::int AS total FROM agents a ${where}`, params),
  ]);

  res.json({ agents: rowsResult.rows, total: countResult.rows[0].total, page, limit });
});

/**
 * GET /api/admin/support-tickets?status=&page=&limit=
 * Admin-side queue. Individual ticket detail/reply/close are shared with
 * the submitter's own routes (see routes/support.js) since an admin
 * responding or closing is the same action a ticket owner can take.
 */
router.get('/support-tickets', authenticate, requireRole('admin'), async (req, res) => {
  const { status } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const conditions = [];
  const params = [];
  if (status) {
    params.push(status);
    conditions.push(`t.status = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rowsResult, countResult] = await Promise.all([
    query(
      `SELECT t.id, t.subject, t.status, t.created_at, t.assigned_admin_id,
              COALESCE(u.name, biz.name) AS submitted_by,
              (t.business_id IS NOT NULL) AS is_business
       FROM support_tickets t
       LEFT JOIN users u ON u.id = t.user_id
       LEFT JOIN businesses biz ON biz.id = t.business_id
       ${where}
       ORDER BY t.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    query(`SELECT COUNT(*)::int AS total FROM support_tickets t ${where}`, params),
  ]);

  res.json({ tickets: rowsResult.rows, total: countResult.rows[0].total, page, limit });
});

/**
 * GET /api/admin/approval-queue
 * Section 10.2: one queue for pending businesses, listings, and (later) agents.
 */
router.get('/approval-queue', authenticate, requireRole('admin'), async (req, res) => {
  const businesses = await query(
    `SELECT id, name, type, 'business' AS item_type, created_at FROM businesses WHERE approval_status = 'pending'`
  );
  const listings = await query(
    `SELECT l.id, l.title AS name, b.type, 'listing' AS item_type, l.created_at, b.id AS business_id
     FROM listings l JOIN businesses b ON b.id = l.business_id WHERE l.approval_status = 'pending'`
  );
  const localVerifications = await query(
    `SELECT id, name, 'local_verification' AS item_type, created_at FROM users
     WHERE type = 'local' AND local_verification_status = 'pending'`
  );
  const agents = await query(
    `SELECT id, name, 'agent' AS item_type, created_at FROM agents WHERE approval_status = 'pending'`
  );

  res.json({
    businesses: businesses.rows,
    listings: listings.rows,
    local_verifications: localVerifications.rows,
    agents: agents.rows,
  });
});

/**
 * POST /api/admin/approve
 * body: { target_type: 'business'|'listing'|'local_verification', target_id, reason? }
 */
router.post('/approve', authenticate, requireRole('admin'), async (req, res) => {
  const { target_type, target_id } = req.body;

  const tableMap = {
    business: { table: 'businesses', column: 'approval_status' },
    listing: { table: 'listings', column: 'approval_status' },
    agent: { table: 'agents', column: 'approval_status' },
  };

  if (target_type === 'local_verification') {
    // Pay at Visit eligibility (Section 9 / [PHASE 2]): a verified Local's
    // ID review is a stronger trust signal than a tourist's simple check-in
    // gate, so verification itself is what unlocks it — see
    // services/payAtVisit.js's isPayAtVisitEligible.
    await query(
      `UPDATE users SET local_verification_status = 'verified', pay_at_visit_eligible = true WHERE id = $1`,
      [target_id]
    );
  } else if (tableMap[target_type]) {
    const { table, column } = tableMap[target_type];
    await query(`UPDATE ${table} SET ${column} = 'approved' WHERE id = $1`, [target_id]);
  } else {
    return res.status(400).json({ error: 'Invalid target_type.' });
  }

  await logAdminAction(req.user.id, 'approve', target_type === 'local_verification' ? 'business' : target_type, target_id, 'Approved via admin console');
  res.json({ status: 'approved' });
});

// Section 10.2: "rejected submitters are notified of the stated reason" —
// previously the reason only ever came back in the HTTP response, so a
// submitter not actively watching that exact request never learned why.
async function notifyRejection(targetType, targetId, reason) {
  if (targetType === 'local_verification') {
    await notify({
      recipientType: 'user', recipientId: targetId,
      type: 'rejected', title: 'ID verification declined', body: reason,
    });
  } else if (targetType === 'business') {
    await notify({
      recipientType: 'business', recipientId: targetId,
      type: 'rejected', title: 'Business application declined', body: reason,
    });
  } else if (targetType === 'listing') {
    const listingResult = await query('SELECT business_id FROM listings WHERE id = $1', [targetId]);
    if (listingResult.rows.length) {
      await notify({
        recipientType: 'business', recipientId: listingResult.rows[0].business_id,
        type: 'rejected', title: 'Listing declined', body: reason,
      });
    }
  } else if (targetType === 'agent') {
    await notify({
      recipientType: 'agent', recipientId: targetId,
      type: 'rejected', title: 'Agent application declined', body: reason,
    });
  }
}

/**
 * POST /api/admin/reject
 * body: { target_type, target_id, reason } — reason is required for rejections
 * so the submitter can fix and resubmit (Section 10.2).
 */
router.post('/reject', authenticate, requireRole('admin'), async (req, res) => {
  const { target_type, target_id, reason } = req.body;
  if (!reason) {
    return res.status(400).json({ error: 'A reason is required when rejecting.' });
  }

  const tableMap = {
    business: { table: 'businesses', column: 'approval_status' },
    listing: { table: 'listings', column: 'approval_status' },
    agent: { table: 'agents', column: 'approval_status' },
  };
  const t = tableMap[target_type];
  if (!t) {
    return res.status(400).json({ error: 'Invalid target_type.' });
  }
  await query(`UPDATE ${t.table} SET ${t.column} = 'rejected' WHERE id = $1`, [target_id]);
  await logAdminAction(req.user.id, 'reject', target_type, target_id, reason);
  await notifyRejection(target_type, target_id, reason);
  res.json({ status: 'rejected', reason });
});

/**
 * POST /api/admin/businesses/:id/suspend
 * Section 7.2 / 10.4: existing confirmed bookings are still honored — this
 * only blocks new bookings, it never touches existing booking rows.
 * Full-Admin-only (Section 10.1's role levels).
 */
router.post('/businesses/:id/suspend', authenticate, requireFullAdmin, async (req, res) => {
  const { reason } = req.body;
  if (!reason) {
    return res.status(400).json({ error: 'A reason is required to suspend an account.' });
  }
  await query(`UPDATE businesses SET account_status = 'suspended' WHERE id = $1`, [req.params.id]);
  await logAdminAction(req.user.id, 'suspend', 'business', req.params.id, reason);
  await notify({ recipientType: 'business', recipientId: req.params.id, type: 'suspended', title: 'Account suspended', body: reason });
  res.json({ status: 'suspended' });
});

router.post('/businesses/:id/reinstate', authenticate, requireFullAdmin, async (req, res) => {
  await query(`UPDATE businesses SET account_status = 'active' WHERE id = $1`, [req.params.id]);
  await logAdminAction(req.user.id, 'reinstate', 'business', req.params.id, req.body.reason || 'Reinstated');
  res.json({ status: 'active' });
});

/**
 * POST /api/admin/agents/:id/suspend
 * POST /api/admin/agents/:id/reinstate
 * Section 5.1: mirrors business suspend/reinstate exactly, on
 * agents.account_status — "already-confirmed guest arrangements and
 * bookings made through the agent are still honored... but the agent
 * cannot arrange new bookings or connect with new businesses until
 * reinstated" (enforcement of that at the agent-route level is a separate,
 * pre-existing piece; this is the admin action that flips the flag).
 */
router.post('/agents/:id/suspend', authenticate, requireFullAdmin, async (req, res) => {
  const { reason } = req.body;
  if (!reason) {
    return res.status(400).json({ error: 'A reason is required to suspend an account.' });
  }
  await query(`UPDATE agents SET account_status = 'suspended' WHERE id = $1`, [req.params.id]);
  await logAdminAction(req.user.id, 'suspend', 'agent', req.params.id, reason);
  await notify({ recipientType: 'agent', recipientId: req.params.id, type: 'suspended', title: 'Account suspended', body: reason });
  res.json({ status: 'suspended' });
});

router.post('/agents/:id/reinstate', authenticate, requireFullAdmin, async (req, res) => {
  await query(`UPDATE agents SET account_status = 'active' WHERE id = $1`, [req.params.id]);
  await logAdminAction(req.user.id, 'reinstate', 'agent', req.params.id, req.body.reason || 'Reinstated');
  res.json({ status: 'active' });
});

/**
 * POST /api/admin/businesses/:id/mark-trusted
 * Section 9's New Business Trust Tier / Section 10.4: a distinct action
 * from suspension or the Google-listing "Verified" badge — manually
 * graduates a business out of 'new' ahead of the automatic
 * Pay-at-Visit-count threshold (services/payAtVisit.js), for cases where
 * admin has other grounds for confidence. Uses the mark_trusted
 * admin_action_type that already existed in the enum with nothing using it.
 */
router.post('/businesses/:id/mark-trusted', authenticate, requireFullAdmin, async (req, res) => {
  const result = await query(`UPDATE businesses SET trust_tier = 'graduated' WHERE id = $1 RETURNING id`, [req.params.id]);
  if (!result.rows.length) {
    return res.status(404).json({ error: 'Business not found.' });
  }
  await logAdminAction(req.user.id, 'mark_trusted', 'business', req.params.id, req.body.reason || 'Marked trusted via admin console');
  await notify({
    recipientType: 'business', recipientId: req.params.id,
    type: 'trust_tier_graduated', title: "You've graduated!",
    body: 'Super Admin has marked your account as trusted — online payments (once re-enabled) are available for your listings, and Pay at Visit is now optional rather than required.',
  });
  res.json({ status: 'graduated' });
});

/**
 * GET /api/admin/disputes
 * Section 10.3: central queue for disputes and no-show/undelivered reports.
 * Full-Admin-only, alongside resolution below (Section 10.1's role split).
 */
router.get('/disputes', authenticate, requireFullAdmin, async (req, res) => {
  const result = await query(
    `SELECT id, booking_id, order_id, raised_by, reason, description, status, created_at
     FROM disputes WHERE status = 'open' ORDER BY created_at ASC`
  );
  res.json({ disputes: result.rows });
});

// Applies a full, no-fee refund to whichever of booking/order this dispute
// is tied to — an admin-adjudicated refund is a corrective action, not the
// standard user-initiated cancellation, so it always uses the
// isOperatorFault:true (no refund-fee) branch of computeRefund regardless
// of who actually raised the dispute. Idempotent: a booking/order already
// cancelled/refunded is left alone.
async function applyDisputeRefund(dispute) {
  if (dispute.booking_id) {
    const bookingResult = await query(
      `SELECT b.price_charged, b.payment_method, b.status, b.user_id, b.stripe_payment_intent_id,
              biz.refund_fee_business_percent
       FROM bookings b JOIN listings l ON l.id = b.listing_id JOIN businesses biz ON biz.id = l.business_id
       WHERE b.id = $1`,
      [dispute.booking_id]
    );
    if (!bookingResult.rows.length || bookingResult.rows[0].status === 'cancelled') return;
    const booking = bookingResult.rows[0];
    const refund = computeRefund({
      priceCharged: booking.price_charged, paymentMethod: booking.payment_method,
      refundFeeBusinessPercent: booking.refund_fee_business_percent, isOperatorFault: true,
    });
    await query(
      `UPDATE bookings SET status = 'cancelled', escrow_status = 'refunded', cancellation_status = 'admin_refund',
         refund_fee_applicable = false, gross_refund_amount = $1, refund_app_fee = $2,
         refund_business_credit = $3, refund_amount = $4, updated_at = now()
       WHERE id = $5`,
      [refund.grossRefundAmount, refund.refundAppFee, refund.refundBusinessCredit, refund.refundAmount, dispute.booking_id]
    );
    if (booking.stripe_payment_intent_id) {
      await stripe.refunds.create({ payment_intent: booking.stripe_payment_intent_id, amount: Math.round(refund.refundAmount * 100) });
    }
    await notify({
      recipientType: 'user', recipientId: booking.user_id, type: 'cancellation',
      title: 'Booking refunded', body: `Your dispute was resolved with a full refund of $${refund.refundAmount}.`,
    });
  } else if (dispute.order_id) {
    const orderResult = await query(
      `SELECT o.price_charged, o.payment_method, o.status, o.user_id, o.stripe_payment_intent_id,
              biz.refund_fee_business_percent
       FROM orders o JOIN businesses biz ON biz.id = o.business_id
       WHERE o.id = $1`,
      [dispute.order_id]
    );
    if (!orderResult.rows.length || orderResult.rows[0].status === 'cancelled') return;
    const order = orderResult.rows[0];
    const refund = computeRefund({
      priceCharged: order.price_charged, paymentMethod: order.payment_method,
      refundFeeBusinessPercent: order.refund_fee_business_percent, isOperatorFault: true,
    });
    await query(
      `UPDATE orders SET status = 'cancelled', escrow_status = 'refunded',
         refund_fee_applicable = false, gross_refund_amount = $1, refund_app_fee = $2,
         refund_business_credit = $3, refund_amount = $4, updated_at = now()
       WHERE id = $5`,
      [refund.grossRefundAmount, refund.refundAppFee, refund.refundBusinessCredit, refund.refundAmount, dispute.order_id]
    );
    if (order.stripe_payment_intent_id) {
      await stripe.refunds.create({ payment_intent: order.stripe_payment_intent_id, amount: Math.round(refund.refundAmount * 100) });
    }
    await notify({
      recipientType: 'user', recipientId: order.user_id, type: 'cancellation',
      title: 'Order refunded', body: `Your dispute was resolved with a full refund of $${refund.refundAmount}.`,
    });
  }
}

// Suspends whichever business owns the booking/order this dispute is tied
// to — reuses the exact same effect as POST /businesses/:id/suspend.
async function applyDisputeSuspension(dispute, adminId, reason) {
  let businessId = null;
  if (dispute.booking_id) {
    const r = await query(
      `SELECT biz.id FROM bookings b JOIN listings l ON l.id = b.listing_id JOIN businesses biz ON biz.id = l.business_id WHERE b.id = $1`,
      [dispute.booking_id]
    );
    businessId = r.rows[0]?.id || null;
  } else if (dispute.order_id) {
    const r = await query('SELECT business_id FROM orders WHERE id = $1', [dispute.order_id]);
    businessId = r.rows[0]?.business_id || null;
  }
  if (!businessId) return;
  await query(`UPDATE businesses SET account_status = 'suspended' WHERE id = $1`, [businessId]);
  await logAdminAction(adminId, 'suspend', 'business', businessId, reason);
  await notify({ recipientType: 'business', recipientId: businessId, type: 'suspended', title: 'Account suspended', body: reason });
}

/**
 * POST /api/admin/disputes/:id/resolve
 * body: { outcome: 'refund'|'no_action'|'warning'|'suspension', resolution_note }
 * 'refund' and 'suspension' now actually perform those actions — previously
 * this only ever recorded the outcome as a label, and admin had to
 * separately go trigger the real refund/suspend elsewhere.
 */
router.post('/disputes/:id/resolve', authenticate, requireFullAdmin, async (req, res) => {
  const { outcome, resolution_note } = req.body;
  if (!outcome) {
    return res.status(400).json({ error: 'outcome is required.' });
  }

  const disputeResult = await query('SELECT booking_id, order_id FROM disputes WHERE id = $1', [req.params.id]);
  if (!disputeResult.rows.length) {
    return res.status(404).json({ error: 'Dispute not found.' });
  }
  const dispute = disputeResult.rows[0];
  const reason = resolution_note || outcome;

  if (outcome === 'refund') {
    await applyDisputeRefund(dispute);
  } else if (outcome === 'suspension') {
    await applyDisputeSuspension(dispute, req.user.id, reason);
  }

  await query(
    `UPDATE disputes SET status = 'resolved', resolution = $1, resolved_by_admin_id = $2, resolved_at = now()
     WHERE id = $3`,
    [reason, req.user.id, req.params.id]
  );
  await logAdminAction(
    req.user.id, outcome === 'refund' ? 'refund_override' : 'resolve_dispute', 'dispute', req.params.id, reason
  );
  res.json({ status: 'resolved', outcome });
});

/**
 * GET /api/admin/audit-log?page=&limit=
 * Section 10.1: "every admin action... is recorded" — was write-only until
 * now, with nothing to actually view it.
 */
router.get('/audit-log', authenticate, requireRole('admin'), async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  const [rowsResult, countResult] = await Promise.all([
    query(
      `SELECT a.id, a.action_type, a.target_type, a.target_id, a.reason, a.created_at, au.name AS admin_name
       FROM audit_log a JOIN admin_users au ON au.id = a.admin_id
       ORDER BY a.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    query('SELECT COUNT(*)::int AS total FROM audit_log'),
  ]);
  res.json({ entries: rowsResult.rows, total: countResult.rows[0].total, page, limit });
});

export default router;
