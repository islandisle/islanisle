// Cross-island shop delivery matching — script Section 4.5 / [PHASE 2].
// Matches against real speedboat data: Phase 1 speedboat schedules are
// generic `listings` rows (business_type = 'speedboat') with origin/
// destination/departure_times in type_specific_fields, same as
// GET /api/islands/transfers already queries — NOT the empty, unused
// `routes` table (see README's "Known architectural gap" and schema.sql's
// note above CREATE TABLE routes).
//
// Known simplification (flagged honestly): departure_times is parsed, but
// days_running (free text like "Daily" or "Mon-Fri") is not — every
// listing's departure_times are treated as running every day. Fine for a
// working MVP; a real days_running parser is a natural follow-up once the
// routes-table sync gap above gets a real fix.

import { query } from '../config/db.js';

function nextOccurrence(hhmm, now) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
  if (!match) return null;
  const [, h, m] = match;
  const hour = Number(h);
  const minute = Number(m);
  if (hour > 23 || minute > 59) return null;
  const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  if (candidate <= now) candidate.setDate(candidate.getDate() + 1);
  return candidate;
}

// Returns the soonest upcoming departure across every approved speedboat
// listing running origin -> destination, or null if none exists / the
// islands are the same. { departure: Date, listing_id, business_id, boat_name, listing_title }
export async function findFastestDelivery(originIsland, destinationIsland) {
  if (!originIsland || !destinationIsland) return null;
  if (originIsland.trim().toLowerCase() === destinationIsland.trim().toLowerCase()) return null;

  const result = await query(
    `SELECT l.id AS listing_id, l.title, l.type_specific_fields, b.id AS business_id, b.name AS business_name
     FROM listings l
     JOIN businesses b ON b.id = l.business_id
     WHERE b.type = 'speedboat' AND l.approval_status = 'approved' AND b.approval_status = 'approved'
       AND LOWER(TRIM(l.type_specific_fields->>'origin')) = LOWER(TRIM($1))
       AND LOWER(TRIM(l.type_specific_fields->>'destination')) = LOWER(TRIM($2))`,
    [originIsland, destinationIsland]
  );

  const now = new Date();
  let best = null;
  for (const row of result.rows) {
    const times = row.type_specific_fields?.departure_times;
    if (!Array.isArray(times)) continue;
    for (const time of times) {
      const departure = nextOccurrence(time, now);
      if (!departure) continue;
      if (!best || departure < best.departure) {
        best = {
          departure,
          listing_id: row.listing_id,
          business_id: row.business_id,
          boat_name: row.business_name,
          listing_title: row.title,
        };
      }
    }
  }
  return best;
}
