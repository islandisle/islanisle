// Weather feed — script Section 6.2's decorative header line-art (sunny/
// cloudy/rainy/windy/thundery) and the tappable temp/wind badge are meant
// to reflect real conditions, not be purely decorative. Public, no auth —
// same "browse as guest" posture as listings.js.

import { Router } from 'express';
import { query } from '../config/db.js';
import { fetchWeather } from '../services/weather.js';

const router = Router();

function todayStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * GET /api/weather/:atoll
 * Returns today's cached row if one exists (UNIQUE(atoll, date) means at
 * most one fetch per atoll per day); otherwise fetches, stores, and
 * returns a fresh one.
 */
router.get('/:atoll', async (req, res) => {
  const { atoll } = req.params;
  const date = todayStr();

  const existing = await query(
    `SELECT atoll, date, condition_type, temperature, wind_speed, conditions_summary
     FROM weather_conditions WHERE atoll = $1 AND date = $2`,
    [atoll, date]
  );
  if (existing.rows.length) {
    return res.json({ weather: existing.rows[0] });
  }

  const fetched = await fetchWeather(atoll, date);

  const result = await query(
    `INSERT INTO weather_conditions (atoll, date, condition_type, temperature, wind_speed, conditions_summary)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (atoll, date) DO UPDATE SET condition_type = EXCLUDED.condition_type
     RETURNING atoll, date, condition_type, temperature, wind_speed, conditions_summary`,
    [atoll, date, fetched.condition_type, fetched.temperature, fetched.wind_speed, fetched.conditions_summary]
  );

  res.json({ weather: result.rows[0] });
});

export default router;
