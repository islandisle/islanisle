// "Go Social" — shots (stage 4; formerly "stories"). A photo (+ optional
// text overlay) that shows in the feed's shot row for 12h, then disappears.
// Views are tracked and visible to the shot's owner only.

import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { friendIds, authorMap, isValidImageDataUri } from '../services/social.js';

const router = Router();

/** POST /api/social/shots  body: { image, caption? } */
router.post('/shots', authenticate, async (req, res) => {
  const { image, caption } = req.body;
  if (!isValidImageDataUri(image)) {
    return res.status(400).json({ error: 'A valid image (data URI, under 3 MB) is required.' });
  }
  if (caption !== undefined && caption !== null && typeof caption !== 'string') {
    return res.status(400).json({ error: 'caption must be a string.' });
  }
  if (typeof caption === 'string' && caption.length > 250) {
    return res.status(400).json({ error: 'caption must be 250 characters or fewer.' });
  }
  const result = await query(
    `INSERT INTO social_shots (user_id, image_url, caption) VALUES ($1, $2, $3)
     RETURNING id, created_at, expires_at`,
    [req.user.id, image, caption?.trim() || null]
  );
  res.status(201).json({ shot: result.rows[0] });
});

/**
 * GET /api/social/shots/feed
 * Active shots from self + friends, grouped by author. Authors with an
 * unseen shot come first, then most-recent first. Each author's shots
 * are oldest-first (viewing order).
 */
router.get('/shots/feed', authenticate, async (req, res) => {
  const authorIds = [req.user.id, ...(await friendIds(req.user.id))];
  const result = await query(
    `SELECT s.id, s.user_id, s.image_url, s.caption, s.created_at,
            EXISTS (SELECT 1 FROM social_shot_views v
                    WHERE v.shot_id = s.id AND v.viewer_user_id = $2) AS viewed
     FROM social_shots s
     WHERE s.user_id = ANY($1::uuid[]) AND s.expires_at > now()
     ORDER BY s.created_at ASC`,
    [authorIds, req.user.id]
  );

  const authors = await authorMap([req.user.id, ...result.rows.map((r) => r.user_id)]);
  const byUser = new Map();
  // Always include a self group (even with zero shots) so the frontend's
  // "Your shot" bubble can show the caller's real name + avatar.
  byUser.set(req.user.id, {
    user_id: req.user.id,
    name: authors[req.user.id]?.name || 'You',
    avatar_url: authors[req.user.id]?.avatar_url || null,
    is_self: true,
    shots: [],
  });
  for (const row of result.rows) {
    if (!byUser.has(row.user_id)) {
      byUser.set(row.user_id, {
        user_id: row.user_id,
        name: authors[row.user_id]?.name || 'Unknown',
        avatar_url: authors[row.user_id]?.avatar_url || null,
        is_self: row.user_id === req.user.id,
        shots: [],
      });
    }
    byUser.get(row.user_id).shots.push({
      id: row.id, image_url: row.image_url, caption: row.caption,
      created_at: row.created_at, viewed: row.viewed,
    });
  }

  const groups = [...byUser.values()].map((g) => ({
    ...g,
    // Your own shot never rings as "unseen" — that's an others-only cue.
    has_unseen: g.is_self ? false : g.shots.some((s) => !s.viewed),
    latest_at: g.shots.length ? g.shots[g.shots.length - 1].created_at : null,
  }));
  groups.sort((a, b) => {
    if (a.is_self !== b.is_self) return a.is_self ? -1 : 1; // your own first
    if (a.has_unseen !== b.has_unseen) return a.has_unseen ? -1 : 1;
    return new Date(b.latest_at || 0) - new Date(a.latest_at || 0);
  });

  res.json({ groups });
});

/** POST /api/social/shots/:id/view — record that the caller saw it. */
router.post('/shots/:id/view', authenticate, async (req, res) => {
  const shot = await query('SELECT user_id FROM social_shots WHERE id = $1', [req.params.id]);
  if (!shot.rows.length) return res.status(404).json({ error: 'Shot not found.' });
  if (shot.rows[0].user_id !== req.user.id) {
    await query(
      `INSERT INTO social_shot_views (shot_id, viewer_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.params.id, req.user.id]
    );
  }
  res.json({ viewed: true });
});

/** GET /api/social/shots/:id/viewers — owner only. */
router.get('/shots/:id/viewers', authenticate, async (req, res) => {
  const shot = await query('SELECT user_id FROM social_shots WHERE id = $1', [req.params.id]);
  if (!shot.rows.length) return res.status(404).json({ error: 'Shot not found.' });
  if (shot.rows[0].user_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the shot owner can see who viewed it.' });
  }
  const result = await query(
    `SELECT v.viewer_user_id AS user_id, v.viewed_at, u.name, sp.avatar_url
     FROM social_shot_views v
     JOIN users u ON u.id = v.viewer_user_id
     LEFT JOIN social_profiles sp ON sp.user_id = v.viewer_user_id
     WHERE v.shot_id = $1
     ORDER BY v.viewed_at DESC`,
    [req.params.id]
  );
  res.json({ viewers: result.rows });
});

/** DELETE /api/social/shots/:id — own only. */
router.delete('/shots/:id', authenticate, async (req, res) => {
  const result = await query(
    `DELETE FROM social_shots WHERE id = $1 AND user_id = $2 RETURNING id`,
    [req.params.id, req.user.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Shot not found for this account.' });
  res.json({ deleted: true });
});

export default router;
