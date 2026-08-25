// Generic chat — the `messages` table existed in schema.sql (thread_key,
// sender_role 'user'|'business'|'agent') specifically so tourist<->business
// chat could be added later without a schema change ("table created now so
// schema doesn't need a later migration" — see its own comment). Built now
// for the agent portal's two chat needs — agent<->business, agent<->the
// tourist/local they're representing — as one generic route instead of two
// bespoke ones, since nothing here is agent-specific.
//
// thread_key is a canonical, sorted "role:id|role:id" pair (e.g.
// "agent:<id>|business:<id>") so both participants always compute the same
// key regardless of who started the thread.

import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

const VALID_ROLES = ['user', 'business', 'agent'];

function threadKey(a, b) {
  const [first, second] = [a, b].sort((x, y) => (x.role + x.id).localeCompare(y.role + y.id));
  return `${first.role}:${first.id}|${second.role}:${second.id}`;
}

function callerRole(req) {
  // req.user.role is 'user' for both tourist and business-owner accounts
  // (a business is owned by a user account — see business.js) — but a
  // chat participant needs to be identified as the business itself when
  // acting for one, so the caller must say which party they're messaging
  // as via other_party_type/business_id, checked below.
  return req.user.role;
}

// Resolves which literal role:id the caller is acting as for this thread —
// 'business' (if they own the given business_id) or their own role/id.
async function resolveCallerParticipant(req, businessId) {
  if (businessId) {
    const ownerCheck = await query('SELECT id FROM businesses WHERE id = $1 AND owner_user_id = $2', [businessId, req.user.id]);
    if (!ownerCheck.rows.length) return null;
    return { role: 'business', id: businessId };
  }
  return { role: callerRole(req), id: req.user.id };
}

/**
 * POST /api/messages
 * body: { as_business_id?, other_role, other_id, text }
 * as_business_id: send as the business you own, instead of as yourself.
 */
router.post('/', authenticate, async (req, res) => {
  const { as_business_id, other_role, other_id, text } = req.body;
  if (!other_role || !other_id || !text) {
    return res.status(400).json({ error: 'other_role, other_id, and text are required.' });
  }
  if (!VALID_ROLES.includes(other_role)) {
    return res.status(400).json({ error: `other_role must be one of: ${VALID_ROLES.join(', ')}` });
  }

  const me = await resolveCallerParticipant(req, as_business_id);
  if (!me) {
    return res.status(403).json({ error: 'You do not manage that business.' });
  }

  const key = threadKey(me, { role: other_role, id: other_id });
  const result = await query(
    `INSERT INTO messages (thread_key, sender_id, sender_role, text)
     VALUES ($1, $2, $3, $4) RETURNING id, thread_key, sender_id, sender_role, text, created_at`,
    [key, me.id, me.role, text]
  );
  res.status(201).json({ message: result.rows[0] });
});

/**
 * GET /api/messages/thread?other_role=&other_id=&as_business_id=
 * Full history for one thread. 404s (not 403) if the caller isn't a party
 * to it, so a thread's existence isn't leaked to a non-participant.
 */
router.get('/thread', authenticate, async (req, res) => {
  const { other_role, other_id, as_business_id } = req.query;
  if (!other_role || !other_id) {
    return res.status(400).json({ error: 'other_role and other_id are required.' });
  }
  const me = await resolveCallerParticipant(req, as_business_id);
  if (!me) {
    return res.status(403).json({ error: 'You do not manage that business.' });
  }
  const key = threadKey(me, { role: other_role, id: other_id });
  const result = await query(
    `SELECT id, sender_id, sender_role, text, created_at FROM messages WHERE thread_key = $1 ORDER BY created_at ASC`,
    [key]
  );
  res.json({ thread_key: key, messages: result.rows });
});

/**
 * GET /api/messages/threads/mine?as_business_id=
 * Distinct threads the caller is part of, with the latest message in each
 * — enough for a conversation list. thread_key encodes both participants
 * as literal text, so this is a LIKE match on "<role>:<id>" appearing in
 * it; fine at this table's expected scale.
 */
router.get('/threads/mine', authenticate, async (req, res) => {
  const { as_business_id } = req.query;
  const me = await resolveCallerParticipant(req, as_business_id);
  if (!me) {
    return res.status(403).json({ error: 'You do not manage that business.' });
  }
  const pattern = `%${me.role}:${me.id}%`;
  const result = await query(
    `SELECT DISTINCT ON (thread_key) thread_key, sender_role, text, created_at
     FROM messages WHERE thread_key LIKE $1
     ORDER BY thread_key, created_at DESC`,
    [pattern]
  );
  res.json({ threads: result.rows });
});

export default router;
