// Notification service — script Section 6.5.
// Real push delivery (FCM/APNs) is a separate integration to add later;
// this writes to the notifications table so there's always an in-app
// inbox even before push is wired up, and gives push integration a single
// place to hook into (call sendPushForNotification() from here once built).

import { query } from '../config/db.js';

// Section 11: "users can mute individual notification categories... since
// the app sends notifications from several sources... unmanaged volume
// would overwhelm users." Every notify() call's `type` maps to one of the
// four categories both users.notification_preferences and
// businesses.notification_preferences store; an unmapped type defaults to
// 'booking_updates' rather than silently never respecting muting.
const CATEGORY_BY_TYPE = {
  booking_confirmation: 'booking_updates',
  new_booking: 'booking_updates',
  reservation_requested: 'booking_updates',
  cancellation: 'booking_updates',
  check_in: 'booking_updates',
  package_delivery: 'booking_updates',
  payout: 'booking_updates',
  pay_at_visit_bill: 'booking_updates',
  trust_tier_graduated: 'booking_updates',
  rejected: 'booking_updates',
  reclassified: 'booking_updates',
  suspended: 'booking_updates',
  business_claim_approved: 'booking_updates',
  boarding_reminder: 'boarding_reminders',
  eta_update: 'boarding_reminders',
  message: 'chat_messages',
  promo: 'deals_promos',
  // 'sos' is intentionally absent — it only ever targets recipientType
  // 'admin' (no notification_preferences column exists to check anyway)
  // and must never be muteable regardless.
};

export async function notify({ recipientType, recipientId, type, title, body }) {
  // No recipient to notify — e.g. an agent booking made for a guest who has
  // no account yet (bookings.user_id is null), later cancelled or hit by a
  // weather cascade. Silently skip rather than fail the surrounding action.
  if (!recipientId) return;

  if (recipientType === 'user' || recipientType === 'business') {
    const table = recipientType === 'user' ? 'users' : 'businesses';
    const category = CATEGORY_BY_TYPE[type] || 'booking_updates';
    const prefResult = await query(`SELECT notification_preferences FROM ${table} WHERE id = $1`, [recipientId]);
    const prefs = prefResult.rows[0]?.notification_preferences || {};
    if (prefs[category] === false) return; // muted — skip entirely, not just hidden client-side
  }

  await query(
    `INSERT INTO notifications (recipient_type, recipient_id, type, title, body)
     VALUES ($1, $2, $3, $4, $5)`,
    [recipientType, recipientId, type, title, body]
  );
  // TODO: sendPushForNotification({ recipientType, recipientId, title, body });
}
