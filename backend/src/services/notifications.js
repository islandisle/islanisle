// Notification service — script Section 6.5.
// Real push delivery (FCM/APNs) is a separate integration to add later;
// this writes to the notifications table so there's always an in-app
// inbox even before push is wired up, and gives push integration a single
// place to hook into (call sendPushForNotification() from here once built).

import { query } from '../config/db.js';

export async function notify({ recipientType, recipientId, type, title, body }) {
  await query(
    `INSERT INTO notifications (recipient_type, recipient_id, type, title, body)
     VALUES ($1, $2, $3, $4, $5)`,
    [recipientType, recipientId, type, title, body]
  );
  // TODO: sendPushForNotification({ recipientType, recipientId, title, body });
}
