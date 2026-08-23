// Section 9 — Document-upload gate.
// "An account can only book a room, table, excursion slot, ticket, or place
// any shop order if it has a document on file... The app enforces it again
// at every booking/checkout attempt as a defensive second gate."
//
// Signup already blocks account creation without a document (see auth.js),
// so this should rarely trigger — but it's applied to every booking/order
// route regardless, per the script's explicit "defensive second gate" rule.

import { query } from '../config/db.js';

export async function requireDocumentOnFile(req, res, next) {
  const userId = req.user?.id; // expects auth middleware to have set req.user
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  const result = await query(
    'SELECT document_image_url FROM users WHERE id = $1',
    [userId]
  );

  if (!result.rows.length || !result.rows[0].document_image_url) {
    return res.status(403).json({
      error: 'A document (passport or ID card) must be on file before you can book or transact.',
    });
  }

  next();
}
