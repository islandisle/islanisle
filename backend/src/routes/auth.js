// Signup flow — implements script Section 2.1 (Phase 1 / MVP version).
//
// Phase 1 behavior (per the script):
//   - Document upload is MANDATORY and BLOCKING for both Tourist and Local.
//   - OCR auto-fill does NOT exist yet in Phase 1 — all fields are typed manually.
//   - Local accounts default to Tourist pricing until Super Admin reviews their
//     uploaded ID card (local_verification_status = 'pending').
//   - Travel group creation is optional at signup, capped at 10 members.
//
// NOTE: document upload currently stores to local disk as a placeholder.
// Before going to production, replace `saveDocumentImage()` below with a call
// to real object storage (Cloudinary / S3-compatible) — see the deployment
// notes in README.md. GitHub Pages + Render + Neon do not provide file storage.

import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { query, pool } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { REFERRAL_BONUS } from '../services/loyalty.js';
import { notify } from '../services/notifications.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

// Placeholder for real object storage. Swap this out before production.
async function saveDocumentImage(fileBuffer, userId) {
  // TODO: upload fileBuffer to Cloudinary/S3 and return the public URL.
  // For local dev only, this just returns a fake path.
  return `local-dev-storage://documents/${userId}/${uuidv4()}.jpg`;
}

/**
 * POST /api/auth/signup
 * multipart/form-data body:
 *   type            'tourist' | 'local'          (required)
 *   name            string                        (required)
 *   date_of_birth   YYYY-MM-DD                     (required)
 *   document_number string                        (required)
 *   contact_email   string                        (optional)
 *   contact_mobile  string                        (required — always manual, never OCR)
 *   password        string                        (required)
 *   language        string                        (tourist only, default 'en')
 *   document        file (image)                  (required — passport or ID card)
 *   travel_group    'true' | 'false'               (optional — creates a group if true)
 *   referral_code   string                        (optional — Batch 19: another account's referral_code)
 */
router.post('/signup', upload.single('document'), async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      type,
      name,
      date_of_birth,
      document_number,
      contact_email,
      contact_mobile,
      password,
      language,
      travel_group,
      referral_code,
    } = req.body;

    // --- Section 2.1 step 1: Tourist or Local is mandatory ---
    if (!['tourist', 'local'].includes(type)) {
      return res.status(400).json({ error: 'type must be "tourist" or "local"' });
    }

    // --- Section 2.1 step 2: document upload is mandatory and blocking ---
    if (!req.file) {
      return res.status(400).json({
        error: `${type === 'local' ? 'National ID card' : 'Passport'} upload is required to continue signup.`,
      });
    }

    // --- basic required-field validation (manual entry, Phase 1 — no OCR yet) ---
    if (!name || !date_of_birth || !document_number || !contact_mobile || !password) {
      return res.status(400).json({ error: 'name, date_of_birth, document_number, contact_mobile, and password are all required.' });
    }

    await client.query('BEGIN');

    const userId = uuidv4();
    const passwordHash = await bcrypt.hash(password, 12);
    const documentType = type === 'local' ? 'id_card' : 'passport';
    const documentImageUrl = await saveDocumentImage(req.file.buffer, userId);

    // --- Section 2.1 step 3: Local verification defaults to pending/Tourist pricing ---
    const localVerificationStatus = type === 'local' ? 'pending' : 'not_applicable';

    // --- Section 2.1 step 4: language is Tourist-only ---
    const resolvedLanguage = type === 'tourist' ? (language || 'en') : null;

    // Batch 19 referral program: this account's own shareable code (same
    // short-code shape as travel_groups.group_code just below), plus —
    // if a code was entered — the referrer to credit once signup commits.
    const ownReferralCode = uuidv4().slice(0, 8).toUpperCase();
    let referrer = null;
    if (referral_code) {
      const referrerResult = await client.query('SELECT id FROM users WHERE referral_code = $1', [referral_code.trim().toUpperCase()]);
      referrer = referrerResult.rows[0] || null;
    }

    const insertUser = await client.query(
      `INSERT INTO users (
         id, name, contact_email, contact_mobile, type, local_verification_status,
         uploaded_document_type, document_image_url, document_number, date_of_birth,
         language, password_hash, referral_code, referred_by_user_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id, name, type, local_verification_status, language, referral_code, wallet_balance`,
      [
        userId, name, contact_email || null, contact_mobile, type, localVerificationStatus,
        documentType, documentImageUrl, document_number, date_of_birth,
        resolvedLanguage, passwordHash, ownReferralCode, referrer?.id || null,
      ]
    );

    if (referrer) {
      await client.query('UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2', [REFERRAL_BONUS, userId]);
      await client.query('UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2', [REFERRAL_BONUS, referrer.id]);
      insertUser.rows[0].wallet_balance = Number(insertUser.rows[0].wallet_balance) + REFERRAL_BONUS;
    }

    // --- Section 2.1 step 5: optional travel group creation, capped at 10 ---
    let groupCode = null;
    if (travel_group === 'true') {
      groupCode = uuidv4().slice(0, 8).toUpperCase();
      const groupResult = await client.query(
        `INSERT INTO travel_groups (creator_user_id, group_code, max_members)
         VALUES ($1, $2, 10) RETURNING id`,
        [userId, groupCode]
      );
      await client.query(
        `INSERT INTO travel_group_members (travel_group_id, user_id, join_method, role)
         VALUES ($1, $2, 'manual', 'admin')`,
        [groupResult.rows[0].id, userId]
      );
    }

    await client.query('COMMIT');

    // Credit itself is already applied inside the transaction above — this
    // is just the referrer's notification, sent after commit so a failed
    // notify() can never roll back a successful signup.
    if (referrer) {
      await notify({
        recipientType: 'user',
        recipientId: referrer.id,
        type: 'promo',
        title: 'Referral bonus earned',
        body: `You earned $${REFERRAL_BONUS} in Atoll Isle credit — someone signed up with your referral code.`,
      }).catch(() => {});
    }

    const user = insertUser.rows[0];
    res.status(201).json({
      user,
      group_code: groupCode,
      message: type === 'local'
        ? 'Account created. You\'ll see Tourist pricing until your ID card is reviewed.'
        : 'Account created.',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Signup failed. Please try again.' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/auth/login
 * body: { contact_email OR contact_mobile, password }
 * Works for tourist/local user accounts. Business/agent/admin login live in
 * their own route files once those are built.
 */
router.post('/login', async (req, res) => {
  try {
    const { contact_email, contact_mobile, password } = req.body;
    if ((!contact_email && !contact_mobile) || !password) {
      return res.status(400).json({ error: 'Email or mobile, and password, are required.' });
    }

    const result = await query(
      `SELECT id, name, type, password_hash, local_verification_status, language, referral_code, wallet_balance
       FROM users WHERE contact_email = $1 OR contact_mobile = $2`,
      [contact_email || null, contact_mobile || null]
    );

    if (!result.rows.length) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const token = jwt.sign({ id: user.id, role: 'user' }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({
      token,
      user: {
        id: user.id, name: user.name, type: user.type,
        local_verification_status: user.local_verification_status, language: user.language,
        referral_code: user.referral_code, wallet_balance: user.wallet_balance,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

/**
 * GET /api/auth/me
 * Batch 19 — a small refresh point for fields that change after login
 * without a re-login (wallet_balance grows via services/loyalty.js on
 * every completed booking/order, so the value cached in localStorage at
 * login time goes stale quickly).
 */
router.get('/me', authenticate, async (req, res) => {
  const result = await query(
    'SELECT id, name, type, local_verification_status, language, referral_code, wallet_balance FROM users WHERE id = $1',
    [req.user.id]
  );
  if (!result.rows.length) {
    return res.status(404).json({ error: 'User not found.' });
  }
  res.json({ user: result.rows[0] });
});

/**
 * PATCH /api/auth/language
 * body: { language }
 * Section 11: "Tourists can change their language at any time here, not
 * just at signup." Local accounts stay English-only per spec, so this is
 * silently a no-op-but-still-200 for one rather than a special error case
 * the frontend has to branch on — the language picker itself is just
 * hidden for a Local account (see frontend-tourist's i18n.jsx).
 */
router.patch('/language', authenticate, async (req, res) => {
  const { language } = req.body;
  const VALID_LANGUAGES = ['en', 'zh', 'it', 'es'];
  if (!VALID_LANGUAGES.includes(language)) {
    return res.status(400).json({ error: `language must be one of: ${VALID_LANGUAGES.join(', ')}` });
  }
  const userResult = await query('SELECT type FROM users WHERE id = $1', [req.user.id]);
  if (!userResult.rows.length) {
    return res.status(404).json({ error: 'User not found.' });
  }
  if (userResult.rows[0].type !== 'tourist') {
    return res.json({ status: 'not_applicable' }); // Locals stay English-only
  }
  await query('UPDATE users SET language = $1 WHERE id = $2', [language, req.user.id]);
  res.json({ status: 'updated', language });
});

export default router;
