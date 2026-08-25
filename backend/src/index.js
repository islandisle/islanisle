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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());

// IMPORTANT: the Stripe webhook needs the raw request body to verify its
// signature, so it must be mounted with express.raw() BEFORE the global
// express.json() parser below — otherwise Stripe's signature check fails.
app.use('/api/payments', express.raw({ type: 'application/json' }), paymentRoutes);

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'atoll-isle-api' });
});

app.use('/api/auth', authRoutes);
app.use('/api/business', businessRoutes);
app.use('/api/business', businessSettingsRoutes);
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

// Remaining Phase 1 item not built this round:
//  15. Guided first-run tour — frontend-only, no backend endpoint needed.
//
// Known architectural gap (flagged honestly, not silently left broken):
//  Phase 2 tables (routes, group_bookings, package_deliveries, b2b_requests)
//  reference a dedicated `routes` table for speedboat schedules, but Phase 1
//  speedboat listings are stored as generic `listings` rows with
//  type_specific_fields instead. Nothing syncs the two yet. Before building
//  any Phase 2 feature that needs routes.id (guesthouse-arranged transfers,
//  cross-island shop delivery), either add sync logic when a speedboat
//  listing is created, or refactor speedboat booking to use `routes`
//  directly. See README.

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`Atoll Isle API listening on port ${PORT}`);
});