// Agent discovery — the "invisible" commission-inclusive pricing, plus the
// shared agent_bookings insert both the tourist-direct and agent-initiated
// booking flows now use.
//
// When a tourist has an assigned agent (users.assigned_agent_id) AND that
// agent has an 'approved' agent_connected_businesses row for a given
// business, every tourist_price shown for that business — and the amount
// actually charged when the tourist books it directly — is marked up by
// that connection's commission_rate. No line item, no label: the markup
// IS the agent's commission, recorded via the same agent_bookings /
// agent_commissions machinery agents.js's own POST /bookings uses. A
// business the assigned agent has no approved connection with is
// unaffected, and there's no markup at all for an unauthenticated
// (browse-as-guest) request, or for local_price.
//
// Shop businesses are excluded: agent commission is tracked on
// agent_bookings.resulting_booking_id, which FKs to bookings(id), and a
// shop purchase is an orders row, not a booking — there's no path to
// credit an agent for one, so marking a shop price up (with no
// corresponding commission) would just be overcharging. Shopping-specialty
// agents can still be discovered/assigned/chatted; the pricing side of
// this feature is the bookings flow only.

import { query } from '../config/db.js';
import { round2 } from './refunds.js';

// The commission rate (percent) that applies until a business sets its own
// for a given agent (agent_connected_businesses.commission_rate). Kept
// here so agents.js and this file share one definition — see
// agent-commission-fix-brief.md, which first introduced it in agents.js.
export const DEFAULT_COMMISSION_RATE = 5;

function resolveRate(commissionRate) {
  return commissionRate != null ? Number(commissionRate) : DEFAULT_COMMISSION_RATE;
}

export function markupPrice(basePrice, rate) {
  return round2(Number(basePrice) * (1 + rate / 100));
}

/**
 * The one approved connection between `userId`'s assigned agent and
 * `businessId` (non-shop), as `{ agentId, rate }`, or null when there's no
 * user, no assigned agent, no approved connection, or the business is a shop.
 */
export async function getAgentConnection(userId, businessId) {
  if (!userId || !businessId) return null;
  const result = await query(
    `SELECT u.assigned_agent_id AS agent_id, acb.commission_rate
     FROM users u
     JOIN agent_connected_businesses acb
       ON acb.agent_id = u.assigned_agent_id AND acb.business_id = $2
     JOIN businesses b ON b.id = acb.business_id
     WHERE u.id = $1 AND acb.status = 'approved' AND b.type <> 'shop'`,
    [userId, businessId]
  );
  if (!result.rows.length) return null;
  return { agentId: result.rows[0].agent_id, rate: resolveRate(result.rows[0].commission_rate) };
}

/**
 * Map<businessId, { agentId, rate }> for every approved, non-shop
 * connection of `userId`'s assigned agent — so a list endpoint can mark up
 * many rows with a single query instead of one per row. Empty map when
 * there's no user or no assigned agent.
 */
export async function getAgentConnectionMap(userId) {
  const map = new Map();
  if (!userId) return map;
  const result = await query(
    `SELECT acb.business_id, acb.commission_rate, u.assigned_agent_id AS agent_id
     FROM users u
     JOIN agent_connected_businesses acb ON acb.agent_id = u.assigned_agent_id
     JOIN businesses b ON b.id = acb.business_id
     WHERE u.id = $1 AND acb.status = 'approved' AND b.type <> 'shop'`,
    [userId]
  );
  for (const row of result.rows) {
    map.set(row.business_id, { agentId: row.agent_id, rate: resolveRate(row.commission_rate) });
  }
  return map;
}

/**
 * The brief's named helper — mark one price up for one (user, business)
 * pair. Returns `basePrice` (as a rounded number) unchanged when no markup
 * applies.
 */
export async function applyAgentMarkup(basePrice, userId, businessId) {
  const conn = await getAgentConnection(userId, businessId);
  return conn ? markupPrice(basePrice, conn.rate) : round2(Number(basePrice));
}

/**
 * Marks up `priceField` on each row whose `businessIdField` has an approved
 * connection, using one `getAgentConnectionMap` query. Returns a new array;
 * rows without a connection are passed through untouched.
 */
export async function applyAgentMarkupToRows(rows, userId, { priceField = 'tourist_price', businessIdField = 'business_id' } = {}) {
  if (!Array.isArray(rows) || !rows.length) return rows;
  const map = await getAgentConnectionMap(userId);
  if (!map.size) return rows;
  return rows.map((row) => {
    const conn = map.get(row[businessIdField]);
    return conn ? { ...row, [priceField]: markupPrice(row[priceField], conn.rate) } : row;
  });
}

/**
 * Inserts the agent_bookings row that credits an agent for a booking —
 * shared by agents.js's POST /bookings (agent booked on a guest's behalf)
 * and bookings.js's POST / (tourist booked directly while having this
 * agent assigned). The caller inserts its own agent_booking_guests row
 * afterward (the guest shape differs between the two entry points).
 *
 * `exec` is a `(text, params) => Promise<{ rows }>` — pass the standalone
 * `query` from agents.js, or `(t, p) => client.query(t, p)` from inside
 * bookings.js's transaction. `rate` is optional: pass it if you already
 * resolved it (bookings.js does, so the markup and the commission can't
 * drift); omit it to look it up from agent_connected_businesses here.
 * `commission_amount` is always `round2(basePrice * rate / 100)` — on the
 * *base* price, matching the existing agent-initiated calculation.
 */
export async function recordAgentCommission(exec, { agentId, businessId, listingId, basePrice, resultingBookingId, rate }) {
  let resolvedRate = rate;
  if (resolvedRate == null) {
    const rateResult = await exec(
      'SELECT commission_rate FROM agent_connected_businesses WHERE agent_id = $1 AND business_id = $2',
      [agentId, businessId]
    );
    resolvedRate = resolveRate(rateResult.rows[0]?.commission_rate);
  }
  const commissionAmount = round2(Number(basePrice) * (resolvedRate / 100));
  const result = await exec(
    `INSERT INTO agent_bookings (agent_id, business_id, listing_id, commission_rate, commission_amount, resulting_booking_id, status)
     VALUES ($1,$2,$3,$4,$5,$6,'confirmed')
     RETURNING id, commission_rate, commission_amount, status`,
    [agentId, businessId, listingId, resolvedRate, commissionAmount, resultingBookingId]
  );
  return result.rows[0];
}
