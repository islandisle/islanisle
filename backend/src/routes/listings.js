// Island browsing + listing discovery — script Section 3.2 and 7.4's
// "Browse as guest" (no auth required to view; auth required to book).
//
// Dual pricing (Section 3.4): this endpoint returns BOTH tourist_price and
// local_price. The frontend decides which one to display based on the
// logged-in user's type — or shows tourist_price by default for guests
// browsing without an account.

import { Router } from 'express';
import { query } from '../config/db.js';
import { optionalAuthenticate } from '../middleware/auth.js';
import { applyAgentMarkup, applyAgentMarkupToRows } from '../services/agentPricing.js';

const router = Router();

/**
 * GET /api/islands
 * Batch 40 — the full atoll → island list the IslandPicker (tourist +
 * business) is populated from. Source of truth is Batch 25's
 * external_places import (every inhabited island the Ministry of Tourism
 * dataset covers), unioned with any island that has a real approved
 * business even with zero external_places rows, so the picker never omits
 * somewhere you can actually book. Grouped by atoll (atolls + islands each
 * sorted); a business-only island whose name matches no external_places
 * island lands in a trailing "Other islands" group.
 *
 * The result is effectively static (external_places is seeded once; the
 * union only grows when a business is approved), so it's cached in-process
 * for a few minutes rather than recomputed per picker mount.
 */
let islandListCache = null;
let islandListCacheAt = 0;
const ISLAND_LIST_TTL_MS = 5 * 60 * 1000;
const OTHER_ISLANDS_GROUP = 'Other islands';

// Loose key for matching island names across sources that spell the same
// place differently (e.g. "Malé" vs "Male'") — strip everything but
// letters/digits, lowercase.
function islandKey(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

router.get('/', async (_req, res) => {
  if (islandListCache && Date.now() - islandListCacheAt < ISLAND_LIST_TTL_MS) {
    return res.json(islandListCache);
  }

  const [extResult, bizResult] = await Promise.all([
    query(
      `SELECT DISTINCT TRIM(atoll) AS atoll, TRIM(island) AS island
       FROM external_places
       WHERE atoll IS NOT NULL AND island IS NOT NULL
         AND TRIM(atoll) <> '' AND TRIM(island) <> ''
         AND LOWER(TRIM(atoll)) <> 'unknown' AND LOWER(TRIM(island)) <> 'unknown'`
    ),
    query(
      `SELECT DISTINCT TRIM(location_island) AS island
       FROM businesses
       WHERE approval_status = 'approved'
         AND location_island IS NOT NULL AND TRIM(location_island) <> ''`
    ),
  ]);

  const byAtoll = new Map();
  const knownIslandKeys = new Set();
  for (const { atoll, island } of extResult.rows) {
    if (!byAtoll.has(atoll)) byAtoll.set(atoll, new Set());
    byAtoll.get(atoll).add(island);
    knownIslandKeys.add(islandKey(island));
  }

  for (const { island } of bizResult.rows) {
    if (knownIslandKeys.has(islandKey(island))) continue; // already covered by external_places
    if (!byAtoll.has(OTHER_ISLANDS_GROUP)) byAtoll.set(OTHER_ISLANDS_GROUP, new Set());
    byAtoll.get(OTHER_ISLANDS_GROUP).add(island);
    knownIslandKeys.add(islandKey(island));
  }

  const atolls = [...byAtoll.entries()]
    .map(([atoll, islands]) => ({
      atoll,
      islands: [...islands].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => {
      if (a.atoll === OTHER_ISLANDS_GROUP) return 1;
      if (b.atoll === OTHER_ISLANDS_GROUP) return -1;
      return a.atoll.localeCompare(b.atoll);
    });

  islandListCache = { atolls };
  islandListCacheAt = Date.now();
  res.json(islandListCache);
});

/**
 * GET /api/islands/:island/listings?type=guesthouse&atoll=Baa&accessibility=wheelchair_accessible,step_free_access
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
 * ?atoll disambiguates the 14 island names that exist in more than one
 * atoll (e.g. Maalhos is in both Alifu Alifu and Baa). It's an optional
 * best-effort filter, not a hard one: a business is only excluded when the
 * tourist's atoll is known AND the business has its own location_atoll on
 * file AND the two differ. A legacy business with location_atoll = NULL
 * (the column is nullable and older rows predate it) still shows up under
 * its island regardless — the ambiguity existed before this param and
 * shouldn't turn into a false negative now.
 *
 * accessibility is a comma-separated list of listings.accessibility_features
 * tags; a listing must have ALL requested tags to match (Postgres array
 * containment, `@>`) — a tourist picking "wheelchair accessible" AND
 * "step-free access" wants both, not either.
 *
 * optionalAuthenticate: no token required (browse-as-guest), but when one
 * is present, tourist_price for any business the caller's assigned agent
 * is approved-connected to is silently marked up by that connection's
 * commission rate — see services/agentPricing.js. Guests never see markup.
 */
router.get('/:island/listings', optionalAuthenticate, async (req, res) => {
  const { island } = req.params;
  const { type, accessibility, dietary, atoll } = req.query;

  // `island === 'all'` is the nationwide feed (fix #1) — a tourist who's
  // abroad, or who picked "I'm not in the Maldives yet", browses every
  // island's listings at once instead of one island's. All the other
  // filters (type / accessibility / dietary) still apply; only the
  // island + atoll scoping is dropped. location_island/location_atoll are
  // selected so the frontend can label which island each card is on.
  const nationwide = String(island).toLowerCase() === 'all';

  // Scoped browse: $1 island, $2 atoll (nullable — see the WHERE clause
  // below). Nationwide: no island/atoll params at all. Either way every
  // other filter appends after and reads its own $n off params.length.
  const params = nationwide ? [] : [island, atoll || null];
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

  let dietaryFilter = '';
  if (dietary) {
    const tags = dietary.split(',').map((s) => s.trim()).filter(Boolean);
    if (tags.length > 0) {
      params.push(tags);
      dietaryFilter = `AND l.dietary_tags @> $${params.length}::TEXT[]`;
    }
  }

  const islandScope = nationwide
    ? ''
    : `LOWER(TRIM(b.location_island)) = LOWER(TRIM($1))
       AND (
         $2::text IS NULL
         OR b.location_atoll IS NULL
         OR LOWER(TRIM(b.location_atoll)) = LOWER(TRIM($2))
       )
       AND `;

  const result = await query(
    `SELECT l.id, l.title, l.description, l.tourist_price, l.local_price, l.photos,
            l.accessibility_features, l.dietary_tags,
            b.id AS business_id, b.name AS business_name, b.type AS business_type,
            b.location_island, b.location_atoll,
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
     WHERE ${islandScope}l.approval_status = 'approved'
       AND b.approval_status = 'approved'
       AND b.account_status = 'active'
       ${typeFilter}
       ${accessibilityFilter}
       ${dietaryFilter}
     ORDER BY ${nationwide ? 'b.location_island ASC, l.created_at DESC' : 'l.created_at DESC'}`,
    params
  );

  const listings = await applyAgentMarkupToRows(result.rows, req.user?.id);
  res.json({ island: nationwide ? 'all' : island, listings });
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
router.get('/search', optionalAuthenticate, async (req, res) => {
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

  const results = await applyAgentMarkupToRows(result.rows, req.user?.id);
  res.json({ query: q, results });
});

/**
 * GET /api/listings/:id
 * Full detail for one listing — ListingDetail.jsx's data source.
 * optionalAuthenticate + agent-markup on tourist_price, same as the browse
 * endpoints, so what's shown here matches what bookings.js's POST / charges.
 */
router.get('/detail/:id', optionalAuthenticate, async (req, res) => {
  const result = await query(
    `SELECT l.*, b.name AS business_name, b.type AS business_type, b.verified_badge,
            b.refund_fee_business_percent
     FROM listings l JOIN businesses b ON b.id = l.business_id
     WHERE l.id = $1 AND l.approval_status = 'approved'`,
    [req.params.id]
  );
  if (!result.rows.length) {
    return res.status(404).json({ error: 'Listing not found.' });
  }
  const listing = result.rows[0];
  listing.tourist_price = await applyAgentMarkup(listing.tourist_price, req.user?.id, listing.business_id);
  res.json({ listing });
});

/**
 * GET /api/islands/arrivals?destination=<island>
 * Section 3.1: Arrival Transfers screen — speedboat/airplane options from
 * the airport to the tourist's chosen destination island.
 */
router.get('/arrivals', optionalAuthenticate, async (req, res) => {
  const { destination } = req.query;
  if (!destination) {
    return res.status(400).json({ error: 'destination query param is required.' });
  }

  // Reliability-first ordering: a tourist landing at the airport should see
  // the verified, well-reviewed operators before the cheapest one — price
  // alone doesn't tell you whether the boat reliably shows up. Verified
  // badge first, then rating, then review volume (a 5.0 from 2 reviews is
  // less proven than a 4.7 from 80), then price as the final tie-break.
  const result = await query(
    `SELECT l.id, l.title, l.description, l.tourist_price, l.local_price, l.type_specific_fields,
            b.id AS business_id, b.name AS business_name, b.verified_badge,
            COALESCE(rv.review_count, 0) AS review_count,
            rv.average_rating
     FROM listings l
     JOIN businesses b ON b.id = l.business_id
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS review_count, AVG(rating)::float AS average_rating
       FROM reviews r WHERE r.business_id = b.id
     ) rv ON true
     WHERE b.type = 'speedboat'
       AND l.approval_status = 'approved' AND b.approval_status = 'approved'
       AND (l.type_specific_fields->>'destination' = $1)
     ORDER BY b.verified_badge DESC, rv.average_rating DESC NULLS LAST,
              COALESCE(rv.review_count, 0) DESC, l.tourist_price ASC`,
    [destination]
  );
  // Markup is applied after ordering — the sort is reliability-first with
  // price only a final tie-break, so a per-connection markup on top of raw
  // price doesn't meaningfully reorder it.
  const transfers = await applyAgentMarkupToRows(result.rows, req.user?.id);
  res.json({ destination, transfers });
});

/**
 * GET /api/islands/transfers?origin=<island>&destination=<island>
 * Section 3.2: Island Transfers screen — same idea, island-to-island rather
 * than airport-to-island. Same reliability-first ordering as the arrival
 * transfers route above.
 */
router.get('/transfers', optionalAuthenticate, async (req, res) => {
  const { origin, destination } = req.query;
  if (!origin || !destination) {
    return res.status(400).json({ error: 'origin and destination query params are required.' });
  }

  const result = await query(
    `SELECT l.id, l.title, l.tourist_price, l.local_price, l.type_specific_fields,
            b.id AS business_id, b.name AS business_name, b.verified_badge,
            COALESCE(rv.review_count, 0) AS review_count,
            rv.average_rating
     FROM listings l
     JOIN businesses b ON b.id = l.business_id
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS review_count, AVG(rating)::float AS average_rating
       FROM reviews r WHERE r.business_id = b.id
     ) rv ON true
     WHERE b.type = 'speedboat'
       AND l.approval_status = 'approved' AND b.approval_status = 'approved'
       AND (l.type_specific_fields->>'origin' = $1)
       AND (l.type_specific_fields->>'destination' = $2)
     ORDER BY b.verified_badge DESC, rv.average_rating DESC NULLS LAST,
              COALESCE(rv.review_count, 0) DESC, l.tourist_price ASC`,
    [origin, destination]
  );
  const transfers = await applyAgentMarkupToRows(result.rows, req.user?.id);
  res.json({ origin, destination, transfers });
});

export default router;
