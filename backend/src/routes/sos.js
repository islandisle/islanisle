// SOS/panic button — script Section 8.3.
// Emergency contacts per island (Section 6.2) are Phase 2 data — for now
// this logs the alert and notifies Super Admin immediately, which is the
// MVP-critical part (someone needs to know right away). A static contacts
// lookup can be layered in once the Section 6.2 emergency-contacts data exists.

import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { notify } from '../services/notifications.js';

const router = Router();

/**
 * POST /api/sos
 * body: { latitude, longitude, island? }
 */
router.post('/', authenticate, async (req, res) => {
  const { latitude, longitude, island } = req.body;

  const result = await query(
    `INSERT INTO sos_alerts (user_id, latitude, longitude, island)
     VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
    [req.user.id, latitude || null, longitude || null, island || null]
  );

  // Notify every active admin — an SOS is urgent enough to broadcast rather
  // than route through the normal approval-queue-style single assignment.
  const admins = await query(`SELECT id FROM admin_users WHERE status = 'active'`);
  for (const admin of admins.rows) {
    await notify({
      recipientType: 'admin',
      recipientId: admin.id,
      type: 'sos',
      title: 'SOS alert',
      body: `A user has triggered an SOS alert${island ? ` on ${island}` : ''}.`,
    });
  }

  res.status(201).json({
    alert: result.rows[0],
    message: 'Alert sent. Stay where you are if it is safe to do so.',
  });
});

router.post('/:id/resolve', authenticate, async (req, res) => {
  await query(`UPDATE sos_alerts SET status = 'resolved', resolved_at = now() WHERE id = $1`, [req.params.id]);
  res.json({ status: 'resolved' });
});

export default router;
