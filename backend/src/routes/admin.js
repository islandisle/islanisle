// Super Admin console — script Section 10.
// Separate login from regular users (Section 10.1: "a separate Super Admin
// web app, access restricted to platform staff").

import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';

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
  const token = jwt.sign({ id: admin.id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, admin: { id: admin.id, name: admin.name, role: admin.role } });
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
    `SELECT l.id, l.title AS name, b.type, 'listing' AS item_type, l.created_at
     FROM listings l JOIN businesses b ON b.id = l.business_id WHERE l.approval_status = 'pending'`
  );
  const localVerifications = await query(
    `SELECT id, name, 'local_verification' AS item_type, created_at FROM users
     WHERE type = 'local' AND local_verification_status = 'pending'`
  );

  res.json({
    businesses: businesses.rows,
    listings: listings.rows,
    local_verifications: localVerifications.rows,
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
  };

  if (target_type === 'local_verification') {
    await query(`UPDATE users SET local_verification_status = 'verified' WHERE id = $1`, [target_id]);
  } else if (tableMap[target_type]) {
    const { table, column } = tableMap[target_type];
    await query(`UPDATE ${table} SET ${column} = 'approved' WHERE id = $1`, [target_id]);
  } else {
    return res.status(400).json({ error: 'Invalid target_type.' });
  }

  await logAdminAction(req.user.id, 'approve', target_type === 'local_verification' ? 'business' : target_type, target_id, 'Approved via admin console');
  res.json({ status: 'approved' });
});

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
  };
  const t = tableMap[target_type];
  if (!t) {
    return res.status(400).json({ error: 'Invalid target_type.' });
  }
  await query(`UPDATE ${t.table} SET ${t.column} = 'rejected' WHERE id = $1`, [target_id]);
  await logAdminAction(req.user.id, 'reject', target_type, target_id, reason);
  res.json({ status: 'rejected', reason });
});

/**
 * POST /api/admin/businesses/:id/suspend
 * Section 7.2 / 10.4: existing confirmed bookings are still honored — this
 * only blocks new bookings, it never touches existing booking rows.
 */
router.post('/businesses/:id/suspend', authenticate, requireRole('admin'), async (req, res) => {
  const { reason } = req.body;
  if (!reason) {
    return res.status(400).json({ error: 'A reason is required to suspend an account.' });
  }
  await query(`UPDATE businesses SET account_status = 'suspended' WHERE id = $1`, [req.params.id]);
  await logAdminAction(req.user.id, 'suspend', 'business', req.params.id, reason);
  res.json({ status: 'suspended' });
});

router.post('/businesses/:id/reinstate', authenticate, requireRole('admin'), async (req, res) => {
  await query(`UPDATE businesses SET account_status = 'active' WHERE id = $1`, [req.params.id]);
  await logAdminAction(req.user.id, 'reinstate', 'business', req.params.id, req.body.reason || 'Reinstated');
  res.json({ status: 'active' });
});

/**
 * GET /api/admin/disputes
 * Section 10.3: central queue for disputes and no-show/undelivered reports.
 */
router.get('/disputes', authenticate, requireRole('admin'), async (req, res) => {
  const result = await query(
    `SELECT id, booking_id, order_id, raised_by, reason, description, status, created_at
     FROM disputes WHERE status = 'open' ORDER BY created_at ASC`
  );
  res.json({ disputes: result.rows });
});

/**
 * POST /api/admin/disputes/:id/resolve
 * body: { outcome: 'refund'|'no_action'|'warning'|'suspension', resolution_note }
 */
router.post('/disputes/:id/resolve', authenticate, requireRole('admin'), async (req, res) => {
  const { outcome, resolution_note } = req.body;
  if (!outcome) {
    return res.status(400).json({ error: 'outcome is required.' });
  }

  await query(
    `UPDATE disputes SET status = 'resolved', resolution = $1, resolved_by_admin_id = $2, resolved_at = now()
     WHERE id = $3`,
    [resolution_note || outcome, req.user.id, req.params.id]
  );
  await logAdminAction(req.user.id, 'resolve_dispute', 'dispute', req.params.id, resolution_note || outcome);
  res.json({ status: 'resolved', outcome });
});

export default router;
