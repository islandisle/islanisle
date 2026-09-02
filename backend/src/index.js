import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import businessRoutes from './routes/business.js';
import businessSettingsRoutes from './routes/businessSettings.js';
import listingRoutes from './routes/listings.js';
import bookingRoutes from './routes/bookings.js';
import orderRoutes from './routes/orders.js';
import paymentRoutes from './routes/payments.js';
import payoutRoutes from './routes/payouts.js';
import disputeRoutes from './routes/disputes.js';
import adminRoutes from './routes/admin.js';
import legalRoutes from './routes/legal.js';
import twoFactorRoutes from './routes/twoFactor.js';
import sosRoutes from './routes/sos.js';
import groupRoutes from './routes/groups.js';
import checkinRoutes from './routes/checkin.js';
import tripRoutes from './routes/trips.js';
import reviewRoutes from './routes/reviews.js';
import notificationRoutes from './routes/notifications.js';
import supportRoutes from './routes/support.js';
import weatherRoutes from './routes/weather.js';
import waitlistRoutes from './routes/waitlist.js';
import returnRoutes from './routes/returns.js';
import agentRoutes from './routes/agents.js';
import messageRoutes from './routes/messages.js';
import webauthnRoutes from './routes/webauthn.js';
import closureRoutes from './routes/closures.js';
import eventRoutes from './routes/events.js';
import favoriteRoutes from './routes/favorites.js';
import b2bRoutes from './routes/b2b.js';
import groupTransferRoutes from './routes/groupTransfers.js';
import externalPlaceRoutes from './routes/externalPlaces.js';
import userRoutes from './routes/users.js';
import socialProfileRoutes from './routes/socialProfiles.js';
import socialPostRoutes from './routes/socialPosts.js';
import socialFriendRoutes from './routes/socialFriends.js';
import { startScheduledJobs } from './jobs/scheduler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Deployed behind one reverse proxy (Render) — trust the first hop only so
// req.ip is the real client address for rate limiting (middleware/
// rateLimit.js), not the proxy's. '1' rather than 'true' on purpose:
// express-rate-limit rejects a fully-permissive trust-proxy setting.
app.set('trust proxy', 1);

app.use(cors());

// IMPORTANT: the Stripe webhook needs the raw request body to verify its
// signature, so it must be mounted with express.raw() BEFORE the global
// express.json() parser below — otherwise Stripe's signature check fails.
app.use('/api/payments', express.raw({ type: 'application/json' }), paymentRoutes);

// "Go Social" post/story/avatar media travels as base64 data: URIs in the
// JSON body (no object storage in this environment — see services/social.js),
// which blows past express.json()'s 100 kB default. Mounted with its own
// larger limit BEFORE the global parser, same pattern as the Stripe raw
// mount above. The frontend downscales images before upload.
app.use('/api/social', express.json({ limit: '8mb' }), socialProfileRoutes);
app.use('/api/social', express.json({ limit: '8mb' }), socialPostRoutes);
app.use('/api/social', express.json({ limit: '8mb' }), socialFriendRoutes);

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'atoll-isle-api' });
});

app.use('/api/auth', authRoutes);
app.use('/api/business', businessRoutes);
app.use('/api/business', businessSettingsRoutes);
app.use('/api/business', closureRoutes);
app.use('/api/islands', listingRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payouts', payoutRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', legalRoutes); // exposes /api/terms, /api/account/export, /api/account/delete
app.use('/api/2fa', twoFactorRoutes);
app.use('/api/sos', sosRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/checkin', checkinRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/waitlist', waitlistRoutes);
app.use('/api/returns', returnRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/auth/webauthn', webauthnRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/b2b', b2bRoutes);
app.use('/api/group-transfers', groupTransferRoutes);
app.use('/api/external-places', externalPlaceRoutes);
app.use('/api/users', userRoutes);

// Remaining Phase 1 item not built this round:
//  15. Guided first-run tour — frontend-only, no backend endpoint needed.
//
// Known architectural gap (flagged honestly, not silently left broken):
//  Phase 2 tables (routes, group_bookings, b2b_requests) reference a
//  dedicated `routes` table for speedboat schedules, but Phase 1 speedboat
//  listings are stored as generic `listings` rows with type_specific_fields
//  instead, and nothing syncs the two. Cross-island shop delivery matching
//  (orders.js, services/deliveryMatch.js) resolved this for itself by
//  matching against `listings` directly rather than the empty `routes`
//  table — group_bookings (guesthouse-arranged transfers) still needs the
//  same fix before it can be built.

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`Atoll Isle API listening on port ${PORT}`);
  startScheduledJobs();
});