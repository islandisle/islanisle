// "Go Social" — friend-to-friend direct messages (stage 5). A SEPARATE
// store from the `messages` table (business/agent/trip chat). DMs are
// friends-only.

import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { notify } from '../services/notifications.js';
import { areFriends, friendPair, getSocialUser } from '../services/social.js';

const router = Router();

const dmThreadKey = (a, b) => friendPair(a, b).join('|');

/** GET /api/social/dms — conversation list, most-recent first. */
router.get('/dms', authenticate, async (req, res) => {
  const result = await query(
    `SELECT DISTINCT ON (thread_key) thread_key, sender_id, recipient_id, text, created_at
     FROM social_dm_messages
     WHERE sender_id = $1 OR recipient_id = $1
     ORDER BY thread_key, created_at DESC`,
    [req.user.id]
  );

  const otherIds = result.rows.map((r) => (r.sender_id === req.user.id ? r.recipient_id : r.sender_id));
  const [people, unread] = await Promise.all([
    otherIds.length
      ? query(
          `SELECT u.id, u.name, sp.avatar_url FROM users u
           LEFT JOIN social_profiles sp ON sp.user_id = u.id
           WHERE u.id = ANY($1::uuid[])`,
          [otherIds]
        )
      : { rows: [] },
    query(
      `SELECT thread_key, COUNT(*)::int AS n FROM social_dm_messages
       WHERE recipient_id = $1 AND read_at IS NULL GROUP BY thread_key`,
      [req.user.id]
    ),
  ]);
  const personById = Object.fromEntries(people.rows.map((p) => [p.id, p]));
  const unreadByThread = Object.fromEntries(unread.rows.map((r) => [r.thread_key, r.n]));

  const threads = result.rows
    .map((r) => {
      const otherId = r.sender_id === req.user.id ? r.recipient_id : r.sender_id;
      const person = personById[otherId] || {};
      return {
        thread_key: r.thread_key,
        other_user_id: otherId,
        other_name: person.name || 'Unknown',
        other_avatar_url: person.avatar_url || null,
        last_text: r.text,
        last_from_me: r.sender_id === req.user.id,
        last_at: r.created_at,
        unread_count: unreadByThread[r.thread_key] || 0,
      };
    })
    .sort((a, b) => new Date(b.last_at) - new Date(a.last_at));

  res.json({ threads });
});

/** GET /api/social/dms/unread/count — total unread, for the tab badge. */
router.get('/dms/unread/count', authenticate, async (req, res) => {
  const result = await query(
    `SELECT COUNT(*)::int AS n FROM social_dm_messages WHERE recipient_id = $1 AND read_at IS NULL`,
    [req.user.id]
  );
  res.json({ count: result.rows[0].n });
});

/**
 * GET /api/social/dms/:userId — full thread with one friend. Marks the
 * caller's incoming messages in this thread as read.
 */
router.get('/dms/:userId', authenticate, async (req, res) => {
  const other = await getSocialUser(req.params.userId);
  if (!other) return res.status(404).json({ error: 'User not found.' });
  if (!(await areFriends(req.user.id, req.params.userId))) {
    return res.status(403).json({ error: 'You can only message friends.' });
  }
  const key = dmThreadKey(req.user.id, req.params.userId);

  await query(
    `UPDATE social_dm_messages SET read_at = now()
     WHERE thread_key = $1 AND recipient_id = $2 AND read_at IS NULL`,
    [key, req.user.id]
  );

  const result = await query(
    `SELECT id, sender_id, text, created_at, read_at FROM social_dm_messages
     WHERE thread_key = $1 ORDER BY created_at ASC`,
    [key]
  );
  res.json({
    other: { user_id: other.id, name: other.name },
    messages: result.rows.map((m) => ({ ...m, from_me: m.sender_id === req.user.id })),
  });
});

/** POST /api/social/dms/:userId  body: { text } */
router.post('/dms/:userId', authenticate, async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'A message cannot be empty.' });
  if (text.length > 2000) return res.status(400).json({ error: 'Message must be 2000 characters or fewer.' });

  if (req.params.userId === req.user.id) return res.status(400).json({ error: 'You cannot message yourself.' });
  if (!(await areFriends(req.user.id, req.params.userId))) {
    return res.status(403).json({ error: 'You can only message friends.' });
  }

  const key = dmThreadKey(req.user.id, req.params.userId);
  const result = await query(
    `INSERT INTO social_dm_messages (thread_key, sender_id, recipient_id, text)
     VALUES ($1, $2, $3, $4)
     RETURNING id, sender_id, text, created_at, read_at`,
    [key, req.user.id, req.params.userId, text.trim()]
  );

  const me = await getSocialUser(req.user.id);
  await notify({
    recipientType: 'user', recipientId: req.params.userId, type: 'social_dm',
    title: `New message from ${me.name}`, body: text.trim().slice(0, 120),
  });

  res.status(201).json({ message: { ...result.rows[0], from_me: true } });
});

export default router;
