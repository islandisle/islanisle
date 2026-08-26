// Boarding-reminder notifications — script Section 6.5, listed as an MVP
// push-notification type ("booking confirmations, boarding reminders, and
// ETA updates") with nothing ever producing the latter two. This is the
// scheduled half: a confirmed speedboat booking gets one reminder once its
// departure is within the window below, tracked via
// bookings.boarding_reminder_sent so it's never sent twice. The ETA-update
// half is operator/system-triggered instead of scheduled — see
// bookings.js's POST /departure/eta-update.

import { pool } from '../config/db.js';
import { notify } from './notifications.js';

// Not spec-mandated — long enough that this hourly-run job (see
// jobs/scheduler.js) reliably catches a departure before it happens, short
// enough that "boarding soon" is still true when the tourist reads it.
const REMINDER_WINDOW_HOURS = 2;

export async function sendBoardingReminders() {
  const result = await pool.query(
    `SELECT b.id, b.user_id, b.slot_start, l.title, biz.name AS business_name
     FROM bookings b
     JOIN listings l ON l.id = b.listing_id
     JOIN businesses biz ON biz.id = l.business_id
     WHERE biz.type = 'speedboat' AND b.status = 'confirmed' AND b.boarding_reminder_sent = false
       AND b.slot_start BETWEEN now() AND now() + make_interval(hours => $1)`,
    [REMINDER_WINDOW_HOURS]
  );

  for (const booking of result.rows) {
    await notify({
      recipientType: 'user',
      recipientId: booking.user_id,
      type: 'boarding_reminder',
      title: 'Boarding soon',
      body: `Your ${booking.title} departure with ${booking.business_name} is at ${new Date(booking.slot_start).toLocaleString()} — head to the boat soon.`,
    });
    await pool.query('UPDATE bookings SET boarding_reminder_sent = true WHERE id = $1', [booking.id]);
  }

  return { reminders_sent: result.rows.length };
}
