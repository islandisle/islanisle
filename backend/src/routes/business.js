// Business accounts + listings — script Sections 2.3 (signup) and 4.1–4.5
// (per-type listing fields, via type_specific_fields JSONB on the listings table).
//
// A business account is owned by a user account (businesses.owner_user_id),
// so business signup requires an existing logged-in user — it doesn't create
// a new login, it attaches a business to the one you already have.

import { Router } from 'express';
import multer from 'multer';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Section 6.4's photo galleries — listings.photos existed with no way to
// populate it (AddListingForm had no file field). Same placeholder-storage
// pattern as auth.js's document upload: memory storage, a fake dev-only URL
// returned instead of a real object-storage upload — see auth.js's own
// comment for why (no S3/Cloudinary wired up yet in this environment).
const photoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

function savePhotoPlaceholder(businessId, index) {
  return `local-dev-storage://listings/${businessId}/${Date.now()}-${index}.jpg`;
}

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
 * GET /api/business/search?q=&type=&island=
 * Batch 26 — backs the searchable business picker (frontend EntityPicker)
 * that replaced the raw "type a business UUID" fields in the B2B and agent
 * flows. Only ever returns businesses that are actually reachable for a
 * booking: approved and active. Any authenticated account may call it
 * (an agent connecting, a guesthouse arranging a B2B request) — it exposes
 * nothing that isn't already public on the tourist island-browse.
 */
router.get('/search', authenticate, async (req, res) => {
  const q = (req.query.q || '').trim();
  const { type, island } = req.query;

  const params = [`%${q}%`];
  const conditions = [
    `approval_status = 'approved'`,
    `account_status = 'active'`,
    `name ILIKE $1`,
  ];
  if (type && VALID_BUSINESS_TYPES.includes(type)) {
    params.push(type);
    conditions.push(`type = $${params.length}`);
  }
  if (island) {
    params.push(island);
    conditions.push(`LOWER(TRIM(location_island)) = LOWER(TRIM($${params.length}))`);
  }

  const result = await query(
    `SELECT id, name, type, location_island
     FROM businesses
     WHERE ${conditions.join(' AND ')}
     ORDER BY name ASC
     LIMIT 20`,
    params
  );
  res.json({ businesses: result.rows });
});

/**
 * GET /api/business/listings/search?q=&type=
 * Batch 26 — the cross-business version of the picker, for choosing a
 * speedboat route in the guesthouse-arranged-transfer form (previously a
 * raw "Speedboat listing ID" text field). Matches on listing title,
 * business name, or the route's origin/destination.
 */
router.get('/listings/search', authenticate, async (req, res) => {
  const q = (req.query.q || '').trim();
  const { type } = req.query;

  const params = [`%${q}%`];
  const conditions = [
    `l.approval_status = 'approved'`,
    `b.approval_status = 'approved'`,
    `b.account_status = 'active'`,
    `(l.title ILIKE $1 OR b.name ILIKE $1
      OR l.type_specific_fields->>'origin' ILIKE $1
      OR l.type_specific_fields->>'destination' ILIKE $1)`,
  ];
  if (type && VALID_BUSINESS_TYPES.includes(type)) {
    params.push(type);
    conditions.push(`b.type = $${params.length}`);
  }

  const result = await query(
    `SELECT l.id, l.title, l.tourist_price, l.type_specific_fields,
            b.name AS business_name, b.location_island
     FROM listings l
     JOIN businesses b ON b.id = l.business_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY b.name ASC, l.title ASC
     LIMIT 20`,
    params
  );
  const listings = result.rows.map((l) => {
    const f = l.type_specific_fields || {};
    return {
      id: l.id,
      title: l.title,
      tourist_price: l.tourist_price,
      business_name: l.business_name,
      route: f.origin || f.destination ? `${f.origin || '—'} → ${f.destination || '—'}` : null,
    };
  });
  res.json({ listings });
});

/**
 * GET /api/business/:businessId/catalog
 * Batch 26 — a business's approved listings, readable by any authenticated
 * account (unlike GET /:businessId/listings, which is owner/admin-only and
 * also returns unapproved ones). Used to pick a specific listing once a
 * receiving business has been chosen in the B2B request form.
 */
router.get('/:businessId/catalog', authenticate, async (req, res) => {
  const result = await query(
    `SELECT id, title, tourist_price, local_price, type_specific_fields
     FROM listings
     WHERE business_id = $1 AND approval_status = 'approved'
     ORDER BY title ASC`,
    [req.params.businessId]
  );
  res.json({ listings: result.rows });
});

/**
 * POST /api/business/:businessId/listings
 * Section 4.1–4.5: fields differ by business type but all share the same
 * core shape (title, description, tourist_price, local_price, photos, plus
 * type_specific_fields for anything unique to that business type — room
 * capacity, excursion duration, luggage_allowance, etc.)
 */
router.post('/:businessId/listings', authenticate, requireBusinessOwner, photoUpload.array('photos', 6), async (req, res) => {
  try {
    const { businessId } = req.params;
    // multipart/form-data (photoUpload above) means every non-file field
    // arrives as a string — JSON-encoded ones need parsing back out, and
    // numeric/boolean ones need explicit coercion, unlike the old
    // application/json body this replaced.
    const { title, description, tourist_price, local_price, stock_count, free_delivery, pay_at_visit_enabled } = req.body;
    const type_specific_fields = req.body.type_specific_fields ? JSON.parse(req.body.type_specific_fields) : {};
    const fulfillment_options = req.body.fulfillment_options ? JSON.parse(req.body.fulfillment_options) : null;
    const accessibility_features = req.body.accessibility_features ? JSON.parse(req.body.accessibility_features) : [];
    const dietary_tags = req.body.dietary_tags ? JSON.parse(req.body.dietary_tags) : [];

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
    const trustResult = await query(
      `SELECT b.trust_tier, b.subscription_tier, b.subscription_expiry,
              EXISTS (
                SELECT 1 FROM subscription_billing sb
                WHERE sb.business_id = b.id AND sb.status = 'unpaid'
                  AND sb.billing_month < date_trunc('month', CURRENT_DATE)
              ) AS has_unpaid_bill
       FROM businesses b WHERE b.id = $1`,
      [businessId]
    );
    const isNewBusiness = trustResult.rows[0]?.trust_tier === 'new';
    const effectivePayAtVisitEnabled = isNewBusiness ? true : (pay_at_visit_enabled === 'true' || pay_at_visit_enabled === true);

    // Free/Pro listing cap (Section 2.3/4.9) — checked here rather than at
    // signup, since it's the actual creation of listing N+1 that should be
    // blocked, not the business existing. Section 7.2's subscription-lapse
    // consequence — "the business just loses the ability to add new
    // listings beyond the free-tier limit" — applies the same way whether
    // the lapse is a simple expired subscription_expiry, or an unpaid
    // Tier 2 monthly bill from a past month (services/payoutRun.js's
    // bundleTier2SubscriptionBilling): either way, Pro access is suspended
    // until resolved, dropping the effective cap back to free-tier.
    const isExpired = trustResult.rows[0]?.subscription_expiry
      ? new Date(trustResult.rows[0].subscription_expiry) < new Date()
      : false;
    const hasUnpaidBill = trustResult.rows[0]?.has_unpaid_bill || false;
    const isProActive = trustResult.rows[0]?.subscription_tier === 'pro' && !isExpired && !hasUnpaidBill;
    const subscriptionTier = isProActive ? 'pro' : 'free';
    const listingLimit = LISTING_LIMIT_BY_TIER[subscriptionTier];
    const listingCountResult = await query('SELECT COUNT(*)::int AS count FROM listings WHERE business_id = $1', [businessId]);
    if (listingCountResult.rows[0].count >= listingLimit) {
      let reason = subscriptionTier === 'pro' ? 'Your Pro plan allows' : 'Free tier allows';
      if (trustResult.rows[0]?.subscription_tier === 'pro' && !isProActive) {
        reason = isExpired
          ? 'Your Pro subscription has lapsed, so you\'re back on the free-tier limit of'
          : 'You have an unpaid monthly bill, so you\'re back on the free-tier limit of';
      }
      return res.status(403).json({
        error: subscriptionTier === 'pro'
          ? `${reason} up to ${listingLimit} listings — remove one to add another.`
          : `${reason} 1 listing — ${trustResult.rows[0]?.subscription_tier === 'pro' ? 'settle your balance to restore Pro' : 'upgrade to Pro for up to 10'}.`,
      });
    }

    const photoUrls = (req.files || []).map((_, i) => savePhotoPlaceholder(businessId, i));

    // Duplicate-listing detection (Batch 19) — non-blocking. A business
    // accidentally re-submitting the same room/table/excursion (a common
    // mistake with the multipart form above — a slow network makes "Create"
    // look like it didn't register) previously just silently got two
    // listings counting against its cap. This flags it in the response
    // rather than rejecting the create, since a genuinely identical title
    // for a different offering (e.g. two "Sunset Cruise" excursions with
    // different durations) is a real, valid case the server can't tell
    // apart from a mistake — the business itself is best placed to decide.
    const duplicateResult = await query(
      `SELECT id, title FROM listings
       WHERE business_id = $1 AND LOWER(TRIM(title)) = LOWER(TRIM($2))
       LIMIT 1`,
      [businessId, title]
    );
    const duplicateOf = duplicateResult.rows[0] || null;

    const result = await query(
      `INSERT INTO listings (
         business_id, title, description, type_specific_fields, tourist_price, local_price,
         photos, stock_count, fulfillment_options, free_delivery, pay_at_visit_enabled, accessibility_features,
         dietary_tags
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id, title, tourist_price, local_price, approval_status, pay_at_visit_enabled, accessibility_features, dietary_tags, photos`,
      [
        businessId, title, description || null, JSON.stringify(type_specific_fields || {}),
        Number(tourist_price), Number(local_price), photoUrls, stock_count ? Number(stock_count) : null,
        fulfillment_options || null, free_delivery === 'true' || free_delivery === true,
        effectivePayAtVisitEnabled,
        accessibility_features || [],
        dietary_tags || [],
      ]
    );

    res.status(201).json({
      listing: result.rows[0],
      message: 'Listing created — pending Super Admin approval before it goes live (Section 10.2).',
      duplicate_warning: duplicateOf
        ? `You already have a listing titled "${duplicateOf.title}" — check this isn't an accidental duplicate.`
        : null,
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
    `SELECT id, title, tourist_price, local_price, approval_status, pay_at_visit_enabled, accessibility_features, dietary_tags, photos, created_at
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
  const { title, description, tourist_price, local_price, photos, accessibility_features, dietary_tags } = req.body;

  const result = await query(
    `UPDATE listings SET
       title = COALESCE($1, title),
       description = COALESCE($2, description),
       tourist_price = COALESCE($3, tourist_price),
       local_price = COALESCE($4, local_price),
       photos = COALESCE($5, photos),
       accessibility_features = COALESCE($6, accessibility_features),
       dietary_tags = COALESCE($7, dietary_tags),
       updated_at = now()
     WHERE id = $8
     RETURNING id, title, tourist_price, local_price, accessibility_features, dietary_tags`,
    [title, description, tourist_price, local_price, photos, accessibility_features, dietary_tags, listingId]
  );

  if (!result.rows.length) {
    return res.status(404).json({ error: 'Listing not found.' });
  }
  res.json({ listing: result.rows[0] });
});

/**
 * GET /api/business/:businessId/analytics
 * Batch 19 — a business previously had no at-a-glance view of how it's
 * doing beyond scrolling its raw bookings/orders list. Revenue counts only
 * 'confirmed'/'completed' rows (not pending_payment/cancelled) — the same
 * statuses services/payoutRun.js treats as payable.
 */
router.get('/:businessId/analytics', authenticate, requireBusinessOwnerOrAdmin, async (req, res) => {
  const { businessId } = req.params;
  const REVENUE_BOOKING_STATUSES = ['confirmed', 'completed'];
  const REVENUE_ORDER_STATUSES = ['confirmed', 'ready', 'out_for_delivery', 'completed'];

  const [summary, dailyRevenue, topListings] = await Promise.all([
    query(
      `SELECT
         (SELECT COALESCE(SUM(b.price_charged), 0) FROM bookings b
          JOIN listings l ON l.id = b.listing_id
          WHERE l.business_id = $1 AND b.status = ANY($2::booking_status[]))
         +
         (SELECT COALESCE(SUM(o.price_charged), 0) FROM orders o
          WHERE o.business_id = $1 AND o.status = ANY($3::order_status[]))
         AS total_revenue,
         (SELECT COUNT(*)::int FROM bookings b JOIN listings l ON l.id = b.listing_id
          WHERE l.business_id = $1 AND b.status = ANY($2::booking_status[]))
         +
         (SELECT COUNT(*)::int FROM orders o WHERE o.business_id = $1 AND o.status = ANY($3::order_status[]))
         AS completed_count,
         (SELECT COUNT(*)::int FROM bookings b JOIN listings l ON l.id = b.listing_id
          WHERE l.business_id = $1 AND b.status = 'cancelled')
         +
         (SELECT COUNT(*)::int FROM orders o WHERE o.business_id = $1 AND o.status = 'cancelled')
         AS cancelled_count`,
      [businessId, REVENUE_BOOKING_STATUSES, REVENUE_ORDER_STATUSES]
    ),
    query(
      `SELECT day::date AS day, COALESCE(SUM(amount), 0) AS revenue FROM (
         SELECT b.created_at AS created_at, b.price_charged AS amount FROM bookings b
         JOIN listings l ON l.id = b.listing_id
         WHERE l.business_id = $1 AND b.status = ANY($2::booking_status[])
           AND b.created_at >= CURRENT_DATE - INTERVAL '29 days'
         UNION ALL
         SELECT o.created_at, o.price_charged FROM orders o
         WHERE o.business_id = $1 AND o.status = ANY($3::order_status[])
           AND o.created_at >= CURRENT_DATE - INTERVAL '29 days'
       ) combined
       RIGHT JOIN generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, INTERVAL '1 day') day
         ON combined.created_at::date = day::date
       GROUP BY day ORDER BY day ASC`,
      [businessId, REVENUE_BOOKING_STATUSES, REVENUE_ORDER_STATUSES]
    ),
    query(
      `SELECT l.id, l.title, COUNT(b.id)::int AS booking_count, COALESCE(SUM(b.price_charged), 0) AS revenue
       FROM listings l
       LEFT JOIN bookings b ON b.listing_id = l.id AND b.status = ANY($2::booking_status[])
       WHERE l.business_id = $1
       GROUP BY l.id, l.title
       ORDER BY revenue DESC
       LIMIT 5`,
      [businessId, REVENUE_BOOKING_STATUSES]
    ),
  ]);

  res.json({
    summary: summary.rows[0],
    daily_revenue: dailyRevenue.rows,
    top_listings: topListings.rows,
  });
});

export default router;
