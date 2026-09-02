// Shared helpers for the "Go Social" layer (go-social-feature-brief.md).
// Kept deliberately separate from everything booking/payment-related.

import { query } from '../config/db.js';

// Uploaded media is stored inline as a `data:` URI — there's no object
// storage in this environment (see reviews.js / auth.js placeholder TODOs).
// The frontend downscales before upload; this is the backend backstop.
const MAX_DATA_URI_BYTES = 3 * 1024 * 1024; // ~3 MB of base64 text
const DATA_URI_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;

export function isValidImageDataUri(value) {
  return (
    typeof value === 'string' &&
    value.length <= MAX_DATA_URI_BYTES &&
    DATA_URI_RE.test(value)
  );
}

// Every tourist/local automatically "has" a social profile; the row is
// created on first touch rather than at signup so this needs no change to
// the auth flow. Returns the profile row.
export async function ensureSocialProfile(userId) {
  const existing = await query('SELECT * FROM social_profiles WHERE user_id = $1', [userId]);
  if (existing.rows.length) return existing.rows[0];
  const created = await query(
    `INSERT INTO social_profiles (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
     RETURNING *`,
    [userId]
  );
  return created.rows[0];
}

// The account must be a tourist/local — a business-owner account signing in
// to the tourist app still has type tourist/local, so this is really just a
// guard against calling social endpoints for a non-existent user.
export async function getSocialUser(userId) {
  const result = await query('SELECT id, name, type FROM users WHERE id = $1', [userId]);
  return result.rows[0] || null;
}

// The user ids this user is friends with (symmetric — friendships store one
// row per pair). Returns [] before the friendships table exists (stage 3),
// so the posts/stories feed degrades to "just your own" rather than 500ing.
export async function friendIds(userId) {
  try {
    const result = await query(
      `SELECT CASE WHEN user_id_a = $1 THEN user_id_b ELSE user_id_a END AS friend_id
       FROM social_friendships
       WHERE user_id_a = $1 OR user_id_b = $1`,
      [userId]
    );
    return result.rows.map((r) => r.friend_id);
  } catch {
    return [];
  }
}

export async function areFriends(a, b) {
  if (a === b) return false;
  const ids = await friendIds(a);
  return ids.includes(b);
}

// name + avatar for a set of user ids, as { [userId]: { name, avatar_url } }.
export async function authorMap(userIds) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return {};
  const result = await query(
    `SELECT u.id, u.name, sp.avatar_url
     FROM users u
     LEFT JOIN social_profiles sp ON sp.user_id = u.id
     WHERE u.id = ANY($1::uuid[])`,
    [ids]
  );
  const map = {};
  for (const row of result.rows) map[row.id] = { name: row.name, avatar_url: row.avatar_url };
  return map;
}
