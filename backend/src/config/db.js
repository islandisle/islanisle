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

// Neon closes idle connections aggressively; the first query issued after
// one is dropped can come back as a connection / "authentication timed out"
// / terminated-unexpectedly error even though the database itself is
// healthy. Retry such a query once (with a fresh pool client) before
// surfacing it — a genuine outage still fails on the second attempt and
// propagates normally.
function isTransientConnectionError(err) {
  if (!err) return false;
  if (['08006', '08003', '08P01', '57P01', 'ECONNRESET', 'ETIMEDOUT'].includes(err.code)) return true;
  return /connection terminated|authentication timed out|timeout expired|server closed the connection/i.test(err.message || '');
}

export async function query(text, params, { retry = true } = {}) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'production') {
      console.log('query', { text, duration, rows: res.rowCount });
    }
    return res;
  } catch (err) {
    if (retry && isTransientConnectionError(err)) {
      console.error('[db] transient connection error, retrying once:', err.message);
      await new Promise((resolve) => setTimeout(resolve, 300));
      return query(text, params, { retry: false });
    }
    throw err;
  }
}
