// Notification inbox — script Section 6.5's read side. The write side
// (services/notifications.js notify(), called from bookings.js, orders.js,
// payments.js, sos.js) already works; this is what lets a recipient
// actually see and dismiss what it wrote. Real push delivery is still a
// TODO stub in notifications.js — out of scope here.
//
// recipient_type is 'user' | 'business' | 'admin' (see schema.sql). A user
// token (req.user.id) only ever proves a 'user' identity directly — a
// business's notifications are reached by passing ?business_id=, which is
// then checked against businesses.owner_user_id the same way
// bookings.js's /business/:businessId does. Admin notifications (sos.js)
// aren't exposed here — no admin frontend read path was asked for.

import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Resolves the (recipient_type, recipient_id) this request is reading/
// updating notifications for, and 404s if a given business_id isn't owned
// by the caller. business_id may come from query (GET) or body (POST).
async function resolveScope(req, res, businessId) {
  if (!businessId) {
    return { recipientType: 'user', recipientId: req.user.id };
  }
  const ownerCheck = await query(
    'SELECT id FROM businesses WHERE id = $1 AND owner_user_id = $2',
    [businessId, req.user.id]
  );
  if (!ownerCheck.rows.length) {
    res.status(404).json({ error: 'Business not found for this account.' });
    return null;
  }
  return { recipientType: 'business', recipientId: businessId };
}

/**
 * GET /api/notifications?business_id=&page=&limit=
 * The caller's own notifications, newest first. Pass business_id (a
 * business the caller owns) to read that business's notifications instead
 * of the caller's own user notifications.
 */
router.get('/', authenticate, async (req, res) => {
  const scope = await resolveScope(req, res, req.query.business_id);
  if (!scope) return;

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const [rowsResult, statsResult] = await Promise.all([
    query(
      `SELECT id, type, title, body, read, created_at
       FROM notifications
       WHERE recipient_type = $1 AND recipient_id = $2
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [scope.recipientType, scope.recipientId, limit, offset]
    ),
    query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE NOT read)::int AS unread_count
       FROM notifications WHERE recipient_type = $1 AND recipient_id = $2`,
      [scope.recipientType, scope.recipientId]
    ),
  ]);

  res.json({
    notifications: rowsResult.rows,
    total: statsResult.rows[0].total,
    unread_count: statsResult.rows[0].unread_count,
    page,
    limit,
  });
});

/**
 * POST /api/notifications/:id/read
 * Marks one notification as read. Ownership is checked against the
 * notification's own recipient (not a business_id param) since the id
 * alone identifies which scope it belongs to.
 */
router.post('/:id/read', authenticate, async (req, res) => {
  const { id } = req.params;

  const notifResult = await query('SELECT id, recipient_type, recipient_id FROM notifications WHERE id = $1', [id]);
  if (!notifResult.rows.length) {
    return res.status(404).json({ error: 'Notification not found.' });
  }
  const notification = notifResult.rows[0];

  let owns = notification.recipient_type === 'user' && notification.recipient_id === req.user.id;
  if (!owns && notification.recipient_type === 'business') {
    const ownerCheck = await query(
      'SELECT id FROM businesses WHERE id = $1 AND owner_user_id = $2',
      [notification.recipient_id, req.user.id]
    );
    owns = ownerCheck.rows.length > 0;
  }
  if (!owns) {
    return res.status(404).json({ error: 'Notification not found.' });
  }

  const result = await query(
    'UPDATE notifications SET read = true WHERE id = $1 RETURNING id, type, title, body, read, created_at',
    [id]
  );
  res.json({ notification: result.rows[0] });
});

/**
 * POST /api/notifications/read-all
 * body: { business_id? } — same scope rule as GET /api/notifications.
 */
router.post('/read-all', authenticate, async (req, res) => {
  const scope = await resolveScope(req, res, req.body.business_id);
  if (!scope) return;

  const result = await query(
    `UPDATE notifications SET read = true
     WHERE recipient_type = $1 AND recipient_id = $2 AND read = false
     RETURNING id`,
    [scope.recipientType, scope.recipientId]
  );
  res.json({ marked_read: result.rows.length });
});

export default router;
