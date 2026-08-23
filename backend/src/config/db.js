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

export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV !== 'production') {
    console.log('query', { text, duration, rows: res.rowCount });
  }
  return res;
}
