// Local knowledge — events calendar (Batch 19). local_events existed
// nowhere before this; admin-managed, publicly readable (same "browse as
// guest" posture as listings.js/weather.js).

import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/events?island=<island>
 * Upcoming events (today or later), optionally scoped to one island —
 * always includes Maldives-wide events (island IS NULL) alongside any
 * island-specific ones, matched case/whitespace-insensitively like
 * listings.js's island browsing.
 */
router.get('/', async (req, res) => {
  const { island } = req.query;
  const params = [];

  let islandFilter = '';
  if (island) {
    params.push(island);
    islandFilter = `AND (island IS NULL OR LOWER(TRIM(island)) = LOWER(TRIM($${params.length})))`;
  }

  const result = await query(
    `SELECT id, island, title, description, event_date
     FROM local_events
     WHERE event_date >= CURRENT_DATE
     ${islandFilter}
     ORDER BY event_date ASC`,
    params
  );
  res.json({ events: result.rows });
});

/**
 * POST /api/events
 * body: { island?, title, description?, event_date }
 */
router.post('/', authenticate, requireRole('admin'), async (req, res) => {
  const { island, title, description, event_date } = req.body;
  if (!title || !event_date) {
    return res.status(400).json({ error: 'title and event_date are required.' });
  }
  const result = await query(
    `INSERT INTO local_events (island, title, description, event_date)
     VALUES ($1, $2, $3, $4) RETURNING id, island, title, description, event_date`,
    [island || null, title, description || null, event_date]
  );
  res.status(201).json({ event: result.rows[0] });
});

/**
 * DELETE /api/events/:id
 */
router.delete('/:id', authenticate, requireRole('admin'), async (req, res) => {
  await query('DELETE FROM local_events WHERE id = $1', [req.params.id]);
  res.json({ status: 'deleted' });
});

export default router;
