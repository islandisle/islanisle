// Guest lookup — script Sections 4.6 and 5.2: "look up a signed-up guest by
// username or mobile number." Batch 26 replaced the raw "type a user UUID"
// fields in the agent and B2B/guesthouse-transfer flows with a searchable
// picker; this is what backs it.
//
// Deliberately narrow, since it can enumerate accounts:
//   - only an agent, or a user account that owns at least one business,
//     may call it;
//   - the query must be at least 3 characters;
//   - name matches are prefix matches (ILIKE 'q%'), mobile matches are
//     exact — no fuzzy substring scan over every user;
//   - results are capped at 10 and never include a full mobile number or
//     email, just a 3-digit hint so two same-named guests are still
//     tellable apart.

import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.get('/lookup', authenticate, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 3) {
    return res.json({ users: [] });
  }

  let allowed = req.user.role === 'agent';
  if (!allowed && req.user.role === 'user') {
    const owns = await query('SELECT 1 FROM businesses WHERE owner_user_id = $1 LIMIT 1', [req.user.id]);
    allowed = owns.rows.length > 0;
  }
  if (!allowed) {
    return res.status(403).json({ error: 'Guest lookup is only available to agents and businesses.' });
  }

  const result = await query(
    `SELECT id, name, contact_mobile
     FROM users
     WHERE type IN ('tourist', 'local')
       AND (name ILIKE $1 OR contact_mobile = $2)
     ORDER BY name ASC
     LIMIT 10`,
    [`${q}%`, q]
  );

  res.json({
    users: result.rows.map((u) => ({
      id: u.id,
      name: u.name,
      mobile_hint: u.contact_mobile ? `••• ${u.contact_mobile.slice(-3)}` : null,
    })),
  });
});

export default router;
