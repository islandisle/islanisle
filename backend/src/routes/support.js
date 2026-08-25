// Support tickets — the support_tickets / support_ticket_messages tables
// existed in schema.sql with no route at all. Basic CRUD only: open, list
// your own, view + reply, close. A ticket belongs to either a user or a
// business (chk_ticket_owner) — the admin-side list/queue lives in
// admin.js (same split as disputes.js/admin.js), but viewing, replying to,
// and closing one ticket are the same actions for the owner and for an
// admin, so those three routes are shared here.

import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Loads a ticket and checks the caller may act on it: the user who opened
// it, the owner of the business that opened it, or any admin. 404s (not
// 403) on a mismatch so a ticket's existence isn't leaked to a non-party.
async function loadTicketWithAccess(req, res) {
  const result = await query(
    `SELECT t.*, biz.owner_user_id AS business_owner_id
     FROM support_tickets t
     LEFT JOIN businesses biz ON biz.id = t.business_id
     WHERE t.id = $1`,
    [req.params.id]
  );
  if (!result.rows.length) {
    res.status(404).json({ error: 'Ticket not found.' });
    return null;
  }
  const ticket = result.rows[0];
  const isAdmin = req.user.role === 'admin';
  const isOwnerUser = ticket.user_id === req.user.id;
  const isOwnerBusiness = Boolean(ticket.business_id) && ticket.business_owner_id === req.user.id;
  if (!isAdmin && !isOwnerUser && !isOwnerBusiness) {
    res.status(404).json({ error: 'Ticket not found.' });
    return null;
  }
  return { ticket, isAdmin, isOwnerBusiness };
}

/**
 * POST /api/support/tickets
 * body: { business_id?, subject, message }
 * Opens as the caller's own user account, or — if business_id is given and
 * owned by the caller — as that business.
 */
router.post('/tickets', authenticate, async (req, res) => {
  const { business_id, subject, message } = req.body;
  if (!subject || !message) {
    return res.status(400).json({ error: 'subject and message are required.' });
  }

  let userId = req.user.id;
  let businessId = null;
  let sender = 'user';
  if (business_id) {
    const ownerCheck = await query(
      'SELECT id FROM businesses WHERE id = $1 AND owner_user_id = $2',
      [business_id, req.user.id]
    );
    if (!ownerCheck.rows.length) {
      return res.status(404).json({ error: 'Business not found for this account.' });
    }
    userId = null;
    businessId = business_id;
    sender = 'business';
  }

  const ticketResult = await query(
    `INSERT INTO support_tickets (user_id, business_id, subject, status)
     VALUES ($1, $2, $3, 'open')
     RETURNING id, subject, status, created_at`,
    [userId, businessId, subject]
  );
  const ticket = ticketResult.rows[0];

  await query(
    `INSERT INTO support_ticket_messages (ticket_id, sender, text) VALUES ($1, $2, $3)`,
    [ticket.id, sender, message]
  );

  res.status(201).json({ ticket, message: "We've received your message — we'll get back to you soon." });
});

/**
 * GET /api/support/tickets/mine?business_id=
 */
router.get('/tickets/mine', authenticate, async (req, res) => {
  const { business_id } = req.query;

  if (business_id) {
    const ownerCheck = await query(
      'SELECT id FROM businesses WHERE id = $1 AND owner_user_id = $2',
      [business_id, req.user.id]
    );
    if (!ownerCheck.rows.length) {
      return res.status(404).json({ error: 'Business not found for this account.' });
    }
    const result = await query(
      `SELECT id, subject, status, created_at FROM support_tickets WHERE business_id = $1 ORDER BY created_at DESC`,
      [business_id]
    );
    return res.json({ tickets: result.rows });
  }

  const result = await query(
    `SELECT id, subject, status, created_at FROM support_tickets WHERE user_id = $1 ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json({ tickets: result.rows });
});

/**
 * GET /api/support/tickets/:id
 * Full thread — owner (user or business) or admin.
 */
router.get('/tickets/:id', authenticate, async (req, res) => {
  const access = await loadTicketWithAccess(req, res);
  if (!access) return;

  const messagesResult = await query(
    `SELECT id, sender, text, created_at FROM support_ticket_messages WHERE ticket_id = $1 ORDER BY created_at ASC`,
    [req.params.id]
  );
  const { business_owner_id, ...ticket } = access.ticket;
  res.json({ ticket, messages: messagesResult.rows });
});

/**
 * POST /api/support/tickets/:id/messages
 * body: { text }
 */
router.post('/tickets/:id/messages', authenticate, async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'text is required.' });
  }

  const access = await loadTicketWithAccess(req, res);
  if (!access) return;
  if (access.ticket.status === 'closed') {
    return res.status(400).json({ error: 'This ticket is closed.' });
  }

  const sender = access.isAdmin ? 'admin' : access.isOwnerBusiness ? 'business' : 'user';
  const result = await query(
    `INSERT INTO support_ticket_messages (ticket_id, sender, text)
     VALUES ($1, $2, $3)
     RETURNING id, sender, text, created_at`,
    [req.params.id, sender, text]
  );

  if (access.isAdmin && !access.ticket.assigned_admin_id) {
    await query(`UPDATE support_tickets SET assigned_admin_id = $1 WHERE id = $2`, [req.user.id, req.params.id]);
  }

  res.status(201).json({ message: result.rows[0] });
});

/**
 * POST /api/support/tickets/:id/close
 */
router.post('/tickets/:id/close', authenticate, async (req, res) => {
  const access = await loadTicketWithAccess(req, res);
  if (!access) return;

  await query(`UPDATE support_tickets SET status = 'closed' WHERE id = $1`, [req.params.id]);
  res.json({ status: 'closed' });
});

export default router;
