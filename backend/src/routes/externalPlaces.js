// External places (Batch 25, not in the original spec) — real Ministry of
// Tourism registered accommodation facilities that aren't yet registered
// as businesses on this platform, plus the "claim this business" flow that
// lets a real owner turn one into an actual listing.
//
// This is static reference data (backend/data/maldives_accommodations_master.json,
// seeded once by config/migrate.js), not a live API — there's no
// fetch/cache concept the way there would be for a real integration.

import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/db.js';
import { authenticate, optionalAuthenticate } from '../middleware/auth.js';
import { isEffectivelyPro } from '../config/proTier.js';

const router = Router();
const documentUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

// Same placeholder-storage pattern as auth.js's document upload (see that
// file's own comment for why: no S3/Cloudinary wired up in this environment).
function saveClaimDocument(fileBuffer, placeId) {
  return `local-dev-storage://claims/${placeId}/${uuidv4()}.jpg`;
}

/**
 * GET /api/external-places/:island
 * Section-adjacent to 3.2's island browsing — "More on this island":
 * unclaimed Ministry-of-Tourism places for the tourist's selected island,
 * grouped by type (Guest House / Home Stay / Hotel kept distinct, never
 * merged — a home stay and a hotel are meaningfully different things to a
 * tourist deciding where to stay). Works for a guest (no token) same as
 * real listings do; contact info (phone/email) is stripped server-side —
 * never just hidden client-side — for a non-Pro account.
 */
router.get('/:island', optionalAuthenticate, async (req, res) => {
  const { island } = req.params;

  let currentUser = null;
  if (req.user?.role === 'user') {
    const userResult = await query('SELECT pro FROM users WHERE id = $1', [req.user.id]);
    currentUser = userResult.rows[0] || null;
  }
  const pro = isEffectivelyPro(currentUser); // TOURIST_PRO_DEFAULT_UNLOCKED currently makes this true for guests too

  const result = await query(
    `SELECT id, name, type, phone, email FROM external_places
     WHERE LOWER(TRIM(island)) = LOWER(TRIM($1)) AND claimed_business_id IS NULL
     ORDER BY name ASC`,
    [island]
  );

  const places = result.rows.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    phone: pro ? p.phone : null,
    email: pro ? p.email : null,
  }));

  res.json({
    island,
    contact_locked: !pro,
    guesthouses: places.filter((p) => p.type === 'Guest House'),
    home_stays: places.filter((p) => p.type === 'Home Stay'),
    hotels: places.filter((p) => p.type === 'Hotel'),
  });
});

/**
 * POST /api/external-places/:id/claim
 * multipart/form-data: business_name, business_type, location_island,
 * contact_email, contact_mobile, document (file, required — business
 * registration certificate, same blocking-upload pattern as
 * auth.js's signup document gate).
 *
 * Any logged-in account can submit a claim (there's no separate "business"
 * login — see business.js's own header comment: a business is owned by a
 * user account, attached via businesses.owner_user_id). Reviewed through
 * the same unified Super Admin approval queue as everything else pending.
 */
router.post('/:id/claim', authenticate, documentUpload.single('document'), async (req, res) => {
  try {
    const { id: externalPlaceId } = req.params;
    const { business_name, business_type, location_island, contact_email, contact_mobile } = req.body;

    const VALID_BUSINESS_TYPES = ['guesthouse', 'restaurant', 'excursion', 'speedboat', 'shop'];
    if (!VALID_BUSINESS_TYPES.includes(business_type)) {
      return res.status(400).json({ error: `business_type must be one of: ${VALID_BUSINESS_TYPES.join(', ')}` });
    }
    if (!business_name || !location_island) {
      return res.status(400).json({ error: 'business_name and location_island are required.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'A verification document (business registration certificate) is required.' });
    }

    const placeResult = await query(
      'SELECT id, claimed_business_id FROM external_places WHERE id = $1',
      [externalPlaceId]
    );
    if (!placeResult.rows.length) {
      return res.status(404).json({ error: 'External place not found.' });
    }
    if (placeResult.rows[0].claimed_business_id) {
      return res.status(409).json({ error: 'This place has already been claimed.' });
    }

    const documentUrl = saveClaimDocument(req.file.buffer, externalPlaceId);
    const contactInfo = contact_email || contact_mobile ? { email: contact_email || null, mobile: contact_mobile || null } : null;

    const result = await query(
      `INSERT INTO external_place_claims (
         external_place_id, submitted_by_user_id, business_name, business_type,
         location_island, contact_info, document_image_url
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, status, created_at`,
      [externalPlaceId, req.user.id, business_name, business_type, location_island,
        contactInfo ? JSON.stringify(contactInfo) : null, documentUrl]
    );

    res.status(201).json({
      claim: result.rows[0],
      message: 'Claim submitted — it will appear once Super Admin reviews the verification document (Section 10.2).',
    });
  } catch (err) {
    console.error('External place claim error:', err);
    res.status(500).json({ error: 'Could not submit claim.' });
  }
});

export default router;
