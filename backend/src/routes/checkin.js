// Guesthouse check-in — schema.sql's bookings.check_in_status/check_in_method/
// per_member_check_in/room_number columns (nothing read or wrote them before
// this file) and users.current_stay_business_id/current_stay_room_number.
//
// A booking's "roster" is either its booker's travel_group (every member of
// that group, self-joined via travel_group_members) or, if the booker isn't
// in a group, just the booker alone. check_in_method records how a given
// check-in action was performed: 'qr' (the guest's own personal QR — the
// booking id itself, shown on their booking in the tourist app — was
// scanned), 'manual' (front desk picked them from the arrivals list, no
// scan), or 'whole_group' (this action checked in every roster member at
// once, however it was triggered). check_in_status is derived from the
// roster: 'checked_in' once everyone is in, 'partially_checked_in' if only
// some are, 'pending' otherwise.

import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { notify } from '../services/notifications.js';

const router = Router();

// Trip/itinerary linkage (script Section 12: Trip/TripIslandStay). A trip
// has no explicit status column, so "active" is derived: the user's most
// recent trip that has at least one stay not clearly over yet (open-ended
// end_date, or end_date today or later). Guesthouse bookings' slot_end is
// almost always null in the current app (no checkout-date picker on the
// frontend yet), so in practice a stay — and the trip it belongs to — stays
// "active" until a later stay's dates supersede it.
async function findOrCreateActiveTrip(userId) {
  const activeTripResult = await query(
    `SELECT t.id FROM trips t
     WHERE t.user_id = $1
       AND EXISTS (
         SELECT 1 FROM trip_island_stays s
         WHERE s.trip_id = t.id AND (s.end_date IS NULL OR s.end_date >= CURRENT_DATE)
       )
     ORDER BY t.created_at DESC
     LIMIT 1`,
    [userId]
  );
  if (activeTripResult.rows.length) {
    return activeTripResult.rows[0].id;
  }
  const newTrip = await query('INSERT INTO trips (user_id) VALUES ($1) RETURNING id', [userId]);
  return newTrip.rows[0].id;
}

// Finds this user's active trip (or starts a new one), adds this island stay
// to it — skipping the insert if it's already there, so a repeat check-in
// call on the same booking doesn't create a duplicate stay — and backfills
// trip_id onto every one of the user's own bookings/orders that fall inside
// the stay window and aren't linked to a trip yet (the guesthouse booking
// itself included, plus any transfer/excursion/restaurant booking or shop
// order from the same trip).
async function linkTripForCheckIn(userId, island, startAt, endAt) {
  const tripId = await findOrCreateActiveTrip(userId);

  const existingStay = await query(
    'SELECT id FROM trip_island_stays WHERE trip_id = $1 AND island = $2 AND start_date = $3::date',
    [tripId, island, startAt]
  );
  if (!existingStay.rows.length) {
    await query(
      'INSERT INTO trip_island_stays (trip_id, island, start_date, end_date) VALUES ($1, $2, $3, $4)',
      [tripId, island, startAt, endAt]
    );
  }

  await query(
    `UPDATE bookings SET trip_id = $1
     WHERE user_id = $2 AND trip_id IS NULL
       AND slot_start::date >= $3::date AND ($4::date IS NULL OR slot_start::date <= $4::date)`,
    [tripId, userId, startAt, endAt]
  );
  await query(
    `UPDATE orders SET trip_id = $1
     WHERE user_id = $2 AND trip_id IS NULL
       AND created_at::date >= $3::date AND ($4::date IS NULL OR created_at::date <= $4::date)`,
    [tripId, userId, startAt, endAt]
  );

  return tripId;
}

async function requireGuesthouseOwner(req, res, next) {
  const result = await query('SELECT owner_user_id, type FROM businesses WHERE id = $1', [req.params.businessId]);
  if (!result.rows.length) {
    return res.status(404).json({ error: 'Business not found.' });
  }
  if (result.rows[0].owner_user_id !== req.user.id) {
    return res.status(403).json({ error: 'You do not manage this business.' });
  }
  if (result.rows[0].type !== 'guesthouse') {
    return res.status(400).json({ error: 'Check-in is only available for guesthouses.' });
  }
  next();
}

/**
 * GET /api/checkin/business/:businessId/arrivals
 * Today's confirmed guesthouse bookings, with each booker's travel-group
 * roster attached (so the frontend can offer whole-group vs. individual
 * check-in without a second round trip per row).
 */
router.get('/business/:businessId/arrivals', authenticate, requireGuesthouseOwner, async (req, res) => {
  const bookingsResult = await query(
    `SELECT b.id, b.slot_start, b.check_in_status, b.check_in_method, b.per_member_check_in,
            b.room_number, l.title, u.id AS user_id, u.name AS customer_name
     FROM bookings b
     JOIN listings l ON l.id = b.listing_id
     JOIN users u ON u.id = b.user_id
     WHERE l.business_id = $1 AND b.status = 'confirmed' AND b.slot_start::date = CURRENT_DATE
     ORDER BY b.slot_start ASC`,
    [req.params.businessId]
  );
  const arrivals = bookingsResult.rows;

  if (arrivals.length) {
    const userIds = arrivals.map((a) => a.user_id);
    const groupResult = await query(
      `SELECT tgm.user_id AS booker_id, tgm2.id AS member_id, tgm2.user_id AS member_user_id,
              tgm2.placeholder_name, u.name AS member_name
       FROM travel_group_members tgm
       JOIN travel_group_members tgm2 ON tgm2.travel_group_id = tgm.travel_group_id
       LEFT JOIN users u ON u.id = tgm2.user_id
       WHERE tgm.user_id = ANY($1::uuid[])`,
      [userIds]
    );
    const membersByBooker = {};
    for (const row of groupResult.rows) {
      (membersByBooker[row.booker_id] ??= []).push({
        member_id: row.member_id,
        name: row.member_name || row.placeholder_name,
      });
    }
    for (const arrival of arrivals) {
      // Only a real multi-person group (not a solo "group of one") needs the
      // whole-group-vs-individual choice on the frontend.
      const members = membersByBooker[arrival.user_id];
      arrival.group_members = members && members.length > 1 ? members : null;
    }
  }

  res.json({ arrivals });
});

/**
 * GET /api/checkin/business/:businessId/current-guests
 * Batch 21 — the guest source for GuestPicker (frontend-business), used
 * when arranging a B2B request or a guesthouse group transfer. Unlike
 * /arrivals above (today's check-ins only, for the front-desk board), this
 * is anyone currently checked in here or holding any confirmed booking —
 * the actual "who am I hosting right now" list a guesthouse would want to
 * pick guests from, not just who's walking in today.
 */
router.get('/business/:businessId/current-guests', authenticate, requireGuesthouseOwner, async (req, res) => {
  const result = await query(
    `SELECT DISTINCT u.id AS user_id, u.name
     FROM users u
     WHERE u.current_stay_business_id = $1
        OR u.id IN (
          SELECT b.user_id FROM bookings b
          JOIN listings l ON l.id = b.listing_id
          WHERE l.business_id = $1 AND b.status = 'confirmed'
        )
     ORDER BY u.name ASC`,
    [req.params.businessId]
  );
  res.json({ guests: result.rows });
});

/**
 * POST /api/checkin/:bookingId
 * body: { method: 'qr'|'manual', room_number, whole_group?, member_ids? }
 * whole_group checks in every roster member; member_ids checks in just those
 * (travel_group_members ids); neither defaults to checking in the booker alone.
 */
router.post('/:bookingId', authenticate, async (req, res) => {
  const { bookingId } = req.params;
  const { method, room_number, whole_group, member_ids } = req.body;

  if (!room_number || !room_number.trim()) {
    return res.status(400).json({ error: 'room_number is required.' });
  }
  if (!['qr', 'manual'].includes(method)) {
    return res.status(400).json({ error: "method must be 'qr' or 'manual'." });
  }

  const bookingResult = await query(
    `SELECT b.id, b.user_id, b.status, b.per_member_check_in, b.slot_start, b.slot_end,
            l.business_id, u.name AS customer_name
     FROM bookings b
     JOIN listings l ON l.id = b.listing_id
     JOIN users u ON u.id = b.user_id
     WHERE b.id = $1`,
    [bookingId]
  );
  if (!bookingResult.rows.length) {
    return res.status(404).json({ error: 'Booking not found.' });
  }
  const booking = bookingResult.rows[0];

  const businessResult = await query('SELECT owner_user_id, type, name, location_island FROM businesses WHERE id = $1', [booking.business_id]);
  const business = businessResult.rows[0];
  if (!business || business.owner_user_id !== req.user.id) {
    return res.status(403).json({ error: 'You do not manage this business.' });
  }
  if (business.type !== 'guesthouse') {
    return res.status(400).json({ error: 'Check-in is only available for guesthouses.' });
  }
  if (booking.status !== 'confirmed') {
    return res.status(400).json({ error: 'Only confirmed bookings can be checked in.' });
  }

  // The roster: the booker's travel group (self-join to get every member,
  // including the booker), or just the booker alone if they're not in one.
  const groupResult = await query(
    `SELECT tgm2.id AS member_id, tgm2.user_id, tgm2.placeholder_name, u.name AS member_name
     FROM travel_group_members tgm
     JOIN travel_group_members tgm2 ON tgm2.travel_group_id = tgm.travel_group_id
     LEFT JOIN users u ON u.id = tgm2.user_id
     WHERE tgm.user_id = $1`,
    [booking.user_id]
  );
  const roster = groupResult.rows.length
    ? groupResult.rows.map((m) => ({ member_id: m.member_id, user_id: m.user_id, name: m.member_name || m.placeholder_name }))
    : [{ member_id: booking.user_id, user_id: booking.user_id, name: booking.customer_name }];

  let targetIds;
  if (whole_group) {
    targetIds = new Set(roster.map((m) => m.member_id));
  } else if (Array.isArray(member_ids) && member_ids.length) {
    targetIds = new Set(member_ids);
  } else {
    const bookerEntry = roster.find((m) => m.user_id === booking.user_id) || roster[0];
    targetIds = new Set([bookerEntry.member_id]);
  }

  const existingByMemberId = {};
  for (const entry of booking.per_member_check_in || []) {
    existingByMemberId[entry.member_id] = entry.checked_in;
  }
  const updatedRoster = roster.map((m) => ({
    member_id: m.member_id,
    name: m.name,
    checked_in: targetIds.has(m.member_id) ? true : Boolean(existingByMemberId[m.member_id]),
  }));

  const checkedInCount = updatedRoster.filter((m) => m.checked_in).length;
  const newStatus =
    checkedInCount === 0 ? 'pending'
    : checkedInCount === updatedRoster.length ? 'checked_in'
    : 'partially_checked_in';
  const finalMethod = whole_group ? 'whole_group' : method;
  const trimmedRoomNumber = room_number.trim();

  await query(
    `UPDATE bookings SET
       room_number = $1, check_in_status = $2, check_in_method = $3,
       per_member_check_in = $4, updated_at = now()
     WHERE id = $5`,
    [trimmedRoomNumber, newStatus, finalMethod, JSON.stringify(updatedRoster), bookingId]
  );

  // Reflect the stay on every newly-checked-in roster member's own profile.
  // Placeholder members (no user_id) have no profile to update.
  const checkedInUserIds = roster
    .filter((m) => targetIds.has(m.member_id) && m.user_id)
    .map((m) => m.user_id);
  if (checkedInUserIds.length) {
    await query(
      `UPDATE users SET current_stay_business_id = $1, current_stay_room_number = $2
       WHERE id = ANY($3::uuid[])`,
      [booking.business_id, trimmedRoomNumber, checkedInUserIds]
    );

    // Pay at Visit eligibility (Section 9 / [PHASE 2]) — "Tourists: only
    // become eligible after they've checked in to at least one guesthouse
    // or hotel anywhere in the Maldives... a one-time trust gate, not
    // something re-checked per booking." Locals earn eligibility through ID
    // verification instead (admin.js), not check-in — see
    // services/payAtVisit.js's isPayAtVisitEligible for how this is read.
    await query(
      `UPDATE users SET pay_at_visit_eligible = true WHERE id = ANY($1::uuid[]) AND type = 'tourist'`,
      [checkedInUserIds]
    );

    // Trip/itinerary linkage — one trip per (real) checked-in user, since
    // trips.user_id is per-user, not per-group. Each gets their own trip
    // found-or-created and a stay added to it for this island/date window.
    const island = business.location_island || business.name;
    for (const uid of checkedInUserIds) {
      await linkTripForCheckIn(uid, island, booking.slot_start, booking.slot_end);
    }

    // document_access_grants (Batch 19) — the table existed unused; nothing
    // ever let a business actually view a guest's passport/ID, even though
    // check-in is exactly the moment front desk would want to verify it.
    // Granted per (business, booking, member) so GET .../documents below
    // can check it without caring which specific stay it came from, and
    // revoked on cancellation (bookings.js) — "only while there's an
    // active booking", per the schema's own naming.
    for (const uid of checkedInUserIds) {
      const existingGrant = await query(
        `SELECT id FROM document_access_grants
         WHERE business_id = $1 AND booking_id = $2 AND member_id = $3 AND revoked_at IS NULL`,
        [booking.business_id, bookingId, uid]
      );
      if (!existingGrant.rows.length) {
        await query(
          `INSERT INTO document_access_grants (member_id, business_id, booking_id) VALUES ($1, $2, $3)`,
          [uid, booking.business_id, bookingId]
        );
      }
    }
  }

  await notify({
    recipientType: 'user',
    recipientId: booking.user_id,
    type: 'check_in',
    title: 'Checked in',
    body: `You're checked in — Room ${trimmedRoomNumber} at ${business.name}.`,
  });

  res.json({
    booking: {
      id: bookingId,
      check_in_status: newStatus,
      check_in_method: finalMethod,
      room_number: trimmedRoomNumber,
      roster: updatedRoster,
    },
  });
});

/**
 * GET /api/checkin/mine
 * The tourist-facing "where am I staying right now" read, for Profile.jsx —
 * backed by users.current_stay_business_id/current_stay_room_number, which
 * POST /:bookingId above is the only thing that ever sets.
 */
router.get('/mine', authenticate, async (req, res) => {
  const result = await query(
    `SELECT u.current_stay_room_number, biz.id AS business_id, biz.name AS business_name
     FROM users u
     LEFT JOIN businesses biz ON biz.id = u.current_stay_business_id
     WHERE u.id = $1`,
    [req.user.id]
  );
  const row = result.rows[0];
  const currentStay = row?.business_id
    ? { business_id: row.business_id, business_name: row.business_name, room_number: row.current_stay_room_number }
    : null;
  res.json({ current_stay: currentStay });
});

/**
 * GET /api/checkin/booking/:bookingId/documents
 * Batch 19 — the actual read side of document_access_grants: a guesthouse
 * can view a checked-in guest's document ONLY while it holds a
 * non-revoked grant for that specific booking (granted at check-in above,
 * revoked on cancellation). Trying this for a booking at a different
 * business, or one whose grant was revoked, returns nothing — not a 403,
 * since "no active grant" and "not your booking" should look the same
 * from the outside rather than confirming which booking ids exist.
 */
router.get('/booking/:bookingId/documents', authenticate, async (req, res) => {
  const { bookingId } = req.params;
  const result = await query(
    `SELECT u.id AS user_id, u.name, u.uploaded_document_type, u.document_image_url
     FROM document_access_grants g
     JOIN businesses biz ON biz.id = g.business_id
     JOIN users u ON u.id = g.member_id
     WHERE g.booking_id = $1 AND g.revoked_at IS NULL AND biz.owner_user_id = $2`,
    [bookingId, req.user.id]
  );
  res.json({ documents: result.rows });
});

export default router;
