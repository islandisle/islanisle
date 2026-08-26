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
            payout_bank_details, refund_fee_business_percent, notification_preferences, account_status,
            pay_at_visit_commission_owed
     FROM businesses WHERE id = $1`,
    [req.params.businessId]
  );
  res.json({ business: result.rows[0] });
});

/**
 * GET /api/business/:businessId/billing-history
 * Section 4.8: "the monthly subscription billing history" — subscription_
 * billing existed with nothing ever reading it back out (or writing to it,
 * before services/payoutRun.js's bundleTier2SubscriptionBilling).
 */
router.get('/:businessId/billing-history', authenticate, requireBusinessOwnerOrAdmin, async (req, res) => {
  const result = await query(
    `SELECT id, billing_month, subscription_fee, pay_at_visit_dues, total_charged, status
     FROM subscription_billing WHERE business_id = $1 ORDER BY billing_month DESC`,
    [req.params.businessId]
  );
  res.json({ billing_history: result.rows });
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

const VALID_DISCOUNT_TYPES = ['percentage', 'fixed'];

/**
 * POST /api/business/:businessId/promo-codes
 * Phase 2 — promo_codes existed in schema.sql with no route. Applied at
 * checkout via services/promoCodes.js (bookings.js / orders.js).
 * body: { code, discount_type: 'percentage'|'fixed', discount, valid_from, valid_to, usage_limit? }
 */
router.post('/:businessId/promo-codes', authenticate, requireBusinessOwner, async (req, res) => {
  const { code, discount_type, discount, valid_from, valid_to, usage_limit } = req.body;

  if (!code || !valid_from || !valid_to || discount == null) {
    return res.status(400).json({ error: 'code, discount, valid_from, and valid_to are required.' });
  }
  if (discount_type && !VALID_DISCOUNT_TYPES.includes(discount_type)) {
    return res.status(400).json({ error: `discount_type must be one of: ${VALID_DISCOUNT_TYPES.join(', ')}` });
  }
  if (new Date(valid_from) >= new Date(valid_to)) {
    return res.status(400).json({ error: 'valid_from must be before valid_to.' });
  }
  const discountNum = Number(discount);
  if (!Number.isFinite(discountNum) || discountNum <= 0) {
    return res.status(400).json({ error: 'discount must be a positive number.' });
  }
  if ((discount_type || 'percentage') === 'percentage' && discountNum > 100) {
    return res.status(400).json({ error: 'A percentage discount cannot exceed 100.' });
  }

  try {
    const result = await query(
      `INSERT INTO promo_codes (business_id, code, discount_type, discount, valid_from, valid_to, usage_limit)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, code, discount_type, discount, valid_from, valid_to, usage_limit, times_used`,
      [
        req.params.businessId, code.trim().toUpperCase(), discount_type || 'percentage',
        discountNum, valid_from, valid_to, usage_limit || null,
      ]
    );
    res.status(201).json({ promo_code: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') { // unique_violation on (business_id, code)
      return res.status(409).json({ error: 'You already have a promo code with that code.' });
    }
    throw err;
  }
});

/**
 * GET /api/business/:businessId/promo-codes
 * Owner's own list, for the Settings management UI.
 */
router.get('/:businessId/promo-codes', authenticate, requireBusinessOwner, async (req, res) => {
  const result = await query(
    `SELECT id, code, discount_type, discount, valid_from, valid_to, usage_limit, times_used
     FROM promo_codes WHERE business_id = $1 ORDER BY valid_to DESC`,
    [req.params.businessId]
  );
  res.json({ promo_codes: result.rows });
});

/**
 * PATCH /api/business/:businessId/promo-codes/:codeId
 * body: any subset of { discount_type, discount, valid_from, valid_to, usage_limit }
 * — also how a business ends a code early: PATCH valid_to to now().
 */
router.patch('/:businessId/promo-codes/:codeId', authenticate, requireBusinessOwner, async (req, res) => {
  const { discount_type, discount, valid_from, valid_to, usage_limit } = req.body;
  if (discount_type && !VALID_DISCOUNT_TYPES.includes(discount_type)) {
    return res.status(400).json({ error: `discount_type must be one of: ${VALID_DISCOUNT_TYPES.join(', ')}` });
  }

  const result = await query(
    `UPDATE promo_codes SET
       discount_type = COALESCE($1, discount_type),
       discount = COALESCE($2, discount),
       valid_from = COALESCE($3, valid_from),
       valid_to = COALESCE($4, valid_to),
       usage_limit = COALESCE($5, usage_limit)
     WHERE id = $6 AND business_id = $7
     RETURNING id, code, discount_type, discount, valid_from, valid_to, usage_limit, times_used`,
    [discount_type, discount, valid_from, valid_to, usage_limit, req.params.codeId, req.params.businessId]
  );
  if (!result.rows.length) {
    return res.status(404).json({ error: 'Promo code not found for this business.' });
  }
  res.json({ promo_code: result.rows[0] });
});

export default router;
