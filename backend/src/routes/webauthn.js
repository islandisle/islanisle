// Biometric login (WebAuthn) — an additional login option alongside the
// existing password + TOTP 2FA (see twoFactor.js's own header comment,
// which already flagged this as "a client-side (device-level) concern"
// it deliberately didn't cover). Registers/verifies a platform
// authenticator (Face ID, Touch ID, Windows Hello, Android fingerprint)
// per device, stored in webauthn_credentials — never a replacement for
// the password login in auth.js, which still works exactly as before.

import { Router } from 'express';
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

const RP_NAME = 'Atoll Isle';
const RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost';
// Comma-separated list of allowed origins this can be used from (the
// tourist app's dev/prod URLs) — WEBAUTHN_RP_ID/WEBAUTHN_ORIGINS need
// setting for any real deployment; these are dev-only fallbacks.
const ORIGINS = (process.env.WEBAUTHN_ORIGINS || 'http://localhost:5174').split(',');

// In-memory challenge store — single-process app (same assumption
// jobs/scheduler.js already makes for cron). A challenge lives a couple of
// minutes at most and never needs to survive a restart. Keyed by user id
// for both flows: register already knows it from the auth token; login
// looks the user up by contact info first, same as password login does.
const pendingChallenges = new Map();

function publicKeyToBase64Url(publicKey) {
  return Buffer.from(publicKey).toString('base64url');
}
function base64UrlToPublicKey(str) {
  return new Uint8Array(Buffer.from(str, 'base64url'));
}

/**
 * POST /api/auth/webauthn/register-options
 * Authenticated — a user must already be logged in (password or existing
 * biometric) to register a new device.
 */
router.post('/register-options', authenticate, async (req, res) => {
  const userResult = await query('SELECT id, name, contact_email, contact_mobile FROM users WHERE id = $1', [req.user.id]);
  if (!userResult.rows.length) {
    return res.status(404).json({ error: 'User not found.' });
  }
  const user = userResult.rows[0];
  const existingCreds = await query('SELECT credential_id FROM webauthn_credentials WHERE user_id = $1', [req.user.id]);

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: new TextEncoder().encode(user.id),
    userName: user.contact_email || user.contact_mobile,
    userDisplayName: user.name,
    attestationType: 'none',
    excludeCredentials: existingCreds.rows.map((c) => ({ id: c.credential_id })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred', authenticatorAttachment: 'platform' },
  });

  pendingChallenges.set(req.user.id, options.challenge);
  res.json(options);
});

/**
 * POST /api/auth/webauthn/register
 * body: { response, device_label? } — response is the browser's
 * RegistrationResponseJSON from @simplewebauthn/browser's startRegistration().
 */
router.post('/register', authenticate, async (req, res) => {
  const { response, device_label } = req.body;
  const expectedChallenge = pendingChallenges.get(req.user.id);
  if (!expectedChallenge) {
    return res.status(400).json({ error: 'No pending registration — request register-options again.' });
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: ORIGINS,
      expectedRPID: RP_ID,
    });
  } catch (err) {
    return res.status(400).json({ error: `Could not verify registration: ${err.message}` });
  }
  pendingChallenges.delete(req.user.id);

  if (!verification.verified || !verification.registrationInfo) {
    return res.status(400).json({ error: 'Registration could not be verified.' });
  }

  const { credential } = verification.registrationInfo;
  const result = await query(
    `INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter, device_label)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, device_label, created_at`,
    [req.user.id, credential.id, publicKeyToBase64Url(credential.publicKey), credential.counter, device_label || null]
  );

  res.status(201).json({ credential: result.rows[0], message: 'Biometric login enabled for this device.' });
});

/**
 * GET /api/auth/webauthn/credentials/mine
 * So the account/profile screen can list & let the user name/remove devices.
 */
router.get('/credentials/mine', authenticate, async (req, res) => {
  const result = await query(
    `SELECT id, device_label, created_at, last_used_at FROM webauthn_credentials WHERE user_id = $1 ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json({ credentials: result.rows });
});

router.delete('/credentials/:id', authenticate, async (req, res) => {
  await query('DELETE FROM webauthn_credentials WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  res.json({ status: 'removed' });
});

/**
 * POST /api/auth/webauthn/login-options
 * body: { contact_email? , contact_mobile? } — same lookup fields as
 * auth.js's password login.
 */
router.post('/login-options', async (req, res) => {
  const { contact_email, contact_mobile } = req.body;
  if (!contact_email && !contact_mobile) {
    return res.status(400).json({ error: 'contact_email or contact_mobile is required.' });
  }

  const userResult = await query(
    'SELECT id FROM users WHERE contact_email = $1 OR contact_mobile = $2',
    [contact_email || null, contact_mobile || null]
  );
  if (!userResult.rows.length) {
    return res.status(401).json({ error: 'No account found, or no biometric login registered for it.' });
  }
  const userId = userResult.rows[0].id;

  const credsResult = await query('SELECT credential_id FROM webauthn_credentials WHERE user_id = $1', [userId]);
  if (!credsResult.rows.length) {
    return res.status(401).json({ error: 'No biometric login registered for this account — use your password instead.' });
  }

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: credsResult.rows.map((c) => ({ id: c.credential_id })),
    userVerification: 'preferred',
  });

  pendingChallenges.set(userId, options.challenge);
  res.json({ options, user_id: userId });
});

/**
 * POST /api/auth/webauthn/login
 * body: { user_id, response } — response is the browser's
 * AuthenticationResponseJSON from startAuthentication().
 */
router.post('/login', async (req, res) => {
  const { user_id, response } = req.body;
  if (!user_id || !response) {
    return res.status(400).json({ error: 'user_id and response are required.' });
  }
  const expectedChallenge = pendingChallenges.get(user_id);
  if (!expectedChallenge) {
    return res.status(400).json({ error: 'No pending login attempt — request login-options again.' });
  }

  const credResult = await query(
    'SELECT * FROM webauthn_credentials WHERE user_id = $1 AND credential_id = $2',
    [user_id, response.id]
  );
  if (!credResult.rows.length) {
    return res.status(401).json({ error: 'Unrecognized credential.' });
  }
  const stored = credResult.rows[0];

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: ORIGINS,
      expectedRPID: RP_ID,
      credential: {
        id: stored.credential_id,
        publicKey: base64UrlToPublicKey(stored.public_key),
        counter: Number(stored.counter),
      },
    });
  } catch (err) {
    return res.status(401).json({ error: `Could not verify: ${err.message}` });
  }
  pendingChallenges.delete(user_id);

  if (!verification.verified) {
    return res.status(401).json({ error: 'Biometric login failed.' });
  }

  await query(
    'UPDATE webauthn_credentials SET counter = $1, last_used_at = now() WHERE id = $2',
    [verification.authenticationInfo.newCounter, stored.id]
  );

  const userResult = await query('SELECT id, name, type, local_verification_status FROM users WHERE id = $1', [user_id]);
  const user = userResult.rows[0];
  const token = jwt.sign({ id: user.id, role: 'user' }, process.env.JWT_SECRET, { expiresIn: '30d' });

  res.json({
    token,
    user: { id: user.id, name: user.name, type: user.type, local_verification_status: user.local_verification_status },
  });
});

export default router;
