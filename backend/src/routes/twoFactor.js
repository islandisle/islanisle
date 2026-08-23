// Biometric/2FA login — script Section 8.6. Biometric auth is a client-side
// (device-level) concern; this covers the TOTP-based 2FA server side, backed
// by services/totp.js (validated against RFC 4226 test vectors).

import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { generateSecret, otpAuthUrl, verifyToken } from '../services/totp.js';

const router = Router();

/**
 * POST /api/2fa/setup
 * Generates a new secret and returns the otpauth:// URL for the frontend to
 * render as a QR code. Not enabled yet — that happens on /confirm below,
 * once the user proves they scanned it correctly.
 */
router.post('/setup', authenticate, async (req, res) => {
  const secret = generateSecret();
  const userResult = await query('SELECT name, contact_email FROM users WHERE id = $1', [req.user.id]);
  const accountName = userResult.rows[0]?.contact_email || userResult.rows[0]?.name || req.user.id;

  await query('UPDATE users SET two_factor_secret = $1, two_factor_enabled = false WHERE id = $2', [secret, req.user.id]);

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
  const result = await query('SELECT two_factor_secret FROM users WHERE id = $1', [req.user.id]);
  const secret = result.rows[0]?.two_factor_secret;

  if (!secret) {
    return res.status(400).json({ error: 'Run /api/2fa/setup first.' });
  }
  if (!verifyToken(token, secret)) {
    return res.status(400).json({ error: 'Incorrect code. Please try again.' });
  }

  await query('UPDATE users SET two_factor_enabled = true WHERE id = $1', [req.user.id]);
  res.json({ status: 'enabled' });
});

/**
 * POST /api/2fa/verify
 * Used during login when the account has 2FA enabled — see auth.js's login
 * flow, which should call this before issuing the final JWT once 2FA is on.
 */
router.post('/verify', async (req, res) => {
  const { user_id, token } = req.body;
  const result = await query('SELECT two_factor_secret, two_factor_enabled FROM users WHERE id = $1', [user_id]);
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
  await query('UPDATE users SET two_factor_enabled = false, two_factor_secret = NULL WHERE id = $1', [req.user.id]);
  res.json({ status: 'disabled' });
});

export default router;
