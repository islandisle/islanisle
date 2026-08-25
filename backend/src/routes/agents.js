// Agent account type — script Section 12's Agent/AgentBooking/AgentCommission
// tables existed in schema.sql with no route at all. Scoped to a working
// MVP per explicit direction: the core "check availability, connect to a
// business, book on behalf of a tourist/local, track commission" flow.
// Deferred (flagged honestly, not silently skipped):
//   - Business-side approval of an agent connection. agent_connected_businesses
//     has no status column (just an (agent_id, business_id) pair), so this
//     treats a connection as agent-initiated and immediate once the agent
//     itself is approved — no business-side accept/reject step yet.
//   - Promo codes and the 'online' Stripe path for agent-made bookings —
//     agent bookings always go through the same 'pay_at_visit' path
//     bookings.js's own frontend already exclusively uses, for the same
//     reason (Stripe Elements isn't wired up). The real `bookings` row and
//     its capacity/commission rules are identical either way — this reuses
//     that table and those rules, just not bookings.js's promo/Stripe code.
//   - Commission payout — agent_commissions rows are created (status
//     'held_in_escrow') when the resulting booking completes, but nothing
//     pays them out yet; that's the same shape of gap payoutRun.js filled
//     for businesses, not extended to agents here.

import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

const BUSINESS_COMMISSION_RATE = 0.01;
const CAPACITY_FIELD_BY_TYPE = {
  restaurant: 'table_capacity',
  excursion: 'capacity_per_slot',
  speedboat: 'seat_capacity',
};

function round2(n) {
  return Math.round(n * 100) / 100;
}

function getSlotCapacity(businessType, typeSpecificFields) {
  const fieldName = CAPACITY_FIELD_BY_TYPE[businessType];
  if (!fieldName) return 1;
  const parsed = Number(typeSpecificFields?.[fieldName]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * POST /api/agents/signup
 * body: { name, contact_email, password }
 * Goes to approval_status = 'pending', same as a business — no separate
 * admin queue was built for this pass; an admin can approve directly via
 * `UPDATE agents SET approval_status = 'approved'` until that's added.
 */
router.post('/signup', async (req, res) => {
  const { name, contact_email, password } = req.body;
  if (!name || !contact_email || !password) {
    return res.status(400).json({ error: 'name, contact_email, and password are required.' });
  }
  const existing = await query('SELECT id FROM agents WHERE contact_email = $1', [contact_email]);
  if (existing.rows.length) {
    return res.status(409).json({ error: 'An agent account with that email already exists.' });
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await query(
    `INSERT INTO agents (name, contact_email, password_hash)
     VALUES ($1, $2, $3) RETURNING id, name, contact_email, approval_status, account_status`,
    [name, contact_email, passwordHash]
  );
  res.status(201).json({
    agent: result.rows[0],
    message: 'Account created — pending approval before you can connect to businesses or make bookings.',
  });
});

/**
 * POST /api/agents/login
 */
router.post('/login', async (req, res) => {
  const { contact_email, password } = req.body;
  const result = await query('SELECT * FROM agents WHERE contact_email = $1', [contact_email]);
  if (!result.rows.length) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }
  const agent = result.rows[0];
  const valid = await bcrypt.compare(password, agent.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }
  if (agent.account_status !== 'active') {
    return res.status(403).json({ error: 'This agent account is suspended.' });
  }
  const token = jwt.sign({ id: agent.id, role: 'agent' }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.json({
    token,
    agent: { id: agent.id, name: agent.name, approval_status: agent.approval_status },
  });
});

/**
 * POST /api/agents/connect
 * body: { business_id } — see file header re: no business-side approval yet.
 */
router.post('/connect', authenticate, requireRole('agent'), async (req, res) => {
  const { business_id } = req.body;
  if (!business_id) {
    return res.status(400).json({ error: 'business_id is required.' });
  }
  const agentResult = await query('SELECT approval_status FROM agents WHERE id = $1', [req.user.id]);
  if (agentResult.rows[0]?.approval_status !== 'approved') {
    return res.status(403).json({ error: 'Your agent account must be approved before connecting to businesses.' });
  }
  const businessResult = await query('SELECT id, name FROM businesses WHERE id = $1', [business_id]);
  if (!businessResult.rows.length) {
    return res.status(404).json({ error: 'Business not found.' });
  }
  await query(
    `INSERT INTO agent_connected_businesses (agent_id, business_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [req.user.id, business_id]
  );
  res.status(201).json({ business: businessResult.rows[0], message: 'Connected.' });
});

/**
 * GET /api/agents/businesses
 * The agent's connected businesses, each with its bookable listings.
 */
router.get('/businesses', authenticate, requireRole('agent'), async (req, res) => {
  const businessesResult = await query(
    `SELECT b.id, b.name, b.type, b.location_island
     FROM agent_connected_businesses acb
     JOIN businesses b ON b.id = acb.business_id
     WHERE acb.agent_id = $1
     ORDER BY b.name`,
    [req.user.id]
  );
  const businesses = businessesResult.rows;
  if (businesses.length) {
    const listingsResult = await query(
      `SELECT id, business_id, title, tourist_price, local_price, type_specific_fields
       FROM listings WHERE business_id = ANY($1::uuid[]) AND approval_status = 'approved'`,
      [businesses.map((b) => b.id)]
    );
    const byBusiness = {};
    for (const l of listingsResult.rows) {
      (byBusiness[l.business_id] ??= []).push(l);
    }
    for (const b of businesses) {
      b.listings = byBusiness[b.id] || [];
    }
  }
  res.json({ businesses });
});

/**
 * GET /api/agents/availability?listing_id=&slot_start=
 * Preview before booking — same capacity rule bookings.js's POST / enforces
 * for real at creation time (see CAPACITY_FIELD_BY_TYPE above).
 */
router.get('/availability', authenticate, requireRole('agent'), async (req, res) => {
  const { listing_id, slot_start } = req.query;
  if (!listing_id || !slot_start) {
    return res.status(400).json({ error: 'listing_id and slot_start are required.' });
  }
  const listingResult = await query(
    `SELECT l.type_specific_fields, b.type AS business_type
     FROM listings l JOIN businesses b ON b.id = l.business_id
     WHERE l.id = $1 AND l.approval_status = 'approved'`,
    [listing_id]
  );
  if (!listingResult.rows.length) {
    return res.status(404).json({ error: 'Listing not found.' });
  }
  const { type_specific_fields, business_type } = listingResult.rows[0];
  const capacity = getSlotCapacity(business_type, type_specific_fields);
  const countResult = await query(
    `SELECT COUNT(*)::int AS count FROM bookings WHERE listing_id = $1 AND slot_start = $2 AND status = 'confirmed'`,
    [listing_id, slot_start]
  );
  const taken = countResult.rows[0].count;
  res.json({ available: taken < capacity, capacity, taken, capacity_remaining: Math.max(0, capacity - taken) });
});

/**
 * POST /api/agents/bookings
 * Books on behalf of a tourist/local — an existing account (guest_user_id)
 * or a plain name with no account yet (guest_name), per
 * agent_booking_guests. body: { business_id, listing_id, slot_start,
 * slot_end?, guest_user_id?, guest_name?, commission_rate }
 */
router.post('/bookings', authenticate, requireRole('agent'), async (req, res) => {
  const { business_id, listing_id, slot_start, slot_end, guest_user_id, guest_name, commission_rate } = req.body;
  if (!business_id || !listing_id || !slot_start || (!guest_user_id && !guest_name)) {
    return res.status(400).json({ error: 'business_id, listing_id, slot_start, and a guest (guest_user_id or guest_name) are required.' });
  }

  const connectedCheck = await query(
    'SELECT 1 FROM agent_connected_businesses WHERE agent_id = $1 AND business_id = $2',
    [req.user.id, business_id]
  );
  if (!connectedCheck.rows.length) {
    return res.status(403).json({ error: 'You are not connected to this business.' });
  }

  const listingResult = await query(
    `SELECT l.tourist_price, l.approval_status, l.type_specific_fields, b.type AS business_type
     FROM listings l JOIN businesses b ON b.id = l.business_id
     WHERE l.id = $1 AND l.business_id = $2`,
    [listing_id, business_id]
  );
  if (!listingResult.rows.length || listingResult.rows[0].approval_status !== 'approved') {
    return res.status(404).json({ error: 'Listing not found or not currently bookable.' });
  }
  const listing = listingResult.rows[0];

  const capacity = getSlotCapacity(listing.business_type, listing.type_specific_fields);
  const existingCount = await query(
    `SELECT COUNT(*)::int AS count FROM bookings WHERE listing_id = $1 AND slot_start = $2 AND status = 'confirmed'`,
    [listing_id, slot_start]
  );
  if (existingCount.rows[0].count >= capacity) {
    return res.status(409).json({ error: 'That slot was just taken. Please pick another.' });
  }

  // Agent bookings settle pay_at_visit, same path bookings.js's own
  // frontend already exclusively uses — see file header.
  const basePrice = Number(listing.tourist_price);
  const businessCommission = round2(basePrice * BUSINESS_COMMISSION_RATE);

  const bookingResult = await query(
    `INSERT INTO bookings (
       listing_id, user_id, slot_start, slot_end, base_price, payer_type, payment_method,
       business_commission, tourist_commission_applicable, tourist_commission, price_charged,
       status, escrow_status
     ) VALUES ($1,$2,$3,$4,$5,'tourist','pay_at_visit',$6,false,0,$5,'confirmed','not_applicable')
     RETURNING id, base_price, price_charged, status`,
    [listing_id, guest_user_id || req.user.id, slot_start, slot_end || null, basePrice, businessCommission]
  );
  const booking = bookingResult.rows[0];
  // guest_user_id is nullable on bookings.user_id's real-world intent but
  // NOT NULL in schema — when there's no account yet, the booking is
  // attributed to the agent itself and the real guest is recorded via
  // agent_booking_guests.plain_name below, so front-desk/check-in still has
  // a name to work from even with no user row.

  const commissionRateNum = commission_rate != null ? Number(commission_rate) : 0;
  const commissionAmount = round2(basePrice * (commissionRateNum / 100));

  const agentBookingResult = await query(
    `INSERT INTO agent_bookings (agent_id, business_id, listing_id, commission_rate, commission_amount, resulting_booking_id, status)
     VALUES ($1,$2,$3,$4,$5,$6,'confirmed')
     RETURNING id, commission_rate, commission_amount, status`,
    [req.user.id, business_id, listing_id, commissionRateNum, commissionAmount, booking.id]
  );
  const agentBooking = agentBookingResult.rows[0];

  await query(
    `INSERT INTO agent_booking_guests (agent_booking_id, user_id, plain_name) VALUES ($1, $2, $3)`,
    [agentBooking.id, guest_user_id || null, guest_user_id ? null : guest_name]
  );

  res.status(201).json({
    booking,
    agent_booking: agentBooking,
    message: 'Booking confirmed on behalf of your guest.',
  });
});

/**
 * GET /api/agents/bookings/mine
 */
router.get('/bookings/mine', authenticate, requireRole('agent'), async (req, res) => {
  const result = await query(
    `SELECT ab.id, ab.status, ab.commission_rate, ab.commission_amount, ab.created_at,
            b.name AS business_name, l.title AS listing_title,
            bk.slot_start, bk.status AS booking_status,
            g.plain_name AS guest_name, u.name AS guest_account_name
     FROM agent_bookings ab
     JOIN businesses b ON b.id = ab.business_id
     JOIN listings l ON l.id = ab.listing_id
     LEFT JOIN bookings bk ON bk.id = ab.resulting_booking_id
     LEFT JOIN agent_booking_guests g ON g.agent_booking_id = ab.id
     LEFT JOIN users u ON u.id = g.user_id
     WHERE ab.agent_id = $1
     ORDER BY ab.created_at DESC`,
    [req.user.id]
  );
  res.json({ agent_bookings: result.rows });
});

/**
 * GET /api/agents/commissions/mine
 */
router.get('/commissions/mine', authenticate, requireRole('agent'), async (req, res) => {
  const result = await query(
    `SELECT ac.id, ac.amount, ac.schedule_date, ac.status, b.name AS business_name
     FROM agent_commissions ac
     JOIN agent_bookings ab ON ab.id = ac.agent_booking_id
     JOIN businesses b ON b.id = ab.business_id
     WHERE ac.agent_id = $1
     ORDER BY ac.schedule_date DESC NULLS LAST`,
    [req.user.id]
  );
  res.json({ commissions: result.rows });
});

export default router;
