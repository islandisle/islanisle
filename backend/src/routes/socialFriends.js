// "Go Social" — friend search + requests + friendships (stage 3).
//
// Symmetric friendship (accept/decline, not follow). Friendship is what
// gates whose posts/stories show in your feed (stage 2/4) and who can DM
// you (stage 5).

import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { notify } from '../services/notifications.js';
import { friendIds, createFriendship, removeFriendship } from '../services/social.js';

const router = Router();

/**
 * GET /api/social/friends/search?q=<text>
 * Users whose name matches, annotated with the caller's relationship to
 * each: 'none' | 'friends' | 'request_sent' | 'request_received'.
 */
router.get('/friends/search', authenticate, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json({ results: [] });

  const usersResult = await query(
    `SELECT u.id, u.name, sp.avatar_url
     FROM users u
     LEFT JOIN social_profiles sp ON sp.user_id = u.id
     WHERE u.id <> $1 AND u.name ILIKE $2
     ORDER BY u.name ASC
     LIMIT 20`,
    [req.user.id, `%${q}%`]
  );

  const ids = usersResult.rows.map((r) => r.id);
  const [myFriends, pending] = await Promise.all([
    friendIds(req.user.id),
    ids.length
      ? query(
          `SELECT from_user_id, to_user_id FROM social_friend_requests
           WHERE status = 'pending'
             AND ((from_user_id = $1 AND to_user_id = ANY($2::uuid[]))
               OR (to_user_id = $1 AND from_user_id = ANY($2::uuid[])))`,
          [req.user.id, ids]
        )
      : { rows: [] },
  ]);

  const friendSet = new Set(myFriends);
  const sentTo = new Set(pending.rows.filter((r) => r.from_user_id === req.user.id).map((r) => r.to_user_id));
  const receivedFrom = new Set(pending.rows.filter((r) => r.to_user_id === req.user.id).map((r) => r.from_user_id));

  const results = usersResult.rows.map((u) => ({
    user_id: u.id,
    name: u.name,
    avatar_url: u.avatar_url,
    relationship: friendSet.has(u.id)
      ? 'friends'
      : sentTo.has(u.id)
        ? 'request_sent'
        : receivedFrom.has(u.id)
          ? 'request_received'
          : 'none',
  }));
  res.json({ results });
});

/**
 * POST /api/social/friends/requests  body: { to_user_id }
 * If the other person already has a pending request to you, this accepts it
 * instead of creating a mirror request.
 */
router.post('/friends/requests', authenticate, async (req, res) => {
  const toUserId = req.body.to_user_id;
  if (!toUserId) return res.status(400).json({ error: 'to_user_id is required.' });
  if (toUserId === req.user.id) return res.status(400).json({ error: 'You cannot friend yourself.' });

  const target = await query('SELECT id, name FROM users WHERE id = $1', [toUserId]);
  if (!target.rows.length) return res.status(404).json({ error: 'User not found.' });

  if ((await friendIds(req.user.id)).includes(toUserId)) {
    return res.status(409).json({ error: 'You are already friends.' });
  }

  // Their pending request to me → accept it.
  const theirs = await query(
    `SELECT id FROM social_friend_requests
     WHERE from_user_id = $1 AND to_user_id = $2 AND status = 'pending'`,
    [toUserId, req.user.id]
  );
  if (theirs.rows.length) {
    await query(
      `UPDATE social_friend_requests SET status = 'accepted', responded_at = now() WHERE id = $1`,
      [theirs.rows[0].id]
    );
    await createFriendship(req.user.id, toUserId);
    await notify({
      recipientType: 'user', recipientId: toUserId, type: 'social_friend_request',
      title: 'Friend request accepted', body: 'You are now friends on Go Social.',
    });
    return res.status(200).json({ status: 'accepted' });
  }

  // Upsert my request (re-send after a previous decline is allowed).
  const me = await query('SELECT name FROM users WHERE id = $1', [req.user.id]);
  await query(
    `INSERT INTO social_friend_requests (from_user_id, to_user_id, status)
     VALUES ($1, $2, 'pending')
     ON CONFLICT (from_user_id, to_user_id)
     DO UPDATE SET status = 'pending', created_at = now(), responded_at = NULL`,
    [req.user.id, toUserId]
  );
  await notify({
    recipientType: 'user', recipientId: toUserId, type: 'social_friend_request',
    title: 'New friend request', body: `${me.rows[0].name} wants to connect on Go Social.`,
  });
  res.status(201).json({ status: 'pending' });
});

/** GET /api/social/friends/requests/incoming — pending requests sent TO me. */
router.get('/friends/requests/incoming', authenticate, async (req, res) => {
  const result = await query(
    `SELECT r.id, r.from_user_id, r.created_at, u.name, sp.avatar_url
     FROM social_friend_requests r
     JOIN users u ON u.id = r.from_user_id
     LEFT JOIN social_profiles sp ON sp.user_id = r.from_user_id
     WHERE r.to_user_id = $1 AND r.status = 'pending'
     ORDER BY r.created_at DESC`,
    [req.user.id]
  );
  res.json({ requests: result.rows });
});

/** GET /api/social/friends/requests/count — for the menu/tab badge. */
router.get('/friends/requests/count', authenticate, async (req, res) => {
  const result = await query(
    `SELECT COUNT(*)::int AS n FROM social_friend_requests WHERE to_user_id = $1 AND status = 'pending'`,
    [req.user.id]
  );
  res.json({ count: result.rows[0].n });
});

router.post('/friends/requests/:id/accept', authenticate, async (req, res) => {
  const reqRow = await query(
    `SELECT id, from_user_id, to_user_id FROM social_friend_requests
     WHERE id = $1 AND to_user_id = $2 AND status = 'pending'`,
    [req.params.id, req.user.id]
  );
  if (!reqRow.rows.length) return res.status(404).json({ error: 'Request not found.' });

  await query(
    `UPDATE social_friend_requests SET status = 'accepted', responded_at = now() WHERE id = $1`,
    [req.params.id]
  );
  await createFriendship(reqRow.rows[0].from_user_id, reqRow.rows[0].to_user_id);

  const me = await query('SELECT name FROM users WHERE id = $1', [req.user.id]);
  await notify({
    recipientType: 'user', recipientId: reqRow.rows[0].from_user_id, type: 'social_friend_request',
    title: 'Friend request accepted', body: `${me.rows[0].name} accepted your friend request.`,
  });
  res.json({ status: 'accepted' });
});

router.post('/friends/requests/:id/decline', authenticate, async (req, res) => {
  const result = await query(
    `UPDATE social_friend_requests SET status = 'declined', responded_at = now()
     WHERE id = $1 AND to_user_id = $2 AND status = 'pending' RETURNING id`,
    [req.params.id, req.user.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Request not found.' });
  res.json({ status: 'declined' });
});

/** GET /api/social/friends — my friends. */
router.get('/friends', authenticate, async (req, res) => {
  const ids = await friendIds(req.user.id);
  if (!ids.length) return res.json({ friends: [] });
  const result = await query(
    `SELECT u.id AS user_id, u.name, sp.avatar_url
     FROM users u
     LEFT JOIN social_profiles sp ON sp.user_id = u.id
     WHERE u.id = ANY($1::uuid[])
     ORDER BY u.name ASC`,
    [ids]
  );
  res.json({ friends: result.rows });
});

/** DELETE /api/social/friends/:userId — unfriend. */
router.delete('/friends/:userId', authenticate, async (req, res) => {
  await removeFriendship(req.user.id, req.params.userId);
  // Drop any old request rows both ways so either side can re-request later.
  await query(
    `DELETE FROM social_friend_requests
     WHERE (from_user_id = $1 AND to_user_id = $2) OR (from_user_id = $2 AND to_user_id = $1)`,
    [req.user.id, req.params.userId]
  );
  res.json({ removed: true });
});

export default router;
