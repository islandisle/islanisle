// Island browsing + listing discovery — script Section 3.2 and 7.4's
// "Browse as guest" (no auth required to view; auth required to book).
//
// Dual pricing (Section 3.4): this endpoint returns BOTH tourist_price and
// local_price. The frontend decides which one to display based on the
// logged-in user's type — or shows tourist_price by default for guests
// browsing without an account.

import { Router } from 'express';
import { query } from '../config/db.js';

const router = Router();

/**
 * GET /api/islands/:island/listings?type=guesthouse&accessibility=wheelchair_accessible,step_free_access
 * Section 3.2: everything available on the selected island, optionally
 * filtered by business type. No auth required (browse-as-guest, Section 7.4).
 *
 * businesses.location_island is free text (a plain <input>, not a picker —
 * see business.js's signup route and frontend-business's CreateBusinessForm),
 * so an exact match here silently dropped any business whose owner typed a
 * different case or stray whitespace than whatever the tourist side sends
 * (e.g. Home.jsx's DEFAULT_ISLAND = 'Maafushi') — the listing was otherwise
 * fully approved/active and correctly showed up anywhere it's looked up by
 * id (business dashboard, admin directory), just never here. Matching
 * case/whitespace-insensitively is a pragmatic fix for that; a real island
 * picker backed by a fixed list would remove the root cause entirely.
 *
 * accessibility is a comma-separated list of listings.accessibility_features
 * tags; a listing must have ALL requested tags to match (Postgres array
 * containment, `@>`) — a tourist picking "wheelchair accessible" AND
 * "step-free access" wants both, not either.
 */
router.get('/:island/listings', async (req, res) => {
  const { island } = req.params;
  const { type, accessibility } = req.query;

  const params = [island];
  let typeFilter = '';
  if (type) {
    params.push(type);
    typeFilter = `AND b.type = $${params.length}`;
  }

  let accessibilityFilter = '';
  if (accessibility) {
    const tags = accessibility.split(',').map((s) => s.trim()).filter(Boolean);
    if (tags.length > 0) {
      params.push(tags);
      accessibilityFilter = `AND l.accessibility_features @> $${params.length}::TEXT[]`;
    }
  }

  const result = await query(
    `SELECT l.id, l.title, l.description, l.tourist_price, l.local_price, l.photos,
            l.accessibility_features,
            b.id AS business_id, b.name AS business_name, b.type AS business_type,
            b.verified_badge,
            COALESCE(rv.review_count, 0) AS review_count,
            rv.average_rating,
            EXISTS (
              SELECT 1 FROM closures c
              WHERE c.business_id = b.id AND CURRENT_DATE BETWEEN c.start_date AND c.end_date
            ) AS is_closed
     FROM listings l
     JOIN businesses b ON b.id = l.business_id
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS review_count, AVG(rating)::float AS average_rating
       FROM reviews r WHERE r.business_id = b.id
     ) rv ON true
     WHERE LOWER(TRIM(b.location_island)) = LOWER(TRIM($1))
       AND l.approval_status = 'approved'
       AND b.approval_status = 'approved'
       AND b.account_status = 'active'
       ${typeFilter}
       ${accessibilityFilter}
     ORDER BY l.created_at DESC`,
    params
  );

  res.json({ island, listings: result.rows });
});

/**
 * GET /api/islands/search?q=<text>
 * Global search (Batch 19) — across every island at once, unlike
 * GET /:island/listings which is scoped to one. Matches listing title,
 * listing description, and business name (ILIKE, no full-text index —
 * the catalog is small enough that this is fine for now). Returns
 * business_type/location_island alongside so the frontend can jump the
 * tourist's island picker to wherever the match actually lives.
 */
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) {
    return res.json({ query: q, results: [] });
  }

  const result = await query(
    `SELECT l.id, l.title, l.tourist_price, l.local_price, l.photos,
            b.id AS business_id, b.name AS business_name, b.type AS business_type,
            b.location_island
     FROM listings l
     JOIN businesses b ON b.id = l.business_id
     WHERE l.approval_status = 'approved'
       AND b.approval_status = 'approved'
       AND b.account_status = 'active'
       AND (l.title ILIKE $1 OR l.description ILIKE $1 OR b.name ILIKE $1)
     ORDER BY l.title ASC
     LIMIT 30`,
    [`%${q}%`]
  );

  res.json({ query: q, results: result.rows });
});

/**
 * GET /api/listings/:id
 * Full detail for one listing.
 */
router.get('/detail/:id', async (req, res) => {
  const result = await query(
    `SELECT l.*, b.name AS business_name, b.type AS business_type, b.verified_badge
     FROM listings l JOIN businesses b ON b.id = l.business_id
     WHERE l.id = $1 AND l.approval_status = 'approved'`,
    [req.params.id]
  );
  if (!result.rows.length) {
    return res.status(404).json({ error: 'Listing not found.' });
  }
  res.json({ listing: result.rows[0] });
});

/**
 * GET /api/islands/arrivals?destination=<island>
 * Section 3.1: Arrival Transfers screen — speedboat/airplane options from
 * the airport to the tourist's chosen destination island.
 */
router.get('/arrivals', async (req, res) => {
  const { destination } = req.query;
  if (!destination) {
    return res.status(400).json({ error: 'destination query param is required.' });
  }

  const result = await query(
    `SELECT l.id, l.title, l.description, l.tourist_price, l.local_price, l.type_specific_fields,
            b.id AS business_id, b.name AS business_name
     FROM listings l
     JOIN businesses b ON b.id = l.business_id
     WHERE b.type = 'speedboat'
       AND l.approval_status = 'approved' AND b.approval_status = 'approved'
       AND (l.type_specific_fields->>'destination' = $1)
     ORDER BY l.tourist_price ASC`,
    [destination]
  );
  res.json({ destination, transfers: result.rows });
});

/**
 * GET /api/islands/transfers?origin=<island>&destination=<island>
 * Section 3.2: Island Transfers screen — same idea, island-to-island rather
 * than airport-to-island.
 */
router.get('/transfers', async (req, res) => {
  const { origin, destination } = req.query;
  if (!origin || !destination) {
    return res.status(400).json({ error: 'origin and destination query params are required.' });
  }

  const result = await query(
    `SELECT l.id, l.title, l.tourist_price, l.local_price, l.type_specific_fields,
            b.id AS business_id, b.name AS business_name
     FROM listings l
     JOIN businesses b ON b.id = l.business_id
     WHERE b.type = 'speedboat'
       AND l.approval_status = 'approved' AND b.approval_status = 'approved'
       AND (l.type_specific_fields->>'origin' = $1)
       AND (l.type_specific_fields->>'destination' = $2)
     ORDER BY l.tourist_price ASC`,
    [origin, destination]
  );
  res.json({ origin, destination, transfers: result.rows });
});

export default router;
