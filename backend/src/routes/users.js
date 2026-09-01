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
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Same multer + placeholder-storage pattern as auth.js's signup route —
// memory storage, 8MB cap, and a local-dev-storage:// placeholder URL
// standing in for real object storage. Swap both out together before
// production (see auth.js's saveDocumentImage TODO).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

async function saveFlightTicketImage(fileBuffer, userId) {
  // TODO: upload fileBuffer to Cloudinary/S3 and return the public URL.
  // For local dev only, this just returns a fake path.
  return `local-dev-storage://flight-tickets/${userId}/${uuidv4()}.jpg`;
}

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

/**
 * POST /api/users/flight-ticket
 * multipart/form-data body: ticket (file, image, required)
 *
 * The cross-island flight-ticket gate (middleware/flightTicketGate.js) is
 * enforced per-booking, but a ticket is usually only uploaded later —
 * potentially mid-checkout — rather than at signup, so this is its own
 * self-service endpoint. Tourist accounts only: locals aren't flying in and
 * are never gated.
 */
router.post('/flight-ticket', authenticate, upload.single('ticket'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'A flight ticket image is required.' });
  }

  const userResult = await query('SELECT type FROM users WHERE id = $1', [req.user.id]);
  if (!userResult.rows.length) {
    return res.status(404).json({ error: 'User not found.' });
  }
  if (userResult.rows[0].type !== 'tourist') {
    return res.status(400).json({ error: 'Only tourist accounts can upload a flight ticket.' });
  }

  const flightTicketImageUrl = await saveFlightTicketImage(req.file.buffer, req.user.id);
  await query('UPDATE users SET flight_ticket_image_url = $1 WHERE id = $2', [flightTicketImageUrl, req.user.id]);

  res.json({ flight_ticket_image_url: flightTicketImageUrl, message: 'Flight ticket saved.' });
});

/**
 * GET /api/users/assigned-agent
 * The travel agent this tourist has assigned themselves, if any — for the
 * "your agent" section on the Profile page. Null when none is assigned.
 */
router.get('/assigned-agent', authenticate, async (req, res) => {
  const result = await query(
    `SELECT a.id, a.name, a.specialty, a.service_islands
     FROM users u
     JOIN agents a ON a.id = u.assigned_agent_id
     WHERE u.id = $1`,
    [req.user.id]
  );
  res.json({ agent: result.rows[0] || null });
});

/**
 * POST /api/users/assign-agent
 * body: { agent_id }
 * A tourist/local picks a travel agent as theirs. While assigned, prices
 * they see for a business that agent is approved-connected to are marked
 * up by that connection's commission rate — silently — and a direct
 * booking credits the agent (see services/agentPricing.js, bookings.js).
 */
router.post('/assign-agent', authenticate, async (req, res) => {
  const { agent_id } = req.body;
  if (!agent_id) {
    return res.status(400).json({ error: 'agent_id is required.' });
  }
  const agentResult = await query(
    `SELECT id FROM agents WHERE id = $1 AND approval_status = 'approved' AND account_status = 'active'`,
    [agent_id]
  );
  if (!agentResult.rows.length) {
    return res.status(404).json({ error: 'Agent not found, or not currently available.' });
  }
  await query('UPDATE users SET assigned_agent_id = $1 WHERE id = $2', [agent_id, req.user.id]);
  res.json({ status: 'assigned', agent_id });
});

/**
 * POST /api/users/unassign-agent
 * Clears the assignment — a tourist can change their mind.
 */
router.post('/unassign-agent', authenticate, async (req, res) => {
  await query('UPDATE users SET assigned_agent_id = NULL WHERE id = $1', [req.user.id]);
  res.json({ status: 'unassigned' });
});

export default router;
