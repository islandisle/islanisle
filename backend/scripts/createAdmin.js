// One-time script to create the first Super Admin account.
// Admins aren't self-service signups (Section 10.1) — there's no public
// registration form on purpose, since this console controls approvals,
// suspensions, and disputes. Run this once to bootstrap the very first
// admin; any admin created after that can be added the same way, or
// (once built) through an "invite another admin" feature in the console
// itself, which doesn't exist yet.
//
// Usage:
//   cd backend
//   node scripts/createAdmin.js "Your Name" "you@example.com" "your-password"

import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { query, pool } from '../src/config/db.js';

dotenv.config();

async function main() {
  const [, , name, email, password] = process.argv;

  if (!name || !email || !password) {
    console.error('Usage: node scripts/createAdmin.js "Name" "email@example.com" "password"');
    process.exit(1);
  }

  const existing = await query('SELECT id FROM admin_users WHERE contact_email = $1', [email]);
  if (existing.rows.length) {
    console.error(`An admin with email ${email} already exists.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const result = await query(
    `INSERT INTO admin_users (name, contact_email, role, status, password_hash)
     VALUES ($1, $2, 'admin', 'active', $3)
     RETURNING id, name, contact_email`,
    [name, email, passwordHash]
  );

  console.log('Admin account created:', result.rows[0]);
  await pool.end();
}

main().catch((err) => {
  console.error('Failed to create admin:', err.message);
  process.exit(1);
});
