// Business Settings — script Section 4.8.

import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

async function requireBusinessOwner(req, res, next) {
  const result = await query('SELECT owner_user_id FROM businesses WHERE id = $1', [req.params.businessId]);
  if (!result.rows.length) return res.status(404).json({ error: 'Business not found.' });
  if (result.rows[0].owner_user_id !== req.user.id) return res.status(403).json({ error: 'You do not manage this business.' });
  next();
}

// Same as requireBusinessOwner, but also lets an admin token read through —
// see business.js's copy of this for the full rationale. Only used on GET
// routes (settings, staff), never on the PATCH/POST routes below.
async function requireBusinessOwnerOrAdmin(req, res, next) {
  const result = await query('SELECT owner_user_id FROM businesses WHERE id = $1', [req.params.businessId]);
  if (!result.rows.length) return res.status(404).json({ error: 'Business not found.' });
  if (req.user.role === 'admin') return next();
  if (result.rows[0].owner_user_id !== req.user.id) return res.status(403).json({ error: 'You do not manage this business.' });
  next();
}

/**
 * GET /api/business/:businessId/settings
 * Profile, pricing defaults, payout details, notification prefs, subscription status.
 */
router.get('/:businessId/settings', authenticate, requireBusinessOwnerOrAdmin, async (req, res) => {
  const result = await query(
    `SELECT id, name, type, location_island, contact_info, subscription_tier, subscription_expiry,
            payout_bank_details, refund_fee_business_percent, notification_preferences, account_status
     FROM businesses WHERE id = $1`,
    [req.params.businessId]
  );
  res.json({ business: result.rows[0] });
});

/**
 * PATCH /api/business/:businessId/settings
 * body: any subset of { name, location_island, contact_info, payout_bank_details,
 *                        refund_fee_business_percent, notification_preferences }
 */
router.patch('/:businessId/settings', authenticate, requireBusinessOwner, async (req, res) => {
  const { name, location_island, contact_info, payout_bank_details, refund_fee_business_percent, notification_preferences } = req.body;

  const result = await query(
    `UPDATE businesses SET
       name = COALESCE($1, name),
       location_island = COALESCE($2, location_island),
       contact_info = COALESCE($3, contact_info),
       payout_bank_details = COALESCE($4, payout_bank_details),
       refund_fee_business_percent = COALESCE($5, refund_fee_business_percent),
       notification_preferences = COALESCE($6, notification_preferences),
       updated_at = now()
     WHERE id = $7
     RETURNING id, name, refund_fee_business_percent, notification_preferences`,
    [
      name, location_island,
      contact_info ? JSON.stringify(contact_info) : null,
      payout_bank_details ? JSON.stringify(payout_bank_details) : null,
      refund_fee_business_percent,
      notification_preferences ? JSON.stringify(notification_preferences) : null,
      req.params.businessId,
    ]
  );
  res.json({ business: result.rows[0] });
});

/**
 * POST /api/business/:businessId/staff
 * Section 4.8: staff accounts/logins with limited permissions.
 */
router.post('/:businessId/staff', authenticate, requireBusinessOwner, async (req, res) => {
  const { name, login_email, temp_password, permission_level } = req.body;
  const bcrypt = (await import('bcrypt')).default;
  const passwordHash = await bcrypt.hash(temp_password, 12);

  const result = await query(
    `INSERT INTO staff_accounts (business_id, name, login_email, password_hash, permission_level)
     VALUES ($1,$2,$3,$4,$5) RETURNING id, name, login_email, permission_level, status`,
    [req.params.businessId, name, login_email, passwordHash, permission_level || 'front_desk']
  );
  res.status(201).json({ staff: result.rows[0] });
});

router.post('/:businessId/staff/:staffId/revoke', authenticate, requireBusinessOwner, async (req, res) => {
  await query(`UPDATE staff_accounts SET status = 'revoked' WHERE id = $1 AND business_id = $2`, [req.params.staffId, req.params.businessId]);
  res.json({ status: 'revoked' });
});

/**
 * GET /api/business/:businessId/staff
 * Owner's own staff list, or admin (read-only) from the admin panel —
 * credentials (password_hash) are never returned.
 */
router.get('/:businessId/staff', authenticate, requireBusinessOwnerOrAdmin, async (req, res) => {
  const result = await query(
    `SELECT id, name, login_email, permission_level, status, created_at
     FROM staff_accounts WHERE business_id = $1 ORDER BY created_at DESC`,
    [req.params.businessId]
  );
  res.json({ staff: result.rows });
});

export default router;
