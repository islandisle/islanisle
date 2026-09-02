// "Go Social" — posts (stage 2 of go-social-feature-brief.md).
//
// A post is a caption plus one or more photos. The feed is chronological:
// the caller's own posts plus their friends' posts (friends come from
// services/social.js friendIds, which is empty until stage 3 — so until
// then the feed is just your own posts). Like + comment + delete-own.

import { Router } from 'express';
import { query, pool } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { friendIds, authorMap, isValidImageDataUri } from '../services/social.js';

const router = Router();

const MAX_IMAGES = 10;

// Shapes a set of post rows into the payload the feed/grid/detail all use:
// author, media array, like/comment counts, liked_by_me.
async function hydratePosts(postRows, viewerId) {
  if (!postRows.length) return [];
  const ids = postRows.map((p) => p.id);

  const [media, likeCounts, myLikes, commentCounts, authors] = await Promise.all([
    query(
      `SELECT post_id, image_url, position FROM social_post_media
       WHERE post_id = ANY($1::uuid[]) ORDER BY post_id, position`,
      [ids]
    ),
    query(
      `SELECT post_id, COUNT(*)::int AS n FROM social_post_likes
       WHERE post_id = ANY($1::uuid[]) GROUP BY post_id`,
      [ids]
    ),
    query(
      `SELECT post_id FROM social_post_likes
       WHERE post_id = ANY($1::uuid[]) AND user_id = $2`,
      [ids, viewerId]
    ),
    query(
      `SELECT post_id, COUNT(*)::int AS n FROM social_post_comments
       WHERE post_id = ANY($1::uuid[]) GROUP BY post_id`,
      [ids]
    ),
    authorMap(postRows.map((p) => p.user_id)),
  ]);

  const mediaByPost = {};
  for (const m of media.rows) (mediaByPost[m.post_id] ??= []).push(m.image_url);
  const likeByPost = Object.fromEntries(likeCounts.rows.map((r) => [r.post_id, r.n]));
  const commentByPost = Object.fromEntries(commentCounts.rows.map((r) => [r.post_id, r.n]));
  const likedByMe = new Set(myLikes.rows.map((r) => r.post_id));

  return postRows.map((p) => ({
    id: p.id,
    user_id: p.user_id,
    author_name: authors[p.user_id]?.name || 'Unknown',
    author_avatar_url: authors[p.user_id]?.avatar_url || null,
    caption: p.caption,
    created_at: p.created_at,
    media: mediaByPost[p.id] || [],
    like_count: likeByPost[p.id] || 0,
    comment_count: commentByPost[p.id] || 0,
    liked_by_me: likedByMe.has(p.id),
    is_mine: p.user_id === viewerId,
  }));
}

/**
 * POST /api/social/posts
 * body: { caption?, images: [dataUri, ...] }  (1..10 images)
 */
router.post('/posts', authenticate, async (req, res) => {
  const { caption, images } = req.body;

  if (!Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: 'At least one photo is required.' });
  }
  if (images.length > MAX_IMAGES) {
    return res.status(400).json({ error: `A post can have at most ${MAX_IMAGES} photos.` });
  }
  if (!images.every(isValidImageDataUri)) {
    return res.status(400).json({ error: 'Every photo must be a valid image data URI under 3 MB.' });
  }
  if (caption !== undefined && caption !== null && typeof caption !== 'string') {
    return res.status(400).json({ error: 'caption must be a string.' });
  }
  if (typeof caption === 'string' && caption.length > 2200) {
    return res.status(400).json({ error: 'caption must be 2200 characters or fewer.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const postResult = await client.query(
      `INSERT INTO social_posts (user_id, caption) VALUES ($1, $2) RETURNING id, user_id, caption, created_at`,
      [req.user.id, caption?.trim() || null]
    );
    const post = postResult.rows[0];
    for (let i = 0; i < images.length; i += 1) {
      await client.query(
        `INSERT INTO social_post_media (post_id, image_url, position) VALUES ($1, $2, $3)`,
        [post.id, images[i], i]
      );
    }
    await client.query('COMMIT');
    const [hydrated] = await hydratePosts([post], req.user.id);
    res.status(201).json({ post: hydrated });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

/**
 * GET /api/social/posts/feed?before=<iso>&limit=<n>
 * Chronological: own + friends' posts.
 */
router.get('/posts/feed', authenticate, async (req, res) => {
  const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 15));
  const before = req.query.before ? new Date(req.query.before) : null;

  const authorIds = [req.user.id, ...(await friendIds(req.user.id))];
  const params = [authorIds];
  let beforeClause = '';
  if (before && !Number.isNaN(before.getTime())) {
    params.push(before.toISOString());
    beforeClause = `AND created_at < $${params.length}`;
  }
  params.push(limit);

  const result = await query(
    `SELECT id, user_id, caption, created_at FROM social_posts
     WHERE user_id = ANY($1::uuid[]) ${beforeClause}
     ORDER BY created_at DESC
     LIMIT $${params.length}`,
    params
  );
  res.json({ posts: await hydratePosts(result.rows, req.user.id) });
});

/** GET /api/social/posts/user/:userId — that user's own posts (profile grid). */
router.get('/posts/user/:userId', authenticate, async (req, res) => {
  const result = await query(
    `SELECT id, user_id, caption, created_at FROM social_posts
     WHERE user_id = $1 ORDER BY created_at DESC LIMIT 60`,
    [req.params.userId]
  );
  res.json({ posts: await hydratePosts(result.rows, req.user.id) });
});

/** GET /api/social/posts/:id */
router.get('/posts/:id', authenticate, async (req, res) => {
  const result = await query(
    `SELECT id, user_id, caption, created_at FROM social_posts WHERE id = $1`,
    [req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Post not found.' });
  const [post] = await hydratePosts(result.rows, req.user.id);
  res.json({ post });
});

/** DELETE /api/social/posts/:id — own posts only. */
router.delete('/posts/:id', authenticate, async (req, res) => {
  const result = await query(
    `DELETE FROM social_posts WHERE id = $1 AND user_id = $2 RETURNING id`,
    [req.params.id, req.user.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Post not found for this account.' });
  res.json({ deleted: true });
});

/** POST /api/social/posts/:id/like  ·  DELETE /api/social/posts/:id/like */
router.post('/posts/:id/like', authenticate, async (req, res) => {
  const exists = await query('SELECT 1 FROM social_posts WHERE id = $1', [req.params.id]);
  if (!exists.rows.length) return res.status(404).json({ error: 'Post not found.' });
  await query(
    `INSERT INTO social_post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [req.params.id, req.user.id]
  );
  const count = await query('SELECT COUNT(*)::int AS n FROM social_post_likes WHERE post_id = $1', [req.params.id]);
  res.json({ liked: true, like_count: count.rows[0].n });
});

router.delete('/posts/:id/like', authenticate, async (req, res) => {
  await query('DELETE FROM social_post_likes WHERE post_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  const count = await query('SELECT COUNT(*)::int AS n FROM social_post_likes WHERE post_id = $1', [req.params.id]);
  res.json({ liked: false, like_count: count.rows[0].n });
});

/** GET /api/social/posts/:id/comments  ·  POST /api/social/posts/:id/comments */
router.get('/posts/:id/comments', authenticate, async (req, res) => {
  const result = await query(
    `SELECT c.id, c.user_id, c.text, c.created_at, u.name AS author_name, sp.avatar_url AS author_avatar_url
     FROM social_post_comments c
     JOIN users u ON u.id = c.user_id
     LEFT JOIN social_profiles sp ON sp.user_id = c.user_id
     WHERE c.post_id = $1 ORDER BY c.created_at ASC`,
    [req.params.id]
  );
  res.json({
    comments: result.rows.map((c) => ({ ...c, is_mine: c.user_id === req.user.id })),
  });
});

router.post('/posts/:id/comments', authenticate, async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'A comment cannot be empty.' });
  if (text.length > 1000) return res.status(400).json({ error: 'Comment must be 1000 characters or fewer.' });

  const exists = await query('SELECT 1 FROM social_posts WHERE id = $1', [req.params.id]);
  if (!exists.rows.length) return res.status(404).json({ error: 'Post not found.' });

  const result = await query(
    `INSERT INTO social_post_comments (post_id, user_id, text) VALUES ($1, $2, $3)
     RETURNING id, user_id, text, created_at`,
    [req.params.id, req.user.id, text.trim()]
  );
  res.status(201).json({ comment: { ...result.rows[0], is_mine: true } });
});

/** DELETE /api/social/posts/:id/comments/:commentId — own comment only. */
router.delete('/posts/:id/comments/:commentId', authenticate, async (req, res) => {
  const result = await query(
    `DELETE FROM social_post_comments WHERE id = $1 AND post_id = $2 AND user_id = $3 RETURNING id`,
    [req.params.commentId, req.params.id, req.user.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Comment not found for this account.' });
  res.json({ deleted: true });
});

export default router;
