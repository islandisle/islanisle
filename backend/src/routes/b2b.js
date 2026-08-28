// B2B requests + standing discounts (Batch 19) — [PHASE 2] tables that had
// zero backend/frontend before this. The model: one business (usually a
// guesthouse) arranges something with another (an excursion operator,
// restaurant, etc.) on behalf of its guests, at either a pre-agreed
// "standing" discount rate or a one-off "live" negotiated one. Accepting a
// request creates a real `bookings` row per guest — the first real use of
// payer_type = 'business' / bookings.payer_business_id, which existed in
// bookings.js's checkout with no write path (a tourist checking out is
// always payer_type 'tourist' or 'local', never 'business').
//
// Always payment_method 'pay_at_visit' here, consistent with online
// payments being disabled platform-wide (config/payments.js) — there's no
// "B2B invoice" payment flow to build on top of that. Once accepted, the
// resulting booking behaves exactly like any other Pay at Visit booking
// (the receiving business marks it fulfilled via bookings.js's existing
// PATCH /:id/complete, which is what actually accrues its commission).

import { Router } from 'express';
import { query, pool } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { notify } from '../services/notifications.js';
import { insertArrangedBooking, assertSlotCapacity } from '../services/bookingCreation.js';

const router = Router();

async function getOwnedBusiness(businessId, userId) {
  const result = await query('SELECT id, owner_user_id FROM businesses WHERE id = $1', [businessId]);
  if (!result.rows.length || result.rows[0].owner_user_id !== userId) return null;
  return result.rows[0];
}

/**
 * POST /api/b2b/standing-discounts/:businessId
 * body: { partner_business_id, discount_percent }
 * :businessId is the OFFERING business (the one giving the discount).
 */
router.post('/standing-discounts/:businessId', authenticate, async (req, res) => {
  const { businessId } = req.params;
  if (!(await getOwnedBusiness(businessId, req.user.id))) {
    return res.status(403).json({ error: 'You do not manage this business.' });
  }
  const { partner_business_id, discount_percent } = req.body;
  if (!partner_business_id || discount_percent == null) {
    return res.status(400).json({ error: 'partner_business_id and discount_percent are required.' });
  }
  const result = await query(
    `INSERT INTO standing_discounts (offering_business_id, partner_business_id, discount_percent)
     VALUES ($1, $2, $3)
     ON CONFLICT (offering_business_id, partner_business_id) DO UPDATE SET discount_percent = EXCLUDED.discount_percent
     RETURNING id, offering_business_id, partner_business_id, discount_percent`,
    [businessId, partner_business_id, discount_percent]
  );
  res.status(201).json({ standing_discount: result.rows[0] });
});

/**
 * GET /api/b2b/standing-discounts/:businessId
 * Every standing discount this business is party to, either side.
 */
router.get('/standing-discounts/:businessId', authenticate, async (req, res) => {
  const { businessId } = req.params;
  if (!(await getOwnedBusiness(businessId, req.user.id))) {
    return res.status(403).json({ error: 'You do not manage this business.' });
  }
  const result = await query(
    `SELECT sd.id, sd.discount_percent,
            sd.offering_business_id, ob.name AS offering_business_name,
            sd.partner_business_id, pb.name AS partner_business_name
     FROM standing_discounts sd
     JOIN businesses ob ON ob.id = sd.offering_business_id
     JOIN businesses pb ON pb.id = sd.partner_business_id
     WHERE sd.offering_business_id = $1 OR sd.partner_business_id = $1`,
    [businessId]
  );
  res.json({ standing_discounts: result.rows });
});

router.delete('/standing-discounts/:businessId/:discountId', authenticate, async (req, res) => {
  const { businessId, discountId } = req.params;
  if (!(await getOwnedBusiness(businessId, req.user.id))) {
    return res.status(403).json({ error: 'You do not manage this business.' });
  }
  await query('DELETE FROM standing_discounts WHERE id = $1 AND offering_business_id = $2', [discountId, businessId]);
  res.json({ status: 'deleted' });
});

/**
 * POST /api/b2b/requests/:businessId
 * :businessId is the REQUESTING business (e.g. a guesthouse arranging an
 * excursion for its guests). body: { receiving_business_id, listing_id,
 * payer: 'business'|'tourist', room_number?, slot_start, slot_end?,
 * discount_percent?, guest_user_ids: [uuid, ...] }
 * discount_percent, if omitted, is looked up from any standing_discounts
 * row between the two businesses — 'live' if the caller supplied one,
 * 'standing_rate' if it came from that lookup, absent if neither.
 */
router.post('/requests/:businessId', authenticate, async (req, res) => {
  const { businessId } = req.params;
  if (!(await getOwnedBusiness(businessId, req.user.id))) {
    return res.status(403).json({ error: 'You do not manage this business.' });
  }
  const { receiving_business_id, listing_id, payer, room_number, slot_start, slot_end, discount_percent, guest_user_ids } = req.body;
  if (!receiving_business_id || !listing_id || !payer || !slot_start || !Array.isArray(guest_user_ids) || guest_user_ids.length === 0) {
    return res.status(400).json({ error: 'receiving_business_id, listing_id, payer, slot_start, and at least one guest_user_id are required.' });
  }
  if (!['business', 'tourist'].includes(payer)) {
    return res.status(400).json({ error: "payer must be 'business' or 'tourist'." });
  }

  let resolvedDiscount = discount_percent != null ? Number(discount_percent) : null;
  let discountSource = resolvedDiscount != null ? 'live' : null;
  if (resolvedDiscount == null) {
    const standing = await query(
      `SELECT discount_percent FROM standing_discounts WHERE offering_business_id = $1 AND partner_business_id = $2`,
      [receiving_business_id, businessId]
    );
    if (standing.rows.length) {
      resolvedDiscount = Number(standing.rows[0].discount_percent);
      discountSource = 'standing_rate';
    }
  }

  const requestResult = await query(
    `INSERT INTO b2b_requests (
       requesting_business_id, receiving_business_id, listing_id, payer, room_number,
       discount_percent, discount_source, status, slot_start, slot_end
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9)
     RETURNING id, status, discount_percent, discount_source`,
    [businessId, receiving_business_id, listing_id, payer, room_number || null, resolvedDiscount, discountSource, slot_start, slot_end || null]
  );
  const b2bRequest = requestResult.rows[0];

  for (const guestUserId of guest_user_ids) {
    await query('INSERT INTO b2b_request_guests (b2b_request_id, user_id) VALUES ($1, $2)', [b2bRequest.id, guestUserId]);
  }

  await notify({
    recipientType: 'business',
    recipientId: receiving_business_id,
    type: 'new_booking',
    title: 'New B2B request',
    body: `A partner business has requested ${guest_user_ids.length} spot${guest_user_ids.length > 1 ? 's' : ''} on one of your listings.`,
  });

  res.status(201).json({ b2b_request: b2bRequest });
});

/**
 * GET /api/b2b/requests/:businessId/outgoing
 */
router.get('/requests/:businessId/outgoing', authenticate, async (req, res) => {
  const { businessId } = req.params;
  if (!(await getOwnedBusiness(businessId, req.user.id))) {
    return res.status(403).json({ error: 'You do not manage this business.' });
  }
  const result = await query(
    `SELECT r.id, r.status, r.payer, r.room_number, r.discount_percent, r.discount_source,
            r.slot_start, r.slot_end, r.created_at,
            l.title AS listing_title, b.name AS receiving_business_name,
            COUNT(g.id)::int AS guest_count
     FROM b2b_requests r
     JOIN listings l ON l.id = r.listing_id
     JOIN businesses b ON b.id = r.receiving_business_id
     LEFT JOIN b2b_request_guests g ON g.b2b_request_id = r.id
     WHERE r.requesting_business_id = $1
     GROUP BY r.id, l.title, b.name
     ORDER BY r.created_at DESC`,
    [businessId]
  );
  res.json({ requests: result.rows });
});

/**
 * GET /api/b2b/requests/:businessId/incoming
 */
router.get('/requests/:businessId/incoming', authenticate, async (req, res) => {
  const { businessId } = req.params;
  if (!(await getOwnedBusiness(businessId, req.user.id))) {
    return res.status(403).json({ error: 'You do not manage this business.' });
  }
  const result = await query(
    `SELECT r.id, r.status, r.payer, r.room_number, r.discount_percent, r.discount_source,
            r.slot_start, r.slot_end, r.created_at,
            l.title AS listing_title, b.name AS requesting_business_name,
            COUNT(g.id)::int AS guest_count
     FROM b2b_requests r
     JOIN listings l ON l.id = r.listing_id
     JOIN businesses b ON b.id = r.requesting_business_id
     LEFT JOIN b2b_request_guests g ON g.b2b_request_id = r.id
     WHERE r.receiving_business_id = $1
     GROUP BY r.id, l.title, b.name
     ORDER BY r.created_at DESC`,
    [businessId]
  );
  res.json({ requests: result.rows });
});

/**
 * POST /api/b2b/requests/:id/accept
 * Receiving-business-only. Creates one real `bookings` row per guest, at
 * the request's discount and slot, then marks the request accepted.
 */
router.post('/requests/:id/accept', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const requestResult = await client.query(
      `SELECT r.*, l.tourist_price, l.type_specific_fields, l.business_id AS listing_business_id,
              biz.owner_user_id, biz.type AS business_type
       FROM b2b_requests r
       JOIN listings l ON l.id = r.listing_id
       JOIN businesses biz ON biz.id = r.receiving_business_id
       WHERE r.id = $1`,
      [req.params.id]
    );
    // Early-return guards don't release the client themselves — the finally
    // block does that exactly once, whichever path returns (Batch 36 fix:
    // these used to call client.release() and then finally released again).
    if (!requestResult.rows.length) {
      return res.status(404).json({ error: 'B2B request not found.' });
    }
    const b2bRequest = requestResult.rows[0];
    if (b2bRequest.owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'You do not manage the receiving business.' });
    }
    if (b2bRequest.status !== 'pending') {
      return res.status(400).json({ error: `Request is already ${b2bRequest.status}.` });
    }

    const guestsResult = await client.query(
      'SELECT id, user_id FROM b2b_request_guests WHERE b2b_request_id = $1 AND resulting_booking_id IS NULL',
      [b2bRequest.id]
    );

    const basePrice = Number(b2bRequest.tourist_price);
    const discountPercent = b2bRequest.discount_percent ? Number(b2bRequest.discount_percent) : 0;

    await client.query('BEGIN');

    // Section 4.3/9 — the same slot-capacity check direct checkout enforces.
    await assertSlotCapacity(client, {
      listingId: b2bRequest.listing_id,
      slotStart: b2bRequest.slot_start,
      businessType: b2bRequest.business_type,
      typeSpecificFields: b2bRequest.type_specific_fields,
      seats: guestsResult.rows.length,
    });

    const createdBookingIds = [];
    for (const guest of guestsResult.rows) {
      const bookingId = await insertArrangedBooking(client, {
        listingId: b2bRequest.listing_id,
        userId: guest.user_id,
        slotStart: b2bRequest.slot_start,
        slotEnd: b2bRequest.slot_end,
        basePrice,
        discountPercent,
        payer: b2bRequest.payer,
        businessPayerLabel: 'business',
        payerBusinessId: b2bRequest.requesting_business_id,
      });
      createdBookingIds.push(bookingId);
      await client.query('UPDATE b2b_request_guests SET resulting_booking_id = $1 WHERE id = $2', [bookingId, guest.id]);
    }
    await client.query(`UPDATE b2b_requests SET status = 'accepted' WHERE id = $1`, [b2bRequest.id]);
    await client.query('COMMIT');

    await Promise.all(guestsResult.rows.map((guest) =>
      notify({
        recipientType: 'user',
        recipientId: guest.user_id,
        type: 'booking_confirmation',
        title: 'Booking confirmed',
        body: `Your guesthouse arranged a booking for you — you're confirmed.`,
      })
    ));
    await notify({
      recipientType: 'business',
      recipientId: b2bRequest.requesting_business_id,
      type: 'new_booking',
      title: 'B2B request accepted',
      body: `Your request for ${guestsResult.rows.length} guest${guestsResult.rows.length === 1 ? '' : 's'} was accepted.`,
    });

    res.json({ status: 'accepted', booking_ids: createdBookingIds });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('B2B accept error:', err);
    res.status(500).json({ error: 'Could not accept this request.' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/b2b/requests/:id/reject
 */
router.post('/requests/:id/reject', authenticate, async (req, res) => {
  const requestResult = await query(
    `SELECT r.id, r.requesting_business_id, r.status, biz.owner_user_id
     FROM b2b_requests r JOIN businesses biz ON biz.id = r.receiving_business_id
     WHERE r.id = $1`,
    [req.params.id]
  );
  if (!requestResult.rows.length) {
    return res.status(404).json({ error: 'B2B request not found.' });
  }
  const b2bRequest = requestResult.rows[0];
  if (b2bRequest.owner_user_id !== req.user.id) {
    return res.status(403).json({ error: 'You do not manage the receiving business.' });
  }
  if (b2bRequest.status !== 'pending') {
    return res.status(400).json({ error: `Request is already ${b2bRequest.status}.` });
  }
  await query(`UPDATE b2b_requests SET status = 'rejected' WHERE id = $1`, [req.params.id]);
  await notify({
    recipientType: 'business',
    recipientId: b2bRequest.requesting_business_id,
    type: 'rejected',
    title: 'B2B request declined',
    body: 'A partner business declined your request.',
  });
  res.json({ status: 'rejected' });
});

export default router;
