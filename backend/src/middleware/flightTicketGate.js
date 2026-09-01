// Section 9 — Flight-ticket gate for cross-island bookings.
// "A tourist currently checked in at a guesthouse on Island A who tries to
// book something (a room, table, excursion slot, or shop order) on Island B
// must have a flight ticket on file before that booking can go through." —
// proof they actually flew into the Maldives before booking ahead on an
// island they haven't travelled to.
//
// This is a SECOND, independent gate, not a replacement for the passport/ID
// document gate in documentGate.js — that one is about having any identity
// document on file at all; this one is specifically about arrival proof,
// and only bites on a cross-island booking.
//
// Which island the tourist is "on" is derived from
// users.current_stay_business_id (set by checkin.js when a guest actually
// checks in somewhere) joined to businesses.location_island — never the
// client-side island browse filter, which a tourist can set to anything.
// Consequences:
//   - A tourist with no current stay yet (hasn't checked in anywhere) is
//     NOT gated — their first-ever booking must never be blocked, since
//     there's no "other island" to compare against yet.
//   - Locals are never gated — they aren't flying in.

import { query } from '../config/db.js';

export async function requireFlightTicketForCrossIsland(req, res, next) {
  const userId = req.user?.id; // expects auth middleware to have set req.user
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  // Account type and current-stay island in one lookup (no separate round
  // trip): current_stay_business_id is what checkin.js sets, and that
  // business's location_island is the island the stay is on.
  const userResult = await query(
    `SELECT u.type, u.flight_ticket_image_url, stay.location_island AS current_island
     FROM users u
     LEFT JOIN businesses stay ON stay.id = u.current_stay_business_id
     WHERE u.id = $1`,
    [userId]
  );
  if (!userResult.rows.length) {
    return next(); // no such user — let the route's own lookup 404 it
  }
  const { type, flight_ticket_image_url: flightTicketOnFile, current_island: currentIsland } = userResult.rows[0];

  // Locals aren't flying in; a tourist with no current stay yet has no
  // "other island" to compare against — neither is gated.
  if (type !== 'tourist' || !currentIsland) {
    return next();
  }

  // Resolve the target business's island from whatever the route put in the
  // request body: bookings.js's POST / carries a single listing_id;
  // orders.js's POST / carries an items array of { listing_id, quantity }.
  const listingIds = [];
  if (req.body?.listing_id) listingIds.push(req.body.listing_id);
  if (Array.isArray(req.body?.items)) {
    for (const item of req.body.items) {
      if (item?.listing_id) listingIds.push(item.listing_id);
    }
  }
  if (!listingIds.length) {
    return next(); // nothing bookable in the body — the route will 400 on its own
  }

  // Is any target listing on a different island than the tourist's current
  // stay? Island names are compared case-insensitively and trimmed — the
  // same LOWER(TRIM(...)) convention used for island-name matching
  // elsewhere (e.g. services/weatherCascade.js).
  let crossIsland = false;
  try {
    const crossIslandResult = await query(
      `SELECT EXISTS (
         SELECT 1 FROM listings l
         JOIN businesses b ON b.id = l.business_id
         WHERE l.id = ANY($1::uuid[])
           AND LOWER(TRIM(b.location_island)) <> LOWER(TRIM($2))
       ) AS cross_island`,
      [listingIds, currentIsland]
    );
    crossIsland = crossIslandResult.rows[0].cross_island;
  } catch {
    // A malformed listing_id (not a UUID) or a transient DB error here
    // shouldn't 500 the checkout from inside a middleware — hand off to the
    // route, whose own validation and try/catch produce the right 4xx.
    return next();
  }

  if (!crossIsland) {
    return next(); // booking on the same island — not gated
  }

  if (flightTicketOnFile) {
    return next();
  }

  return res.status(403).json({
    error: 'A flight ticket must be on file before booking on a different island. Upload one to continue.',
    code: 'flight_ticket_required',
  });
}
