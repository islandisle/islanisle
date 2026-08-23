// "Report a problem" — script Section 7.1.
// The admin-side queue/resolution lives in admin.js (Section 10.3); this is
// the user/business-facing side that actually creates a Dispute record.

import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/disputes
 * body: { booking_id? , order_id?, reason, description?, photos? }
 * One of booking_id/order_id is required.
 */
router.post('/', authenticate, async (req, res) => {
  const { booking_id, order_id, reason, description, photos } = req.body;

  if (!booking_id && !order_id) {
    return res.status(400).json({ error: 'booking_id or order_id is required.' });
  }
  if (!reason) {
    return res.status(400).json({ error: 'A reason is required.' });
  }

  const result = await query(
    `INSERT INTO disputes (booking_id, order_id, raised_by, reason, description, photos, status)
     VALUES ($1, $2, 'user', $3, $4, $5, 'open')
     RETURNING id, status, created_at`,
    [booking_id || null, order_id || null, reason, description || null, photos || []]
  );

  res.status(201).json({
    dispute: result.rows[0],
    message: "We've received your report. You'll hear back once it's reviewed.",
  });
});

/**
 * GET /api/disputes/mine
 * Lets the submitter track status from the same booking detail screen.
 */
router.get('/mine', authenticate, async (req, res) => {
  const result = await query(
    `SELECT d.id, d.reason, d.status, d.resolution, d.created_at
     FROM disputes d
     LEFT JOIN bookings b ON b.id = d.booking_id
     LEFT JOIN orders o ON o.id = d.order_id
     WHERE b.user_id = $1 OR o.user_id = $1
     ORDER BY d.created_at DESC`,
    [req.user.id]
  );
  res.json({ disputes: result.rows });
});

export default router;
