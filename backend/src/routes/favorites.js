// Favorites (Batch 19) — a tourist saving a listing for later. See
// schema.sql's comment on the favorites table for why "nearby now" (the
// other half of this batch item) is scoped down to an "open now" filter
// on Home.jsx instead of real geolocation.

import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { applyAgentMarkupToRows } from '../services/agentPricing.js';

const router = Router();

/**
 * GET /api/favorites/mine
 * Same shape as GET /:island/listings (listings.js) so the frontend can
 * reuse its ListingCard component directly.
 */
router.get('/mine', authenticate, async (req, res) => {
  const result = await query(
    `SELECT l.id, l.title, l.tourist_price, l.local_price, l.photos,
            l.accessibility_features, l.dietary_tags,
            b.id AS business_id, b.name AS business_name, b.type AS business_type,
            b.verified_badge, b.location_island,
            COALESCE(rv.review_count, 0) AS review_count,
            rv.average_rating,
            EXISTS (
              SELECT 1 FROM closures c
              WHERE c.business_id = b.id AND CURRENT_DATE BETWEEN c.start_date AND c.end_date
            ) AS is_closed
     FROM favorites f
     JOIN listings l ON l.id = f.listing_id
     JOIN businesses b ON b.id = l.business_id
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS review_count, AVG(rating)::float AS average_rating
       FROM reviews r WHERE r.business_id = b.id
     ) rv ON true
     WHERE f.user_id = $1
     ORDER BY f.created_at DESC`,
    [req.user.id]
  );
  // Same silent agent-markup as the browse endpoints (services/agentPricing.js).
  const listings = await applyAgentMarkupToRows(result.rows, req.user.id);
  res.json({ listings });
});

/**
 * GET /api/favorites/ids
 * Just the listing ids, for cheaply marking star/heart state on any
 * listing-card grid without pulling full listing data.
 */
router.get('/ids', authenticate, async (req, res) => {
  const result = await query('SELECT listing_id FROM favorites WHERE user_id = $1', [req.user.id]);
  res.json({ listing_ids: result.rows.map((r) => r.listing_id) });
});

router.post('/:listingId', authenticate, async (req, res) => {
  await query(
    `INSERT INTO favorites (user_id, listing_id) VALUES ($1, $2) ON CONFLICT (user_id, listing_id) DO NOTHING`,
    [req.user.id, req.params.listingId]
  );
  res.status(201).json({ status: 'favorited' });
});

router.delete('/:listingId', authenticate, async (req, res) => {
  await query('DELETE FROM favorites WHERE user_id = $1 AND listing_id = $2', [req.user.id, req.params.listingId]);
  res.json({ status: 'unfavorited' });
});

export default router;
