// Business accounts + listings — script Sections 2.3 (signup) and 4.1–4.5
// (per-type listing fields, via type_specific_fields JSONB on the listings table).
//
// A business account is owned by a user account (businesses.owner_user_id),
// so business signup requires an existing logged-in user — it doesn't create
// a new login, it attaches a business to the one you already have.

import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

const VALID_BUSINESS_TYPES = ['guesthouse', 'restaurant', 'excursion', 'speedboat', 'shop'];

// Section 2.3/4.9: "Free tier: 1 listing. Pro tier ($ subscription, 30-day
// renewal): up to 10 listings." businesses.subscription_tier already
// existed but nothing ever checked it against how many listings a business
// already has.
const LISTING_LIMIT_BY_TIER = { free: 1, pro: 10 };

// Verifies the logged-in user owns the business_id in the route — used on
// every listing-management (write) route below.
async function requireBusinessOwner(req, res, next) {
  const { businessId } = req.params;
  const result = await query('SELECT owner_user_id FROM businesses WHERE id = $1', [businessId]);
  if (!result.rows.length) {
    return res.status(404).json({ error: 'Business not found.' });
  }
  if (result.rows[0].owner_user_id !== req.user.id) {
    return res.status(403).json({ error: 'You do not manage this business.' });
  }
  next();
}

// Same as requireBusinessOwner, but also lets an admin token read through
// (never used on a write route) — Section 10.2's approval queue needs to
// show a pending listing's full business context before approve/reject,
// which previously 403'd for every admin token.
async function requireBusinessOwnerOrAdmin(req, res, next) {
  const { businessId } = req.params;
  const result = await query('SELECT owner_user_id FROM businesses WHERE id = $1', [businessId]);
  if (!result.rows.length) {
    return res.status(404).json({ error: 'Business not found.' });
  }
  if (req.user.role === 'admin') return next();
  if (result.rows[0].owner_user_id !== req.user.id) {
    return res.status(403).json({ error: 'You do not manage this business.' });
  }
  next();
}

/**
 * POST /api/business/signup
 * Section 2.3: "What kind of business are you?" -> routes into that type's setup.
 * body: { type, name, location_island, contact_info }
 */
router.post('/signup', authenticate, async (req, res) => {
  try {
    const { type, name, location_island, contact_info } = req.body;

    if (!VALID_BUSINESS_TYPES.includes(type)) {
      return res.status(400).json({
        error: `type must be one of: ${VALID_BUSINESS_TYPES.join(', ')}`,
      });
    }
    if (!name) {
      return res.status(400).json({ error: 'Business name is required.' });
    }

    const result = await query(
      `INSERT INTO businesses (owner_user_id, name, type, location_island, contact_info)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, type, approval_status, subscription_tier`,
      [req.user.id, name, type, location_island || null, contact_info ? JSON.stringify(contact_info) : null]
    );

    res.status(201).json({
      business: result.rows[0],
      message: 'Business created. It will appear once Super Admin approves it (Section 10.2).',
      commission_summary: 'You only pay 1% when a guest pays and gets their stay/service — nothing upfront, nothing if they don\'t book.',
    });
  } catch (err) {
    console.error('Business signup error:', err);
    res.status(500).json({ error: 'Could not create business.' });
  }
});

/**
 * POST /api/business/:businessId/listings
 * Section 4.1–4.5: fields differ by business type but all share the same
 * core shape (title, description, tourist_price, local_price, photos, plus
 * type_specific_fields for anything unique to that business type — room
 * capacity, excursion duration, luggage_allowance, etc.)
 */
router.post('/:businessId/listings', authenticate, requireBusinessOwner, async (req, res) => {
  try {
    const { businessId } = req.params;
    const { title, description, tourist_price, local_price, type_specific_fields, photos, stock_count, fulfillment_options, free_delivery, pay_at_visit_enabled, accessibility_features } = req.body;

    if (!title || tourist_price == null || local_price == null) {
      return res.status(400).json({ error: 'title, tourist_price, and local_price are required.' });
    }

    // Pay at Visit enforcement (Section 9 / [PHASE 2]) — schema's own
    // comment on pay_at_visit_enabled: "forced true while
    // Business.trust_tier = 'new'". A new, unverified business can't opt
    // out of it (it's their only payment path — see bookings.js/orders.js's
    // checkout enforcement); a graduated business chooses for itself.
    // This trust-tier gate is independent of, and left in place under,
    // config/payments.js's platform-wide ONLINE_PAYMENTS_ENABLED — every
    // business is effectively Pay-at-Visit-only right now regardless of
    // what's set here, since 'online' is rejected at checkout no matter
    // what this flag says.
    const trustResult = await query('SELECT trust_tier, subscription_tier FROM businesses WHERE id = $1', [businessId]);
    const isNewBusiness = trustResult.rows[0]?.trust_tier === 'new';
    const effectivePayAtVisitEnabled = isNewBusiness ? true : Boolean(pay_at_visit_enabled);

    // Free/Pro listing cap (Section 2.3/4.9) — checked here rather than at
    // signup, since it's the actual creation of listing N+1 that should be
    // blocked, not the business existing.
    const subscriptionTier = trustResult.rows[0]?.subscription_tier === 'pro' ? 'pro' : 'free';
    const listingLimit = LISTING_LIMIT_BY_TIER[subscriptionTier];
    const listingCountResult = await query('SELECT COUNT(*)::int AS count FROM listings WHERE business_id = $1', [businessId]);
    if (listingCountResult.rows[0].count >= listingLimit) {
      return res.status(403).json({
        error: subscriptionTier === 'pro'
          ? `Your Pro plan allows up to ${listingLimit} listings — remove one to add another.`
          : `Free tier allows 1 listing — upgrade to Pro for up to 10.`,
      });
    }

    const result = await query(
      `INSERT INTO listings (
         business_id, title, description, type_specific_fields, tourist_price, local_price,
         photos, stock_count, fulfillment_options, free_delivery, pay_at_visit_enabled, accessibility_features
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id, title, tourist_price, local_price, approval_status, pay_at_visit_enabled, accessibility_features`,
      [
        businessId, title, description || null, JSON.stringify(type_specific_fields || {}),
        tourist_price, local_price, photos || [], stock_count || null,
        fulfillment_options || null, free_delivery || false, effectivePayAtVisitEnabled,
        accessibility_features || [],
      ]
    );

    res.status(201).json({
      listing: result.rows[0],
      message: 'Listing created — pending Super Admin approval before it goes live (Section 10.2).',
    });
  } catch (err) {
    console.error('Listing creation error:', err);
    res.status(500).json({ error: 'Could not create listing.' });
  }
});

/**
 * GET /api/business/:businessId/listings
 * Business's own listing management view.
 */
router.get('/:businessId/listings', authenticate, requireBusinessOwnerOrAdmin, async (req, res) => {
  const { businessId } = req.params;
  const result = await query(
    `SELECT id, title, tourist_price, local_price, approval_status, pay_at_visit_enabled, accessibility_features, created_at
     FROM listings WHERE business_id = $1 ORDER BY created_at DESC`,
    [businessId]
  );
  res.json({ listings: result.rows });
});

/**
 * PATCH /api/business/:businessId/listings/:listingId
 * Edit price, description, availability — anything except approval_status
 * (only Super Admin can change that, via the admin routes).
 */
router.patch('/:businessId/listings/:listingId', authenticate, requireBusinessOwner, async (req, res) => {
  const { listingId } = req.params;
  const { title, description, tourist_price, local_price, photos, accessibility_features } = req.body;

  const result = await query(
    `UPDATE listings SET
       title = COALESCE($1, title),
       description = COALESCE($2, description),
       tourist_price = COALESCE($3, tourist_price),
       local_price = COALESCE($4, local_price),
       photos = COALESCE($5, photos),
       accessibility_features = COALESCE($6, accessibility_features),
       updated_at = now()
     WHERE id = $7
     RETURNING id, title, tourist_price, local_price, accessibility_features`,
    [title, description, tourist_price, local_price, photos, accessibility_features, listingId]
  );

  if (!result.rows.length) {
    return res.status(404).json({ error: 'Listing not found.' });
  }
  res.json({ listing: result.rows[0] });
});

export default router;
