// Legal & Compliance — script Section 7.5.

import { Router } from 'express';
import bcrypt from 'bcrypt';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.get('/terms', (req, res) => {
  res.json({
    terms_of_service_url: 'https://atollisle.example/legal/terms',
    business_listing_agreement_url: 'https://atollisle.example/legal/business-agreement',
    privacy_notice_url: 'https://atollisle.example/legal/privacy',
    note: 'Placeholder URLs — replace with the real published legal documents before launch.',
  });
});

/**
 * GET /api/account/export
 * Section 7.5: every account can export their own data.
 */
router.get('/account/export', authenticate, async (req, res) => {
  const [user, bookings, orders, messages] = await Promise.all([
    query('SELECT id, name, contact_email, contact_mobile, type, created_at FROM users WHERE id = $1', [req.user.id]),
    query('SELECT id, slot_start, status, price_charged FROM bookings WHERE user_id = $1', [req.user.id]),
    query('SELECT id, status, price_charged FROM orders WHERE user_id = $1', [req.user.id]),
    query(`SELECT thread_key, text, created_at FROM messages WHERE sender_id = $1`, [req.user.id]),
  ]);

  res.json({
    exported_at: new Date().toISOString(),
    profile: user.rows[0],
    bookings: bookings.rows,
    orders: orders.rows,
    messages: messages.rows,
  });
});

/**
 * POST /api/account/delete
 * body: { password, confirmation: 'DELETE' }
 * Section 7.5: irreversible, so requires typing DELETE and re-entering the
 * password — matches the confirmation popup the frontend shows before
 * calling this at all.
 */
router.post('/account/delete', authenticate, async (req, res) => {
  const { password, confirmation } = req.body;
  if (confirmation !== 'DELETE') {
    return res.status(400).json({ error: 'Type DELETE to confirm account deletion.' });
  }

  const userResult = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!userResult.rows.length) {
    return res.status(404).json({ error: 'User not found.' });
  }
  const valid = await bcrypt.compare(password, userResult.rows[0].password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }

  // Anonymize rather than hard-delete rows that other tables' foreign keys
  // depend on (bookings/invoices need to remain for the business's own
  // records) — replace identifying fields, keep the row shell.
  await query(
    `UPDATE users SET
       name = 'Deleted User', contact_email = NULL, contact_mobile = 'deleted',
       document_image_url = NULL, document_number = NULL, password_hash = 'deleted'
     WHERE id = $1`,
    [req.user.id]
  );

  res.json({ status: 'deleted' });
});

export default router;
