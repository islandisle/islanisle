// package.json has always referenced `npm run migrate` -> this file, which
// never existed. There's no incremental migration system in this project —
// database/schema.sql is applied once via `psql -f database/schema.sql`
// (see README) — so a database created before commit da550d3 ("Add promo
// codes and waitlist") is missing columns/types that route code now
// assumes exist:
//   - the promo_discount_type enum
//   - promo_codes.discount_type, promo_codes.times_used (discount also
//     widened from NUMERIC(4,2) to NUMERIC(10,2))
//   - bookings.promo_code_id, bookings.promo_discount_amount
//   - orders.promo_code_id, orders.promo_discount_amount
//
// Symptom: booking/order creation fails with a generic "Could not create
// a booking/order" error — the underlying Postgres error (visible once
// NODE_ENV isn't 'production'; see bookings.js/orders.js's catch blocks)
// is "column ... does not exist", while every read path (business
// dashboard, admin directory, etc.) works fine since nothing else selects
// these columns.
//
// This is a targeted catch-up for that one known drift, not a general
// migration framework — every statement is written to no-op if its target
// already exists, so it's safe to run more than once (including against a
// database that's already fully up to date).
//
// Usage: cd backend && npm run migrate   (or node src/config/migrate.js)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db.js';

async function columnExists(table, column) {
  const result = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return result.rows.length > 0;
}

async function tableExists(table) {
  const result = await pool.query(`SELECT 1 FROM information_schema.tables WHERE table_name = $1`, [table]);
  return result.rows.length > 0;
}

async function typeExists(typeName) {
  const result = await pool.query(`SELECT 1 FROM pg_type WHERE typname = $1`, [typeName]);
  return result.rows.length > 0;
}

async function constraintExists(constraintName) {
  const result = await pool.query(`SELECT 1 FROM pg_constraint WHERE conname = $1`, [constraintName]);
  return result.rows.length > 0;
}

// Finds the FK on table.column (whatever it's named) and, if it references
// a different table than targetTable, drops and recreates it pointing at
// targetTable — used below to repoint orders.matched_route_id and
// package_deliveries.route_id from the unused `routes` table to `listings`
// (see schema.sql's comment above CREATE TABLE routes for why).
async function repointForeignKey(table, column, targetTable) {
  const result = await pool.query(
    `SELECT tc.constraint_name, ccu.table_name AS referenced_table
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = $1 AND kcu.column_name = $2`,
    [table, column]
  );
  if (!result.rows.length) {
    console.log(`  No FK found on ${table}.${column} to repoint — leaving it alone.`);
    return false;
  }
  const { constraint_name: constraintName, referenced_table: referencedTable } = result.rows[0];
  if (referencedTable === targetTable) return false;

  console.log(`Repointing ${table}.${column}'s FK from ${referencedTable} to ${targetTable}...`);
  await pool.query(`ALTER TABLE ${table} DROP CONSTRAINT ${constraintName}`);
  await pool.query(`ALTER TABLE ${table} ADD CONSTRAINT ${constraintName} FOREIGN KEY (${column}) REFERENCES ${targetTable}(id)`);
  return true;
}

async function main() {
  console.log('Checking for the promo-codes/waitlist schema catch-up (commit da550d3)...');
  let changed = false;

  if (!(await typeExists('promo_discount_type'))) {
    console.log('Creating promo_discount_type enum...');
    await pool.query(`CREATE TYPE promo_discount_type AS ENUM ('percentage', 'fixed')`);
    changed = true;
  }

  if (!(await columnExists('promo_codes', 'discount_type'))) {
    console.log('Adding promo_codes.discount_type...');
    await pool.query(`ALTER TABLE promo_codes ADD COLUMN discount_type promo_discount_type NOT NULL DEFAULT 'percentage'`);
    changed = true;
  }
  if (!(await columnExists('promo_codes', 'times_used'))) {
    console.log('Adding promo_codes.times_used...');
    await pool.query(`ALTER TABLE promo_codes ADD COLUMN times_used INTEGER NOT NULL DEFAULT 0`);
    changed = true;
  }
  // Widening NUMERIC(4,2) -> NUMERIC(10,2) never loses existing data or
  // errors if it's already the wider size, so this always just runs.
  await pool.query(`ALTER TABLE promo_codes ALTER COLUMN discount TYPE NUMERIC(10,2)`);

  for (const table of ['bookings', 'orders']) {
    if (!(await columnExists(table, 'promo_code_id'))) {
      console.log(`Adding ${table}.promo_code_id...`);
      await pool.query(`ALTER TABLE ${table} ADD COLUMN promo_code_id UUID`);
      changed = true;
    }
    if (!(await columnExists(table, 'promo_discount_amount'))) {
      console.log(`Adding ${table}.promo_discount_amount...`);
      await pool.query(`ALTER TABLE ${table} ADD COLUMN promo_discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0`);
      changed = true;
    }
  }

  if (!(await constraintExists('fk_bookings_promo_code'))) {
    console.log('Adding bookings -> promo_codes foreign key...');
    await pool.query(`ALTER TABLE bookings ADD CONSTRAINT fk_bookings_promo_code FOREIGN KEY (promo_code_id) REFERENCES promo_codes(id)`);
    changed = true;
  }
  if (!(await constraintExists('fk_orders_promo_code'))) {
    console.log('Adding orders -> promo_codes foreign key...');
    await pool.query(`ALTER TABLE orders ADD CONSTRAINT fk_orders_promo_code FOREIGN KEY (promo_code_id) REFERENCES promo_codes(id)`);
    changed = true;
  }

  console.log('Checking for the shop marketplace batch catch-up (returns + cross-island delivery matching)...');

  // orders.matched_route_id / package_deliveries.route_id were originally
  // FK'd to the unused `routes` table; both now need to point at `listings`
  // (real speedboat schedules — see schema.sql's note above CREATE TABLE
  // routes). Only needed if this database still has the original FK.
  if (await repointForeignKey('orders', 'matched_route_id', 'listings')) changed = true;
  if (await repointForeignKey('package_deliveries', 'route_id', 'listings')) changed = true;
  // Batch 19's guesthouse-arranged guest transfers (routes/groupTransfers.js)
  // is the "separate, still-unbuilt feature" schema.sql's routes-table
  // comment referred to — built the same way as the two lines above,
  // against `listings`, not the empty `routes` table.
  if (await repointForeignKey('group_bookings', 'route_id', 'listings')) changed = true;

  console.log('Checking for the webauthn_credentials table (biometric login)...');
  const webauthnTableResult = await pool.query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'webauthn_credentials'`);
  if (!webauthnTableResult.rows.length) {
    console.log('Creating webauthn_credentials...');
    await pool.query(`
      CREATE TABLE webauthn_credentials (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        credential_id        TEXT NOT NULL UNIQUE,
        public_key           TEXT NOT NULL,
        counter              BIGINT NOT NULL DEFAULT 0,
        device_label          TEXT,
        created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_used_at            TIMESTAMPTZ
      )
    `);
    await pool.query(`CREATE INDEX idx_webauthn_credentials_user ON webauthn_credentials(user_id)`);
    changed = true;
  }

  console.log('Checking for listings.accessibility_features (accessibility filter)...');
  if (!(await columnExists('listings', 'accessibility_features'))) {
    console.log('Adding listings.accessibility_features...');
    await pool.query(`ALTER TABLE listings ADD COLUMN accessibility_features TEXT[] NOT NULL DEFAULT '{}'`);
    await pool.query(`CREATE INDEX idx_listings_accessibility ON listings USING GIN (accessibility_features)`);
    changed = true;
  }

  console.log('Checking for booking_members / order_members (group bookings)...');
  const bookingMembersResult = await pool.query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'booking_members'`);
  if (!bookingMembersResult.rows.length) {
    console.log('Creating booking_members...');
    await pool.query(`
      CREATE TABLE booking_members (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id      UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        user_id         UUID NOT NULL REFERENCES users(id),
        UNIQUE(booking_id, user_id)
      )
    `);
    await pool.query(`CREATE INDEX idx_booking_members_user ON booking_members(user_id)`);
    await pool.query(`CREATE INDEX idx_booking_members_booking ON booking_members(booking_id)`);
    changed = true;
  }
  const orderMembersResult = await pool.query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'order_members'`);
  if (!orderMembersResult.rows.length) {
    console.log('Creating order_members...');
    await pool.query(`
      CREATE TABLE order_members (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        user_id         UUID NOT NULL REFERENCES users(id),
        UNIQUE(order_id, user_id)
      )
    `);
    await pool.query(`CREATE INDEX idx_order_members_user ON order_members(user_id)`);
    await pool.query(`CREATE INDEX idx_order_members_order ON order_members(order_id)`);
    changed = true;
  }

  console.log('Checking for booking_status.pending_approval (restaurant accept/reject)...');
  const pendingApprovalResult = await pool.query(
    `SELECT 1 FROM pg_enum WHERE enumlabel = 'pending_approval'
     AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'booking_status')`
  );
  if (!pendingApprovalResult.rows.length) {
    console.log("Adding 'pending_approval' to booking_status...");
    await pool.query(`ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'pending_approval'`);
    changed = true;
  }

  console.log("Checking for admin_action_type.reclassify_tourist (passport-instead-of-ID-card reclassification)...");
  const reclassifyResult = await pool.query(
    `SELECT 1 FROM pg_enum WHERE enumlabel = 'reclassify_tourist'
     AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'admin_action_type')`
  );
  if (!reclassifyResult.rows.length) {
    console.log("Adding 'reclassify_tourist' to admin_action_type...");
    await pool.query(`ALTER TYPE admin_action_type ADD VALUE IF NOT EXISTS 'reclassify_tourist'`);
    changed = true;
  }

  console.log("Checking for admin_action_type.restore_pay_at_visit (Batch 23)...");
  const restorePavResult = await pool.query(
    `SELECT 1 FROM pg_enum WHERE enumlabel = 'restore_pay_at_visit'
     AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'admin_action_type')`
  );
  if (!restorePavResult.rows.length) {
    console.log("Adding 'restore_pay_at_visit' to admin_action_type...");
    await pool.query(`ALTER TYPE admin_action_type ADD VALUE IF NOT EXISTS 'restore_pay_at_visit'`);
    changed = true;
  }

  console.log("Checking for local_verification_status.rejected (Batch 36)...");
  const rejectedLvsResult = await pool.query(
    `SELECT 1 FROM pg_enum WHERE enumlabel = 'rejected'
     AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'local_verification_status')`
  );
  if (!rejectedLvsResult.rows.length) {
    console.log("Adding 'rejected' to local_verification_status...");
    await pool.query(`ALTER TYPE local_verification_status ADD VALUE IF NOT EXISTS 'rejected'`);
    changed = true;
  }

  console.log('Checking for refund_failures table (Batch 36)...');
  if (!(await tableExists('refund_failures'))) {
    console.log('Creating refund_failures...');
    await pool.query(`
      CREATE TABLE refund_failures (
          id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          booking_id                 UUID REFERENCES bookings(id),
          order_id                   UUID REFERENCES orders(id),
          dispute_id                 UUID REFERENCES disputes(id),
          source                     TEXT NOT NULL,
          amount                     NUMERIC(12,2) NOT NULL,
          stripe_payment_intent_id    TEXT,
          error_message              TEXT,
          status                     TEXT NOT NULL DEFAULT 'open',
          resolved_by_admin_id        UUID REFERENCES admin_users(id),
          resolved_note              TEXT,
          created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
          resolved_at                 TIMESTAMPTZ,
          CONSTRAINT chk_refund_failure_target CHECK (booking_id IS NOT NULL OR order_id IS NOT NULL)
      )
    `);
    await pool.query(`CREATE INDEX idx_refund_failures_status ON refund_failures(status)`);
    changed = true;
  }

  console.log("Checking for admin_target_type.user (Batch 28 — reclassify/restore audit target)...");
  const userTargetResult = await pool.query(
    `SELECT 1 FROM pg_enum WHERE enumlabel = 'user'
     AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'admin_target_type')`
  );
  if (!userTargetResult.rows.length) {
    console.log("Adding 'user' to admin_target_type...");
    await pool.query(`ALTER TYPE admin_target_type ADD VALUE IF NOT EXISTS 'user'`);
    changed = true;
  }

  console.log('Checking for users.notification_preferences (per-category mute)...');
  if (!(await columnExists('users', 'notification_preferences'))) {
    console.log('Adding users.notification_preferences...');
    await pool.query(
      `ALTER TABLE users ADD COLUMN notification_preferences JSONB NOT NULL DEFAULT '{"booking_updates": true, "chat_messages": true, "deals_promos": true, "boarding_reminders": true}'`
    );
    changed = true;
  }

  console.log('Checking for bookings.boarding_reminder_sent (boarding-reminder job)...');
  if (!(await columnExists('bookings', 'boarding_reminder_sent'))) {
    console.log('Adding bookings.boarding_reminder_sent...');
    await pool.query(`ALTER TABLE bookings ADD COLUMN boarding_reminder_sent BOOLEAN NOT NULL DEFAULT false`);
    changed = true;
  }

  // Remaps any business still on the pre-existing {"new_booking","disputes",
  // "messages"} notification_preferences shape to the 4-category shape
  // notify() now actually checks — see schema.sql's comment on the column.
  // Only touches rows that still look like the old shape (have
  // 'new_booking' but not 'booking_updates'), so this is safe to re-run.
  const oldShapeCount = await pool.query(
    `SELECT COUNT(*)::int AS count FROM businesses
     WHERE notification_preferences ? 'new_booking' AND NOT (notification_preferences ? 'booking_updates')`
  );
  if (oldShapeCount.rows[0].count > 0) {
    console.log(`Remapping notification_preferences for ${oldShapeCount.rows[0].count} business(es) to the new category shape...`);
    await pool.query(`
      UPDATE businesses SET notification_preferences = jsonb_build_object(
        'booking_updates', COALESCE((notification_preferences->>'new_booking')::boolean, true),
        'chat_messages', COALESCE((notification_preferences->>'messages')::boolean, true),
        'deals_promos', true,
        'boarding_reminders', true
      )
      WHERE notification_preferences ? 'new_booking' AND NOT (notification_preferences ? 'booking_updates')
    `);
    changed = true;
  }

  console.log('Checking for agents.two_factor_secret/two_factor_enabled (Agent Settings security section)...');
  if (!(await columnExists('agents', 'two_factor_secret'))) {
    console.log('Adding agents.two_factor_secret...');
    await pool.query(`ALTER TABLE agents ADD COLUMN two_factor_secret TEXT`);
    changed = true;
  }
  if (!(await columnExists('agents', 'two_factor_enabled'))) {
    console.log('Adding agents.two_factor_enabled...');
    await pool.query(`ALTER TABLE agents ADD COLUMN two_factor_enabled BOOLEAN NOT NULL DEFAULT false`);
    changed = true;
  }

  console.log('Checking for users.referral_code/referred_by_user_id (Batch 19 referral/loyalty)...');
  if (!(await columnExists('users', 'referral_code'))) {
    console.log('Adding users.referral_code...');
    await pool.query(`ALTER TABLE users ADD COLUMN referral_code TEXT UNIQUE`);
    // Backfill existing accounts so they have a shareable code too — same
    // short-code shape as travel_groups.group_code (auth.js/groups.js).
    await pool.query(`UPDATE users SET referral_code = UPPER(SUBSTRING(id::text, 1, 8)) WHERE referral_code IS NULL`);
    changed = true;
  }
  if (!(await columnExists('users', 'referred_by_user_id'))) {
    console.log('Adding users.referred_by_user_id...');
    await pool.query(`ALTER TABLE users ADD COLUMN referred_by_user_id UUID REFERENCES users(id)`);
    changed = true;
  }

  console.log('Checking for b2b_requests.slot_start/slot_end (Batch 19 B2B requests)...');
  if (!(await columnExists('b2b_requests', 'slot_start'))) {
    console.log('Adding b2b_requests.slot_start...');
    await pool.query(`ALTER TABLE b2b_requests ADD COLUMN slot_start TIMESTAMPTZ`);
    changed = true;
  }
  if (!(await columnExists('b2b_requests', 'slot_end'))) {
    console.log('Adding b2b_requests.slot_end...');
    await pool.query(`ALTER TABLE b2b_requests ADD COLUMN slot_end TIMESTAMPTZ`);
    changed = true;
  }

  console.log('Checking for users.pay_at_visit_unpaid_count (Batch 23)...');
  if (!(await columnExists('users', 'pay_at_visit_unpaid_count'))) {
    console.log('Adding users.pay_at_visit_unpaid_count...');
    await pool.query(`ALTER TABLE users ADD COLUMN pay_at_visit_unpaid_count INTEGER NOT NULL DEFAULT 0`);
    changed = true;
  }

  console.log('Checking for pay_at_visit_incidents table (Batch 23)...');
  if (!(await tableExists('pay_at_visit_incidents'))) {
    console.log('Creating pay_at_visit_incidents...');
    await pool.query(`
      CREATE TABLE pay_at_visit_incidents (
          id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          booking_id      UUID REFERENCES bookings(id),
          order_id        UUID REFERENCES orders(id),
          business_id      UUID NOT NULL REFERENCES businesses(id),
          user_id         UUID NOT NULL REFERENCES users(id),
          amount         NUMERIC(12,2) NOT NULL,
          reported_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT chk_pav_incident_target CHECK (booking_id IS NOT NULL OR order_id IS NOT NULL)
      )
    `);
    changed = true;
  }

  console.log('Checking that bookings.user_id is nullable (Batch 28 — agent name-only guest fix)...');
  const bookingUserIdNotNull = await pool.query(
    `SELECT is_nullable FROM information_schema.columns
     WHERE table_name = 'bookings' AND column_name = 'user_id'`
  );
  if (bookingUserIdNotNull.rows[0]?.is_nullable === 'NO') {
    console.log('Dropping NOT NULL on bookings.user_id...');
    await pool.query(`ALTER TABLE bookings ALTER COLUMN user_id DROP NOT NULL`);
    changed = true;
  }

  console.log('Checking for bookings/orders.refund_credit_payout_id (Batch 28 — payout double-credit fix)...');
  for (const table of ['bookings', 'orders']) {
    if (!(await columnExists(table, 'refund_credit_payout_id'))) {
      console.log(`Adding ${table}.refund_credit_payout_id...`);
      await pool.query(`ALTER TABLE ${table} ADD COLUMN refund_credit_payout_id UUID`);
      changed = true;
    }
    const fkName = `fk_${table}_refund_credit_payout`;
    if (!(await constraintExists(fkName))) {
      console.log(`Adding ${table} -> payouts (refund_credit_payout_id) foreign key...`);
      await pool.query(`ALTER TABLE ${table} ADD CONSTRAINT ${fkName} FOREIGN KEY (refund_credit_payout_id) REFERENCES payouts(id)`);
      changed = true;
    }
  }

  console.log('Checking for weather_conditions.fetched_at (Batch 22 live-refresh)...');
  if (!(await columnExists('weather_conditions', 'fetched_at'))) {
    console.log('Adding weather_conditions.fetched_at...');
    await pool.query(`ALTER TABLE weather_conditions ADD COLUMN fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()`);
    changed = true;
  }

  console.log('Checking for favorites table (Batch 19)...');
  if (!(await tableExists('favorites'))) {
    console.log('Creating favorites...');
    await pool.query(`
      CREATE TABLE favorites (
          id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id         UUID NOT NULL REFERENCES users(id),
          listing_id       UUID NOT NULL REFERENCES listings(id),
          created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE(user_id, listing_id)
      )
    `);
    changed = true;
  }

  console.log('Checking for local_events table (Batch 19 local-knowledge events calendar)...');
  if (!(await tableExists('local_events'))) {
    console.log('Creating local_events...');
    await pool.query(`
      CREATE TABLE local_events (
          id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          island         TEXT,
          title          TEXT NOT NULL,
          description     TEXT,
          event_date       DATE NOT NULL,
          created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX idx_local_events_date ON local_events(event_date)`);
    changed = true;
  }

  console.log('Checking for listings.dietary_tags (Batch 19 dietary tags)...');
  if (!(await columnExists('listings', 'dietary_tags'))) {
    console.log('Adding listings.dietary_tags...');
    await pool.query(`ALTER TABLE listings ADD COLUMN dietary_tags TEXT[] NOT NULL DEFAULT '{}'`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_listings_dietary ON listings USING GIN (dietary_tags)`);
    changed = true;
  }

  console.log("Checking for admin_target_type.external_place_claim (Batch 25)...");
  const externalPlaceClaimTargetResult = await pool.query(
    `SELECT 1 FROM pg_enum WHERE enumlabel = 'external_place_claim'
     AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'admin_target_type')`
  );
  if (!externalPlaceClaimTargetResult.rows.length) {
    console.log("Adding 'external_place_claim' to admin_target_type...");
    await pool.query(`ALTER TYPE admin_target_type ADD VALUE IF NOT EXISTS 'external_place_claim'`);
    changed = true;
  }

  console.log('Checking for users.pro (Batch 25 Tourist Pro tier)...');
  if (!(await columnExists('users', 'pro'))) {
    console.log('Adding users.pro...');
    await pool.query(`ALTER TABLE users ADD COLUMN pro BOOLEAN NOT NULL DEFAULT false`);
    changed = true;
  }

  console.log('Checking for users.flight_ticket_image_url (cross-island flight-ticket gate)...');
  if (!(await columnExists('users', 'flight_ticket_image_url'))) {
    console.log('Adding users.flight_ticket_image_url...');
    await pool.query(`ALTER TABLE users ADD COLUMN flight_ticket_image_url TEXT`);
    changed = true;
  }

  console.log('Checking for businesses.location_atoll (same-named-island disambiguation)...');
  if (!(await columnExists('businesses', 'location_atoll'))) {
    console.log('Adding businesses.location_atoll...');
    await pool.query(`ALTER TABLE businesses ADD COLUMN location_atoll TEXT`);
    changed = true;
  }

  console.log('Checking for agent_connected_businesses.commission_rate (business-set agent commission)...');
  if (!(await columnExists('agent_connected_businesses', 'commission_rate'))) {
    console.log('Adding agent_connected_businesses.commission_rate...');
    await pool.query(`ALTER TABLE agent_connected_businesses ADD COLUMN commission_rate NUMERIC(4,2)`);
    changed = true;
  }

  console.log('Checking for agent_connected_businesses.status (connection approval — agent discovery pricing)...');
  if (!(await columnExists('agent_connected_businesses', 'status'))) {
    console.log('Adding agent_connected_businesses.status...');
    await pool.query(`ALTER TABLE agent_connected_businesses ADD COLUMN status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected'))`);
    changed = true;
  }

  console.log('Checking for the agent_specialty enum + agents.specialty/service_islands (agent discovery)...');
  if (!(await typeExists('agent_specialty'))) {
    console.log('Creating agent_specialty enum...');
    await pool.query(`CREATE TYPE agent_specialty AS ENUM ('guesthouse', 'tour_guide', 'excursion', 'shopping')`);
    changed = true;
  }
  if (!(await columnExists('agents', 'specialty'))) {
    console.log('Adding agents.specialty...');
    await pool.query(`ALTER TABLE agents ADD COLUMN specialty agent_specialty`);
    changed = true;
  }
  if (!(await columnExists('agents', 'service_islands'))) {
    console.log('Adding agents.service_islands...');
    await pool.query(`ALTER TABLE agents ADD COLUMN service_islands TEXT[]`);
    changed = true;
  }

  console.log('Checking for users.assigned_agent_id (tourist-assigned travel agent)...');
  if (!(await columnExists('users', 'assigned_agent_id'))) {
    console.log('Adding users.assigned_agent_id...');
    await pool.query(`ALTER TABLE users ADD COLUMN assigned_agent_id UUID`);
    changed = true;
  }
  if (!(await constraintExists('fk_users_assigned_agent'))) {
    console.log('Adding users -> agents (assigned_agent_id) foreign key...');
    await pool.query(`ALTER TABLE users ADD CONSTRAINT fk_users_assigned_agent FOREIGN KEY (assigned_agent_id) REFERENCES agents(id)`);
    changed = true;
  }

  console.log('Checking for external_places table (Batch 25)...');
  if (!(await tableExists('external_places'))) {
    console.log('Creating external_places...');
    await pool.query(`
      CREATE TABLE external_places (
          id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name                 TEXT NOT NULL,
          type                 TEXT NOT NULL CHECK (type IN ('Guest House', 'Home Stay', 'Hotel')),
          atoll                TEXT NOT NULL,
          island               TEXT NOT NULL,
          phone                TEXT,
          email                TEXT,
          claimed_business_id  UUID REFERENCES businesses(id),
          created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX idx_external_places_island ON external_places(island)`);
    changed = true;
  }

  console.log('Checking for external_place_claims table (Batch 25)...');
  if (!(await tableExists('external_place_claims'))) {
    console.log('Creating external_place_claims...');
    await pool.query(`
      CREATE TABLE external_place_claims (
          id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          external_place_id     UUID NOT NULL REFERENCES external_places(id),
          submitted_by_user_id  UUID NOT NULL REFERENCES users(id),
          business_name         TEXT NOT NULL,
          business_type         business_type NOT NULL,
          location_island       TEXT NOT NULL,
          contact_info          JSONB,
          document_image_url    TEXT NOT NULL,
          status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
          decision_reason       TEXT,
          created_business_id   UUID REFERENCES businesses(id),
          created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
          decided_at            TIMESTAMPTZ
      )
    `);
    await pool.query(`CREATE INDEX idx_external_place_claims_status ON external_place_claims(status)`);
    changed = true;
  }

  // Batch 25 — one-time seed from the static Ministry of Tourism JSON dump,
  // not a live API, so "up to date" just means "the table isn't empty" —
  // there's no per-row freshness to reconcile against on later runs.
  console.log('Checking for external_places seed data (Batch 25 Ministry of Tourism import)...');
  const externalPlacesCountResult = await pool.query('SELECT COUNT(*)::int AS count FROM external_places');
  if (externalPlacesCountResult.rows[0].count === 0) {
    const dataPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'maldives_accommodations_master.json');
    console.log(`Seeding external_places from ${dataPath}...`);
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    let inserted = 0;
    for (const [atoll, islands] of Object.entries(data)) {
      for (const [island, entries] of Object.entries(islands)) {
        for (const entry of entries) {
          await pool.query(
            `INSERT INTO external_places (name, type, atoll, island, phone, email)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [entry.name, entry.type, atoll, island, entry.phone || null, entry.email || null]
          );
          inserted++;
        }
      }
    }
    console.log(`Seeded ${inserted} external_places rows.`);
    changed = true;
  }

  // "Go Social" (go-social-feature-brief.md) — Instagram-style social layer.
  // Built stage by stage; each stage adds its own tables here, all guarded.
  console.log('Checking for social_profiles table (Go Social — profiles)...');
  if (!(await tableExists('social_profiles'))) {
    console.log('Creating social_profiles...');
    await pool.query(`
      CREATE TABLE social_profiles (
          user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          bio           TEXT,
          avatar_url    TEXT,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    changed = true;
  }

  console.log('Checking for social_posts tables (Go Social — posts)...');
  if (!(await tableExists('social_posts'))) {
    console.log('Creating social_posts / _media / _likes / _comments...');
    await pool.query(`
      CREATE TABLE social_posts (
          id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          caption       TEXT,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX idx_social_posts_user ON social_posts(user_id, created_at DESC)`);
    await pool.query(`
      CREATE TABLE social_post_media (
          id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          post_id       UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
          image_url     TEXT NOT NULL,
          position      INTEGER NOT NULL DEFAULT 0
      )
    `);
    await pool.query(`CREATE INDEX idx_social_post_media_post ON social_post_media(post_id, position)`);
    await pool.query(`
      CREATE TABLE social_post_likes (
          post_id       UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
          user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (post_id, user_id)
      )
    `);
    await pool.query(`
      CREATE TABLE social_post_comments (
          id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          post_id       UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
          user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          text          TEXT NOT NULL,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX idx_social_post_comments_post ON social_post_comments(post_id, created_at)`);
    changed = true;
  }

  console.log('Checking for social friends tables (Go Social — friend requests)...');
  if (!(await tableExists('social_friend_requests'))) {
    console.log('Creating social_friend_requests / social_friendships...');
    await pool.query(`
      CREATE TABLE social_friend_requests (
          id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          from_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          to_user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
          responded_at  TIMESTAMPTZ,
          UNIQUE (from_user_id, to_user_id)
      )
    `);
    await pool.query(`CREATE INDEX idx_social_friend_requests_to ON social_friend_requests(to_user_id, status)`);
    await pool.query(`
      CREATE TABLE social_friendships (
          user_id_a     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          user_id_b     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (user_id_a, user_id_b),
          CHECK (user_id_a < user_id_b)
      )
    `);
    await pool.query(`CREATE INDEX idx_social_friendships_b ON social_friendships(user_id_b)`);
    changed = true;
  }

  console.log('Checking for social_stories tables (Go Social — stories)...');
  if (!(await tableExists('social_stories'))) {
    console.log('Creating social_stories / social_story_views...');
    await pool.query(`
      CREATE TABLE social_stories (
          id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          image_url     TEXT NOT NULL,
          caption       TEXT,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
          expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours')
      )
    `);
    await pool.query(`CREATE INDEX idx_social_stories_active ON social_stories(user_id, expires_at)`);
    await pool.query(`
      CREATE TABLE social_story_views (
          story_id       UUID NOT NULL REFERENCES social_stories(id) ON DELETE CASCADE,
          viewer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          viewed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (story_id, viewer_user_id)
      )
    `);
    changed = true;
  }

  console.log('Checking for social_dm_messages table (Go Social — DMs)...');
  if (!(await tableExists('social_dm_messages'))) {
    console.log('Creating social_dm_messages...');
    await pool.query(`
      CREATE TABLE social_dm_messages (
          id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          thread_key    TEXT NOT NULL,
          sender_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          recipient_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          text          TEXT NOT NULL,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
          read_at       TIMESTAMPTZ
      )
    `);
    await pool.query(`CREATE INDEX idx_social_dm_messages_thread ON social_dm_messages(thread_key, created_at)`);
    await pool.query(`CREATE INDEX idx_social_dm_messages_unread ON social_dm_messages(recipient_id) WHERE read_at IS NULL`);
    changed = true;
  }

  console.log(changed ? 'Done — schema is now caught up.' : 'Already up to date, nothing to do.');
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
