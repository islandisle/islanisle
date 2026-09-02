// Neon Postgres connection.
// DATABASE_URL comes from your Neon project's connection string,
// set as an environment variable on Render (never committed to the repo).
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL is not set. Set it in your .env file or Render environment variables.');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Neon requires SSL
});

// Neon (serverless Postgres) drops idle connections after a short window.
// When that happens to a client sitting idle in the pool, `pg` emits an
// 'error' event on the pool — and with no listener attached, Node treats it
// as an unhandled error and exits the whole process. Swallow it here (the
// pool discards the dead client and opens a fresh one on the next query);
// a genuinely unreachable database still surfaces as a failed `query()`.
pool.on('error', (err) => {
  console.error('[db] idle pool client error (connection dropped, will reconnect):', err.message);
});

export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV !== 'production') {
    console.log('query', { text, duration, rows: res.rowCount });
  }
  return res;
}
