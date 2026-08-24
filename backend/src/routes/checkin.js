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
    `SELECT b.id, b.user_id, b.status, b.per_member_check_in, l.business_id, u.name AS customer_name
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

  const businessResult = await query('SELECT owner_user_id, type, name FROM businesses WHERE id = $1', [booking.business_id]);
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

export default router;
