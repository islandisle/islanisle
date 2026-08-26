// Biometric/2FA login — script Section 8.6. Biometric auth is a client-side
// (device-level) concern; this covers the TOTP-based 2FA server side, backed
// by services/totp.js (validated against RFC 4226 test vectors).
//
// Batch 19 generalized this from users-only to also cover agents
// (frontend-agent's new Settings page security section) — both tables have
// the same two_factor_secret/two_factor_enabled columns. Table choice is
// keyed off req.user.role since agents/users are entirely separate tables,
// not a shared one with a type discriminator.
//
// Batch 20: auth.js's user login now actually enforces this — POST /login
// returns `requires_2fa` instead of a token when the account has it
// enabled, and POST /login/verify-2fa (auth.js) completes the second step
// itself (checking two_factor_secret directly, not via this file's
// /verify route, since it already has the user row loaded). Remaining
// known gap: agents.js's agent login still never checks 2FA — a
// smaller, separate follow-up than this pass covered.

import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { generateSecret, otpAuthUrl, verifyToken } from '../services/totp.js';

const router = Router();

function tableForRole(role) {
  return role === 'agent' ? 'agents' : 'users';
}

/**
 * POST /api/2fa/setup
 * Generates a new secret and returns the otpauth:// URL for the frontend to
 * render as a QR code. Not enabled yet — that happens on /confirm below,
 * once the user proves they scanned it correctly.
 */
router.post('/setup', authenticate, async (req, res) => {
  const secret = generateSecret();
  const table = tableForRole(req.user.role);
  const accountResult = await query(`SELECT name, contact_email FROM ${table} WHERE id = $1`, [req.user.id]);
  const accountName = accountResult.rows[0]?.contact_email || accountResult.rows[0]?.name || req.user.id;

  await query(`UPDATE ${table} SET two_factor_secret = $1, two_factor_enabled = false WHERE id = $2`, [secret, req.user.id]);

  res.json({
    secret, // shown as a manual-entry fallback if the user can't scan
    otpauth_url: otpAuthUrl(secret, accountName),
  });
});

/**
 * POST /api/2fa/confirm
 * body: { token }
 * Confirms the user actually has a working authenticator before enabling 2FA.
 */
router.post('/confirm', authenticate, async (req, res) => {
  const { token } = req.body;
  const table = tableForRole(req.user.role);
  const result = await query(`SELECT two_factor_secret FROM ${table} WHERE id = $1`, [req.user.id]);
  const secret = result.rows[0]?.two_factor_secret;

  if (!secret) {
    return res.status(400).json({ error: 'Run /api/2fa/setup first.' });
  }
  if (!verifyToken(token, secret)) {
    return res.status(400).json({ error: 'Incorrect code. Please try again.' });
  }

  await query(`UPDATE ${table} SET two_factor_enabled = true WHERE id = $1`, [req.user.id]);
  res.json({ status: 'enabled' });
});

/**
 * POST /api/2fa/verify
 * body: { user_id, token, account_type? }
 * Used during login when the account has 2FA enabled. account_type
 * ('agent' vs anything else) picks the table the same way tableForRole
 * does — not yet actually called from any login flow, see the file-level
 * note on that gap.
 */
router.post('/verify', async (req, res) => {
  const { user_id, token, account_type } = req.body;
  const table = tableForRole(account_type);
  const result = await query(`SELECT two_factor_secret, two_factor_enabled FROM ${table} WHERE id = $1`, [user_id]);
  const row = result.rows[0];

  if (!row?.two_factor_enabled) {
    return res.status(400).json({ error: '2FA is not enabled on this account.' });
  }
  if (!verifyToken(token, row.two_factor_secret)) {
    return res.status(401).json({ error: 'Invalid code.' });
  }
  res.json({ verified: true });
});

router.post('/disable', authenticate, async (req, res) => {
  const table = tableForRole(req.user.role);
  await query(`UPDATE ${table} SET two_factor_enabled = false, two_factor_secret = NULL WHERE id = $1`, [req.user.id]);
  res.json({ status: 'disabled' });
});

export default router;
