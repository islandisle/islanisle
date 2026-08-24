// Trip/itinerary — script Section 12: Trip, TripIslandStay.
// trips/trip_island_stays are populated exclusively from checkin.js's
// guesthouse check-in flow (see linkTripForCheckIn there); this file only
// reads that data back out for the tourist-facing itinerary view.

import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Which stay (of a trip's ordered stays) a booking/order's date falls into —
// each stay's window is [start_date, end_date] with an open end if end_date
// is null. If none match (e.g. linked before an adjacent stay narrowed the
// window), falls back to the closest stay by start_date so nothing linked
// to the trip goes missing from the response.
function findStayForDate(stays, date) {
  const match = stays.find((s) => {
    if (date < s.start_date) return false;
    if (s.end_date && date > s.end_date) return false;
    return true;
  });
  if (match) return match;
  return stays.reduce((closest, s) =>
    !closest || Math.abs(new Date(s.start_date) - date) < Math.abs(new Date(closest.start_date) - date) ? s : closest
  , null);
}

/**
 * GET /api/trips/mine
 * The user's trips, each with island stays in order and everything booked
 * under each stay, oldest trip first.
 */
router.get('/mine', authenticate, async (req, res) => {
  const tripsResult = await query(
    'SELECT id, created_at FROM trips WHERE user_id = $1 ORDER BY created_at ASC',
    [req.user.id]
  );
  const trips = tripsResult.rows;
  if (!trips.length) {
    return res.json({ trips: [] });
  }
  const tripIds = trips.map((t) => t.id);

  const staysResult = await query(
    `SELECT id, trip_id, island, start_date, end_date
     FROM trip_island_stays WHERE trip_id = ANY($1::uuid[]) ORDER BY start_date ASC`,
    [tripIds]
  );

  const bookingsResult = await query(
    `SELECT b.id, b.trip_id, b.slot_start, b.status, b.price_charged,
            l.title, biz.name AS business_name, biz.type AS business_type
     FROM bookings b
     JOIN listings l ON l.id = b.listing_id
     JOIN businesses biz ON biz.id = l.business_id
     WHERE b.trip_id = ANY($1::uuid[])
     ORDER BY b.slot_start ASC`,
    [tripIds]
  );

  const ordersResult = await query(
    `SELECT o.id, o.trip_id, o.created_at, o.status, o.price_charged, biz.name AS business_name
     FROM orders o
     JOIN businesses biz ON biz.id = o.business_id
     WHERE o.trip_id = ANY($1::uuid[])
     ORDER BY o.created_at ASC`,
    [tripIds]
  );

  const orderItemsByOrder = {};
  if (ordersResult.rows.length) {
    const orderIds = ordersResult.rows.map((o) => o.id);
    const itemsResult = await query(
      `SELECT oi.order_id, oi.quantity, l.title
       FROM order_items oi
       JOIN listings l ON l.id = oi.listing_id
       WHERE oi.order_id = ANY($1::uuid[])`,
      [orderIds]
    );
    for (const row of itemsResult.rows) {
      (orderItemsByOrder[row.order_id] ??= []).push({ title: row.title, quantity: row.quantity });
    }
  }

  const staysByTrip = {};
  for (const stay of staysResult.rows) {
    (staysByTrip[stay.trip_id] ??= []).push({ ...stay, bookings: [], orders: [] });
  }

  for (const booking of bookingsResult.rows) {
    const stays = staysByTrip[booking.trip_id];
    if (!stays || !stays.length) continue;
    findStayForDate(stays, new Date(booking.slot_start)).bookings.push({
      id: booking.id,
      title: booking.title,
      business_name: booking.business_name,
      business_type: booking.business_type,
      slot_start: booking.slot_start,
      status: booking.status,
      price_charged: booking.price_charged,
    });
  }

  for (const order of ordersResult.rows) {
    const stays = staysByTrip[order.trip_id];
    if (!stays || !stays.length) continue;
    findStayForDate(stays, new Date(order.created_at)).orders.push({
      id: order.id,
      business_name: order.business_name,
      created_at: order.created_at,
      status: order.status,
      price_charged: order.price_charged,
      items: orderItemsByOrder[order.id] || [],
    });
  }

  const tripsWithStays = trips.map((trip) => ({
    id: trip.id,
    created_at: trip.created_at,
    stays: staysByTrip[trip.id] || [],
  }));

  res.json({ trips: tripsWithStays });
});

export default router;
