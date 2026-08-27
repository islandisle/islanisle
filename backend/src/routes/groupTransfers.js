// Guesthouse-arranged guest transfers (Batch 19) — group_bookings/
// group_booking_guests were [PHASE 2] tables with zero backend or
// frontend. A guesthouse arranges a shared speedboat transfer for some of
// its guests (a common real-world pattern: the guesthouse block-books
// seats for an airport run or an inter-island transfer). See schema.sql's
// comment above CREATE TABLE routes for why route_id points at a
// speedboat `listings` row, not the unused `routes` table.
//
// A registered guest (user_id set) gets a real `bookings` row immediately,
// same payer_type = 'business'/'tourist' split as routes/b2b.js's accept
// flow, and boards by having the speedboat operator scan/enter that
// booking's id (the same id already used for guesthouse check-in QR
// codes — see frontend-tourist's CheckInQR). A placeholder guest
// (plain_name only, no account) has nothing to scan, so boarding for
// them is marked manually from the operator's manifest instead.

import { Router } from 'express';
import { query, pool } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { notify } from '../services/notifications.js';
import { insertArrangedBooking, assertSlotCapacity } from '../services/bookingCreation.js';

const router = Router();

async function getOwnedGuesthouse(businessId, userId) {
  const result = await query('SELECT id, type, owner_user_id FROM businesses WHERE id = $1', [businessId]);
  if (!result.rows.length || result.rows[0].owner_user_id !== userId) return null;
  if (result.rows[0].type !== 'guesthouse') return null;
  return result.rows[0];
}

/**
 * POST /api/group-transfers/:guesthouseBusinessId
 * body: { route_id (a speedboat listing id), eta, payer, discount_percent?,
 *         guests: [{ user_id? , plain_name? }, ...] }
 */
router.post('/:guesthouseBusinessId', authenticate, async (req, res) => {
  const { guesthouseBusinessId } = req.params;
  if (!(await getOwnedGuesthouse(guesthouseBusinessId, req.user.id))) {
    return res.status(403).json({ error: 'You do not manage a guesthouse with this id.' });
  }
  const { route_id, eta, payer, discount_percent, guests } = req.body;
  if (!route_id || !eta || !payer || !Array.isArray(guests) || guests.length === 0) {
    return res.status(400).json({ error: 'route_id, eta, payer, and at least one guest are required.' });
  }
  if (!['guesthouse', 'tourist'].includes(payer)) {
    return res.status(400).json({ error: "payer must be 'guesthouse' or 'tourist'." });
  }
  for (const guest of guests) {
    if (!guest.user_id && !guest.plain_name) {
      return res.status(400).json({ error: 'Each guest needs a user_id or a plain_name.' });
    }
  }

  const listingResult = await query(
    `SELECT l.id, l.tourist_price, l.type_specific_fields FROM listings l JOIN businesses b ON b.id = l.business_id
     WHERE l.id = $1 AND b.type = 'speedboat' AND l.approval_status = 'approved'`,
    [route_id]
  );
  if (!listingResult.rows.length) {
    return res.status(404).json({ error: 'Speedboat listing not found or not approved.' });
  }
  const listing = listingResult.rows[0];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Section 4.4/9 — only registered guests get a real seat booking, so
    // that's the seat count to check against the departure's capacity
    // (the same check direct checkout and agent bookings already enforce).
    await assertSlotCapacity(client, {
      listingId: route_id,
      slotStart: eta,
      businessType: 'speedboat',
      typeSpecificFields: listing.type_specific_fields,
      seats: guests.filter((g) => g.user_id).length,
    });

    const groupBookingResult = await client.query(
      `INSERT INTO group_bookings (guesthouse_business_id, route_id, payer, discount_percent, status, eta)
       VALUES ($1, $2, $3, $4, 'confirmed', $5)
       RETURNING id`,
      [guesthouseBusinessId, route_id, payer, discount_percent || null, eta]
    );
    const groupBookingId = groupBookingResult.rows[0].id;

    const basePrice = Number(listing.tourist_price);

    const createdGuests = [];
    for (const guest of guests) {
      let resultingBookingId = null;
      if (guest.user_id) {
        resultingBookingId = await insertArrangedBooking(client, {
          listingId: route_id,
          userId: guest.user_id,
          slotStart: eta,
          basePrice,
          discountPercent: discount_percent,
          payer,
          businessPayerLabel: 'guesthouse',
          payerBusinessId: guesthouseBusinessId,
        });
      }
      const guestResult = await client.query(
        `INSERT INTO group_booking_guests (group_booking_id, user_id, plain_name, resulting_booking_id)
         VALUES ($1, $2, $3, $4) RETURNING id, user_id, plain_name, boarded_status, resulting_booking_id`,
        [groupBookingId, guest.user_id || null, guest.plain_name || null, resultingBookingId]
      );
      createdGuests.push(guestResult.rows[0]);
    }

    await client.query('COMMIT');

    for (const guest of createdGuests) {
      if (guest.user_id) {
        await notify({
          recipientType: 'user',
          recipientId: guest.user_id,
          type: 'booking_confirmation',
          title: 'Transfer booked',
          body: 'Your guesthouse arranged a speedboat transfer for you — you\'re confirmed.',
        });
      }
    }

    res.status(201).json({ group_booking_id: groupBookingId, guests: createdGuests });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Group transfer creation error:', err);
    res.status(500).json({ error: 'Could not create this group transfer.' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/group-transfers/:guesthouseBusinessId/mine
 */
router.get('/:guesthouseBusinessId/mine', authenticate, async (req, res) => {
  const { guesthouseBusinessId } = req.params;
  if (!(await getOwnedGuesthouse(guesthouseBusinessId, req.user.id))) {
    return res.status(403).json({ error: 'You do not manage a guesthouse with this id.' });
  }
  const groupsResult = await query(
    `SELECT gb.id, gb.payer, gb.discount_percent, gb.status, gb.eta, gb.created_at,
            l.title AS listing_title, biz.name AS speedboat_business_name
     FROM group_bookings gb
     JOIN listings l ON l.id = gb.route_id
     JOIN businesses biz ON biz.id = l.business_id
     WHERE gb.guesthouse_business_id = $1
     ORDER BY gb.eta DESC`,
    [guesthouseBusinessId]
  );
  const groups = groupsResult.rows;
  if (groups.length) {
    const guestsResult = await query(
      `SELECT g.group_booking_id, g.id, g.user_id, u.name AS user_name, g.plain_name, g.boarded_status
       FROM group_booking_guests g LEFT JOIN users u ON u.id = g.user_id
       WHERE g.group_booking_id = ANY($1::uuid[])`,
      [groups.map((g) => g.id)]
    );
    const guestsByGroup = {};
    for (const row of guestsResult.rows) {
      (guestsByGroup[row.group_booking_id] ??= []).push({
        id: row.id, name: row.user_name || row.plain_name, boarded_status: row.boarded_status,
      });
    }
    for (const group of groups) {
      group.guests = guestsByGroup[group.id] || [];
    }
  }
  res.json({ group_bookings: groups });
});

/**
 * GET /api/group-transfers/business/:speedboatBusinessId/manifest
 * The speedboat operator's incoming side — every group transfer arranged
 * against one of their listings, for boarding.
 */
router.get('/business/:speedboatBusinessId/manifest', authenticate, async (req, res) => {
  const { speedboatBusinessId } = req.params;
  const bizResult = await query('SELECT owner_user_id FROM businesses WHERE id = $1', [speedboatBusinessId]);
  if (!bizResult.rows.length || bizResult.rows[0].owner_user_id !== req.user.id) {
    return res.status(403).json({ error: 'You do not manage this business.' });
  }

  const groupsResult = await query(
    `SELECT gb.id, gb.eta, gb.status, l.title AS listing_title, biz.name AS guesthouse_name
     FROM group_bookings gb
     JOIN listings l ON l.id = gb.route_id
     JOIN businesses biz ON biz.id = gb.guesthouse_business_id
     WHERE l.business_id = $1
     ORDER BY gb.eta DESC`,
    [speedboatBusinessId]
  );
  const groups = groupsResult.rows;
  if (groups.length) {
    const guestsResult = await query(
      `SELECT g.group_booking_id, g.id, g.user_id, u.name AS user_name, g.plain_name, g.boarded_status, g.resulting_booking_id
       FROM group_booking_guests g LEFT JOIN users u ON u.id = g.user_id
       WHERE g.group_booking_id = ANY($1::uuid[])`,
      [groups.map((g) => g.id)]
    );
    const guestsByGroup = {};
    for (const row of guestsResult.rows) {
      (guestsByGroup[row.group_booking_id] ??= []).push(row);
    }
    for (const group of groups) {
      group.guests = guestsByGroup[group.id] || [];
    }
  }
  res.json({ group_bookings: groups });
});

// Shared boarding logic — verifies the caller owns the speedboat business
// behind this guest's group booking before marking anything.
async function boardGuest(res, callerUserId, guestId, boardedStatus) {
  const guestResult = await query(
    `SELECT g.id, biz.owner_user_id
     FROM group_booking_guests g
     JOIN group_bookings gb ON gb.id = g.group_booking_id
     JOIN listings l ON l.id = gb.route_id
     JOIN businesses biz ON biz.id = l.business_id
     WHERE g.id = $1`,
    [guestId]
  );
  if (!guestResult.rows.length) {
    return res.status(404).json({ error: 'Guest not found.' });
  }
  if (guestResult.rows[0].owner_user_id !== callerUserId) {
    return res.status(403).json({ error: 'You do not manage this transfer.' });
  }
  await query('UPDATE group_booking_guests SET boarded_status = $1 WHERE id = $2', [boardedStatus, guestId]);
  res.json({ status: boardedStatus });
}

/**
 * POST /api/group-transfers/board
 * body: { booking_id } — QR path, scanning the guest's existing booking id
 * (same personal QR pattern as guesthouse check-in).
 */
router.post('/board', authenticate, async (req, res) => {
  const { booking_id } = req.body;
  if (!booking_id) {
    return res.status(400).json({ error: 'booking_id is required.' });
  }
  const guestResult = await query('SELECT id FROM group_booking_guests WHERE resulting_booking_id = $1', [booking_id]);
  if (!guestResult.rows.length) {
    return res.status(404).json({ error: "That code doesn't match a guest on this manifest." });
  }
  await boardGuest(res, req.user.id, guestResult.rows[0].id, 'boarded');
});

/**
 * POST /api/group-transfers/guests/:guestId/board
 * Manual path — for placeholder guests with no account/QR.
 */
router.post('/guests/:guestId/board', authenticate, async (req, res) => {
  await boardGuest(res, req.user.id, req.params.guestId, 'boarded');
});

router.post('/guests/:guestId/no-show', authenticate, async (req, res) => {
  await boardGuest(res, req.user.id, req.params.guestId, 'no-show');
});

export default router;
