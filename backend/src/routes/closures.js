// Business closures — script Section 8.4. The `closures` table existed in
// schema.sql with no route at all. "The listing stays visible but is shown
// as closed with the stated reason rather than being hidden" — so this is
// deliberately just a date-range + reason record, checked defensively at
// booking time (bookings.js's POST /) rather than a hide/unhide toggle.

import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

async function requireBusinessOwner(req, res, next) {
  const result = await query('SELECT owner_user_id FROM businesses WHERE id = $1', [req.params.businessId]);
  if (!result.rows.length) return res.status(404).json({ error: 'Business not found.' });
  if (result.rows[0].owner_user_id !== req.user.id) return res.status(403).json({ error: 'You do not manage this business.' });
  next();
}

/**
 * POST /api/business/:businessId/closures
 * body: { start_date, end_date, reason }
 */
router.post('/:businessId/closures', authenticate, requireBusinessOwner, async (req, res) => {
  const { start_date, end_date, reason } = req.body;
  if (!start_date || !end_date || !reason) {
    return res.status(400).json({ error: 'start_date, end_date, and reason are required.' });
  }
  if (new Date(start_date) > new Date(end_date)) {
    return res.status(400).json({ error: 'start_date must be on or before end_date.' });
  }

  const result = await query(
    `INSERT INTO closures (business_id, start_date, end_date, reason)
     VALUES ($1, $2, $3, $4)
     RETURNING id, start_date, end_date, reason`,
    [req.params.businessId, start_date, end_date, reason]
  );
  res.status(201).json({ closure: result.rows[0] });
});

/**
 * GET /api/business/:businessId/closures
 * Public — a tourist viewing a listing needs to see this too, not just the
 * owner (see ListingDetail.jsx).
 */
router.get('/:businessId/closures', async (req, res) => {
  const result = await query(
    `SELECT id, start_date, end_date, reason FROM closures
     WHERE business_id = $1 AND end_date >= CURRENT_DATE
     ORDER BY start_date ASC`,
    [req.params.businessId]
  );
  res.json({ closures: result.rows });
});

/**
 * DELETE /api/business/:businessId/closures/:id
 * Ending a closure early — e.g. maintenance finished ahead of schedule.
 */
router.delete('/:businessId/closures/:id', authenticate, requireBusinessOwner, async (req, res) => {
  await query('DELETE FROM closures WHERE id = $1 AND business_id = $2', [req.params.id, req.params.businessId]);
  res.json({ status: 'removed' });
});

export default router;
