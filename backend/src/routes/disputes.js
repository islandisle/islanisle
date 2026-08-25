// "Report a problem" — script Section 7.1.
// The admin-side queue/resolution lives in admin.js (Section 10.3); this is
// the user/business-facing side that actually creates a Dispute record.

import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/disputes
 * body: { booking_id? , order_id?, reason, description?, photos?, business_id? }
 * One of booking_id/order_id is required. business_id is optional — pass it
 * when a business owner is filing this on behalf of their business (e.g.
 * frontend-business's "Report a problem"), not as themselves as a tourist;
 * the caller must actually own that business. Without it, this defaults to
 * the previous behavior: raised_by 'user', raised_by_id the caller's own
 * users.id — correct for every tourist-initiated dispute, which is most of
 * them, so that default stays unchanged.
 */
router.post('/', authenticate, async (req, res) => {
  const { booking_id, order_id, reason, description, photos, business_id } = req.body;

  if (!booking_id && !order_id) {
    return res.status(400).json({ error: 'booking_id or order_id is required.' });
  }
  if (!reason) {
    return res.status(400).json({ error: 'A reason is required.' });
  }

  let raisedBy = 'user';
  let raisedById = req.user.id;
  if (business_id) {
    const ownerCheck = await query('SELECT owner_user_id FROM businesses WHERE id = $1', [business_id]);
    if (!ownerCheck.rows.length || ownerCheck.rows[0].owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'You do not manage this business.' });
    }
    raisedBy = 'business';
    raisedById = business_id;
  }

  const result = await query(
    `INSERT INTO disputes (booking_id, order_id, raised_by, raised_by_id, reason, description, photos, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'open')
     RETURNING id, status, created_at`,
    [booking_id || null, order_id || null, raisedBy, raisedById, reason, description || null, photos || []]
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
        OR (d.raised_by = 'business' AND d.raised_by_id IN (SELECT id FROM businesses WHERE owner_user_id = $1))
     ORDER BY d.created_at DESC`,
    [req.user.id]
  );
  res.json({ disputes: result.rows });
});

export default router;
