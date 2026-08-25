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

  console.log(changed ? 'Done — schema is now caught up.' : 'Already up to date, nothing to do.');
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
