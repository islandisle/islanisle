// Scheduled jobs — the payout run (script Section 7.2) and stale
// pending_payment cleanup were both previously nothing-calls-this: the
// payout run was admin-triggered only (see routes/payouts.js, still
// available as-is for on-demand/catch-up runs), and cleanup didn't exist
// at all. node-cron runs both inside this same Node process — good enough
// for a single backend instance; a multi-instance deployment would need a
// leader-election or an external scheduler (Render Cron Jobs) instead so
// the job doesn't run once per instance.

import cron from 'node-cron';
import { runPayoutBatch } from '../services/payoutRun.js';
import { expireStalePendingPayments } from '../services/staleCleanup.js';
import { sendBoardingReminders } from '../services/boardingReminders.js';
import { purgeExpiredStories } from '../services/social.js';

// Monthly billing cycle: 00:00 on the 1st of each month. Bundles both the
// normal online-payment payout run and Pay at Visit commission collection
// — see services/payoutRun.js for why those are one run, not two.
const PAYOUT_CRON = '0 0 1 * *';

// Independent of the monthly billing cycle — an abandoned pending_payment
// order is holding real stock hostage (see services/staleCleanup.js) and
// shouldn't wait up to a month to be released.
const CLEANUP_CRON = '0 * * * *'; // hourly

// Boarding reminders (Section 6.5) need finer granularity than the hourly
// cleanup — a 2-hour reminder window (services/boardingReminders.js) means
// running only once an hour could otherwise let a departure's whole window
// pass between ticks depending on timing.
const BOARDING_REMINDER_CRON = '*/15 * * * *'; // every 15 minutes

export function startScheduledJobs() {
  cron.schedule(PAYOUT_CRON, async () => {
    try {
      const result = await runPayoutBatch({ isMonthlyBillingRun: true });
      console.log(`[cron] Monthly payout run: ${result.payouts_created} payout(s) created.`);
    } catch (err) {
      console.error('[cron] Monthly payout run failed:', err);
    }
  });

  cron.schedule(CLEANUP_CRON, async () => {
    try {
      const result = await expireStalePendingPayments();
      console.log(`[cron] Stale pending-payment cleanup: ${result.bookings_expired} booking(s), ${result.orders_expired} order(s) expired.`);
    } catch (err) {
      console.error('[cron] Stale pending-payment cleanup failed:', err);
    }
    try {
      const purged = await purgeExpiredStories();
      if (purged > 0) console.log(`[cron] Go Social: purged ${purged} expired stor(ies).`);
    } catch (err) {
      console.error('[cron] Go Social story purge failed:', err);
    }
  });

  cron.schedule(BOARDING_REMINDER_CRON, async () => {
    try {
      const result = await sendBoardingReminders();
      if (result.reminders_sent > 0) {
        console.log(`[cron] Boarding reminders: ${result.reminders_sent} sent.`);
      }
    } catch (err) {
      console.error('[cron] Boarding reminders failed:', err);
    }
  });

  console.log('[cron] Scheduled jobs registered: monthly payout run (1st @ 00:00), hourly stale-payment cleanup, boarding reminders every 15 min.');
}
