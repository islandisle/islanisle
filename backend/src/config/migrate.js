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

import { pool } from './db.js';

async function columnExists(table, column) {
  const result = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
    [table, column]
  );
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

  console.log(changed ? 'Done — schema is now caught up.' : 'Already up to date, nothing to do.');
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
