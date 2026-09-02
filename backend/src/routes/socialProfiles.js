// "Go Social" — profiles (stage 1 of go-social-feature-brief.md).
//
// Every tourist/local has a social profile tied to their existing account
// (no separate signup). The display name comes from users.name; bio and
// avatar are the social-only, user-editable bits. Friend/post counts are
// filled in by later stages — this stage returns them as 0 so the frontend
// shape is stable.

import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { ensureSocialProfile, getSocialUser, isValidImageDataUri, friendIds } from '../services/social.js';

const router = Router();

// The viewer's relationship to the profile being viewed.
async function relationshipTo(viewerId, userId) {
  if (viewerId === userId) return 'self';
  if ((await friendIds(viewerId)).includes(userId)) return 'friends';
  try {
    const pending = await query(
      `SELECT from_user_id FROM social_friend_requests
       WHERE status = 'pending'
         AND ((from_user_id = $1 AND to_user_id = $2) OR (from_user_id = $2 AND to_user_id = $1))`,
      [viewerId, userId]
    );
    if (!pending.rows.length) return 'none';
    return pending.rows[0].from_user_id === viewerId ? 'request_sent' : 'request_received';
  } catch {
    return 'none';
  }
}

// Assembles the public-facing profile object for one user.
async function profilePayload(userId, viewerId) {
  const user = await getSocialUser(userId);
  if (!user) return null;
  const profile = await ensureSocialProfile(userId);

  const [friendCount, postCount, relationship] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS n FROM social_friendships
       WHERE user_id_a = $1 OR user_id_b = $1`,
      [userId]
    ).catch(() => ({ rows: [{ n: 0 }] })),
    query(`SELECT COUNT(*)::int AS n FROM social_posts WHERE user_id = $1`, [userId])
      .catch(() => ({ rows: [{ n: 0 }] })),
    relationshipTo(viewerId, userId),
  ]);

  return {
    user_id: userId,
    name: user.name,
    account_type: user.type,
    bio: profile.bio,
    avatar_url: profile.avatar_url,
    friend_count: friendCount.rows[0].n,
    post_count: postCount.rows[0].n,
    is_self: userId === viewerId,
    relationship,
  };
}

/** GET /api/social/profiles/me */
router.get('/profiles/me', authenticate, async (req, res) => {
  const payload = await profilePayload(req.user.id, req.user.id);
  if (!payload) return res.status(404).json({ error: 'Profile not found.' });
  res.json({ profile: payload });
});

/** GET /api/social/profiles/:userId — any logged-in user may view any profile. */
router.get('/profiles/:userId', authenticate, async (req, res) => {
  const payload = await profilePayload(req.params.userId, req.user.id);
  if (!payload) return res.status(404).json({ error: 'Profile not found.' });
  res.json({ profile: payload });
});

/**
 * PATCH /api/social/profiles/me
 * body: { bio?, avatar_url? }  — avatar_url is a data: URI, or null to clear.
 */
router.patch('/profiles/me', authenticate, async (req, res) => {
  const { bio, avatar_url } = req.body;

  if (bio !== undefined && bio !== null && typeof bio !== 'string') {
    return res.status(400).json({ error: 'bio must be a string.' });
  }
  if (typeof bio === 'string' && bio.length > 300) {
    return res.status(400).json({ error: 'bio must be 300 characters or fewer.' });
  }
  if (avatar_url !== undefined && avatar_url !== null && !isValidImageDataUri(avatar_url)) {
    return res.status(400).json({ error: 'avatar_url must be a valid image data URI under 3 MB.' });
  }

  await ensureSocialProfile(req.user.id);
  await query(
    `UPDATE social_profiles
     SET bio        = CASE WHEN $2::boolean THEN $3 ELSE bio END,
         avatar_url = CASE WHEN $4::boolean THEN $5 ELSE avatar_url END,
         updated_at = now()
     WHERE user_id = $1`,
    [
      req.user.id,
      bio !== undefined, bio ?? null,
      avatar_url !== undefined, avatar_url ?? null,
    ]
  );

  const payload = await profilePayload(req.user.id, req.user.id);
  res.json({ profile: payload });
});

export default router;
