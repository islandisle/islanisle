// Business Settings — script Section 4.8.

import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { loginLimiter } from '../middleware/rateLimit.js';

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
    `SELECT id, name, type, location_island, location_atoll, contact_info, subscription_tier, subscription_expiry,
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
 * GET /api/business/:businessId/pay-at-visit-incidents
 * Batch 23 (not in the original spec) — a business's own history of
 * Pay at Visit non-payment incidents it reported, so it can see patterns
 * (e.g. the same guest repeatedly).
 */
router.get('/:businessId/pay-at-visit-incidents', authenticate, requireBusinessOwnerOrAdmin, async (req, res) => {
  const result = await query(
    `SELECT i.id, i.amount, i.reported_at, i.booking_id, i.order_id, u.name AS user_name
     FROM pay_at_visit_incidents i
     JOIN users u ON u.id = i.user_id
     WHERE i.business_id = $1
     ORDER BY i.reported_at DESC`,
    [req.params.businessId]
  );
  res.json({ incidents: result.rows });
});

/**
 * PATCH /api/business/:businessId/settings
 * body: any subset of { name, location_island, location_atoll, contact_info, payout_bank_details,
 *                        refund_fee_business_percent, notification_preferences }
 */
router.patch('/:businessId/settings', authenticate, requireBusinessOwner, async (req, res) => {
  const { name, location_island, location_atoll, contact_info, payout_bank_details, refund_fee_business_percent, notification_preferences } = req.body;

  const result = await query(
    `UPDATE businesses SET
       name = COALESCE($1, name),
       location_island = COALESCE($2, location_island),
       location_atoll = COALESCE($3, location_atoll),
       contact_info = COALESCE($4, contact_info),
       payout_bank_details = COALESCE($5, payout_bank_details),
       refund_fee_business_percent = COALESCE($6, refund_fee_business_percent),
       notification_preferences = COALESCE($7, notification_preferences),
       updated_at = now()
     WHERE id = $8
     RETURNING id, name, refund_fee_business_percent, notification_preferences`,
    [
      name, location_island, location_atoll,
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
  const passwordHash = await bcrypt.hash(temp_password, 12);

  const result = await query(
    `INSERT INTO staff_accounts (business_id, name, login_email, password_hash, permission_level)
     VALUES ($1,$2,$3,$4,$5) RETURNING id, name, login_email, permission_level, status`,
    [req.params.businessId, name, login_email, passwordHash, permission_level || 'front_desk']
  );
  res.status(201).json({ staff: result.rows[0] });
});

/**
 * POST /api/business/staff-login
 * body: { login_email, password }
 * A staff_accounts row was previously only ever created by the owner
 * (POST above) with no way to actually use it — this is that missing
 * login. No businessId in the URL since a staff member logs in with just
 * their email/password like anyone else; which business they belong to
 * comes back in the response and is embedded in the token itself
 * (role: 'staff', businessId), which checkin.js's ownership checks accept
 * alongside the owner's own 'user' role. Deliberately narrower than the
 * owner's session: a staff token only ever grants check-in access, never
 * settings, payouts, or listing management, regardless of permission_level
 * (only 'front_desk' exists today, but this stays role-gated at the route
 * level rather than trusting permission_level to expand safely later).
 */
router.post('/staff-login', loginLimiter, async (req, res) => {
  const { login_email, password } = req.body;
  if (!login_email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const result = await query(
    `SELECT s.id, s.name, s.password_hash, s.permission_level, s.status,
            s.business_id, b.name AS business_name
     FROM staff_accounts s
     JOIN businesses b ON b.id = s.business_id
     WHERE s.login_email = $1`,
    [login_email]
  );
  if (!result.rows.length) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }
  const staff = result.rows[0];
  const valid = await bcrypt.compare(password, staff.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }
  if (staff.status !== 'active') {
    return res.status(403).json({ error: 'This staff account has been revoked. Ask your manager for a new invite.' });
  }

  const token = jwt.sign(
    { id: staff.id, role: 'staff', businessId: staff.business_id, permissionLevel: staff.permission_level },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
  res.json({
    token,
    staff: {
      id: staff.id, name: staff.name, permission_level: staff.permission_level,
      business_id: staff.business_id, business_name: staff.business_name,
    },
  });
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

/**
 * GET /api/business/:businessId/agents
 * The agents connected to this business (agents.js's POST /connect creates
 * the row), each with the commission_rate this business has set for them —
 * NULL until it's set, in which case agents.js's DEFAULT_COMMISSION_RATE
 * applies to that agent's bookings. This is the business's authority over
 * what it pays out; the agent can't set it (see agents.js's file header re:
 * the deliberately-deferred business-side controls on this table).
 */
router.get('/:businessId/agents', authenticate, requireBusinessOwner, async (req, res) => {
  const result = await query(
    `SELECT a.id, a.name, a.contact_email, acb.commission_rate
     FROM agent_connected_businesses acb
     JOIN agents a ON a.id = acb.agent_id
     WHERE acb.business_id = $1
     ORDER BY a.name`,
    [req.params.businessId]
  );
  res.json({ agents: result.rows });
});

/**
 * PATCH /api/business/:businessId/agents/:agentId/commission-rate
 * body: { commission_rate: number } — 0-100, the percentage this business
 * pays this agent per booking. Rejected outside that range.
 */
router.patch('/:businessId/agents/:agentId/commission-rate', authenticate, requireBusinessOwner, async (req, res) => {
  const rate = Number(req.body?.commission_rate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    return res.status(400).json({ error: 'commission_rate must be a number between 0 and 100.' });
  }

  const result = await query(
    `UPDATE agent_connected_businesses SET commission_rate = $1
     WHERE business_id = $2 AND agent_id = $3
     RETURNING agent_id, commission_rate`,
    [rate, req.params.businessId, req.params.agentId]
  );
  if (!result.rows.length) {
    return res.status(404).json({ error: 'That agent is not connected to this business.' });
  }
  res.json({ agent: result.rows[0] });
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
