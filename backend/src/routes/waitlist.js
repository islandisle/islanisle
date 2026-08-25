// Waitlist — Phase 2. The waitlist table existed in schema.sql with no
// route. A tourist joins the waitlist for a listing/slot that's fully
// booked; when a booking on that exact listing+slot is later cancelled
// (see bookings.js's PATCH /:id/cancel), everyone still 'waiting' on it
// gets notified via the existing notification system and flips to
// 'notified' — first-come-first-served isn't enforced beyond that; the
// slot itself still has to be booked normally like anyone else's.

import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/waitlist
 * body: { listing_id, requested_slot }
 */
router.post('/', authenticate, async (req, res) => {
  const { listing_id, requested_slot } = req.body;
  if (!listing_id || !requested_slot) {
    return res.status(400).json({ error: 'listing_id and requested_slot are required.' });
  }

  const listingResult = await query('SELECT id FROM listings WHERE id = $1', [listing_id]);
  if (!listingResult.rows.length) {
    return res.status(404).json({ error: 'Listing not found.' });
  }

  const existing = await query(
    `SELECT id FROM waitlist
     WHERE listing_id = $1 AND user_id = $2 AND requested_slot = $3 AND status = 'waiting'`,
    [listing_id, req.user.id, requested_slot]
  );
  if (existing.rows.length) {
    return res.status(409).json({ error: "You're already on the waitlist for this slot." });
  }

  const result = await query(
    `INSERT INTO waitlist (listing_id, user_id, requested_slot, status)
     VALUES ($1, $2, $3, 'waiting')
     RETURNING id, listing_id, requested_slot, status`,
    [listing_id, req.user.id, requested_slot]
  );

  res.status(201).json({
    waitlist_entry: result.rows[0],
    message: "You're on the waitlist — we'll notify you if a spot opens up.",
  });
});

/**
 * GET /api/waitlist/mine
 */
router.get('/mine', authenticate, async (req, res) => {
  const result = await query(
    `SELECT w.id, w.requested_slot, w.status, l.title, biz.name AS business_name
     FROM waitlist w
     JOIN listings l ON l.id = w.listing_id
     JOIN businesses biz ON biz.id = l.business_id
     WHERE w.user_id = $1
     ORDER BY w.requested_slot DESC`,
    [req.user.id]
  );
  res.json({ waitlist: result.rows });
});

export default router;
